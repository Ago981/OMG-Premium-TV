import { looseKey } from '../src/playlist/playlist-service';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { M3UParser, normalizeId, parseRemapping, NO_STREAM_NAME } from '../src/playlist/m3u-parser';

const PLAYLIST = `#EXTM3U url-tvg="https://epg.example/a.xml,https://epg.example/b.xml.gz"
#EXTINF:-1 tvg-id="Rai1.it" tvg-logo="https://x/rai1.png" tvg-chno="1" group-title="Generalisti",Rai 1 (HD)
#EXTVLCOPT:http-referrer=https://ref.example/
#EXTVLCOPT:http-user-agent=MyUA
https://s.example/rai1.m3u8
#EXTINF:-1 tvg-id="rai1.it" group-title="Backup",Rai 1 backup
https://s.example/rai1-b.m3u8
#EXTINF:-1 group-title="Sport;Calcio",Sky Sport [IT]
#EXTHTTP:{"Origin":"https://o.example"}
https://s.example/sky.mpd
#EXTINF:-1 tvg-id="dummy" group-title="",Dummy
null
`;

test('normalizeId lowercases, strips symbols and @suffix', () => {
    assert.equal(normalizeId('Canale 5.it@SD'), 'canale5.it');
    assert.equal(normalizeId(undefined), '');
});

test('parses channels, merges duplicate ids and keeps ids stable', () => {
    const p = new M3UParser();
    p.add(PLAYLIST);
    const r = p.result();
    assert.deepEqual(r.epgUrls, ['https://epg.example/a.xml', 'https://epg.example/b.xml.gz']);
    const ids = r.channels.map(c => c.id);
    assert.deepEqual(ids, ['tv|rai1.it', 'tv|skysport', 'tv|dummy']);

    const rai = r.channels[0];
    assert.equal(rai.name, 'Rai 1');
    assert.equal(rai.streamInfo.urls.length, 2);
    assert.equal(rai.streamInfo.urls[0].headers.referrer, 'https://ref.example/');
    assert.equal(rai.streamInfo.urls[0].headers['User-Agent'], 'MyUA');
    assert.deepEqual(rai.genre, ['Generalisti', 'Backup']);
    assert.equal(rai.streamInfo.tvg.chno, '1');

    const sky = r.channels[1];
    assert.deepEqual(sky.genre, ['Sport', 'Calcio']);
    assert.equal(sky.streamInfo.urls[0].headers.Origin, 'https://o.example');

    assert.equal(r.channels[2].streamInfo.urls[0].name, NO_STREAM_NAME);
    assert.deepEqual(r.genres, ['Generalisti', 'Sport', 'Calcio', 'Altri Canali']);
});

test('id suffix is added to channels without tvg-id', () => {
    const p = new M3UParser(new Map(), 'it');
    p.add('#EXTM3U\n#EXTINF:-1,Canale 5\nhttps://s/c5.m3u8\n');
    assert.equal(p.result().channels[0].id, 'tv|canale5.it');
});

test('remapping rules change the channel id', () => {
    const rules = parseRemapping('# comment\nrai1.it = rai1.epg\n');
    const p = new M3UParser(rules);
    p.add(PLAYLIST);
    assert.equal(p.result().channels[0].id, 'tv|rai1.epg');
});

test('loose key finds channels whose id or name changed slightly', () => {
    assert.equal(looseKey('vetrinaprimafilalive'), looseKey('Vetrina Primafila Live HD'));
    assert.equal(looseKey('rai1'), looseKey('rai1.it'));
    assert.notEqual(looseKey('rai1'), looseKey('rai2'));
});
