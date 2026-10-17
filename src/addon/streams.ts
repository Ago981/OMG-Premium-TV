import { appConfig } from '../config';
import { env } from '../env';
import { request } from '../http-client';
import * as logger from '../logger';
import { encrypt } from '../security/crypto';
import type { Channel, StreamHeaders, StremioStream, UserConfig } from '../types';
import type { PythonResolver } from '../python/python-resolver';

/**
 * Costruzione degli stream: originali, via proxy MediaFlow, risolti dal resolver Python.
 * Con il mascheramento attivo l'URL reale (proxy + api_password + sorgente) non compare mai
 * nelle risposte dell'addon: Stremio riceve /s/<token cifrato> che fa redirect alla destinazione.
 */

const EXCLUDED_DOMAINS = ['pluto.tv'];
const HEALTH_TTL_MS = 60 * 1000;
const health = new Map<string, { at: number; ok: boolean }>();

export interface StreamContext {
    config: UserConfig;
    configId: string;
    baseUrl: string;
    resolver: PythonResolver;
}

function langAbbr(cfg: UserConfig): string {
    return (cfg.language || appConfig.defaultLanguage).substring(0, 3).toUpperCase();
}

function pick(headers: StreamHeaders, ...names: string[]): string | undefined {
    for (const n of names) if (headers[n]) return headers[n];
    return undefined;
}

type StreamType = 'HLS' | 'DASH' | 'HTTP' | 'PHP';

function streamType(url: string): StreamType {
    if (url.endsWith('.mpd')) return 'DASH';
    if (url.endsWith('.mp4')) return 'HTTP';
    if (url.endsWith('.php') || url.includes('/stream/stream-') || url.includes('daddylive.dad') || url.includes('/extractor/video')) return 'PHP';
    return 'HLS';
}

export function buildProxyUrl(streamUrl: string, headers: StreamHeaders, cfg: UserConfig): string | null {
    if (!cfg.proxy || !cfg.proxy_pwd || !streamUrl) return null;
    const base = cfg.proxy.replace(/\/+$/, '');
    const params = new URLSearchParams({ api_password: cfg.proxy_pwd, d: streamUrl });
    params.set('h_user-agent', pick(headers, 'User-Agent', 'user-agent') || appConfig.defaultUserAgent);
    const referer = pick(headers, 'referer', 'Referer', 'referrer', 'Referrer');
    if (referer) params.set('h_referer', referer);
    const origin = pick(headers, 'origin', 'Origin');
    if (origin) params.set('h_origin', origin);

    // Stessa scelta dell'endpoint della versione precedente (basata solo sull'estensione)
    if (streamUrl.endsWith('.mpd')) return `${base}/proxy/mpd/manifest.m3u8?${params}`;
    if (streamUrl.endsWith('.mp4')) return `${base}/proxy/stream?${params}`;
    if (streamUrl.endsWith('.php')) return `${base}/extractor/video?host=DLHD&redirect_stream=true&${params}`;
    return `${base}/proxy/hls/manifest.m3u8?${params}`;
}

async function proxyHealthy(proxyUrl: string, headers: StreamHeaders, logKey: string): Promise<boolean> {
    const cached = health.get(proxyUrl);
    if (cached && Date.now() - cached.at < HEALTH_TTL_MS) return cached.ok;
    const h: Record<string, string> = { 'User-Agent': pick(headers, 'User-Agent', 'user-agent') || appConfig.defaultUserAgent };
    const referer = pick(headers, 'referer', 'Referer', 'referrer', 'Referrer');
    if (referer) h.Referer = referer;
    const origin = pick(headers, 'origin', 'Origin');
    if (origin) h.Origin = origin;
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
            const res = await request(proxyUrl, { headers: h, timeoutMs: 10000 });
            await res.body?.cancel();
            ok = res.status < 400;
        } catch {
            if (attempt < 2) await new Promise(r => setTimeout(r, 500));
        }
    }
    if (!ok) logger.warn(logKey, 'Proxy health check failed');
    health.set(proxyUrl, { at: Date.now(), ok });
    if (health.size > 5000) health.clear();
    return ok;
}

/** Sostituisce l'URL con /s/<token> se il mascheramento è attivo per questa configurazione. */
export function maskUrl(url: string, ctx: StreamContext): string {
    if (!env.streamMasking || !ctx.config.mask_streams) return url;
    const token = encrypt({ u: url, c: ctx.configId }, env.streamTokenTtlHours * 3600 * 1000, 'stream');
    return `${ctx.baseUrl}/s/${token}`;
}

interface StreamInput {
    name: string;
    originalName: string;
    url: string;
    headers: StreamHeaders;
}

function directStream(input: StreamInput, cfg: UserConfig, icon = '📺', suffix = ''): StremioStream {
    return {
        name: input.name,
        title: `${icon} ${input.originalName || input.name} [${langAbbr(cfg)}]${suffix}`,
        url: input.url,
        headers: input.headers,
        language: cfg.language,
        behaviorHints: { notWebReady: false, bingeGroup: 'tv' }
    };
}

