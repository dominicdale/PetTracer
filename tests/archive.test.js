import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequestGet, onRequestPost } from '../functions/api/archive.js';
import { onRequest } from '../functions/api/_middleware.js';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_archive.sql', import.meta.url), 'utf8'));
  const prepare = (sql, args = []) => ({
    bind: (...values) => prepare(sql, values),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args)
  });
  return { prepare, batch: async statements => {
    db.exec('BEGIN');
    try { const result = []; for (const s of statements) result.push(await s.run()); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }};
}
test('shared archive stores fixes, deduplicates retries, and returns places', async () => {
  const env = { DB: database() };
  const body = { points: [{ lat: 51, lng: 0, time: '2026-10-16T10:00:00Z' }], places: [{ id: 'home', name: 'Home', lat: 51, lng: 0, radius: 50, home: true }] };
  const post = () => onRequestPost({ env, request: new Request('https://example.test/api/archive', { method: 'POST', body: JSON.stringify(body) }) });
  assert.equal((await post()).status, 200);
  assert.equal((await post()).status, 200);
  const response = await onRequestGet({ env, request: new Request('https://example.test/api/archive') });
  const archive = await response.json();
  assert.equal(archive.points.length, 1);
  assert.equal(archive.places[0].home, true);
  assert.equal(archive.next, null);
});
test('invalid imports are rejected before database writes', async () => {
  const env = { DB: database() };
  const response = await onRequestPost({ env, request: new Request('https://example.test/api/archive', { method: 'POST', body: JSON.stringify({ points: [{ lat: 999, lng: 0, time: '2026-10-16T10:00:00Z' }], places: [] }) }) });
  assert.equal(response.status, 400);
  assert.equal((await (await onRequestGet({ env, request: new Request('https://example.test/api/archive') })).json()).points.length, 0);
});
test('archive fails closed without Access configuration or a valid token', async () => {
  const next = () => { throw new Error('Unauthorized request reached database'); };
  const request = new Request('https://example.test/api/archive');
  assert.equal((await onRequest({ request, env: {}, next })).status, 503);
  assert.equal((await onRequest({ request, env: { ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com', ACCESS_AUD: 'test' }, next })).status, 401);
  const forged = new Request(request, { headers: { 'Cf-Access-Jwt-Assertion': 'forged-token' } });
  assert.equal((await onRequest({ request: forged, env: { ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com', ACCESS_AUD: 'test' }, next })).status, 401);
});
