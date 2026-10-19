import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import type { AddressInfo } from 'net';
import { closeDatabase, db, initDatabase } from '../src/db';
import { env } from '../src/env';
import { initAppSecret } from '../src/security/crypto';
import { createConfig, deleteConfigs, getConfig, normalizeConfig, ConfigValidationError } from '../src/store/config-store';
import { cleanTitle } from '../src/vod/tmdb';
import { getVodState, matchPending, syncLists } from '../src/vod/vod-service';
import { vodCatalog, vodMeta, vodStreams } from '../src/vod/vod-addon';
import { catalogHandler, manifestHandler, streamHandler } from '../src/addon/handlers';

/**
 * Film e serie Xtream con un finto provider e un finto TMDB.
 * Usa lo schema "vod_test" del database di test (così non interferisce con store.test.ts).
 */
const base = process.env.TEST_DATABASE_URL || '';
const url = base ? `${base}${base.includes('?') ? '&' : '?'}options=${encodeURIComponent('-c search_path=vod_test')}` : '';

const USER = 'mario';
const PASS = 'secret';
const KEY = 'a'.repeat(32);
let movies = [
    { stream_id: 11, name: 'IT - Il Padrino (1972)', stream_icon: 'https://img/padrino.jpg', added: '1700000000', category_id: '5', container_extension: 'mkv', tmdb: '238' },
    { stream_id: 12, name: 'Il Padrino 4K', added: '1600000000', category_id: '6', container_extension: 'mp4', tmdb_id: 238 },
    { stream_id: 13, name: 'Film Sconosciuto', added: '1500000000', category_id: '5', container_extension: 'mp4' }
];
let tmdbCalls = 0;
let xtream: http.Server;
let tmdb: http.Server;
const saved = { ...env };

