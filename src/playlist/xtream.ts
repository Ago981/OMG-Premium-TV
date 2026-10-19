import { fetchText, HttpError } from '../http-client';
import type { UserConfig } from '../types';

/**
 * Client Xtream Codes (player_api.php) scritto sul client HTTP dell'addon: le richieste passano da
 * OUTBOUND_PROXY/WARP e dalla protezione SSRF (la libreria @iptv/xtream-api usa il fetch globale).
 *
 * I canali live vengono convertiti in una playlist M3U interna, così remapping, suffisso ID,
 * abbinamento EPG, proxy e cataloghi funzionano esattamente come per le playlist M3U.
 */

export interface XtreamCredentials {
    server: string;
    username: string;
    password: string;
}

export interface XtreamAccount {
    status: string;
    expDate: number | null;
    maxConnections: number | null;
    activeConnections: number | null;
    isTrial: boolean;
    formats: string[];
}

interface UserInfoRaw {
    auth?: number | string;
    status?: string;
    exp_date?: string | number | null;
    max_connections?: string | number | null;
    active_cons?: string | number | null;
    is_trial?: string | number;
    allowed_output_formats?: string[];
}

interface CategoryRaw {
    category_id: string | number;
    category_name: string;
}

interface LiveStreamRaw {
    num?: number | string;
    name?: string;
    stream_id: number | string;
    stream_icon?: string;
    epg_channel_id?: string | null;
    category_id?: string | number | null;
    category_ids?: (string | number)[];
}

export class XtreamAuthError extends Error {}

/**
 * Normalizza l'indirizzo del server: accetta anche un URL incollato per intero
 * (es. http://host:8080/get.php?username=…&password=…&type=m3u_plus) e ne ricava le credenziali.
 */
export function parseXtreamInput(server: string, username = '', password = ''): XtreamCredentials {
    let base = server.trim();
    let user = username.trim();
    let pass = password.trim();
    try {
        const u = new URL(base);
        user = user || u.searchParams.get('username') || '';
        pass = pass || u.searchParams.get('password') || '';
        base = `${u.protocol}//${u.host}${u.pathname.replace(/\/(player_api|get|xmltv)\.php$/i, '').replace(/\/+$/, '')}`;
    } catch {
        base = base.replace(/\/+$/, '');
    }
    return { server: base, username: user, password: pass };
}

export function credentialsOf(cfg: Pick<UserConfig, 'xtream_server' | 'xtream_username' | 'xtream_password'>): XtreamCredentials {
    return parseXtreamInput(cfg.xtream_server, cfg.xtream_username, cfg.xtream_password);
}

function apiUrl(c: XtreamCredentials, action?: string, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams({ username: c.username, password: c.password });
    if (action) params.set('action', action);
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    return `${c.server}/player_api.php?${params}`;
}

export function xmltvUrl(c: XtreamCredentials): string {
    return `${c.server}/xmltv.php?${new URLSearchParams({ username: c.username, password: c.password })}`;
}

export function streamUrl(c: XtreamCredentials, streamId: string | number, ext: string): string {
    return `${c.server}/live/${encodeURIComponent(c.username)}/${encodeURIComponent(c.password)}/${encodeURIComponent(String(streamId))}.${ext}`;
}

/** URL di riproduzione di un film o di un episodio (/movie/... o /series/...). */
export function vodUrl(c: XtreamCredentials, kind: 'movie' | 'series', id: string | number, ext: string): string {
    const safeExt = /^[a-z0-9]{2,5}$/i.test(ext) ? ext : 'mp4';
    return `${c.server}/${kind}/${encodeURIComponent(c.username)}/${encodeURIComponent(c.password)}/${encodeURIComponent(String(id))}.${safeExt}`;
}

/** Chiamata generica a player_api.php (usata per film e serie). */
export function xtreamCall<T>(c: XtreamCredentials, action: string, extra: Record<string, string> = {}): Promise<T> {
    return getJson<T>(apiUrl(c, action, extra));
}

async function getJson<T>(url: string): Promise<T> {
    const text = await fetchText(url, { headers: { Accept: 'application/json' } });
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new HttpError('The Xtream server did not return JSON (wrong address?)');
    }
}

