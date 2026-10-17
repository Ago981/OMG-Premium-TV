/**
 * Cloudflare Worker: proxy inverso davanti all'addon.
 *
 * Stremio e i browser vedono solo il dominio del Worker (es. tv.tuodominio.it o *.workers.dev):
 * l'indirizzo reale del server (Render, Hugging Face, VPS...) non compare da nessuna parte.
 *
 * Variabili del Worker (Settings → Variables):
 *   ORIGIN_URL     URL reale dell'addon, es. https://omg-tv-xxxx.onrender.com   (segreto)
 *   ORIGIN_SECRET  stesso valore di ORIGIN_SECRET sul server                    (segreto)
 *
 * Sul server imposta anche PUBLIC_BASE_URL con l'URL del Worker.
 */
export default {
    async fetch(request, env) {
        const incoming = new URL(request.url);
        const origin = new URL(env.ORIGIN_URL);
        const target = new URL(incoming.pathname + incoming.search, origin);

        const headers = new Headers(request.headers);
        headers.set('X-Origin-Secret', env.ORIGIN_SECRET);
        headers.set('X-Forwarded-Host', incoming.host);
        headers.set('X-Forwarded-Proto', incoming.protocol.replace(':', ''));
        headers.delete('Host');

        const response = await fetch(target, {
            method: request.method,
            headers,
            // Le API ricevono solo piccoli JSON: leggerli in memoria evita problemi con i body in streaming
            body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
            redirect: 'manual'
        });

        // I redirect interni (es. dopo il login) devono restare sul dominio del Worker;
        // i redirect degli stream mascherati (/s/...) puntano già alla sorgente e restano invariati.
        const out = new Response(response.body, response);
        const location = out.headers.get('Location');
        if (location && location.startsWith(origin.origin)) {
            out.headers.set('Location', incoming.origin + location.slice(origin.origin.length));
        }
        out.headers.delete('X-Powered-By');
        out.headers.delete('Server');
        return out;
    }
};
