import { env } from '../env';
import { appConfig } from '../config';
import { request } from '../http-client';
import * as logger from '../logger';
import type { ProxyType, StreamHeaders, UserConfig } from '../types';

/**
 * Proxy supportati:
 *  - MediaFlow Proxy  (https://github.com/mhdzumair/mediaflow-proxy)
 *  - EasyProxy        (https://github.com/realbestia1/EasyProxy)
 *
 * Usano gli stessi parametri (api_password, d/url, h_<header>), ma EasyProxy ha un endpoint
 * universale /proxy/manifest.m3u8 che riconosce da solo HLS, DASH ed estrattori.
 * Con proxy_type "auto" il tipo si ricava da /api/info (EasyProxy risponde {"proxy": "EasyProxy"}).
 */

export type ProxyKind = 'mediaflow' | 'easyproxy';

export interface ProxyInfo {
    kind: ProxyKind;
    version?: string;
    reachable: boolean;
}

const detectCache = new Map<string, { at: number; info: ProxyInfo }>();
const DETECT_TTL_MS = 60 * 60 * 1000;

function baseOf(cfg: Pick<UserConfig, 'proxy'>): string {
    return cfg.proxy.replace(/\/+$/, '');
}

/** Interroga il proxy per capire di che tipo è (con cache di un'ora). */
export async function detectProxy(proxyUrl: string, password: string, fresh = false): Promise<ProxyInfo> {
    const base = proxyUrl.replace(/\/+$/, '');
    const cached = detectCache.get(base);
    if (!fresh && cached && Date.now() - cached.at < DETECT_TTL_MS) return cached.info;

    let info: ProxyInfo = { kind: 'mediaflow', reachable: false };
    try {
        const res = await request(`${base}/api/info?api_password=${encodeURIComponent(password)}`, { timeoutMs: 8000 });
        if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
            const data = await res.json() as { proxy?: string; version?: string };
            if (String(data.proxy || '').toLowerCase().includes('easyproxy')) {
                info = { kind: 'easyproxy', version: data.version, reachable: true };
            }
        } else {
            await res.body?.cancel();
        }
        if (info.kind === 'mediaflow') {
            // MediaFlow espone /health (in alcune versioni /proxy/ip): basta che risponda
            const health = await request(`${base}/health`, { timeoutMs: 8000 });
            await health.body?.cancel();
            info.reachable = health.status < 500;
        }
    } catch (e) {
        logger.warn('_', 'Proxy detection failed:', logger.errMsg(e));
    }
    detectCache.set(base, { at: Date.now(), info });
    return info;
}

export interface ProxyCheck extends ProxyInfo {
    /** false se il proxy rifiuta la password (401/403). */
    authOk: boolean;
    /** IP pubblico con cui il proxy esce verso le sorgenti, se lo comunica. */
    ip: string | null;
}

/** Verifica completa per il pulsante "Verifica proxy": tipo, raggiungibilità, password e IP di uscita. */
export async function checkProxy(proxyUrl: string, password: string): Promise<ProxyCheck> {
    const info = await detectProxy(proxyUrl, password, true);
    const result: ProxyCheck = { ...info, authOk: false, ip: null };
    if (!info.reachable) return result;
    try {
        const res = await request(`${proxyUrl.replace(/\/+$/, '')}/proxy/ip?api_password=${encodeURIComponent(password)}`, { timeoutMs: 15000 });
        result.authOk = res.status !== 401 && res.status !== 403;
        if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
            const data = await res.json() as { ip?: string };
            result.ip = typeof data.ip === 'string' ? data.ip : null;
        } else {
            await res.body?.cancel();
        }
    } catch (e) {
        logger.warn('_', 'Proxy check failed:', logger.errMsg(e));
    }
    return result;
}

/** Proxy configurato e completo (URL + password): da qui in poi tutto passa dal proxy. */
export function hasProxy(cfg: Pick<UserConfig, 'proxy' | 'proxy_pwd' | 'proxy_type'>): boolean {
    return cfg.proxy_type !== 'off' && !!(cfg.proxy && cfg.proxy_pwd);
}

/**
 * URL per scaricare un file qualsiasi (playlist, remapping) attraverso il proxy dell'utente:
 * la sorgente vede l'IP del proxy, non quello del server.
 */
export function proxyFetchUrl(cfg: Pick<UserConfig, 'proxy' | 'proxy_pwd'>, url: string): string {
    const params = new URLSearchParams({ d: url, api_password: cfg.proxy_pwd });
    return `${cfg.proxy.replace(/\/+$/, '')}/proxy/stream?${params}`;
}

/**
 * EasyProxy riscrive ogni contenuto che inizia con #EXTM3U, sostituendo gli URL dei canali con
 * URL del proxy (…/proxy/hls/manifest.m3u8?d=<originale>&api_password=…). Qui si ripristina
 * l'originale dal parametro d/url, così la playlist resta identica alla sorgente.
 * Su MediaFlow (che non riscrive) non cambia nulla.
 */
export function unwrapProxiedPlaylist(content: string, proxyUrl: string): string {
    const base = proxyUrl.replace(/\/+$/, '');
    let origin: string;
    try {
        origin = new URL(base).origin;
    } catch {
        return content;
    }
    return content.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.startsWith(origin)) return line;
        try {
            const u = new URL(trimmed);
            return u.searchParams.get('d') || u.searchParams.get('url') || line;
        } catch {
            return line;
        }
    }).join('\n');
}

