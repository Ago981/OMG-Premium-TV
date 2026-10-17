import dns from 'dns/promises';
import net from 'net';
import { Readable } from 'stream';
import { env } from './env';

/**
 * Client HTTP basato su fetch nativo, con timeout, limite dimensione e blocco degli indirizzi
 * privati (anche dopo i redirect) per evitare SSRF in un'istanza condivisa.
 */

export class HttpError extends Error {
    constructor(message: string, public readonly status?: number) {
        super(message);
    }
}

function isPrivateIp(ip: string): boolean {
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

export async function assertPublicUrl(rawUrl: string): Promise<URL> {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new HttpError(`Invalid URL: ${rawUrl}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new HttpError(`Unsupported protocol: ${url.protocol}`);
    }
    if (env.allowPrivateUrls) return url;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
        throw new HttpError('Private addresses are not allowed (set ALLOW_PRIVATE_URLS=true to enable)');
    }
    const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map(a => a.address);
    if (addresses.some(isPrivateIp)) {
        throw new HttpError('Private addresses are not allowed (set ALLOW_PRIVATE_URLS=true to enable)');
    }
    return url;
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
        const url = await assertPublicUrl(current);
        const res = await fetch(url, {
            method: opts.method || 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0', ...opts.headers },
            redirect: 'manual',
            signal
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
    for await (const chunk of Readable.fromWeb(res.body as import('stream/web').ReadableStream)) {
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
    const source = Readable.fromWeb(res.body as import('stream/web').ReadableStream);
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
