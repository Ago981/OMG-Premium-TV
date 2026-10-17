import { db } from '../db';
import { hashPassword, newConfigId, sha256, verifyPassword } from '../security/crypto';
import type { UserConfig } from '../types';

export interface ConfigRecord {
    id: string;
    label: string;
    passwordHash: string | null;
    config: UserConfig;
    legacy: boolean;
    createdAt: number;
    updatedAt: number;
    lastAccess: number | null;
}

interface Row {
    id: string;
    label: string;
    password_hash: string | null;
    data: string;
    legacy: number;
    created_at: number;
    updated_at: number;
    last_access: number | null;
}

export const DEFAULT_CONFIG: UserConfig = {
    m3u: '',
    epg: '',
    epg_enabled: false,
    language: 'Italiano',
    proxy: '',
    proxy_pwd: '',
    force_proxy: false,
    id_suffix: '',
    remapper_path: '',
    update_interval: '12:00',
    python_script_url: '',
    python_update_interval: '',
    resolver_script: '',
    resolver_enabled: false,
    resolver_update_interval: '',
    mask_streams: true
};

const BOOL_KEYS = ['epg_enabled', 'force_proxy', 'resolver_enabled', 'mask_streams'] as const;
const INTERVAL_RE = /^\d{1,2}:\d{2}$/;

function toBool(v: unknown): boolean {
    return v === true || v === 'true' || v === 'on' || v === '1' || v === 1;
}

function cleanList(v: unknown, max = 4000): string {
    return String(v ?? '').trim().slice(0, max);
}

/** Verifica che ogni URL di una lista separata da virgole sia http(s) o omg://generated/<id>. */
function validUrlList(value: string): boolean {
    if (!value) return true;
    return value.split(',').map(s => s.trim()).filter(Boolean).every(u => {
        if (/^omg:\/\/generated\/[\w-]+$/.test(u)) return true;
        try {
            const p = new URL(u).protocol;
            return p === 'http:' || p === 'https:';
        } catch {
            return false;
        }
    });
}

export class ConfigValidationError extends Error {}

/**
 * Normalizza l'input dal form/JSON/vecchio URL base64 (dove i booleani sono stringhe 'true').
 * Lancia ConfigValidationError se un campo non è valido.
 */
export function normalizeConfig(input: Record<string, unknown>, opts: { strict?: boolean } = {}): UserConfig {
    const out: UserConfig = { ...DEFAULT_CONFIG };
    for (const key of Object.keys(DEFAULT_CONFIG) as (keyof UserConfig)[]) {
        if (!(key in input)) continue;
        if ((BOOL_KEYS as readonly string[]).includes(key)) {
            (out as unknown as Record<string, unknown>)[key] = toBool(input[key]);
        } else {
            (out as unknown as Record<string, unknown>)[key] = cleanList(input[key]);
        }
    }
    // Nei vecchi URL il campo mancante significava "non mascherare"
    if (!('mask_streams' in input) && !opts.strict) out.mask_streams = true;
    if (!opts.strict) return out;

    for (const key of ['m3u', 'epg', 'proxy', 'remapper_path', 'python_script_url', 'resolver_script'] as const) {
        if (!validUrlList(out[key])) throw new ConfigValidationError(`invalid_url:${key}`);
    }
    for (const key of ['update_interval', 'python_update_interval', 'resolver_update_interval'] as const) {
        if (out[key] && !INTERVAL_RE.test(out[key])) throw new ConfigValidationError(`invalid_interval:${key}`);
    }
    if (out.id_suffix && !/^[\w.-]{1,20}$/.test(out.id_suffix)) throw new ConfigValidationError('invalid_suffix');
    return out;
}

function fromRow(row: Row): ConfigRecord {
    let config: UserConfig;
    try {
        config = normalizeConfig(JSON.parse(row.data));
    } catch {
        config = { ...DEFAULT_CONFIG };
    }
    return {
        id: row.id,
        label: row.label,
        passwordHash: row.password_hash,
        config,
        legacy: Number(row.legacy) === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastAccess: row.last_access
    };
}

export const MIN_PASSWORD_LENGTH = 6;

