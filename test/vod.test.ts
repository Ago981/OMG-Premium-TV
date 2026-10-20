import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import type { AddressInfo } from 'net';
import { closeDatabase, db, initDatabase } from '../src/db';
import { env } from '../src/env';
import { initAppSecret } from '../src/security/crypto';
import { createConfig, deleteConfigs, getConfig, normalizeConfig, updateConfig, ConfigValidationError } from '../src/store/config-store';
import { cleanTitle, stripTrailingYear, tmdbLanguage, tmdbMatch } from '../src/vod/tmdb';
import { buildCategoryTree, parseExcluded, usedCategories } from '../src/vod/categories';
import { getVodState, listVod, matchPending, syncLists } from '../src/vod/vod-service';
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
            if (u.pathname === '/cover.jpg') return void res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end('jpg');
            if (u.searchParams.get('username') !== USER || u.searchParams.get('password') !== PASS) return json(res, { user_info: { auth: 0 } });
            switch (u.searchParams.get('action')) {
                case null: return json(res, { user_info: { auth: 1, status: 'Active', allowed_output_formats: ['m3u8'] } });
                case 'get_vod_categories': return json(res, [{ category_id: '5', category_name: 'Film ITA' }, { category_id: '6', category_name: 'Film 4K' }]);
                case 'get_series_categories': return json(res, [{ category_id: '9', category_name: 'Serie' }]);
                case 'get_vod_streams': return json(res, movies);
                // oggetto indicizzato invece di array: alcuni pannelli lo fanno
                case 'get_series': return json(res, { 0: { series_id: 70, name: 'Breaking Bad', cover: `http://${req.headers.host}/cover.jpg`, category_id: '9', releaseDate: '2008-01-20' } });
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
            if (u.pathname === '/movie/238') {
                // Locandina localizzata solo se la richiesta chiede l'italiano
                const posters = u.searchParams.get('include_image_language')?.startsWith('it,') ? [{ file_path: '/padrino-it.jpg', iso_639_1: 'it', iso_3166_1: 'IT' }] : [];
                return json(res, { poster_path: '/padrino.jpg', backdrop_path: '/bg.jpg', external_ids: { imdb_id: 'tt0068646' }, images: { posters } });
            }
            if (u.pathname === '/tv/1396') return json(res, { poster_path: null, external_ids: { imdb_id: 'tt0903747' } });
            if (u.pathname === '/search/tv') {
                return json(res, { results: u.searchParams.get('query') === 'Breaking Bad' ? [{ id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20' }] : [] });
            }
            if (u.pathname === '/search/movie') {
                const q = u.searchParams.get('query');
                const year = u.searchParams.get('year');
                if (q === 'Unico') return json(res, { results: year ? [] : [{ id: 777, title: 'Unico', release_date: '2001-05-01' }] });
                if (q === 'Remake') return json(res, { results: year ? [] : [{ id: 801, title: 'Remake', release_date: '1984-01-01' }, { id: 802, title: 'Remake', release_date: '2021-01-01' }] });
                return json(res, { results: [{ id: 5, title: 'Un altro film' }] });
            }
            if (u.pathname === '/movie/777') return json(res, { external_ids: { imdb_id: 'tt0000777' } });
            json(res, {}, 404);
        });
        await new Promise<void>(r => xtream.listen(0, '127.0.0.1', r));
        await new Promise<void>(r => tmdb.listen(0, '127.0.0.1', r));
        server = `http://127.0.0.1:${(xtream.address() as AddressInfo).port}`;
        Object.assign(env, {
            allowPrivateUrls: true, outboundProxy: '', outboundProxyRequired: false, streamMasking: false,
            tmdbApiBase: `http://127.0.0.1:${(tmdb.address() as AddressInfo).port}`, tmdbRatePerSec: 1000
        });

        // Schema dedicato creato con un client a parte: initDatabase sul database base migrerebbe lo schema
        // "public" in contemporanea con store.test.ts
        const { default: pg } = await import('pg');
        const admin = new pg.Client({ connectionString: base });
        await admin.connect();
        await admin.query('DROP SCHEMA IF EXISTS vod_test CASCADE');
        await admin.query('CREATE SCHEMA vod_test');
        await admin.end();
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

    test('TMDB language from configuration language and country', () => {
        assert.equal(tmdbLanguage('Italiano', 'ch'), 'it-CH');
        assert.equal(tmdbLanguage('Italiano', ''), 'it-IT');
        assert.equal(tmdbLanguage('Português', 'br'), 'pt-BR');
        assert.equal(tmdbLanguage('English', 'uk'), 'en-GB');
    });

    test('a year written at the end of the title is not part of the search', () => {
        assert.equal(stripTrailingYear('VisionQuest 2026'), 'VisionQuest');
        assert.equal(stripTrailingYear('Marshals A Yellowstone Story 2026'), 'Marshals A Yellowstone Story');
        assert.equal(stripTrailingYear('Doc - 2020'), 'Doc');
        assert.equal(stripTrailingYear('Blade Runner 2049'), 'Blade Runner 2049', 'not a plausible year');
        assert.equal(stripTrailingYear('1917'), '1917', 'a title made only of a year stays');
    });

    test('movies are retried without the year only when the title is unambiguous', async () => {
        const unico = await tmdbMatch(KEY, 'movie', { tmdbId: null, name: 'Unico 1990', year: 1990 }, 'it-IT');
        assert.equal(unico?.imdbId, 'tt0000777', 'a single film with that title is accepted despite the wrong year');
        const remake = await tmdbMatch(KEY, 'movie', { tmdbId: null, name: 'Remake 1990', year: 1990 }, 'it-IT');
        assert.equal(remake, null, 'two films with the same title and no matching year: no guess');
    });

    test('titles are cleaned before searching TMDB', () => {
        assert.equal(cleanTitle('IT - Il Padrino (1972) [4K]'), 'Il Padrino');
        assert.equal(cleanTitle('|IT| Breaking Bad HD'), 'Breaking Bad');
    });

    test('subcategories from parent_id or from a shared name prefix', () => {
        const byParent = buildCategoryTree([
            { category_id: 1, category_name: 'Film', parent_id: 0 },
            { category_id: 2, category_name: 'Azione', parent_id: 1 },
            { category_id: 3, category_name: 'Documentari', parent_id: 0 }
        ]);
        assert.equal(byParent.pathById.get('2'), 'Film › Azione');
        assert.deepEqual(byParent.order, ['Film', 'Film › Azione', 'Documentari']);

        const byPrefix = buildCategoryTree([
            { category_id: 1, category_name: 'IT | Azione' },
            { category_id: 2, category_name: '|IT| Commedia' },
            { category_id: 3, category_name: 'EN | Drama' }
        ]);
        assert.equal(byPrefix.pathById.get('2'), 'IT › Commedia');
        assert.equal(byPrefix.pathById.get('3'), 'EN | Drama', 'a prefix used once is not a group');
        assert.equal(buildCategoryTree([{ category_id: 9, category_name: '-----DOCUMENTARI-----' }]).pathById.get('9'), 'DOCUMENTARI');
        assert.deepEqual(parseExcluded('-----DOCUMENTARI-----\nIT › ---AZIONE---'), ['DOCUMENTARI', 'IT › AZIONE'], 'old saved names are normalized too');
        assert.deepEqual(usedCategories(byPrefix.order, new Set(['IT › Commedia'])), ['IT', 'IT › Commedia']);
    });

    test('sync, IMDb linking, catalogs and streams', async () => {
        const cfg = normalizeConfig({
            source_type: 'xtream', xtream_server: server, xtream_username: USER, xtream_password: PASS,
            xtream_vod: true, tmdb_api_key: KEY, mask_streams: false
        });
        // Copertina del provider che non si apre (risposta non immagine): si usa il segnaposto
        movies[2] = { ...movies[2], stream_icon: `${server}/broken.jpg` } as typeof movies[2];
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
        const catalogs = manifest.catalogs as { type: string; id: string; name: string }[];
        assert.deepEqual(catalogs.map(c => [c.type, c.name]), [['tv', 'OMG+ TV'], ['movie', 'OMG+ TV'], ['series', 'OMG+ TV']], 'same name as the channel catalog');
        const named = await manifestHandler({ ...ctx, record: { ...record, label: 'IPTV' } });
        assert.equal(named.name, 'OMG+ TV - IPTV', 'addon and catalogs share the same base name');
        assert.equal(named.description, 'Canali TV e IPTV da playlist M3U o account Xtream, con la guida TV (EPG), film e serie TV.', 'description in the configuration language');
        assert.ok((named.catalogs as { name: string }[]).every(c => c.name === 'OMG+ TV - IPTV'));

        const { metas } = await vodCatalog(ctx, 'movie', {}) as { metas: { id: string; name: string }[] };
        assert.deepEqual(metas.map(m => m.id), ['tt0068646', 'xtm:13'], 'newest first, the 4K copy merged under the same IMDb id');
        assert.equal(metas[0].name, 'Il Padrino', 'provider prefixes and year removed from the shown title');
        const posters = (metas as unknown as { poster: string }[]).map(m => m.poster);
        assert.equal(posters[0], 'https://image.tmdb.org/t/p/w342/padrino-it.jpg', 'TMDB poster in the configuration language first');
        assert.equal(posters[1], 'https://placehold.co/342x513/9e1b32/ffffff/png?font=montserrat&text=Film\\nSconosciuto', 'movie placeholder with its own colour, title on two lines');
        const series = await vodCatalog(ctx, 'series', {}) as { metas: { poster: string }[] };
        assert.equal(series.metas[0].poster, `${server}/cover.jpg`, 'working provider cover when TMDB has none');
        // Pagine da un titolo: lo skip di Stremio conta i titoli unici, non le righe
        const page2 = await listVod(record.id, 'movie', { skip: 1, limit: 1 });
        assert.deepEqual(page2.map(i => i.itemId), ['13']);
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

        // Categoria esclusa: sparisce da catalogo, filtri e stream della pagina IMDb
        const hidden = await updateConfig(record.id, normalizeConfig({ ...cfg, vod_excluded: 'Film 4K' })) as typeof record;
        const hctx = { record: hidden, baseUrl: 'http://addon' };
        const options = ((await manifestHandler(hctx)).catalogs as { type: string; extra: { name: string; options?: string[] }[] }[])
            .find(c => c.type === 'movie')?.extra[0].options;
        assert.deepEqual(options, ['Film ITA']);
        const onlyHd = await streamHandler(hctx, 'tt0068646', 'movie') as { streams: { url: string }[] };
        assert.deepEqual(onlyHd.streams.map(s => s.url), [`${server}/movie/mario/secret/11.mkv`]);

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
