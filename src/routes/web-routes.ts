import { Router, type Request, type Response, type NextFunction } from 'express';
import { env } from '../env';
import * as logger from '../logger';
import { db } from '../db';
import { setSetting } from '../db';
import { enqueue, deleteSources, epgTotals, isQueued, listSources } from '../epg/epg-service';
import { gcPlaylists, getPlaylist, listPlaylists } from '../playlist/playlist-service';
import { generatedSourceUrl } from '../python/paths';
import { RESOLVER_TEMPLATE } from '../python/resolver-template';
import { invalidatePythonSetting, isPythonAllowed } from '../python/sandbox';
import { applySchedules, disposeRuntime, getRuntime, runtimeCount } from '../runtime';
import {
    adminPasswordFromEnv, adminSessionVersion, checkAdminPassword, gateHash, gateVersion, setAdminPassword
} from '../security/admin';
import { hashPassword, verifyPassword } from '../security/crypto';
import {
    clientIp, getUnlockedConfigs, hasGateSession, htmlSecurityHeaders, isAdmin, lockConfig, publicBase,
    requireJson, setAdminSession, setGateSession, unlockConfig, ADMIN_COOKIE
} from '../security/http';
import { createLimiter, loginLimiter } from '../security/rate-limit';
import {
    checkConfigPassword, ConfigValidationError, createConfig, DEFAULT_CONFIG, deleteConfigs, getConfig, listConfigs,
    normalizeConfig, passwordVersion, setConfigPassword, updateConfig, type ConfigRecord
} from '../store/config-store';
import type { UserConfig } from '../types';
import { detectProxy, proxyLabel } from '../addon/proxy';
import { render } from '../web/jsx';
import { AdminPage } from '../web/pages/Admin';
import { AdminLoginPage, ConfigLoginPage, GatePage, HomePage } from '../web/pages/Auth';
import { ConfigEditorPage } from '../web/pages/ConfigEditor';

export const webRouter = Router();

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
/** Inoltra gli errori asincroni a Express (Express 4 non lo fa da solo). */
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
};

function page(res: Response, html: JSX.Element): void {
    htmlSecurityHeaders(res);
    res.type('html').send(render(html));
}

function fail(res: Response, status: number, message: string): void {
    res.status(status).json({ success: false, message });
}

function manifestUrl(req: Request, id: string): string {
    return `${publicBase(req)}/c/${id}/manifest.json`;
}

async function gateRequired(): Promise<boolean> {
    return !!(await gateHash());
}

async function gateOk(req: Request): Promise<boolean> {
    return !(await gateRequired()) || hasGateSession(req, await gateVersion());
}

/** Configurazione sbloccata da questo browser (cookie firmato) oppure admin. */
async function authorizedConfig(req: Request): Promise<ConfigRecord | null> {
    const record = await getConfig(req.params.id);
    if (!record) return null;
    const unlocked = getUnlockedConfigs(req)[record.id];
    if (unlocked && unlocked === passwordVersion(record)) return record;
    if (isAdmin(req, await adminSessionVersion())) return record;
    return null;
}

function limited(req: Request, res: Response, scope: string): boolean {
    if (loginLimiter.hit(`${scope}:${clientIp(req)}`)) return false;
    fail(res, 429, 'Too many attempts, try again later');
    return true;
}

/** I campi assenti nel form (es. sezione Python nascosta) mantengono il valore salvato. */
function mergeConfig(existing: UserConfig, input: Record<string, unknown>): UserConfig {
    return normalizeConfig({ ...existing, ...input }, { strict: true });
}

function validationMessage(e: unknown): string | null {
    return e instanceof ConfigValidationError ? e.message : null;
}

// ---------------------------------------------------------------- pagine

webRouter.get('/', wrap(async (_req, res) => {
    page(res, HomePage({ gateRequired: await gateRequired() }));
}));

webRouter.get('/new', wrap(async (req, res) => {
    if (!(await gateOk(req))) return page(res, GatePage({ returnUrl: '/new' }));
    page(res, ConfigEditorPage({
        mode: 'new', config: DEFAULT_CONFIG, pythonAllowed: await isPythonAllowed(), streamMaskingAvailable: env.streamMasking
    }));
}));

