import { env } from './env';

/**
 * Accesso ai dati su PostgreSQL (DATABASE_URL).
 *
 * Le query si scrivono con segnaposto `?` (convertiti in $1, $2...).
 * `batch()` esegue una lista di statement in un'unica transazione.
 */

export type Param = string | number | null;

export interface Statement {
    sql: string;
    params?: Param[];
}

export interface Db {
    readonly kind: 'postgres';
    all<T>(sql: string, params?: Param[]): Promise<T[]>;
    get<T>(sql: string, params?: Param[]): Promise<T | undefined>;
    run(sql: string, params?: Param[]): Promise<number>;
    batch(statements: Statement[]): Promise<void>;
    /** Inserimento massivo atomico (usato dall'import EPG). */
    insertMany(table: string, columns: string[], rows: Param[][]): Promise<void>;
    close(): Promise<void>;
}

// ---------------------------------------------------------------- schema

const SCHEMA_V1 = `
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS configs (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL DEFAULT '',
        password_hash TEXT,
        data TEXT NOT NULL,
        legacy INTEGER NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        last_access BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_configs_last_access ON configs(last_access);

    CREATE TABLE IF NOT EXISTS playlists (
        key TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        data TEXT,
        channels INTEGER NOT NULL DEFAULT 0,
        updated_at BIGINT,
        last_error TEXT,
        last_used BIGINT
    );

    CREATE TABLE IF NOT EXISTS epg_sources (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        last_error TEXT,
        updated_at BIGINT,
        last_used BIGINT,
        channels INTEGER NOT NULL DEFAULT 0,
        programs INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER
    );

    -- source_id negativo = dati in staging durante un aggiornamento (scambio atomico a fine import)
    CREATE TABLE IF NOT EXISTS epg_channels (
        source_id INTEGER NOT NULL,
        channel_id TEXT NOT NULL,
        name_key TEXT,
        icon TEXT,
        PRIMARY KEY (source_id, channel_id)
    );
    CREATE INDEX IF NOT EXISTS idx_epg_channels_name ON epg_channels(name_key);

    CREATE TABLE IF NOT EXISTS epg_programs (
        source_id INTEGER NOT NULL,
        channel_id TEXT NOT NULL,
        start_time BIGINT NOT NULL,
        stop_time BIGINT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_epg_programs_lookup ON epg_programs(channel_id, start_time);
    CREATE INDEX IF NOT EXISTS idx_epg_programs_source ON epg_programs(source_id);
    CREATE INDEX IF NOT EXISTS idx_epg_programs_stop ON epg_programs(stop_time);
`;

const MIGRATIONS: string[] = [SCHEMA_V1];

function splitStatements(sql: string): string[] {
    return sql
        .split('\n')
        .filter(l => !l.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map(s => s.trim())
        .filter(Boolean);
}

async function migrate(db: Db): Promise<void> {
    await db.run('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
    const row = await db.get<{ version: number }>('SELECT version FROM schema_version');
    const current = row ? Number(row.version) : 0;
    for (let v = current; v < MIGRATIONS.length; v++) {
        const statements: Statement[] = splitStatements(MIGRATIONS[v]).map(sql => ({ sql }));
        statements.push(v === 0 && !row
            ? { sql: 'INSERT INTO schema_version (version) VALUES (?)', params: [v + 1] }
            : { sql: 'UPDATE schema_version SET version = ?', params: [v + 1] });
        await db.batch(statements);
    }
}

// ---------------------------------------------------------------- PostgreSQL

function toPgSql(sql: string): string {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

async function openPostgres(url: string): Promise<Db> {
    const { default: pg } = await import('pg');
    // BIGINT (20) e COUNT(*) arrivano come stringa: i timestamp in ms stanno comodamente in un Number
    pg.types.setTypeParser(20, v => parseInt(v, 10));
    const ssl = /sslmode=(require|verify)/.test(url) ? { rejectUnauthorized: !/sslmode=require/.test(url) } : undefined;
    const pool = new pg.Pool({ connectionString: url, max: 10, ssl });
    pool.on('error', e => console.error('PostgreSQL pool error:', e.message));

    const db: Db = {
        kind: 'postgres',
        async all<T>(sql: string, params: Param[] = []) {
            return (await pool.query(toPgSql(sql), params)).rows as T[];
        },
        async get<T>(sql: string, params: Param[] = []) {
            return (await pool.query(toPgSql(sql), params)).rows[0] as T | undefined;
        },
        async run(sql: string, params: Param[] = []) {
            return (await pool.query(toPgSql(sql), params)).rowCount ?? 0;
        },
        async batch(statements: Statement[]) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                for (const s of statements) await client.query(toPgSql(s.sql), s.params || []);
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK').catch(() => undefined);
                throw e;
            } finally {
                client.release();
            }
        },
        async insertMany(table: string, columns: string[], rows: Param[][]) {
            if (!rows.length) return;
            // Un INSERT multi-riga per blocco (limite Postgres: 65535 parametri)
            const perChunk = Math.max(1, Math.floor(60000 / columns.length));
            const statements: Statement[] = [];
            for (let i = 0; i < rows.length; i += perChunk) {
                const chunk = rows.slice(i, i + perChunk);
                const placeholders = chunk.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
                statements.push({
                    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
                    params: chunk.flat()
                });
            }
            await db.batch(statements);
        },
        async close() {
            await pool.end();
        }
    };
    return db;
}

// ---------------------------------------------------------------- istanza globale

let instance: Db | null = null;

/** Apre il DB (DATABASE_URL) ed esegue le migrazioni. */
export async function initDatabase(url = env.databaseUrl): Promise<Db> {
    if (!/^postgres(ql)?:\/\//.test(url)) {
        throw new Error('DATABASE_URL is required, e.g. postgres://user:password@host:5432/omg');
    }
    if (instance) await instance.close();
    instance = await openPostgres(url);
    await migrate(instance);
    return instance;
}

export function db(): Db {
    if (!instance) throw new Error('Database not initialised: call initDatabase() first');
    return instance;
}

export async function closeDatabase(): Promise<void> {
    if (instance) await instance.close();
    instance = null;
}

export async function getSetting(key: string): Promise<string | null> {
    const row = await db().get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : null;
}

export async function setSetting(key: string, value: string | null): Promise<void> {
    if (value === null) {
        await db().run('DELETE FROM settings WHERE key = ?', [key]);
    } else {
        await db().run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, value]);
    }
}
