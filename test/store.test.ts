import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { closeDatabase, db, initDatabase } from '../src/db';
import { decrypt, encrypt, initAppSecret, sign, unsign } from '../src/security/crypto';
import {
    checkConfigPassword, ConfigValidationError, createConfig, deleteConfigs, getConfig, listConfigs, normalizeConfig,
    passwordVersion, setConfigPassword, upsertLegacyConfig
} from '../src/store/config-store';
import { getGuides, lookupIds } from '../src/epg/epg-service';

/**
 * Richiede un PostgreSQL di test: TEST_DATABASE_URL=postgres://... npm test
 * ATTENZIONE: lo schema "public" di quel database viene cancellato e ricreato.
 */
const url = process.env.TEST_DATABASE_URL || '';

describe('database', { skip: url ? false : 'TEST_DATABASE_URL not set' }, () => {
    before(async () => {
        await initDatabase(url);
        await db().run('DROP SCHEMA public CASCADE');
        await db().run('CREATE SCHEMA public');
        await initDatabase(url);
        await initAppSecret();
    });

    after(async () => {
        await closeDatabase();
    });

    test('normalizeConfig converts legacy string booleans and validates URLs', () => {
        const c = normalizeConfig({ m3u: ' https://a/x.m3u ', epg_enabled: 'true', mask_streams: 'false', force_proxy: 'true', unknown: 'x' });
        assert.equal(c.m3u, 'https://a/x.m3u');
        assert.equal(c.epg_enabled, true);
        assert.equal(c.mask_streams, false);
        // opzione rimossa: i vecchi valori vengono ignorati
        assert.equal((c as unknown as Record<string, unknown>).force_proxy, undefined);
        assert.equal((c as unknown as Record<string, unknown>).unknown, undefined);
        assert.throws(() => normalizeConfig({ m3u: 'javascript:alert(1)' }, { strict: true }), ConfigValidationError);
        assert.throws(() => normalizeConfig({ m3u: 'https://a', update_interval: '12h' }, { strict: true }), ConfigValidationError);
        assert.doesNotThrow(() => normalizeConfig({ m3u: 'https://a,omg://generated/abc_-1' }, { strict: true }));
    });

    test('configurations: create, password, legacy, delete', async () => {
        const cfg = normalizeConfig({ m3u: 'https://a/x.m3u' }, { strict: true });
        await assert.rejects(createConfig(cfg, '123'), ConfigValidationError);

        const rec = await createConfig(cfg, 'secret12', 'Casa');
        assert.match(rec.id, /^[\w-]{22}$/);
        assert.ok(checkConfigPassword(rec, 'secret12'));
        assert.ok(!checkConfigPassword(rec, 'wrong'));

        const v1 = passwordVersion(rec);
        await setConfigPassword(rec.id, 'another1');
        const updated = await getConfig(rec.id);
        assert.ok(updated && checkConfigPassword(updated, 'another1'));
        assert.notEqual(passwordVersion(updated!), v1);

        const l1 = await upsertLegacyConfig(normalizeConfig({ m3u: 'https://legacy' }));
        const l2 = await upsertLegacyConfig(normalizeConfig({ m3u: 'https://legacy' }));
        assert.equal(l1.id, l2.id);
        assert.ok(l1.legacy);
        assert.ok(!checkConfigPassword(l1, ''));

        assert.equal((await listConfigs()).length, 2);
        assert.equal(await deleteConfigs([rec.id, l1.id, 'missing']), 2);
        assert.equal((await listConfigs()).length, 0);
    });

    test('signed and encrypted tokens', () => {
        const s = sign({ a: 1 }, 60000, 'x');
        assert.deepEqual({ ...unsign<{ a: number }>(s, 'x'), exp: 0 }, { a: 1, exp: 0 });
        assert.equal(unsign(s, 'other-purpose'), null);
        assert.equal(unsign(s.slice(0, -2) + 'AA', 'x'), null);
        assert.equal(unsign(sign({ a: 1 }, -1, 'x'), 'x'), null);

        const e = encrypt({ u: 'https://proxy/?api_password=secret' }, 60000, 'stream');
        assert.ok(!Buffer.from(e, 'base64url').toString('latin1').includes('secret'));
        assert.equal(decrypt<{ u: string }>(e, 'stream')?.u, 'https://proxy/?api_password=secret');
        assert.equal(decrypt(e, 'other'), null);
    });

    test('EPG guides: tvg-id, suffix fallback and display-name fallback in few queries', async () => {
        const now = Date.now();
        const src = await db().get<{ id: number }>("INSERT INTO epg_sources (url, status, updated_at, last_used) VALUES ('https://e', 'ok', ?, ?) RETURNING id", [now, now]);
        const sid = Number(src!.id);
        await db().insertMany('epg_channels', ['source_id', 'channel_id', 'name_key', 'icon'], [
            [sid, 'rai1', 'rai1', 'https://icon/rai1.png'],
            [sid, 'c5.mediaset', 'canale5', null]
        ]);
        const h = 3600000;
        await db().insertMany('epg_programs', ['source_id', 'channel_id', 'start_time', 'stop_time', 'title', 'description', 'category'], [
            [sid, 'rai1', now - h, now + h, 'Now on Rai', 'd', 'c'],
            [sid, 'rai1', now + h, now + 2 * h, 'Next on Rai', null, null],
            [sid, 'c5.mediaset', now - h, now + h, 'Now on C5', null, null],
            [-sid, 'rai1', now - h, now + h, 'Staging must not show', null, null]
        ]);
        assert.deepEqual(lookupIds('Rai1.it'), ['rai1.it', 'rai1']);

        const guides = await getGuides([sid], [
            { key: 'a', tvgId: 'rai1.it', name: 'Rai 1' },
            { key: 'b', tvgId: 'canale5', name: 'Canale 5' },
            { key: 'c', tvgId: 'nothing', name: 'Nothing' }
        ]);
        assert.equal(guides.get('a')?.current?.title, 'Now on Rai');
        assert.equal(guides.get('a')?.upcoming[0]?.title, 'Next on Rai');
        assert.equal(guides.get('a')?.icon, 'https://icon/rai1.png');
        assert.equal(guides.get('b')?.current?.title, 'Now on C5');
        assert.equal(guides.has('c'), false);
    });
});
