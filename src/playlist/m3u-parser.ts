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
}

function parseHeaders(lines: string[], start: number, extinf: string): { headers: StreamHeaders; next: number } {
    let i = start;
    const extinfHeaders: StreamHeaders = {};
    for (const opt of extinf.match(/http-[^=]+=["']([^"']+)/g) || []) {
        const [key, value] = opt.split('=');
        extinfHeaders[key.replace('http-', '')] = value.replace(/["']/g, '');
    }

    const vlcHeaders: StreamHeaders = {};
    while (i < lines.length && lines[i].trim().startsWith('#EXTVLCOPT:')) {
        const opt = lines[i].trim().substring('#EXTVLCOPT:'.length).trim();
        const [key, ...value] = opt.split('=');
        vlcHeaders[key.replace('http-', '')] = value.join('=');
        i++;
    }

    const httpHeaders: StreamHeaders = {};
    if (i < lines.length && lines[i].trim().startsWith('#EXTHTTP:')) {
        try {
            Object.assign(httpHeaders, JSON.parse(lines[i].trim().substring('#EXTHTTP:'.length)));
            i++;
        } catch {
            // header JSON non valido: ignorato
        }
    }

    const headers: StreamHeaders = { ...extinfHeaders, ...vlcHeaders, ...httpHeaders };
    headers['User-Agent'] = httpHeaders['User-Agent'] || httpHeaders['user-agent'] ||
        vlcHeaders['user-agent'] || extinfHeaders['user-agent'] || appConfig.defaultUserAgent;
    if (vlcHeaders['referrer']) headers['referrer'] = vlcHeaders['referrer'];
    else if (vlcHeaders['referer']) headers['referrer'] = vlcHeaders['referer'];
    delete headers['referer'];
    if (vlcHeaders['origin']) headers['origin'] = vlcHeaders['origin'];
    return { headers, next: i };
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
        ? groupMatch[1].split(';').map(g => g.trim()).filter(g => g !== '' && g.toLowerCase() !== 'undefined')
        : [];
    if (group.length === 0) group = ['Altri Canali'];

    const parts = metadata.split(',');
    const name = parts[parts.length - 1].trim();
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
                const { headers, next } = parseHeaders(lines, i + 1, line);
                i = next - 1;
                current = parseExtinf(line, headers, this.idSuffix);
            } else if (current && (line.startsWith('http') || line.toLowerCase() === 'null')) {
                const normalized = normalizeId(current.tvg.id);
                const id = normalizeId(this.remap.get(normalized) || normalized);
                let channel = this.channels.get(id);
                if (!channel) {
                    channel = createChannel(current, id);
                    this.channels.set(id, channel);
                    for (const g of current.group) if (!this.genres.includes(g)) this.genres.push(g);
                }
                for (const g of current.group) if (!channel.genre.includes(g)) channel.genre.push(g);
                channel.streamInfo.urls.push(line.toLowerCase() === 'null'
                    ? { url: NO_SIGNAL_URL, name: NO_STREAM_NAME, headers: current.headers }
                    : { url: line, name: current.name, headers: current.headers });
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
        }
        return { channels, genres: [...this.genres], epgUrls: [...this.epgUrls] };
    }
}
