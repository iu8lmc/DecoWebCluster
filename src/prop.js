// Propagazione "reale" dagli spot del cluster e finestre di greyline verso i DX cercati.
import { distanceKm, sunAlt } from './geo.js';

export const REGIONS = ['EU', 'AF', 'AS', 'NA', 'SA', 'OC'];
export const PROP_BANDS = ['160', '80', '60', '40', '30', '20', '17', '15', '12', '10', '6'];
const NEAR_KM = 1800; // "vicino a Caserta"

/**
 * Per banda e regione conta gli spot recenti in cui un estremo è vicino a Caserta e l'altro nella regione:
 * se una stazione italiana/vicina sente quella regione (o viceversa), il percorso con Caserta è probabilmente aperto.
 * spots: elenco spot arricchiti; ctx: { home, centroid(iso), contOf(iso), minutes }.
 */
export function openMatrix(spots, ctx) {
  const lim = Date.now() - (ctx.minutes || 30) * 60e3, m = {};
  for (const b of PROP_BANDS) m[b] = Object.fromEntries(REGIONS.map((r) => [r, 0]));
  for (const s of spots) {
    if (s.t < lim || !s.band || !m[s.band.id] || !s.deIso || !s.iso) continue;
    const a = ctx.centroid(s.deIso), b = ctx.centroid(s.iso);
    if (!a || !b) continue;
    const nearA = distanceKm(ctx.home, a) < NEAR_KM, nearB = distanceKm(ctx.home, b) < NEAR_KM;
    let reg;
    if (nearA && !nearB) reg = ctx.contOf(s.iso);
    else if (nearB && !nearA) reg = ctx.contOf(s.deIso);
    else if (nearA && nearB) reg = 'EU';
    if (reg && m[s.band.id][reg] !== undefined) m[s.band.id][reg]++;
  }
  return m;
}

// ---- greyline ----------------------------------------------------------------------------
const GREY = 8; // gradi: |altezza del Sole| entro questo valore = crepuscolo/greyline

const phase = (alt) => (alt > GREY ? 'day' : alt < -GREY ? 'night' : 'grey');

/**
 * Stato attuale del percorso Caserta-DX e prossima finestra di greyline nelle 24 ore successive.
 * Una finestra è buona quando almeno un'estremità è in greyline e l'altra in greyline o al buio.
 */
export function greyline(home, target, now = Date.now()) {
  const st = (ms) => ({ h: sunAlt(home, ms), t: sunAlt(target, ms) });
  const good = (a) => {
    const ph = phase(a.h), pt = phase(a.t);
    if (ph === 'grey' && pt === 'grey') return 'both';
    if (ph === 'grey' && pt === 'night') return 'home';
    if (pt === 'grey' && ph === 'night') return 'target';
    return null;
  };
  const n = st(now), out = { now: { h: phase(n.h), t: phase(n.t), kind: good(n) }, next: null };
  let cur = null;
  for (let i = 0; i <= 288; i++) { // 24 h a passi di 5 minuti
    const ms = now + i * 300e3, a = st(ms), k = good(a);
    if (k && !cur) cur = { start: ms, kind: k, sideRising: k === 'home' ? sunAlt(home, ms + 300e3) > a.h : sunAlt(target, ms + 300e3) > a.t };
    if (!k && cur) { cur.end = ms; break; }
    if (i === 288 && cur) cur.end = ms;
  }
  out.next = cur;
  return out;
}
