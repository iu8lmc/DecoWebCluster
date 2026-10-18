// Il mio log (ADIF): letto e analizzato nel browser, i dati restano sul tuo dispositivo (localStorage).
import { resolve, isDxcc, DXCC_TOTAL, ENTITIES } from './dxcc.js';

const KEY = 'iq8do.mylog';
const GROUPS = { CW: 1, PHONE: 2, DIGI: 4 };
const PHONE = new Set(['SSB', 'USB', 'LSB', 'AM', 'FM', 'PHONE', 'DV', 'C4FM', 'DSTAR']);

// Banda ADIF → id di banda usato dall'app.
export function adifBand(b) {
  const s = String(b || '').toUpperCase().trim();
  const m = { '160M': '160', '80M': '80', '60M': '60', '40M': '40', '30M': '30', '20M': '20', '17M': '17', '15M': '15', '12M': '12', '10M': '10', '6M': '6', '4M': 'VHF', '2M': 'VHF', '1.25M': 'VHF', '70CM': 'VHF' };
  if (m[s]) return m[s];
  if (/^\d+(\.\d+)?(CM|MM)$/.test(s) || /^(23CM|13CM|9CM|6CM|3CM|1.25CM)$/.test(s)) return 'SHF';
  return null; // onde lunghe (630m/2200m) e simili: ignorate
}
export function modeGroup(mode, submode) {
  const m = String(mode || '').toUpperCase(), sm = String(submode || '').toUpperCase();
  if (m === 'CW' || sm === 'CW') return 'CW';
  if (PHONE.has(m) || PHONE.has(sm)) return 'PHONE';
  return 'DIGI';
}

// Lettura ADIF: legge <CAMPO:lunghezza[:tipo]>valore fino a <EOR>.
export function parseAdif(text) {
  const start = text.search(/<EOH>/i);
  let i = start >= 0 ? start + 5 : 0;
  const n = text.length;
  const out = [];
  let rec = {};
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) break;
    const gt = text.indexOf('>', lt);
    if (gt < 0) break;
    const tag = text.slice(lt + 1, gt);
    i = gt + 1;
    const low = tag.toLowerCase();
    if (low === 'eor') { if (rec.call) out.push(rec); rec = {}; continue; }
    if (low === 'eoh') continue;
    const p = tag.split(':');
    const len = parseInt(p[1], 10);
    if (!p[0] || Number.isNaN(len)) continue;
    rec[p[0].toLowerCase()] = text.substr(i, len);
    i += len;
  }
  if (rec.call) out.push(rec);
  return out;
}

export function analyze(text, fileName) {
  const qsos = parseAdif(text);
  const w = {}, c = {};
  const wk = {}; // nominativo → bande già collegate
  const g = {}, gc = {}, z = {}, zc = {}, it = {}, itc = {}; // quadranti (4 caratteri), zone CQ e ITU: per banda
  let used = 0, skipped = 0;
  const mine = {};
  for (const q of qsos) {
    const ent = resolve(q.call);
    const band = adifBand(q.band);
    if (ent < 0 || !band) { skipped++; continue; }
    const confq = [q.qsl_rcvd, q.lotw_qsl_rcvd, q.eqsl_qsl_rcvd, q.dcl_qsl_rcvd].some((v) => String(v || '').toUpperCase() === 'Y');
    const grid = String(q.gridsquare || '').toUpperCase().slice(0, 4), cq = Number(q.cqz) || ENTITIES[ent][1], itu = Number(q.ituz) || ENTITIES[ent][2];
    const mark = (all, cf, key) => { if (!key) return; (all[key] ||= {})[band] = 1; if (confq) (cf[key] ||= {})[band] = 1; };
    if (/^[A-R]{2}\d{2}$/.test(grid)) mark(g, gc, grid);
    mark(z, zc, cq); mark(it, itc, itu);
    const cl = String(q.call).toUpperCase().trim(); if (cl) { const b = (wk[cl] ||= []); if (!b.includes(band)) b.push(band); }
    if (!isDxcc(ent)) { skipped++; continue; }
    const bit = GROUPS[modeGroup(q.mode, q.submode)];
    (w[ent] ||= {})[band] = ((w[ent] || {})[band] || 0) | bit;
    const conf = [q.qsl_rcvd, q.lotw_qsl_rcvd, q.eqsl_qsl_rcvd, q.dcl_qsl_rcvd].some((v) => String(v || '').toUpperCase() === 'Y');
    if (conf) (c[ent] ||= {})[band] = ((c[ent] || {})[band] || 0) | bit;
    if (q.station_callsign || q.operator) mine[(q.station_callsign || q.operator).toUpperCase()] = 1;
    used++;
  }
  return { v: 1, file: fileName, at: Date.now(), qsos: qsos.length, used, skipped, w, c, calls: Object.keys(mine).slice(0, 5), g, gc, z, zc, it, itc, wk: Object.fromEntries(Object.entries(wk).map(([k, v]) => [k, v.join(',')])) };
}

