// Poligoni delle zone CQ e ITU (HB9HIL/hamradio-zones-geojson, licenza MIT) semplificati per il browser.
// Uso: node tools/make-zones-geo.mjs   → public/icons/zones-poly.json
import { readFileSync, writeFileSync } from 'node:fs';

const TOL = 0.06; // gradi (Douglas-Peucker)
const r2 = (v) => Math.round(v * 100) / 100;

function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Anello chiuso: si divide nel punto più lontano dal primo, poi si semplifica ogni metà. */
function simplifyRing(ring, tol) {
  const pts = ring.slice(0, -1); // senza il punto finale ripetuto
  let far = 1, max = -1;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > max) { max = d; far = i; } }
  const a = dp(pts.slice(0, far + 1), tol), b = dp([...pts.slice(far), pts[0]], tol);
  const out = [...a, ...b.slice(1)];
  return out.length >= 3 ? [...out.slice(0, -1), out[0]].length >= 4 ? [...out.slice(0, -1), out[0]] : [] : [];
}

function load(file, numKey, nameKey) {
  const g = JSON.parse(readFileSync(new URL(`./src-zones/${file}.geojson`, import.meta.url), 'utf8'));
  return g.features.map((f) => {
    const rings = [];
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      const out = poly.map((ring) => simplifyRing(ring, TOL).map(([x, y]) => [r2(x), r2(y)])).filter((r) => r.length >= 4);
      if (out.length) rings.push(out);
    }
    return { n: f.properties[numKey], name: file === 'cqzones' ? String(f.properties[nameKey] || '') : '', p: rings };
  });
}

const data = { cq: load('cqzones', 'cq_zone_number', 'cq_zone_name'), itu: load('ituzones', 'itu_zone_number', 'itu_zone_name') };
const txt = JSON.stringify(data);
writeFileSync(new URL('../public/icons/zones-poly.json', import.meta.url), txt);
console.log(`zone CQ ${data.cq.length}, ITU ${data.itu.length}, ${(txt.length / 1024).toFixed(0)} KB`);
