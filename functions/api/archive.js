import { normalizePoints } from '../../src/tracking.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const after = url.searchParams.get('after') || '';
  const { results } = await env.DB.prepare('SELECT rowid AS cursor, time, lat, lng FROM points WHERE rowid > ? ORDER BY rowid LIMIT 5000').bind(Number(after) || 0).all();
  const { results: places } = await env.DB.prepare('SELECT * FROM places').all();
  return Response.json({ points: results.map(({ cursor, ...p }) => p), places: places.map(p => ({ ...p, home: Boolean(p.home) })), next: results.length === 5000 ? results.at(-1).cursor : null });
}

export async function onRequestPost({ request, env }) {
  if (Number(request.headers.get('Content-Length')) > 2000000) return new Response('Import too large', { status: 413 });
  try {
    const text = await request.text();
    if (text.length > 2000000) return new Response('Import too large', { status: 413 });
    const body = JSON.parse(text);
    const points = normalizePoints(body.points);
    if (points.length > 10000) throw new Error('Import at most 10,000 points at a time.');
    const places = body.places;
    if (!Array.isArray(places) || places.length > 100 || places.filter(p => p.home).length > 1) throw new Error('Invalid places.');
    for (const p of places) {
      if (typeof p.id !== 'string' || p.id.length > 100 || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 100 || !Number.isFinite(p.lat) || Math.abs(p.lat) > 90 || !Number.isFinite(p.lng) || Math.abs(p.lng) > 180 || !Number.isFinite(p.radius) || p.radius < 5 || p.radius > 10000 || typeof p.home !== 'boolean') throw new Error('Invalid place.');
    }
    // Points are append-only; retrying an import is safe.
    for (let i = 0; i < points.length; i += 100) await env.DB.batch(points.slice(i, i + 100).map(p => env.DB.prepare('INSERT OR IGNORE INTO points(time, lat, lng) VALUES (?, ?, ?)').bind(p.time, p.lat, p.lng)));
    if (places.length) await env.DB.batch([
      ...(places.some(p => p.home) ? [env.DB.prepare('UPDATE places SET home = 0')] : []),
      ...places.map(p => env.DB.prepare('INSERT INTO places(id,name,lat,lng,radius,home) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,lat=excluded.lat,lng=excluded.lng,radius=excluded.radius,home=excluded.home').bind(p.id, p.name, p.lat, p.lng, p.radius, Number(p.home)))
    ]);
    return Response.json({ imported: points.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