let data = null;
export function load() {
  try { const s = localStorage.getItem(KEY); data = s ? JSON.parse(s) : null; } catch { data = null; }
  return data;
}
export function save(d) {
  data = d;
  try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch { return false; }
}
export function clear() { data = null; try { localStorage.removeItem(KEY); } catch { /* */ } }
export const info = () => data;
export const hasLog = () => !!data;

/** Livello di novità di uno spot per me: 'dxcc' | 'band' | 'slot' | null. */
export function need(ent, bandId, grp, confirmedOnly) {
  if (!data || !isDxcc(ent) || !bandId) return null;
  const src = confirmedOnly ? data.c : data.w;
  const e = src[ent];
  if (!e) return 'dxcc';
  const m = e[bandId];
  if (!m) return 'band';
  return m & (GROUPS[grp] || 2) ? null : 'slot';
}

/** Novità di zona/quadrante per me: 'zone' (zona CQ mai lavorata), 'zband' (zona nuova su questa banda), 'grid' (quadrante mai lavorato). */
export function needExtra(ent, bandId, comm, confirmedOnly) {
  if (!data || !data.z || ent < 0 || !bandId) return null;
  const zs = confirmedOnly ? data.zc : data.z, gs = confirmedOnly ? data.gc : data.g, cq = ENTITIES[ent][1];
  const m = /(?:^|[^A-Z0-9])([A-R]{2}\d{2})(?:[A-X]{2})?(?![A-Z0-9])/i.exec(comm || '');
  if (m && !gs[m[1].toUpperCase()]) return 'grid';
  if (!zs[cq]) return 'zone';
  if (!zs[cq][bandId]) return 'zband';
  return null;
}

/** Ho già collegato questo nominativo? 'band' (su questa banda), 'other' (solo su altre bande) o null. */
export function workedCall(call, bandId) {
  if (!data || !data.wk || !call) return null;
  const b = data.wk[String(call).toUpperCase()];
  if (!b) return null;
  return b.split(',').includes(bandId) ? 'band' : 'other';
}

/** true se l'entità non è mai stata lavorata (o confermata) su nessuna banda. */
export function newEntity(ent, confirmedOnly) {
  if (!data || !isDxcc(ent)) return false;
  return !(confirmedOnly ? data.c : data.w)[ent];
}

/** Statistiche: entità lavorate/confermate e per banda. */
export function stats() {
  if (!data) return null;
  const perBand = {};
  for (const [ent, bands] of Object.entries(data.w)) for (const b of Object.keys(bands)) (perBand[b] ||= { w: 0, c: 0 }).w++;
  for (const [ent, bands] of Object.entries(data.c)) for (const b of Object.keys(bands)) (perBand[b] ||= { w: 0, c: 0 }).c++;
  const n = (o) => Object.keys(o || {}).length;
  return { hasWk: !!data.wk, grids: n(data.g), gridsC: n(data.gc), zones: n(data.z), zonesC: n(data.zc), itu: n(data.it), ituC: n(data.itc), zperBand: zoneBands(data.z), worked: Object.keys(data.w).length, confirmed: Object.keys(data.c).length, total: DXCC_TOTAL, perBand };
}

function zoneBands(z) {
  const o = {};
  for (const bands of Object.values(z || {})) for (const b of Object.keys(bands)) o[b] = (o[b] || 0) + 1;
  return o;
}