export async function resolveProxyKind(cfg: Pick<UserConfig, 'proxy' | 'proxy_pwd' | 'proxy_type'>): Promise<ProxyKind> {
    if (cfg.proxy_type === 'mediaflow' || cfg.proxy_type === 'easyproxy') return cfg.proxy_type;
    return (await detectProxy(cfg.proxy, cfg.proxy_pwd)).kind;
}

function pick(headers: StreamHeaders, ...names: string[]): string | undefined {
    for (const n of names) if (headers[n]) return headers[n];
    return undefined;
}

/** Link nel formato Xtream: /live|movie|series/<utente>/<password>/<id>.<estensione> */
export const XTREAM_LINK_RE = /\/(live|movie|series)\/[^/]+\/[^/]+\/[^/?]+\.[a-z0-9]{2,5}(\?|$)/i;

/**
 * User-Agent che il proxy usa verso la sorgente. Molti pannelli Xtream rifiutano (401) gli User-Agent
 * da browser e accettano solo quelli dei player IPTV: per i link Xtream, se la playlist non ne indica
 * uno, si usa quello di un player invece del Chrome predefinito.
 */
function proxyUserAgent(headers: StreamHeaders, streamUrl: string): string {
    const ua = pick(headers, 'User-Agent', 'user-agent');
    if (XTREAM_LINK_RE.test(streamUrl) && (!ua || ua === appConfig.defaultUserAgent)) return env.xtreamUserAgent;
    return ua || appConfig.defaultUserAgent;
}

function headerParams(params: URLSearchParams, headers: StreamHeaders, streamUrl: string): void {
    params.set('h_user-agent', proxyUserAgent(headers, streamUrl));
    const referer = pick(headers, 'referer', 'Referer', 'referrer', 'Referrer');
    if (referer) params.set('h_referer', referer);
    const origin = pick(headers, 'origin', 'Origin');
    if (origin) params.set('h_origin', origin);
}

export type StreamType = 'HLS' | 'DASH' | 'HTTP' | 'PHP';

export function streamType(url: string): StreamType {
    if (url.endsWith('.mpd') || url.includes('.mpd?')) return 'DASH';
    if (url.endsWith('.mp4')) return 'HTTP';
    if (url.endsWith('.php') || url.includes('/stream/stream-') || url.includes('/extractor/video')) return 'PHP';
    return 'HLS';
}

/** URL MediaFlow: endpoint scelto in base all'estensione, come nella versione precedente. */
function mediaflowUrl(base: string, streamUrl: string, headers: StreamHeaders, cfg: UserConfig, clearkey?: string): string {
    const params = new URLSearchParams({ api_password: cfg.proxy_pwd, d: streamUrl });
    headerParams(params, headers, streamUrl);
    if (clearkey) {
        const pairs = clearkey.split(',').map(p => p.split(':'));
        params.set('key_id', pairs.map(p => p[0]).join(','));
        params.set('key', pairs.map(p => p[1]).join(','));
        return `${base}/proxy/mpd/manifest.m3u8?${params}`;
    }
    if (streamUrl.endsWith('.mpd')) return `${base}/proxy/mpd/manifest.m3u8?${params}`;
    if (streamUrl.endsWith('.mp4')) return `${base}/proxy/stream?${params}`;
    if (streamUrl.endsWith('.php')) return `${base}/extractor/video?host=DLHD&redirect_stream=true&${params}`;
    return `${base}/proxy/hls/manifest.m3u8?${params}`;
}

/** URL EasyProxy: endpoint universale con riconoscimento automatico; mp4 come stream diretto. */
function easyproxyUrl(base: string, streamUrl: string, headers: StreamHeaders, cfg: UserConfig, clearkey?: string): string {
    const params = new URLSearchParams({ api_password: cfg.proxy_pwd });
    // I link Xtream usano sempre l'endpoint universale: con /proxy/stream alcuni pannelli danno
    // "Bad status line" (errore 500 di EasyProxy) anche sui film .mp4
    if (streamUrl.endsWith('.mp4') && !clearkey && !XTREAM_LINK_RE.test(streamUrl)) {
        params.set('d', streamUrl);
        headerParams(params, headers, streamUrl);
        return `${base}/proxy/stream?${params}`;
    }
    params.set('url', streamUrl);
    headerParams(params, headers, streamUrl);
    if (clearkey) params.set('clearkey', clearkey);
    return `${base}/proxy/manifest.m3u8?${params}`;
}

export function buildProxyUrl(kind: ProxyKind, streamUrl: string, headers: StreamHeaders, cfg: UserConfig, clearkey?: string): string | null {
    if (!hasProxy(cfg) || !streamUrl) return null;
    const base = baseOf(cfg);
    return kind === 'easyproxy'
        ? easyproxyUrl(base, streamUrl, headers, cfg, clearkey)
        : mediaflowUrl(base, streamUrl, headers, cfg, clearkey);
}

export function proxyLabel(kind: ProxyKind): string {
    return kind === 'easyproxy' ? 'EasyProxy' : 'MediaFlow';
}

export type { ProxyType };
