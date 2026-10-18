// Previsione di propagazione HF semplificata (stile "VOACAP lite") per un percorso punto-punto, ora per ora in UTC.
// Modello: foF2 dal flusso solare e dall'angolo zenitale del Sole nei punti di controllo → MUF; assorbimento dello strato D
// per salto; penalità per indice K. È una STIMA INDICATIVA, non sostituisce VOACAP né i rapporti reali (spot, PSK Reporter).
import { distanceKm, bearing, destination, sunAlt } from './geo.js';
import { BANDS } from './radio.js';

const D = Math.PI / 180, R = 6371, H_F2 = 300;
export const PRED_BANDS = ['160', '80', '60', '40', '30', '20', '17', '15', '12', '10', '6'];
const FREQ = Object.fromEntries(BANDS.map((b) => [b.id, (b.lo + b.hi) / 2000])); // MHz (centro banda)
FREQ['160'] = 1.85; FREQ['80'] = 3.65; FREQ['60'] = 5.36; FREQ['40'] = 7.1; FREQ['30'] = 10.125; FREQ['20'] = 14.15; FREQ['17'] = 18.12; FREQ['15'] = 21.2; FREQ['12'] = 24.94; FREQ['10'] = 28.4; FREQ['6'] = 50.2;

const LOWF = { 160: 0.6, 80: 0.85, 60: 0.9 }; // rumore atmosferico e rendimento d'antenna: bande basse meno probabili
const ssnFromSfi = (sfi) => Math.max(0, (sfi - 63.7) / 0.728);
const logistic = (x) => 1 / (1 + Math.exp(-x));

/** Fattore secante all'angolo d'incidenza sullo strato F2 per un salto di lunghezza dh (km). */
function secPhi(dh) {
  const a = dh / (2 * R);
  const take = Math.atan((Math.cos(a) - R / (R + H_F2)) / Math.sin(a)); // angolo di partenza
  const sinPhi = (R * Math.cos(take)) / (R + H_F2);
  return 1 / Math.sqrt(1 - sinPhi * sinPhi);
}

function foF2(ll, ms, ssn) {
  const alt = sunAlt(ll, ms);
  const lat = Math.abs(ll[1]);
  const peak = (4.6 + 0.075 * ssn) * (lat < 25 ? 1.12 : lat < 45 ? 1.0 : 0.88);
  const day = Math.pow(Math.max(0, Math.sin(alt * D)), 0.45);
  const twilight = alt > -6 ? Math.min(0.4, 0.1 + 0.03 * (alt + 6)) : 0;   // ionizzazione residua al crepuscolo
  return { f: peak * (0.36 + 0.64 * Math.max(day, twilight)), alt };
}

/**
 * a, b: [lon, lat]. cond: { sfi, k }. Restituisce { km, brg, hops, ssn, cells: { banda: [24 punteggi 0..1] }, muf: [24] }.
 * La prima ora considerata è 00 UTC del giorno corrente.
 */
export function predictPath(a, b, cond, dayMs = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())) {
  const km = distanceKm(a, b), brg = bearing(a, b);
  const hops = Math.max(1, Math.ceil(km / 3800)), dh = km / hops;
  const ssn = ssnFromSfi(cond.sfi ?? 100);
  const sec = secPhi(Math.min(dh, 3800));
  const ctl = hops === 1 ? [destination(a, brg, km / 2)] : [destination(a, brg, dh / 2), destination(a, brg, km - dh / 2)];
  const kfac = 1 - 0.07 * Math.max(0, (cond.k ?? 1) - 3);
  const cells = Object.fromEntries(PRED_BANDS.map((x) => [x, []])), muf = [], loss = {};
  for (let h = 0; h < 24; h++) {
    const ms = dayMs + h * 3600e3 + 1800e3;     // metà ora
    let m = Infinity, iz = 0;
    for (const p of ctl) {
      const o = foF2(p, ms, ssn);
      m = Math.min(m, o.f * sec);
      const chi = Math.min(90, 90 - o.alt) * D;
      iz += o.alt > -2 ? (1 + 0.0037 * ssn) * Math.pow(Math.max(0.03, Math.cos(0.881 * chi)), 1.3) : 0.02;
    }
    iz /= ctl.length;
    muf.push(m);
    for (const id of PRED_BANDS) {
      const f = FREQ[id];
      const pMuf = logistic(-(f / m - 1) / 0.07);
      const perHop = 0.6 * 677.2 * iz * sec / Math.pow(f + 1.0, 1.98);
      const pAbs = logistic(-(perHop * hops - 38) / 8);
      cells[id].push(Math.max(0, Math.min(1, pMuf * pAbs * kfac * (LOWF[id] ?? 1))));
      if (h === 0) loss[id] = perHop * hops;
    }
  }
  return { km, brg, hops, ssn, sec, cells, muf };
}

/** Ore UTC (decimali) in cui il Sole attraversa l'orizzonte in `ll` nelle 24 h da dayMs: { rise, set } (null se non succede). */
export function sunTimes(ll, dayMs = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())) {
  let prev = sunAlt(ll, dayMs), rise = null, set = null;
  for (let i = 1; i <= 288; i++) {
    const cur = sunAlt(ll, dayMs + i * 300e3);
    if (prev < 0 && cur >= 0 && rise == null) rise = (i * 5) / 60;
    if (prev >= 0 && cur < 0 && set == null) set = (i * 5) / 60;
    prev = cur;
  }
  return { rise, set };
}

/** Finestre contigue (ore UTC) con punteggio >= soglia: [[start, end], ...] (end escluso). */
export function windows(vals, thr = 0.5) {
  const out = []; let s = null;
  vals.forEach((v, i) => { if (v >= thr && s == null) s = i; if ((v < thr || i === 23) && s != null) { out.push([s, v >= thr && i === 23 ? 24 : i]); s = null; } });
  return out;
}
