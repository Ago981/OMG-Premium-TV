import { db, type Param, type Statement } from '../db';
import { env } from '../env';
import * as logger from '../logger';
import { parseInterval } from '../playlist/playlist-service';
import { credentialsOf, getAccount, xtreamCall, type XtreamCredentials } from '../playlist/xtream';
import { getConfig, listActiveConfigs, vodEnabled, type ConfigRecord } from '../store/config-store';
import type { UserConfig } from '../types';
import { stripDashes } from '../playlist/m3u-parser';
import { buildCategoryTree, categoryMatch, excludeCategories, usedCategories, type CategoryRaw } from './categories';
import { tmdbMatch, TmdbAuthError, tmdbLanguage, yearOf, type VodKind } from './tmdb';

/**
 * Film e serie TV di un account Xtream.
 *
 * Sincronizzazione: le liste del provider (get_vod_streams / get_series) vengono salvate in vod_items
 * per configurazione; poi, con la chiave TMDB dell'utente, ogni titolo nuovo viene collegato al suo ID
 * IMDb. Così Stremio, aprendo un film dalla sua pagina (tt1234567), trova lo stream nell'addon.
 * I titoli già abbinati mantengono l'ID ai refresh successivi: si convertono solo quelli nuovi.
 */

export interface VodItem {
    kind: VodKind;
    itemId: string;
    name: string;
    poster: string | null;
    year: number | null;
    rating: string | null;
    category: string | null;
    ext: string | null;
    imdbId: string | null;
    tmdbPoster: string | null;
    tmdbBackdrop: string | null;
}

export interface VodState {
    status: 'idle' | 'queued' | 'syncing' | 'matching' | 'done' | 'error';
    movies: number;
    series: number;
    matched: number;
    unmatched: number;
    pending: number;
    categories: { movie: string[]; series: string[] };
    updatedAt: number | null;
    lastError: string | null;
}

interface ListRaw {
    stream_id?: number | string;
    series_id?: number | string;
    name?: string;
    title?: string;
    stream_icon?: string;
    cover?: string;
    rating?: string | number | null;
    added?: string | number;
    last_modified?: string | number;
    category_id?: string | number | null;
    container_extension?: string;
    tmdb?: string | number | null;
    tmdb_id?: string | number | null;
    imdb_id?: string | null;
    year?: string | number | null;
    releaseDate?: string;
    release_date?: string;
}

const CHUNK = 400;

// ---------------------------------------------------------------- utilità

function sourceOf(cfg: UserConfig): string {
    const c = credentialsOf(cfg);
    return `${c.server}|${c.username}`;
}