webRouter.get('/c/:id/configure', wrap(async (req, res) => {
    const record = await getConfig(req.params.id);
    if (!record) return void res.redirect('/');
    const authorized = await authorizedConfig(req);
    if (!authorized) return page(res, ConfigLoginPage({ id: record.id, legacy: record.legacy }));
    page(res, ConfigEditorPage({
        mode: 'edit',
        id: record.id,
        label: record.label === 'legacy' && record.legacy ? '' : record.label,
        config: record.config,
        manifestUrl: manifestUrl(req, record.id),
        pythonAllowed: await isPythonAllowed(),
        streamMaskingAvailable: env.streamMasking,
        created: req.query.created === '1'
    }));
}));

/** Vecchio link "Configura" di Stremio: precompila una nuova configurazione da migrare. */
webRouter.get('/:legacy/configure', wrap(async (req, res, next) => {
    let decoded: Record<string, string>;
    try {
        const text = Buffer.from(req.params.legacy, 'base64').toString('utf8');
        if (!text.includes('m3u=')) return next();
        decoded = Object.fromEntries(new URLSearchParams(text));
    } catch {
        return next();
    }
    if (!(await gateOk(req))) return page(res, GatePage({ returnUrl: req.path }));
    page(res, ConfigEditorPage({
        mode: 'new', config: normalizeConfig(decoded), pythonAllowed: await isPythonAllowed(), streamMaskingAvailable: env.streamMasking
    }));
}));

webRouter.get('/admin', wrap(async (req, res) => {
    if (!isAdmin(req, await adminSessionVersion())) return page(res, AdminLoginPage());
    const [configs, epg, playlists, totals] = await Promise.all([listConfigs(), listSources(), listPlaylists(), epgTotals()]);
    const up = process.uptime();
    page(res, AdminPage({
        configs,
        epg,
        playlists,
        queued: epg.map(s => Number(s.id)).filter(isQueued),
        stats: {
            uptime: up > 86400 ? `${Math.floor(up / 86400)}d ${Math.floor((up % 86400) / 3600)}h` : `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m`,
            memoryMb: Math.round(process.memoryUsage().rss / 1048576),
            dbKind: db().kind,
            runtimes: runtimeCount(),
            programs: totals.programs
        },
        settings: {
            gateEnabled: await gateRequired(),
            pythonEnabled: await isPythonAllowed(),
            pythonEnvEnabled: env.pythonEnabled,
            streamMasking: env.streamMasking,
            originProtected: !!env.originSecret,
            publicBaseUrl: env.publicBaseUrl,
            legacyUrls: env.allowLegacyUrls,
            privateUrls: env.allowPrivateUrls
        }
    }));
}));

webRouter.get('/api/resolver-template', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="resolver_script.py"');
    res.type('text/plain').send(RESOLVER_TEMPLATE);
});

webRouter.get('/health', wrap(async (_req, res) => {
    let dbOk = true;
    try {
        await db().get('SELECT 1 AS ok');
    } catch {
        dbOk = false;
    }
    res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'db_error', uptime: Math.round(process.uptime()) });
}));

// ---------------------------------------------------------------- API utente

const api = Router();
api.use(requireJson);

api.post('/gate', wrap(async (req, res) => {
    if (limited(req, res, 'gate')) return;
    const hash = await gateHash();
    if (hash && !verifyPassword(String(req.body?.password || ''), hash)) return fail(res, 401, 'wrong_password');
    setGateSession(req, res, await gateVersion());
    res.json({ success: true });
}));

api.post('/configs', wrap(async (req, res) => {
    if (!(await gateOk(req))) return fail(res, 403, 'gate_required');
    if (!createLimiter.hit(clientIp(req))) return fail(res, 429, 'Too many configurations created, try again later');
    const body = (req.body || {}) as Record<string, unknown>;
    if (body.password !== body.confirm) return fail(res, 400, 'password_mismatch');
    try {
        const config = normalizeConfig(body, { strict: true });
        if (config.m3u.includes('omg://generated/')) return fail(res, 400, 'invalid_url:m3u');
        const record = await createConfig(config, String(body.password || ''), String(body.label || '').trim());
        unlockConfig(req, res, record.id, passwordVersion(record));
        applySchedules(record);
        if (config.m3u) void getPlaylist(config, record.id).catch(() => undefined);
        logger.log(record.id, 'Configuration created');
        res.json({ success: true, id: record.id, manifestUrl: manifestUrl(req, record.id), configureUrl: `/c/${record.id}/configure?created=1` });
    } catch (e) {
        const msg = validationMessage(e);
        if (msg) return fail(res, 400, msg);
        throw e;
    }
}));

