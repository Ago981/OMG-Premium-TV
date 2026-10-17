import fs from 'fs';
import { createApp } from './app';
import { closeDatabase, initDatabase } from './db';
import { env } from './env';
import * as epg from './epg/epg-service';
import * as logger from './logger';
import { gcPlaylists, sweepMemory } from './playlist/playlist-service';
import { checkEgress } from './http-client';
import { restoreSchedules } from './runtime';
import { initAdminPassword } from './security/admin';
import { initAppSecret } from './security/crypto';
import { listConfigs } from './store/config-store';

function every(ms: number, task: () => Promise<unknown> | void, name: string): void {
    setInterval(() => {
        Promise.resolve(task()).catch(e => logger.error('_', `${name} failed:`, logger.errMsg(e)));
    }, ms).unref();
}

async function main(): Promise<void> {
    fs.mkdirSync(env.dataDir, { recursive: true });
    const database = await initDatabase();
    logger.log('_', `Database: ${database.kind}`);
    await initAppSecret();
    await initAdminPassword();
    await epg.resetInterrupted();
    await restoreSchedules();

    // Scheduler: EPG condivisi, pulizia programmi/sorgenti, playlist non più usate
    every(5 * 60 * 1000, () => epg.refreshStaleSources(), 'EPG refresh');
    every(60 * 60 * 1000, () => epg.cleanup(), 'EPG cleanup');
    every(5 * 60 * 1000, () => sweepMemory(), 'Playlist memory sweep');
    every(6 * 60 * 60 * 1000, async () => gcPlaylists((await listConfigs()).map(r => r.config)), 'Playlist GC');
    setTimeout(() => void epg.refreshStaleSources().catch(() => undefined), 10000).unref();

    // Da dove esce il server: con OUTBOUND_PROXY verso WARP deve risultare warp=on
    const reportEgress = async () => {
        const st = await checkEgress();
        if (!st.ok) logger.error('_', `Outbound check FAILED via ${st.via}: ${st.error}`);
        else if (env.outboundProxy && !st.warp) logger.warn('_', `Outbound via ${st.via}, exit IP ${st.ip} (not WARP)`);
        else logger.log('_', `Outbound via ${st.via}${st.warp ? ' (Cloudflare WARP)' : ''}, exit IP ${st.ip}`);
    };
    if (env.outboundProxyRequired && !env.outboundProxy) {
        logger.error('_', 'OUTBOUND_PROXY_REQUIRED=true but OUTBOUND_PROXY is not set: every outbound request will fail');
    }
    void reportEgress();
    every(10 * 60 * 1000, reportEgress, 'Outbound check');

    const server = createApp().listen(env.port, env.host, () => {
        logger.log('_', `OMG addon started on http://${env.host}:${env.port}` + (env.publicBaseUrl ? ` — public URL ${env.publicBaseUrl}` : ''));
        if (!env.publicBaseUrl) logger.warn('_', 'PUBLIC_BASE_URL not set: URLs are built from the request Host header');
    });

    const shutdown = (signal: string) => {
        logger.log('_', `${signal} received, shutting down`);
        server.close(() => {
            closeDatabase().finally(() => process.exit(0));
        });
        setTimeout(() => process.exit(0), 10000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(e => {
    console.error('Fatal startup error:', e);
    process.exit(1);
});