export function nameKey(name: string): string {
    return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function asList<T>(v: unknown): T[] {
    if (Array.isArray(v)) return v as T[];
    // Alcuni pannelli restituiscono un oggetto indicizzato invece di un array
    if (v && typeof v === 'object') return Object.values(v as Record<string, T>);
    return [];
}

function str(v: unknown): string | null {
    const s = v === null || v === undefined ? '' : String(v).trim();
    return s ? s : null;
}

function toRow(configId: string, kind: VodKind, raw: ListRaw, catName: Map<string, string>, stamp: number): Param[] | null {
    const id = str(kind === 'movie' ? raw.stream_id : raw.series_id);
    const rawName = str(raw.name) || str(raw.title);
    const name = rawName ? stripDashes(rawName) : null;
    if (!id || !name) return null;
    const tmdb = str(raw.tmdb_id) || str(raw.tmdb);
    const imdb = raw.imdb_id && /^tt\d+$/.test(raw.imdb_id) ? raw.imdb_id : null;
    const added = Number(kind === 'movie' ? raw.added : raw.last_modified) || 0;
    const rating = str(raw.rating);
    return [
        configId, kind, id, name.slice(0, 300), nameKey(name),
        str(kind === 'movie' ? raw.stream_icon : raw.cover),
        yearOf(raw.year, raw.releaseDate, raw.release_date, name),
        rating && rating !== '0' ? rating.slice(0, 10) : null,
        raw.category_id !== undefined && raw.category_id !== null ? catName.get(String(raw.category_id)) || null : null,
        kind === 'movie' ? str(raw.container_extension) : null,
        added ? added * 1000 : null,
        tmdb && /^\d+$/.test(tmdb) ? tmdb : null,
        imdb,
        0,
        stamp
    ];
}

const COLUMNS = ['config_id', 'kind', 'item_id', 'name', 'name_key', 'poster', 'year', 'rating', 'category', 'ext', 'added', 'tmdb_id', 'imdb_id', 'match_state', 'seen_at'];

/** Upsert che conserva l'abbinamento IMDb se titolo e tmdb_id non sono cambiati. */
function upsertStatements(rows: Param[][]): Statement[] {
    const out: Statement[] = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const placeholders = chunk.map(() => `(${COLUMNS.map(() => '?').join(', ')})`).join(', ');
        const same = 'vod_items.tmdb_id IS NOT DISTINCT FROM excluded.tmdb_id AND vod_items.name = excluded.name';
        out.push({
            sql: `INSERT INTO vod_items (${COLUMNS.join(', ')}) VALUES ${placeholders}
                  ON CONFLICT (config_id, kind, item_id) DO UPDATE SET
                    name = excluded.name, name_key = excluded.name_key, poster = excluded.poster, year = excluded.year,
                    rating = excluded.rating, category = excluded.category, ext = excluded.ext, added = excluded.added,
                    seen_at = excluded.seen_at,
                    imdb_id = COALESCE(excluded.imdb_id, CASE WHEN ${same} THEN vod_items.imdb_id ELSE NULL END),
                    match_state = CASE WHEN ${same} THEN vod_items.match_state ELSE 0 END,
                    tmdb_poster = CASE WHEN ${same} THEN vod_items.tmdb_poster ELSE NULL END,
                    tmdb_backdrop = CASE WHEN ${same} THEN vod_items.tmdb_backdrop ELSE NULL END,
                    tmdb_id = excluded.tmdb_id`,
            params: chunk.flat()
        });
    }
    return out;
}

// ---------------------------------------------------------------- stato

const live = new Map<string, { status: VodState['status']; error?: string }>();

async function writeState(configId: string, source: string, status: string, fields: { movies?: number; series?: number; categories?: string; error?: string | null } = {}): Promise<void> {
    await db().run(
        `INSERT INTO vod_state (config_id, source, status, movies, series, categories, updated_at, last_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (config_id) DO UPDATE SET source = excluded.source, status = excluded.status,
           movies = COALESCE(?, vod_state.movies), series = COALESCE(?, vod_state.series),
           categories = COALESCE(?, vod_state.categories),
           updated_at = CASE WHEN excluded.status = 'done' THEN excluded.updated_at ELSE vod_state.updated_at END,
           last_error = excluded.last_error`,
        [configId, source, status, fields.movies ?? 0, fields.series ?? 0, fields.categories ?? null,
            status === 'done' ? Date.now() : null, fields.error ?? null,
            fields.movies ?? null, fields.series ?? null, fields.categories ?? null]);
}

interface StateRow {
    source: string;
    status: string;
    movies: number;
    series: number;
    categories: string | null;
    updated_at: number | null;
    last_error: string | null;
}

async function stateRow(configId: string): Promise<StateRow | undefined> {
    return db().get<StateRow>('SELECT * FROM vod_state WHERE config_id = ?', [configId]);
}

const categoryCache = new Map<string, { at: number; value: VodState['categories'] }>();

/** Categorie per i filtri dei cataloghi (lette dal DB, tenute in memoria per un minuto). */
export async function vodCategories(configId: string): Promise<VodState['categories']> {
    const hit = categoryCache.get(configId);
    if (hit && Date.now() - hit.at < 60 * 1000) return hit.value;
    const row = await stateRow(configId);
    let value: VodState['categories'] = { movie: [], series: [] };
    try {
        if (row?.categories) value = JSON.parse(row.categories);
    } catch {
        // categorie illeggibili: nessun filtro
    }
    categoryCache.set(configId, { at: Date.now(), value });
    if (categoryCache.size > 2000) categoryCache.clear();
    return value;
}

