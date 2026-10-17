/**
 * Runtime JSX minimale per il rendering lato server delle pagine (.tsx → stringa HTML).
 * Ogni valore testuale e ogni attributo viene sottoposto a escape: niente XSS dai campi della configurazione.
 */

export class Html {
    constructor(readonly value: string) {}
    toString(): string {
        return this.value;
    }
}

export type Child = Html | string | number | boolean | null | undefined | Child[];
type Props = Record<string, unknown> & { children?: Child };
type Component = (props: Props) => Html;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Contenuto già sicuro (es. JSON serializzato con escape) da inserire così com'è. */
export function raw(value: string): Html {
    return new Html(value);
}

function renderChild(child: Child): string {
    if (child === null || child === undefined || child === false || child === true) return '';
    if (Array.isArray(child)) return child.map(renderChild).join('');
    if (child instanceof Html) return child.value;
    return escapeHtml(String(child));
}

function renderAttrs(props: Record<string, unknown>): string {
    let out = '';
    for (const [key, value] of Object.entries(props)) {
        if (key === 'children' || value === null || value === undefined || value === false) continue;
        const name = key === 'className' ? 'class' : key === 'htmlFor' ? 'for' : key;
        if (/^on[A-Z]/.test(key)) throw new Error('Inline event handlers are not allowed (CSP): use data-* + addEventListener');
        out += value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`;
    }
    return out;
}

export function h(tag: string | Component, props: Record<string, unknown> | null, ...children: Child[]): Html {
    const p: Props = { ...(props || {}) };
    if (children.length) p.children = children;
    if (typeof tag === 'function') return tag(p);
    const attrs = renderAttrs(p);
    if (VOID.has(tag)) return new Html(`<${tag}${attrs}>`);
    return new Html(`<${tag}${attrs}>${renderChild(p.children)}</${tag}>`);
}

export function Fragment(props: { children?: Child }): Html {
    return new Html(renderChild(props.children));
}

export function render(node: Html): string {
    return '<!DOCTYPE html>' + node.value;
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
        type Element = Html;
        interface IntrinsicElements {
            [tag: string]: Record<string, unknown>;
        }
        interface ElementChildrenAttribute {
            children: unknown;
        }
    }
}
