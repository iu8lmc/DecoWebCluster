// Propagazione HF per banda: stima semplificata (MUF/LUF) dal flusso solare, dall'indice K e dai brillamenti,
// con l'ora del giorno a Caserta. Non sostituisce VOACAP: dà un'idea rapida di quali bande sono "vive" adesso e nelle prossime ore.
import { sunAlt } from './geo.js';

const HOME = [14.33, 41.07]; // IQ8DO – Caserta
const BANDS = [
  { id: '160', name: '160m', f: 1.9 }, { id: '80', name: '80m', f: 3.7 }, { id: '60', name: '60m', f: 5.35 }, { id: '40', name: '40m', f: 7.1 },
  { id: '30', name: '30m', f: 10.12 }, { id: '20', name: '20m', f: 14.2 }, { id: '17', name: '17m', f: 18.1 }, { id: '15', name: '15m', f: 21.2 },
  { id: '12', name: '12m', f: 24.9 }, { id: '10', name: '10m', f: 28.5 },
];
const L = {
  it: {
    title: 'Propagazione HF per banda', now: 'Adesso', night: 'notte', day: 'giorno', dawn: 'alba/tramonto', good: 'Buona', fair: 'Incerta', poor: 'Chiusa o assorbita',
    muf: 'MUF stimata', luf: 'LUF stimata', loading: 'Dati solari in caricamento…', hours: 'Prossime 24 ore (UTC)', note: 'Stima semplificata da SFI, K e brillamenti (MUF su 3000 km). Non sostituisce VOACAP.',
    storm: 'Tempesta geomagnetica: HF degradate', flare: 'Brillamento in corso: assorbimento sul lato diurno', local: 'a Caserta',
  },
  en: {
    title: 'HF propagation by band', now: 'Now', night: 'night', day: 'day', dawn: 'dawn/dusk', good: 'Good', fair: 'Uncertain', poor: 'Closed or absorbed',
    muf: 'Estimated MUF', luf: 'Estimated LUF', loading: 'Loading solar data…', hours: 'Next 24 hours (UTC)', note: 'Simplified estimate from SFI, K and flares (3000 km MUF). Not a substitute for VOACAP.',
    storm: 'Geomagnetic storm: HF degraded', flare: 'Flare in progress: absorption on the day side', local: 'at Caserta',
  },
};

/** 0 = chiusa/assorbita, 1 = incerta, 2 = buona */
export function rate(band, ms, sol) {
  const sfi = Math.max(65, sol.sfi || 100), kp = sol.kp ?? 2;
  const alt = sunAlt(HOME, ms), d = Math.min(1, Math.max(0, (alt + 6) / 18)); // 0 notte … 1 giorno pieno
  let muf = (10 + 0.09 * sfi) * d + Math.max(6.5, 0.42 * (10 + 0.09 * sfi) + 0.5) * (1 - d);
  muf *= kp >= 6 ? 0.6 : kp >= 5 ? 0.7 : kp >= 4 ? 0.85 : kp >= 3 ? 0.95 : 1;
  let luf = 1.8 + (3.4 + (sfi - 70) * 0.012) * d;
  if (sol.flare === 'X') luf += 12 * d; else if (sol.flare === 'M') luf += 5 * d;
  let r = band.f > muf ? 0 : band.f > muf * 0.85 ? 1 : band.f < luf * 0.9 ? 0 : band.f < luf * 1.15 ? 1 : 2;
  if (kp >= 6 && r > 0) r -= 1;
  return { r, muf, luf, d, alt };
}

const COL = ['#ff5d73', '#f5b942', '#3ddc97'];

export function renderHf(el, sol, lang) {
  const tr = (k) => (L[lang] || L.it)[k] ?? L.it[k] ?? k;
  if (!sol || sol.sfi == null) { el.innerHTML = `<p class="hint">${tr('loading')}</p>`; return; }
  const now = Date.now(), nowH = new Date(now).getUTCHours();
  const cur = rate(BANDS[0], now, sol), phase = cur.alt > 4 ? tr('day') : cur.alt < -8 ? tr('night') : tr('dawn');
  const notes = [];
  if ((sol.kp ?? 0) >= 5) notes.push(`⚠ ${tr('storm')}`);
  if (sol.flare) notes.push(`⚠ ${tr('flare')} (${sol.flare})`);
  const rows = BANDS.map((b) => {
    const x = rate(b, now, sol);
    let strip = '';
    for (let h = 0; h < 24; h++) {
      const t = Math.floor(now / 3600e3) * 3600e3 + h * 3600e3, y = rate(b, t + 1800e3, sol), hh = new Date(t).getUTCHours();
      strip += `<i style="background:${COL[y.r]}" title="${String(hh).padStart(2, '0')}Z · ${b.name}: ${[tr('poor'), tr('fair'), tr('good')][y.r]}"></i>`;
    }
    return `<div class="hfrow"><b>${b.name}</b><span class="hfnow" style="--c:${COL[x.r]}">${[tr('poor'), tr('fair'), tr('good')][x.r]}</span><div class="hfstrip">${strip}</div></div>`;
  }).join('');
  el.innerHTML = `<div class="hfhead"><span>SFI <b>${sol.sfi}</b></span><span>K <b>${sol.kp ?? '–'}</b></span>${sol.a != null ? `<span>A <b>${sol.a}</b></span>` : ''}<span>${tr('local')}: <b>${phase}</b></span>
      <span>${tr('muf')} <b>${cur.muf.toFixed(1)}</b> MHz</span><span>${tr('luf')} <b>${cur.luf.toFixed(1)}</b> MHz</span></div>
    ${notes.length ? `<p class="hfwarn">${notes.join(' · ')}</p>` : ''}
    <div class="hfcap"><span>${tr('now')} (${String(nowH).padStart(2, '0')}Z)</span><span>${tr('hours')}</span></div>${rows}
    <div class="hfleg"><i style="background:${COL[2]}"></i>${tr('good')} <i style="background:${COL[1]}"></i>${tr('fair')} <i style="background:${COL[0]}"></i>${tr('poor')}</div>
    <p class="hint">${tr('note')}</p>`;
}
