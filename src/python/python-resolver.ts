import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../env';
import { fetchText } from '../http-client';
import * as logger from '../logger';
import type { StreamHeaders } from '../types';
import { configWorkDir } from './paths';
import { isPythonAllowed, runPython } from './sandbox';
import { parseInterval } from '../playlist/playlist-service';

export interface ResolveResult {
    resolved_url: string;
    headers?: StreamHeaders;
}

const CACHE_TTL_MS = 20 * 60 * 1000;
const MAX_PARALLEL = 3;

/** Resolver Python degli stream, uno per configurazione, con cache dei link risolti. */
export class PythonResolver {
    readonly workDir: string;
    readonly scriptPath: string;
    private cache = new Map<string, { at: number; data: ResolveResult }>();
    private lastExecution: Date | null = null;
    lastError: string | null = null;
    scriptUrl: string | null = null;
    private timer: NodeJS.Timeout | null = null;
    private interval: string | null = null;
    private active = 0;
    private waiting: (() => void)[] = [];

    constructor(private readonly configId: string) {
        this.workDir = configWorkDir(configId);
        this.scriptPath = path.join(this.workDir, 'resolver.py');
    }

    async downloadScript(url: string): Promise<boolean> {
        if (!(await isPythonAllowed())) {
            this.lastError = 'Python scripts are disabled on this server';
            return false;
        }
        try {
            const content = await fetchText(url);
            if (!content.includes('def resolve_link') && !content.includes('def resolve_stream')) {
                this.lastError = 'Script must define resolve_link or resolve_stream';
                return false;
            }
            await fs.promises.mkdir(this.workDir, { recursive: true });
            await fs.promises.writeFile(this.scriptPath, content);
            this.scriptUrl = url;
            this.lastError = null;
            this.cache.clear();
            logger.log(this.configId, 'Resolver script downloaded');
            return true;
        } catch (e) {
            this.lastError = `Download error: ${logger.errMsg(e)}`;
            return false;
        }
    }

    /** Scarica lo script se manca o se l'URL configurato è cambiato. */
    async ensureScript(url: string): Promise<boolean> {
        if (this.scriptUrl === url && fs.existsSync(this.scriptPath)) return true;
        return this.downloadScript(url);
    }

    async checkScriptHealth(): Promise<boolean> {
        if (!fs.existsSync(this.scriptPath)) {
            this.lastError = 'Resolver script not found';
            return false;
        }
        try {
            const { stdout, stderr } = await runPython(this.scriptPath, ['--check'], this.workDir, env.resolverTimeoutSec);
            const ok = stdout.includes('resolver_ready') || stderr.includes('resolver_ready');
            if (!ok) this.lastError = 'Script did not answer resolver_ready to --check';
            return ok;
        } catch (e) {
            this.lastError = `Check error: ${logger.errMsg(e)}`;
            return false;
        }
    }

    private async acquire(): Promise<void> {
        if (this.active < MAX_PARALLEL) {
            this.active++;
            return;
        }
        await new Promise<void>(resolve => this.waiting.push(resolve));
        this.active++;
    }

    private release(): void {
        this.active--;
        this.waiting.shift()?.();
    }

    async resolveLink(url: string, headers: StreamHeaders, channelName: string,
        proxyConfig: { url: string; password: string } | null): Promise<ResolveResult | null> {
        const cacheKey = `${url}:${JSON.stringify(headers)}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
        if (!(await isPythonAllowed()) || !fs.existsSync(this.scriptPath)) return null;

        await this.acquire();
        const tag = crypto.randomBytes(6).toString('hex');
        const input = path.join(this.workDir, `input_${tag}.json`);
        const output = path.join(this.workDir, `output_${tag}.json`);
        try {
            await fs.promises.writeFile(input, JSON.stringify({ url, headers, channel_name: channelName, proxy_config: proxyConfig }));
            await runPython(this.scriptPath, ['--resolve', input, output], this.workDir, env.resolverTimeoutSec);
            const result = JSON.parse(await fs.promises.readFile(output, 'utf8')) as ResolveResult;
            if (!result || typeof result.resolved_url !== 'string') throw new Error('Invalid resolver output');
            this.cache.set(cacheKey, { at: Date.now(), data: result });
            this.lastExecution = new Date();
            this.lastError = null;
            return result;
        } catch (e) {
            this.lastError = `Execution error: ${logger.errMsg(e)}`;
            logger.error(this.configId, 'Resolver error for', channelName, logger.errMsg(e));
            return null;
        } finally {
            this.release();
            fs.rmSync(input, { force: true });
            fs.rmSync(output, { force: true });
        }
    }

    /** Riscarica periodicamente lo script (gli autori aggiornano chiavi/endpoint). */
    scheduleUpdate(interval: string): boolean {
        this.stopScheduledUpdates();
        const ms = parseInterval(interval, 0);
        if (!ms || ms < 60000) {
            this.lastError = 'Invalid interval: use HH:MM (minimum 0:01)';
            return false;
        }
        this.timer = setInterval(async () => {
            if (this.scriptUrl) await this.downloadScript(this.scriptUrl);
            this.cache.clear();
        }, ms);
        this.timer.unref();
        this.interval = interval;
        return true;
    }

    stopScheduledUpdates(): boolean {
        if (!this.timer) return false;
        clearInterval(this.timer);
        this.timer = null;
        this.interval = null;
        return true;
    }

    clearCache(): void {
        this.cache.clear();
    }

    private version(): string {
        try {
            const m = fs.readFileSync(this.scriptPath, 'utf8').match(/RESOLVER_VERSION\s*=\s*["']([^"']+)["']/);
            return m ? m[1] : 'N/A';
        } catch {
            return 'N/A';
        }
    }

    getStatus() {
        return {
            isRunning: this.active > 0,
            lastExecution: this.lastExecution ? this.lastExecution.toLocaleString('it-IT') : 'Mai',
            lastError: this.lastError,
            scriptExists: fs.existsSync(this.scriptPath),
            scriptUrl: this.scriptUrl,
            updateInterval: this.interval,
            scheduledUpdates: this.timer !== null,
            cacheItems: this.cache.size,
            resolverVersion: this.version()
        };
    }

    dispose(): void {
        this.stopScheduledUpdates();
        this.cache.clear();
    }
}
