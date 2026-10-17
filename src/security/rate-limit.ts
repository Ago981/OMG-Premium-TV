/**
 * Limitatore in memoria per i tentativi di login (per IP + chiave).
 * Sufficiente per una singola istanza; dietro Cloudflare l'IP arriva da CF-Connecting-IP.
 */
interface Bucket {
    count: number;
    resetAt: number;
}

export class RateLimiter {
    private buckets = new Map<string, Bucket>();

    constructor(private readonly max: number, private readonly windowMs: number) {
        setInterval(() => this.sweep(), windowMs).unref();
    }

    /** true se la richiesta è consentita. */
    hit(key: string): boolean {
        const now = Date.now();
        const b = this.buckets.get(key);
        if (!b || now > b.resetAt) {
            this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
            return true;
        }
        b.count++;
        return b.count <= this.max;
    }

    reset(key: string): void {
        this.buckets.delete(key);
    }

    private sweep(): void {
        const now = Date.now();
        for (const [k, b] of this.buckets) if (now > b.resetAt) this.buckets.delete(k);
    }
}

/** 10 tentativi ogni 15 minuti per IP e risorsa. */
export const loginLimiter = new RateLimiter(10, 15 * 60 * 1000);
/** Creazione configurazioni: 20 all'ora per IP. */
export const createLimiter = new RateLimiter(20, 60 * 60 * 1000);
