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
 * universale /proxy/manifest.m3u8 che riconosce da solo HLS, DASH ed estrattori (Vavoo, DaddyLive...).
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

export async function resolveProxyKind(cfg: Pick<UserConfig, 'proxy' | 'proxy_pwd' | 'proxy_type'>): Promise<ProxyKind> {
    if (cfg.proxy_type === 'mediaflow' || cfg.proxy_type === 'easyproxy') return cfg.proxy_type;
    return (await detectProxy(cfg.proxy, cfg.proxy_pwd)).kind;
}

function pick(headers: StreamHeaders, ...names: string[]): string | undefined {
    for (const n of names) if (headers[n]) return headers[n];
    return undefined;
}

function headerParams(params: URLSearchParams, headers: StreamHeaders): void {
    params.set('h_user-agent', pick(headers, 'User-Agent', 'user-agent') || appConfig.defaultUserAgent);
    const referer = pick(headers, 'referer', 'Referer', 'referrer', 'Referrer');
    if (referer) params.set('h_referer', referer);
    const origin = pick(headers, 'origin', 'Origin');
    if (origin) params.set('h_origin', origin);
}

export type StreamType = 'HLS' | 'DASH' | 'HTTP' | 'PHP';

export function streamType(url: string): StreamType {
    if (url.endsWith('.mpd') || url.includes('.mpd?')) return 'DASH';
    if (url.endsWith('.mp4')) return 'HTTP';
    if (url.endsWith('.php') || url.includes('/stream/stream-') || url.includes('daddylive.dad') || url.includes('/extractor/video')) return 'PHP';
    return 'HLS';
}

/** URL MediaFlow: endpoint scelto in base all'estensione, come nella versione precedente. */
function mediaflowUrl(base: string, streamUrl: string, headers: StreamHeaders, cfg: UserConfig, clearkey?: string): string {
    const params = new URLSearchParams({ api_password: cfg.proxy_pwd, d: streamUrl });
    headerParams(params, headers);
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
    if (streamUrl.endsWith('.mp4') && !clearkey) {
        params.set('d', streamUrl);
        headerParams(params, headers);
        return `${base}/proxy/stream?${params}`;
    }
    params.set('url', streamUrl);
    headerParams(params, headers);
    if (clearkey) params.set('clearkey', clearkey);
    return `${base}/proxy/manifest.m3u8?${params}`;
}

export function buildProxyUrl(kind: ProxyKind, streamUrl: string, headers: StreamHeaders, cfg: UserConfig, clearkey?: string): string | null {
    if (!cfg.proxy || !cfg.proxy_pwd || !streamUrl) return null;
    const base = baseOf(cfg);
    return kind === 'easyproxy'
        ? easyproxyUrl(base, streamUrl, headers, cfg, clearkey)
        : mediaflowUrl(base, streamUrl, headers, cfg, clearkey);
}

export function proxyLabel(kind: ProxyKind): string {
    return kind === 'easyproxy' ? 'EasyProxy' : 'MediaFlow';
}

export type { ProxyType };