export async function getVodState(configId: string): Promise<VodState> {
    const row = await stateRow(configId);
    const counts = await db().all<{ match_state: number; n: number }>(
        'SELECT match_state, COUNT(*) AS n FROM vod_items WHERE config_id = ? GROUP BY match_state', [configId]);
    const by = (s: number) => Number(counts.find(c => Number(c.match_state) === s)?.n || 0);
    const mem = live.get(configId);
    return {
        status: (mem?.status || (row?.status === 'error' ? 'error' : row ? 'done' : 'idle')) as VodState['status'],
        movies: Number(row?.movies || 0),
        series: Number(row?.series || 0),
        matched: by(1),
        unmatched: by(2),
        pending: by(0),
        categories: await vodCategories(configId),
        updatedAt: row?.updated_at ?? null,
        lastError: mem?.error || row?.last_error || null
    };
}

/** Rimuove film/serie di una configurazione (opzione disattivata o account cambiato). */
export async function clearVod(configId: string): Promise<void> {
    await db().batch([
        { sql: 'DELETE FROM vod_items WHERE config_id = ?', params: [configId] },
        { sql: 'DELETE FROM vod_state WHERE config_id = ?', params: [configId] }
    ]);
    categoryCache.delete(configId);
    live.delete(configId);
}

// ---------------------------------------------------------------- sincronizzazione

async function fetchLists(c: XtreamCredentials) {
    const [movieCats, seriesCats, movies, series] = await Promise.all([
        xtreamCall<unknown>(c, 'get_vod_categories').catch(() => []),
        xtreamCall<unknown>(c, 'get_series_categories').catch(() => []),
        xtreamCall<unknown>(c, 'get_vod_streams'),
        xtreamCall<unknown>(c, 'get_series')
    ]);
    return {
        movieCats: asList<CategoryRaw>(movieCats),
        seriesCats: asList<CategoryRaw>(seriesCats),
        movies: asList<ListRaw>(movies),
        series: asList<ListRaw>(series)
    };
}

/** Scarica le liste del provider e aggiorna vod_items. */
export async function syncLists(record: ConfigRecord): Promise<{ movies: number; series: number }> {
    const cfg = record.config;
    const c = credentialsOf(cfg);
    const source = sourceOf(cfg);
    const previous = await stateRow(record.id);
    // Account cambiato: i vecchi titoli (e i loro abbinamenti) non valgono più
    if (previous && previous.source !== source) await clearVod(record.id);

    const account = await getAccount(c);
    if (account.status.toLowerCase() !== 'active') throw new Error(`Xtream account not active (${account.status})`);
    const lists = await fetchLists(c);
    const stamp = Date.now();
    const movieTree = buildCategoryTree(lists.movieCats);
    const seriesTree = buildCategoryTree(lists.seriesCats);
    const movieCat = movieTree.pathById;
    const seriesCat = seriesTree.pathById;

    const rows: Param[][] = [];
    const seen = new Set<string>();
    for (const [kind, list, cats] of [['movie', lists.movies, movieCat], ['series', lists.series, seriesCat]] as const) {
        for (const raw of list) {
            const row = toRow(record.id, kind, raw, cats, stamp);
            if (!row || seen.has(`${kind}:${row[2]}`)) continue;
            seen.add(`${kind}:${row[2]}`);
            rows.push(row);
        }
    }
    const movies = rows.filter(r => r[1] === 'movie').length;
    const series = rows.length - movies;
    const used = (kind: VodKind) => new Set(rows.filter(r => r[1] === kind).map(r => r[8] as string | null).filter((x): x is string => !!x));
    const categories = JSON.stringify({ movie: usedCategories(movieTree.order, used('movie')), series: usedCategories(seriesTree.order, used('series')) });

    await db().batch([
        ...upsertStatements(rows),
        { sql: 'DELETE FROM vod_items WHERE config_id = ? AND seen_at < ?', params: [record.id, stamp] }
    ]);
    await writeState(record.id, source, 'matching', { movies, series, categories });
    categoryCache.delete(record.id);
    return { movies, series };
}

interface PendingRow {
    kind: VodKind;
    item_id: string;
    name: string;
    year: number | null;
    tmdb_id: string | null;
}