/** Verifica un proxy prima di salvarlo: tipo (MediaFlow/EasyProxy) e raggiungibilità. */
api.post('/proxy-test', wrap(async (req, res) => {
    if (limited(req, res, 'proxy-test')) return;
    const proxy = String(req.body?.proxy || '').trim();
    if (!/^https?:\/\//.test(proxy)) return fail(res, 400, 'invalid_url:proxy');
    const info = await detectProxy(proxy, String(req.body?.proxy_pwd || ''), true);
    res.json({ success: info.reachable, kind: info.kind, version: info.version || null, label: proxyLabel(info.kind) });
}));

api.post('/configs/:id/login', wrap(async (req, res) => {
    if (limited(req, res, `cfg:${req.params.id}`)) return;
    const record = await getConfig(req.params.id);
    if (!record || !checkConfigPassword(record, String(req.body?.password || ''))) return fail(res, 401, 'wrong_credentials');
    unlockConfig(req, res, record.id, passwordVersion(record));
    res.json({ success: true, configureUrl: `/c/${record.id}/configure` });
}));

api.post('/configs/:id/logout', (req, res) => {
    lockConfig(req, res, req.params.id);
    res.json({ success: true });
});

api.get('/configs/:id', wrap(async (req, res) => {
    const record = await authorizedConfig(req);
    if (!record) return fail(res, 401, 'unauthorized');
    res.json({ success: true, id: record.id, label: record.label, config: record.config });
}));

api.put('/configs/:id', wrap(async (req, res) => {
    const record = await authorizedConfig(req);
    if (!record) return fail(res, 401, 'unauthorized');
    const body = (req.body || {}) as Record<string, unknown>;
    try {
        const config = mergeConfig(record.config, body);
        // Una configurazione può usare solo la propria playlist generata
        const foreign = config.m3u.split(',').map(u => u.trim()).find(u => u.startsWith('omg://generated/') && u !== generatedSourceUrl(record.id));
        if (foreign) return fail(res, 400, 'invalid_url:m3u');
        const updated = await updateConfig(record.id, config, body.label !== undefined ? String(body.label).trim() : undefined) as ConfigRecord;
        applySchedules(updated);
        const sourcesChanged = config.m3u !== record.config.m3u || config.remapper_path !== record.config.remapper_path || config.id_suffix !== record.config.id_suffix;
        if (config.m3u) void getPlaylist(config, record.id, { force: sourcesChanged }).catch(() => undefined);
        res.json({ success: true });
    } catch (e) {
        const msg = validationMessage(e);
        if (msg) return fail(res, 400, msg);
        throw e;
    }
}));

api.post('/configs/:id/password', wrap(async (req, res) => {
    if (limited(req, res, `cfg:${req.params.id}`)) return;
    const record = await authorizedConfig(req);
    if (!record) return fail(res, 401, 'unauthorized');
    const { current, password, confirm } = (req.body || {}) as Record<string, string>;
    if (!record.legacy && !checkConfigPassword(record, String(current || ''))) return fail(res, 401, 'wrong_password');
    if (password !== confirm) return fail(res, 400, 'password_mismatch');
    try {
        await setConfigPassword(record.id, String(password || ''));
    } catch (e) {
        const msg = validationMessage(e);
        if (msg) return fail(res, 400, msg);
        throw e;
    }
    unlockConfig(req, res, record.id, passwordVersion((await getConfig(record.id)) as ConfigRecord));
    res.json({ success: true });
}));

api.delete('/configs/:id', wrap(async (req, res) => {
    if (limited(req, res, `cfg:${req.params.id}`)) return;
    const record = await authorizedConfig(req);
    if (!record) return fail(res, 401, 'unauthorized');
    if (!checkConfigPassword(record, String(req.body?.password || ''))) return fail(res, 401, 'wrong_password');
    await removeConfigs([record.id]);
    lockConfig(req, res, record.id);
    res.json({ success: true });
}));

api.post('/configs/:id/python', wrap(async (req, res) => {
    const record = await authorizedConfig(req);
    if (!record) return fail(res, 401, 'unauthorized');
    if (!(await isPythonAllowed())) return fail(res, 403, 'python_disabled');
    const runner = getRuntime(record.id).runner;
    const action = String(req.body?.action || '');
    const generatedUrl = generatedSourceUrl(record.id);
    if (action === 'download') {
        const url = String(req.body?.url || record.config.python_script_url || '');
        if (!url) return fail(res, 400, 'missing_url');
        if (!(await runner.downloadScript(url))) return fail(res, 500, runner.lastError || 'error');
        await updateConfig(record.id, { ...record.config, python_script_url: url });
        return res.json({ success: true });
    }
    if (action === 'execute') {
        if (!(await runner.executeScript())) return fail(res, 500, runner.lastError || 'error');
        if (record.config.m3u.includes(generatedUrl)) void getPlaylist(record.config, record.id, { force: true }).catch(() => undefined);
        return res.json({ success: true, m3uUrl: generatedUrl, publicUrl: `${publicBase(req)}/c/${record.id}/generated.m3u` });
    }
    if (action === 'status') {
        const status = runner.getStatus();
        return res.json({ ...status, m3uUrl: status.m3uExists ? generatedUrl : undefined });
    }
    fail(res, 400, 'invalid_action');
}));

api.post('/configs/:id/resolver', wrap(async (req, res) => {
    const record = await authorizedConfig(req);
    if (!record) return fail(res, 401, 'unauthorized');
    if (!(await isPythonAllowed())) return fail(res, 403, 'python_disabled');
    const resolver = getRuntime(record.id).resolver;
    const action = String(req.body?.action || '');
    if (action === 'download') {
        const url = String(req.body?.url || record.config.resolver_script || '');
        if (!url) return fail(res, 400, 'missing_url');
        if (!(await resolver.downloadScript(url))) return fail(res, 500, resolver.lastError || 'error');
        await updateConfig(record.id, { ...record.config, resolver_script: url, resolver_enabled: true });
        return res.json({ success: true });
    }
    if (action === 'check') {
        const ok = await resolver.checkScriptHealth();
        return ok ? res.json({ success: true }) : fail(res, 500, resolver.lastError || 'error');
    }
    if (action === 'clear') {
        resolver.clearCache();
        return res.json({ success: true });
    }
    if (action === 'status') return res.json(resolver.getStatus());
    fail(res, 400, 'invalid_action');
}));

// ---------------------------------------------------------------- API admin

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
    if (isAdmin(req, await adminSessionVersion())) return true;
    fail(res, 401, 'unauthorized');
    return false;
}