export async function createConfig(config: UserConfig, password: string, label = ''): Promise<ConfigRecord> {
    if (!password || password.length < MIN_PASSWORD_LENGTH) throw new ConfigValidationError('password_too_short');
    const now = Date.now();
    let id = newConfigId();
    while (await db().get('SELECT 1 AS x FROM configs WHERE id = ?', [id])) id = newConfigId();
    await db().run(`INSERT INTO configs (id, label, password_hash, data, legacy, created_at, updated_at, last_access)
                    VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
        [id, label.slice(0, 80), hashPassword(password), JSON.stringify(config), now, now, now]);
    return (await getConfig(id)) as ConfigRecord;
}

/**
 * I vecchi URL /<base64>/manifest.json vengono registrati come configurazioni "legacy" senza password
 * (id deterministico dalla config), così passano dalla stessa pipeline e l'admin le vede e può cancellarle.
 */
export async function upsertLegacyConfig(config: UserConfig): Promise<ConfigRecord> {
    const id = 'L' + Buffer.from(sha256(JSON.stringify(config)), 'hex').toString('base64url').slice(0, 21);
    const existing = await getConfig(id);
    if (existing) return existing;
    const now = Date.now();
    await db().run(`INSERT INTO configs (id, label, password_hash, data, legacy, created_at, updated_at, last_access)
                    VALUES (?, 'legacy', NULL, ?, 1, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
        [id, JSON.stringify(config), now, now, now]);
    return (await getConfig(id)) as ConfigRecord;
}

export async function getConfig(id: string): Promise<ConfigRecord | null> {
    if (!id || id.length > 64) return null;
    const row = await db().get<Row>('SELECT * FROM configs WHERE id = ?', [id]);
    return row ? fromRow(row) : null;
}

export async function updateConfig(id: string, config: UserConfig, label?: string): Promise<ConfigRecord | null> {
    if (label !== undefined) {
        await db().run('UPDATE configs SET data = ?, label = ?, updated_at = ? WHERE id = ?',
            [JSON.stringify(config), label.slice(0, 80), Date.now(), id]);
    } else {
        await db().run('UPDATE configs SET data = ?, updated_at = ? WHERE id = ?', [JSON.stringify(config), Date.now(), id]);
    }
    return getConfig(id);
}

export async function setConfigPassword(id: string, password: string): Promise<void> {
    if (!password || password.length < MIN_PASSWORD_LENGTH) throw new ConfigValidationError('password_too_short');
    await db().run('UPDATE configs SET password_hash = ?, legacy = 0, updated_at = ? WHERE id = ?',
        [hashPassword(password), Date.now(), id]);
}

export function checkConfigPassword(record: ConfigRecord, password: string): boolean {
    return verifyPassword(password, record.passwordHash);
}

/** Impronta della password corrente: invalida le sessioni quando la password cambia. */
export function passwordVersion(record: ConfigRecord): string {
    return sha256(record.passwordHash || 'none').slice(0, 12);
}

const touchCache = new Map<string, number>();

/** Aggiorna last_access al massimo una volta ogni 5 minuti per configurazione. */
export async function touchConfig(id: string): Promise<void> {
    const now = Date.now();
    const last = touchCache.get(id) || 0;
    if (now - last < 5 * 60 * 1000) return;
    touchCache.set(id, now);
    await db().run('UPDATE configs SET last_access = ? WHERE id = ?', [now, id]);
}

export async function deleteConfigs(ids: string[]): Promise<number> {
    const existing = await db().all<{ id: string }>(
        `SELECT id FROM configs WHERE id IN (${ids.map(() => '?').join(', ') || "''"})`, ids);
    await db().batch(existing.map(r => ({ sql: 'DELETE FROM configs WHERE id = ?', params: [r.id] })));
    ids.forEach(id => touchCache.delete(id));
    return existing.length;
}

export async function listConfigs(): Promise<ConfigRecord[]> {
    const rows = await db().all<Row>('SELECT * FROM configs ORDER BY COALESCE(last_access, created_at) DESC');
    return rows.map(fromRow);
}

/** Configurazioni usate negli ultimi `days` giorni. */
export async function listActiveConfigs(days: number): Promise<ConfigRecord[]> {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const rows = await db().all<Row>('SELECT * FROM configs WHERE COALESCE(last_access, created_at) >= ?', [since]);
    return rows.map(fromRow);
}
