// Sezione speciale "Attivazione": statistiche di un nominativo in attivazione (es. 9T0MD).
// Spot in entrata (chi lo spotta) e in uscita (chi spotta lui) dal nostro nodo + rapporti PSK Reporter (chi lo riceve / chi riceve lui).
// I dati arrivano dal servizio iq8do-stats (/stats/activation): archivio proprio, nessun dato personale.
import { BANDS, prefixToIso } from './radio.js';
import { locatorToLL, paths } from './geo.js';
import { predictPath, sunTimes, windows, PRED_BANDS } from './predict.js';

const CALL = '9T0MD';
const DX = { loc: 'JI75ST', place: 'Repubblica Democratica del Congo', placeEn: 'Democratic Republic of the Congo', dates: '30 Sep – 10 Oct 2026', cq: 36, itu: 52, qsl: 'IK2VUC', site: 'https://www.mdxc.support/9t0md/' };
const L = {
  it: {
    title: 'Attivazione', close: 'Chiudi', p1: '24 ore', p7: '7 giorni', p30: '30 giorni', p90: '90 giorni', p0: 'Tutto',
    loading: 'Caricamento…', err: 'Dati non disponibili al momento.', upd: 'aggiornato', noData: 'Nessun dato nel periodo scelto.',
    psk: 'PSK Reporter', pskOn: 'PSK Reporter attivo', pskOff: 'PSK Reporter non collegato', since: 'Primo segnale', lastSeen: 'Ultimo segnale',
    k_in: 'Spot ricevuti', k_inU: 'Spotter diversi', k_inD: 'DXCC che lo spottano', k_out: 'Spot fatti da lui', k_outU: 'DX spottati da lui',
    k_heard: 'Rapporti PSK (lo hanno ricevuto)', k_heardU: 'Stazioni che lo ricevono', k_hears: 'Rapporti PSK (ricevuti da lui)', k_hearsU: 'Stazioni che riceve',
    k_far: 'Più lontano', k_bands: 'Bande attive', k_avg: 'Distanza media spot',
    perBand: 'Bande · riepilogo', band: 'Banda', cIn: 'Spot in', cOut: 'Spot out', cHeard: 'PSK lo riceve', cHears: 'PSK riceve',
    hBandIn: 'Spot ricevuti per banda', hMode: 'Modi (spot ricevuti)', hModeOut: 'Modi (spot fatti da lui)', hCont: 'Da dove lo spottano', hContPsk: 'Dove lo ricevono (PSK)',
    perDay: 'Spot ricevuti al giorno', perHour: 'Attività per ora UTC', hourIn: 'Spot', hourPsk: 'Rapporti PSK', hourBand: 'Ora × banda · spot ricevuti (UTC)',
    dxccIn: 'Paesi che lo spottano', dxccPsk: 'Paesi che lo ricevono (PSK)', topIn: 'Spotter più attivi', topPsk: 'Stazioni PSK che lo ricevono di più', topOut: 'DX spottati da lui',
    topHears: 'Stazioni PSK che riceve lui', recentIn: 'Ultimi spot ricevuti', recentOut: 'Ultimi spot fatti da lui', recentPsk: 'Ultimi rapporti PSK (lo ricevono)', recentHears: 'Ultimi rapporti PSK (ricevuti da lui)',
    time: 'UTC', by: 'Da', dx: 'DX', freq: 'kHz', mode: 'Modo', country: 'Paese', snr: 'SNR', km: 'km', loc: 'Loc', n: 'N', rx: 'RX', tx: 'TX',
    snrAvg: 'SNR medio', csv: 'Scarica CSV', qrz: 'Pagina QRZ', farTxt: 'Rapporto PSK più lontano', hint: 'Spot dal cluster IQ8DO; PSK Reporter registrato in continuo dal server.',
    EU: 'Europa', NA: 'Nord America', SA: 'Sud America', AS: 'Asia', AF: 'Africa', OC: 'Oceania', AN: 'Antartide', spots: 'spot', reports: 'rapporti',
    dxInfo: 'DXpedition ufficiale', dxWhen: 'Date', dxWhere: 'Dove', dxLoc: 'Locatore', dxZones: 'Zone', dxQsl: 'QSL manager', dxSite: 'Sito ufficiale',
    prT: 'Propagazione prevista', prFrom: 'Da', prMyLoc: 'Il tuo locatore', prNow: 'Ora', prDist: 'Distanza', prAz: 'Azimut', prHops: 'salti', prSol: 'Dati solari',
    prBest: 'Migliori bande adesso', prWin: 'Finestre migliori (UTC)', prSun: 'Alba / tramonto (UTC)', prSunHome: 'Tuo QTH', prSunDx: 'DX', prClosed: 'chiusa tutto il giorno',
    prLeg: 'Probabilità di apertura', prGood: 'buona', prFair: 'discreta', prPoor: 'scarsa', prDot: '● = spot reali ricevuti in quell ora nel periodo scelto',
    prNote: 'Stima indicativa semplificata (flusso solare, MUF, assorbimento strato D, indice K): non sostituisce VOACAP né i rapporti reali. Aggiornata con i dati NOAA.',
    prNoSolar: 'dati solari non disponibili: valori di riferimento (SFI 100, K 2)', prBadLoc: 'Locatore non valido', prVoacap: 'VOACAP del team',
  },
  en: {
    title: 'Activation', close: 'Close', p1: '24 hours', p7: '7 days', p30: '30 days', p90: '90 days', p0: 'All',
    loading: 'Loading…', err: 'Data not available right now.', upd: 'updated', noData: 'No data in the selected period.',
    psk: 'PSK Reporter', pskOn: 'PSK Reporter connected', pskOff: 'PSK Reporter not connected', since: 'First signal', lastSeen: 'Last signal',
    k_in: 'Spots received', k_inU: 'Distinct spotters', k_inD: 'DXCC spotting it', k_out: 'Spots made by it', k_outU: 'DX spotted by it',
    k_heard: 'PSK reports (heard)', k_heardU: 'Stations hearing it', k_hears: 'PSK reports (it hears)', k_hearsU: 'Stations it hears',
    k_far: 'Farthest', k_bands: 'Active bands', k_avg: 'Average spot distance',
    perBand: 'Bands · summary', band: 'Band', cIn: 'Spots in', cOut: 'Spots out', cHeard: 'PSK heard', cHears: 'PSK hears',
    hBandIn: 'Spots received per band', hMode: 'Modes (spots received)', hModeOut: 'Modes (spots made by it)', hCont: 'Where it is spotted from', hContPsk: 'Where it is heard (PSK)',
    perDay: 'Spots received per day', perHour: 'Activity per UTC hour', hourIn: 'Spots', hourPsk: 'PSK reports', hourBand: 'Hour × band · spots received (UTC)',
    dxccIn: 'Countries spotting it', dxccPsk: 'Countries hearing it (PSK)', topIn: 'Most active spotters', topPsk: 'PSK stations hearing it most', topOut: 'DX spotted by it',
    topHears: 'PSK stations it hears', recentIn: 'Latest spots received', recentOut: 'Latest spots made by it', recentPsk: 'Latest PSK reports (hearing it)', recentHears: 'Latest PSK reports (heard by it)',
    time: 'UTC', by: 'By', dx: 'DX', freq: 'kHz', mode: 'Mode', country: 'Country', snr: 'SNR', km: 'km', loc: 'Loc', n: 'N', rx: 'RX', tx: 'TX',
    snrAvg: 'Avg SNR', csv: 'Download CSV', qrz: 'QRZ page', farTxt: 'Farthest PSK report', hint: 'Spots from the IQ8DO cluster; PSK Reporter recorded continuously by the server.',
    EU: 'Europe', NA: 'North America', SA: 'South America', AS: 'Asia', AF: 'Africa', OC: 'Oceania', AN: 'Antarctica', spots: 'spots', reports: 'reports',
    dxInfo: 'Official DXpedition', dxWhen: 'Dates', dxWhere: 'Where', dxLoc: 'Locator', dxZones: 'Zones', dxQsl: 'QSL manager', dxSite: 'Official website',
    prT: 'Predicted propagation', prFrom: 'From', prMyLoc: 'Your locator', prNow: 'Now', prDist: 'Distance', prAz: 'Bearing', prHops: 'hops', prSol: 'Solar data',
    prBest: 'Best bands right now', prWin: 'Best windows (UTC)', prSun: 'Sunrise / sunset (UTC)', prSunHome: 'Your QTH', prSunDx: 'DX', prClosed: 'closed all day',
    prLeg: 'Opening probability', prGood: 'good', prFair: 'fair', prPoor: 'poor', prDot: '● = real spots received in that hour in the selected period',
    prNote: 'Simplified indicative estimate (solar flux, MUF, D-layer absorption, K index): it does not replace VOACAP or real reports. Updated with NOAA data.',
    prNoSolar: 'solar data unavailable: reference values (SFI 100, K 2)', prBadLoc: 'Invalid locator', prVoacap: 'Team VOACAP',
  },
};
const CONT_ORDER = ['EU', 'NA', 'SA', 'AS', 'AF', 'OC', 'AN'];
const B_IDS = BANDS.map((b) => b.id);
const bandName = (id) => BANDS.find((b) => b.id === id)?.name || id;
const bandColor = (id) => BANDS.find((b) => b.id === id)?.color || '#8ea3c7';