function num(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) && v !== null && v !== '' ? n : null;
}

/** Verifica le credenziali e restituisce lo stato dell'abbonamento. */
export async function getAccount(c: XtreamCredentials): Promise<XtreamAccount> {
    if (!c.server || !c.username || !c.password) throw new XtreamAuthError('Missing Xtream server, username or password');
    const data = await getJson<{ user_info?: UserInfoRaw }>(apiUrl(c));
    const info = data.user_info;
    if (!info || Number(info.auth) !== 1) throw new XtreamAuthError('Xtream login failed: wrong username or password');
    const exp = num(info.exp_date);
    return {
        status: String(info.status || 'Unknown'),
        expDate: exp ? exp * 1000 : null,
        maxConnections: num(info.max_connections),
        activeConnections: num(info.active_cons),
        isTrial: String(info.is_trial) === '1',
        formats: Array.isArray(info.allowed_output_formats) ? info.allowed_output_formats : []
    };
}

/** Formato degli stream: quello scelto se il server lo consente, altrimenti il primo consentito. */
export function pickFormat(preferred: string, allowed: string[]): string {
    const usable: string[] = allowed.filter(f => f === 'm3u8' || f === 'ts');
    if (!usable.length || usable.includes(preferred)) return preferred;
    return usable[0];
}

function attr(value: unknown): string {
    // Le virgolette romperebbero gli attributi #EXTINF; gli a capo romperebbero le righe
    return String(value ?? '').replace(/["\r\n]/g, ' ').trim();
}

/**
 * Scarica categorie e canali live e li converte in M3U.
 * Intestazione con url-tvg verso xmltv.php: l'EPG del provider si attiva da solo se il campo EPG è vuoto.
 */
export async function xtreamToM3U(cfg: Pick<UserConfig, 'xtream_server' | 'xtream_username' | 'xtream_password' | 'xtream_format'>): Promise<string> {
    const c = credentialsOf(cfg);
    const account = await getAccount(c);
    if (account.status.toLowerCase() !== 'active') throw new XtreamAuthError(`Xtream account not active (${account.status})`);
    const ext = pickFormat(cfg.xtream_format || 'm3u8', account.formats);

    const [categories, streams] = await Promise.all([
        getJson<CategoryRaw[]>(apiUrl(c, 'get_live_categories')).catch(() => [] as CategoryRaw[]),
        getJson<LiveStreamRaw[]>(apiUrl(c, 'get_live_streams'))
    ]);
    if (!Array.isArray(streams)) throw new HttpError('Unexpected response from get_live_streams');
    const catName = new Map((Array.isArray(categories) ? categories : []).map(cat => [String(cat.category_id), cat.category_name]));

    const lines = [`#EXTM3U url-tvg="${xmltvUrl(c)}"`];
    for (const s of streams) {
        if (s.stream_id === undefined || s.stream_id === null || !s.name) continue;
        const catIds = s.category_ids?.length ? s.category_ids : [s.category_id];
        const groups = catIds.map(id => catName.get(String(id))).filter(Boolean).map(attr);
        const tags = [
            s.epg_channel_id ? `tvg-id="${attr(s.epg_channel_id)}"` : '',
            `tvg-name="${attr(s.name)}"`,
            s.stream_icon ? `tvg-logo="${attr(s.stream_icon)}"` : '',
            s.num !== undefined && s.num !== null && s.num !== '' ? `tvg-chno="${attr(s.num)}"` : '',
            groups.length ? `group-title="${groups.join(';')}"` : ''
        ].filter(Boolean).join(' ');
        lines.push(`#EXTINF:-1 ${tags},${attr(s.name).replace(/,/g, ' ')}`);
        lines.push(streamUrl(c, s.stream_id, ext));
    }
    return lines.join('\n') + '\n';
}

/** Impronta della sorgente Xtream per la cache (senza la password in chiaro). */
export function xtreamSourceLabel(cfg: Pick<UserConfig, 'xtream_server' | 'xtream_username' | 'xtream_password'>): string {
    const c = credentialsOf(cfg);
    try {
        return `xtream://${new URL(c.server).host} (${c.username})`;
    } catch {
        return 'xtream';
    }
}
