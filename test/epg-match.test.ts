import { test } from 'node:test';
import assert from 'node:assert/strict';
import { epgCandidates, epgIndex, lookupIds } from '../src/epg/epg-service';
import { M3UParser } from '../src/playlist/m3u-parser';

const rows = [
    { channel_id: 'old.rakuten', name_key: 'filmtoprakutentv' }, // stesso nome in un'altra guida, magari senza programmi
    { channel_id: 'it2600002f6', name_key: 'filmtoprakutentv' },
    { channel_id: 'rai1.it', name_key: 'rai1' },
];

// "Film Top - Rakuten TV": tvg-id che la guida non conosce, stesso nome della guida.
test('se il tvg-id non c\'è nella guida, il canale si abbina per nome', () => {
    const p = new M3UParser();
    p.add('#EXTM3U\n#EXTINF:-1 tvg-name="Film Top - Rakuten TV" tvg-id="RakutenTopFreeItRakutenTv.it",Film Top - Rakuten TV\nhttps://x/a.m3u8\n');
    const ch = p.result().channels[0];
    const ids = epgCandidates({ key: ch.id, tvgId: ch.streamInfo.tvg.id, name: ch.name }, lookupIds(ch.streamInfo.tvg.id), epgIndex(rows, true));
    assert.deepEqual(ids.slice(0, 2), ['rakutentopfreeitrakutentv.it', 'rakutentopfreeitrakutentv']);
    assert.ok(ids.includes('old.rakuten') && ids.includes('it2600002f6')); // tutti quelli col nome, non solo il primo
});

test('senza tvg-id: per nome, anche con lo smart matching spento', () => {
    const ids = epgCandidates({ key: 'k', name: 'RAI 1' }, [], epgIndex(rows, false));
    assert.deepEqual(ids, ['rai1.it']);
});

test('smart matching anche quando il canale ha un tvg-id', () => {
    const ids = epgCandidates({ key: 'k', tvgId: 'x.y', name: 'Rai 1 HD' }, lookupIds('x.y'), epgIndex(rows, true));
    assert.ok(ids.includes('rai1.it'));
});
