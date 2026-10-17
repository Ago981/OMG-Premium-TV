import dns from 'dns/promises';
import net from 'net';
import { Readable } from 'stream';
import { Agent, ProxyAgent, fetch, type Dispatcher, type Response } from 'undici';
import { socksDispatcher } from 'fetch-socks';
import { env } from './env';

/**
 * Client HTTP del server, con timeout, limite di dimensione e protezione SSRF.
 *
 * Con OUTBOUND_PROXY (es. il container WARP) ogni richiesta esce dal proxy: le sorgenti vedono
 * l'IP del proxy e mai quello del server. In quel caso il nome del sito NON viene risolto in locale
 * (lo risolve il proxy), così neanche la richiesta DNS parte dal server.
 * Con OUTBOUND_PROXY_REQUIRED=true non esiste ripiego diretto: se il proxy manca o non risponde,
 * la richiesta fallisce.
 */

export type { Response };

export class HttpError extends Error {
    constructor(message: string, public readonly status?: number) {
        super(message);
    }
}

export function isPrivateIp(ip: string): boolean {
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(Number);
        return a === 10 || a === 127 || a === 0 ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 100 && b >= 64 && b <= 127) ||
            a >= 224;
    }
    const v6 = ip.toLowerCase();
    if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
    return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

// ---------------------------------------------------------------- dispatcher

const direct: Dispatcher = new Agent({ connect: { timeout: 15000 } });
let proxied: Dispatcher | null = null;

function outboundDispatcher(): Dispatcher | null {
    if (!env.outboundProxy) return null;
    if (proxied) return proxied;
    const u = new URL(env.outboundProxy);
    if (u.protocol === 'socks5:' || u.protocol === 'socks5h:' || u.protocol === 'socks:') {
        proxied = socksDispatcher({
            type: 5,
            host: u.hostname,
            port: Number(u.port || 1080),
            userId: u.username ? decodeURIComponent(u.username) : undefined,
            password: u.password ? decodeURIComponent(u.password) : undefined
        }, { connect: { timeout: 15000 } });
    } else if (u.protocol === 'http:' || u.protocol === 'https:') {
        proxied = new ProxyAgent({ uri: env.outboundProxy, connect: { timeout: 15000 } });
    } else {
        throw new Error(`Unsupported OUTBOUND_PROXY protocol: ${u.protocol} (use http:// or socks5://)`);
    }
    return proxied;
}

/** Descrizione sicura del proxy di uscita (senza credenziali) per log e pannello admin. */
export function outboundProxyLabel(): string {
    if (!env.outboundProxy) return '';
    try {
        const u = new URL(env.outboundProxy);
        return `${u.protocol}//${u.host}`;
    } catch {
        return 'invalid';
    }
}

const PRIVATE_ERROR = 'Private addresses are not allowed (set ALLOW_PRIVATE_URLS=true to enable)';

function isLocalName(host: string): boolean {
    return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') ||
        host.endsWith('.local') || host.endsWith('.lan');
}

/** Nome senza dominio (es. "mediaflow", "easyproxy"): un servizio della rete Docker/LAN. */
function isBareName(host: string): boolean {
    return net.isIP(host) === 0 && !host.includes('.');
}

/**
 * Valida l'URL e sceglie da dove farlo uscire:
 *  - indirizzi privati/locali: diretti, solo con ALLOW_PRIVATE_URLS=true (es. proxy o playlist in LAN)
 *  - tutto il resto: dal proxy di uscita se configurato, altrimenti diretto (a meno che sia obbligatorio)
 */
