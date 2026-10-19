import { appConfig, NO_SIGNAL_URL, SETTINGS_GENRE, SETTINGS_LOGO } from '../config';
import { ensureSources, enqueue, getGuides, type ChannelGuide } from '../epg/epg-service';
import * as logger from '../logger';
import { getPlaylist, type PlaylistHandle } from '../playlist/playlist-service';
import { countryLangAbbr, countryPreset } from '../presets';
import { getRuntime } from '../runtime';
import { hasSource, vodEnabled, type ConfigRecord } from '../store/config-store';
import type { Channel, StremioStream, UserConfig } from '../types';
import { I18N } from '../web/i18n';
import { buildStreams, maskUrl } from './streams';
import { MOVIE_PREFIX, SERIES_PREFIX, vodCatalog, vodManifestCatalogs, vodMeta, vodStreams } from '../vod/vod-addon';

const ITEMS_PER_PAGE = 100;
const PSEUDO_IDS = ['rigeneraplaylistpython', 'refreshm3u', 'refreshepg'];
const PSEUDO_META: Record<string, { name: string; description: string }> = {
    refreshm3u: { name: 'refresh_m3u_name', description: 'desc_refresh_m3u' },
    refreshepg: { name: 'refresh_epg_name', description: 'desc_refresh_epg' },
    rigeneraplaylistpython: { name: 'regenerate_python_name', description: 'desc_regenerate_python' }
};

export interface AddonContext {
    record: ConfigRecord;
    baseUrl: string;
}

function langCode(cfg: UserConfig): string {
    const lang = (cfg.language || appConfig.defaultLanguage || '').toLowerCase();
    if (lang.startsWith('it')) return 'it';
    if (lang.startsWith('es')) return 'es';
    if (lang.startsWith('fr')) return 'fr';
    return 'en';
}

function t(key: string, cfg: UserConfig): string {
    return I18N[langCode(cfg)]?.[key] || I18N.en[key] || key;
}

function aioSuffix(cfg: UserConfig): string {
    if (!cfg.aio_compatible) return '';
    const abbr = countryLangAbbr(cfg.country, cfg.language || appConfig.defaultLanguage);
    return ` [${abbr}]`;
}

function cleanNameForImage(name: string): string {
    let cleaned = name.replace(/\d{2}\/\d{2}\/\d{2}\s*-\s*\d{2}:\d{2}\s*\(CET\)/g, '').trim();
    cleaned = cleaned.replace(/^20\d{2}\s+/, '').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();
    const parts = cleaned.split(' - ');
    if (parts.length > 1) cleaned = parts[0].trim();
    if (cleaned.length > 30) {
        let result = '';
        for (const word of cleaned.split(' ')) {
            if ((result + ' ' + word).length > 27) break;
            result += (result ? ' ' : '') + word;
        }
        cleaned = result + '...';
    }
    return cleaned || 'No Name';
}

function fallbackLogo(name: string): string {
    return `https://dummyimage.com/500x500/590b8a/ffffff.jpg&text=${encodeURIComponent(cleanNameForImage(name)).replace(/%20/g, '+')}`;
}

function channelKey(ch: Channel): string {
    return ch.id;
}

// ---------------------------------------------------------------- EPG della configurazione

const sourceCache = new Map<string, { at: number; ids: number[] }>();

/** Sorgenti EPG: campo EPG, poi url-tvg della playlist, infine la guida predefinita del paese scelto. */
async function epgSourceIds(cfg: UserConfig, playlist: PlaylistHandle): Promise<number[]> {
    if (!cfg.epg_enabled) return [];
    let urls = cfg.epg
        ? cfg.epg.split(',').map(u => u.trim()).filter(Boolean)
        : playlist.data.epgUrls;
    if (!urls.length && cfg.country) urls = countryPreset(cfg.country)?.epg || [];
    if (!urls.length) return [];
    const key = urls.join('\n');
    const cached = sourceCache.get(key);
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.ids;
    const ids = await ensureSources(urls);
    sourceCache.set(key, { at: Date.now(), ids });
    if (sourceCache.size > 2000) sourceCache.clear();
    return ids;
}

async function guidesFor(cfg: UserConfig, playlist: PlaylistHandle, channels: Channel[], upcoming = 2): Promise<Map<string, ChannelGuide>> {
    try {
        const ids = await epgSourceIds(cfg, playlist);
        const smart = cfg.smart_epg !== false;
        return await getGuides(ids, channels.map(ch => ({ key: channelKey(ch), tvgId: ch.streamInfo?.tvg?.id, name: ch.name })), upcoming, smart);
    } catch (e) {
        logger.error('_', 'EPG lookup error:', logger.errMsg(e));
        return new Map();
    }
}

