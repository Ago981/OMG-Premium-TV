/**
 * Segnaposto per canali, film e serie senza immagine, generati dal servizio esterno placehold.co
 * (nessun carico sul server dell'addon). Font Montserrat; il titolo va a capo su più righe.
 */

export type PlaceholderKind = 'tv' | 'movie' | 'series';

const STYLE: Record<PlaceholderKind, { size: string; color: string }> = {
    tv: { size: '500x500', color: '590b8a' },
    movie: { size: '342x513', color: '9e1b32' },
    series: { size: '342x513', color: '0f6e7a' }
};

const FONT = 'montserrat';

/** Titolo su più righe (\n per placehold.co): parole raggruppate fino a circa `width` caratteri. */
function lines(title: string, width: number): string {
    const out: string[] = [];
    for (const word of title.split(/\s+/).filter(Boolean)) {
        const last = out.length - 1;
        if (last >= 0 && (out[last] + ' ' + word).length <= width) out[last] += ' ' + word;
        else out.push(word);
    }
    return out.slice(0, 5).join('\n');
}

export function placeholderUrl(kind: PlaceholderKind, title: string): string {
    const { size, color } = STYLE[kind];
    const text = lines(title.trim().slice(0, 60) || 'OMG+ TV', kind === 'tv' ? 14 : 12);
    return `https://placehold.co/${size}/${color}/ffffff/png?font=${FONT}&text=${encodeURIComponent(text).replace(/%0A/g, '\\n')}`;
}
