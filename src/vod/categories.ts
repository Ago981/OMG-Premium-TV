import type { Param } from '../db';
import { stripDashes } from '../playlist/m3u-parser';

/**
 * Categorie (e sottocategorie) di film e serie Xtream.
 *
 * Ogni titolo è salvato con il percorso completo della sua categoria, es. "Film › Azione".
 * Le sottocategorie si ricavano da parent_id (quando il pannello lo usa) oppure, in mancanza,
 * dal prefisso comune nei nomi: "IT | Azione", "IT | Commedia" → "IT › Azione", "IT › Commedia".
 * Filtrare (o escludere) una categoria madre comprende tutte le sue sottocategorie.
 */

export const SEP = ' › ';

export interface CategoryRaw {
    category_id: string | number;
    category_name: string;
    parent_id?: string | number | null;
}

export interface CategoryTree {
    /** category_id → percorso completo */
    pathById: Map<string, string>;
    /** Ordine del provider, con ogni categoria madre subito prima delle sue figlie */
    order: string[];
}

function clean(name: unknown): string {
    // Il separatore è riservato ai percorsi
    return stripDashes(String(name ?? '').replace(/›/g, '>').replace(/\s+/g, ' '));
}

const PREFIX_RE = /^\|?\s*([^|]{1,30}?)\s*\|\s*(.+)$/;

export function buildCategoryTree(cats: CategoryRaw[]): CategoryTree {
    const byId = new Map(cats.map(c => [String(c.category_id), c]));
    const hasParents = cats.some(c => c.parent_id !== undefined && c.parent_id !== null && String(c.parent_id) !== '0' && byId.has(String(c.parent_id)));

    // Prefissi condivisi da almeno due categorie (solo se il pannello non usa parent_id)
    const prefixCount = new Map<string, number>();
    if (!hasParents) {
        for (const c of cats) {
            const m = clean(c.category_name).match(PREFIX_RE);
            if (m) prefixCount.set(m[1], (prefixCount.get(m[1]) || 0) + 1);
        }
    }

    const pathById = new Map<string, string>();
    const pathOf = (c: CategoryRaw, depth = 0): string => {
        const id = String(c.category_id);
        const known = pathById.get(id);
        if (known) return known;
        const name = clean(c.category_name) || id;
        let path = name;
        const parent = hasParents && c.parent_id !== undefined && c.parent_id !== null ? byId.get(String(c.parent_id)) : undefined;
        if (parent && parent !== c && depth < 5) {
            path = `${pathOf(parent, depth + 1)}${SEP}${name}`;
        } else if (!hasParents) {
            const m = name.match(PREFIX_RE);
            if (m && (prefixCount.get(m[1]) || 0) >= 2) path = `${stripDashes(m[1])}${SEP}${stripDashes(m[2])}`;
        }
        pathById.set(id, path);
        return path;
    };

    const order: string[] = [];
    const seen = new Set<string>();
    for (const c of cats) {
        const parts = pathOf(c).split(SEP);
        for (let i = 1; i <= parts.length; i++) {
            const p = parts.slice(0, i).join(SEP);
            if (!seen.has(p)) {
                seen.add(p);
                order.push(p);
            }
        }
    }
    return { pathById, order };
}

/** Solo le categorie con almeno un titolo (comprese le madri delle categorie usate). */
export function usedCategories(order: string[], used: Set<string>): string[] {
    return order.filter(p => used.has(p) || [...used].some(u => u.startsWith(p + SEP)));
}

export function leafOf(path: string): string {
    const parts = path.split(SEP);
    return parts[parts.length - 1];
}

function likePrefix(path: string): string {
    return path.replace(/[\\%_]/g, m => '\\' + m) + SEP + '%';
}

/** Condizione SQL "la categoria è questa o una sua sottocategoria". */
export function categoryMatch(path: string): { sql: string; params: Param[] } {
    return { sql: "(category = ? OR category LIKE ? ESCAPE '\\')", params: [path, likePrefix(path)] };
}

/** Condizione SQL che esclude le categorie scelte dall'utente (e le loro sottocategorie). */
export function excludeCategories(excluded: string[]): { sql: string; params: Param[] } | null {
    if (!excluded.length) return null;
    const parts = excluded.map(categoryMatch);
    return {
        sql: `(category IS NULL OR NOT (${parts.map(p => p.sql).join(' OR ')}))`,
        params: parts.flatMap(p => p.params)
    };
}

export function isExcluded(path: string, excluded: string[]): boolean {
    return excluded.some(e => path === e || path.startsWith(e + SEP));
}

/** "a\nb" (campo della configurazione) → elenco pulito. */
export function parseExcluded(value: string): string[] {
    // Anche i nomi salvati prima della normalizzazione dei trattini ("-----DOCUMENTARI-----")
    const paths = String(value || '').split('\n').map(s => s.split(SEP).map(stripDashes).join(SEP).trim()).filter(Boolean);
    return [...new Set(paths)].slice(0, 500);
}
