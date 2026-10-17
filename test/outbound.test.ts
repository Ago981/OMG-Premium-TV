import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/env';
import { routeFor } from '../src/http-client';
import { proxyFetchUrl, unwrapProxiedPlaylist } from '../src/addon/proxy';

const saved = { ...env };
afterEach(() => Object.assign(env, saved));

test('EasyProxy-rewritten playlists are restored to the original URLs', () => {
    const proxy = 'https://ep.example:7860/';
    const rewritten = [
        '#EXTM3U url-tvg="https://epg/a.xml"',
        '#EXTINF:-1 tvg-id="rai1",Rai 1',
        '#EXTVLCOPT:http-referrer=https://ref/',
        'https://ep.example:7860/proxy/hls/manifest.m3u8?d=https%3A%2F%2Fs%2Frai1.m3u8&api_password=pw&h_Referer=x',
        '#EXTINF:-1,Other',
        'https://other.example/keep.m3u8'
    ].join('\n');
    const restored = unwrapProxiedPlaylist(rewritten, proxy).split('\n');
    assert.equal(restored[3], 'https://s/rai1.m3u8');
    assert.equal(restored[5], 'https://other.example/keep.m3u8');
    assert.equal(restored[0], '#EXTM3U url-tvg="https://epg/a.xml"');

    const url = new URL(proxyFetchUrl({ proxy, proxy_pwd: 'pw' }, 'https://list/a.m3u'));
    assert.equal(url.pathname, '/proxy/stream');
    assert.equal(url.searchParams.get('d'), 'https://list/a.m3u');
    assert.equal(url.searchParams.get('api_password'), 'pw');
});

test('outbound routing: required proxy, private addresses, no local DNS through the proxy', async () => {
    Object.assign(env, { outboundProxy: '', outboundProxyRequired: true, allowPrivateUrls: false });
    await assert.rejects(routeFor('https://example.com/a.m3u'), /OUTBOUND_PROXY is required/);
    await assert.rejects(routeFor('http://127.0.0.1/x'), /Private addresses/);
    await assert.rejects(routeFor('http://db.internal/x'), /Private addresses/);
    await assert.rejects(routeFor('ftp://example.com/x'), /Unsupported protocol/);

    Object.assign(env, { outboundProxy: 'socks5://127.0.0.1:1080' });
    // un nome che non esiste: con il proxy non viene risolto in locale, quindi nessun errore DNS
    const r = await routeFor('https://does-not-exist.invalid/list.m3u');
    assert.equal(r.url.hostname, 'does-not-exist.invalid');
    await assert.rejects(routeFor('http://10.0.0.5/x'), /Private addresses/);

    await assert.rejects(routeFor('http://mediaflow:8888/x'), /Private addresses/);

    Object.assign(env, { allowPrivateUrls: true });
    const lan = await routeFor('http://192.168.1.10/list.m3u');
    assert.notEqual(lan.dispatcher, r.dispatcher, 'LAN addresses must bypass the outbound proxy');
    const service = await routeFor('http://mediaflow:8888/proxy/ip');
    assert.equal(service.dispatcher, lan.dispatcher, 'Docker service names go direct');
    // anche con la LAN ammessa, i nomi pubblici passano dal proxy senza DNS locale
    const pub = await routeFor('https://does-not-exist.invalid/a');
    assert.equal(pub.dispatcher, r.dispatcher);
});