// ---------------------------------------------------------------- manifest

export async function manifestHandler(ctx: AddonContext): Promise<Record<string, unknown>> {
    const { record, baseUrl } = ctx;
    const playlist = await getPlaylist(record.config, record.id).catch(e => {
        logger.error(record.id, 'Manifest playlist error:', logger.errMsg(e));
        return null;
    });
    const genres = (playlist?.data.genres || []).map(g => (g === '~SETTINGS~' || g === 'Settings' ? SETTINGS_GENRE : g));
    if (playlist) void epgSourceIds(record.config, playlist).catch(() => undefined);
    const m = appConfig.manifest;
    const addonId = record.legacy ? m.id : `${m.id}.${record.id}`;
    const catalogId = record.legacy ? m.catalogId : `${m.catalogId}_${record.id}`;
    const catalogName = record.label && !record.legacy ? `${m.catalogName} · ${record.label}` : m.catalogName;
    const vod = vodEnabled(record.config);
    const vodCatalogs = vod
        ? await vodManifestCatalogs(record, catalogId, catalogName)
        : [];
    // Con film e serie: meta solo per i nostri ID, stream anche per gli ID IMDb (pagine di Cinemeta)
    const resources = vod
        ? ['catalog',
            { name: 'meta', types: ['tv', 'movie', 'series'], idPrefixes: ['tv', MOVIE_PREFIX, SERIES_PREFIX] },
            { name: 'stream', types: ['tv', 'movie', 'series'], idPrefixes: ['tv', MOVIE_PREFIX, SERIES_PREFIX, 'tt'] }]
        : ['stream', 'catalog', 'meta'];
    return {
        id: addonId,
        version: m.version,
        name: record.label && !record.legacy ? `${m.name} · ${record.label}` : m.name,
        description: m.description,
        logo: m.logo,
        resources,
        types: vod ? ['tv', 'movie', 'series'] : ['tv'],
        ...(vod ? {} : { idPrefixes: ['tv'] }),
        catalogs: [{
            type: 'tv',
            id: catalogId,
            name: catalogName,
            extra: [
                { name: 'genre', isRequired: false, options: [...new Set([...genres, SETTINGS_GENRE])] },
                { name: 'search', isRequired: false },
                { name: 'skip', isRequired: false }
            ]
        }, ...vodCatalogs],
        behaviorHints: {
            configurable: true,
            configurationURL: `${baseUrl}/c/${record.id}/configure`,
            reloadRequired: true
        }
    };
}

// ---------------------------------------------------------------- catalogo

export interface CatalogExtra {
    genre?: string;
    search?: string;
    skip?: number;
}

/**
 * "genre=News%20%26%20Info&skip=100" (formato Stremio nel path, NON ancora decodificato) → oggetto.
 * Si decodifica una volta sola, così un "&" dentro il nome del genere non spezza i parametri.
 */
export function parseExtra(raw: string | undefined): CatalogExtra {
    if (!raw) return {};
    const params = new URLSearchParams(raw.replace(/\+/g, '%2B'));
    const out: CatalogExtra = {};
    if (params.get('genre')) out.genre = params.get('genre') as string;
    if (params.get('search')) out.search = params.get('search') as string;
    if (params.get('skip')) out.skip = parseInt(params.get('skip') as string, 10) || 0;
    return out;
}

function baseMeta(ch: Channel, cfg: UserConfig) {
    const logo = fallbackLogo(ch.name);
    return {
        id: ch.id,
        type: 'tv',
        name: ch.streamInfo?.tvg?.chno ? `${ch.streamInfo.tvg.chno}. ${ch.name}${aioSuffix(cfg)}` : `${ch.name}${aioSuffix(cfg)}`,
        poster: ch.poster || logo,
        background: ch.background || logo,
        logo: ch.logo || logo,
        description: ch.description || `Channel: ${ch.name} - ID: ${ch.streamInfo?.tvg?.id}`,
        genre: ch.genre,
        posterShape: ch.posterShape || 'square',
        releaseInfo: 'LIVE',
        behaviorHints: { ...ch.behaviorHints, isLive: true }
    };
}

