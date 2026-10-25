import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPrograms } from '../src/epg/programs';

const h = (hh: number, mm = 0) => Date.UTC(2026, 9, 25, hh, mm);
const p = (source_id: number, title: string, start: number, stop: number) => ({ source_id, title, start_time: start, stop_time: stop });

// Come per Cielo: un blocco 05:30-23:35 e il programma vero, da due sorgenti; i prossimi si alternano.
test('in onda è il programma iniziato più di recente, i prossimi della sua sorgente', () => {
    const list = [
        p(1, 'TG24 Pagine', h(5, 30), h(23, 35)),
        p(2, 'Cucine da incubo', h(18), h(19)),
        p(2, 'Cucine da incubo 2', h(19), h(20)),
        p(1, 'Altro', h(19, 35), h(20, 30)),
        p(2, 'Film', h(20), h(22)),
    ];
    const { current, upcoming } = pickPrograms(list, h(18, 47), 2);
    assert.equal(current?.title, 'Cucine da incubo');
    assert.deepEqual(upcoming.map(x => x.title), ['Cucine da incubo 2', 'Film']);
});

test('i prossimi non si sovrappongono', () => {
    const list = [p(1, 'A', h(18), h(19)), p(1, 'B', h(19), h(20)), p(1, 'B bis', h(19, 30), h(20)), p(1, 'C', h(20), h(21))];
    const { upcoming } = pickPrograms(list, h(18, 30), 2);
    assert.deepEqual(upcoming.map(x => x.title), ['B', 'C']);
});

test('senza programma in onda: i prossimi di tutte le sorgenti; orari anche come stringhe', () => {
    const list = [{ source_id: '3', title: 'X', start_time: String(h(19)), stop_time: String(h(20)) }];
    const { current, upcoming } = pickPrograms(list, h(18), 2);
    assert.equal(current, null);
    assert.deepEqual(upcoming.map(x => x.title), ['X']);
});