async function proxyStreams(input: StreamInput, ctx: StreamContext): Promise<StremioStream[]> {
    const cfg = ctx.config;
    if (cfg.proxy && input.url.includes(cfg.proxy)) return [];
    if (EXCLUDED_DOMAINS.some(d => input.url.includes(d))) {
        return [{ ...directStream(input, cfg, ''), title: `${input.originalName} [${langAbbr(cfg)}]` }];
    }
    if (!cfg.proxy || !cfg.proxy_pwd) return [];

    let proxyUrl = buildProxyUrl(input.url, input.headers, cfg) as string;
    let ok = await proxyHealthy(proxyUrl, input.headers, ctx.configId);
    if (!ok && !input.url.endsWith('/')) {
        const withSlash = buildProxyUrl(input.url + '/', input.headers, cfg) as string;
        if (await proxyHealthy(withSlash, input.headers, ctx.configId)) {
            proxyUrl = withSlash;
            ok = true;
        }
    }
    if (ok) {
        return [{
            name: input.name,
            title: `🌐 ${input.originalName} [${langAbbr(cfg)}]\n[Proxy ${streamType(input.url)}]`,
            url: proxyUrl,
            language: cfg.language,
            behaviorHints: { notWebReady: false, bingeGroup: 'tv' }
        }];
    }
    // Proxy non funzionante: con "forza proxy" si mostra comunque lo stream originale
    return cfg.force_proxy ? [{ ...directStream(input, cfg, ''), title: `${input.originalName} [${langAbbr(cfg)}]` }] : [];
}

async function originalStreams(inputs: StreamInput[], ctx: StreamContext): Promise<StremioStream[]> {
    const out: StremioStream[] = [];
    const proxyOn = !!(ctx.config.proxy && ctx.config.proxy_pwd);
    for (const input of inputs) {
        if (ctx.config.force_proxy) {
            if (proxyOn) out.push(...await proxyStreams(input, ctx));
        } else {
            out.push(directStream(input, ctx.config));
            if (proxyOn) out.push(...await proxyStreams(input, ctx));
        }
    }
    return out;
}

async function resolvedStreams(channel: Channel, ctx: StreamContext): Promise<StremioStream[]> {
    const cfg = ctx.config;
    if (!(await ctx.resolver.ensureScript(cfg.resolver_script))) return [];
    const proxyConfig = cfg.proxy && cfg.proxy_pwd ? { url: cfg.proxy, password: cfg.proxy_pwd } : null;
    const results = await Promise.all(channel.streamInfo.urls.map(async s => {
        const headers = { ...s.headers };
        if (!headers['User-Agent'] && !headers['user-agent']) headers['User-Agent'] = appConfig.defaultUserAgent;
        const referer = pick(headers, 'referer', 'Referer', 'referrer', 'Referrer');
        if (referer) headers['Referer'] = referer;
        const origin = pick(headers, 'origin', 'Origin');
        if (origin) headers['Origin'] = origin;
        const r = await ctx.resolver.resolveLink(s.url, headers, channel.name, proxyConfig);
        if (!r || !r.resolved_url) return null;
        const input: StreamInput = { name: channel.name, originalName: s.name || channel.name, url: r.resolved_url, headers: r.headers || headers };
        if (r.resolved_url === s.url) return directStream(input, cfg);
        return { ...directStream(input, cfg, '🧩', '\n[Resolved]'), name: channel.name };
    }));
    return results.filter((s): s is StremioStream => s !== null);
}

export async function buildStreams(channel: Channel, ctx: StreamContext): Promise<StremioStream[]> {
    const cfg = ctx.config;
    const inputs: StreamInput[] = channel.streamInfo.urls.map(s => ({
        name: channel.name,
        originalName: s.name,
        url: s.url,
        headers: { ...s.headers, 'User-Agent': s.headers['User-Agent'] || appConfig.defaultUserAgent }
    }));

    let streams: StremioStream[] = [];
    if (cfg.resolver_enabled && cfg.resolver_script) {
        try {
            const resolved = await resolvedStreams(channel, ctx);
            if (resolved.length) {
                const proxyOn = !!(cfg.proxy && cfg.proxy_pwd);
                if (!cfg.force_proxy || !proxyOn) streams.push(...resolved);
                if (proxyOn) {
                    for (const r of resolved) {
                        streams.push(...await proxyStreams({ name: r.name, originalName: r.title, url: r.url, headers: r.headers || {} }, ctx));
                    }
                }
            } else {
                streams = await originalStreams(inputs, ctx);
            }
        } catch (e) {
            logger.error(ctx.configId, 'Stream resolution error:', logger.errMsg(e));
            streams = await originalStreams(inputs, ctx);
        }
    } else {
        streams = await originalStreams(inputs, ctx);
    }

    // Gli header restano invariati: il player li invia anche dopo il redirect
    return streams.map(s => ({ ...s, url: maskUrl(s.url, ctx) }));
}