export async function routeFor(rawUrl: string): Promise<{ url: URL; dispatcher: Dispatcher }> {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new HttpError(`Invalid URL: ${rawUrl}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new HttpError(`Unsupported protocol: ${url.protocol}`);
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const proxy = outboundDispatcher();

    let isPrivate = isLocalName(host) || isBareName(host) || (net.isIP(host) !== 0 && isPrivateIp(host));
    // Uscita obbligatoria senza proxy: si rifiuta prima di qualsiasi traffico, DNS compreso
    if (!proxy && env.outboundProxyRequired && !isPrivate && !env.allowPrivateUrls) {
        throw new HttpError('OUTBOUND_PROXY is required but not configured');
    }
    // Senza proxy il nome va risolto per sapere dove punta davvero (protezione SSRF).
    // Con il proxy NON si risolve nulla in locale: il nome lo risolve il proxy (nessuna fuga DNS).
    if (!isPrivate && !proxy && net.isIP(host) === 0) {
        const addresses = (await dns.lookup(host, { all: true })).map(a => a.address);
        isPrivate = addresses.some(isPrivateIp);
    }

    if (isPrivate) {
        if (!env.allowPrivateUrls) throw new HttpError(PRIVATE_ERROR);
        return { url, dispatcher: direct };
    }
    if (proxy) return { url, dispatcher: proxy };
    if (env.outboundProxyRequired) throw new HttpError('OUTBOUND_PROXY is required but not configured');
    return { url, dispatcher: direct };
}

export interface RequestOptions {
    headers?: Record<string, string>;
    timeoutMs?: number;
    method?: 'GET' | 'HEAD';
}

/** Esegue la richiesta seguendo i redirect manualmente, verificando ogni destinazione. */
export async function request(rawUrl: string, opts: RequestOptions = {}): Promise<Response> {
    const signal = AbortSignal.timeout(opts.timeoutMs ?? env.httpTimeoutMs);
    let current = rawUrl;
    for (let hop = 0; hop < 6; hop++) {
        const { url, dispatcher } = await routeFor(current);
        const res = await fetch(url, {
            method: opts.method || 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0', ...opts.headers },
            redirect: 'manual',
            signal,
            dispatcher
        });
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
            current = new URL(res.headers.get('location') as string, url).toString();
            await res.body?.cancel();
            continue;
        }
        return res;
    }
    throw new HttpError('Too many redirects');
}

const maxBytes = () => env.maxDownloadMb * 1024 * 1024;

function toNodeStream(res: Response): Readable {
    return Readable.fromWeb(res.body as import('stream/web').ReadableStream);
}

/** Scarica un testo (playlist, liste URL, script) con limite di dimensione. */
export async function fetchText(url: string, opts: RequestOptions = {}): Promise<string> {
    const res = await request(url, opts);
    if (!res.ok) {
        await res.body?.cancel();
        throw new HttpError(`HTTP ${res.status} for ${redact(url)}`, res.status);
    }
    const len = Number(res.headers.get('content-length') || 0);
    if (len > maxBytes()) {
        await res.body?.cancel();
        throw new HttpError(`File too large (${Math.round(len / 1048576)} MB)`);
    }
    if (!res.body) return '';
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of toNodeStream(res)) {
        total += (chunk as Buffer).length;
        if (total > maxBytes()) throw new HttpError(`File too large (> ${env.maxDownloadMb} MB)`);
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
}

/** Restituisce lo stream Node della risposta (per l'EPG, che viene parsato in streaming). */
export async function fetchStream(url: string, opts: RequestOptions = {}): Promise<Readable> {
    const res = await request(url, opts);
    if (!res.ok || !res.body) {
        await res.body?.cancel();
        throw new HttpError(`HTTP ${res.status} for ${redact(url)}`, res.status);
    }
    let total = 0;
    const limit = maxBytes();
    const source = toNodeStream(res);
    source.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > limit) source.destroy(new HttpError(`Download too large (> ${env.maxDownloadMb} MB)`));
    });
    return source;
}

/** Nasconde query string (spesso contiene token/password) nei log e negli errori. */
export function redact(url: string): string {
    try {
        const u = new URL(url);
        return `${u.protocol}//${u.host}${u.pathname}${u.search ? '?…' : ''}`;
    } catch {
        return url.length > 60 ? url.slice(0, 60) + '…' : url;
    }
}

export function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return '';
    }
}

// ---------------------------------------------------------------- stato dell'uscita

export interface EgressStatus {
    checkedAt: number;
    ok: boolean;
    ip: string | null;
    warp: boolean;
    colo: string | null;
    via: string;
    error: string | null;
}

let egress: EgressStatus | null = null;

/**
 * Verifica da dove esce il server con https://www.cloudflare.com/cdn-cgi/trace
 * (risponde ip=..., warp=on quando il traffico passa da Cloudflare WARP).
 */
export async function checkEgress(): Promise<EgressStatus> {
    const via = outboundProxyLabel() || 'direct';
    try {
        const text = await fetchText('https://www.cloudflare.com/cdn-cgi/trace', { timeoutMs: 15000 });
        const kv = Object.fromEntries(text.split('\n').map(l => l.split('=')).filter(p => p.length === 2)) as Record<string, string>;
        egress = { checkedAt: Date.now(), ok: true, ip: kv.ip || null, warp: kv.warp === 'on' || kv.warp === 'plus', colo: kv.colo || null, via, error: null };
    } catch (e) {
        egress = { checkedAt: Date.now(), ok: false, ip: null, warp: false, colo: null, via, error: e instanceof Error ? e.message : String(e) };
    }
    return egress;
}

export function lastEgress(): EgressStatus | null {
    return egress;
}
