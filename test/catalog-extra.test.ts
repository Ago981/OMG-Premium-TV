import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExtra } from '../src/addon/handlers';

test('catalog extra as sent by Stremio and Nuvio (percent-encoded once)', () => {
    assert.deepEqual(parseExtra('genre=News%20%26%20Info&skip=100'), { genre: 'News & Info', skip: 100 });
    assert.deepEqual(parseExtra('search=rai%201'), { search: 'rai 1' });
    assert.deepEqual(parseExtra('genre=%E2%9A%99%EF%B8%8F'), { genre: '⚙️' });
    assert.deepEqual(parseExtra('search=c%2B%2B&genre=Sport'), { search: 'c++', genre: 'Sport' });
    assert.deepEqual(parseExtra(undefined), {});
});
