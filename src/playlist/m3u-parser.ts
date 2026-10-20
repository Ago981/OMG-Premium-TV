import { appConfig, NO_SIGNAL_URL } from '../config';
import type { Channel, PlaylistData, StreamHeaders } from '../types';

/**
 * Parser M3U/M3U8 → canali Stremio. Porting fedele del vecchio PlaylistTransformer:
 * gli id dei canali restano identici, così le installazioni esistenti non perdono nulla.
 */

export const NO_STREAM_NAME = 'No stream available in M3U playlists';

export function normalizeId(id: unknown): string {
    if (typeof id !== 'string') return '';
    const beforeAt = id.includes('@') ? id.split('@')[0] : id;
    return beforeAt.toLowerCase().replace(/[^\w.]/g, '').trim();
}

/** "-----DOCUMENTARI-----" → "DOCUMENTARI": via le serie di 3 o più trattini all'inizio e/o alla fine. */
export function stripDashes(value: string): string {
    return value.replace(/^\s*[-–—]{3,}\s*/, '').replace(/\s*[-–—]{3,}\s*$/, '').trim() || value.trim();
}

/**
 * Chiave "larga" di un canale: senza suffisso paese, simboli e tag di qualità finali.
 * Serve a ritrovare un canale quando la playlist cambia leggermente id o nome
 * ("Vetrina Primafila Live" → "… HD", "rai1" → "rai1.it") e a capire se due voci sono lo stesso canale.
 */
export function looseKey(value: unknown): string {
    // Tag di qualità anche all'inizio del nome ("SD Sky Cinema Uno"), solo come parola a sé
    const text = typeof value === 'string' ? value.replace(/^\s*[[(]?(fhd|uhd|hd|sd|4k)[\])]?\s+/i, '') : value;
    return normalizeId(text)
        .replace(/\.[a-z]{2,3}$/, '')
        .replace(/[^a-z0-9]/g, '')
        .replace(/(fhd|uhd|hd|sd|4k|hevc|h265|backup)+$/, '');
}

const QUALITY_TAG = /^[[(]?(FHD|UHD|HD|SD|4K|HEVC|H\.?26[45])\+?[\])]?$/i;

function qualityOf(word: string): string | null {
    const m = word.match(QUALITY_TAG);
    return m ? m[1].toUpperCase().replace('.', '') : null;
}

/**
 * Nome del canale senza i tag di qualità che distinguono le sue versioni:
 * {"Sky Cinema Uno FHD", "… HD", "… SD"} → "Sky Cinema Uno". Un tag presente in tutte le versioni
 * fa parte del nome e resta ("Rai 4K" e "Rai 4K (backup)" → "Rai 4K").
 */
export function commonChannelName(name: string, variants: string[]): string {
    const tagsOf = (n: string) => new Set(n.split(/\s+/).map(qualityOf).filter((t): t is string => !!t));
    const variantTags = variants.map(tagsOf);
    const distinguishing = (tag: string) => !variantTags.every(t => t.has(tag));
    const words = name.trim().split(/\s+/);
    while (words.length > 1) {
        const tag = qualityOf(words[words.length - 1]);
        if (!tag || !distinguishing(tag)) break;
        words.pop();
    }
    while (words.length > 1) {
        const tag = qualityOf(words[0]);
        if (!tag || !distinguishing(tag)) break;
        words.shift();
    }
    return words.join(' ');
}

function cleanChannelName(name: string): string {
    return name.replace(/[([].*?[)\]]/g, '').trim().toLowerCase().replace(/\s+/g, '');
}

export function parseRemapping(content: string): Map<string, string> {
    const rules = new Map<string, string>();
    for (const raw of content.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const [m3uId, epgId] = line.split('=').map(s => s.trim());
        if (m3uId && epgId) rules.set(normalizeId(m3uId), normalizeId(epgId));
    }
    return rules;
}

interface ParsedLine {
    name: string;
    group: string[];
    tvg: Record<string, string>;
    headers: StreamHeaders;
    clearkey?: string;
}

/** "kid:key" in esadecimale (anche più coppie separate da virgola); altri formati non supportati. */
export function parseClearKey(value: string): string | undefined {
    const pairs = value.split(',').map(p => p.trim()).filter(p => /^[0-9a-fA-F]{32}:[0-9a-fA-F]{32}$/.test(p));
    return pairs.length ? pairs.join(',').toLowerCase() : undefined;
}