/** Collega a IMDb i titoli non ancora abbinati, con la chiave TMDB dell'utente. */
export async function matchPending(record: ConfigRecord, concurrency = 6): Promise<number> {
    const cfg = record.config;
    const language = tmdbLanguage(cfg.language);
    let done = 0;
    for (;;) {
        const rows = await db().all<PendingRow>(
            `SELECT kind, item_id, name, year, tmdb_id FROM vod_items WHERE config_id = ? AND match_state = 0
             ORDER BY added DESC NULLS LAST LIMIT 120`, [record.id]);
        if (!rows.length) return done;
        const results: { row: PendingRow; match: Awaited<ReturnType<typeof tmdbMatch>> }[] = [];
        let next = 0;
        let failed = false;
        await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
            while (next < rows.length && !failed) {
                const row = rows[next++];
                try {
                    const match = await tmdbMatch(cfg.tmdb_api_key, row.kind, { tmdbId: row.tmdb_id, name: row.name, year: row.year }, language);
                    results.push({ row, match });
                } catch (e) {
                    failed = true; // chiave non valida o TMDB irraggiungibile: si ferma tutto e si riprova più tardi
                    throw e;
                }
            }
        }));
        // L'ID IMDb fornito dal pannello resta se TMDB non ne trova uno
        await db().batch(results.map(r => ({
            sql: `UPDATE vod_items SET imdb_id = COALESCE(?, imdb_id), tmdb_poster = ?, tmdb_backdrop = ?,
                    match_state = CASE WHEN COALESCE(?, imdb_id) IS NOT NULL THEN 1 ELSE 2 END
                  WHERE config_id = ? AND kind = ? AND item_id = ?`,
            params: [r.match?.imdbId ?? null, r.match?.poster ?? null, r.match?.backdrop ?? null, r.match?.imdbId ?? null, record.id, r.row.kind, r.row.item_id]
        })));
        done += results.length;
    }
}

const lastAttempt = new Map<string, number>();

async function runSync(configId: string): Promise<void> {
    const record = await getConfig(configId);
    if (!record || !vodEnabled(record.config)) return void live.delete(configId);
    lastAttempt.set(configId, Date.now());
    const source = sourceOf(record.config);
    const started = Date.now();
    try {
        live.set(configId, { status: 'syncing' });
        const { movies, series } = await syncLists(record);
        live.set(configId, { status: 'matching' });
        const matched = await matchPending(record);
        await writeState(configId, source, 'done');
        live.delete(configId);
        logger.log(configId, `VOD synced: ${movies} movies, ${series} series, ${matched} new titles matched in ${Math.round((Date.now() - started) / 1000)} s`);
    } catch (e) {
        const msg = e instanceof TmdbAuthError ? 'tmdb_key_invalid' : logger.errMsg(e);
        live.set(configId, { status: 'error', error: msg });
        // La configurazione potrebbe essere stata cancellata nel frattempo (vincolo di chiave esterna)
        await writeState(configId, source, 'error', { error: msg }).catch(() => undefined);
        logger.error(configId, 'VOD sync failed:', msg);
    }
}

// ---------------------------------------------------------------- coda

const queue: string[] = [];
let running: string | null = null;

/** Mette in coda la sincronizzazione (una alla volta, per non sovraccaricare provider e TMDB). */
export function enqueueVod(configId: string): void {
    if (running === configId || queue.includes(configId)) return;
    queue.push(configId);
    live.set(configId, { status: 'queued' });
    void drain();
}

async function drain(): Promise<void> {
    if (running) return;
    while (queue.length) {
        running = queue.shift() as string;
        try {
            await runSync(running);
        } finally {
            running = null;
        }
    }
}

/** Configurazioni attive con film/serie da aggiornare (intervallo della configurazione, predefinito 12 ore). */
export async function refreshDueVod(): Promise<void> {
    for (const record of await listActiveConfigs(env.activeConfigDays)) {
        if (!vodEnabled(record.config)) continue;
        const row = await stateRow(record.id);
        const every = parseInterval(record.config.update_interval, 12 * 60 * 60 * 1000);
        const due = !row || row.status !== 'done' || !row.updated_at || Date.now() - row.updated_at >= every || row.source !== sourceOf(record.config);
        // Dopo un errore o un riavvio a metà lavoro si riprova al massimo una volta l'ora
        const recent = Date.now() - (lastAttempt.get(record.id) || 0) < 60 * 60 * 1000;
        if (due && !recent) enqueueVod(record.id);
    }
}

