import { db, type Param } from '../db';
import { env } from '../env';
import { fetchStream, redact } from '../http-client';
import * as logger from '../logger';
import { normalizeId } from '../playlist/m3u-parser';
import type { Program } from '../types';
import { parseXmltv } from './xmltv-parser';

/**
 * EPG centralizzato: ogni URL EPG è una "sorgente" scaricata una sola volta e condivisa da tutte
 * le configurazioni che la usano. I programmi sono indicizzati per id canale normalizzato, quindi
 * canali con lo stesso tvg-id in configurazioni diverse leggono gli stessi dati.
 *
 * Aggiornamento: import in staging (source_id negativo) e scambio atomico a fine download,
 * così durante l'aggiornamento gli utenti continuano a vedere la guida precedente.
 */

const BATCH = 5000;
const LOOKAHEAD_MS = 8 * 60 * 60 * 1000;

export interface EpgSource {
    id: number;
    url: string;
    status: string;
    last_error: string | null;
    updated_at: number | null;
    last_used: number | null;
    channels: number;
    programs: number;
    duration_ms: number | null;
}

// ---------------------------------------------------------------- formattazione orari

const formatter: Intl.DateTimeFormat = (() => {
    const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
    if (env.timezone) {
        try {
            return new Intl.DateTimeFormat('it-IT', { ...opts, timeZone: env.timezone });
        } catch {
            console.warn(`Invalid TIMEZONE "${env.timezone}", using Europe/Rome`);
        }
    }
    if (env.timezoneOffset) return new Intl.DateTimeFormat('it-IT', { ...opts, timeZone: 'UTC' });
    return new Intl.DateTimeFormat('it-IT', { ...opts, timeZone: 'Europe/Rome' });
})();

const offsetMs = (() => {
    if (env.timezone || !env.timezoneOffset) return 0;
    const m = /^([+-])(\d{1,2}):(\d{2})$/.exec(env.timezoneOffset);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10)) * 60000;
})();

export function formatTime(ms: number): string {
    return formatter.format(new Date(ms + offsetMs)).replace(/\./g, ':');
}

// ---------------------------------------------------------------- sorgenti

/** Registra (se nuove) le sorgenti e restituisce i loro id; le sorgenti nuove vengono scaricate subito. */
export async function ensureSources(urls: string[]): Promise<number[]> {
    const ids: number[] = [];
    const now = Date.now();
    for (const url of [...new Set(urls.map(u => u.trim()).filter(Boolean))]) {
        let row = await db().get<{ id: number; updated_at: number | null; status: string }>(
            'SELECT id, updated_at, status FROM epg_sources WHERE url = ?', [url]);
        if (!row) {
            row = await db().get<{ id: number; updated_at: number | null; status: string }>(
                `INSERT INTO epg_sources (url, status, last_used) VALUES (?, 'pending', ?)
                 ON CONFLICT (url) DO UPDATE SET last_used = excluded.last_used
                 RETURNING id, updated_at, status`, [url, now]);
        }
        if (!row) continue;
        ids.push(Number(row.id));
        if (!row.updated_at && row.status !== 'updating') enqueue(Number(row.id));
    }
    return ids;
}

const lastUsedWrites = new Map<number, number>();

export function markUsed(ids: number[]): void {
    const now = Date.now();
    for (const id of ids) {
        if (now - (lastUsedWrites.get(id) || 0) < 10 * 60 * 1000) continue;
        lastUsedWrites.set(id, now);
        db().run('UPDATE epg_sources SET last_used = ? WHERE id = ?', [now, id]).catch(() => undefined);
    }
}

export async function listSources(): Promise<EpgSource[]> {
    return db().all<EpgSource>('SELECT * FROM epg_sources ORDER BY last_used DESC');
}

export async function deleteSources(ids: number[]): Promise<void> {
    await db().batch(ids.flatMap(id => [
        { sql: 'DELETE FROM epg_programs WHERE source_id = ? OR source_id = ?', params: [id, -id] },
        { sql: 'DELETE FROM epg_channels WHERE source_id = ? OR source_id = ?', params: [id, -id] },
        { sql: 'DELETE FROM epg_sources WHERE id = ?', params: [id] }
    ]));
}

// ---------------------------------------------------------------- coda aggiornamenti

const queue: number[] = [];
let working = false;

export function enqueue(id: number): void {
    if (!queue.includes(id)) queue.push(id);
    void drain();
}

export function isQueued(id: number): boolean {
    return queue.includes(id);
}

