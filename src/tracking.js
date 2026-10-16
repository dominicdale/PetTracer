export function normalizePoints(input) {
  if (!Array.isArray(input)) throw new Error('Expected a JSON array of tracking points.');
  const points = input.map((p, index) => {
    const lat = Number(p.lat), lng = Number(p.lng);
    const time = Date.parse(p.time);
    if (p.lat == null || p.lng == null || p.lat === '' || p.lng === '' || !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180 || !Number.isFinite(time)) {
      throw new Error(`Point ${index + 1}: provide valid lat, lng and an ISO timestamp in time.`);
    }
    if (typeof p.time !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(p.time)) throw new Error(`Point ${index + 1}: time must include a timezone (Z or +HH:MM).`);
    return { lat, lng, time: new Date(time).toISOString() };
  });
  return [...new Map(points.map(p => [`${p.time}/${p.lat}/${p.lng}`, p])).values()].sort((a, b) => a.time.localeCompare(b.time));
}

export function distance(a, b) {
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat) * rad, dlng = (b.lng - a.lng) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function analyze(points, places = [], maxGapMinutes = 15) {
  const visits = Object.fromEntries(places.map(p => [p.id, 0]));
  let distanceM = 0, outsideMs = 0, observedMs = 0, unknownMs = 0;
  const segments = [];
  let segment = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i], previous = points[i - 1];
    if (previous) {
      const elapsed = Date.parse(point.time) - Date.parse(previous.time);
      if (elapsed > maxGapMinutes * 60000) {
        unknownMs += elapsed;
        if (segment.length) segments.push(segment);
        segment = [];
      } else if (elapsed > 0) {
        distanceM += distance(previous, point);
        observedMs += elapsed;
        const containing = places.filter(place => distance(previous, place) <= place.radius);
        for (const place of containing) visits[place.id] += elapsed;
        const home = places.find(place => place.home);
        if (home && distance(previous, home) > home.radius) outsideMs += elapsed;
      }
    }
    segment.push(point);
  }
  if (segment.length) segments.push(segment);
  return { distanceM, outsideMs, observedMs, unknownMs, visits, segments };
}

export function parseImport(text, filename) {
  if (filename.toLowerCase().endsWith('.json')) {
    const data = JSON.parse(text);
    return normalizePoints(Array.isArray(data) ? data : data.points);
  }
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().replace(/^\uFEFF/, '').split(',').map(s => s.trim());
  if (!['lat', 'lng', 'time'].every(key => header.includes(key))) throw new Error('CSV header must include lat,lng,time.');
  return normalizePoints(lines.filter(line => line.trim()).map(line => {
    const fields = line.split(',').map(s => s.trim());
    return Object.fromEntries(header.map((key, i) => [key, fields[i]]));
  }));
}
