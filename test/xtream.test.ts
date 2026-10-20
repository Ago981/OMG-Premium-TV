import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import type { AddressInfo } from 'net';
import { env } from '../src/env';
import { M3UParser } from '../src/playlist/m3u-parser';
import { getAccount, parseXtreamInput, pickFormat, xtreamToM3U, XtreamAuthError } from '../src/playlist/xtream';

const USER = 'mario';
const PASS = 'p&ss#1';
let server: http.Server;
let base = '';
const saved = { ...env };

before(async () => {
    Object.assign(env, { allowPrivateUrls: true, outboundProxy: '', outboundProxyRequired: false });
    server = http.createServer((req, res) => {
        const u = new URL(req.url || '/', 'http://x');
        res.setHeader('Content-Type', 'application/json');
        if (u.pathname !== '/player_api.php') return void res.writeHead(404).end();
        if (u.searchParams.get('username') !== USER || u.searchParams.get('password') !== PASS) {
            return void res.end(JSON.stringify({ user_info: { auth: 0 } }));
        }
        switch (u.searchParams.get('action')) {
            case null:
                return void res.end(JSON.stringify({
                    user_info: { auth: 1, status: 'Active', exp_date: '1893456000', max_connections: '2', active_cons: '1', is_trial: '0', allowed_output_formats: ['m3u8', 'ts'] },
                    server_info: {}
                }));
            case 'get_live_categories':
                return void res.end(JSON.stringify([{ category_id: '1', category_name: 'Italia' }, { category_id: '2', category_name: 'Sport "HD"' }]));
            case 'get_live_streams':
                return void res.end(JSON.stringify([
                    { num: 1, name: 'Rai 1, HD', stream_id: 101, stream_icon: 'https://logo/rai1.png', epg_channel_id: 'Rai1.it', category_id: '1' },
                    { num: 2, name: 'Sky Sport', stream_id: 202, stream_icon: '', epg_channel_id: null, category_id: '2' },
                    { name: '', stream_id: 303 }
                ]));
            default:
                return void res.end('[]');
        }
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
    server.close();
    Object.assign(env, saved);
});

test('pasted get.php link is split into server and credentials', () => {
    const c = parseXtreamInput(`${'http://host:8080'}/get.php?username=u1&password=p%26w&type=m3u_plus`);
    assert.deepEqual(c, { server: 'http://host:8080', username: 'u1', password: 'p&w' });
    assert.equal(parseXtreamInput('http://host:8080/').server, 'http://host:8080');
    assert.equal(pickFormat('m3u8', ['ts']), 'ts');
    assert.equal(pickFormat('m3u8', []), 'm3u8');
});

test('account check: active subscription and wrong password', async () => {
    const acc = await getAccount({ server: base, username: USER, password: PASS });
    assert.equal(acc.status, 'Active');
    assert.equal(acc.expDate, 1893456000 * 1000);
    assert.equal(acc.maxConnections, 2);
    await assert.rejects(getAccount({ server: base, username: USER, password: 'nope' }), XtreamAuthError);
});

test('live channels become an M3U with provider EPG, groups and encoded credentials', async () => {
    const m3u = await xtreamToM3U({ xtream_server: base, xtream_username: USER, xtream_password: PASS, xtream_format: 'm3u8' });
    assert.match(m3u.split('\n')[0], /url-tvg=".*\/xmltv\.php\?username=mario&password=p%26ss%231"/);

    const parser = new M3UParser();
    parser.add(m3u);
    const r = parser.result();
    assert.equal(r.channels.length, 2, 'channels without a name are skipped');
    const [rai, sky] = r.channels;
    assert.equal(rai.id, 'tv|rai1.it');
    assert.equal(rai.name, 'Rai 1', 'quality removed from the channel name');
    assert.equal(rai.logo, 'https://logo/rai1.png');
    assert.deepEqual(rai.genre, ['Italia']);
    assert.equal(rai.streamInfo.urls[0].url, `${base}/live/mario/p%26ss%231/101.m3u8`);
    assert.deepEqual(sky.genre, ['Sport  HD'], 'quotes in category names are neutralised');
    assert.equal(sky.streamInfo.tvg.chno, '2');
    assert.ok(r.epgUrls[0].includes('/xmltv.php?'));
});
