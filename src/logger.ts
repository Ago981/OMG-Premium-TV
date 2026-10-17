/**
 * Logger console con prefisso dell'id configurazione, per tracciare le richieste di ogni utente.
 * Uso: log(configId, 'Messaggio', ...args) — configId può essere null → mostrato come '_'
 */
export type LogKey = string | null | undefined;

export function prefix(key: LogKey): string {
    const id = key != null && String(key).trim() !== '' ? String(key).trim() : '_';
    return `[cfg:${id}]`;
}

export function log(key: LogKey, ...args: unknown[]): void {
    if (args.length) console.log(prefix(key), ...args);
}

export function warn(key: LogKey, ...args: unknown[]): void {
    if (args.length) console.warn(prefix(key), ...args);
}

export function error(key: LogKey, ...args: unknown[]): void {
    if (args.length) console.error(prefix(key), ...args);
}

export function errMsg(e: unknown): string {
    if (e instanceof Error) return e.message;
    return typeof e === 'string' ? e : String(e);
}

export default { log, warn, error, prefix, errMsg };
