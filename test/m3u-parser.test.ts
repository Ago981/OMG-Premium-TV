import { looseKey } from '../src/playlist/playlist-service';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { M3UParser, normalizeId, parseRemapping, stripDashes, NO_STREAM_NAME } from '../src/playlist/m3u-parser';

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
    for (const n of ['Sky Cinema Uno SD', 'Sky Cinema Uno (SD)', 'Sky Cinema Uno [SD]', 'Sky Cinema Uno SD+', 'SD Sky Cinema Uno', '[SD] Sky Cinema Uno', 'Sky Cinema Uno FHD']) {
        assert.equal(looseKey(n), 'skycinemauno', n);
    }
    assert.equal(looseKey('4Kids TV'), '4kidstv', 'a tag glued to a word is not a tag');
});

test('runs of 3+ dashes around group and channel names are removed', () => {
    const p = new M3UParser();
    p.add('#EXTM3U\n#EXTINF:-1 group-title="-----DOCUMENTARI-----",-----RAI 1-----\nhttp://x/1.m3u8\n#EXTINF:-1 group-title="Sport - Calcio",TG - Edizione\nhttp://x/2.m3u8\n');
    const [rai, tg] = p.result().channels;
    assert.equal(rai.name, 'RAI 1');
    assert.deepEqual(rai.genre, ['DOCUMENTARI']);
    assert.equal(rai.id, 'tv|rai1', 'id unchanged');
    assert.equal(tg.name, 'TG - Edizione', 'single dashes inside names are kept');
    assert.deepEqual(tg.genre, ['Sport - Calcio']);
    assert.equal(stripDashes('---'), '---', 'a name made only of dashes is left as is');
});

test('channels sharing a tvg-id are merged only when they are the same channel', () => {
    const p = new M3UParser();
    p.add([
        '#EXTM3U',
        '#EXTINF:-1 tvg-id="SkyCinemaUno.it",Sky Cinema Uno FHD', 'http://x/1.m3u8',
        '#EXTINF:-1 tvg-id="SkyCinemaUno.it",Sky Cinema Uno HD', 'http://x/2.m3u8',
        '#EXTINF:-1 tvg-id="SkyCinemaUno.it",Sky Sport Max HD', 'http://x/3.m3u8',
        '#EXTINF:-1 tvg-id="SkyCinemaUno.it",Sky Sport Max FHD', 'http://x/4.m3u8',
        ''
    ].join('\n'));
    const [uno, max] = p.result().channels;
    assert.equal(p.result().channels.length, 2);
    assert.equal(uno.id, 'tv|skycinemauno.it', 'the first channel keeps its id');
    assert.deepEqual(uno.streamInfo.urls.map(u => u.url), ['http://x/1.m3u8', 'http://x/2.m3u8']);
    assert.equal(max.name, 'Sky Sport Max', 'HD and FHD versions: name without quality');
    assert.deepEqual(max.streamInfo.urls.map(u => u.url), ['http://x/3.m3u8', 'http://x/4.m3u8']);

    // Con il remapping l'unione resta una scelta esplicita dell'utente
    const r = new M3UParser(new Map([['a', 'same'], ['b', 'same']]));
    r.add('#EXTM3U\n#EXTINF:-1 tvg-id="a",Canale A\nhttp://x/a\n#EXTINF:-1 tvg-id="b",Canale B\nhttp://x/b\n');
    assert.equal(r.result().channels.length, 1);
});

test('a channel with several quality versions is named without the quality tag', () => {
    const p = new M3UParser();
    p.add([
        '#EXTM3U',
        '#EXTINF:-1 tvg-id="SkyCinemaUno.it",Sky Cinema Uno FHD', 'http://x/1.m3u8',
        '#EXTINF:-1 tvg-id="SkyCinemaUno.it",Sky Cinema Uno HD', 'http://x/2.m3u8',
        '#EXTINF:-1 tvg-id="SkyCinemaUno.it",Sky Cinema Uno SD', 'http://x/3.m3u8',
        '#EXTINF:-1 tvg-id="Rai4K.it",Rai 4K', 'http://x/4.m3u8',
        '#EXTINF:-1 tvg-id="Rai4K.it",Rai 4K (backup)', 'http://x/5.m3u8',
        '#EXTINF:-1 tvg-id="Canale5.it",Canale 5 HD', 'http://x/6.m3u8',
        ''
    ].join('\n'));
    const [uno, rai4k, c5] = p.result().channels;
    assert.equal(uno.name, 'Sky Cinema Uno');
    assert.equal(uno.id, 'tv|skycinemauno.it', 'id unchanged');
    assert.deepEqual(uno.streamInfo.urls.map(u => u.name), ['Sky Cinema Uno FHD', 'Sky Cinema Uno HD', 'Sky Cinema Uno SD'], 'versions stay on the streams');
    assert.equal(rai4k.name, 'Rai 4K', 'a tag shared by every version is part of the name');
    assert.equal(c5.name, 'Canale 5 HD', 'a single-version channel keeps its name');
});

test('without tvg-id, quality versions of a channel are one channel and old ids still resolve', async () => {
    const p = new M3UParser();
    p.add('#EXTM3U\n#EXTINF:-1,Canale 5 HD\nhttp://x/1.m3u8\n#EXTINF:-1,Canale 5 FHD\nhttp://x/2.m3u8\n#EXTINF:-1,Rai 4K\nhttp://x/3.m3u8\n');
    const [c5, rai4k] = p.result().channels;
    assert.equal(c5.id, 'tv|canale5');
    assert.equal(c5.name, 'Canale 5');
    assert.deepEqual(c5.streamInfo.urls.map(u => u.name), ['Canale 5 HD', 'Canale 5 FHD']);
    assert.equal(rai4k.name, 'Rai 4K', 'single version keeps its full name');
    // Un canale salvato in Stremio/Nuvio con il vecchio id ("canale5hd") viene ritrovato
    assert.equal(looseKey('canale5hd'), looseKey(c5.id.replace('tv|', '')));
});
