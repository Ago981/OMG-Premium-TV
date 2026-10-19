import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/env';
import { buildStreams } from '../src/addon/streams';
import { buildProxyUrl } from '../src/addon/proxy';
import { normalizeConfig } from '../src/store/config-store';
import type { Channel } from '../src/types';
import type { PythonResolver } from '../src/python/python-resolver';

const channel = {
    id: 'tv|test', name: 'Test',
    streamInfo: { urls: [{ url: 'https://origin.example/live.m3u8', name: 'Test', headers: {} }] }
} as unknown as Channel;

test('a failed proxy check never drops the proxied stream', async () => {
    const saved = { ...env };
    // Proxy irraggiungibile: la verifica fallisce subito
    Object.assign(env, { allowPrivateUrls: true, outboundProxy: '', outboundProxyRequired: false, streamMasking: false, proxyCheckTimeoutMs: 1000 });
    try {
        const base = { proxy: 'http://127.0.0.1:9', proxy_pwd: 'pwd', proxy_type: 'easyproxy', mask_streams: false };
        const ctx = (force: boolean) => ({ config: normalizeConfig({ ...base, force_proxy: force }), configId: 't', baseUrl: 'http://addon', resolver: {} as PythonResolver });

        const only = await buildStreams(channel, ctx(true));
        assert.equal(only.length, 1, 'Solo proxy: the proxied stream is offered, no direct link');
        assert.ok(only[0].url.startsWith('http://127.0.0.1:9/proxy/'));
        assert.match(only[0].title, /⚠️/);

        const withFallback = await buildStreams(channel, ctx(false));
        assert.equal(withFallback.length, 2, 'without Solo proxy the direct fallback is added');
        assert.equal(withFallback[1].url, 'https://origin.example/live.m3u8');
    } finally {
        Object.assign(env, saved);
    }
});

test('Xtream streams are not checked through the proxy', async () => {
    const saved = { ...env };
    Object.assign(env, { allowPrivateUrls: true, outboundProxy: '', outboundProxyRequired: false, streamMasking: false, proxyCheckTimeoutMs: 1000 });
    try {
        const xtream = {
            id: 'tv|x', name: 'X',
            streamInfo: { urls: [{ url: 'http://provider.example:8080/live/mario/secret/101.m3u8', name: 'X', headers: {} }] }
        } as unknown as Channel;
        const config = normalizeConfig({ proxy: 'http://127.0.0.1:9', proxy_pwd: 'pwd', proxy_type: 'easyproxy', mask_streams: false, force_proxy: true });
        const [s] = await buildStreams(xtream, { config, configId: 't', baseUrl: 'http://addon', resolver: {} as PythonResolver });
        assert.match(s.title, /^🌐/, 'no check, so no warning icon');
    } finally {
        Object.assign(env, saved);
    }
});

test('EasyProxy fetches Xtream links without its WARP (option on by default)', () => {
    const cfg = normalizeConfig({ proxy: 'https://prox.example', proxy_pwd: 'pwd', proxy_type: 'easyproxy' });
    const movie = new URL(buildProxyUrl('easyproxy', 'http://p.example/movie/u/p/43223.mkv', {}, cfg) as string);
    assert.equal(movie.searchParams.get('warp'), 'off');
    const mp4 = new URL(buildProxyUrl('easyproxy', 'http://p.example/movie/u/p/1.mp4', {}, cfg) as string);
    assert.equal(mp4.pathname, '/proxy/stream');
    assert.equal(mp4.searchParams.get('warp'), 'off');
    const other = new URL(buildProxyUrl('easyproxy', 'https://cdn.example/live/index.m3u8', {}, cfg) as string);
    assert.equal(other.searchParams.get('warp'), null, 'non-Xtream links keep the proxy WARP');
    const off = normalizeConfig({ proxy: 'https://prox.example', proxy_pwd: 'pwd', xtream_proxy_no_warp: false });
    assert.equal(new URL(buildProxyUrl('easyproxy', 'http://p.example/live/u/p/1.ts', {}, off) as string).searchParams.get('warp'), null);
});
