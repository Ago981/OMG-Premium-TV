import fs from 'fs';
import path from 'path';
import { env } from '../env';
import { fetchText } from '../http-client';
import * as logger from '../logger';
import { SETTINGS_LOGO } from '../config';
import { configWorkDir, generatedPlaylistPath } from './paths';
import { isPythonAllowed, runPython } from './sandbox';
import { parseInterval } from '../playlist/playlist-service';

const REGENERATE_ENTRY = `
#EXTINF:-1 tvg-id="rigeneraplaylistpython" tvg-name="Rigenera Playlist Python" tvg-logo="${SETTINGS_LOGO}" group-title="~SETTINGS~",Rigenera Playlist Python
http://127.0.0.1/regenerate`;

export interface RunnerStatus {
    isRunning: boolean;
    lastExecution: string;
    lastError: string | null;
    m3uExists: boolean;
    scriptExists: boolean;
    scriptUrl: string | null;
    updateInterval: string | null;
    scheduledUpdates: boolean;
}

function formatDate(d: Date | null): string {
    return d ? d.toLocaleString('it-IT') : 'Mai';
}

/** Generatore di playlist tramite script Python, uno per configurazione. */
export class PythonRunner {
    readonly workDir: string;
    readonly scriptPath: string;
    readonly outputPath: string;
    private lastExecution: Date | null = null;
    lastError: string | null = null;
    private running = false;
    private scriptUrl: string | null = null;
    private timer: NodeJS.Timeout | null = null;
    private interval: string | null = null;

    constructor(private readonly configId: string) {
        this.workDir = configWorkDir(configId);
        this.scriptPath = path.join(this.workDir, 'script.py');
        this.outputPath = generatedPlaylistPath(configId);
    }

    async downloadScript(url: string): Promise<boolean> {
        if (!(await isPythonAllowed())) {
            this.lastError = 'Python scripts are disabled on this server';
            return false;
        }
        try {
            const content = await fetchText(url);
            await fs.promises.mkdir(this.workDir, { recursive: true });
            await fs.promises.writeFile(this.scriptPath, content);
            this.scriptUrl = url;
            this.lastError = null;
            logger.log(this.configId, 'Python script downloaded');
            return true;
        } catch (e) {
            this.lastError = `Download error: ${logger.errMsg(e)}`;
            logger.error(this.configId, 'Python script download error:', logger.errMsg(e));
            return false;
        }
    }

    private listM3U(): string[] {
        if (!fs.existsSync(this.workDir)) return [];
        return fs.readdirSync(this.workDir)
            .filter(f => /\.m3u8?$/i.test(f) && path.join(this.workDir, f) !== this.outputPath)
            .map(f => path.join(this.workDir, f));
    }

    /** Esegue lo script nella sua cartella e copia il file M3U prodotto in generated.m3u. */
    async executeScript(): Promise<boolean> {
        if (this.running) {
            this.lastError = 'Script already running';
            return false;
        }
        if (!(await isPythonAllowed())) {
            this.lastError = 'Python scripts are disabled on this server';
            return false;
        }
        if (!fs.existsSync(this.scriptPath)) {
            if (this.scriptUrl) await this.downloadScript(this.scriptUrl);
            if (!fs.existsSync(this.scriptPath)) {
                this.lastError = 'Python script not found: download it first';
                return false;
            }
        }
        this.running = true;
        try {
            this.listM3U().forEach(f => fs.rmSync(f, { force: true }));
            const { stdout, stderr } = await runPython(this.scriptPath, [], this.workDir, env.pythonTimeoutSec);
            if (stderr.trim()) logger.warn(this.configId, 'Python script stderr:', stderr.slice(0, 200));

            let produced = this.listM3U()[0];
            if (!produced) {
                const match = stdout.match(/[\w/\\.-]+\.m3u8?\b/);
                if (match) {
                    const candidate = path.resolve(this.workDir, match[0]);
                    if (fs.existsSync(candidate)) produced = candidate;
                }
            }
            if (!produced) {
                this.lastError = 'The script did not generate an M3U file';
                logger.error(this.configId, this.lastError);
                return false;
            }
            let content = await fs.promises.readFile(produced, 'utf8');
            if (!content.includes('tvg-id="rigeneraplaylistpython"')) content += REGENERATE_ENTRY;
            await fs.promises.writeFile(this.outputPath, content);
            this.lastExecution = new Date();
            this.lastError = null;
            logger.log(this.configId, 'Python playlist generated');
            return true;
        } catch (e) {
            this.lastError = `Execution error: ${logger.errMsg(e)}`;
            logger.error(this.configId, 'Python script execution error:', logger.errMsg(e));
            return false;
        } finally {
            this.running = false;
        }
    }

    /** "HH:MM" = ogni HH ore e MM minuti. onSuccess ricarica la playlist della configurazione. */
    scheduleUpdate(interval: string, onSuccess: () => Promise<unknown>): boolean {
        this.stopScheduledUpdates();
        const ms = parseInterval(interval, 0);
        if (!ms || ms < 60000) {
            this.lastError = 'Invalid interval: use HH:MM (minimum 0:01)';
            return false;
        }
        this.timer = setInterval(async () => {
            logger.log(this.configId, 'Scheduled Python script run');
            if (await this.executeScript()) await onSuccess().catch(() => undefined);
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

    setScriptUrl(url: string): void {
        this.scriptUrl = url || null;
    }

    getStatus(): RunnerStatus {
        return {
            isRunning: this.running,
            lastExecution: formatDate(this.lastExecution),
            lastError: this.lastError,
            m3uExists: fs.existsSync(this.outputPath),
            scriptExists: fs.existsSync(this.scriptPath),
            scriptUrl: this.scriptUrl,
            updateInterval: this.interval,
            scheduledUpdates: this.timer !== null
        };
    }

    getM3UContent(): string | null {
        return fs.existsSync(this.outputPath) ? fs.readFileSync(this.outputPath, 'utf8') : null;
    }

    dispose(): void {
        this.stopScheduledUpdates();
    }
}