function json(res: http.ServerResponse, body: unknown, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

describe('xtream movies and series', { skip: base ? false : 'TEST_DATABASE_URL not set' }, () => {
    let server = '';
    before(async () => {
        xtream = http.createServer((req, res) => {
            const u = new URL(req.url || '/', 'http://x');
            if (u.searchParams.get('username') !== USER || u.searchParams.get('password') !== PASS) return json(res, { user_info: { auth: 0 } });
            switch (u.searchParams.get('action')) {
                case null: return json(res, { user_info: { auth: 1, status: 'Active', allowed_output_formats: ['m3u8'] } });
                case 'get_vod_categories': return json(res, [{ category_id: '5', category_name: 'Film ITA' }, { category_id: '6', category_name: 'Film 4K' }]);
                case 'get_series_categories': return json(res, [{ category_id: '9', category_name: 'Serie' }]);
                case 'get_vod_streams': return json(res, movies);
                // oggetto indicizzato invece di array: alcuni pannelli lo fanno
                case 'get_series': return json(res, { 0: { series_id: 70, name: 'Breaking Bad', cover: 'https://img/bb.jpg', category_id: '9', releaseDate: '2008-01-20' } });
                case 'get_series_info': return json(res, {
                    info: { name: 'Breaking Bad', plot: 'Chimica', genre: 'Drama, Crime' },
                    episodes: { 1: [{ id: '701', episode_num: 1, title: 'Pilot', container_extension: 'mkv' }, { id: '702', episode_num: 2, title: 'Cat', container_extension: 'mkv' }] }
                });
                case 'get_vod_info': return json(res, { info: { plot: 'Saga', cast: 'Marlon Brando, Al Pacino', backdrop_path: ['https://img/bg.jpg'] } });
                default: return json(res, []);
            }
        });
        tmdb = http.createServer((req, res) => {
            tmdbCalls++;
            const u = new URL(req.url || '/', 'http://x');
            if (u.searchParams.get('api_key') !== KEY) return json(res, { status_message: 'Invalid API key' }, 401);
            if (u.pathname === '/configuration') return json(res, { images: {} });
            if (u.pathname === '/movie/238/external_ids') return json(res, { imdb_id: 'tt0068646' });
            if (u.pathname === '/tv/1396/external_ids') return json(res, { imdb_id: 'tt0903747' });
            if (u.pathname === '/search/tv') {
                return json(res, { results: u.searchParams.get('query') === 'Breaking Bad' ? [{ id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20' }] : [] });
            }
            if (u.pathname === '/search/movie') return json(res, { results: [{ id: 5, title: 'Un altro film' }] });
            json(res, {}, 404);
        });
        await new Promise<void>(r => xtream.listen(0, '127.0.0.1', r));
        await new Promise<void>(r => tmdb.listen(0, '127.0.0.1', r));
        server = `http://127.0.0.1:${(xtream.address() as AddressInfo).port}`;
        Object.assign(env, {
            allowPrivateUrls: true, outboundProxy: '', outboundProxyRequired: false, streamMasking: false,
            tmdbApiBase: `http://127.0.0.1:${(tmdb.address() as AddressInfo).port}`, tmdbRatePerSec: 1000
        });

        await initDatabase(base);
        await db().run('DROP SCHEMA IF EXISTS vod_test CASCADE');
        await db().run('CREATE SCHEMA vod_test');
        await initDatabase(url);
        await initAppSecret();
    });

    after(async () => {
        xtream.close();
        tmdb.close();
        Object.assign(env, saved);
        await closeDatabase();
    });

    test('a TMDB key is required to include movies and series', () => {
        const input = { source_type: 'xtream', xtream_server: 'http://x', xtream_username: 'u', xtream_password: 'p', xtream_vod: 'true' };
        assert.throws(() => normalizeConfig(input, { strict: true }), ConfigValidationError);
        assert.equal(normalizeConfig({ ...input, tmdb_api_key: KEY }, { strict: true }).xtream_vod, true);
    });

    test('titles are cleaned before searching TMDB', () => {
        assert.equal(cleanTitle('IT - Il Padrino (1972) [4K]'), 'Il Padrino');
        assert.equal(cleanTitle('|IT| Breaking Bad HD'), 'Breaking Bad');
    });

    test('sync, IMDb linking, catalogs and streams', async () => {
        const cfg = normalizeConfig({
            source_type: 'xtream', xtream_server: server, xtream_username: USER, xtream_password: PASS,
            xtream_vod: true, tmdb_api_key: KEY, mask_streams: false
        });
        const record = await createConfig(cfg, 'password123');
        const ctx = { record, baseUrl: 'http://addon' };

        assert.deepEqual(await syncLists(record), { movies: 3, series: 1 });
        await matchPending(record);
        let state = await getVodState(record.id);
        assert.equal(state.matched, 3, 'two movies via tmdb_id, the series via title search');
        assert.equal(state.unmatched, 1, 'unknown title is not linked to a wrong movie');
        assert.deepEqual(state.categories.movie, ['Film ITA', 'Film 4K']);

        const manifest = await manifestHandler(ctx);
        assert.deepEqual(manifest.types, ['tv', 'movie', 'series']);
        const catalogs = manifest.catalogs as { type: string; id: string }[];
        assert.ok(catalogs.some(c => c.type === 'movie') && catalogs.some(c => c.type === 'series'));

        const { metas } = await vodCatalog(ctx, 'movie', {}) as { metas: { id: string; name: string }[] };
        assert.deepEqual(metas.map(m => m.id), ['tt0068646', 'xtm:13'], 'newest first, the 4K copy merged under the same IMDb id');
        const search = await catalogHandler(ctx, { search: 'sconosc' }, 'movie') as { metas: { id: string }[] };
        assert.deepEqual(search.metas.map(m => m.id), ['xtm:13']);
        const genre = await vodCatalog(ctx, 'movie', { genre: 'Film 4K' }) as { metas: { id: string }[] };
        assert.equal(genre.metas.length, 1);

        // Dalla pagina Cinemeta del film: entrambe le versioni
        const fromImdb = await streamHandler(ctx, 'tt0068646', 'movie') as { streams: { url: string }[] };
        assert.deepEqual(fromImdb.streams.map(s => s.url).sort(), [`${server}/movie/mario/secret/11.mkv`, `${server}/movie/mario/secret/12.mp4`]);
        const episode = await vodStreams(ctx, 'series', 'tt0903747:1:2');
        assert.equal(episode.streams[0].url, `${server}/series/mario/secret/702.mkv`);
        assert.equal((await vodStreams(ctx, 'series', 'tt0903747:3:1')).streams.length, 0);

        const meta = (await vodMeta(ctx, 'xts:70')).meta as { videos: { id: string }[]; genres: string[] };
        assert.deepEqual(meta.videos.map(v => v.id), ['xts:70:1:1', 'xts:70:1:2']);
        assert.deepEqual(meta.genres, ['Drama', 'Crime']);
        const own = await vodStreams(ctx, 'series', 'xts:70:1:1');
        assert.equal(own.streams[0].url, `${server}/series/mario/secret/701.mkv`);

        // Secondo giro: i titoli già abbinati non rifanno richieste a TMDB, quelli rimossi spariscono
        movies = movies.filter(m => m.stream_id !== 12);
        const before = tmdbCalls;
        await syncLists(record);
        await matchPending(record);
        state = await getVodState(record.id);
        assert.equal(tmdbCalls, before, 'no TMDB calls for unchanged titles');
        assert.equal(state.matched + state.unmatched, 3);

        // Cancellando la configurazione si cancellano anche i suoi titoli e abbinamenti
        await deleteConfigs([record.id]);
        assert.equal(await getConfig(record.id), null);
        const left = await db().get<{ n: number }>('SELECT COUNT(*) AS n FROM vod_items WHERE config_id = ?', [record.id]);
        assert.equal(Number(left?.n), 0);
    });
});
