import { configDisplayName } from '../config';
import * as logger from '../logger';
import { credentialsOf, vodUrl, xtreamCall } from '../playlist/xtream';
import { getRuntime } from '../runtime';
import type { ConfigRecord } from '../store/config-store';
import type { Channel, StremioStream } from '../types';
import { buildStreams } from '../addon/streams';
import type { VodKind } from './tmdb';
import { findByImdb, getVodItem, listVod, vodCategories, type VodItem } from './vod-service';
import { isExcluded, leafOf, parseExcluded } from './categories';
import { cleanTitle } from './tmdb';

/**
 * Cataloghi, schede e stream di film e serie Xtream.
 *
 * ID: i titoli abbinati usano l'ID IMDb (tt...), così Stremio mostra la scheda di Cinemeta e chiede
 * lo stream anche dalla pagina del film; gli altri usano xtm:<id> (film) e xts:<id>[:stagione:episodio].
 */

export const MOVIE_PREFIX = 'xtm:';
const PLACEHOLDER_MOVIE = '9e1b32';
const PLACEHOLDER_SERIES = '0f6e7a';
export const SERIES_PREFIX = 'xts:';
const PAGE = 100;
const INFO_TTL_MS = 30 * 60 * 1000;

interface Ctx {
    record: ConfigRecord;
    baseUrl: string;
}

interface Extra {
    genre?: string;
    search?: string;
    skip?: number;
}

// ---------------------------------------------------------------- info dal provider (con cache)

interface EpisodeRaw {
    id?: string | number;
    episode_num?: string | number;
    title?: string;
    season?: string | number;
    container_extension?: string;
    info?: { movie_image?: string; plot?: string; releasedate?: string; release_date?: string; duration?: string };
}

interface SeriesInfoRaw {
    info?: {
        name?: string; cover?: string; plot?: string; cast?: string; director?: string; genre?: string;
        releaseDate?: string; release_date?: string; rating?: string | number; backdrop_path?: string[] | string;
    };
    episodes?: Record<string, EpisodeRaw[]> | EpisodeRaw[][];
}

interface VodInfoRaw {
    info?: {
        name?: string; movie_image?: string; cover_big?: string; plot?: string; description?: string; cast?: string; actors?: string;
        director?: string; genre?: string; releasedate?: string; release_date?: string; duration?: string; rating?: string | number;
        backdrop_path?: string[] | string;
    };
    movie_data?: { container_extension?: string };
}

const infoCache = new Map<string, { at: number; data: Promise<unknown> }>();

function cachedInfo<T>(record: ConfigRecord, action: string, param: string, id: string): Promise<T | null> {
    const key = `${record.id}:${action}:${id}`;
    const hit = infoCache.get(key);
    if (hit && Date.now() - hit.at < INFO_TTL_MS) return hit.data as Promise<T | null>;
    const data = xtreamCall<T>(credentialsOf(record.config), action, { [param]: id }).catch(e => {
        infoCache.delete(key);
        logger.warn(record.id, `Xtream ${action} failed:`, logger.errMsg(e));
        return null;
    });
    infoCache.set(key, { at: Date.now(), data });
    if (infoCache.size > 1000) infoCache.delete(infoCache.keys().next().value as string);
    return data;
}

function seriesInfo(record: ConfigRecord, seriesId: string) {
    return cachedInfo<SeriesInfoRaw>(record, 'get_series_info', 'series_id', seriesId);
}

function movieInfo(record: ConfigRecord, vodId: string) {
    return cachedInfo<VodInfoRaw>(record, 'get_vod_info', 'vod_id', vodId);
}

function episodesOf(info: SeriesInfoRaw | null): EpisodeRaw[] {
    const groups = info?.episodes;
    if (!groups) return [];
    const lists = Array.isArray(groups) ? groups : Object.entries(groups).map(([season, eps]) =>
        (Array.isArray(eps) ? eps : Object.values((eps || {}) as Record<string, EpisodeRaw>)).map((e: EpisodeRaw) => ({ season, ...e })));
    return lists.flat().filter(e => e && e.id !== undefined && e.id !== null);
}

function firstImage(v: string[] | string | undefined): string | undefined {
    const s = Array.isArray(v) ? v[0] : v;
    return s && /^https?:\/\//.test(s) ? s : undefined;
}

