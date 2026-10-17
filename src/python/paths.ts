import path from 'path';
import { env } from '../env';

/** Ogni configurazione ha una cartella di lavoro isolata per i suoi script Python. */
export function configWorkDir(configId: string): string {
    return path.join(env.dataDir, 'python', configId.replace(/[^\w-]/g, '_'));
}

export function generatedPlaylistPath(configId: string): string {
    return path.join(configWorkDir(configId), 'generated.m3u');
}

/** Sorgente M3U interna che punta alla playlist generata dallo script Python della configurazione. */
export const GENERATED_SCHEME = 'omg://generated/';

export function generatedSourceUrl(configId: string): string {
    return GENERATED_SCHEME + configId;
}
