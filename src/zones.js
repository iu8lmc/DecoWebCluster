// Zone CQ e ITU (confini): dati di DecoClock, ricavati da HB9HIL/hamradio-zones-geojson (MIT).
// Formato: "Z n lat lon" = etichetta; "L lat lon lat lon ..." = linea di confine.
const cache = {};

function parse(text) {
  const lines = [], labels = [];
  for (const row of text.split('\n')) {
    if (row[0] === 'L') {
      const v = row.slice(2).trim().split(/\s+/).map(Number), pts = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i + 1], v[i]]); // [lon, lat]
      if (pts.length > 1) lines.push(pts);
    } else if (row[0] === 'Z') {
      const p = row.split(/\s+/);
      labels.push({ n: p[1], ll: [Number(p[3]), Number(p[2])] });
    }
  }
  return { geo: { type: 'MultiLineString', coordinates: lines }, labels };
}

/** kind: 'cq' | 'itu'. Ritorna { geo, labels } o null se il caricamento non riesce. */
export async function loadZones(kind) {
  if (cache[kind]) return cache[kind];
  try {
    const r = await fetch(`icons/${kind}zones.txt`);
    if (!r.ok) return null;
    cache[kind] = parse(await r.text());
  } catch { return null; }
  return cache[kind];
}
export const zonesLoaded = (kind) => cache[kind] || null;
