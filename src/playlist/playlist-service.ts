import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { env } from '../env';
import { fetchText, redact } from '../http-client';
import * as logger from '../logger';
import { GENERATED_SCHEME, generatedPlaylistPath } from '../python/paths';
import { sha256 } from '../security/crypto';
import type { Channel, PlaylistData, UserConfig } from '../types';
import { M3UParser, normalizeId, parseRemapping } from './m3u-parser';
import { hasSource } from '../store/config-store';
import { xtreamSourceLabel, xtreamToM3U } from './xtream';

/**
 * Cache playlist condivisa: configurazioni con le stesse sorgenti (M3U + remapper + suffisso)
 * usano gli stessi dati, scaricati e parsati una sola volta. I dati restano nel DB tra i riavvii
 * e in memoria solo finché vengono usati.
 */

interface Entry {
    key: string;
    data: PlaylistData;
    updatedAt: number;
    lastError: string | null;
    lastUsed: number;
    byId: Map<string, Channel>;
    byName: Map<string, Channel>;
    byLoose: Map<string, Channel>;
}

const MEMORY_TTL_MS = 30 * 60 * 1000;
const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry>>();

/** Stesse sorgenti = stessa cache (per Xtream: stesso server, account e formato). */
export function playlistKey(cfg: Pick<UserConfig, 'source_type' | 'm3u' | 'xtream_server' | 'xtream_username' | 'xtream_password' | 'xtream_format' | 'remapper_path' | 'id_suffix'>): string {
    // Per le M3U la chiave resta quella delle versioni precedenti (nessun riscaricamento dopo l'aggiornamento)
    const source = cfg.source_type === 'xtream'
        ? ['xtream', cfg.xtream_server.trim(), cfg.xtream_username.trim(), cfg.xtream_password, cfg.xtream_format]
        : cfg.m3u.trim();
    const parts = [source, cfg.remapper_path.trim(), cfg.id_suffix.trim()];
    return sha256(JSON.stringify(parts)).slice(0, 24);
}

function sourceLabel(cfg: UserConfig): string {
    return cfg.source_type === 'xtream' ? xtreamSourceLabel(cfg) : cfg.m3u.split(',').map(u => redact(u.trim())).join(', ');
}