function applyGuide(meta: ReturnType<typeof baseMeta>, guide: ChannelGuide | undefined, ch: Channel, cfg: UserConfig) {
    if (!cfg.epg_enabled) {
        meta.description = `${t('live_channel', cfg)} ${meta.name}`;
        return meta;
    }
    if (guide?.icon && !ch.logo) {
        meta.poster = meta.background = meta.logo = guide.icon;
    }
    const cur = guide?.current;
    if (cur) {
        let d = `${t('now_on_air', cfg)}\n${cur.title}`;
        if (cur.description) d += `\n${cur.description}`;
        d += `\n${t('time_slot', cfg)} ${cur.start} - ${cur.stop}`;
        if (cur.category) d += `\n${t('category', cfg)} ${cur.category}`;
        if (guide.upcoming.length) {
            d += '\n\n' + t('next_program', cfg);
            for (const p of guide.upcoming) d += `\n${p.start} - ${p.title}`;
        }
        meta.description = d;
        meta.releaseInfo = `${t('currently_airing', cfg)} ${cur.title}`;
    }
    return meta;
}

function settingsMetas(cfg: UserConfig) {
    return [
        { id: 'tv|refreshm3u', name: 'Refresh M3U playlist' },
        { id: 'tv|refreshepg', name: 'Refresh EPG' }
    ].map(ch => ({
        id: ch.id,
        type: 'tv',
        name: `${ch.name}${aioSuffix(cfg)}`,
        poster: SETTINGS_LOGO,
        background: SETTINGS_LOGO,
        logo: SETTINGS_LOGO,
        description: `Channel: ${ch.name}`,
        genre: [SETTINGS_GENRE],
        posterShape: 'square',
        releaseInfo: 'LIVE',
        behaviorHints: { isLive: true }
    }));
}

function isSettingsChannel(ch: Channel): boolean {
    return ch.genre.some(g => g === '~SETTINGS~' || g === 'Settings' || g === SETTINGS_GENRE);
}

export async function catalogHandler(ctx: AddonContext, extra: CatalogExtra, type = 'tv'): Promise<{ metas: unknown[] }> {
    const cfg = ctx.record.config;
    if (type === 'movie' || type === 'series') return vodEnabled(cfg) ? vodCatalog(ctx, type, extra) : { metas: [] };
    if (!hasSource(cfg)) return { metas: [] };
    const playlist = await getPlaylist(cfg, ctx.record.id);
    const skip = extra.skip || 0;

    if (extra.genre === SETTINGS_GENRE) {
        const fromPlaylist = playlist.data.channels.filter(isSettingsChannel).map(ch => baseMeta(ch, cfg));
        return { metas: [...fromPlaylist, ...settingsMetas(cfg)].slice(skip, skip + ITEMS_PER_PAGE) };
    }

    let channels = playlist.data.channels;
    if (extra.search) {
        const q = extra.search.toLowerCase().replace(/[^\w.]/g, '');
        channels = channels.filter(ch => ch.name.toLowerCase().replace(/[^\w.]/g, '').includes(q));
    } else if (extra.genre) {
        channels = channels.filter(ch => ch.genre.includes(extra.genre as string));
    }
    const page = channels.slice(skip, skip + ITEMS_PER_PAGE);
    const guides = await guidesFor(cfg, playlist, page);
    return { metas: page.map(ch => applyGuide(baseMeta(ch, cfg), guides.get(channelKey(ch)), ch, cfg)) };
}

// ---------------------------------------------------------------- meta

function stripPrefix(id: string): string {
    return id.includes('|') ? id.split('|')[1] : id;
}

