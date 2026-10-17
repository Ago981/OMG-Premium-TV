import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'stream';
import zlib from 'zlib';
import { parseXmltv, parseXmltvDate, type XmltvChannel, type XmltvProgramme } from '../src/epg/xmltv-parser';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv>
  <channel id="rai1.it"><display-name lang="it">Rai 1</display-name><icon src="https://x/rai1.png"/></channel>
  <programme start="20240101120000 +0100" stop="20240101130000 +0100" channel="rai1.it">
    <title lang="it">Telegiornale &amp; meteo</title>
    <desc><![CDATA[Notizie <b>del</b> giorno]]></desc>
    <category>News</category>
  </programme>
  <programme start="20240101130000 +0100" stop="20240101140000 +0100" channel="rai1.it"><title>Film è</title></programme>
  <programme start="bad" stop="20240101140000 +0100" channel="rai1.it"><title>Skipped</title></programme>
</tv>`;

function collect(source: Readable) {
    const channels: XmltvChannel[] = [];
    const programmes: XmltvProgramme[] = [];
    let flushes = 0;
    return parseXmltv(source, {
        channel: c => channels.push(c),
        programme: p => programmes.push(p),
        shouldFlush: () => false,
        flush: async () => {
            flushes++;
        }
    }).then(outcome => ({ outcome, channels, programmes, flushes }));
}

/** Spezza il buffer in pezzi da 7 byte: verifica la gestione dei caratteri multibyte a cavallo. */
function chunked(buf: Buffer): Readable {
    const parts: Buffer[] = [];
    for (let i = 0; i < buf.length; i += 7) parts.push(buf.subarray(i, i + 7));
    return Readable.from(parts);
}

test('parseXmltvDate handles offsets and missing timezone', () => {
    assert.equal(parseXmltvDate('20240101120000 +0100'), Date.parse('2024-01-01T11:00:00Z'));
    assert.equal(parseXmltvDate('20240101120000'), Date.parse('2024-01-01T12:00:00Z'));
    assert.equal(parseXmltvDate('nope'), null);
});

test('streams plain XML in small chunks', async () => {
    const r = await collect(chunked(Buffer.from(XML)));
    assert.equal(r.outcome.kind, 'xml');
    assert.deepEqual(r.channels, [{ id: 'rai1.it', displayName: 'Rai 1', icon: 'https://x/rai1.png' }]);
    assert.equal(r.programmes.length, 2);
    assert.equal(r.programmes[0].title, 'Telegiornale & meteo');
    assert.equal(r.programmes[0].description, 'Notizie <b>del</b> giorno');
    assert.equal(r.programmes[0].category, 'News');
    assert.equal(r.programmes[1].title, 'Film è');
    assert.ok(r.flushes >= 1);
});

test('detects gzip by magic bytes', async () => {
    const r = await collect(chunked(zlib.gzipSync(Buffer.from(XML))));
    assert.equal(r.programmes.length, 2);
});

test('non-XML content is treated as a list of EPG URLs', async () => {
    const r = await collect(Readable.from([Buffer.from('https://a/epg.xml\n# comment\nhttps://b/epg.xml.gz\n')]));
    assert.deepEqual(r.outcome, { kind: 'list', urls: ['https://a/epg.xml', 'https://b/epg.xml.gz'] });
});