function isoDate(v: string | undefined): string | undefined {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function list(v: string | undefined): string[] | undefined {
    const items = (v || '').split(/\s*[,/]\s*/).map(s => s.trim()).filter(Boolean);
    return items.length ? items.slice(0, 10) : undefined;
}

// ---------------------------------------------------------------- manifest e catalogo

function excludedOf(record: ConfigRecord): string[] {
    return parseExcluded(record.config.vod_excluded);
}

/**
 * Cataloghi Film e Serie: stesso nome del catalogo dei canali (OMG+ TV - <nome configurazione>),
 * il tipo (Film/Serie) lo indica già Stremio. Filtri = categorie e sottocategorie non escluse.
 */
export async function vodManifestCatalogs(record: ConfigRecord, catalogId: string, catalogName: string) {
    const cats = await vodCategories(record.id).catch(() => ({ movie: [] as string[], series: [] as string[] }));
    const excluded = excludedOf(record);
    const extra = (genres: string[]) => [
        { name: 'genre', isRequired: false, options: genres.filter(g => !isExcluded(g, excluded)) },
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
    ];
    return [
        { type: 'movie', id: `${catalogId}_movies`, name: catalogName, extra: extra(cats.movie) },
        { type: 'series', id: `${catalogId}_series`, name: catalogName, extra: extra(cats.series) }
    ];
}

/**
 * Copertina: TMDB (nella lingua dell'utente), poi quella del provider, poi quella pubblica di Stremio
 * per l'ID IMDb; senza nessuna, un segnaposto con il titolo (come per i canali).
 */
function posterOf(item: VodItem): string {
    if (item.tmdbPoster) return item.tmdbPoster;
    if (item.poster && /^https?:\/\//.test(item.poster)) return item.poster;
    if (item.imdbId) return `https://images.metahub.space/poster/medium/${item.imdbId}/img`;
    const title = (cleanTitle(item.name) || item.name).slice(0, 40);
    // Colori del segnaposto: viola per i canali, rosso cinema per i film, blu petrolio per le serie
    const color = item.kind === 'movie' ? PLACEHOLDER_MOVIE : PLACEHOLDER_SERIES;
    return `https://dummyimage.com/342x513/${color}/ffffff.jpg&text=${encodeURIComponent(title).replace(/%20/g, '+')}`;
}

function previewMeta(item: VodItem) {
    const prefix = item.kind === 'movie' ? MOVIE_PREFIX : SERIES_PREFIX;
    return {
        id: item.imdbId || `${prefix}${item.itemId}`,
        type: item.kind,
        name: cleanTitle(item.name) || item.name,
        poster: posterOf(item),
        background: item.tmdbBackdrop || undefined,
        posterShape: 'poster',
        releaseInfo: item.year ? String(item.year) : undefined,
        imdbRating: item.rating || undefined,
        genres: item.category ? [leafOf(item.category)] : undefined
    };
}

export async function vodCatalog(ctx: Ctx, kind: VodKind, extra: Extra): Promise<{ metas: unknown[] }> {
    // Le versioni dello stesso titolo (HD, 4K...) sono già unite dalla query: pagine sempre piene
    const items = await listVod(ctx.record.id, kind, { genre: extra.genre, search: extra.search, skip: extra.skip, limit: PAGE, excluded: excludedOf(ctx.record) });
    return { metas: items.map(previewMeta) };
}

// ---------------------------------------------------------------- schede

export async function vodMeta(ctx: Ctx, id: string): Promise<{ meta: unknown }> {
    const { record } = ctx;
    if (id.startsWith(MOVIE_PREFIX)) {
        const itemId = id.slice(MOVIE_PREFIX.length);
        const item = await getVodItem(record.id, 'movie', itemId, excludedOf(record));
        if (!item) return { meta: null };
        const info = (await movieInfo(record, itemId))?.info || {};
        return {
            meta: {
                ...previewMeta(item),
                id,
                poster: item.tmdbPoster || item.poster || info.movie_image || info.cover_big || posterOf(item),
                background: item.tmdbBackdrop || firstImage(info.backdrop_path) || info.cover_big || undefined,
                description: info.plot || info.description,
                cast: list(info.cast || info.actors),
                director: list(info.director),
                genres: list(info.genre) || (item.category ? [leafOf(item.category)] : undefined),
                runtime: info.duration,
                released: isoDate(info.releasedate || info.release_date),
                behaviorHints: { defaultVideoId: id }
            }
        };
    }
    if (id.startsWith(SERIES_PREFIX)) {
        const seriesId = id.slice(SERIES_PREFIX.length).split(':')[0];
        const item = await getVodItem(record.id, 'series', seriesId, excludedOf(record));
        if (!item) return { meta: null };
        const raw = await seriesInfo(record, seriesId);
        const info = raw?.info || {};
        const videos = episodesOf(raw).map(e => {
            const season = Number(e.season) || 1;
            const episode = Number(e.episode_num) || 1;
            return {
                id: `${SERIES_PREFIX}${seriesId}:${season}:${episode}`,
                title: e.title || `S${season}E${episode}`,
                season,
                episode,
                released: isoDate(e.info?.releasedate || e.info?.release_date) || new Date(0).toISOString(),
                thumbnail: e.info?.movie_image,
                overview: e.info?.plot
            };
        }).sort((a, b) => a.season - b.season || a.episode - b.episode);
        return {
            meta: {
                ...previewMeta(item),
                id: `${SERIES_PREFIX}${seriesId}`,
                poster: item.tmdbPoster || item.poster || info.cover || posterOf(item),
                background: item.tmdbBackdrop || firstImage(info.backdrop_path) || undefined,
                description: info.plot,
                cast: list(info.cast),
                director: list(info.director),
                genres: list(info.genre) || (item.category ? [leafOf(item.category)] : undefined),
                videos
            }
        };
    }
    return { meta: null };
}

// ---------------------------------------------------------------- stream

interface Source {
    item: VodItem;
    url: string;
    label: string;
}

async function episodeSource(ctx: Ctx, item: VodItem, season: number, episode: number): Promise<Source | null> {
    const raw = await seriesInfo(ctx.record, item.itemId);
    const ep = episodesOf(raw).find(e => (Number(e.season) || 1) === season && (Number(e.episode_num) || 1) === episode);
    if (!ep) return null;
    const c = credentialsOf(ctx.record.config);
    const tag = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
    return { item, url: vodUrl(c, 'series', ep.id as string | number, ep.container_extension || 'mp4'), label: `${item.name} ${tag}` };
}

function movieSource(ctx: Ctx, item: VodItem): Source {
    const c = credentialsOf(ctx.record.config);
    return { item, url: vodUrl(c, 'movie', item.itemId, item.ext || 'mp4'), label: item.name + (item.year && !item.name.includes(String(item.year)) ? ` (${item.year})` : '') };
}

/** Stream di un film/episodio: per ID xtm/xts oppure per ID IMDb (dalla pagina Cinemeta). */
export async function vodStreams(ctx: Ctx, type: string, id: string): Promise<{ streams: StremioStream[] }> {
    const { record } = ctx;
    const sources: Source[] = [];
    const [base, s, e] = id.startsWith(SERIES_PREFIX) ? [id, ...id.slice(SERIES_PREFIX.length).split(':').slice(1)] : id.split(':');
    const season = Number(s);
    const episode = Number(e);

    if (id.startsWith(MOVIE_PREFIX)) {
        const item = await getVodItem(record.id, 'movie', id.slice(MOVIE_PREFIX.length), excludedOf(record));
        if (item) sources.push(movieSource(ctx, item));
    } else if (id.startsWith(SERIES_PREFIX)) {
        const item = await getVodItem(record.id, 'series', base.slice(SERIES_PREFIX.length).split(':')[0], excludedOf(record));
        if (item && season && episode) {
            const src = await episodeSource(ctx, item, season, episode);
            if (src) sources.push(src);
        }
    } else if (/^tt\d+$/.test(base)) {
        if (type === 'series' || (season && episode)) {
            if (!season || !episode) return { streams: [] };
            const items = await findByImdb(record.id, 'series', base, excludedOf(record));
            const found = await Promise.all(items.map(item => episodeSource(ctx, item, season, episode)));
            sources.push(...found.filter((x): x is Source => !!x));
        } else {
            sources.push(...(await findByImdb(record.id, 'movie', base, excludedOf(record))).map(item => movieSource(ctx, item)));
        }
    }
    if (!sources.length) return { streams: [] };

    // Stessa pipeline dei canali live (proxy, «Solo proxy», mascheramento); il resolver Python resta ai live
    const config = { ...record.config, resolver_enabled: false };
    const label = configDisplayName(record.label, record.legacy);
    const streams: StremioStream[] = [];
    for (const src of sources) {
        const channel = {
            name: label,
            streamInfo: { urls: [{ url: src.url, name: src.label + (src.item.category ? `\n${src.item.category}` : ''), headers: {} }] }
        } as unknown as Channel;
        const built = await buildStreams(channel, { config, configId: record.id, baseUrl: ctx.baseUrl, resolver: getRuntime(record.id).resolver });
        const bingeGroup = `omg-${record.id}-${src.item.kind}-${src.item.itemId}`;
        streams.push(...built.map(st => ({ ...st, behaviorHints: { ...(st.behaviorHints || {}), bingeGroup } })));
    }
    return { streams };
}