/** Una sorgente alla volta: limita memoria e banda anche con molti utenti. */
async function drain(): Promise<void> {
    if (working) return;
    working = true;
    try {
        while (queue.length) {
            const id = queue.shift() as number;
            await updateSource(id).catch(e => logger.error('epg', 'EPG update crashed:', logger.errMsg(e)));
        }
    } finally {
        working = false;
    }
}

async function importUrl(url: string, stagingId: number, depth = 0): Promise<{ channels: number; programs: number }> {
    const now = Date.now();
    const minStop = now - env.epgPastHours * 60 * 60 * 1000;
    const maxStart = now + env.epgFutureDays * 24 * 60 * 60 * 1000;
    const channelRows: Param[][] = [];
    const programRows: Param[][] = [];
    let programs = 0;

    const source = await fetchStream(url, { timeoutMs: 10 * 60 * 1000 });
    const outcome = await parseXmltv(source, {
        channel(ch) {
            const id = normalizeId(ch.id);
            if (id) channelRows.push([stagingId, id, normalizeId(ch.displayName) || null, ch.icon || null]);
        },
        programme(p) {
            if (p.stop < minStop || p.start > maxStart) return;
            const id = normalizeId(p.channel);
            if (!id) return;
            programRows.push([stagingId, id, p.start, p.stop, p.title, p.description || null, p.category || null]);
            programs++;
        },
        shouldFlush: () => programRows.length >= BATCH || channelRows.length >= BATCH,
        async flush() {
            const ch = channelRows.splice(0);
            const pr = programRows.splice(0);
            await db().insertMany('epg_channels', ['source_id', 'channel_id', 'name_key', 'icon'], ch);
            await db().insertMany('epg_programs',
                ['source_id', 'channel_id', 'start_time', 'stop_time', 'title', 'description', 'category'], pr);
        }
    });

    if (outcome.kind === 'list') {
        if (depth > 0) throw new Error('Nested EPG URL list');
        let total = { channels: 0, programs: 0 };
        for (const nested of outcome.urls) {
            try {
                const r = await importUrl(nested, stagingId, depth + 1);
                total = { channels: total.channels + r.channels, programs: total.programs + r.programs };
            } catch (e) {
                logger.error('epg', 'EPG error:', redact(nested), logger.errMsg(e));
            }
        }
        return total;
    }
    return { channels: outcome.channels, programs };
}

export async function updateSource(id: number): Promise<void> {
    const src = await db().get<EpgSource>('SELECT * FROM epg_sources WHERE id = ?', [id]);
    if (!src) return;
    const started = Date.now();
    const staging = -id;
    logger.log('epg', 'EPG update started:', redact(src.url));
    await db().run("UPDATE epg_sources SET status = 'updating' WHERE id = ?", [id]);
    await db().batch([
        { sql: 'DELETE FROM epg_programs WHERE source_id = ?', params: [staging] },
        { sql: 'DELETE FROM epg_channels WHERE source_id = ?', params: [staging] }
    ]);
    try {
        const result = await importUrl(src.url, staging);
        if (result.programs === 0 && result.channels === 0) throw new Error('EPG file contains no channels or programmes');
        const channels = await db().get<{ n: number }>(
            'SELECT COUNT(DISTINCT channel_id) AS n FROM epg_programs WHERE source_id = ?', [staging]);
        const duration = Date.now() - started;
        await db().batch([
            { sql: 'DELETE FROM epg_programs WHERE source_id = ?', params: [id] },
            { sql: 'DELETE FROM epg_channels WHERE source_id = ?', params: [id] },
            { sql: 'UPDATE epg_programs SET source_id = ? WHERE source_id = ?', params: [id, staging] },
            { sql: 'UPDATE epg_channels SET source_id = ? WHERE source_id = ?', params: [id, staging] },
            {
                sql: `UPDATE epg_sources SET status = 'ok', last_error = NULL, updated_at = ?, channels = ?, programs = ?, duration_ms = ?
                      WHERE id = ?`,
                params: [Date.now(), Number(channels?.n || 0), result.programs, duration, id]
            }
        ]);
        logger.log('epg', `EPG updated: ${redact(src.url)} — ${result.programs} programmes, ${channels?.n || 0} channels in ${(duration / 1000).toFixed(1)} s`);
    } catch (e) {
        const msg = logger.errMsg(e);
        logger.error('epg', 'EPG update failed:', redact(src.url), msg);
        await db().batch([
            { sql: 'DELETE FROM epg_programs WHERE source_id = ?', params: [staging] },
            { sql: 'DELETE FROM epg_channels WHERE source_id = ?', params: [staging] },
            // updated_at viene impostato anche in caso di errore per non riprovare in continuazione
            { sql: "UPDATE epg_sources SET status = 'error', last_error = ?, updated_at = ? WHERE id = ?", params: [msg.slice(0, 500), Date.now(), id] }
        ]);
    }
}