/**
 * Legge le righe di opzioni tra #EXTINF e l'URL: #EXTVLCOPT (header), #EXTHTTP (header JSON)
 * e #KODIPROP (chiavi ClearKey per DASH). Le altre righe commento vengono ignorate.
 */
function parseOptions(lines: string[], start: number, extinf: string): { headers: StreamHeaders; clearkey?: string; next: number } {
    let i = start;
    const extinfHeaders: StreamHeaders = {};
    for (const opt of extinf.match(/http-[^=]+=["']([^"']+)/g) || []) {
        const [key, value] = opt.split('=');
        extinfHeaders[key.replace('http-', '')] = value.replace(/["']/g, '');
    }

    const vlcHeaders: StreamHeaders = {};
    const httpHeaders: StreamHeaders = {};
    let clearkey: string | undefined;
    while (i < lines.length) {
        const line = lines[i].trim();
        if (!line.startsWith('#') || line.startsWith('#EXTINF:')) break;
        if (line.startsWith('#EXTVLCOPT:')) {
            const [key, ...value] = line.substring('#EXTVLCOPT:'.length).trim().split('=');
            vlcHeaders[key.replace('http-', '')] = value.join('=');
        } else if (line.startsWith('#EXTHTTP:')) {
            try {
                Object.assign(httpHeaders, JSON.parse(line.substring('#EXTHTTP:'.length)));
            } catch {
                // header JSON non valido: ignorato
            }
        } else if (line.startsWith('#KODIPROP:')) {
            const [key, ...value] = line.substring('#KODIPROP:'.length).trim().split('=');
            if (key.trim().toLowerCase() === 'inputstream.adaptive.license_key') {
                clearkey = parseClearKey(value.join('=')) || clearkey;
            }
        }
        i++;
    }

    const headers: StreamHeaders = { ...extinfHeaders, ...vlcHeaders, ...httpHeaders };
    headers['User-Agent'] = httpHeaders['User-Agent'] || httpHeaders['user-agent'] ||
        vlcHeaders['user-agent'] || extinfHeaders['user-agent'] || appConfig.defaultUserAgent;
    delete headers['user-agent'];
    if (vlcHeaders['referrer']) headers['referrer'] = vlcHeaders['referrer'];
    else if (vlcHeaders['referer']) headers['referrer'] = vlcHeaders['referer'];
    delete headers['referer'];
    if (vlcHeaders['origin']) headers['origin'] = vlcHeaders['origin'];
    return { headers, clearkey, next: i };
}

function parseExtinf(line: string, headers: StreamHeaders, idSuffix: string): ParsedLine {
    const metadata = line.substring(8).trim();
    const tvg: Record<string, string> = {};
    for (const match of metadata.match(/([a-zA-Z-]+)="([^"]+)"/g) || []) {
        const [key, value] = match.split('=');
        tvg[key.replace('tvg-', '')] = value.replace(/"/g, '');
    }

    const groupMatch = metadata.match(/group-title="([^"]+)"/);
    let group = groupMatch
        ? groupMatch[1].split(';').map(g => stripDashes(g)).filter(g => g !== '' && g.toLowerCase() !== 'undefined')
        : [];
    if (group.length === 0) group = ['Altri Canali'];

    const parts = metadata.split(',');
    const name = stripDashes(parts[parts.length - 1]);
    if (tvg.name) tvg.name = stripDashes(tvg.name);
    if (!tvg.id) tvg.id = cleanChannelName(name) + (idSuffix ? `.${idSuffix}` : '');
    return { name, group, tvg, headers };
}

function createChannel(parsed: ParsedLine, channelId: string): Channel {
    const name = parsed.tvg.name || parsed.name;
    const cleanName = name.replace(/\s*\(.*?\)\s*/g, '').trim();
    return {
        id: `tv|${channelId}`,
        type: 'tv',
        name: cleanName,
        genre: [...parsed.group],
        posterShape: 'square',
        poster: parsed.tvg.logo,
        background: parsed.tvg.logo,
        logo: parsed.tvg.logo,
        description: `Channel: ${cleanName} - ID: ${channelId}`,
        runtime: 'LIVE',
        behaviorHints: { defaultVideoId: `tv|${channelId}`, isLive: true },
        streamInfo: {
            urls: [],
            tvg: { ...parsed.tvg, id: channelId, name: cleanName }
        }
    };
}

/** Accumula i canali di più playlist (stesso id = stesso canale con più stream). */
export class M3UParser {
    private channels = new Map<string, Channel>();
    private genres: string[] = [];
    private epgUrls = new Set<string>();
    /** Canali separati da un tvg-id condiviso: chiave larga del nome → id usato */
    private split = new Map<string, string>();

    constructor(private readonly remap: Map<string, string> = new Map(), private readonly idSuffix = '') {}

    add(content: string): void {
        const lines = content.split('\n');
        const header = lines[0] || '';
        const tvgMatch = header.match(/url-tvg="([^"]+)"/) || header.match(/x-tvg-url="([^"]+)"/);
        if (tvgMatch) tvgMatch[1].split(',').map(u => u.trim()).filter(Boolean).forEach(u => this.epgUrls.add(u));

        let current: ParsedLine | null = null;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXTINF:')) {
                const { headers, clearkey, next } = parseOptions(lines, i + 1, line);
                i = next - 1;
                current = parseExtinf(line, headers, this.idSuffix);
                current.clearkey = clearkey;
            } else if (current && (line.startsWith('http') || line.toLowerCase() === 'null')) {
                const normalized = normalizeId(current.tvg.id);
                const remapped = this.remap.get(normalized);
                let id = normalizeId(remapped || normalized);
                let channel = this.channels.get(id);
                // Stesso tvg-id ma canale diverso (playlist che riusano lo stesso id per più canali, es. tutti
                // i Sky con l'id di Sky Cinema Uno): si uniscono solo le voci dello stesso canale (HD/FHD...),
                // le altre diventano canali a sé con l'id ricavato dal nome. Il remapping resta una scelta esplicita.
                const name = (current.tvg.name || current.name).replace(/\s*\(.*?\)\s*/g, '').trim();
                if (channel && !remapped && looseKey(channel.name) !== looseKey(name)) {
                    // Varianti dello stesso canale separato (HD, FHD...) finiscono insieme
                    id = this.split.get(looseKey(name)) || normalizeId(cleanChannelName(name) + (this.idSuffix ? `.${this.idSuffix}` : ''));
                    this.split.set(looseKey(name), id);
                    channel = this.channels.get(id);
                }
                if (!channel) {
                    channel = createChannel(current, id);
                    this.channels.set(id, channel);
                    for (const g of current.group) if (!this.genres.includes(g)) this.genres.push(g);
                }
                for (const g of current.group) if (!channel.genre.includes(g)) channel.genre.push(g);
                channel.streamInfo.urls.push(line.toLowerCase() === 'null'
                    ? { url: NO_SIGNAL_URL, name: NO_STREAM_NAME, headers: current.headers }
                    : { url: line, name: current.name, headers: current.headers, ...(current.clearkey ? { clearkey: current.clearkey } : {}) });
                current = null;
            }
        }
    }

    result(): PlaylistData {
        const channels = [...this.channels.values()];
        for (const ch of channels) {
            if (ch.streamInfo.urls.length > 1) {
                ch.streamInfo.urls = ch.streamInfo.urls.filter(s => s.name !== NO_STREAM_NAME);
            }
            // Più versioni dello stesso canale (FHD, HD, SD...): il nome del canale non porta la qualità
            // della prima voce ("Sky Cinema Uno FHD" → "Sky Cinema Uno"); le versioni restano nei flussi
            const names = [...new Set(ch.streamInfo.urls.map(s => s.name).filter(n => n && n !== NO_STREAM_NAME))];
            if (names.length > 1) {
                const plain = commonChannelName(ch.name, names);
                if (plain && plain !== ch.name) {
                    ch.name = plain;
                    ch.streamInfo.tvg.name = plain;
                    ch.description = `Channel: ${plain} - ID: ${ch.streamInfo.tvg.id}`;
                }
            }
        }
        return { channels, genres: [...this.genres], epgUrls: [...this.epgUrls] };
    }
}
