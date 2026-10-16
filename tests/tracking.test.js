import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePoints, analyze, parseImport } from '../src/tracking.js';

const point = (minute, lat = 51, lng = 0) => ({ time: `2026-10-16T10:${String(minute).padStart(2,'0')}:00Z`, lat, lng });
test('imports sort, normalize and deduplicate fixes', () => {
  assert.deepEqual(normalizePoints([point(2), point(1), point(2)]).map(p => p.time), ['2026-10-16T10:01:00.000Z', '2026-10-16T10:02:00.000Z']);
});
test('invalid coordinates and ambiguous timestamps are rejected', () => {
  for (const p of [{ ...point(1), lat: '' }, { ...point(1), lat: 91 }, { ...point(1), time: '2026-10-16T10:00:00' }]) assert.throws(() => normalizePoints([p]));
});
test('long gaps split paths and do not inflate distance or time', () => {
  const stats = analyze(normalizePoints([point(0), point(5), point(30, 52)]));
  assert.equal(stats.observedMs, 5 * 60000);
  assert.equal(stats.unknownMs, 25 * 60000);
  assert.equal(stats.distanceM, 0);
  assert.equal(stats.segments.length, 2);
});
test('outside and overlapping place time use preceding observed fix', () => {
  const home = { id: 'home', lat: 51, lng: 0, radius: 50, home: true };
  const garden = { id: 'garden', lat: 51.001, lng: 0, radius: 50, home: false };
  const stats = analyze(normalizePoints([point(0), point(5, 51.001), point(10, 51.001)]), [home, garden]);
  assert.equal(stats.outsideMs, 5 * 60000);
  assert.equal(stats.visits.home, 5 * 60000);
  assert.equal(stats.visits.garden, 5 * 60000);
  assert.ok(stats.distanceM > 100 && stats.distanceM < 120);
});
test('single fixes have no invented duration', () => {
  assert.equal(analyze([point(0)]).observedMs, 0);
});
test('CSV supports reordered columns and timezone-aware times', () => {
  assert.equal(parseImport('time,lng,lat\n2026-10-16T10:00:00Z,0,51', 'fixes.csv')[0].lat, 51);
  assert.throws(() => parseImport('latitude,longitude\n51,0', 'fixes.csv'));
});
