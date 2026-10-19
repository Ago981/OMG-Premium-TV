import { Router, type Request, type Response } from 'express';
import { env } from '../env';
import * as logger from '../logger';
import { addonCors, publicBase } from '../security/http';
import { decrypt } from '../security/crypto';
import { getConfig, normalizeConfig, touchConfig, upsertLegacyConfig, type ConfigRecord } from '../store/config-store';
import { getRuntime } from '../runtime';
import { catalogHandler, manifestHandler, metaHandler, parseExtra, streamHandler } from '../addon/handlers';

/**
 * Rotte Stremio. L'URL da installare è semplicemente /c/<id>/manifest.json:
 * nessun parametro della configurazione compare nell'indirizzo.
 */
export const addonRouter = Router();

function sendJson(res: Response, body: unknown, cacheSeconds = 0): void {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', cacheSeconds ? `max-age=${cacheSeconds}` : 'no-store');
    res.send(JSON.stringify(body));
}

async function loadRecord(req: Request, res: Response): Promise<ConfigRecord | null> {
    const record = await getConfig(req.params.cid);
    if (!record) {
        res.status(404).json({ error: 'Configuration not found' });
        return null;
    }
    void touchConfig(record.id).catch(() => undefined);
    return record;
}

/** Rimuove ".json" finale e restituisce [tipo, id, extra] dal resto del path (non decodificato). */
function splitResource(rawPath: string, resource: string): { type: string; id: string; extra?: string } | null {
    const marker = `/${resource}/`;
    const idx = rawPath.indexOf(marker);
    if (idx < 0) return null;
    const parts = rawPath.slice(idx + marker.length).replace(/\.json$/, '').split('/');
    if (parts.length < 2) return null;
    const dec = (s: string) => {
        try {
            return decodeURIComponent(s);
        } catch {
            return s;
        }
    };
    return { type: dec(parts[0]), id: dec(parts[1]), extra: parts[2] };
}

async function handle(record: ConfigRecord, req: Request, res: Response, resource: string): Promise<void> {
    const ctx = { record, baseUrl: publicBase(req) };
    const parsed = splitResource(req.path, resource);
    try {
        if (resource === 'manifest') return sendJson(res, await manifestHandler(ctx));
        if (!parsed) return void res.status(404).json({ error: 'Not found' });
        if (resource === 'catalog') return sendJson(res, await catalogHandler(ctx, parseExtra(parsed.extra), parsed.type), 60);
        if (resource === 'meta') return sendJson(res, await metaHandler(ctx, parsed.id), 60);
        if (resource === 'stream') return sendJson(res, await streamHandler(ctx, parsed.id, parsed.type));
    } catch (e) {
        logger.error(record.id, `Error handling ${resource}:`, logger.errMsg(e));
        res.status(500).json({ error: 'Internal server error' });
    }
}

addonRouter.use(['/c/:cid/manifest.json', '/c/:cid/catalog', '/c/:cid/meta', '/c/:cid/stream'], addonCors);

addonRouter.get('/c/:cid/manifest.json', async (req, res) => {
    const record = await loadRecord(req, res);
    if (record) await handle(record, req, res, 'manifest');
});

for (const resource of ['catalog', 'meta', 'stream']) {
    addonRouter.get(`/c/:cid/${resource}/*`, async (req, res) => {
        const record = await loadRecord(req, res);
        if (record) await handle(record, req, res, resource);
    });
}

/** Playlist generata dallo script Python (utile anche fuori da Stremio). */
addonRouter.get('/c/:cid/generated.m3u', async (req, res) => {
    const record = await loadRecord(req, res);
    if (!record) return;
    const content = getRuntime(record.id).runner.getM3UContent();
    if (!content) return void res.status(404).type('text/plain').send('M3U file not found. Run the Python script first.');
    res.type('text/plain').send(content);
});

/**
 * Stream mascherato: il token è cifrato (AES-GCM) e contiene l'URL reale.
 * Chi vede la risposta dell'addon vede solo questo server, non il proxy né la sua password.
 */
addonRouter.get('/s/:token', (req, res) => {
    const data = decrypt<{ u: string; c: string }>(req.params.token, 'stream');
    if (!data || !/^https?:\/\//.test(data.u)) return void res.status(410).type('text/plain').send('Stream link expired');
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, data.u);
});

// ---------------------------------------------------------------- vecchi URL /<base64>/...

function decodeLegacy(raw: string): Record<string, string> | null {
    if (!/^[A-Za-z0-9+/=_-]{8,}$/.test(raw)) return null;
    try {
        const text = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        if (!text.includes('m3u=')) return null;
        return Object.fromEntries(new URLSearchParams(text));
    } catch {
        return null;
    }
}

/**
 * Compatibilità con le installazioni esistenti: la config codificata nell'URL viene salvata come
 * configurazione "legacy" (visibile e cancellabile dall'admin) e servita normalmente.
 * La pagina /<base64>/configure porta alla creazione di una nuova configurazione con password.
 */
addonRouter.get(['/:legacy/manifest.json', '/:legacy/catalog/*', '/:legacy/meta/*', '/:legacy/stream/*'], async (req, res, next) => {
    const decoded = decodeLegacy(req.params.legacy);
    if (!decoded) return next();
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (!env.allowLegacyUrls) return void res.status(410).json({ error: 'Legacy configuration URLs are disabled: create a new configuration' });
    const record = await upsertLegacyConfig(normalizeConfig(decoded));
    void touchConfig(record.id).catch(() => undefined);
    const resource = req.path.endsWith('/manifest.json') ? 'manifest' : req.path.split('/')[2];
    if (resource === 'manifest') {
        const manifest = await manifestHandler({ record, baseUrl: publicBase(req) });
        (manifest.behaviorHints as Record<string, unknown>).configurationURL = `${publicBase(req)}/${req.params.legacy}/configure`;
        return sendJson(res, manifest);
    }
    await handle(record, req, res, resource);
});