export async function metaHandler(ctx: AddonContext, id: string): Promise<{ meta: unknown }> {
    const cfg = ctx.record.config;
    if (id.startsWith(MOVIE_PREFIX) || id.startsWith(SERIES_PREFIX)) return vodEnabled(cfg) ? vodMeta(ctx, id) : { meta: null };
    const channelId = stripPrefix(id);
    if (PSEUDO_IDS.includes(channelId)) {
        const info = PSEUDO_META[channelId];
        const fullId = `tv|${channelId}`;
        return {
            meta: {
                id: fullId, type: 'tv', name: t(info.name, cfg), description: t(info.description, cfg),
                poster: SETTINGS_LOGO, background: SETTINGS_LOGO, logo: SETTINGS_LOGO,
                releaseInfo: 'LIVE', posterShape: 'square', behaviorHints: { isLive: true, defaultVideoId: fullId }
            }
        };
    }
    if (!hasSource(cfg)) return { meta: null };
    const playlist = await getPlaylist(cfg, ctx.record.id);
    const ch = playlist.getChannel(channelId);
    if (!ch) return { meta: null };

    const meta: Record<string, unknown> = {
        id: ch.id,
        type: 'tv',
        name: ch.streamInfo?.tvg?.chno ? `${ch.streamInfo.tvg.chno}. ${ch.name}` : ch.name,
        poster: ch.poster || ch.logo,
        background: ch.background || ch.logo,
        logo: ch.logo,
        releaseInfo: 'LIVE',
        genre: ch.genre,
        posterShape: 'square',
        language: 'ita',
        country: 'ITA',
        isFree: true,
        behaviorHints: { isLive: true, defaultVideoId: ch.id }
    };
    const lines: string[] = [];
    if (ch.streamInfo?.tvg?.chno) lines.push(`📺 Channel ${ch.streamInfo.tvg.chno}`);
    lines.push('', ch.description || `Channel ID: ${ch.streamInfo?.tvg?.id}`);
    meta.description = lines.join('\n');

    if (cfg.epg_enabled) {
        const guide = (await guidesFor(cfg, playlist, [ch], 2)).get(channelKey(ch));
        if (guide?.icon && !ch.logo) meta.poster = meta.background = meta.logo = guide.icon;
        const cur = guide?.current;
        if (cur) {
            const d: string[] = [t('epg_on_air', cfg), cur.title];
            if (cur.description) d.push('', cur.description);
            d.push('', `${t('epg_time_slot_icon', cfg)} ${cur.start} - ${cur.stop}`);
            if (cur.category) d.push(`🏷️ ${cur.category}`);
            if (guide.upcoming.length) {
                d.push('', t('epg_upcoming', cfg));
                for (const p of guide.upcoming) {
                    d.push('', `• ${p.start} - ${p.title}`);
                    if (p.description) d.push(`  ${p.description}`);
                    if (p.category) d.push(`  🏷️ ${p.category}`);
                }
            }
            meta.description = d.join('\n');
            meta.releaseInfo = `${cur.title} (${cur.start})`;
        }
    }
    return { meta };
}

// ---------------------------------------------------------------- stream

function pseudoStream(cfg: UserConfig, success: boolean, title: string) {
    return {
        streams: [{
            name: success ? t('completed', cfg) : t('error', cfg),
            title: `${success ? '✅' : '❌'} ${title}\n${t('go_back_reopen', cfg)}`,
            url: NO_SIGNAL_URL,
            behaviorHints: { notWebReady: false, bingeGroup: 'tv' }
        }]
    };
}

export async function streamHandler(ctx: AddonContext, id: string, type = 'tv'): Promise<{ streams: StremioStream[] | unknown[] }> {
    const { record } = ctx;
    const cfg = record.config;
    if (type === 'movie' || type === 'series' || id.startsWith(MOVIE_PREFIX) || id.startsWith(SERIES_PREFIX) || /^tt\d+/.test(id)) {
        return vodEnabled(cfg) ? vodStreams(ctx, type, id) : { streams: [] };
    }
    const channelId = stripPrefix(id);
    const rt = getRuntime(record.id);

    if (channelId === 'rigeneraplaylistpython') {
        if (await rt.runner.executeScript()) {
            await getPlaylist(cfg, record.id, { force: true });
            return pseudoStream(cfg, true, t('playlist_regenerated', cfg));
        }
        return pseudoStream(cfg, false, rt.runner.lastError || t('unknown_error', cfg));
    }
    if (channelId === 'refreshm3u') {
        if (!hasSource(cfg)) return pseudoStream(cfg, false, t('error_m3u_missing', cfg));
        try {
            const p = await getPlaylist(cfg, record.id, { force: true });
            if (p.lastError) return pseudoStream(cfg, false, p.lastError);
            return pseudoStream(cfg, true, t('m3u_refreshed', cfg));
        } catch (e) {
            return pseudoStream(cfg, false, logger.errMsg(e));
        }
    }
    if (channelId === 'refreshepg') {
        if (!cfg.epg_enabled) return pseudoStream(cfg, false, t('error_epg_not_enabled', cfg));
        const playlist = await getPlaylist(cfg, record.id);
        const ids = await epgSourceIds(cfg, playlist);
        if (!ids.length) return pseudoStream(cfg, false, t('error_epg_not_enabled', cfg));
        ids.forEach(enqueue);
        return pseudoStream(cfg, true, t('epg_refreshed', cfg));
    }

    if (!hasSource(cfg)) return { streams: [] };
    const playlist = await getPlaylist(cfg, record.id);
    const ch = playlist.getChannel(channelId);
    if (!ch) {
        logger.log(record.id, 'Channel not found:', channelId);
        return { streams: [] };
    }
    const streams = await buildStreams(ch, { config: cfg, configId: record.id, baseUrl: ctx.baseUrl, resolver: rt.resolver });
    const meta = baseMeta(ch, cfg);
    meta.name = ch.name;
    return { streams: streams.map(s => ({ ...s, meta })) };
}

export { maskUrl };