/** Accoda le sorgenti scadute e usate di recente. Chiamato periodicamente dallo scheduler. */
export async function refreshStaleSources(): Promise<void> {
    const now = Date.now();
    const stale = await db().all<{ id: number }>(
        `SELECT id FROM epg_sources
         WHERE status <> 'updating' AND COALESCE(last_used, 0) >= ? AND COALESCE(updated_at, 0) < ?`,
        [now - env.activeConfigDays * 86400000, now - env.epgRefreshHours * 3600000]);
    stale.forEach(r => enqueue(Number(r.id)));
}

/** Elimina programmi terminati e sorgenti non più usate. */
export async function cleanup(): Promise<void> {
    const cutoff = Date.now() - env.epgPastHours * 60 * 60 * 1000;
    const removed = await db().run('DELETE FROM epg_programs WHERE stop_time < ? AND source_id > 0', [cutoff]);
    if (removed > 0) logger.log('epg', 'EPG cleanup: removed', removed, 'ended programme(s)');
    const unused = await db().all<{ id: number }>('SELECT id FROM epg_sources WHERE COALESCE(last_used, 0) < ?',
        [Date.now() - env.activeConfigDays * 86400000]);
    if (unused.length) {
        await deleteSources(unused.map(r => Number(r.id)));
        logger.log('epg', 'EPG cleanup: removed', unused.length, 'unused source(s)');
    }
}

/** Al riavvio, le sorgenti rimaste "updating" (processo interrotto) tornano aggiornabili. */
export async function resetInterrupted(): Promise<void> {
    await db().run("UPDATE epg_sources SET status = 'pending', updated_at = NULL WHERE status = 'updating'");
}

// ---------------------------------------------------------------- consultazione

export interface ChannelQuery {
    key: string;
    tvgId?: string;
    name?: string;
}

export interface ChannelGuide {
    current: Program | null;
    upcoming: Program[];
    icon: string | null;
}

/** Pulisce stringhe eliminando tag di risoluzione, estensioni e formati (es. HD, SD, 4K, HLS, IT). */
export function cleanKey(s: string | undefined): string {
    if (!s) return '';
    return s
        .toLowerCase()
        .replace(/[([].*?[)\]]/g, '')
        .replace(/\b(hd|sd|fhd|4k|uhd|hevc|it|ita|italy|hls|dash|tv|live|channel)\b/gi, '')
        .replace(/[^a-z0-9]/gi, '')
        .trim();
}

/** Id da provare: "canale5.it" e poi "canale5" (match con EPG che non usano il suffisso). */
export function lookupIds(tvgId: string | undefined): string[] {
    const n = normalizeId(tvgId);
    if (!n) return [];
    const ids = [n];
    const dot = n.lastIndexOf('.');
    if (dot > 0) ids.push(n.slice(0, dot));
    return ids;
}

function inList(values: Param[]): string {
    return values.map(() => '?').join(', ');
}

function toProgram(r: { title: string; description: string | null; category: string | null; start_time: number; stop_time: number }): Program {
    return {
        title: r.title,
        description: r.description || '',
        category: r.category || '',
        start: formatTime(Number(r.start_time)),
        stop: formatTime(Number(r.stop_time))
    };
}

/**
 * Guida di più canali con poche query ottimizzate.
 * Con smart_epg=true (default) abbina in modo permissivo rimuovendo suffissi di risoluzione (HD/SD/4K/numeri).
 */
