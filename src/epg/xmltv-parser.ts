import { Readable } from 'stream';
import { StringDecoder } from 'string_decoder';
import zlib from 'zlib';
import sax from 'sax';

/**
 * Parser XMLTV in streaming: legge il file a pezzi (anche .gz) e restituisce canali e programmi
 * a blocchi, senza mai tenere l'intero documento in memoria (il vecchio xml2js lo caricava tutto).
 */

export interface XmltvChannel {
    id: string;
    displayName: string;
    icon: string;
}

export interface XmltvProgramme {
    channel: string;
    start: number;
    stop: number;
    title: string;
    description: string;
    category: string;
}

export interface XmltvHandlers {
    channel(ch: XmltvChannel): void;
    programme(p: XmltvProgramme): void;
    /** Chiamato periodicamente: qui si scrivono i blocchi su DB (il parsing aspetta). */
    flush(): Promise<void>;
    /** true quando conviene chiamare flush(). */
    shouldFlush(): boolean;
}

/** "20240101120000 +0100" → epoch ms. Senza fuso orario si assume UTC. */
export function parseXmltvDate(value: string | undefined): number | null {
    if (!value) return null;
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-]\d{2}):?(\d{2}))?/.exec(value.trim());
    if (!m) return null;
    const [, y, mo, d, h, mi, s = '00', tzh = '+00', tzm = '00'] = m;
    const t = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}${tzh}:${tzm}`);
    return Number.isNaN(t) ? null : t;
}

/** Decomprime al volo se il contenuto è gzip (magic bytes 1f 8b), indipendentemente dall'estensione. */
export async function* decompressed(source: Readable): AsyncGenerator<Buffer> {
    const it = source[Symbol.asyncIterator]();
    const first = await it.next();
    if (first.done) return;
    const head = Buffer.from(first.value as Buffer);
    const rest = Readable.from((async function* () {
        yield head;
        for (;;) {
            const next = await it.next();
            if (next.done) return;
            yield next.value as Buffer;
        }
    })());
    if (head[0] === 0x1f && head[1] === 0x8b) {
        const gunzip = zlib.createGunzip();
        rest.on('error', e => gunzip.destroy(e));
        yield* rest.pipe(gunzip) as AsyncIterable<Buffer>;
    } else {
        yield* rest as AsyncIterable<Buffer>;
    }
}

export type ParseOutcome = { kind: 'xml'; channels: number; programmes: number } | { kind: 'list'; urls: string[] };

/**
 * Parsa una sorgente EPG. Se il contenuto non è XML viene trattato come lista di URL
 * (una per riga), come faceva la versione precedente.
 */
export async function parseXmltv(source: Readable, handlers: XmltvHandlers): Promise<ParseOutcome> {
    const parser = sax.parser(false, { lowercase: true, trim: false });
    const decoder = new StringDecoder('utf8');

    let channels = 0;
    let programmes = 0;
    let parseError: Error | null = null;

    let channel: XmltvChannel | null = null;
    let programme: XmltvProgramme | null = null;
    let field: 'display-name' | 'title' | 'desc' | 'category' | null = null;
    let text = '';

    parser.onerror = (e: Error) => {
        // XMLTV reali sono spesso "sporchi": si ignora l'errore e si continua
        parseError = e;
        (parser as unknown as { error: Error | null }).error = null;
        parser.resume();
    };
    parser.onopentag = (node: sax.Tag) => {
        const a = node.attributes as Record<string, string>;
        switch (node.name) {
            case 'channel':
                channel = { id: a.id || '', displayName: '', icon: '' };
                break;
            case 'programme':
                programme = {
                    channel: a.channel || '',
                    start: parseXmltvDate(a.start) ?? NaN,
                    stop: parseXmltvDate(a.stop) ?? NaN,
                    title: '', description: '', category: ''
                };
                break;
            case 'icon':
                if (channel && !channel.icon && a.src) channel.icon = a.src;
                break;
            case 'display-name':
            case 'title':
            case 'desc':
            case 'category':
                field = node.name;
                text = '';
                break;
        }
    };
    parser.ontext = (t: string) => {
        if (field) text += t;
    };
    parser.oncdata = parser.ontext;
    parser.onclosetag = (name: string) => {
        if (field && name === field) {
            const value = text.trim();
            if (channel && field === 'display-name' && !channel.displayName) channel.displayName = value;
            if (programme) {
                if (field === 'title' && !programme.title) programme.title = value;
                if (field === 'desc' && !programme.description) programme.description = value;
                if (field === 'category' && !programme.category) programme.category = value;
            }
            field = null;
            text = '';
            return;
        }
        if (name === 'channel' && channel) {
            if (channel.id) {
                handlers.channel(channel);
                channels++;
            }
            channel = null;
        } else if (name === 'programme' && programme) {
            if (programme.channel && Number.isFinite(programme.start) && Number.isFinite(programme.stop)) {
                if (!programme.title) programme.title = 'Nessun Titolo';
                handlers.programme(programme);
                programmes++;
            }
            programme = null;
        }
    };

    let mode: 'sniff' | 'xml' | 'list' = 'sniff';
    let listText = '';
    for await (const chunk of decompressed(source)) {
        const str = decoder.write(chunk);
        if (mode === 'sniff') {
            const start = str.replace(/^﻿/, '').trimStart();
            if (!start) continue;
            mode = start.startsWith('<') ? 'xml' : 'list';
        }
        if (mode === 'list') {
            listText += str;
            if (listText.length > 1024 * 1024) break;
            continue;
        }
        parser.write(str);
        if (handlers.shouldFlush()) await handlers.flush();
    }
    if (mode === 'list') {
        const urls = (listText + decoder.end()).split('\n').map(l => l.trim()).filter(l => /^https?:\/\//.test(l));
        return { kind: 'list', urls };
    }
    parser.write(decoder.end());
    parser.close();
    await handlers.flush();
    if (programmes === 0 && channels === 0 && parseError) throw parseError;
    return { kind: 'xml', channels, programmes };
}
