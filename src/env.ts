import path from 'path';

/**
 * Impostazioni del server lette dalle variabili d'ambiente.
 * Tutto ciò che riguarda il singolo utente sta invece nella configurazione salvata nel DB.
 */

function str(name: string, fallback = ''): string {
    const v = process.env[name];
    return v !== undefined && v.trim() !== '' ? v.trim() : fallback;
}

function bool(name: string, fallback: boolean): boolean {
    const v = process.env[name];
    if (v === undefined || v.trim() === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

function int(name: string, fallback: number): number {
    const v = parseInt(process.env[name] || '', 10);
    return Number.isFinite(v) ? v : fallback;
}

const rootDir = path.join(__dirname, '..');

export const env = {
    port: int('PORT', 10000),
    host: str('HOST', '0.0.0.0'),
    rootDir,
    dataDir: path.resolve(str('DATA_DIR', path.join(rootDir, 'data'))),
    /** PostgreSQL (obbligatorio): postgres://utente:password@host:5432/db */
    databaseUrl: str('DATABASE_URL'),

    /** URL pubblico (es. https://tv.miodominio.it). Se assente viene ricavato dalla richiesta. */
    publicBaseUrl: str('PUBLIC_BASE_URL').replace(/\/+$/, ''),
    /** Numero di proxy fidati davanti al server (Cloudflare Tunnel/Worker = 1). */
    trustProxy: int('TRUST_PROXY', 1),
    /**
     * Se impostato, ogni richiesta deve contenere l'header X-Origin-Secret con questo valore
     * (aggiunto dal Worker Cloudflare o da una Transform Rule). Blocca l'accesso diretto all'origine.
     */
    originSecret: str('ORIGIN_SECRET'),

    /** Password admin. Se assente ne viene generata una al primo avvio e stampata nel log. */
    adminPassword: str('ADMIN_PASSWORD'),
    /** Segreto per firmare cookie e cifrare i link degli stream. Se assente viene generato e salvato nel DB. */
    appSecret: str('APP_SECRET'),

    /** Se false le richieste vecchio stile /<base64>/manifest.json vengono rifiutate. */
    allowLegacyUrls: bool('ALLOW_LEGACY_URLS', true),
    /** Maschera gli URL degli stream dietro /s/<token> (nasconde proxy, password e sorgenti). */
    streamMasking: bool('STREAM_MASKING', true),
    streamTokenTtlHours: int('STREAM_TOKEN_TTL_HOURS', 12),

    pythonEnabled: bool('PYTHON_ENABLED', true),
    pythonBin: str('PYTHON_BIN', process.platform === 'win32' ? 'python' : 'python3'),
    pythonTimeoutSec: int('PYTHON_TIMEOUT_SEC', 180),
    resolverTimeoutSec: int('RESOLVER_TIMEOUT_SEC', 30),

    /** Fuso orario IANA per gli orari EPG (gestisce l'ora legale). */
    timezone: str('TIMEZONE', ''),
    /** Compatibilità con la vecchia variabile (+2:00). Usata solo se TIMEZONE non è impostato. */
    timezoneOffset: str('TIMEZONE_OFFSET', ''),

    epgRefreshHours: int('EPG_REFRESH_HOURS', 12),
    epgPastHours: int('EPG_KEEP_PAST_HOURS', 1),
    epgFutureDays: int('EPG_FUTURE_DAYS', 7),
    /** Configurazioni non usate da questo numero di giorni non fanno più aggiornare EPG e playlist. */
    activeConfigDays: int('ACTIVE_CONFIG_DAYS', 14),

    /**
     * Permette URL verso indirizzi privati/locali (192.168.x, 10.x, localhost...).
     * Disattivo di default: in un'istanza multi-utente eviterebbe che un utente usi il server
     * per raggiungere servizi interni (SSRF). Attivalo se le tue playlist/proxy sono in LAN.
     */
    allowPrivateUrls: bool('ALLOW_PRIVATE_URLS', false),
    /**
     * Proxy di uscita per TUTTE le richieste del server (playlist, EPG, verifiche, proxy degli utenti).
     * Es. http://warp:8080 o socks5://warp:1080 (container WARP del docker-compose).
     */
    outboundProxy: str('OUTBOUND_PROXY'),
    /** Se true il server non esce mai direttamente: senza OUTBOUND_PROXY funzionante le richieste falliscono. */
    outboundProxyRequired: bool('OUTBOUND_PROXY_REQUIRED', false),
    httpTimeoutMs: int('HTTP_TIMEOUT_MS', 60000),
    maxDownloadMb: int('MAX_DOWNLOAD_MB', 300)
};

export type Env = typeof env;
