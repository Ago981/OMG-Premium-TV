import { appConfig } from '../config';
import { env } from '../env';
import { request } from '../http-client';
import * as logger from '../logger';
import { encrypt } from '../security/crypto';
import type { Channel, StreamHeaders, StremioStream, UserConfig } from '../types';
import type { PythonResolver } from '../python/python-resolver';
import { buildProxyUrl, proxyLabel, resolveProxyKind, streamType, type ProxyKind } from './proxy';

/**
 * Costruzione degli stream: originali, via proxy (MediaFlow o EasyProxy), risolti dal resolver Python.
 * Con il mascheramento attivo l'URL reale (proxy + api_password + sorgente) non compare mai
 * nelle risposte dell'addon: Stremio/Nuvio ricevono /s/<token cifrato> che fa redirect alla destinazione.
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

/**
 * Header di riproduzione nel formato standard (behaviorHints.proxyHeaders): è quello letto da Nuvio
 * e dal server di streaming di Stremio. Il campo "headers" resta per compatibilità con AIOStreams.
 * Si aggiungono solo se servono davvero (Referer/Origin/User-Agent non predefinito).
 */
function playbackHints(headers: StreamHeaders | undefined): Record<string, unknown> {
    const hints: Record<string, unknown> = { notWebReady: false, bingeGroup: 'tv' };
    if (!headers) return hints;
    const request: StreamHeaders = {};
    const ua = pick(headers, 'User-Agent', 'user-agent');
    if (ua && ua !== appConfig.defaultUserAgent) request['User-Agent'] = ua;
    const referer = pick(headers, 'referer', 'Referer', 'referrer', 'Referrer');
    if (referer) request['Referer'] = referer;
    const origin = pick(headers, 'origin', 'Origin');
    if (origin) request['Origin'] = origin;
    for (const [k, v] of Object.entries(headers)) {
        if (!/^(user-agent|referr?er|origin)$/i.test(k)) request[k] = v;
    }
    if (Object.keys(request).length) {
        hints.notWebReady = true;
        hints.proxyHeaders = { request };
    }
    return hints;
}

interface StreamInput {
    name: string;
    originalName: string;
    url: string;
    headers: StreamHeaders;
    clearkey?: string;
}

function directStream(input: StreamInput, cfg: UserConfig, icon = '📺', suffix = ''): StremioStream {
    return {
        name: input.name,
        title: `${icon} ${input.originalName || input.name} [${langAbbr(cfg)}]${suffix}`.trimStart(),
        url: input.url,
        headers: input.headers,
        language: cfg.language,
        behaviorHints: playbackHints(input.headers)
    };
}

async function proxyStreams(input: StreamInput, ctx: StreamContext, kind: ProxyKind): Promise<StremioStream[]> {
    const cfg = ctx.config;
    if (cfg.proxy && input.url.includes(cfg.proxy)) return [];
    if (EXCLUDED_DOMAINS.some(d => input.url.includes(d))) {
        return [{ ...directStream(input, cfg, ''), title: `${input.originalName} [${langAbbr(cfg)}]` }];
    }
    if (!cfg.proxy || !cfg.proxy_pwd) return [];

    let proxyUrl = buildProxyUrl(kind, input.url, input.headers, cfg, input.clearkey) as string;
    let ok = await proxyHealthy(proxyUrl, input.headers, ctx.configId);
    if (!ok && !input.url.endsWith('/') && !input.clearkey) {
        const withSlash = buildProxyUrl(kind, input.url + '/', input.headers, cfg) as string;
        if (await proxyHealthy(withSlash, input.headers, ctx.configId)) {
            proxyUrl = withSlash;
            ok = true;
        }
    }
    if (ok) {
        const type = input.clearkey ? 'DASH ClearKey' : streamType(input.url);
        return [{
            name: input.name,
            title: `🌐 ${input.originalName} [${langAbbr(cfg)}]\n[${proxyLabel(kind)} ${type}]`,
            url: proxyUrl,
            language: cfg.language,
            behaviorHints: { notWebReady: false, bingeGroup: 'tv' }
        }];
    }
    // Il proxy non riesce ad aprire questo stream: si offre il link diretto (dall'IP dell'utente), segnalato
    return [{ ...directStream(input, cfg, '⚠️'), title: `⚠️ ${input.originalName} [${langAbbr(cfg)}]\n[${proxyLabel(kind)} ✗ → direct]` }];
}

/** Con un proxy configurato tutto passa dal proxy; senza, gli stream sono diretti (IP dell'utente). */
async function originalStreams(inputs: StreamInput[], ctx: StreamContext, kind: ProxyKind | null): Promise<StremioStream[]> {
    const out: StremioStream[] = [];
    for (const input of inputs) {
        if (kind) out.push(...await proxyStreams(input, ctx, kind));
        else out.push(directStream(input, ctx.config));
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
        const input: StreamInput = { name: channel.name, originalName: s.name || channel.name, url: r.resolved_url, headers: r.headers || headers, clearkey: s.clearkey };
        if (r.resolved_url === s.url) return directStream(input, cfg);
        return { ...directStream(input, cfg, '🧩', '\n[Resolved]'), name: channel.name };
    }));
    return results.filter((s): s is StremioStream => s !== null);
}

export async function buildStreams(channel: Channel, ctx: StreamContext): Promise<StremioStream[]> {
    const cfg = ctx.config;
    const kind: ProxyKind | null = cfg.proxy && cfg.proxy_pwd ? await resolveProxyKind(cfg) : null;
    const inputs: StreamInput[] = channel.streamInfo.urls.map(s => ({
        name: channel.name,
        originalName: s.name,
        url: s.url,
        headers: { ...s.headers, 'User-Agent': s.headers['User-Agent'] || appConfig.defaultUserAgent },
        clearkey: s.clearkey
    }));

    let streams: StremioStream[] = [];
    if (cfg.resolver_enabled && cfg.resolver_script) {
        try {
            const resolved = await resolvedStreams(channel, ctx);
            if (resolved.length) {
                if (!kind) streams.push(...resolved);
                else {
                    for (const r of resolved) {
                        streams.push(...await proxyStreams({ name: r.name, originalName: r.title, url: r.url, headers: r.headers || {} }, ctx, kind));
                    }
                }
            } else {
                streams = await originalStreams(inputs, ctx, kind);
            }
        } catch (e) {
            logger.error(ctx.configId, 'Stream resolution error:', logger.errMsg(e));
            streams = await originalStreams(inputs, ctx, kind);
        }
    } else {
        streams = await originalStreams(inputs, ctx, kind);
    }

    // Gli header restano invariati: il player li invia anche dopo il redirect
    return streams.map(s => ({ ...s, url: maskUrl(s.url, ctx) }));
}
