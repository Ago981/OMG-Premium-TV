import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../env';
import { sign, unsign } from './crypto';

/** IP del client reale: dietro Cloudflare è in CF-Connecting-IP. */
export function clientIp(req: Request): string {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf) return cf;
    return req.ip || req.socket.remoteAddress || 'unknown';
}

function isLoopback(req: Request): boolean {
    const addr = req.socket.remoteAddress || '';
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function safeEqual(a: string, b: string): boolean {
    const ha = crypto.createHash('sha256').update(a).digest();
    const hb = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
}

/**
 * Con ORIGIN_SECRET impostato accetta solo richieste che passano dal Worker/regola Cloudflare
 * (header X-Origin-Secret). Le richieste da localhost (healthcheck Docker) sono sempre ammesse.
 */
export function originGuard(req: Request, res: Response, next: NextFunction): void {
    if (!env.originSecret || isLoopback(req)) return next();
    const given = req.headers['x-origin-secret'];
    if (typeof given === 'string' && safeEqual(given, env.originSecret)) return next();
    res.status(403).type('text/plain').send('Forbidden');
}

/** Base URL pubblico: PUBLIC_BASE_URL se impostato, altrimenti dedotto dagli header. */
export function publicBase(req: Request): string {
    if (env.publicBaseUrl) return env.publicBaseUrl;
    const proto = (req.headers['x-forwarded-proto'] as string || req.protocol || 'http').split(',')[0].trim();
    const host = (req.headers['x-forwarded-host'] as string || req.get('host') || 'localhost').split(',')[0].trim();
    return `${proto}://${host}`;
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
}

/** Header per le pagine HTML (non per le risposte JSON dell'addon). */
export function htmlSecurityHeaders(res: Response): void {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' https: data:",
        "media-src https:",
        "connect-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "base-uri 'none'"
    ].join('; '));
    res.setHeader('Cache-Control', 'no-store');
}

/** CORS aperto solo per le rotte dell'addon (Stremio Web e app lo richiedono). */
export function addonCors(req: Request, res: Response, next: NextFunction): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    next();
}

/** Le API con cookie accettano solo JSON: un form di un altro sito non può inviarlo senza preflight CORS. */
export function requireJson(req: Request, res: Response, next: NextFunction): void {
    if (req.method !== 'GET' && !req.is('application/json')) {
        res.status(415).json({ success: false, message: 'Content-Type must be application/json' });
        return;
    }
    next();
}

// ---------------------------------------------------------------- sessioni a cookie

export const ADMIN_COOKIE = 'omg_admin';
export const CONFIG_COOKIE = 'omg_cfg';
export const GATE_COOKIE = 'omg_gate';
const DAY = 24 * 60 * 60 * 1000;

function cookieOptions(req: Request, maxAge: number, sameSite: 'strict' | 'lax') {
    const secure = publicBase(req).startsWith('https://');
    return { httpOnly: true, secure, sameSite, path: '/', maxAge };
}

export function setAdminSession(req: Request, res: Response, version: string): void {
    res.cookie(ADMIN_COOKIE, sign({ adm: 1, v: version }, DAY, 'admin-session'), cookieOptions(req, DAY, 'strict'));
}

export function isAdmin(req: Request, version: string): boolean {
    const data = unsign<{ adm: number; v: string }>(req.cookies?.[ADMIN_COOKIE], 'admin-session');
    return !!data && data.adm === 1 && data.v === version;
}

/** Il cookie di configurazione contiene la lista degli id sbloccati (max 10). */
export function getUnlockedConfigs(req: Request): Record<string, string> {
    const data = unsign<{ ids: Record<string, string> }>(req.cookies?.[CONFIG_COOKIE], 'config-session');
    return data && data.ids && typeof data.ids === 'object' ? data.ids : {};
}

/** version = impronta dell'hash password: cambiando password le sessioni precedenti decadono. */
export function unlockConfig(req: Request, res: Response, id: string, version: string): void {
    const ids = { ...getUnlockedConfigs(req), [id]: version };
    const keys = Object.keys(ids);
    while (keys.length > 10) delete ids[keys.shift() as string];
    res.cookie(CONFIG_COOKIE, sign({ ids }, 30 * DAY, 'config-session'), cookieOptions(req, 30 * DAY, 'lax'));
}

export function lockConfig(req: Request, res: Response, id: string): void {
    const ids = { ...getUnlockedConfigs(req) };
    delete ids[id];
    res.cookie(CONFIG_COOKIE, sign({ ids }, 30 * DAY, 'config-session'), cookieOptions(req, 30 * DAY, 'lax'));
}

export function setGateSession(req: Request, res: Response, version: string): void {
    res.cookie(GATE_COOKIE, sign({ g: 1, v: version }, 7 * DAY, 'gate-session'), cookieOptions(req, 7 * DAY, 'lax'));
}

export function hasGateSession(req: Request, version: string): boolean {
    const data = unsign<{ g: number; v: string }>(req.cookies?.[GATE_COOKIE], 'gate-session');
    return !!data && data.v === version;
}
