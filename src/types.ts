/** Configurazione di un utente, salvata nel DB e identificata da un id casuale. */
export interface UserConfig {
    m3u: string;
    epg: string;
    epg_enabled: boolean;
    language: string;
    proxy: string;
    proxy_pwd: string;
    id_suffix: string;
    remapper_path: string;
    update_interval: string;
    python_script_url: string;
    python_update_interval: string;
    resolver_script: string;
    resolver_enabled: boolean;
    resolver_update_interval: string;
    /** Nasconde gli URL reali degli stream dietro /s/<token>. */
    mask_streams: boolean;
    /** Tipo di proxy: rilevato automaticamente oppure forzato. */
    proxy_type: ProxyType;
    /** Codice paese scelto nei preset (solo per precompilare il wizard). */
    country: string;
}

export type ProxyType = 'auto' | 'mediaflow' | 'easyproxy';

export type StreamHeaders = Record<string, string>;

export interface StreamUrl {
    url: string;
    name: string;
    headers: StreamHeaders;
    /** Chiavi ClearKey "KID:KEY[,KID:KEY]" da #KODIPROP (stream DASH cifrati). */
    clearkey?: string;
}

export interface Channel {
    id: string;
    type: 'tv';
    name: string;
    genre: string[];
    posterShape: 'square';
    poster?: string;
    background?: string;
    logo?: string;
    description: string;
    runtime: 'LIVE';
    behaviorHints: { defaultVideoId: string; isLive: true };
    streamInfo: {
        urls: StreamUrl[];
        tvg: Record<string, string> & { id: string; name: string };
    };
}

export interface PlaylistData {
    channels: Channel[];
    genres: string[];
    epgUrls: string[];
}

export interface Program {
    title: string;
    description: string;
    category: string;
    start: string;
    stop: string;
}

export interface StremioStream {
    name: string;
    title: string;
    url: string;
    headers?: StreamHeaders;
    language?: string;
    behaviorHints: Record<string, unknown>;
    meta?: unknown;
}