export function parseInterval(value: string, fallbackMs: number): number {
    const m = /^(\d{1,2}):(\d{2})$/.exec(value || '');
    if (!m) return fallbackMs;
    const ms = (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 60 * 1000;
    return ms > 0 ? ms : fallbackMs;
}

/**
 * Chiave "larga" per ritrovare un canale quando la playlist cambia leggermente l'id o il nome
 * (es. "Vetrina Primafila Live" → "Vetrina Primafila Live HD", "rai1" → "rai1.it"): così i canali
 * salvati in Stremio (preferiti, "continua a guardare") continuano a funzionare.
 */
export function looseKey(value: unknown): string {
    return normalizeId(value)
        .replace(/\.[a-z]{2,3}$/, '')
        .replace(/[^a-z0-9]/g, '')
        .replace(/(fhd|uhd|hd|sd|4k|hevc|h265|backup)+$/, '');
}

function buildEntry(key: string, data: PlaylistData, updatedAt: number, lastError: string | null): Entry {
    const byId = new Map<string, Channel>();
    const byName = new Map<string, Channel>();
    const byLoose = new Map<string, Channel>();
    for (const ch of data.channels) {
        const id = normalizeId(ch.id.replace('tv|', ''));
        if (!byId.has(id)) byId.set(id, ch);
        const tvgId = normalizeId(ch.streamInfo?.tvg?.id);
        if (tvgId && !byId.has(tvgId)) byId.set(tvgId, ch);
        const name = normalizeId(ch.name);
        if (name && !byName.has(name)) byName.set(name, ch);
        for (const k of [looseKey(id), looseKey(ch.name)]) if (k && !byLoose.has(k)) byLoose.set(k, ch);
    }
    return { key, data, updatedAt, lastError, lastUsed: Date.now(), byId, byName, byLoose };
}

type Fetcher = (url: string) => Promise<string>;

/**
 * Playlist e remapping vengono sempre scaricati direttamente dal server (via OUTBOUND_PROXY/WARP se attivo),
 * evitando blocchi, incompatibilità o errori 502 dei proxy sui file M3U.
 */
function fetcherFor(_cfg: UserConfig): Fetcher {
    return url => fetchText(url);
}

/** Legge una sorgente: URL http(s) oppure la playlist generata dallo script Python. */
async function readSource(url: string, fetch: Fetcher): Promise<string> {
    if (url.startsWith(GENERATED_SCHEME)) {
        const file = generatedPlaylistPath(url.slice(GENERATED_SCHEME.length));
        if (!fs.existsSync(file)) throw new Error('Generated playlist not found: run the Python script first');
        return fs.promises.readFile(file, 'utf8');
    }
    return fetch(url);
}

async function loadRemapping(remapperPath: string, fetch: Fetcher, logKey: string): Promise<Map<string, string>> {
    const fallback = path.join(env.rootDir, 'link.epg.remapping');
    try {
        if (remapperPath && /^https?:\/\//.test(remapperPath)) return parseRemapping(await fetch(remapperPath));
    } catch (e) {
        logger.warn(logKey, 'Remapping download failed, using local file:', logger.errMsg(e));
    }
    try {
        return parseRemapping(await fs.promises.readFile(fallback, 'utf8'));
    } catch {
        return new Map();
    }
}

/** Scarica e parsa tutte le playlist. Un URL può essere un M3U oppure un file con una lista di URL. */
export async function downloadPlaylist(cfg: UserConfig, logKey: string): Promise<PlaylistData> {
    const fetch = fetcherFor(cfg);
    const remap = await loadRemapping(cfg.remapper_path, fetch, logKey);
    const parser = new M3UParser(remap, cfg.id_suffix);
    if (cfg.source_type === 'xtream') {
        parser.add(await xtreamToM3U(cfg));
        return parser.result();
    }
    const sources = cfg.m3u.split(',').map(u => u.trim()).filter(Boolean);
    let loaded = 0;
    for (const source of sources) {
        let content: string;
        try {
            content = await readSource(source, fetch);
        } catch (e) {
            logger.error(logKey, 'Playlist source error:', redact(source), logger.errMsg(e));
            continue;
        }
        if (content.trimStart().startsWith('#EXTM3U')) {
            parser.add(content);
            loaded++;
            continue;
        }
        const nested = content.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
        for (const url of nested) {
            try {
                parser.add(await fetch(url));
                loaded++;
            } catch (e) {
                logger.error(logKey, 'Playlist error:', redact(url), logger.errMsg(e));
            }
        }
    }
    if (loaded === 0) throw new Error('No playlist could be loaded');
    return parser.result();
}

async function loadFromDb(key: string): Promise<Entry | null> {
    const row = await db().get<{ data: string | null; updated_at: number | null; last_error: string | null }>(
        'SELECT data, updated_at, last_error FROM playlists WHERE key = ?', [key]);
    if (!row || !row.data) return null;
    try {
        return buildEntry(key, JSON.parse(row.data) as PlaylistData, Number(row.updated_at) || 0, row.last_error);
    } catch {
        return null;
    }
}

async function refresh(cfg: UserConfig, key: string, logKey: string): Promise<Entry> {
    const running = inflight.get(key);
    if (running) return running;
    const job = (async () => {
        const started = Date.now();
        const source = sourceLabel(cfg);
        try {
            const data = await downloadPlaylist(cfg, logKey);
            const now = Date.now();
            await db().run(`INSERT INTO playlists (key, source, data, channels, updated_at, last_error, last_used)
                            VALUES (?, ?, ?, ?, ?, NULL, ?)
                            ON CONFLICT (key) DO UPDATE SET source = excluded.source, data = excluded.data,
                                channels = excluded.channels, updated_at = excluded.updated_at, last_error = NULL,
                                last_used = excluded.last_used`,
                [key, source, JSON.stringify(data), data.channels.length, now, now]);
            const entry = buildEntry(key, data, now, null);
            memory.set(key, entry);
            logger.log(logKey, `Playlist loaded: ${data.channels.length} channels, ${data.genres.length} genres in ${Date.now() - started} ms`);
            return entry;
        } catch (e) {
            const msg = logger.errMsg(e);
            logger.error(logKey, 'Playlist refresh failed:', msg);
            await db().run(`INSERT INTO playlists (key, source, data, channels, updated_at, last_error, last_used)
                            VALUES (?, ?, NULL, 0, NULL, ?, ?)
                            ON CONFLICT (key) DO UPDATE SET last_error = excluded.last_error`,
                [key, source, msg, Date.now()]);
            const old = memory.get(key) || await loadFromDb(key);
            if (old) {
                old.lastError = msg;
                return old;
            }
            throw e;
        } finally {
            inflight.delete(key);
        }
    })();
    inflight.set(key, job);
    return job;
}

export interface PlaylistHandle {
    key: string;
    data: PlaylistData;
    updatedAt: number;
    lastError: string | null;
    getChannel(id: string): Channel | undefined;
}

function handle(entry: Entry): PlaylistHandle {
    return {
        key: entry.key,
        data: entry.data,
        updatedAt: entry.updatedAt,
        lastError: entry.lastError,
        getChannel(id: string) {
            const n = normalizeId(id);
            return entry.byId.get(n) || entry.byName.get(n) || entry.byLoose.get(looseKey(id));
        }
    };
}

const EMPTY: PlaylistHandle = {
    key: '',
    data: { channels: [], genres: [], epgUrls: [] },
    updatedAt: 0,
    lastError: null,
    getChannel: () => undefined
};

const lastUsedWrites = new Map<string, number>();

/**
 * Restituisce la playlist della configurazione. Se i dati in cache sono scaduti li restituisce
 * comunque e avvia l'aggiornamento in background; aspetta solo quando non c'è nulla in cache.
 */
export async function getPlaylist(cfg: UserConfig, logKey: string, opts: { force?: boolean } = {}): Promise<PlaylistHandle> {
    if (!hasSource(cfg)) return EMPTY;
    const key = playlistKey(cfg);
    let entry = memory.get(key) || null;
    if (!entry) {
        entry = await loadFromDb(key);
        if (entry) memory.set(key, entry);
    }
    const maxAge = parseInterval(cfg.update_interval, 12 * 60 * 60 * 1000);
    if (!entry || opts.force) {
        entry = await refresh(cfg, key, logKey);
    } else if (Date.now() - entry.updatedAt > maxAge) {
        refresh(cfg, key, logKey).catch(() => undefined);
    }
    entry.lastUsed = Date.now();
    if (Date.now() - (lastUsedWrites.get(key) || 0) > 10 * 60 * 1000) {
        lastUsedWrites.set(key, Date.now());
        db().run('UPDATE playlists SET last_used = ? WHERE key = ?', [Date.now(), key]).catch(() => undefined);
    }
    return handle(entry);
}

/** Libera la memoria delle playlist non usate di recente (restano nel DB). */
export function sweepMemory(): void {
    const now = Date.now();
    for (const [key, entry] of memory) if (now - entry.lastUsed > MEMORY_TTL_MS) memory.delete(key);
}

/** Elimina dal DB le playlist che nessuna configurazione usa più. */
export async function gcPlaylists(configs: UserConfig[]): Promise<number> {
    const used = new Set(configs.filter(hasSource).map(playlistKey));
    const rows = await db().all<{ key: string }>('SELECT key FROM playlists');
    const stale = rows.filter(r => !used.has(r.key));
    await db().batch(stale.map(r => ({ sql: 'DELETE FROM playlists WHERE key = ?', params: [r.key] })));
    stale.forEach(r => memory.delete(r.key));
    return stale.length;
}

export interface PlaylistInfo {
    key: string;
    source: string;
    channels: number;
    updatedAt: number | null;
    lastError: string | null;
    lastUsed: number | null;
    inMemory: boolean;
}

export async function listPlaylists(): Promise<PlaylistInfo[]> {
    const rows = await db().all<{ key: string; source: string; channels: number; updated_at: number | null; last_error: string | null; last_used: number | null }>(
        'SELECT key, source, channels, updated_at, last_error, last_used FROM playlists ORDER BY last_used DESC');
    return rows.map(r => ({
        key: r.key,
        source: r.source,
        channels: Number(r.channels),
        updatedAt: r.updated_at,
        lastError: r.last_error,
        lastUsed: r.last_used,
        inMemory: memory.has(r.key)
    }));
}
