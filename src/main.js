import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { analyze, normalizePoints, parseImport } from './tracking.js';

const $ = id => document.getElementById(id);
const staticDeployment = import.meta.env.VITE_STATIC_DEPLOYMENT === 'true';
const baseUrl = import.meta.env.BASE_URL;
let saved;
try { saved = JSON.parse(localStorage.getItem('pettracer.archive.v1') || 'null'); } catch { /* Recover with an empty archive. */ }
let points = [], places = [], demo = false, pendingPlace = null;
try { points = normalizePoints(saved?.points || []); places = saved?.places || []; } catch { /* Invalid storage must not prevent startup. */ }
document.querySelector('#app').innerHTML = `
  <aside class="rail"><a class="brand" href="${baseUrl}" aria-label="Fieldnotes home">p<span>·</span></a><span class="rail-label">PETTRACER</span><span class="rail-bottom">FIELD<br>NOTES</span></aside>
  <main>
    <header><div><p class="eyebrow">A LITTLE MORE ROOM TO ROAM</p><h1>Fieldnotes<span> / </span><small>PetTracer</small></h1></div><span class="status"><i></i> <span id="source">Local archive</span></span></header>
    <section class="intro"><div><p class="eyebrow">THE WORLD, THROUGH THEIR WANDERINGS</p><h2>Every adventure.<br><em>A little better understood.</em></h2><p>A home for their paths, favourite places, and days outdoors.</p></div><div class="intro-note"><span class="sun">✳</span><p>Small paws.<br>Quite a big world.</p></div></section>
    <div class="toolbar"><div class="tabs" aria-label="History range"><button data-range="all" class="active">All time</button><button data-range="7">7 days</button><button data-range="1">Today</button></div><div class="dates"><label>From <input id="from" type="date"></label><label>To <input id="to" type="date"></label></div><div class="actions"><button id="demo">Try demo</button><button id="paste">Paste PetTracer JSON</button><label class="button primary" for="import">＋ Import file</label><input id="import" type="file" accept=".csv,.json" hidden></div></div>
    <p id="notice" role="status" aria-live="polite">Live PetTracer sync is not connected. Import your own data or explore the demo.</p>
    <section class="stats" aria-label="Tracking statistics"><article><p>RECORDED POINTS</p><strong id="count">0</strong><span>in the selected period</span></article><article><p>RECORDED PATH</p><strong id="distance">0 <small>km</small></strong><span>between nearby GPS fixes</span></article><article><p>ESTIMATED TIME OUTSIDE</p><strong id="outside">—</strong><span>outside your home radius</span></article><article><p>OBSERVED TIME</p><strong id="observed">0m</strong><span id="unknown">No recorded intervals yet</span></article></section>
    <section class="explorer"><div class="map-card"><div class="card-heading"><div><p class="eyebrow">FOLLOW THE FOOTSTEPS</p><h3>The wandering map</h3></div><button id="fit">↗ Fit path</button></div><div id="map" aria-label="Interactive tracking map"></div><p id="mapStatus" role="status" hidden></p><div class="map-footer"><span><i></i> Recorded path</span><label><input type="checkbox" id="showPoints" checked> Show points</label><span id="latest">No locations yet</span></div></div>
    <aside class="places-card"><p class="eyebrow">THE PLACES THEY CHOOSE</p><h3>Familiar corners</h3><p class="muted">Tap the map to mark home or a favourite spot.</p><form id="placeForm" hidden><label>Place name<input id="placeName" maxlength="100" required placeholder="The garden"></label><label>Radius in metres<input id="radius" type="number" min="5" max="10000" value="50" required></label><label class="check"><input id="isHome" type="checkbox"> This is home</label><button class="primary" type="submit">Save place</button><button id="cancelPlace" type="button">Cancel</button></form><div id="places"></div><div class="method"><span>↗</span><p>Time is estimated from consecutive fixes up to 15 minutes apart. Longer gaps are unknown. A home radius estimates time away from home; it cannot detect indoors.</p></div></aside></section>
    <section class="archive"><div><p class="eyebrow">KEEP THE WHOLE STORY</p><h3>Your lifetime archive</h3><p>${staticDeployment ? 'Points stay privately in this browser. Export a backup to move them between phones.' : 'Points stay in this browser until you back them up or share them.'}</p></div><div class="archive-actions"><button id="export">↓ Export JSON</button><button id="sync" ${staticDeployment ? 'disabled title="Server sync needs a private backend"' : ''}>${staticDeployment ? 'Shared sync unavailable' : '↻ Sync shared archive'}</button><button id="clear">Clear local data</button></div></section>
    <footer><span>FIELDNOTES / made for curious creatures</span><span>Independent companion interface · Not affiliated with PetTracer</span></footer>
    <dialog id="pasteDialog"><form method="dialog"><p class="eyebrow">IMPORT FROM PETTRACER</p><h3>Paste a device response</h3><p>In Firefox's Network panel, copy only the JSON response. It is processed in this browser and is not uploaded.</p><label for="pastedJson">PetTracer JSON</label><textarea id="pastedJson" rows="10" spellcheck="false" placeholder="{ &quot;fiFo&quot;: [...] }"></textarea><div><button value="cancel">Cancel</button><button id="importPasted" class="primary" value="default">Import fixes</button></div></form></dialog>
  </main>`;

