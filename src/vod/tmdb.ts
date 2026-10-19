import { env } from '../env';
import { request } from '../http-client';

/**
 * Client TMDB minimo: converte film e serie del provider Xtream in ID IMDb (quelli delle pagine
 * Stremio/Cinemeta). Ogni utente usa la propria chiave; le richieste passano dal client dell'addon
 * (WARP/proxy di uscita) e la chiave non finisce nei log (redact nasconde la query string).
 */

export type VodKind = 'movie' | 'series';

export class TmdbAuthError extends Error {}

/** Errore temporaneo (rete, 5xx, troppi 429): il lavoro si interrompe e riprende al prossimo giro. */
export class TmdbUnavailableError extends Error {}

const nextSlot = new Map<string, number>();

/** Distanzia le richieste della stessa chiave per restare sotto il limite TMDB. */
async function throttle(key: string): Promise<void> {
    const gap = 1000 / Math.max(1, env.tmdbRatePerSec);
    const now = Date.now();
    const at = Math.max(now, nextSlot.get(key) || 0);
    nextSlot.set(key, at + gap);
    if (nextSlot.size > 1000) nextSlot.clear();
    if (at > now) await new Promise(r => setTimeout(r, at - now));
}

/** Chiave v3 (api_key) oppure Read Access Token v4 (JWT, header Bearer). */
async function tmdbGet<T>(key: string, path: string, params: Record<string, string> = {}): Promise<T | null> {
    const bearer = key.startsWith('eyJ');
    const query = new URLSearchParams(params);
    if (!bearer) query.set('api_key', key);
    const url = `${env.tmdbApiBase}${path}?${query}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (bearer) headers.Authorization = `Bearer ${key}`;

    for (let attempt = 0; attempt < 4; attempt++) {
        await throttle(key);
        let res;
        try {
            res = await request(url, { headers, timeoutMs: 15000 });
        } catch (e) {
            if (attempt === 3) throw new TmdbUnavailableError(`TMDB unreachable: ${e instanceof Error ? e.message : String(e)}`);
            continue;
        }
        if (res.status === 401) {
            await res.body?.cancel();
            throw new TmdbAuthError('Invalid TMDB API key');
        }
        if (res.status === 404) {
            await res.body?.cancel();
            return null;
        }
        if (res.status === 429 || res.status >= 500) {
            const wait = Math.min(10, Number(res.headers.get('retry-after')) || 2 ** attempt);
            await res.body?.cancel();
            await new Promise(r => setTimeout(r, wait * 1000));
            continue;
        }
        if (!res.ok) {
            await res.body?.cancel();
            return null;
        }
        return (await res.json()) as T;
    }
    throw new TmdbUnavailableError('TMDB is not answering (rate limit or server error)');
}

/** Verifica la chiave (true) o lancia TmdbAuthError. */
export async function checkTmdbKey(key: string): Promise<boolean> {
    const r = await tmdbGet<{ images?: unknown }>(key, '/configuration');
    return !!r;
}

/** "IT - Il Padrino (1972) [4K]" → "Il Padrino". */
export function cleanTitle(name: string): string {
    return name
        .replace(/^\s*(\|[^|]{1,12}\||\[[^\]]{1,12}\]|[A-Z]{2,4}\s*[-|:]\s+)\s*/u, '')
        .replace(/\((19|20)\d{2}\)|\[(19|20)\d{2}\]/g, ' ')
        .replace(/[[(][^\])]*[\])]/g, ' ')
        .replace(/\b(4K|UHD|FHD|HD|SD|HEVC|H\.?26[45]|MULTI|SUB[- ]?ITA|ITA|ENG|DUAL)\b/gi, ' ')
        .replace(/\s*[-|:]\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function yearOf(...values: unknown[]): number | null {
    for (const v of values) {
        const m = String(v ?? '').match(/\b(19\d{2}|20\d{2})\b/);
        if (m) return Number(m[1]);
    }
    return null;
}

function norm(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}

interface SearchResult {
    id: number;
    title?: string;
    original_title?: string;
    name?: string;
    original_name?: string;
    release_date?: string;
    first_air_date?: string;
}

/** Ricerca per titolo: accetta solo un titolo identico (normalizzato) e, se noto, l'anno ±1. */
async function searchTmdb(key: string, kind: VodKind, name: string, year: number | null, language: string): Promise<number | null> {
    const title = cleanTitle(name);
    if (title.length < 2) return null;
    const params: Record<string, string> = { query: title, include_adult: 'false', language };
    if (year) params[kind === 'movie' ? 'year' : 'first_air_date_year'] = String(year);
    const data = await tmdbGet<{ results?: SearchResult[] }>(key, `/search/${kind === 'movie' ? 'movie' : 'tv'}`, params);
    const wanted = norm(title);
    for (const r of data?.results || []) {
        const names = [r.title, r.original_title, r.name, r.original_name].filter(Boolean).map(n => norm(n as string));
        if (!names.includes(wanted)) continue;
        const ry = yearOf(r.release_date, r.first_air_date);
        if (year && ry && Math.abs(ry - year) > 1) continue;
        return r.id;
    }
    return null;
}

/**
 * ID IMDb di un titolo: dal tmdb_id fornito dal pannello se c'è (1 richiesta),
 * altrimenti dalla ricerca per titolo e anno (2 richieste). null se non trovato.
 */
export async function imdbIdFor(key: string, kind: VodKind, item: { tmdbId: string | null; name: string; year: number | null }, language: string): Promise<string | null> {
    const path = kind === 'movie' ? 'movie' : 'tv';
    let tmdbId: number | null = item.tmdbId && /^\d+$/.test(item.tmdbId) ? Number(item.tmdbId) : null;
    if (tmdbId) {
        const ext = await tmdbGet<{ imdb_id?: string | null }>(key, `/${path}/${tmdbId}/external_ids`);
        if (ext?.imdb_id && /^tt\d+$/.test(ext.imdb_id)) return ext.imdb_id;
        if (ext) return null;
        tmdbId = null; // tmdb_id sbagliato (404): si prova con il titolo
    }
    tmdbId = await searchTmdb(key, kind, item.name, item.year, language);
    if (!tmdbId) return null;
    const ext = await tmdbGet<{ imdb_id?: string | null }>(key, `/${path}/${tmdbId}/external_ids`);
    return ext?.imdb_id && /^tt\d+$/.test(ext.imdb_id) ? ext.imdb_id : null;
}

/** "Italiano" → "it-IT" per i titoli della ricerca TMDB. */
export function tmdbLanguage(language: string): string {
    const l = (language || '').toLowerCase();
    if (l.startsWith('it')) return 'it-IT';
    if (l.startsWith('es')) return 'es-ES';
    if (l.startsWith('fr')) return 'fr-FR';
    if (l.startsWith('de')) return 'de-DE';
    if (l.startsWith('port')) return 'pt-PT';
    return 'en-US';
}
