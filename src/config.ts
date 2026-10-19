import fs from 'fs';
import path from 'path';
import { env } from './env';

export interface ManifestBase {
    id: string;
    version: string;
    name: string;
    description: string;
    logo: string;
    catalogId: string;
    catalogName: string;
}

export interface AppConfig {
    defaultUserAgent: string;
    defaultLanguage: string;
    /** true quando esiste addon-config.json (versione "Premium": URL M3U modificabile). */
    customized: boolean;
    manifest: ManifestBase;
}

const base: AppConfig = {
    defaultUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    defaultLanguage: 'Italiana',
    customized: false,
    manifest: {
        id: 'org.mccoy88f.omgtv',
        version: '8.4.0',
        name: 'OMG TV',
        description: 'Modalita provvisoria, installazione con errori, attivo mod. provvisoria',
        logo: 'https://github.com/mccoy88f/OMG-TV-Stremio-Addon/blob/main/tv.png?raw=true',
        catalogId: 'omg_tv',
        catalogName: 'OMG TV'
    }
};

interface AddonConfigFile {
    addonId?: string;
    addonName?: string;
    addonDescription?: string;
    addonVersion?: string;
    addonLogo?: string;
    defaultLanguage?: string;
}

function loadConfig(): AppConfig {
    const file = path.join(env.rootDir, 'addon-config.json');
    if (!fs.existsSync(file)) return base;
    try {
        const custom = JSON.parse(fs.readFileSync(file, 'utf8')) as AddonConfigFile;
        return {
            ...base,
            customized: true,
            defaultLanguage: custom.defaultLanguage || base.defaultLanguage,
            manifest: {
                id: custom.addonId || base.manifest.id,
                version: custom.addonVersion || base.manifest.version,
                name: custom.addonName || base.manifest.name,
                description: custom.addonDescription || base.manifest.description,
                logo: custom.addonLogo || base.manifest.logo,
                catalogId: 'omg_plus_tv',
                catalogName: 'OMG+'
            }
        };
    } catch (e) {
        console.error('Error loading addon-config.json:', e);
        return base;
    }
}

export const appConfig = loadConfig();

export const SETTINGS_LOGO = 'https://raw.githubusercontent.com/mccoy88f/OMG-TV-Stremio-Addon/refs/heads/main/tv.png';
export const NO_SIGNAL_URL = 'https://static.vecteezy.com/system/resources/previews/001/803/236/mp4/no-signal-bad-tv-free-video.mp4';
export const SETTINGS_GENRE = '⚙️';