const map = L.map('map', { zoomControl: false }).setView([51.505, -0.09], 14);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).on('tileerror', () => {
  $('mapStatus').hidden = false; $('mapStatus').textContent = 'Background map unavailable. Check network access to tile.openstreetmap.org; your recorded paths remain visible.';
}).addTo(map);
const pathsLayer = L.layerGroup().addTo(map), pointsLayer = L.layerGroup().addTo(map), placesLayer = L.layerGroup().addTo(map);
const duration = ms => { const minutes = Math.round(ms / 60000); return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`; };
const notify = message => { $('notice').textContent = message; };
function persist() {
  if (demo) return;
  localStorage.setItem('pettracer.archive.v1', JSON.stringify({ points, places }));
}
function selected() {
  const from = $('from').value ? new Date(`${$('from').value}T00:00:00`).getTime() : -Infinity;
  const to = $('to').value ? new Date(`${$('to').value}T00:00:00`) : null;
  if (to) to.setDate(to.getDate() + 1);
  return points.filter(p => Date.parse(p.time) >= from && Date.parse(p.time) < (to?.getTime() ?? Infinity));
}
function render(fit = false) {
  const filtered = selected(), stats = analyze(filtered, places);
  $('source').textContent = demo ? 'Demonstration data' : 'Local archive';
  $('count').textContent = filtered.length.toLocaleString();
  $('distance').innerHTML = `${(stats.distanceM / 1000).toFixed(2)} <small>km</small>`;
  $('outside').textContent = places.some(p => p.home) ? duration(stats.outsideMs) : 'Set home';
  $('observed').textContent = duration(stats.observedMs);
  $('unknown').textContent = `${duration(stats.unknownMs)} in gaps · ${points.length.toLocaleString()} lifetime points`;
  $('latest').textContent = filtered.length ? `Last fix ${new Date(filtered.at(-1).time).toLocaleString()}` : 'No locations in this period';
  pathsLayer.clearLayers(); pointsLayer.clearLayers(); placesLayer.clearLayers();
  for (const segment of stats.segments) if (segment.length > 1) L.polyline(segment.map(p => [p.lat, p.lng]), { color: '#d07939', weight: 4, opacity: 0.85 }).addTo(pathsLayer);
  if ($('showPoints').checked) for (const point of filtered) {
    const content = document.createElement('span'); content.textContent = new Date(point.time).toLocaleString();
    L.circleMarker([point.lat, point.lng], { radius: 4, weight: 2, color: '#fff', fillColor: '#296656', fillOpacity: 1 }).bindPopup(content).addTo(pointsLayer);
  }
  if (filtered.length) L.circleMarker([filtered.at(-1).lat, filtered.at(-1).lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#d07939', fillOpacity: 1 }).addTo(pointsLayer);
  $('places').replaceChildren();
  for (const place of places) {
    const label = document.createElement('span'); label.textContent = place.name;
    L.circle([place.lat, place.lng], { radius: place.radius, color: '#45796b', weight: 1, fillOpacity: 0.12 }).bindTooltip(label).addTo(placesLayer);
    const row = document.createElement('button'); row.className = 'place';
    const title = document.createElement('span'); title.textContent = `${place.home ? '⌂ ' : '○ '}${place.name}`;
    const time = document.createElement('strong'); time.textContent = duration(stats.visits[place.id]);
    const detail = document.createElement('small'); detail.textContent = `${place.radius}m radius${place.home ? ' · Home' : ''}`;
    row.append(title, time, detail); row.onclick = () => map.setView([place.lat, place.lng], 17); $('places').append(row);
  }
  if (!places.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Every explorer has a favourite spot. Add the first one on the map.'; $('places').append(empty); }
  if (fit && filtered.length) map.fitBounds(filtered.map(p => [p.lat, p.lng]), { padding: [35, 35], maxZoom: 17 });
}
function dateValue(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
for (const button of document.querySelectorAll('[data-range]')) button.onclick = () => {
  document.querySelectorAll('[data-range]').forEach(b => b.classList.toggle('active', b === button));
  $('to').value = ''; $('from').value = '';
  if (button.dataset.range !== 'all') { const start = new Date(); start.setDate(start.getDate() - Number(button.dataset.range) + 1); $('from').value = dateValue(start); }
  render(true);
};
for (const id of ['from', 'to']) $(id).onchange = () => { document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active')); render(true); };
$('showPoints').onchange = () => render();
$('fit').onclick = () => render(true);
map.on('click', event => { pendingPlace = event.latlng; $('placeForm').hidden = false; $('placeName').focus(); });
$('cancelPlace').onclick = () => { pendingPlace = null; $('placeForm').hidden = true; };
$('placeForm').onsubmit = event => {
  event.preventDefault(); if (!pendingPlace) return;
  const name = $('placeName').value.trim(); if (!name) return;
  const home = $('isHome').checked;
  if (home) places = places.map(p => ({ ...p, home: false }));
  places.push({ id: crypto.randomUUID(), name, lat: pendingPlace.lat, lng: pendingPlace.lng, radius: Number($('radius').value), home });
  try { persist(); } catch { notify('Browser storage is full. Export a backup before closing.'); }
  $('placeForm').hidden = true; $('placeForm').reset(); pendingPlace = null; render();
};
function importText(text, filename) {
  try {
    if (text.length > 2000000) throw new Error('Import up to 2 MB at a time.');
    const imported = parseImport(text, filename);
    const archivePlaces = filename.toLowerCase().endsWith('.json') ? JSON.parse(text).places : null;
    if (archivePlaces && (!Array.isArray(archivePlaces) || archivePlaces.length > 100 || archivePlaces.some(p => typeof p.id !== 'string' || typeof p.name !== 'string' || !Number.isFinite(p.lat) || Math.abs(p.lat) > 90 || !Number.isFinite(p.lng) || Math.abs(p.lng) > 180 || !Number.isFinite(p.radius) || p.radius < 5 || p.radius > 10000 || typeof p.home !== 'boolean') || archivePlaces.filter(p => p.home).length > 1)) throw new Error('Invalid places in archive.');
    const previous = demo ? [] : points;
    points = mergePoints(previous, imported); if (demo) places = []; if (archivePlaces) places = archivePlaces; demo = false; $('demo').textContent = 'Try demo';
    persist(); render(true); notify(`Imported ${imported.length} points. Duplicate fixes are kept only once.`);
  } catch (error) { notify(error.message); }
}
$('import').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 2000000) notify('Import files up to 2 MB at a time.');
  else importText(await file.text(), file.name);
  event.target.value = '';
};
$('paste').onclick = () => { $('pastedJson').value = ''; $('pasteDialog').showModal(); $('pastedJson').focus(); };
$('importPasted').onclick = event => {
  event.preventDefault();
  const text = $('pastedJson').value.trim();
  if (!text) { notify('Paste a PetTracer JSON response first.'); return; }
  importText(text, 'pettracer.json');
  $('pasteDialog').close();
};
function mergePoints(a, b) { return [...new Map([...a, ...b].map(p => [`${p.time}/${p.lat}/${p.lng}`, p])).values()].sort((x, y) => x.time.localeCompare(y.time)); }
$('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ points, places }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `pettracer-${demo ? 'demo-' : ''}${dateValue(new Date())}.json`; link.click(); URL.revokeObjectURL(url);
  notify('Exported all lifetime points and places as a restorable JSON backup.');
};
$('clear').onclick = () => {
  if (!confirm(`Clear points and places from this browser? Export a backup first.${staticDeployment ? '' : ' The shared archive is unaffected.'}`)) return;
  points = []; places = []; demo = false; persist(); render(); notify('Local archive cleared.');
};
$('demo').onclick = () => {
  if (demo) { demo = false; const local = JSON.parse(localStorage.getItem('pettracer.archive.v1') || '{}'); points = local.points || []; places = local.places || []; $('demo').textContent = 'Try demo'; render(true); notify('Returned to your local archive.'); return; }
  const start = new Date(); start.setHours(9, 0, 0, 0);
  points = Array.from({ length: 180 }, (_, i) => ({ lat: 51.506 + Math.sin(i / 18) * 0.0015 * Math.sin(i / 57), lng: -0.09 + Math.sin(i / 27) * 0.003, time: new Date(start.getTime() + i * 60000).toISOString() }));
  places = [{ id: 'demo-home', name: 'Home & garden', lat: 51.506, lng: -0.09, radius: 60, home: true }, { id: 'demo-corner', name: 'The quiet corner', lat: 51.507, lng: -0.0875, radius: 80, home: false }];
  demo = true; $('demo').textContent = 'Exit demo'; $('from').value = ''; $('to').value = ''; render(true); notify('Demonstration data only — these are fictional locations. Your local archive is untouched.');
};
$('sync').onclick = async () => {
  if (staticDeployment) { notify('GitHub Pages stores data only in this browser. Use Export JSON and Import points to move history between phones.'); return; }
  if (demo) { notify('Exit demo before syncing your shared archive.'); return; }
  $('sync').disabled = true;
  try {
    // Read before writing so a fresh phone preserves existing shared places.
    let remote = [], remotePlaces = [], cursor = null;
    do {
      const response = await fetch(`/api/archive${cursor ? `?after=${cursor}` : ''}`, { cache: 'no-store', redirect: 'error' });
      if (!response.ok) throw new Error(response.status === 503 ? 'Shared archive needs Cloudflare D1 and Access configuration. See README.' : 'Shared archive unavailable. Sign in through your Cloudflare Access site.');
      const data = await response.json(); remote = remote.concat(data.points); remotePlaces = data.places; cursor = data.next;
    } while (cursor);
    points = mergePoints(remote, points);
    const shared = new Map(remotePlaces.map(p => [p.id, p])); for (const p of places) shared.set(p.id, p); places = [...shared.values()];
    // Keep one home when merging independently edited browser archives.
    let homeSeen = false; places = places.map(p => { const home = p.home && !homeSeen; homeSeen ||= home; return { ...p, home }; });
    for (let i = 0; i < Math.max(1, points.length); i += 1000) {
      const response = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points: points.slice(i, i + 1000), places }) });
      if (!response.ok) throw new Error('Could not save shared archive. Your local data is retained; retry sync.');
    }
    persist(); render(true); notify('Shared archive synced. Open this site and sync on your other phone to load the same history.');
  } catch (error) { notify(error.message); } finally { $('sync').disabled = false; }
};
render(true);
