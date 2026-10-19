/** Configurazione di un utente, salvata nel DB e identificata da un id casuale. */
export interface UserConfig {
    /** Tipo di sorgente dei canali: URL M3U oppure account Xtream Codes. */
    source_type: SourceType;
    m3u: string;
    /** Xtream Codes: server (http://host:porta), credenziali e formato degli stream live. */
    xtream_server: string;
    xtream_username: string;
    xtream_password: string;
    xtream_format: 'm3u8' | 'ts';
    /** Xtream: aggiunge i cataloghi Film e Serie TV (VOD del provider). */
    xtream_vod: boolean;
    /** Chiave API TMDB dell'utente: serve a collegare film/serie agli ID IMDb delle pagine Stremio. */
    tmdb_api_key: string;
    epg: string;
    /** Abilita l'EPG. */
    epg_enabled: boolean;
    /** Abbinamento EPG intelligente e permissivo (ignora tag HD/SD, prefissi LCN, fallback su nome/titolo). */
    smart_epg: boolean;
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
    /** Se true (predefinito se c'è un proxy), mostra SOLO stream proxati ed esclude i fallback diretti. */
    force_proxy: boolean;
    /** Modalità compatibile con AIOStreams: aggiunge il suffisso [PAESE] a canali e stream. */
    aio_compatible: boolean;
    /** Tipo di proxy: rilevato automaticamente oppure forzato. */
    proxy_type: ProxyType;
    /** Codice paese scelto nei preset (solo per precompilare il wizard). */
    country: string;
}

export type ProxyType = 'auto' | 'mediaflow' | 'easyproxy';

export type SourceType = 'm3u' | 'xtream';

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
