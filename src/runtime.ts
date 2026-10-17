import fs from 'fs';
import { env } from './env';
import * as logger from './logger';
import { getPlaylist } from './playlist/playlist-service';
import { PythonResolver } from './python/python-resolver';
import { PythonRunner } from './python/python-runner';
import { configWorkDir } from './python/paths';
import type { ConfigRecord } from './store/config-store';
import { listActiveConfigs } from './store/config-store';

/**
 * Stato in memoria di ogni configurazione (script Python e loro pianificazioni).
 * Playlist ed EPG invece sono condivisi tra configurazioni e vivono nei rispettivi servizi.
 */
export interface Runtime {
    runner: PythonRunner;
    resolver: PythonResolver;
}

const runtimes = new Map<string, Runtime>();

export function getRuntime(id: string): Runtime {
    let rt = runtimes.get(id);
    if (!rt) {
        rt = { runner: new PythonRunner(id), resolver: new PythonResolver(id) };
        runtimes.set(id, rt);
    }
    return rt;
}

/** Applica le pianificazioni salvate nella configurazione (all'avvio e dopo ogni salvataggio). */
export function applySchedules(record: ConfigRecord): void {
    const { config } = record;
    const rt = getRuntime(record.id);
    rt.runner.setScriptUrl(config.python_script_url);
    if (config.python_script_url && config.python_update_interval) {
        rt.runner.scheduleUpdate(config.python_update_interval, () => getPlaylist(config, record.id, { force: true }));
    } else {
        rt.runner.stopScheduledUpdates();
    }
    if (config.resolver_enabled && config.resolver_script && config.resolver_update_interval) {
        rt.resolver.scriptUrl = config.resolver_script;
        rt.resolver.scheduleUpdate(config.resolver_update_interval);
    } else {
        rt.resolver.stopScheduledUpdates();
    }
}

/** Ferma tutto e rimuove i file della configurazione (alla cancellazione). */
export function disposeRuntime(id: string): void {
    const rt = runtimes.get(id);
    if (rt) {
        rt.runner.dispose();
        rt.resolver.dispose();
        runtimes.delete(id);
    }
    try {
        fs.rmSync(configWorkDir(id), { recursive: true, force: true });
    } catch (e) {
        logger.error(id, 'Work dir removal error:', logger.errMsg(e));
    }
}

export async function restoreSchedules(): Promise<void> {
    const active = await listActiveConfigs(env.activeConfigDays);
    let n = 0;
    for (const rec of active) {
        if (rec.config.python_update_interval || rec.config.resolver_update_interval) {
            applySchedules(rec);
            n++;
        }
    }
    if (n) logger.log('_', 'Restored schedules for', n, 'configuration(s)');
}

export function runtimeCount(): number {
    return runtimes.size;
}
