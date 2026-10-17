import { env } from '../env';
import { getSetting, setSetting } from '../db';
import { hashPassword, randomPassword, sha256, verifyPassword } from './crypto';

/**
 * Password admin: ADMIN_PASSWORD se impostata (non modificabile dal pannello), altrimenti hash nel DB.
 * Al primo avvio senza password ne viene generata una casuale e stampata UNA volta nel log.
 */

export async function initAdminPassword(): Promise<void> {
    if (env.adminPassword) return;
    if (await getSetting('admin_password_hash')) return;
    const generated = randomPassword(20);
    await setSetting('admin_password_hash', hashPassword(generated));
    console.log('==================================================================');
    console.log(' Admin panel: /admin');
    console.log(` Generated admin password: ${generated}`);
    console.log(' Change it from the panel or set ADMIN_PASSWORD.');
    console.log('==================================================================');
}

export function adminPasswordFromEnv(): boolean {
    return !!env.adminPassword;
}

export async function checkAdminPassword(password: string): Promise<boolean> {
    if (env.adminPassword) return verifyPassword(password, envHash());
    return verifyPassword(password, await getSetting('admin_password_hash'));
}

let cachedEnvHash: string | null = null;
function envHash(): string {
    if (!cachedEnvHash) cachedEnvHash = hashPassword(env.adminPassword);
    return cachedEnvHash;
}

export async function setAdminPassword(password: string): Promise<void> {
    await setSetting('admin_password_hash', hashPassword(password));
}

/** Cambia quando cambia la password: le sessioni admin aperte decadono. */
export async function adminSessionVersion(): Promise<string> {
    return sha256(env.adminPassword ? 'env:' + env.adminPassword : (await getSetting('admin_password_hash')) || '').slice(0, 12);
}

// ---------------------------------------------------------------- password di accesso alla creazione

export async function gateHash(): Promise<string | null> {
    return getSetting('gate_password_hash');
}

export async function gateVersion(): Promise<string> {
    return sha256((await gateHash()) || '').slice(0, 12);
}
