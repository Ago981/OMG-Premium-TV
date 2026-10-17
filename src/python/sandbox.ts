import { execFile } from 'child_process';
import fs from 'fs';
import { env } from '../env';
import { getSetting } from '../db';

export interface RunResult {
    stdout: string;
    stderr: string;
}

/**
 * Esegue uno script Python con:
 *  - execFile (nessuna shell: niente iniezione di comandi tramite percorsi/argomenti)
 *  - cartella di lavoro dedicata alla configurazione
 *  - timeout e limite di output
 *  - ambiente ripulito: lo script NON vede DATABASE_URL, ADMIN_PASSWORD, APP_SECRET ecc.
 */
export function runPython(script: string, args: string[], cwd: string, timeoutSec: number): Promise<RunResult> {
    fs.mkdirSync(cwd, { recursive: true });
    const childEnv: NodeJS.ProcessEnv = {
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        HOME: cwd,
        TMPDIR: cwd,
        LANG: process.env.LANG || 'C.UTF-8',
        PYTHONIOENCODING: 'utf-8',
        PYTHONDONTWRITEBYTECODE: '1'
    };
    if (process.env.HTTP_PROXY) childEnv.HTTP_PROXY = process.env.HTTP_PROXY;
    if (process.env.HTTPS_PROXY) childEnv.HTTPS_PROXY = process.env.HTTPS_PROXY;
    return new Promise((resolve, reject) => {
        execFile(env.pythonBin, [script, ...args], {
            cwd,
            env: childEnv,
            timeout: timeoutSec * 1000,
            killSignal: 'SIGKILL',
            maxBuffer: 10 * 1024 * 1024,
            windowsHide: true
        }, (err, stdout, stderr) => {
            if (err) {
                const e = err as NodeJS.ErrnoException & { killed?: boolean };
                const reason = e.killed ? `timeout after ${timeoutSec}s` : (stderr.trim().split('\n').pop() || e.message);
                reject(new Error(reason));
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}

let cachedAllowed: { value: boolean; at: number } | null = null;

/** Python abilitato da env (PYTHON_ENABLED) e non disattivato dall'admin. */
export async function isPythonAllowed(): Promise<boolean> {
    if (!env.pythonEnabled) return false;
    if (cachedAllowed && Date.now() - cachedAllowed.at < 30000) return cachedAllowed.value;
    const value = (await getSetting('python_enabled')) !== '0';
    cachedAllowed = { value, at: Date.now() };
    return value;
}

export function invalidatePythonSetting(): void {
    cachedAllowed = null;
}
