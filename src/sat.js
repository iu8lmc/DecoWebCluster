// Satelliti radioamatoriali: TLE da CelesTrak, passaggi sopra Caserta e posizione attuale (SGP4 nel browser).
import { twoline2satrec, propagate, gstime, eciToGeodetic, eciToEcf, ecfToLookAngles, degreesLat, degreesLong } from 'satellite.js';

const URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle';
const KEY = 'iq8do.tle';
const MAX_AGE = 12 * 3600e3;
// I più usati da chi parte da un'antenna semplice (FM, lineari, ISS).
const WANT = /^(ISS \(ZARYA\)|AO-7|AO-73|SO-50|RS-44|FO-29|AO-91|AO-92|CAS-4A|CAS-4B|JO-97|PO-101|XW-2[A-F]|AO-27|TEVEL-\d|IO-26|UVSQ-SAT|LILACSAT-2|HADES-[A-Z]|SONATE-2|QMR-KWT|FUNCUBE-1|AO-95|AO-123|EOS-01)/i;

const parse = (text) => {
  const L = text.split(/\r?\n/).map((s) => s.trimEnd()), out = [];
  for (let i = 0; i + 2 < L.length; i++) {
    if (L[i + 1].startsWith('1 ') && L[i + 2].startsWith('2 ')) {
      const name = L[i].replace(/^0 /, '').trim();
      if (WANT.test(name)) out.push({ name: name.replace(/ \(ZARYA\)/, ''), l1: L[i + 1], l2: L[i + 2] });
      i += 2;
    }
  }
  return out;
};

/** TLE dei satelliti scelti (cache di 12 ore nel browser). */
export async function loadTles() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (c && Date.now() - c.at < MAX_AGE) return build(c.tles);
  } catch { /* cache non leggibile */ }
  const r = await fetch(URL);
  if (!r.ok) throw new Error('CelesTrak ' + r.status);
  const tles = parse(await r.text());
  if (!tles.length) throw new Error('nessun TLE');
  try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), tles })); } catch { /* spazio */ }
  return build(tles);
}
const build = (tles) => tles.map((t) => ({ name: t.name, rec: twoline2satrec(t.l1, t.l2) }));

const obsOf = (home) => ({ longitude: (home[0] * Math.PI) / 180, latitude: (home[1] * Math.PI) / 180, height: 0.1 });

/** Posizione [lon, lat], quota (km) e, se `home`, azimut/elevazione dal luogo. */
export function where(sat, date, home) {
  const pv = propagate(sat.rec, date);
  if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
  const g = gstime(date), gd = eciToGeodetic(pv.position, g);
  const out = { name: sat.name, ll: [degreesLong(gd.longitude), degreesLat(gd.latitude)], alt: gd.height };
  if (home) { const la = ecfToLookAngles(obsOf(home), eciToEcf(pv.position, g)); out.az = (la.azimuth * 180) / Math.PI; out.el = (la.elevation * 180) / Math.PI; out.range = la.rangeSatellite; }
  return out;
}

/** Passaggi con elevazione massima >= minEl nelle prossime `hours` ore, in ordine di tempo. */
export function passes(sats, home, from = Date.now(), hours = 24, minEl = 10) {
  const out = [], step = 20e3, end = from + hours * 3600e3;
  for (const s of sats) {
    let cur = null;
    for (let t = from; t <= end; t += step) {
      const w = where(s, new Date(t), home);
      if (!w) continue;
      if (w.el > 0) {
        if (!cur) cur = { name: s.name, aos: t, azAos: w.az, maxEl: w.el, maxT: t };
        if (w.el > cur.maxEl) { cur.maxEl = w.el; cur.maxT = t; }
        cur.los = t; cur.azLos = w.az;
      } else if (cur) { if (cur.maxEl >= minEl) out.push(cur); cur = null; }
    }
    if (cur && cur.maxEl >= minEl) out.push(cur);
  }
  return out.sort((a, b) => a.aos - b.aos);
}