export async function getGuides(
    sourceIds: number[],
    channels: ChannelQuery[],
    upcomingCount = 2,
    smartEpg = true
): Promise<Map<string, ChannelGuide>> {
    const out = new Map<string, ChannelGuide>();
    if (!sourceIds.length || !channels.length) return out;
    markUsed(sourceIds);

    const candidates = new Map<string, string[]>();
    const allIds = new Set<string>();
    const names = new Set<string>();
    for (const ch of channels) {
        const ids = lookupIds(ch.tvgId);
        candidates.set(ch.key, ids);
        ids.forEach(i => allIds.add(i));
        const nk = normalizeId(ch.name);
        if (nk) names.add(nk);
    }

    // Carica i canali EPG dalle sorgenti attive per il fallback e lo smart matching
    const epgChannels = await db().all<{ channel_id: string; name_key: string | null; icon: string | null }>(
        `SELECT channel_id, name_key, icon FROM epg_channels WHERE source_id IN (${inList(sourceIds)})`,
        sourceIds
    );

    const byName = new Map<string, { channel_id: string; icon: string | null }>();
    const preparedEpgChannels: Array<{ channel_id: string; clean_id: string; clean_name: string }> = [];

    for (const r of epgChannels) {
        if (r.name_key && !byName.has(r.name_key)) byName.set(r.name_key, { channel_id: r.channel_id, icon: r.icon });
        if (smartEpg) {
            preparedEpgChannels.push({
                channel_id: r.channel_id,
                clean_id: cleanKey(r.channel_id),
                clean_name: cleanKey(r.name_key || undefined)
            });
        }
    }

    // Risoluzione canali
    for (const ch of channels) {
        const ids = candidates.get(ch.key) || [];
        const named = byName.get(normalizeId(ch.name));
        if (named && !ids.includes(named.channel_id)) ids.push(named.channel_id);

        if (smartEpg && ids.length === 0) {
            const cleanTvg = cleanKey(ch.tvgId);
            const cleanN = cleanKey(ch.name);
            const searchTokens = [cleanTvg, cleanN].filter(t => t.length >= 2);

            let smartHit = preparedEpgChannels.find(e =>
                searchTokens.some(tok => e.clean_id === tok || e.clean_name === tok)
            );
            if (!smartHit) {
                smartHit = preparedEpgChannels.find(e =>
                    searchTokens.some(tok => tok.length >= 3 && (e.clean_id.startsWith(tok) || e.clean_name.startsWith(tok)))
                );
            }
            if (smartHit && !ids.includes(smartHit.channel_id)) {
                ids.push(smartHit.channel_id);
            }
        }
        ids.forEach(i => allIds.add(i));
    }

    if (!allIds.size) return out;

    const idList = [...allIds];
    const now = Date.now();
    const programs = await db().all<{ channel_id: string; title: string; description: string | null; category: string | null; start_time: number; stop_time: number }>(
        `SELECT channel_id, title, description, category, start_time, stop_time FROM epg_programs
         WHERE source_id IN (${inList(sourceIds)}) AND channel_id IN (${inList(idList)})
           AND stop_time > ? AND start_time < ?
         ORDER BY channel_id, start_time`,
        [...sourceIds, ...idList, now, now + LOOKAHEAD_MS]);
    const icons = await db().all<{ channel_id: string; icon: string | null }>(
        `SELECT channel_id, icon FROM epg_channels
         WHERE source_id IN (${inList(sourceIds)}) AND channel_id IN (${inList(idList)}) AND icon IS NOT NULL`,
        [...sourceIds, ...idList]);

    const progByChannel = new Map<string, typeof programs>();
    for (const p of programs) {
        const list = progByChannel.get(p.channel_id) || [];
        list.push(p);
        progByChannel.set(p.channel_id, list);
    }
    const iconByChannel = new Map<string, string>();
    for (const i of icons) if (i.icon && !iconByChannel.has(i.channel_id)) iconByChannel.set(i.channel_id, i.icon);

    for (const ch of channels) {
        const ids = [...(candidates.get(ch.key) || [])];
        const hit = ids.find(i => progByChannel.has(i));
        const list = hit ? progByChannel.get(hit) as typeof programs : [];
        const currentRow = list.find(p => p.start_time <= now && p.stop_time > now) || null;
        const upcoming = list.filter(p => p.start_time >= now).slice(0, upcomingCount).map(toProgram);
        const icon = ids.map(i => iconByChannel.get(i)).find(Boolean) || null;
        if (currentRow || upcoming.length || icon) {
            out.set(ch.key, { current: currentRow ? toProgram(currentRow) : null, upcoming, icon });
        }
    }
    return out;
}

export async function epgTotals(): Promise<{ sources: number; programs: number }> {
    const row = await db().get<{ sources: number; programs: number }>(
        'SELECT COUNT(*) AS sources, COALESCE(SUM(programs), 0) AS programs FROM epg_sources');
    return { sources: Number(row?.sources || 0), programs: Number(row?.programs || 0) };
}
