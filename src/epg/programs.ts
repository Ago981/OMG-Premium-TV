/** Un programma della guida come lo legge la query: sorgente, orari (in ms; dal database possono arrivare come stringhe). */
export interface ProgramRow {
    source_id: number | string;
    start_time: number | string;
    stop_time: number | string;
}

/**
 * Il programma in onda a `now` e i prossimi `count`, dai programmi di un canale ordinati per inizio, anche di più
 * sorgenti EPG. In onda è quello iniziato più di recente: un blocco di tutta la giornata (di un'altra sorgente, o
 * un segnaposto della stessa) non copre più quello vero. I prossimi vengono dalla stessa sorgente del programma in
 * onda (se ne ha) e non si sovrappongono, così non si alternano palinsesti diversi.
 */
export function pickPrograms<T extends ProgramRow>(list: T[], now: number, count: number): { current: T | null; upcoming: T[] } {
    const start = (p: T) => Number(p.start_time);
    const stop = (p: T) => Number(p.stop_time);
    let current: T | null = null;
    for (const p of list) {
        if (start(p) > now || stop(p) <= now) continue;
        if (!current || start(p) > start(current) || (start(p) === start(current) && stop(p) < stop(current))) current = p;
    }
    const later = (l: T[]) => l.filter(p => start(p) >= now).sort((a, b) => start(a) - start(b));
    const sameSource = current ? later(list.filter(p => String(p.source_id) === String(current!.source_id))) : [];
    const upcoming: T[] = [];
    for (const p of sameSource.length ? sameSource : later(list)) {
        if (upcoming.length >= count) break;
        const last = upcoming[upcoming.length - 1];
        if (last && start(p) < stop(last)) continue; // si sovrappone al precedente
        upcoming.push(p);
    }
    return { current, upcoming };
}