/** Cancella configurazioni e tutto ciò che le riguarda (script, file, playlist non più usate). */
async function removeConfigs(ids: string[]): Promise<number> {
    const n = await deleteConfigs(ids);
    ids.forEach(disposeRuntime);
    const remaining = await listConfigs();
    await gcPlaylists(remaining.map(r => r.config));
    logger.log('_', 'Deleted', n, 'configuration(s)');
    return n;
}

api.post('/admin/login', wrap(async (req, res) => {
    if (limited(req, res, 'admin')) return;
    if (!(await checkAdminPassword(String(req.body?.password || '')))) return fail(res, 401, 'wrong_password');
    setAdminSession(req, res, await adminSessionVersion());
    res.json({ success: true });
}));

api.post('/admin/logout', (_req, res) => {
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
    res.json({ success: true });
});

api.post('/admin/configs/delete', wrap(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String).slice(0, 5000) : [];
    if (!ids.length) return fail(res, 400, 'no_ids');
    res.json({ success: true, deleted: await removeConfigs(ids) });
}));

api.post('/admin/epg/:sid/refresh', wrap(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    enqueue(Number(req.params.sid));
    res.json({ success: true });
}));

api.delete('/admin/epg/:sid', wrap(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    await deleteSources([Number(req.params.sid)]);
    res.json({ success: true });
}));

api.post('/admin/settings', wrap(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const body = (req.body || {}) as Record<string, unknown>;
    if (body.gate_enabled) {
        const pwd = String(body.gate_password || '');
        if (pwd) {
            if (pwd.length < 4) return fail(res, 400, 'password_too_short');
            await setSetting('gate_password_hash', hashPassword(pwd));
        } else if (!(await gateHash())) {
            return fail(res, 400, 'gate_password_required');
        }
    } else {
        await setSetting('gate_password_hash', null);
    }
    if (env.pythonEnabled) {
        await setSetting('python_enabled', body.python_enabled ? '1' : '0');
        invalidatePythonSetting();
    }
    res.json({ success: true });
}));

api.post('/admin/password', wrap(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (adminPasswordFromEnv()) return fail(res, 400, 'admin_password_from_env');
    if (limited(req, res, 'admin')) return;
    const { current, password } = (req.body || {}) as Record<string, string>;
    if (!(await checkAdminPassword(String(current || '')))) return fail(res, 401, 'wrong_password');
    if (!password || password.length < 8) return fail(res, 400, 'password_too_short');
    await setAdminPassword(password);
    setAdminSession(req, res, await adminSessionVersion());
    res.json({ success: true });
}));

webRouter.use('/api', api);