export function initActivation({ $, $$, esc, getLang: _appLang, store, deps = {} }) {
  const getLang = () => 'en'; // la sezione 9T0MD è sempre in inglese
  const API = window.CLUSTER_API ?? '/';
  const tr = (k) => (L[getLang()] || L.it)[k] ?? L.it[k] ?? k;
  const nf = (n) => Number(n || 0).toLocaleString(getLang() === 'en' ? 'en-GB' : 'it-IT');
  const S = { days: store.get('actDays', 30), loc: store.get('actLoc', 'JN71') };
  let solar = null, solarTs = 0;
  let data = null, openFlag = false, token = 0;
  const root = $('#act');
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = (t) => { const d = new Date(t * 1000); return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
  const flag = (pfx) => { const iso = prefixToIso(pfx || ''); return iso ? `<img class="fl" src="flags/${iso}.svg" alt="" loading="lazy">` : '<i class="fl"></i>'; };
  const qrz = (c) => `https://www.qrz.com/db/${encodeURIComponent(String(c).split('/')[0])}`;
  const heatP = (v, max) => (v > 0 ? Math.round(12 + 88 * Math.sqrt(v / Math.max(1, max))) : 0);

  const cols = (series, labels, o = {}) => { // series: array of arrays (barre sovrapposte non impilate: una per serie, affiancate)
    const w = 640, h = o.h || 130, n = labels.length, pad2 = 14;
    const max = Math.max(1, ...series.flatMap((s) => s.vals));
    const bw = w / Math.max(n, 1), sw = (bw - 2) / series.length;
    const bars = series.map((s, si) => s.vals.map((v, i) => {
      const bh = (v / max) * (h - pad2 - 12);
      return `<g><title>${esc(labels[i])} · ${esc(s.name)}: ${nf(v)}</title><rect x="${(i * bw + 1 + si * sw).toFixed(1)}" y="${(h - pad2 - bh).toFixed(1)}" width="${Math.max(1, sw - 1).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${s.col}"/></g>`;
    }).join('')).join('');
    const every = Math.max(1, Math.ceil(n / (o.ticks || 12)));
    const tk = labels.map((l, i) => (i % every === 0 ? `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${h - 2}" text-anchor="middle">${esc(l)}</text>` : '')).join('');
    return `<svg viewBox="0 0 ${w} ${h}" class="cols" preserveAspectRatio="none">${bars}${tk}</svg>`;
  };
  const hbars = (items) => {
    const max = Math.max(1, ...items.map((x) => x[2])), tot = items.reduce((a, x) => a + x[2], 0) || 1;
    return `<div class="hbars">${items.map(([k, label, v, col]) => `<div class="hbr" style="--c:${col || 'var(--acc)'}"><span>${esc(label)}</span><div><i style="width:${(v / max) * 100}%"></i></div><b>${nf(v)}</b><em>${Math.round((v / tot) * 100)}%</em></div>`).join('') || '<p class="hint">—</p>'}</div>`;
  };
  const matrix = (rows, colsIds, get, rowLabel, colLabel) => {
    let max = 1;
    for (const r of rows) for (const c of colsIds) max = Math.max(max, get(r, c) || 0);
    let h = `<div class="mx-wrap"><table class="mx"><thead><tr><th></th>${colsIds.map((c) => `<th>${esc(colLabel(c))}</th>`).join('')}</tr></thead><tbody>`;
    for (const r of rows) {
      h += `<tr><th>${esc(rowLabel(r))}</th>`;
      for (const c of colsIds) { const v = get(r, c) || 0; h += `<td style="--p:${heatP(v, max)}" title="${esc(rowLabel(r) + ' · ' + colLabel(c) + ': ' + nf(v))}">${v ? (v >= 1000 ? Math.round(v / 100) / 10 + 'k' : v) : ''}</td>`; }
      h += '</tr>';
    }
    return h + '</tbody></table></div>';
  };
  const kp = (l, v, sub = '') => `<div class="kpi"><b>${v}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const table = (head, rows) => `<div class="mx-wrap"><table class="mx act-tb"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="hint">—</td></tr>`}</tbody></table></div>`;
  const call = (c) => `<a href="${qrz(c)}" target="_blank" rel="noopener"><b>${esc(c)}</b></a>`;
  const contItems = (o) => CONT_ORDER.filter((c) => o[c]).map((c) => [c, tr(c), o[c]]);
  const dxccList = (list, max = 20) => {
    const m = Math.max(1, ...list.map((x) => x[2]));
    return `<div class="dxcc">${list.slice(0, max).map(([name, pfx, n, k]) => `<div class="dr">${flag(pfx)}<span>${esc(name)}</span><div><i style="width:${(n / m) * 100}%"></i></div><b>${nf(n)}</b><em>${nf(k)}</em></div>`).join('') || '<p class="hint">—</p>'}</div>`;
  };

  /* ---------------------------------------------------------------- propagazione prevista */
  async function ensureSolar() {
    if (solar && Date.now() - solarTs < 30 * 60e3) return;
    const j = async (u) => { const r = await fetch('https://services.swpc.noaa.gov/' + u); if (!r.ok) throw new Error(r.status); return r.json(); };
    const first = (x) => (Array.isArray(x) ? x[0] : x);
    let sfi = null, k = null;
    try { const f = first(await j('products/summary/10cm-flux.json')); sfi = Number(f.flux ?? f.Flux); } catch { /* opzionale */ }
    try { const a = await j('products/noaa-planetary-k-index.json'), last = a[a.length - 1]; k = parseFloat(Array.isArray(last) ? last[1] : last.Kp); } catch { /* opzionale */ }
    solar = { sfi: Number.isFinite(sfi) ? sfi : null, k: Number.isFinite(k) ? k : null };
    solarTs = Date.now();
  }
  const hh = (x) => (x == null ? '—' : `${pad(Math.floor(x))}:${pad(Math.round((x % 1) * 60) % 60)}`);
  function predHtml() {
    const home = locatorToLL(S.loc), dx = locatorToLL(DX.loc);
    const input = `<label class="pr-loc">${tr('prMyLoc')} <input id="actLoc" value="${esc(S.loc)}" maxlength="8" autocapitalize="characters" spellcheck="false" aria-label="${tr('prMyLoc')}"></label>`;
    if (!home) return `<h3>🛰 ${tr('prT')}</h3><div class="pr-head">${input}<span class="hint">${tr('prBadLoc')}</span></div>`;
    const cond = { sfi: solar?.sfi ?? 100, k: solar?.k ?? 2 };
    const P = predictPath(home, dx, cond);
    const d = data, nowH = new Date().getUTCHours();
    const lvl = (v) => (v >= 0.66 ? 'g' : v >= 0.33 ? 'f' : v >= 0.1 ? 'p' : 'z');
    const rows = PRED_BANDS.map((b) => {
      const tds = P.cells[b].map((v, h) => {
        const real = d?.in?.hourBand?.[b]?.[h] || 0;
        return `<td class="${lvl(v)}${h === nowH ? ' now' : ''}" style="--a:${(0.12 + 0.88 * v).toFixed(2)}" title="${bandName(b)} ${pad(h)}:00 UTC · ${Math.round(v * 100)}%${real ? ' · ' + real + ' ' + tr('spots') : ''}">${real ? '●' : ''}</td>`;
      }).join('');
      return `<tr><th style="--c:${bandColor(b)}">${bandName(b)}</th>${tds}</tr>`;
    }).join('');
    const head = `<tr><th></th>${Array.from({ length: 24 }, (_, h) => `<th class="${h === nowH ? 'now' : ''}">${pad(h)}</th>`).join('')}</tr>`;
    const best = PRED_BANDS.map((b) => [b, P.cells[b][nowH]]).filter((x) => x[1] >= 0.1).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const win = PRED_BANDS.map((b) => {
      const w = windows(P.cells[b], 0.5).map(([s0, e]) => `${pad(s0)}–${pad(e % 24)}`);
      return `<li><b style="color:${bandColor(b)}">${bandName(b)}</b><span>${w.join(' · ') || tr('prClosed')}</span></li>`;
    }).join('');
    const sh = sunTimes(home), sd = sunTimes(dx);
    return `<h3>🛰 ${tr('prT')} <small>${esc(S.loc.toUpperCase())} → ${CALL} (${DX.loc})</small></h3>
      <div class="pr-head">${input}<span>${tr('prDist')}: <b>${nf(Math.round(P.km))} km</b></span><span>${tr('prAz')}: <b>${Math.round(P.brg)}°</b></span><span><b>${P.hops}</b> ${tr('prHops')}</span>
        <span>${tr('prSol')}: SFI <b>${Math.round(cond.sfi)}</b> · K <b>${cond.k}</b> · SSN≈${Math.round(P.ssn)}</span>${solar && solar.sfi == null ? `<span class="hint">${tr('prNoSolar')}</span>` : ''}</div>
      <div class="mx-wrap"><table class="pr">${head}${rows}</table></div>
      <p class="hint pr-leg"><i class="g"></i>${tr('prGood')} <i class="f"></i>${tr('prFair')} <i class="p"></i>${tr('prPoor')} · ${tr('prLeg')} · ${tr('prDot')}</p>
      <div class="agrid g2 pr-info">
        <div><h4>${tr('prBest')} (${pad(nowH)} UTC)</h4><div class="pr-best">${best.map(([b, v]) => `<span style="--c:${bandColor(b)}"><b>${bandName(b)}</b> ${Math.round(v * 100)}%</span>`).join('') || '—'}</div>
          <h4>${tr('prSun')}</h4><p class="hint">${tr('prSunHome')}: ${hh(sh.rise)} / ${hh(sh.set)} · ${tr('prSunDx')}: ${hh(sd.rise)} / ${hh(sd.set)}</p></div>
        <div><h4>${tr('prWin')}</h4><ul class="pr-win">${win}</ul></div>
      </div>
      <p class="hint">${tr('prNote')} <a href="${DX.site}" target="_blank" rel="noopener">${tr('prVoacap')} ↗</a></p>`;
  }
  function renderPred() { const el = $('#actPred'); if (el) el.innerHTML = predHtml(); renderTools(); }

  /* ---------------------------------------------------------------- utilità: on air, antenna e orari, stato personale, comandi, log */
  const END_MS = Date.UTC(2026, 9, 10, 23, 59);
  const pct = (n) => String(n).padStart(2, '0');
  function compass(az1, az2) {
    const pt = (az, r) => [60 + r * Math.sin(az * Math.PI / 180), 60 - r * Math.cos(az * Math.PI / 180)];
    const arrow = (az, col, len) => { const [x, y] = pt(az, len); return `<line x1="60" y1="60" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${col}" stroke-width="3" stroke-linecap="round"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${col}"/>`; };
    const ticks = [['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([l, a]) => { const [x, y] = pt(a, 52); return `<text x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="middle" font-size="9" fill="currentColor" opacity=".6">${l}</text>`; }).join('');
    return `<svg viewBox="0 0 120 120" class="compass" role="img" aria-label="Beam heading"><circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" opacity=".25"/>${ticks}${arrow(az2, 'var(--mut)', 36)}${arrow(az1, 'var(--acc)', 40)}<circle cx="60" cy="60" r="3" fill="currentColor"/></svg>`;
  }
  function toolsHtml() {
    const home = locatorToLL(S.loc), dx = locatorToLL(DX.loc), now = Date.now();
    let beam = '';
    if (home) {
      const pa = paths(home, dx);
      const dxLocal = new Date(now + 3600e3), left = END_MS - now;
      let myOff = ''; try { myOff = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(now); } catch { /* */ }
      const rem = left <= 0 ? 'Activation ended' : `${Math.floor(left / 86400e3)}d ${pct(Math.floor(left % 86400e3 / 3600e3))}h left`;
      beam = `<section class="acard"><h3>🧭 Beam heading</h3><div class="beam">${compass(pa.azSp, pa.azLp)}<div class="beam-t">
        <p><b style="color:var(--acc)">Short path</b> ${Math.round(pa.azSp)}° · ${nf(Math.round(pa.sp))} km</p><p><b>Long path</b> ${Math.round(pa.azLp)}° · ${nf(Math.round(pa.lp))} km</p>
        <p class="hint">From ${esc(S.loc.toUpperCase())}</p></div></div>
        <h4>Clocks</h4><p class="hint">DX local time (UTC+1): <b>${pct(dxLocal.getUTCHours())}:${pct(dxLocal.getUTCMinutes())}</b> · UTC: <b>${pct(new Date(now).getUTCHours())}:${pct(new Date(now).getUTCMinutes())}</b> · you: <b>${esc(myOff)}</b></p>
        <p class="hint">${DX.dates} · <b>${rem}</b></p></section>`;
    }
    // on air adesso: ultimo spot per banda nell'ultima ora
    const recent = (data?.in?.recent || []).filter((r) => r[0] * 1000 > now - 3600e3);
    const byBand = new Map();
    recent.forEach((r) => { if (!byBand.has(r[3])) byBand.set(r[3], r); });
    const ent = deps.resolve ? deps.resolve(CALL) : -1;
    const air = [...byBand.values()].map(([t, de, f, b, m]) => {
      const ago = Math.max(0, Math.round((now / 1000 - t) / 60));
      return `<span class="on-chip" style="--c:${bandColor(b)}"><b>${esc(bandName(b))}</b> ${nf(f)} kHz · ${esc(m)} <em>${ago} min · ${esc(de)}</em></span>`;
    }).join('');
    const onAir = `<section class="acard"><h3>📡 On air now <small>last 60 min</small></h3><div class="on-chips">${air || '<p class="hint">No spots in the last hour — check the prediction above for the next opening.</p>'}</div>
      <p><button type="button" class="ghost" id="actWatch">★ Add ${CALL} to my watchlist</button></p></section>`;
    // stato personale dal log ADIF
    let mine = '';
    const ML = deps.MyLog;
    if (ML && ML.hasLog() && ent >= 0) {
      const G = ['CW', 'PHONE', 'DIGI'], NAME = { CW: 'CW', PHONE: 'Phone', DIGI: 'Digital' };
      const newOne = ML.newEntity(ent, false);
      const rows = PRED_BANDS.map((b) => `<tr><th>${esc(bandName(b))}</th>${G.map((g) => {
        const needW = ML.need(ent, b, g, false), needC = ML.need(ent, b, g, true);
        return `<td class="${needW ? 'nd' : needC ? 'wk' : 'cf'}" title="${needW ? 'Needed' : needC ? 'Worked, not confirmed' : 'Confirmed'}">${needW ? '✗' : needC ? '✓' : '✔'}</td>`;
      }).join('')}</tr>`).join('');
      mine = `<section class="acard"><h3>🎯 Your status for ${CALL}</h3>${newOne ? '<p class="newdx">🆕 New DXCC for you — Democratic Republic of the Congo!</p>' : ''}
        <div class="mx-wrap"><table class="mx act-st"><thead><tr><th></th>${G.map((g) => `<th>${NAME[g]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
        <p class="hint">✗ needed · ✓ worked · ✔ confirmed — from the ADIF log you imported in this browser.</p></section>`;
    } else {
      mine = `<section class="acard"><h3>🎯 Your status for ${CALL}</h3><p class="hint">Import your ADIF log (Settings → My log) to see which bands and modes you still need from the Democratic Republic of the Congo.</p></section>`;
    }
    const host = location.hostname || 'iq8do.aricaserta.it';
    const cmd = (c) => `<div class="cmd"><code>${esc(c)}</code><button type="button" class="ghost" data-copy="${esc(c)}">Copy</button></div>`;
    const cmds = `<section class="acard"><h3>⌨ Cluster commands</h3><p class="hint">Connect with any telnet or logging program:</p>${cmd(`telnet ${host} 7300`)}${cmd(`sh/dx 9T0MD`)}${cmd(`sh/dx 20 9T0MD`)}
      <p class="hint">Send a spot: <code>dx 14195.0 ${CALL} 59 loud</code> (needs a registered callsign on the node).</p></section>`;
    return `<div class="agrid g2">${onAir}${mine}</div><div class="agrid g2">${beam}${cmds}</div>`;
  }
  function renderTools() { const el = $('#actTools'); if (el) el.innerHTML = toolsHtml(); }

  function render() {
    const d = data; if (!d) return;
    const I = d.in, O = d.out, Hd = d.heard, Hs = d.hears;
    const empty = !I.total && !O.total && !Hd.total && !Hs.total;
    const bands = B_IDS.filter((b) => d.bands[b]);
    const farTxt = Hd.far ? `${nf(Hd.far[1])} km · ${esc(Hd.far[0])}` : '—';
    const dayFmt = (s) => s.slice(5).replace('-', '/');
    const hours = Array.from({ length: 24 }, (_, i) => pad(i));
    const bandRows = bands.map((b) => `<tr><th>${esc(bandName(b))}</th><td>${nf(d.bands[b].in)}</td><td>${nf(d.bands[b].out)}</td><td>${nf(d.bands[b].heard)}</td><td>${nf(d.bands[b].hears)}</td></tr>`);
    const pskBand = bands.filter((b) => Hd.band[b]).map((b) => `<tr><th>${esc(bandName(b))}</th><td>${nf(Hd.band[b][0])}</td><td>${nf(Hd.band[b][1])}</td><td>${Hd.band[b][2]} dB</td></tr>`);
    $('#actBody').innerHTML = empty ? `<p class="hint">${tr('noData')}</p>` : `
      <div class="ana-note">${d.first ? `${tr('since')}: ${hhmm(d.first)} UTC · ${tr('lastSeen')}: ${hhmm(d.last)} UTC · ` : ''}${d.psk_ok ? '🟢 ' + tr('pskOn') : '🟠 ' + tr('pskOff')} · ${tr('hint')}</div>
      <div class="kpis">${kp(tr('k_in'), nf(I.total))}${kp(tr('k_inU'), nf(I.uniq))}${kp(tr('k_inD'), nf(I.uniqDxcc))}${kp(tr('k_out'), nf(O.total))}${kp(tr('k_outU'), nf(O.uniq))}
        ${kp(tr('k_heard'), nf(Hd.total), `${tr('snrAvg')} ${Hd.snrAvg} dB`)}${kp(tr('k_heardU'), nf(Hd.uniq), `${nf(Hd.uniqDxcc)} DXCC`)}${kp(tr('k_hears'), nf(Hs.total))}${kp(tr('k_hearsU'), nf(Hs.uniq))}
        ${kp(tr('k_far'), farTxt, Hd.far ? `${esc(Hd.far[2])} ${esc(Hd.far[3])} · ${esc(Hd.far[4])}` : '')}${kp(tr('k_bands'), bands.length)}${kp(tr('k_avg'), nf(I.kmAvg) + ' km')}</div>
      <section class="acard wide"><h3>${tr('perBand')}</h3>${table([tr('band'), tr('cIn'), tr('cOut'), tr('cHeard'), tr('cHears')], bandRows)}</section>
      <section class="acard wide"><h3>${tr('perHour')}</h3>${cols([{ name: tr('hourIn'), vals: I.perHour, col: 'var(--acc)' }, { name: tr('hourPsk'), vals: Hd.perHour, col: 'var(--acc2)' }], hours, { ticks: 24 })}
        <p class="hint"><span style="color:var(--acc)">■</span> ${tr('hourIn')} &nbsp; <span style="color:var(--acc2)">■</span> ${tr('hourPsk')}</p></section>
      <section class="acard wide"><h3>${tr('perDay')}</h3>${cols([{ name: tr('hourIn'), vals: I.perDay.map((x) => x[1]), col: 'var(--acc)' }], I.perDay.map((x) => dayFmt(x[0])), {})}</section>
      <div class="agrid">
        <section class="acard"><h3>${tr('hBandIn')}</h3>${hbars(bands.filter((b) => I.band[b]).map((b) => [b, bandName(b), I.band[b], bandColor(b)]))}</section>
        <section class="acard"><h3>${tr('hMode')}</h3>${hbars(Object.entries(I.mode).sort((a, b) => b[1] - a[1]).map(([m, n]) => [m, m, n]))}<h4>${tr('hModeOut')}</h4>${hbars(Object.entries(O.mode).sort((a, b) => b[1] - a[1]).map(([m, n]) => [m, m, n]))}</section>
        <section class="acard"><h3>${tr('hCont')}</h3>${hbars(contItems(I.cont))}<h4>${tr('hContPsk')}</h4>${hbars(contItems(Hd.cont))}</section>
      </div>
      <section class="acard wide"><h3>${tr('hourBand')}</h3>${matrix(bands.filter((b) => I.hourBand[b]), Array.from({ length: 24 }, (_, i) => i), (b, h) => I.hourBand[b][h], bandName, pad)}</section>
      <div class="agrid g2">
        <section class="acard"><h3>${tr('dxccIn')}</h3>${dxccList(I.dxcc)}</section>
        <section class="acard"><h3>${tr('dxccPsk')}</h3>${dxccList(Hd.dxcc)}</section>
      </div>
      <div class="agrid g2">
        <section class="acard"><h3>${tr('topIn')}</h3><ol class="rank">${I.top.slice(0, 25).map(([c, n, name, pfx]) => `<li><a href="${qrz(c)}" target="_blank" rel="noopener">${flag(pfx)}<b>${esc(c)}</b><span>${esc(name)}</span></a><em>${nf(n)}</em></li>`).join('') || '<li class="hint">—</li>'}</ol></section>
        <section class="acard"><h3>${tr('topPsk')}</h3><ol class="rank">${Hd.top.slice(0, 25).map(([c, n, name, pfx, km]) => `<li><a href="${qrz(c)}" target="_blank" rel="noopener">${flag(pfx)}<b>${esc(c)}</b><span>${esc(name)}${km ? ' · ' + nf(km) + ' km' : ''}</span></a><em>${nf(n)}</em></li>`).join('') || '<li class="hint">—</li>'}</ol>${pskBand.length ? `<h4>${tr('psk')} · ${tr('band')}</h4>${table([tr('band'), tr('n'), tr('rx'), tr('snr')], pskBand)}` : ''}</section>
      </div>
      <div class="agrid g2">
        <section class="acard"><h3>${tr('topOut')}</h3><ol class="rank">${O.top.slice(0, 20).map(([c, n, name, pfx]) => `<li><a href="${qrz(c)}" target="_blank" rel="noopener">${flag(pfx)}<b>${esc(c)}</b><span>${esc(name)}</span></a><em>${nf(n)}</em></li>`).join('') || '<li class="hint">—</li>'}</ol></section>
        <section class="acard"><h3>${tr('topHears')}</h3><ol class="rank">${Hs.top.slice(0, 20).map(([c, n, name, pfx, km]) => `<li><a href="${qrz(c)}" target="_blank" rel="noopener">${flag(pfx)}<b>${esc(c)}</b><span>${esc(name)}${km ? ' · ' + nf(km) + ' km' : ''}</span></a><em>${nf(n)}</em></li>`).join('') || '<li class="hint">—</li>'}</ol></section>
      </div>
      <div class="agrid g2">
        <section class="acard"><h3>${tr('recentIn')}</h3>${table([tr('time'), tr('by'), tr('freq'), tr('mode'), tr('country')], I.recent.map(([t, de, f, b, m, nm, pfx]) => `<tr><td>${hhmm(t)}</td><td>${call(de)}</td><td>${nf(f)}</td><td>${esc(m)}</td><td>${flag(pfx)} ${esc(nm)}</td></tr>`))}</section>
        <section class="acard"><h3>${tr('recentOut')}</h3>${table([tr('time'), tr('dx'), tr('freq'), tr('mode'), tr('country')], O.recent.map(([t, dx, f, b, m, nm, pfx]) => `<tr><td>${hhmm(t)}</td><td>${call(dx)}</td><td>${nf(f)}</td><td>${esc(m)}</td><td>${flag(pfx)} ${esc(nm)}</td></tr>`))}</section>
      </div>
      <div class="agrid g2">
        <section class="acard"><h3>${tr('recentPsk')}</h3>${table([tr('time'), tr('rx'), tr('loc'), tr('band'), tr('mode'), tr('snr'), tr('km')], Hd.recent.map(([t, rc, l, b, m, s, km, pfx]) => `<tr><td>${hhmm(t)}</td><td>${flag(pfx)} ${call(rc)}</td><td>${esc(l)}</td><td>${esc(bandName(b))}</td><td>${esc(m)}</td><td>${s}</td><td>${km == null ? '' : nf(km)}</td></tr>`))}</section>
        <section class="acard"><h3>${tr('recentHears')}</h3>${table([tr('time'), tr('tx'), tr('loc'), tr('band'), tr('mode'), tr('snr'), tr('km')], Hs.recent.map(([t, sc, l, b, m, s, km, pfx]) => `<tr><td>${hhmm(t)}</td><td>${flag(pfx)} ${call(sc)}</td><td>${esc(l)}</td><td>${esc(bandName(b))}</td><td>${esc(m)}</td><td>${s}</td><td>${km == null ? '' : nf(km)}</td></tr>`))}</section>
      </div>
      <div class="ana-actions"><button type="button" id="actCsv" class="ghost">⬇ ${tr('csv')}</button></div>`;
    const k0 = $('#actBody .kpis'), ph = '<section class="acard wide" id="actPred"></section><div id="actTools"></div>';
    if (k0) k0.insertAdjacentHTML('afterend', ph); else $('#actBody').insertAdjacentHTML('afterbegin', ph);
    renderPred();
    ensureSolar().then(() => { if (openFlag) renderPred(); });
    $$('#actPeriod button').forEach((b) => b.classList.toggle('on', Number(b.dataset.k) === S.days));
  }

  async function load() {
    const my = ++token;
    $('#actBody')?.classList.add('busy');
    try {
      const r = await fetch(`${API}stats/activation?call=${CALL}&days=${S.days}`, { cache: 'no-store' }); if (!r.ok) throw 0;
      const j = await r.json(); if (my !== token) return;
      data = j; render();
    } catch { if (my === token) $('#actBody').innerHTML = `<p class="hint">${tr('err')}</p>`; }
    $('#actBody')?.classList.remove('busy');
  }

  function csv() {
    const d = data; if (!d) return;
    const out = [['section', 'key', 'value']];
    for (const [sec, o] of [['spots_in_band', d.in.band], ['spots_in_mode', d.in.mode], ['spots_out_band', d.out.band], ['spots_out_mode', d.out.mode]]) for (const [k, v] of Object.entries(o)) out.push([sec, k, v]);
    for (const [k, v] of Object.entries(d.heard.band)) out.push(['psk_heard_band', k, v[0]]);
    for (const [k, v] of Object.entries(d.hears.band)) out.push(['psk_hears_band', k, v[0]]);
    d.in.top.forEach(([c, n]) => out.push(['spotter', c, n]));
    d.heard.top.forEach(([c, n]) => out.push(['psk_rx', c, n]));
    d.in.recent.forEach(([t, de, f, , m]) => out.push(['spot_in', new Date(t * 1000).toISOString(), `${de} ${f} ${m}`]));
    const txt = out.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv' })); a.download = `${CALL}-activation-${S.days}d.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function shell() {
    const place = getLang() === 'en' ? DX.placeEn : DX.place;
    root.innerHTML = `<div class="ana-head"><h2 id="actTitle"></h2><button type="button" id="actClose" class="ico" aria-label="${tr('close')}">✕</button></div>
      <section class="acard wide act-hero"><img src="icons/9t0md-logo.jpg" alt="Logo ${CALL}" width="140" height="148"><div><h3>${tr('dxInfo')}</h3><div class="act-call">${CALL}</div>
        <dl><dt>${tr('dxWhere')}</dt><dd>${esc(place)}</dd><dt>${tr('dxWhen')}</dt><dd>${DX.dates}</dd><dt>${tr('dxLoc')}</dt><dd>${DX.loc}</dd><dt>${tr('dxZones')}</dt><dd>CQ ${DX.cq} · ITU ${DX.itu}</dd><dt>${tr('dxQsl')}</dt><dd>${DX.qsl}</dd></dl>
        <a class="ghost" href="${DX.site}" target="_blank" rel="noopener">${tr('dxSite')} ↗</a> <button type="button" class="ghost" id="actShare">🔗 Share this special edition</button><span class="hint" id="actShareMsg" role="status"></span></div></section>
      <div class="ana-ctl"><div class="chips" id="actPeriod">${[1, 7, 30, 90, 0].map((p) => `<button type="button" data-k="${p}">${tr('p' + p)}</button>`).join('')}</div>
        <a class="ghost" href="https://www.qrz.com/db/${CALL}" target="_blank" rel="noopener">${tr('qrz')} ↗</a></div>
      <div id="actBody" class="ana-body"><p class="hint">${tr('loading')}</p></div>`;
    $('#actTitle').textContent = `🏝 ${tr('title')} ${CALL}`;
  }
  const BAR = { it: `Scopri lo special cluster di ${CALL}: statistiche, spot in entrata e in uscita, collegamenti per banda e rapporti PSK Reporter in tempo reale. Clicca qui`, en: `Discover the ${CALL} special cluster: statistics, incoming and outgoing spots, activity per band and live PSK Reporter reports. Click here` };
  function applyBar() {
    const tk = $('#actBarTrack'); if (!tk) return;
    const m = `<span>🏝 ${esc(BAR[getLang()] || BAR.it)} ▸</span>`;
    tk.innerHTML = m + m;
  }
  function applyStatic() { applyBar(); const tb = $('#tabActTxt'); if (tb) tb.textContent = CALL; const bt = $('#btnAct'); if (bt) bt.title = `${tr('title')} ${CALL}`; }

  function open() {
    openFlag = true; document.body.classList.add('ana-open'); root.hidden = false; shell(); load(); root.scrollTop = 0;
  }
  function close() { openFlag = false; document.body.classList.remove('ana-open'); root.hidden = true; const l = $('#layout'); $$('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === l.dataset.tab)); }

  root.addEventListener('click', (e) => {
    const t0 = e.target;
    if (t0.closest('#actClose')) return close();
    if (t0.closest('#actCsv')) return csv();
    if (t0.closest('#actShare')) {
      const url = `${location.origin}/icons/9t0md.html`, msg = $('#actShareMsg');
      const done = (t) => { if (msg) { msg.textContent = t; setTimeout(() => { msg.textContent = ''; }, 3000); } };
      if (navigator.share) navigator.share({ title: `${CALL} Special Cluster`, text: `${CALL} DXpedition: live spots, bands, PSK Reporter and predicted propagation`, url }).catch(() => {});
      else navigator.clipboard?.writeText(url).then(() => done(' Link copied: ' + url), () => done(' ' + url));
      return;
    }
    if (t0.closest('#actWatch')) { deps.addWatch?.(CALL); return; }
    const cp = t0.closest('[data-copy]'); if (cp) { try { navigator.clipboard.writeText(cp.dataset.copy); cp.textContent = 'Copied'; setTimeout(() => { cp.textContent = 'Copy'; }, 1500); } catch { /* */ } return; }
    const per = t0.closest('#actPeriod button'); if (per) { S.days = Number(per.dataset.k); store.set('actDays', S.days); load(); }
  });
  root.addEventListener('change', (e) => {
    if (e.target.id !== 'actLoc') return;
    const v = e.target.value.trim().toUpperCase();
    if (locatorToLL(v)) { S.loc = v; store.set('actLoc', v); }
    renderPred();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && openFlag && !document.querySelector('dialog[open]')) close(); });
  document.addEventListener('iq8do:state', () => { applyStatic(); if (openFlag) { shell(); if (data) render(); } });
  applyStatic();
  setInterval(() => { if (openFlag && document.visibilityState !== 'hidden') load(); }, 60000);
  return { open, close, isOpen: () => openFlag };
}
