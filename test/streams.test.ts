import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/env';
import { buildStreams } from '../src/addon/streams';
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
