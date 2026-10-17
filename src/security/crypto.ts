import crypto from 'crypto';
import { env } from '../env';
import { getSetting, setSetting } from '../db';

/** Hash password con scrypt: "scrypt$N$r$p$salt$hash" (hex). */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
    return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('hex'), hash.toString('hex')].join('$');
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
    if (!stored || typeof password !== 'string') return false;
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, saltHex, hashHex] = parts;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
        N: parseInt(n, 10), r: parseInt(r, 10), p: parseInt(p, 10)
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** Id configurazione: 16 byte casuali in base64url (22 caratteri), non indovinabile. */
export function newConfigId(): string {
    return crypto.randomBytes(16).toString('base64url');
}

export function randomPassword(length = 20): string {
    return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

let cachedSecret: Buffer | null = null;

/** Carica il segreto applicativo: da APP_SECRET oppure generato al primo avvio e salvato nel DB. */
export async function initAppSecret(): Promise<void> {
    let secret = env.appSecret;
    if (!secret) {
        secret = (await getSetting('app_secret')) || '';
        if (!secret) {
            secret = crypto.randomBytes(32).toString('hex');
            await setSetting('app_secret', secret);
        }
    }
    cachedSecret = crypto.createHash('sha256').update(secret).digest();
}

export function appSecret(): Buffer {
    if (!cachedSecret) throw new Error('App secret not initialised: call initAppSecret() first');
    return cachedSecret;
}

function subKey(purpose: string): Buffer {
    return crypto.createHmac('sha256', appSecret()).update(purpose).digest();
}

/** Valore firmato con scadenza: base64url(payload).base64url(hmac) */
export function sign(payload: object, ttlMs: number, purpose: string): string {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString('base64url');
    const mac = crypto.createHmac('sha256', subKey(purpose)).update(body).digest('base64url');
    return `${body}.${mac}`;
}

export function unsign<T extends object>(token: string | undefined, purpose: string): T | null {
    if (!token || typeof token !== 'string') return null;
    const [body, mac] = token.split('.');
    if (!body || !mac) return null;
    const expected = crypto.createHmac('sha256', subKey(purpose)).update(body).digest();
    const given = Buffer.from(mac, 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    try {
        const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp?: number };
        if (!data.exp || Date.now() > data.exp) return null;
        return data;
    } catch {
        return null;
    }
}

/**
 * Cifratura AES-256-GCM: a differenza della firma, il contenuto (es. URL dello stream con
 * password del proxy) non è leggibile da chi vede il token.
 */
export function encrypt(payload: object, ttlMs: number, purpose: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', subKey(purpose), iv);
    const plain = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }));
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
}

export function decrypt<T extends object>(token: string | undefined, purpose: string): T | null {
    if (!token) return null;
    try {
        const raw = Buffer.from(token, 'base64url');
        if (raw.length < 29) return null;
        const decipher = crypto.createDecipheriv('aes-256-gcm', subKey(purpose), raw.subarray(0, 12));
        decipher.setAuthTag(raw.subarray(12, 28));
        const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
        const data = JSON.parse(plain.toString('utf8')) as T & { exp?: number };
        if (!data.exp || Date.now() > data.exp) return null;
        return data;
    } catch {
        return null;
    }
}

export function sha256(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}
