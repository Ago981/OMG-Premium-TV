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

export interface TmdbMatch {
    imdbId: string | null;
    /** URL completi delle immagini (copertina verticale e sfondo). */
    poster: string | null;
    backdrop: string | null;
}

const IMAGE_BASE = 'https://image.tmdb.org/t/p';

interface Image {
    file_path: string;
    iso_639_1?: string | null;
    iso_3166_1?: string | null;
}

interface Details {
    poster_path?: string | null;
    backdrop_path?: string | null;
    external_ids?: { imdb_id?: string | null };
    images?: { posters?: Image[]; backdrops?: Image[] };
}

/**
 * Locandina adatta a lingua e paese: prima quella nella lingua e del paese dell'utente,
 * poi quella nella sua lingua, poi la locandina principale (le liste TMDB sono ordinate per voto).
 */
function pickPoster(d: Details, language: string): string | null {
    const [lang, region] = language.split('-');
    const posters = d.images?.posters || [];
    const best = posters.find(p => p.iso_639_1 === lang && p.iso_3166_1 === region)
        || posters.find(p => p.iso_639_1 === lang);
    return best?.file_path || d.poster_path || null;
}

/** Scheda TMDB con ID esterni nella stessa richiesta: ID IMDb, copertina e sfondo (nella lingua dell'utente). */
async function details(key: string, kind: VodKind, tmdbId: number, language: string): Promise<TmdbMatch | null> {
    const d = await tmdbGet<Details>(key, `/${kind === 'movie' ? 'movie' : 'tv'}/${tmdbId}`, {
        append_to_response: 'external_ids,images', language,
        // Locandine nella lingua dell'utente e senza testo (null) per gli sfondi
        include_image_language: `${language.split('-')[0]},null`
    });
    if (!d) return null;
    const imdb = d.external_ids?.imdb_id;
    return {
        imdbId: imdb && /^tt\d+$/.test(imdb) ? imdb : null,
        poster: (poster => poster ? `${IMAGE_BASE}/w342${poster}` : null)(pickPoster(d, language)),
        backdrop: d.backdrop_path ? `${IMAGE_BASE}/w1280${d.backdrop_path}` : null
    };
}

/**
 * ID IMDb e immagini di un titolo: dal tmdb_id fornito dal pannello se c'è (1 richiesta),
 * altrimenti dalla ricerca per titolo e anno (2 richieste). null se il titolo non si trova.
 */
export async function tmdbMatch(key: string, kind: VodKind, item: { tmdbId: string | null; name: string; year: number | null }, language: string): Promise<TmdbMatch | null> {
    if (item.tmdbId && /^\d+$/.test(item.tmdbId)) {
        const byId = await details(key, kind, Number(item.tmdbId), language);
        if (byId) return byId;
        // tmdb_id sbagliato (404): si prova con il titolo
    }
    const found = await searchTmdb(key, kind, item.name, item.year, language);
    return found ? details(key, kind, found, language) : null;
}

const LANGUAGE_CODES: [RegExp, string, string][] = [
    [/^ital/, 'it', 'IT'], [/^engl/, 'en', 'US'], [/^espa|^span/, 'es', 'ES'], [/^fran|^fren/, 'fr', 'FR'],
    [/^deut|^germ/, 'de', 'DE'], [/^port/, 'pt', 'PT'], [/^nede|^dutc/, 'nl', 'NL'], [/^pols|^poli/, 'pl', 'PL'],
    [/^рус|^russ/, 'ru', 'RU'], [/^العرب|^arab/, 'ar', 'SA'], [/^中文|^chin/, 'zh', 'CN'], [/^日本|^japa/, 'ja', 'JP'], [/^한국|^kore/, 'ko', 'KR']
];

/**
 * Lingua TMDB dalla lingua e dal paese della configurazione: "Italiano" + Svizzera → "it-CH".
 * Il paese sceglie la variante regionale (titoli e locandine localizzate, es. pt-BR o es-MX).
 */
export function tmdbLanguage(language: string, country = ''): string {
    const l = (language || '').trim().toLowerCase();
    const found = LANGUAGE_CODES.find(([re]) => re.test(l));
    const [lang, region] = found ? [found[1], found[2]] : ['en', 'US'];
    return `${lang}-${/^[a-z]{2}$/i.test(country) ? (country.toLowerCase() === 'uk' ? 'GB' : country.toUpperCase()) : region}`;
}
