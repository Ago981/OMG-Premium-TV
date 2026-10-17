import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProxyUrl } from '../src/addon/proxy';
import { M3UParser, parseClearKey } from '../src/playlist/m3u-parser';
import { DEFAULT_CONFIG } from '../src/store/config-store';

const cfg = { ...DEFAULT_CONFIG, proxy: 'https://proxy.example/', proxy_pwd: 'pw' };
const KID = '0123456789abcdef0123456789abcdef';
const KEY = 'fedcba9876543210fedcba9876543210';

function parse(url: string) {
    const u = new URL(url);
    return { path: u.pathname, q: Object.fromEntries(u.searchParams) };
}

test('MediaFlow URLs keep the previous endpoints', () => {
    const hls = parse(buildProxyUrl('mediaflow', 'https://s/a.m3u8', { 'User-Agent': 'UA', referrer: 'https://r/' }, cfg)!);
    assert.equal(hls.path, '/proxy/hls/manifest.m3u8');
    assert.deepEqual(hls.q, { api_password: 'pw', d: 'https://s/a.m3u8', 'h_user-agent': 'UA', h_referer: 'https://r/' });
    assert.equal(parse(buildProxyUrl('mediaflow', 'https://s/a.mpd', {}, cfg)!).path, '/proxy/mpd/manifest.m3u8');
    assert.equal(parse(buildProxyUrl('mediaflow', 'https://s/a.mp4', {}, cfg)!).path, '/proxy/stream');
    assert.equal(parse(buildProxyUrl('mediaflow', 'https://s/a.php', {}, cfg)!).q.host, 'DLHD');

    const ck = parse(buildProxyUrl('mediaflow', 'https://s/a.mpd', {}, cfg, `${KID}:${KEY}`)!);
    assert.equal(ck.path, '/proxy/mpd/manifest.m3u8');
    assert.equal(ck.q.key_id, KID);
    assert.equal(ck.q.key, KEY);
});

test('EasyProxy URLs use the universal endpoint with url= and clearkey=', () => {
    const hls = parse(buildProxyUrl('easyproxy', 'https://s/a.m3u8', { origin: 'https://o' }, cfg)!);
    assert.equal(hls.path, '/proxy/manifest.m3u8');
    assert.equal(hls.q.url, 'https://s/a.m3u8');
    assert.equal(hls.q.api_password, 'pw');
    assert.equal(hls.q.h_origin, 'https://o');

    const php = parse(buildProxyUrl('easyproxy', 'https://dlhd/stream/stream-1.php', {}, cfg)!);
    assert.equal(php.path, '/proxy/manifest.m3u8');

    const ck = parse(buildProxyUrl('easyproxy', 'https://s/a.mpd', {}, cfg, `${KID}:${KEY}`)!);
    assert.equal(ck.q.clearkey, `${KID}:${KEY}`);

    assert.equal(parse(buildProxyUrl('easyproxy', 'https://s/v.mp4', {}, cfg)!).path, '/proxy/stream');
    assert.equal(buildProxyUrl('easyproxy', 'https://s/a.m3u8', {}, { ...cfg, proxy_pwd: '' }), null);
});

test('ClearKey keys are read from #KODIPROP lines', () => {
    assert.equal(parseClearKey(`${KID.toUpperCase()}:${KEY}`), `${KID}:${KEY}`);
    assert.equal(parseClearKey('https://license.example/'), undefined);

    const p = new M3UParser();
    p.add(`#EXTM3U
#EXTINF:-1 tvg-id="dash1",Dash One
#KODIPROP:inputstream.adaptive.license_type=clearkey
#KODIPROP:inputstream.adaptive.license_key=${KID}:${KEY}
#EXTVLCOPT:http-referrer=https://ref/
https://s/dash.mpd
#EXTINF:-1 tvg-id="plain",Plain
https://s/plain.m3u8
`);
    const [dash, plain] = p.result().channels;
    assert.equal(dash.streamInfo.urls[0].clearkey, `${KID}:${KEY}`);
    assert.equal(dash.streamInfo.urls[0].headers.referrer, 'https://ref/');
    assert.equal(plain.streamInfo.urls[0].clearkey, undefined);
});