// ---------------------------------------------------------------- lettura

interface ItemRow {
    kind: VodKind;
    item_id: string;
    name: string;
    poster: string | null;
    year: number | null;
    rating: string | null;
    category: string | null;
    ext: string | null;
    imdb_id: string | null;
    tmdb_poster: string | null;
    tmdb_backdrop: string | null;
}

function fromItemRow(r: ItemRow): VodItem {
    return { kind: r.kind, itemId: r.item_id, name: r.name, poster: r.poster, year: r.year, rating: r.rating, category: r.category, ext: r.ext, imdbId: r.imdb_id, tmdbPoster: r.tmdb_poster, tmdbBackdrop: r.tmdb_backdrop };
}

const ITEM_COLUMNS = 'kind, item_id, name, poster, year, rating, category, ext, imdb_id, tmdb_poster, tmdb_backdrop';

/** Filtro comune: configurazione, tipo e categorie escluse dall'utente. */
function baseWhere(configId: string, kind: VodKind, excluded: string[]): { where: string[]; params: Param[] } {
    const where = ['config_id = ?', 'kind = ?'];
    const params: Param[] = [configId, kind];
    const ex = excludeCategories(excluded);
    if (ex) {
        where.push(ex.sql);
        params.push(...ex.params);
    }
    return { where, params };
}

/**
 * Pagina di un catalogo. Le copie dello stesso titolo (stesso ID IMDb, es. HD e 4K) sono unite già
 * nella query: ogni pagina ha titoli unici, così lo "skip" di Stremio corrisponde a quello del DB.
 */
export async function listVod(configId: string, kind: VodKind, opts: { genre?: string; search?: string; skip?: number; limit: number; excluded?: string[] }): Promise<VodItem[]> {
    const { where, params } = baseWhere(configId, kind, opts.excluded || []);
    if (opts.search) {
        for (const word of nameKey(opts.search).split(' ').filter(Boolean).slice(0, 6)) {
            where.push('name_key LIKE ?');
            params.push(`%${word}%`);
        }
    } else if (opts.genre) {
        const m = categoryMatch(opts.genre);
        where.push(m.sql);
        params.push(...m.params);
    }
    params.push(opts.limit, opts.skip || 0);
    const rows = await db().all<ItemRow>(
        `SELECT ${ITEM_COLUMNS} FROM (
            SELECT DISTINCT ON (COALESCE(imdb_id, item_id)) ${ITEM_COLUMNS}, added
            FROM vod_items WHERE ${where.join(' AND ')}
            ORDER BY COALESCE(imdb_id, item_id), added DESC NULLS LAST, item_id
         ) t ORDER BY added DESC NULLS LAST, name, item_id LIMIT ? OFFSET ?`, params);
    return rows.map(fromItemRow);
}

export async function getVodItem(configId: string, kind: VodKind, itemId: string, excluded: string[] = []): Promise<VodItem | null> {
    const { where, params } = baseWhere(configId, kind, excluded);
    const r = await db().get<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM vod_items WHERE ${where.join(' AND ')} AND item_id = ?`, [...params, itemId]);
    return r ? fromItemRow(r) : null;
}

export async function findByImdb(configId: string, kind: VodKind, imdbId: string, excluded: string[] = []): Promise<VodItem[]> {
    const { where, params } = baseWhere(configId, kind, excluded);
    const rows = await db().all<ItemRow>(
        `SELECT ${ITEM_COLUMNS} FROM vod_items WHERE ${where.join(' AND ')} AND imdb_id = ? ORDER BY name LIMIT 10`, [...params, imdbId]);
    return rows.map(fromItemRow);
}

/** Numero di titoli per categoria (per la scelta delle categorie da escludere). */
export async function categoryCounts(configId: string): Promise<{ kind: VodKind; category: string; n: number }[]> {
    const rows = await db().all<{ kind: VodKind; category: string; n: number }>(
        `SELECT kind, category, COUNT(DISTINCT COALESCE(imdb_id, item_id)) AS n FROM vod_items
         WHERE config_id = ? AND category IS NOT NULL GROUP BY kind, category`, [configId]);
    return rows.map(r => ({ ...r, n: Number(r.n) }));
}
