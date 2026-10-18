// Geometria radioamatoriale: locator, distanza e azimut (percorso corto e lungo), altezza del Sole, zone CQ/ITU.
const D = Math.PI / 180;
const R_EARTH = 6371.0088; // km

/** Locator Maidenhead di 4, 6 o 8 caratteri → [lon, lat] del centro; null se non valido. */
export function locatorToLL(loc) {
  const m = /^([A-R]{2})(\d\d)(?:([A-X]{2})(?:(\d\d))?)?$/i.exec(String(loc || '').trim());
  if (!m) return null;
  const f = m[1].toUpperCase();
  let lon = -180 + (f.charCodeAt(0) - 65) * 20 + Number(m[2][0]) * 2;
  let lat = -90 + (f.charCodeAt(1) - 65) * 10 + Number(m[2][1]);
  let wLon = 2, wLat = 1;
  if (m[3]) {
    const s = m[3].toUpperCase();
    lon += (s.charCodeAt(0) - 65) * (2 / 24); lat += (s.charCodeAt(1) - 65) * (1 / 24); wLon = 2 / 24; wLat = 1 / 24;
    if (m[4]) { lon += Number(m[4][0]) * (2 / 240); lat += Number(m[4][1]) * (1 / 240); wLon = 2 / 240; wLat = 1 / 240; }
  }
  return [lon + wLon / 2, lat + wLat / 2];
}

/** [lon, lat] → locator a 6 caratteri (es. JN71ov). */
export function llToLocator(lon, lat) {
  const L = Math.min(359.999999, Math.max(0, ((lon + 180) % 360 + 360) % 360)), B = Math.min(179.999999, Math.max(0, lat + 90));
  return String.fromCharCode(65 + Math.floor(L / 20)) + String.fromCharCode(65 + Math.floor(B / 10)) + Math.floor((L % 20) / 2) + Math.floor(B % 10) +
    String.fromCharCode(97 + Math.floor((L % 2) * 12)) + String.fromCharCode(97 + Math.floor((B % 1) * 24));
}

/** Distanza (km) sul cerchio massimo, percorso corto. */
export function distanceKm(a, b) {
  const la1 = a[1] * D, la2 = b[1] * D, dl = (b[0] - a[0]) * D;
  const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dl / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Azimut iniziale (gradi 0-360) da a verso b, percorso corto. */
export function bearing(a, b) {
  const la1 = a[1] * D, la2 = b[1] * D, dl = (b[0] - a[0]) * D;
  const y = Math.sin(dl) * Math.cos(la2), x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl);
  return ((Math.atan2(y, x) / D) + 360) % 360;
}

/** Punto raggiunto partendo da `a` con azimut `brg` (gradi) dopo `km` chilometri. */
export function destination(a, brg, km) {
  const la1 = a[1] * D, lo1 = a[0] * D, d = km / R_EARTH, b = brg * D;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
  const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return [((lo2 / D + 540) % 360) - 180, la2 / D];
}

/** Percorso corto e lungo verso `b` da `a`. */
export function paths(a, b) {
  const sp = distanceKm(a, b), az = bearing(a, b);
  return { sp, lp: 2 * Math.PI * R_EARTH - sp, azSp: az, azLp: (az + 180) % 360 };
}

/** Posizione del punto subsolare [lon, lat] a un istante (ms). */
export function subsolar(ms) {
  const n = ms / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * D;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D, eps = (23.439 - 4e-7 * n) * D;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam)), ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  return [((ra / D - gmst + 540) % 360) - 180, dec / D];
}

/** Altezza del Sole (gradi) in un punto [lon, lat] a un istante (ms). */
export function sunAlt(ll, ms) {
  const [slo, sla] = subsolar(ms);
  const s = Math.sin(ll[1] * D) * Math.sin(sla * D) + Math.cos(ll[1] * D) * Math.cos(sla * D) * Math.cos((ll[0] - slo) * D);
  return Math.asin(Math.max(-1, Math.min(1, s))) / D;
}

// ---- zone CQ / ITU (poligoni semplificati, controllo punto-in-poligono piano) -----------------
let zones = null, loading = null;
export function loadZonePolys() {
  if (zones) return Promise.resolve(zones);
  loading ||= fetch('icons/zones-poly.json').then((r) => r.json()).then((j) => (zones = j)).catch(() => null);
  return loading;
}
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPoly(x, y, poly) { // poly = [esterno, buchi...]
  if (!inRing(x, y, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (inRing(x, y, poly[i])) return false;
  return true;
}
/** Zona (numero e nome) che contiene il punto, dal file caricato; null se non trovata o non ancora caricato. */
export function zoneAt(kind, lon, lat) {
  if (!zones) return null;
  for (const z of zones[kind]) {
    for (const poly of z.p) for (const dx of [0, 360, -360]) if (inPoly(lon + dx, lat, poly)) return { n: z.n, name: z.name };
  }
  return null;
}
