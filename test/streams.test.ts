import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/env';
import { appConfig } from '../src/config';
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

test('Xtream links reach the proxy with a player User-Agent', () => {
    const cfg = normalizeConfig({ proxy: 'https://prox.example', proxy_pwd: 'pwd', proxy_type: 'easyproxy' });
    const ua = (url: string, headers = {}) => new URL(buildProxyUrl('easyproxy', url, headers, cfg) as string).searchParams.get('h_user-agent');
    assert.equal(ua('http://p.example/movie/u/p/43223.mkv'), env.xtreamUserAgent);
    assert.equal(ua('http://p.example/live/u/p/101.m3u8', { 'User-Agent': appConfig.defaultUserAgent }), env.xtreamUserAgent, 'default Chrome UA replaced');
    assert.equal(ua('http://p.example/live/u/p/101.ts', { 'User-Agent': 'TiviMate/4.7' }), 'TiviMate/4.7', 'a UA from the playlist is kept');
    assert.equal(ua('https://cdn.example/live/index.m3u8'), appConfig.defaultUserAgent, 'other links unchanged');
    assert.equal(new URL(buildProxyUrl('easyproxy', 'http://p.example/movie/u/p/1.mp4', {}, cfg) as string).pathname, '/proxy/manifest.m3u8', 'Xtream .mp4 through the universal endpoint');
    assert.equal(new URL(buildProxyUrl('easyproxy', 'https://cdn.example/film.mp4', {}, cfg) as string).pathname, '/proxy/stream', 'other .mp4 unchanged');
    const mf = new URL(buildProxyUrl('mediaflow', 'http://p.example/movie/u/p/1.mp4', {}, cfg) as string);
    assert.equal(mf.searchParams.get('h_user-agent'), env.xtreamUserAgent, 'MediaFlow too');
});

test('proxy type "off" keeps URL and password but streams go direct', async () => {
    const saved = { ...env };
    Object.assign(env, { streamMasking: false });
    try {
        const config = normalizeConfig({ proxy: 'http://127.0.0.1:9', proxy_pwd: 'pwd', proxy_type: 'off', force_proxy: true, mask_streams: false });
        assert.equal(config.proxy, 'http://127.0.0.1:9', 'saved values are kept');
        const streams = await buildStreams(channel, { config, configId: 't', baseUrl: 'http://addon', resolver: {} as PythonResolver });
        assert.deepEqual(streams.map(s => s.url), ['https://origin.example/live.m3u8']);
        assert.equal(buildProxyUrl('easyproxy', 'https://origin.example/live.m3u8', {}, config), null);
    } finally {
        Object.assign(env, saved);
    }
});

test('verified streams come first, unverified ones are labelled', async () => {
    const saved = { ...env };
    Object.assign(env, { allowPrivateUrls: true, outboundProxy: '', outboundProxyRequired: false, streamMasking: false, proxyCheckTimeoutMs: 1000 });
    try {
        const ch = {
            id: 'tv|r', name: 'Rai 1',
            streamInfo: { urls: [
                { url: 'https://origin.example/rai1.m3u8', name: 'RAI 1 (1)', headers: {} },
                // link Xtream: non viene verificato, quindi conta come verificato
                { url: 'http://p.example/live/u/p/1.m3u8', name: 'RAI 1 (2)', headers: {} }
            ] }
        } as unknown as Channel;
        const config = normalizeConfig({ proxy: 'http://127.0.0.1:9', proxy_pwd: 'pwd', proxy_type: 'easyproxy', mask_streams: false, language: 'Italiano' });
        const streams = await buildStreams(ch, { config, configId: 't', baseUrl: 'http://addon', resolver: {} as PythonResolver });
        assert.match(streams[0].title, /RAI 1 \(2\)/);
        assert.match(streams[1].title, /RAI 1 \(1\)[\s\S]*non verificato/);
    } finally {
        Object.assign(env, saved);
    }
});
