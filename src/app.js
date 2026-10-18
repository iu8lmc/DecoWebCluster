import { geoMercator, geoAzimuthalEquidistant, geoOrthographic, geoPath, geoGraticule10, geoCircle, geoInterpolate, geoDistance, geoContains } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { createGL } from './glmap.js';
import { BEACONS, BEACON_BANDS, POS as BPOS, onAir, slotLeft } from './beacons.js';
import { loadZones, zonesLoaded } from './zones.js';
import { initTicker, dxpeditions } from './ticker.js';
import { ENTITIES } from './dxcc.js';
import { locatorToLL, llToLocator, distanceKm, paths, bearing, destination, sunAlt, loadZonePolys, zoneAt } from './geo.js';
import { watchHeard } from './psk.js';
import { loadTles, where as satWhere, passes as satPasses } from './sat.js';
import { fetchQuakes } from './quakes.js';
import { moon as moonAt, phaseName, riseSet } from './moon.js';
import { trending } from './trend.js';
import { fetchContests } from './contests.js';
import { initAccount } from './account.js';
import { openMatrix, greyline, PROP_BANDS, REGIONS } from './prop.js';
import { drawTiles, metersPerPixel, MAX_Z } from './tiles.js';
import world from './data/world.json';
import countries from './data/countries.json';
import { BANDS, bandOf, modeOf, MODE_GROUP, DIGI_MODES, prefixToIso } from './radio.js';
import { I18N } from './i18n.js';
import { resolve as resolveEnt, entName } from './dxcc.js';
import * as MyLog from './mylog.js';
import { initAnalytics } from './analytics.js';
import { initActivation } from './activation.js';
import { initSpotBar } from './spotbar.js';
import { initTools } from './tools.js';
import { renderHf } from './hf.js';

/* ------------------------------------------------------------------ util */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const API = (window.CLUSTER_API ?? '/');
const HOME = [14.33, 41.07]; // IQ8DO – Caserta
const OVERRIDE = { ru: [45, 56], ca: [-95, 53], us: [-97, 39], au: [134, -26], cn: [104, 34], kz: [67, 48], no: [10, 61], se: [16, 61], fi: [26, 63] };
const centroid = (iso) => (OVERRIDE[iso] || countries[iso]?.ll || null);
const contOf = (iso) => countries[iso]?.r || '';
const CONTS = ['EU', 'NA', 'SA', 'AS', 'AF', 'OC'];
const store = {
  get(k, d) { try { const v = localStorage.getItem('iq8do.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('iq8do.' + k, JSON.stringify(v)); } catch { /* privato */ } },
};

/* ------------------------------------------------------------------ stato */
const cfg = {
  lang: store.get('lang', (navigator.language || 'it').startsWith('it') ? 'it' : 'en'),
  theme: store.get('theme', 'dark'),
  myCall: store.get('myCall', ''),
  watch: store.get('watch', []),
  sound: store.get('sound', true),
  notify: store.get('notify', false),
  poll: store.get('poll', 10),
  confirmedOnly: store.get('confirmedOnly', false),
  openAlerts: store.get('openAlerts', true),
  pushOpts: store.get('pushOpts', { mine: true, watch: true, space: true }),
  needAlerts: store.get('needAlerts', ['dxcc', 'band']),
  proj: store.get('proj', 'flat'),
  arcs: store.get('arcs', true),
  night: store.get('night', true),
  aurora: store.get('aurora', true),
  cq: store.get('cq', false),
  itu: store.get('itu', false),
  beacons: store.get('beacons', true),
  dxped: store.get('dxped', true),
  wide: store.get('wide', false),
  tiles: store.get('tiles', true),
  callbook: store.get('callbook', 'qrz'),
  heard: store.get('heard', true),
  sats: store.get('sats', true),
  quakes: store.get('quakes', true),
  moon: store.get('moon', true),
  awake: store.get('awake', false),
  legend: store.get('legend', !matchMedia('(max-width: 760px)').matches),
  haptic: store.get('haptic', true),
};
const F = { sub: 'ALL', order: store.get('order', 'time'), src: ['human', 'hcw', 'hft', 'all', 'cw', 'ft'].includes(store.get('src', 'human')) ? store.get('src', 'human') : 'human', mode: 'ALL', bands: new Set(), conts: new Set(), q: '', watchOnly: false, needOnly: false };
MyLog.load();
let logVer = 0;
const SPECIAL_LINK = /^#(9t0md|special)$/i.test(location.hash); // letto subito: l'app riscrive l'hash dopo
let ana = { isOpen: () => false, open() {}, close() {} };
let act = { isOpen: () => false, open() {}, close() {} };
let satList = [], quakeList = [], satPasses24 = [], satErr = '', quakeErr = '';
const NEEDCOL = { dxcc: '#ff3b5c', zone: '#b57bff', band: '#ffa53b', zband: '#ff8fd0', grid: '#4dd0ff', slot: '#ffe14d' };
const NEEDRANK = { dxcc: 6, zone: 5, band: 4, zband: 3, grid: 2, slot: 1 };
/** Novità dello spot per me (dipende dal log caricato): 'dxcc' | 'band' | 'slot' | null. */
function needOf(s) {
  if (s._nv !== logVer) { const b = s.band && s.band.id, n = MyLog.need(s.ent, b, s.grp, cfg.confirmedOnly), x = MyLog.needExtra(s.ent, b, s.comm, cfg.confirmedOnly);
    s._n = n === 'dxcc' ? n : x === 'zone' ? x : n || x; s._nv = logVer; }
  return s._n;
}
const bestNeed = (list) => list.reduce((b, s) => { const n = needOf(s); return n && (!b || NEEDRANK[n] > NEEDRANK[b]) ? n : b; }, null);
const spots = new Map(); // id → spot
let firstLoad = true;
let selected = null;
/** Nominativo "vero" (senza /P, /M, /MM…; con prefisso di portatile si sceglie la parte più lunga). */
const baseCall = (c) => {
  const parts = String(c).toUpperCase().split('/').filter((p) => p && !/^(P|M|MM|AM|QRP|A|B|LH|R|T|\d)$/.test(p));
  return parts.sort((a, b) => b.length - a.length)[0] || String(c).toUpperCase();
};
/** Pagina del nominativo su QRZ.com o HamQTH.com, secondo la scelta nelle impostazioni. */
const callUrl = (c) => (cfg.callbook === 'hamqth' ? 'https://www.hamqth.com/' : 'https://www.qrz.com/db/') + encodeURIComponent(baseCall(c));
const callbookName = () => (cfg.callbook === 'hamqth' ? 'HamQTH' : 'QRZ');
const t = (k) => (I18N[cfg.lang] || I18N.it)[k] ?? I18N.it[k] ?? k;

/* ------------------------------------------------------------------ dati */
function enrich(r) {
  const f = Number(r.freq);
  const band = bandOf(f);
  const mode = modeOf(f, r.comm);
  return {
    id: r.rowid, de: r.de, dx: r.dx, f, band, mode, grp: MODE_GROUP[mode] || 'PHONE', comm: r.comm || '',
    t: r.time * 1000, iso: (r.iso || (r.skim ? prefixToIso(r.dx) : '') || '').toLowerCase(), country: r.country || (r.skim ? entName(resolveEnt(r.dx)) : ''), deIso: prefixToIso(r.de), born: 0, ent: resolveEnt(r.dx),
    skim: !!r.skim, nsk: r.n || 0, smode: r.skim ? String(r.comm || '').split(' ')[0].toUpperCase() : '',
  };
}
let pollTimer = 0, skimErr = false;
async function poll() {
  clearTimeout(pollTimer);
  try {
    const res = await fetch(API + 'spotlist', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    let list = await res.json();
    if (F.src !== 'human') { // skimmer (RBN): raccoglitore sul server, facoltativo
      try { const sk = await fetch(API + 'skimlist', { cache: 'no-store' }); if (sk.ok) list = list.concat(await sk.json()); skimErr = false; } catch { skimErr = true; }
    }
    const fresh = [];
    for (const r of list.slice().reverse()) {
      if (spots.has(r.rowid)) continue;
      const s = enrich(r);
      if (!firstLoad) s.born = performance.now();
      spots.set(s.id, s);
      fresh.push(s);
    }
    const limit = Date.now() - 3 * 3600e3;
    for (const [id, s] of spots) if (s.t < limit || spots.size > 500) spots.delete(id);
    if (!firstLoad) fresh.forEach(checkAlerts);
    firstLoad = false;
    setStatus(true, list.length);
    refresh(fresh);
  } catch (e) {
    setStatus(false);
  }
  pollTimer = setTimeout(poll, cfg.poll * 1000);
}
function setStatus(ok, n) {
  const el = $('#status');
  el.textContent = ok ? `● ${t('live')} · ${spots.size} spot` : `○ ${t('offline')}`;
  el.style.color = ok ? 'var(--ok)' : 'var(--bad)';
}

/* ------------------------------------------------------------------ avvisi */
const wildcard = (p) => new RegExp('^' + p.trim().toUpperCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
let watchRes = [];
function compileWatch() { watchRes = cfg.watch.filter(Boolean).map(wildcard); }
const isWatched = (s) => watchRes.some((re) => re.test(s.dx));
const isMine = (s) => cfg.myCall && s.dx.toUpperCase() === cfg.myCall.toUpperCase();
function beep(mine) {
  if (!cfg.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const seq = mine ? [880, 1175, 1568] : [660, 880];
    seq.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.13;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      o.start(t0); o.stop(t0 + 0.16);
    });
    setTimeout(() => ctx.close(), 900);
  } catch { /* audio non disponibile */ }
}
function checkAlerts(s) {
  const mine = isMine(s), w = isWatched(s), nd = needOf(s), needHit = nd && cfg.needAlerts.includes(nd);
  if (!mine && !w && !needHit) return;
  toast(s, mine, !mine && !w ? nd : null);
  beep(mine); buzz(mine ? [220, 90, 220] : [140]);
  if (cfg.notify && 'Notification' in window && Notification.permission === 'granted') {
    const title = `${s.dx} ${(s.f / 1000).toFixed(3)} MHz`, opt = { body: `${s.mode} · ${s.country} · de ${s.de}`, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'dx-' + s.dx, data: { url: callUrl(s.dx) } };
    navigator.serviceWorker?.getRegistration().then((reg) => { if (reg) return reg.showNotification(title, opt); throw new Error('no sw'); }).catch(() => { try { new Notification(title, opt); } catch { /* non supportate */ } });
  }
}
function toast(s, mine, nd) {
  const el = document.createElement('div');
  el.className = 'toast' + (mine ? ' mine' : '') + (nd ? ' need-' + nd : '');
  el.innerHTML = `<b>${esc(s.dx)}</b> ${mine ? t('spottedYou') : nd ? t('need_' + nd) : t('watchHit')}<br>${(s.f / 1000).toFixed(3)} MHz · ${esc(s.mode)} · ${esc(s.country)} <small>(de ${esc(s.de)})</small>`;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 12000);
}

/* ------------------------------------------------------------------ filtri */
function passes(s) {
  if (F.src === 'human' && s.skim) return false;
  if (F.src === 'cw' && !(s.skim && (s.smode === 'CW' || s.smode === 'RTTY'))) return false;
  if (F.src === 'hcw' && s.skim && !(s.smode === 'CW' || s.smode === 'RTTY')) return false;   // cluster + skimmer CW
  if (F.src === 'hft' && s.skim && (s.smode === 'CW' || s.smode === 'RTTY')) return false;    // cluster + skimmer FT8/digitali
  if (F.src === 'ft' && !(s.skim && s.smode !== 'CW' && s.smode !== 'RTTY')) return false;
  if (F.mode !== 'ALL' && s.grp !== F.mode) return false;
  if (F.mode === 'DIGI' && F.sub !== 'ALL' && s.mode !== F.sub) return false;
  if (F.bands.size && !(s.band && F.bands.has(s.band.id))) return false;
  if (F.conts.size && !F.conts.has(contOf(s.iso))) return false;
  if (F.watchOnly && !isWatched(s) && !isMine(s)) return false;
  if (F.needOnly && !needOf(s)) return false;
  if (F.q && !(s.dx.includes(F.q) || s.de.includes(F.q) || s.country.toUpperCase().includes(F.q))) return false;
  return true;
}
/** Distanza (km) e azimut da Caserta verso l'entità dello spot (centro dell'entità DXCC), in cache nello spot. */
function geoOf(s) {
  if (s._g === undefined) {
    if (s.ent >= 0) { const e = ENTITIES[s.ent], ll = [e[5], e[4]]; s._g = { km: Math.round(distanceKm(HOME, ll)), az: Math.round(bearing(HOME, ll)) }; } else s._g = null;
  }
  return s._g;
}
const sorted = () => [...spots.values()].sort(F.order === 'dist' ? (a, b) => (geoOf(b)?.km || 0) - (geoOf(a)?.km || 0) || b.t - a.t : (a, b) => b.t - a.t || b.id - a.id);
const visible = () => sorted().filter(passes);

/* ------------------------------------------------------------------ feed */
function fmtFreq(khz) { return khz >= 1e6 ? (khz / 1e6).toFixed(3) + ' G' : (khz / 1000).toFixed(khz < 30000 ? 3 : 3); }
function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  return Math.floor(s / 3600) + 'h';
}
/** Già collegato prima? (solo con il log caricato e ricaricato dopo l'aggiornamento) */
function wkBadge(s) {
  const w = MyLog.workedCall(s.dx, s.band && s.band.id);
  return w ? `<u class="nb nb-wk${w === 'band' ? '' : ' o'}" title="${t(w === 'band' ? 'wkBand' : 'wkOther')}">✔${w === 'band' ? ' ' + esc(s.band.name) : ''}</u>` : '';
}
function renderFeed() {
  const list = visible().slice(0, 90);
  const ol = $('#feed');
  if (!list.length) { ol.innerHTML = `<li class="empty">${firstLoad ? t('loading') : t('noSpots')}</li>`; return; }
  ol.innerHTML = list.map((s) => {
    const c = s.band ? s.band.color : '#94a3b8';
    const cls = ['spot'];
    if (s.id === selected) cls.push('sel');
    if (s.born && performance.now() - s.born < 2500) cls.push('new');
    if (isMine(s)) cls.push('mine'); else if (isWatched(s)) cls.push('watch');
    const nd = needOf(s);
    if (nd) cls.push('needs', 'needs-' + nd);
    return `<li class="${cls.join(' ')}" data-id="${s.id}">
      <div class="freq" style="--c:${c}"><b>${fmtFreq(s.f)}</b><i>${esc(s.band ? s.band.name : '—')}</i></div>
      <div class="dx">${s.iso ? `<img src="flags/${esc(s.iso)}.svg" alt="" width="22" height="16">` : ''}<a class="cs" href="${callUrl(s.dx)}" target="_blank" rel="noopener" data-act="call" title="${callbookName()}">${esc(s.dx)}</a>${s.skim ? `<u class="nb nb-sk" title="${t('skimT')}">${t('skim')}</u>` : ''}${nd ? `<u class="nb nb-${nd}">${t('need_' + nd)}</u>` : wkBadge(s)}<span>${esc(s.country)}</span></div>
      <span class="age" data-t="${s.t}">${ago(s.t)}</span>
      <div class="meta"><em>${esc(s.mode)}</em>${(() => { const g = geoOf(s); return g ? `<small class="gd" title="${t('gdT')}">${g.az}° · ${g.km.toLocaleString('it-IT')} km</small>` : ''; })()}<span>de <a class="cs de" href="${callUrl(s.de)}" target="_blank" rel="noopener" data-act="call">${esc(s.de)}</a>${s.comm ? ' · ' + esc(s.comm) : ''}</span></div>
      <div class="acts"><a href="${callUrl(s.dx)}" target="_blank" rel="noopener" data-act="qrz">${callbookName()}</a><button data-act="info" title="${t('info')}">ⓘ</button><button data-act="map" class="mapbtn" title="${t('onMap')}">🗺</button><button data-act="copy" title="${t('copyFreq')}">📋</button><button data-act="wa" title="${t('waShare')}">🟢</button><button data-act="watch" title="${t('addWatch')}">★</button></div>
    </li>`;
  }).join('');
}
$('#feed').addEventListener('click', (e) => {
  const li = e.target.closest('.spot'); if (!li) return;
  const s = spots.get(Number(li.dataset.id)); if (!s) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'qrz' || act === 'call') return; // è un link: si apre il callbook, senza selezionare lo spot
  if (act === 'copy') { navigator.clipboard?.writeText((s.f / 1000).toFixed(3)); toastText(`${(s.f / 1000).toFixed(3)} MHz ${t('copied')}`); return; }
  if (act === 'wa') { shareWhatsApp(s); return; }
  if (act === 'watch') { addWatch(s.dx); return; }
  if (act === 'info') { openSpotInfo(s); return; }
  if (act === 'map') { showTab('map'); setTimeout(() => { selected = null; select(s.id); }, 120); return; }
  select(s.id);
});
/* ------------------------------------------------------------------ scheda della stazione (dettagli di uno spot) */
const WA_GROUP = ''; // link d'invito del gruppo WhatsApp (vuoto: si apre WhatsApp col testo già scritto)
/** Copia lo spot e apre il gruppo WhatsApp della Sezione (basta incollare e inviare); senza appunti apre WhatsApp col testo già scritto. */
function shareWhatsApp(s) {
  const mhz = (s.f / 1000).toFixed(3);
  const txt = `📡 *${s.dx}*${s.country ? ' (' + s.country + ')' : ''}\n${mhz} MHz${s.band ? ' · ' + s.band.name : ''} · ${s.mode}\nde ${s.de}${s.comm ? ' · ' + s.comm : ''}\n🕒 ${new Date(s.t).toISOString().slice(11, 16)} UTC · https://iq8do.aricaserta.it/`;
  if (WA_GROUP && navigator.clipboard?.writeText) { navigator.clipboard.writeText(txt).catch(() => {}); toastText(t('waCopied')); window.open(WA_GROUP, '_blank', 'noopener'); }
  else window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
}
function openSpotInfo(s) {
  const e = s.ent >= 0 ? ENTITIES[s.ent] : null, now = Date.now();
  const rows = [];
  const row = (k, v) => v && rows.push(`<div><dt>${t(k)}</dt><dd>${v}</dd></div>`);
  if (e) {
    const ll = [e[5], e[4]], p = paths(HOME, ll), alt = sunAlt(ll, now), altH = sunAlt(HOME, now);
    const ph = (a) => (a > 8 ? t('siDay') : a < -8 ? t('siNight') : t('siGrey'));
    const solar = new Date(now + (ll[0] / 15) * 3600e3), hhmm = `${String(solar.getUTCHours()).padStart(2, '0')}:${String(solar.getUTCMinutes()).padStart(2, '0')}`;
    row('siEntity', `${esc(e[0])} <small>(${esc(e[6])} · ${esc(e[3])})</small>`);
    row('siZones', `CQ ${e[1]} · ITU ${e[2]}`);
    row('siShort', `${Math.round(p.azSp)}° · ${Math.round(p.sp).toLocaleString('it-IT')} km`);
    row('siLong', `${Math.round(p.azLp)}° · ${Math.round(p.lp).toLocaleString('it-IT')} km`);
    row('siLocal', `${hhmm} · ${ph(alt)}`);
    row('siHome', ph(altH));
    const reg = e[3], m = s.band ? openMatrix([...spots.values()], { home: HOME, centroid, contOf, minutes: 30 }) : null;
    if (m && m[s.band.id] && m[s.band.id][reg] !== undefined) row('siOpen', `${s.band.name} → ${reg}: ${m[s.band.id][reg]} spot / 30 min`);
  }
  const nd = needOf(s);
  const wk = MyLog.workedCall(s.dx, s.band && s.band.id);
  if (MyLog.hasLog()) row('siLog', (nd ? `<b style="color:${NEEDCOL[nd]}">${t('need_' + nd)}</b>` : t('siNothingNew')) + (wk ? ` · ${t(wk === 'band' ? 'wkBand' : 'wkOther')}` : ''));
  const c = encodeURIComponent(baseCall(s.dx));
  $('#spotInfo').innerHTML = `<h2>${s.iso ? `<img src="flags/${esc(s.iso)}.svg" alt="" width="26" height="19"> ` : ''}${esc(s.dx)} <small>${esc(s.country)}</small></h2>
    <p class="si-line"><b>${(s.f / 1000).toFixed(3)} MHz</b> · ${esc(s.band ? s.band.name : '')} · ${esc(s.mode)}${s.skim ? ` · <u class="nb nb-sk">${t('skim')}</u>` : ''} · ${ago(s.t)}</p>
    <p class="si-line">de <b>${esc(s.de)}</b>${s.comm ? ` · ${esc(s.comm)}` : ''}</p>
    <dl class="si">${rows.join('')}</dl>
    <div class="si-links"><a href="${callUrl(s.dx)}" target="_blank" rel="noopener">${callbookName()}</a><a href="https://clublog.org/logsearch/${c}" target="_blank" rel="noopener">Club Log</a><a href="https://pskreporter.info/pskmap.html?callsign=${c}" target="_blank" rel="noopener">PSK Reporter</a>
      <button type="button" data-si="copy">📋 ${t('copyFreq')}</button><button type="button" data-si="wa">🟢 WhatsApp</button><button type="button" data-si="watch">★ ${t('addWatch')}</button><button type="button" data-si="map">🗺 ${t('onMap')}</button></div>`;
  const dlg = $('#dlgSpot'); dlg._spot = s;
  if (!dlg.open) dlg.showModal();
}
$('#dlgSpot').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-si]'); if (!b) return;
  const s = $('#dlgSpot')._spot; if (!s) return;
  if (b.dataset.si === 'copy') { navigator.clipboard?.writeText((s.f / 1000).toFixed(3)); toastText(`${(s.f / 1000).toFixed(3)} MHz ${t('copied')}`); }
  if (b.dataset.si === 'wa') shareWhatsApp(s);
  if (b.dataset.si === 'watch') addWatch(s.dx);
  if (b.dataset.si === 'map') { $('#dlgSpot').close(); showTab('map'); setTimeout(() => { selected = null; select(s.id); }, 150); }
});

/* ------------------------------------------------------------------ telefono: schede, gesti, schermo acceso, vibrazione */
const isPhone = () => matchMedia('(max-width: 760px)').matches;
const TABS = ['map', 'feed', 'stats'];
function showTab(tab) {
  const b = $(`#tabs button[data-tab="${tab}"]`); if (b) b.click();
  if (isPhone()) scrollTo({ top: 0 });
}
// scorrimento laterale = scheda vicina (non sopra mappa, barre orizzontali e tabelle)
(() => {
  let sx = 0, sy = 0, st = 0, ok = false;
  const skip = (el) => el.closest('canvas, .srcbar, .bandbar, table, .chips, .tk, .layers, dialog, input, textarea, select');
  addEventListener('touchstart', (e) => { if (!isPhone() || e.touches.length !== 1 || skip(e.target)) { ok = false; return; } ok = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); }, { passive: true });
  addEventListener('touchend', (e) => {
    if (!ok) return; ok = false;
    const t0 = e.changedTouches[0], dx = t0.clientX - sx, dy = t0.clientY - sy;
    if (Date.now() - st > 600 || Math.abs(dx) < 80 || Math.abs(dy) > 45 || Math.abs(dx) < Math.abs(dy) * 2.2) return;
    const cur = TABS.indexOf($('#layout').dataset.tab), nx = cur + (dx < 0 ? 1 : -1);
    if (nx >= 0 && nx < TABS.length) showTab(TABS[nx]);
  }, { passive: true });
})();
$('#btnSearch').addEventListener('click', () => { document.body.classList.add('qopen'); $('#q').focus(); });
$('#q').addEventListener('blur', () => setTimeout(() => document.body.classList.remove('qopen'), 150));
$('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
// schermo sempre acceso (utile per tenere il cluster sul tavolo)
let wakeLock = null;
async function applyAwake() {
  try {
    if (cfg.awake && 'wakeLock' in navigator && document.visibilityState === 'visible') { if (!wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } }
    else if (wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', applyAwake);
const buzz = (p) => { if (cfg.haptic && navigator.vibrate) try { navigator.vibrate(p); } catch { /* non supportata */ } };
function toastText(msg, ms = 2500) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; $('#toasts').append(el); setTimeout(() => el.remove(), ms);
}
function addWatch(call) {
  if (!cfg.watch.includes(call)) { cfg.watch.push(call); store.set('watch', cfg.watch); compileWatch(); renderFeed(); toastText(`★ ${call}`); }
}

/* ------------------------------------------------------------------ bande/statistiche */
function counts(minutes) {
  const lim = Date.now() - minutes * 60e3, by = {};
  for (const s of spots.values()) if (s.t >= lim && s.band) by[s.band.id] = (by[s.band.id] || 0) + 1;
  return by;
}
function renderBands() {
  const c30 = counts(30), c10 = counts(10);
  $('#bandbar').innerHTML = BANDS.filter((b) => b.id !== 'SHF').map((b) => {
    const cls = ['band']; if (F.bands.has(b.id)) cls.push('on'); if ((c10[b.id] || 0) >= 8) cls.push('hot'); if (!c30[b.id]) cls.push('off');
    return `<button class="${cls.join(' ')}" style="--c:${b.color}" data-b="${b.id}"><i></i>${b.name}<b>${c30[b.id] || 0}</b></button>`;
  }).join('');
  const max = Math.max(1, ...Object.values(c30));
  $('#bars').innerHTML = BANDS.filter((b) => b.id !== 'SHF').map((b) =>
    `<div class="bar" style="--c:${b.color}" data-b="${b.id}"><span>${b.name}</span><div><i style="width:${((c30[b.id] || 0) / max) * 100}%"></i></div><b>${c30[b.id] || 0}</b></div>`).join('');
}
$('#bandbar').addEventListener('click', (e) => toggleBand(e.target.closest('[data-b]')?.dataset.b));
$('#bars').addEventListener('click', (e) => toggleBand(e.target.closest('[data-b]')?.dataset.b));
function toggleBand(id) { if (!id) return; F.bands.has(id) ? F.bands.delete(id) : F.bands.add(id); refresh(); }

function renderTop() {
  const lim = Date.now() - 30 * 60e3, by = new Map();
  for (const s of spots.values()) if (s.t >= lim && s.iso) { const o = by.get(s.iso) || { n: 0, name: s.country }; o.n++; by.set(s.iso, o); }
  const top = [...by].sort((a, b) => b[1].n - a[1].n).slice(0, 7);
  $('#topdx').innerHTML = top.map(([iso, o]) => `<li><img src="flags/${esc(iso)}.svg" alt=""><span>${esc(o.name)}</span><b>${o.n}</b></li>`).join('') || `<li class="empty">—</li>`;
}
function renderSpark() {
  const cv = $('#spark'), dpr = devicePixelRatio || 1, w = cv.clientWidth, h = 70;
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const bins = new Array(30).fill(0), now = Date.now();
  for (const s of spots.values()) { const m = Math.floor((now - s.t) / 60e3); if (m >= 0 && m < 30) bins[29 - m]++; }
  const max = Math.max(4, ...bins), css = getComputedStyle(document.documentElement);
  const acc = css.getPropertyValue('--acc').trim();
  g.beginPath();
  bins.forEach((v, i) => { const x = (i / 29) * (w - 2) + 1, y = h - 6 - (v / max) * (h - 16); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.strokeStyle = acc; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
  g.lineTo(w - 1, h); g.lineTo(1, h); g.closePath();
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, acc + '66'); gr.addColorStop(1, acc + '00'); g.fillStyle = gr; g.fill();
  const perMin = bins.slice(-5).reduce((a, b) => a + b, 0) / 5;
  $('#liveCount').textContent = perMin.toFixed(1);
}
let heatData = null;
async function loadHeat() {
  try { const r = await fetch(API + 'plot_get_hour_band'); const j = await r.json(); heatData = j.hour_band; renderHeat(); } catch { /* opzionale */ }
}
function renderHeat() {
  if (!heatData) return;
  const cv = $('#heat'), dpr = devicePixelRatio || 1, w = cv.clientWidth, rowsIds = BANDS.map((b) => b.id).filter((id) => heatData[id]);
  const rowH = 12, h = rowsIds.length * rowH + 16; cv.style.height = h + 'px'; cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const lab = 34, cw = (w - lab) / 24, nowH = new Date().getUTCHours();
  g.font = '10px system-ui'; g.textBaseline = 'middle';
  const css = getComputedStyle(document.documentElement);
  rowsIds.forEach((id, r) => {
    const b = BANDS.find((x) => x.id === id), row = heatData[id], max = Math.max(1, ...Object.values(row).map(Number));
    g.fillStyle = css.getPropertyValue('--mut').trim(); g.fillText(b.name, 0, r * rowH + rowH / 2);
    for (let hr = 0; hr < 24; hr++) {
      const v = (Number(row[hr]) || 0) / max;
      g.globalAlpha = 0.08 + v * 0.92; g.fillStyle = b.color;
      g.beginPath(); g.roundRect(lab + hr * cw + 1, r * rowH + 1, cw - 2, rowH - 2, 3); g.fill();
    }
  });
  g.globalAlpha = 1; g.strokeStyle = css.getPropertyValue('--acc2').trim(); g.lineWidth = 2;
  g.strokeRect(lab + nowH * cw, 0, cw, rowsIds.length * rowH);
  g.fillStyle = css.getPropertyValue('--mut').trim();
  for (let hr = 0; hr < 24; hr += 3) g.fillText(String(hr).padStart(2, '0'), lab + hr * cw + 2, rowsIds.length * rowH + 9);
}

/* ------------------------------------------------------------------ continenti / modo */
$('#contChips').innerHTML = `<button data-c="ALL" class="on">${''}</button>` + CONTS.map((c) => `<button data-c="${c}">${c}</button>`).join('');
$('#contChips').addEventListener('click', (e) => {
  const c = e.target.closest('button')?.dataset.c; if (!c) return;
  if (c === 'ALL') F.conts.clear(); else F.conts.has(c) ? F.conts.delete(c) : F.conts.add(c);
  refresh();
});
$('#modeChips').addEventListener('click', (e) => { const m = e.target.closest('button')?.dataset.m; if (!m) return; F.mode = m; if (m !== 'DIGI') F.sub = 'ALL'; refresh(); });
$('#digChips').innerHTML = `<button data-d="ALL" class="on"></button>` + DIGI_MODES.map(([k, l]) => `<button data-d="${k}">${l}</button>`).join('');
$('#digChips').addEventListener('click', (e) => { const d = e.target.closest('button')?.dataset.d; if (!d) return; F.sub = d; refresh(); });
function syncChips() {
  $$('#modeChips button').forEach((b) => b.classList.toggle('on', b.dataset.m === F.mode));
  $('#digChips').hidden = F.mode !== 'DIGI';
  $$('#digChips button').forEach((b) => b.classList.toggle('on', b.dataset.d === F.sub));
  $('#digChips [data-d=ALL]').textContent = t('digAll');
  $$('#srcChips button').forEach((b) => b.classList.toggle('on', b.dataset.s === F.src));
  $$('#orderChips button').forEach((b) => b.classList.toggle('on', b.dataset.o === F.order));
  $$('#contChips button').forEach((b) => b.classList.toggle('on', b.dataset.c === 'ALL' ? !F.conts.size : F.conts.has(b.dataset.c)));
  $('#contChips [data-c=ALL]').textContent = t('all');
  $('#modeChips [data-m=ALL]').textContent = t('all');
}
$('#orderChips').addEventListener('click', (e) => {
  const o = e.target.closest('button')?.dataset.o; if (!o || o === F.order) return;
  F.order = o; store.set('order', o); refresh();
});
$('#srcChips').addEventListener('click', (e) => {
  const s = e.target.closest('button')?.dataset.s; if (!s || s === F.src) return;
  F.src = s; store.set('src', s); refresh(); poll();
  if (s !== 'human') toastText(t('srcHint'), 6000);
});
$('#q').addEventListener('input', (e) => { F.q = e.target.value.trim().toUpperCase(); refresh(); });
$('#optWatchOnly').addEventListener('change', (e) => { F.watchOnly = e.target.checked; refresh(); });
$('#optNeedOnly').addEventListener('change', (e) => { F.needOnly = e.target.checked; refresh(); });
addEventListener('keydown', (e) => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#q').focus(); }
  if (e.key === 'Escape') { $('#q').value = ''; F.q = ''; selected = null; refresh(); }
  if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (k === 'p') { const o = ['flat', 'azim', 'globe']; map.setProj(o[(o.indexOf(cfg.proj) + 1) % o.length]); }
  else if (k === 'r') $('#btnReset').click();
  else if (k === 'w') { const c = $('#optWatchOnly'); c.checked = !c.checked; c.dispatchEvent(new Event('change')); }
  else if (k === 'n') { const c = $('#optNeedOnly'); c.checked = !c.checked; c.dispatchEvent(new Event('change')); }
  else if (k === 'e') exportCsv();
  else if (k === 'l') shareLink();
  else if (['1', '2', '3', '4'].includes(k)) { F.mode = ['ALL', 'CW', 'PHONE', 'DIGI'][Number(k) - 1]; refresh(); }
  else if (k === '?') toastText(t('keysHelp'), 12000);
});
/** Esporta in CSV gli spot che si vedono in lista (filtri compresi). */
function exportCsv() {
  const rows = visible().slice().sort((a, b) => b.t - a.t), q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['utc,dx,freq_khz,band,mode,de,country,comment', ...rows.map((s) => [new Date(s.t).toISOString(), s.dx, (s.f).toFixed(1), s.band ? s.band.name : '', s.mode, s.de, s.country, s.comm].map(q).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' })); a.download = `iq8do-spots-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.csv`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toastText(`${t('exported')}: ${rows.length}`);
}
/* Link condivisibile: filtri e proiezione nell'indirizzo (#b=20,40&m=CW&c=EU&p=azim&q=…) */
function stateHash() {
  const p = new URLSearchParams();
  if (F.bands.size) p.set('b', [...F.bands].join(','));
  if (F.mode !== 'ALL') p.set('m', F.mode);
  if (F.mode === 'DIGI' && F.sub !== 'ALL') p.set('d', F.sub);
  if (F.src !== 'human') p.set('s', F.src);
  if (F.conts.size) p.set('c', [...F.conts].join(','));
  if (F.q) p.set('q', F.q);
  if (cfg.proj !== 'flat') p.set('p', cfg.proj);
  return p.toString();
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('b')) p.get('b').split(',').forEach((b) => { if (BANDS.some((x) => x.id === b)) F.bands.add(b); });
  if (['CW', 'PHONE', 'DIGI'].includes(p.get('m'))) F.mode = p.get('m');
  if (F.mode === 'DIGI' && DIGI_MODES.some(([k]) => k === p.get('d'))) F.sub = p.get('d');
  if (['all', 'cw', 'ft', 'hcw', 'hft'].includes(p.get('s'))) { F.src = p.get('s'); store.set('src', F.src); }
  if (p.get('c')) p.get('c').split(',').forEach((c) => { if (['EU', 'NA', 'SA', 'AS', 'AF', 'OC'].includes(c)) F.conts.add(c); });
  if (p.get('q')) { F.q = p.get('q').toUpperCase().slice(0, 20); $('#q').value = F.q; }
  if (['flat', 'azim', 'globe'].includes(p.get('p'))) { cfg.proj = p.get('p'); store.set('proj', cfg.proj); }
}
function shareLink() {
  const h = stateHash(), url = location.origin + location.pathname + (h ? '#' + h : '');
  navigator.clipboard?.writeText(url).then(() => toastText(t('linkCopied')), () => toastText(url, 8000));
}

function refresh(fresh) {
  try { history.replaceState(null, '', location.pathname + location.search + (stateHash() ? '#' + stateHash() : '')); } catch { /* */ }
  syncChips(); renderTrend(); renderBands(); renderFeed(); renderTop(); renderSpark(); renderMyDx(); renderProp(); if (fresh?.length) map.onSpots(fresh);
}
function select(id) {
  selected = selected === id ? null : id; renderFeed();
  const s = spots.get(selected); if (s) map.focus(s);
}

/* ------------------------------------------------------------------ mappa */
const land = feature(world, world.objects.countries);
const coast = mesh(world, world.objects.countries, (a, b) => a === b);
const borders = mesh(world, world.objects.countries, (a, b) => a !== b);
const sphere = { type: 'Sphere' };
const graticule = geoGraticule10();
const DEG = Math.PI / 180;
function sunPos(ms) {
  const rad = DEG, n = ms / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, eps = (23.439 - 4e-7 * n) * rad;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam)), ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  return [((ra / rad - gmst + 540) % 360) - 180, dec / rad];
}
const map = (() => {
  const cv = $('#map'), ctx = cv.getContext('2d'), tip = $('#tip'), glc = $('#mapgl');
  const GL = createGL(glc);
  let glDirty = true, glp = null;
  let W = 0, H = 0, dpr = 1, proj, path, colors = {}, view = { k: 1, tx: 0, ty: 0, lon0: HOME[0], lat0: 17 }, rot = [-HOME[0], -25], auto = true, drag = null;
  let flatK = 0, tileInfo = null, probe = null, needSetup = false;
  // Scritte agganciate ai pixel del dispositivo: con coordinate frazionarie i caratteri "tremano" mentre si trascina la mappa
  const snap = (v) => Math.round(v * dpr) / dpr;
  const fillTextRaw = ctx.fillText.bind(ctx), strokeTextRaw = ctx.strokeText.bind(ctx);
  ctx.fillText = (txt, x, y, mw) => (mw === undefined ? fillTextRaw(txt, snap(x), snap(y)) : fillTextRaw(txt, snap(x), snap(y), mw));
  ctx.strokeText = (txt, x, y, mw) => (mw === undefined ? strokeTextRaw(txt, snap(x), snap(y)) : strokeTextRaw(txt, snap(x), snap(y), mw));
  const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));
  const unmerc = (m) => (2 * Math.atan(Math.exp(m)) - Math.PI / 2) / DEG;
  const hud = $('#zoomhud'), tileAttrib = $('#tileAttrib');
  let hudKey = '';
  let markers = [], hover = null, focusAnim = null, nightPoly = null, nightAt = 0;
  const rotating = () => cfg.proj !== 'flat';
  const readColors = () => {
    const c = getComputedStyle(document.documentElement), g = (n) => c.getPropertyValue(n).trim();
    colors = { land: g('--land'), landS: g('--land-s'), sea: g('--sea'), grid: g('--grid'), night: g('--night'), acc: g('--acc'), acc2: g('--acc2'), tx: g('--tx'), halo: document.documentElement.dataset.theme === 'light' ? 'rgba(255,255,255,.92)' : 'rgba(0,0,0,.65)', bord: g('--bord') || 'rgba(170,200,255,.28)' };
  };
  function setup() {
    dpr = devicePixelRatio || 1; W = cv.clientWidth; H = cv.clientHeight;
    const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    let cx, cy, k;
    if (cfg.proj === 'globe') {
      const r = Math.min(W, H) / 2 - 14; k = r * view.k; cx = W / 2 + view.tx; cy = H / 2 + view.ty + 12;
      proj = geoOrthographic().clipAngle(90).rotate(rot).scale(k).translate([cx, cy]);
      glp = { mode: 2, scale: 1 / (k * dpr) };
    } else if (cfg.proj === 'azim') {
      const r = Math.min(W, H) / 2 - 12; k = r * view.k; cx = W / 2 + view.tx; cy = H / 2 + view.ty + 6;
      proj = geoAzimuthalEquidistant().rotate(rot).scale(k / Math.PI).translate([cx, cy]);
      glp = { mode: 1, scale: Math.PI / (k * dpr), clip: k * dpr };
    } else {
      const worldW = W * view.k; k = worldW / (2 * Math.PI); cx = W / 2; cy = H / 2 + k * merc(view.lat0);
      proj = geoMercator().rotate([-view.lon0, 0]).scale(k).translate([cx, cy]).clipExtent([[-60, -60], [W + 60, H + 60]]);
      flatK = k;
      glp = { mode: 0, scale: 1 / (k * dpr), clon0: view.lon0 * DEG };
    }
    glp.w = Math.round(W * dpr); glp.h = Math.round(H * dpr);
    glp.ox = cx * dpr; glp.oy = (H - cy) * dpr;
    path = geoPath(proj, ctx); glDirty = true;
  }
  function renderGL() {
    if (!GL.ok || !glp) return;
    if (rotating()) { glp.clat = -rot[1] * DEG; glp.clon = -rot[0] * DEG; }
    const [lo, la] = sunPos(Date.now());
    glp.sun = [Math.cos(la * DEG) * Math.cos(lo * DEG), Math.cos(la * DEG) * Math.sin(lo * DEG), Math.sin(la * DEG)];
    glp.theme = cfg.theme; glp.night = cfg.night; glp.aurora = cfg.aurora;
    GL.draw(glp); glDirty = false;
  }
  const moon = () => {
    if (!cfg.night) return null;
    if (!nightPoly || Date.now() - nightAt > 30000) {
      const [lo, la] = sunPos(Date.now()), anti = [lo + 180, -la];
      nightPoly = { deep: geoCircle().center(anti).radius(90)(), dusk: geoCircle().center(anti).radius(96)(), day: [lo, la] }; nightAt = Date.now();
    }
    return nightPoly;
  };
  const vis = (ll) => cfg.proj !== 'globe' || geoDistance([-rot[0], -rot[1]], ll) < Math.PI / 2 - 0.02;
  function arcOf(s) {
    const B = centroid(s.iso); if (!B) return null;
    const A = (s.deIso && centroid(s.deIso)) || HOME;
    return [A, B];
  }
  function draw(now) {
    if (needSetup) { needSetup = false; setup(); }
    if (!path) return;
    if (auto && rotating() && !drag) { rot[0] -= cfg.proj === 'globe' ? 0.06 : 0; proj.rotate(rot); }
    if (GL.ok && (glDirty || (auto && cfg.proj === 'globe') || focusAnim || drag)) renderGL();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const n = moon();
    // immagini satellitari (solo vista Piana, ingrandendo): NASA Blue Marble e Sentinel-2 a 10 m
    const worldCss = W * view.k;
    const heavy = cfg.proj === 'flat' && worldCss > 25000; // zoom profondo: si disegnano solo le tessere e i punti
    tileInfo = null;
    if (cfg.proj === 'flat' && cfg.tiles && worldCss > 3000) {
      const alpha = Math.min(1, (worldCss - 3000) / 3000);
      tileInfo = drawTiles(ctx, { W, H, k: flatK, lon0: view.lon0, m0: merc(view.lat0), dpr, alpha });
      tileInfo.alpha = alpha;
      if (n) {
        ctx.save(); ctx.globalAlpha = alpha;
        if (heavy) {
          // vista ravvicinata: un'unica tinta secondo l'altezza del Sole al centro
          const [lo, la] = sunPos(Date.now()), sinH = Math.sin(la * DEG) * Math.sin(view.lat0 * DEG) + Math.cos(la * DEG) * Math.cos(view.lat0 * DEG) * Math.cos((view.lon0 - lo) * DEG);
          const h = Math.asin(Math.max(-1, Math.min(1, sinH))) / DEG, a = h > 0 ? 0 : Math.min(0.34, (-h / 18) * 0.34);
          ctx.fillStyle = `rgba(2,5,18,${a})`; ctx.fillRect(0, 0, W, H);
        } else {
          ctx.beginPath(); path(n.dusk); ctx.fillStyle = 'rgba(2,5,18,.20)'; ctx.fill();
          ctx.beginPath(); path(n.deep); ctx.fillStyle = 'rgba(2,5,18,.30)'; ctx.fill();
        }
        ctx.restore();
      }
    }
    updateHud();
    if (GL.ok) {
      // la base (terra, mare, notte, luci) è nel canvas WebGL: qui solo confini e reticolo sottili
      const deep = heavy;
      if (!deep) { ctx.beginPath(); path(graticule); ctx.strokeStyle = colors.grid; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); path(borders); ctx.strokeStyle = colors.bord; ctx.globalAlpha = 0.45; ctx.lineWidth = 0.5; ctx.stroke(); ctx.globalAlpha = 1; }
      if (!deep) { ctx.beginPath(); path(coast); ctx.strokeStyle = colors.bord; ctx.lineWidth = 0.7; ctx.stroke(); }
      if (cfg.proj !== 'flat') { ctx.beginPath(); path(sphere); ctx.strokeStyle = colors.bord; ctx.lineWidth = 1.4; ctx.stroke(); }
    } else {
      // senza WebGL: disegno semplice a 2D
      ctx.beginPath(); path(sphere); ctx.fillStyle = colors.sea; ctx.fill();
      ctx.beginPath(); path(graticule); ctx.strokeStyle = colors.grid; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); path(land); ctx.fillStyle = colors.land; ctx.fill(); ctx.strokeStyle = colors.landS; ctx.lineWidth = 0.6; ctx.stroke();
      if (n) {
        ctx.beginPath(); path(n.dusk); ctx.fillStyle = colors.night; ctx.globalAlpha = 0.55; ctx.fill();
        ctx.beginPath(); path(n.deep); ctx.globalAlpha = 1; ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    if (n) {
      const sp = vis(n.day) ? proj(n.day) : null;
      if (sp) { ctx.beginPath(); ctx.arc(sp[0], sp[1], 6, 0, 7); ctx.fillStyle = '#ffd23f'; ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 16; ctx.fill(); ctx.shadowBlur = 0; }
    }
    // zone CQ / ITU e beacon NCDXF
    markers = [];
    if (cfg.itu && !heavy && zonesLoaded('itu')) drawZones(zonesLoaded('itu'), colors.acc, [2, 3], 0.55, 10);
    if (cfg.cq && !heavy && zonesLoaded('cq')) drawZones(zonesLoaded('cq'), colors.acc2, [6, 3], 0.7, 12);
    if (cfg.beacons) drawBeacons(now);
    if (cfg.dxped) drawDxped(now);
    if (cfg.heard) drawHeard(now);
    if (cfg.quakes) drawQuakes(now);
    if (cfg.sats) drawSats(now);
    if (cfg.moon) drawMoon(now);
    // archi + marker
    const list = visible().filter((s) => s.t > Date.now() - 20 * 60e3);
    const byIso = new Map();
    ctx.lineCap = 'round';
    for (const s of list) {
      const ends = arcOf(s); if (!ends) continue;
      const age = (Date.now() - s.t) / 1000, life = Math.max(0.1, 1 - age / 1200), col = s.band ? s.band.color : '#94a3b8';
      const isSel = s.id === selected;
      if (cfg.arcs || isSel) {
        ctx.beginPath();
        const since = s.born ? (now - s.born) / 1000 : 99;
        if (since < 2.2) {
          const tt = since / 2.2, itp = geoInterpolate(ends[0], ends[1]);
          poly(ends[0], ends[1], tt);
          const head = vis(itp(tt)) ? proj(itp(tt)) : null;
          ctx.strokeStyle = col; ctx.globalAlpha = 0.95; ctx.lineWidth = 2; ctx.stroke();
          if (head) { ctx.beginPath(); ctx.arc(head[0], head[1], 3.2, 0, 7); ctx.fillStyle = '#fff'; ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0; }
        } else {
          poly(ends[0], ends[1]);
          ctx.strokeStyle = col; ctx.globalAlpha = isSel ? 1 : 0.55 * life; ctx.lineWidth = isSel ? 2.6 : 1.1; ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      const o = byIso.get(s.iso) || { ll: ends[1], list: [] }; o.list.push(s); byIso.set(s.iso, o);
    }
    // punti DX
    for (const [iso, o] of byIso) {
      if (!vis(o.ll)) continue;
      const p = proj(o.ll); if (!p) continue;
      const latest = o.list[0], col = latest.band ? latest.band.color : '#94a3b8', rad = 3 + Math.min(6, Math.sqrt(o.list.length) * 1.6);
      const fresh = o.list.some((s) => s.born && now - s.born < 4000);
      if (fresh) {
        const s = o.list.find((x) => x.born && now - x.born < 4000), k = ((now - s.born) % 1400) / 1400;
        ctx.beginPath(); ctx.arc(p[0], p[1], rad + k * 22, 0, 7); ctx.strokeStyle = col; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 7); ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.stroke();
      const nd = bestNeed(o.list);
      if (nd) { ctx.beginPath(); ctx.setLineDash([3, 3]); ctx.arc(p[0], p[1], rad + 6 + Math.sin(now / 280) * 1.6, 0, 7); ctx.strokeStyle = NEEDCOL[nd]; ctx.lineWidth = 2.2; ctx.stroke(); ctx.setLineDash([]); }
      o.need = nd;
      markers.push({ p, rad, iso, o });
    }
    // selezione: etichetta
    const sel = selected && spots.get(selected);
    if (sel) { const e = arcOf(sel); const p = e && vis(e[1]) ? proj(e[1]) : null; if (p) { ctx.font = '600 13px system-ui'; ctx.fillStyle = colors.tx; ctx.strokeStyle = colors.halo; ctx.lineWidth = 4; ctx.strokeText(sel.dx, p[0] + 10, p[1] - 10); ctx.fillText(sel.dx, p[0] + 10, p[1] - 10); } }
    // casa IQ8DO
    const hp = vis(HOME) ? proj(HOME) : null;
    if (hp) {
      const k = (now % 2400) / 2400;
      ctx.beginPath(); ctx.arc(hp[0], hp[1], 5 + k * 18, 0, 7); ctx.strokeStyle = colors.acc2; ctx.globalAlpha = 1 - k; ctx.lineWidth = 1.6; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(hp[0], hp[1], 5, 0, 7); ctx.fillStyle = colors.acc2; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = '700 11px system-ui'; ctx.fillStyle = colors.tx; ctx.strokeStyle = colors.halo; ctx.lineWidth = 3; ctx.strokeText('IQ8DO', hp[0] + 9, hp[1] + 4); ctx.fillText('IQ8DO', hp[0] + 9, hp[1] + 4);
    }
    drawProbe(now);
    if (focusAnim) stepFocus();
  }
  /** Traccia (senza stroke) l'arco di cerchio massimo a→b campionato, spezzandolo ai salti e fuori vista. */
  function poly(a, b, upto = 1) {
    const itp = geoInterpolate(a, b), N = 56;
    const jump = cfg.proj === 'flat' ? Math.PI * flatK : 0.6 * Math.min(W, H);
    let pen = false, px = 0;
    for (let i = 0; i <= N; i++) {
      const tt = i / N; if (tt > upto) break;
      const ll = itp(tt);
      if (!vis(ll)) { pen = false; continue; }
      const p = proj(ll); if (!p) { pen = false; continue; }
      if (pen && Math.abs(p[0] - px) > jump) pen = false;
      if (pen) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      pen = true; px = p[0];
    }
  }
  /** Traccia (senza stroke) una spezzata di punti [lon, lat], spezzandola ai salti e fuori vista. */
  function polyline(pts) {
    const jump = cfg.proj === 'flat' ? Math.PI * flatK : 0.6 * Math.min(W, H);
    let pen = false, px = 0;
    for (const ll of pts) {
      if (!vis(ll)) { pen = false; continue; }
      const p = proj(ll); if (!p) { pen = false; continue; }
      if (pen && Math.abs(p[0] - px) > jump) pen = false;
      if (pen) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      pen = true; px = p[0];
    }
  }
  /** "Dove mi sentono": rapporti di PSK Reporter degli ultimi 30 minuti, da Caserta alla stazione ricevente. */
  function drawHeard() {
    const lim = Date.now() - 30 * 60e3;
    for (const r of heardList) {
      if (r.t < lim || (F.bands.size && !F.bands.has(r.band.id)) || !vis(r.ll)) continue;
      const col = r.band.color, p = proj(r.ll); if (!p) continue;
      ctx.save(); ctx.beginPath(); poly(HOME, r.ll); ctx.strokeStyle = col; ctx.globalAlpha = Math.max(0.28, Math.min(0.9, 0.5 + (r.snr + 20) / 70)); ctx.lineWidth = 1.3; ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.arc(p[0], p[1], 3.8, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      markers.push({ p, rad: 5, iso: 'heard', heard: r });
    }
  }
  /** Terremoti delle ultime 24 ore: cerchio proporzionale alla magnitudo, onda per quelli dell'ultima ora. */
  function drawQuakes(now) {
    for (const q of quakeList) {
      if (!vis(q.ll)) continue;
      const p = proj(q.ll); if (!p) continue;
      const r = 2.5 + (q.mag - 4) * 2.6, age = now - q.t, fresh = age < 3600e3;
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fillStyle = q.mag >= 6 ? 'rgba(255,59,92,.55)' : 'rgba(255,165,59,.45)'; ctx.fill(); ctx.strokeStyle = q.mag >= 6 ? '#ff3b5c' : '#ffa53b'; ctx.lineWidth = 1.2; ctx.stroke();
      if (fresh) { const k = (now / 1400) % 1; ctx.beginPath(); ctx.arc(p[0], p[1], r + k * 16, 0, 7); ctx.globalAlpha = 1 - k; ctx.stroke(); ctx.globalAlpha = 1; }
      markers.push({ p, rad: r + 3, iso: 'quake', quake: q });
    }
  }
  /** Luna: sottopunto (dove è allo zenit); utile per l'EME e per sapere dove "guarda" l'antenna. */
  function drawMoon(now) {
    const m = moonAt(now, HOME); if (!vis(m.ll)) return;
    const p = proj(m.ll); if (!p) return;
    ctx.save(); ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, 7); ctx.fillStyle = '#e8e6d8'; ctx.shadowColor = '#e8e6d8'; ctx.shadowBlur = 12; ctx.fill(); ctx.restore();
    ctx.font = '600 10px system-ui,sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#e8e6d8'; ctx.fillText(t('moonN'), p[0] + 12, p[1]);
    markers.push({ p, rad: 11, iso: 'sat', sat: { name: t('moonN'), alt: m.dist, az: m.az, el: m.el } });
  }
  /** Satelliti radioamatoriali: posizione attuale; in evidenza quelli sopra l'orizzonte di Caserta. */
  function drawSats(now) {
    const d = new Date(now);
    for (const s of satList) {
      const w = satWhere(s, d, HOME); if (!w || !vis(w.ll)) continue;
      const p = proj(w.ll); if (!p) continue;
      const up = w.el > 0, col = up ? '#3ddc97' : '#8fa6c8';
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = col; ctx.fillRect(-3, -3, 6, 6); ctx.fillRect(-9, -1.5, 5, 3); ctx.fillRect(4, -1.5, 5, 3); ctx.restore();
      if (up) { ctx.beginPath(); ctx.arc(p[0], p[1], 9 + Math.sin(now / 300) * 1.5, 0, 7); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.stroke(); }
      ctx.font = '600 10px system-ui,sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(s.name, p[0] + 11, p[1] - 1);
      markers.push({ p, rad: 10, iso: 'sat', sat: w });
    }
  }
  /** Punto scelto con un clic e, se attivata, la linea di puntamento (percorso corto pieno, lungo tratteggiato). */
  function drawProbe(now) {
    if (!probe) return;
    if (probe.beam) {
      const az = bearing(HOME, probe.ll), sp = [], lp = [];
      for (let i = 0; i <= 90; i++) { const d = (20037 * i) / 90; sp.push(destination(HOME, az, d)); lp.push(destination(HOME, (az + 180) % 360, d)); }
      ctx.save(); ctx.lineCap = 'round';
      ctx.beginPath(); polyline(lp); ctx.setLineDash([9, 7]); ctx.strokeStyle = '#ff7ab6'; ctx.globalAlpha = 0.85; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); polyline(sp); ctx.setLineDash([]); ctx.strokeStyle = colors.acc2; ctx.globalAlpha = 0.95; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.restore();
    }
    if (!vis(probe.ll)) return;
    const p = proj(probe.ll); if (!p) return;
    const k = (now % 1600) / 1600;
    ctx.beginPath(); ctx.arc(p[0], p[1], 6 + k * 10, 0, 7); ctx.strokeStyle = '#fff'; ctx.globalAlpha = 1 - k; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(p[0] - 10, p[1]); ctx.lineTo(p[0] + 10, p[1]); ctx.moveTo(p[0], p[1] - 10); ctx.lineTo(p[0], p[1] + 10);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 7); ctx.fillStyle = colors.acc2; ctx.fill();
    ctx.font = '700 11px system-ui'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; const lab = llToLocator(probe.ll[0], probe.ll[1]);
    ctx.strokeText(lab, p[0] + 12, p[1] - 8); ctx.fillStyle = '#fff'; ctx.fillText(lab, p[0] + 12, p[1] - 8);
  }
  function drawZones(z, col, dash, alpha, px) {
    ctx.save(); ctx.beginPath(); path(z.geo); ctx.setLineDash(dash); ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    ctx.font = `700 ${px}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const l of z.labels) {
      if (!vis(l.ll)) continue;
      const p = proj(l.ll); if (!p || p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) continue;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(l.n, p[0], p[1]); ctx.fillStyle = col; ctx.fillText(l.n, p[0], p[1]);
    }
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }
  function drawDxped(now) {
    const groups = new Map();
    for (const o of dxpeditions()) {
      if (o.ent < 0) continue;
      const e = ENTITIES[o.ent];
      if (!groups.has(o.ent)) groups.set(o.ent, { ll: [e[5], e[4]], name: e[0], ent: o.ent, ops: [] });
      groups.get(o.ent).ops.push(o);
    }
    if (!groups.size) return;
    const recent = [...spots.values()].filter((s) => s.t > Date.now() - 30 * 60e3);
    ctx.font = '700 11px system-ui'; ctx.lineJoin = 'round';
    for (const g of groups.values()) {
      if (!vis(g.ll)) continue;
      const p = proj(g.ll); if (!p || p[0] < -30 || p[0] > W + 30 || p[1] < -30 || p[1] > H + 30) continue;
      const live = g.ops.some((o) => o.live);
      const spotted = recent.filter((s) => g.ops.some((o) => o.live && (s.dx === o.call || (o.call.length <= 3 && s.dx.startsWith(o.call)))));
      const isNew = MyLog.hasLog() && MyLog.newEntity(g.ent, cfg.confirmedOnly);
      const col = live ? '#3ddc97' : '#9aa9c4', k = (now % 1800) / 1800, r = live ? 7 : 5.5;
      if (live) { ctx.beginPath(); ctx.arc(p[0], p[1], r + 3 + k * 14, 0, 7); ctx.strokeStyle = col; ctx.globalAlpha = 0.55 * (1 - k); ctx.lineWidth = 1.6; ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.beginPath(); ctx.moveTo(p[0], p[1] - r); ctx.lineTo(p[0] + r, p[1]); ctx.lineTo(p[0], p[1] + r); ctx.lineTo(p[0] - r, p[1]); ctx.closePath();
      ctx.fillStyle = live ? col : 'rgba(10,16,32,.85)'; ctx.shadowColor = col; ctx.shadowBlur = live ? 10 : 0; ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.stroke();
      if (spotted.length) { ctx.beginPath(); ctx.arc(p[0], p[1], r + 6 + Math.sin(now / 200) * 1.5, 0, 7); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
      if (isNew) { ctx.beginPath(); ctx.setLineDash([3, 3]); ctx.arc(p[0], p[1], r + 10, 0, 7); ctx.strokeStyle = NEEDCOL.dxcc; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
      const text = g.ops[0].call + (g.ops.length > 1 ? ` +${g.ops.length - 1}` : '');
      ctx.lineWidth = 3; ctx.strokeStyle = live ? 'rgba(0,0,0,.7)' : colors.halo; ctx.strokeText(text, p[0] + r + 5, p[1] + 4); ctx.fillStyle = live ? '#b8ffe0' : colors.tx; ctx.fillText(text, p[0] + r + 5, p[1] + 4);
      markers.push({ p, rad: r + 4, iso: 'dxped', dxped: { g, spotted, isNew }, box: [p[0] + r + 5, p[1] - 8, p[0] + r + 5 + ctx.measureText(text).width, p[1] + 8] });
    }
  }
  function drawBeacons(now) {
    const unix = Date.now() / 1000;
    for (let i = 0; i < BEACONS.length; i++) {
      if (!vis(BPOS[i])) continue;
      const p = proj(BPOS[i]); if (!p) continue;
      ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, 7); ctx.strokeStyle = colors.tx; ctx.globalAlpha = 0.4; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.font = '700 10px system-ui';
    BEACON_BANDS.forEach(([bid, bname, freq], b) => {
      const i = onAir(unix, b), ll = BPOS[i];
      if (!vis(ll)) return;
      const p = proj(ll); if (!p) return;
      const col = (BANDS.find((x) => x.id === bid) || {}).color || '#fff', k = (now % 1500) / 1500;
      ctx.save(); ctx.beginPath(); poly(HOME, ll); ctx.setLineDash([4, 5]); ctx.strokeStyle = col; ctx.globalAlpha = 0.3; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.arc(p[0], p[1], 5 + k * 12, 0, 7); ctx.strokeStyle = col; ctx.globalAlpha = 0.6 * (1 - k); ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, 7); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      const text = `${BEACONS[i][0]} ${bname}`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(text, p[0] + 9, p[1] + 3.5 + b * 0); ctx.fillStyle = col; ctx.fillText(text, p[0] + 9, p[1] + 3.5);
      markers.push({ p, rad: 6, iso: 'beacon', beacon: { call: BEACONS[i][0], loc: BEACONS[i][1], place: BEACONS[i][2], band: bname, freq }, box: [p[0] + 9, p[1] - 8, p[0] + 9 + ctx.measureText(text).width, p[1] + 6] });
    });
  }
  function updateHud() {
    let key = '';
    if (cfg.proj === 'flat') {
      const worldCss = W * view.k, mpp = metersPerPixel(tileInfo ? tileInfo.z : Math.max(0, Math.log2(worldCss * dpr / 256)), view.lat0);
      // barra di scala: lunghezza tipica ~110 pixel CSS
      const metersPerCss = (40075016.686 * Math.cos(view.lat0 * DEG)) / worldCss, target = metersPerCss * 110;
      const pow = 10 ** Math.floor(Math.log10(target)), step = [1, 2, 5, 10].find((f) => f * pow >= target * 0.7) * pow;
      const px = step / metersPerCss, label = step >= 1000 ? `${step / 1000} km` : `${step} m`;
      const res = tileInfo ? (mpp >= 100 ? `${Math.round(mpp)}` : mpp >= 10 ? mpp.toFixed(0) : mpp.toFixed(1)) : '';
      key = `${label}|${Math.round(px)}|${res}|${tileInfo ? tileInfo.z : ''}|${tileInfo && tileInfo.pending ? 1 : 0}`;
      if (key !== hudKey) {
        hudKey = key; hud.hidden = false;
        hud.innerHTML = `<span class="sb" style="width:${Math.round(px)}px"></span><b>${label}</b>${tileInfo ? ` · ${t('zoomImg')} z${tileInfo.z} · ≈${res} m/px${tileInfo.pending ? ' ⟳' : ''}` : ''}`;
      }
    } else if (hudKey !== 'off') { hudKey = 'off'; hud.hidden = true; }
    tileAttrib.hidden = !tileInfo;
  }
  function stepFocus() {
    const f = focusAnim, k = Math.min(1, (performance.now() - f.t0) / 900), e = 1 - Math.pow(1 - k, 3);
    rot = [f.from[0] + (f.to[0] - f.from[0]) * e, f.from[1] + (f.to[1] - f.from[1]) * e]; proj.rotate(rot);
    if (k >= 1) focusAnim = null;
  }
  function focus(s) {
    const B = centroid(s.iso); if (!B) return;
    if (rotating()) {
      const to = [-B[0], -B[1] * (cfg.proj === 'globe' ? 0.8 : 1)]; let d = to[0] - rot[0]; d = ((d + 540) % 360) - 180;
      focusAnim = { from: rot.slice(), to: [rot[0] + d, to[1]], t0: performance.now() }; auto = false;
    } else { view.lon0 = B[0]; view.lat0 = Math.max(-70, Math.min(70, B[1])); setup(); }
  }
  function loop(now) { draw(now); requestAnimationFrame(loop); }
  // interazione
  const hit = (x, y) => markers.find((m) => Math.hypot(m.p[0] - x, m.p[1] - y) <= m.rad + 5 || (m.box && x >= m.box[0] && x <= m.box[2] && y >= m.box[1] && y <= m.box[3])) || null;
  let pinned = false;
  const openCall = (c) => window.open(callUrl(c), '_blank', 'noopener');
  const fullCall = (c) => /\d/.test(c) && c.length > 3; // "V4", "FH" sono prefissi, non nominativi
  function unpin() { if (!pinned) return; pinned = false; tip.classList.remove('pinned'); tip.hidden = true; }
  function pin(m, x, y) {
    let title, items;
    if (m.o) {
      const seen = new Set(); items = [];
      title = esc(m.o.list[0].country);
      for (const sp of m.o.list) if (!seen.has(sp.dx)) { seen.add(sp.dx); items.push({ call: sp.dx, sub: `${(sp.f / 1000).toFixed(3)} MHz ${sp.mode} · ${ago(sp.t)}` }); }
    } else {
      title = `${esc(m.dxped.g.name)} · DXpedition`;
      items = m.dxped.g.ops.map((o) => ({ call: o.call, sub: `${o.live ? t('tkUntil') + ' ' : ''}${new Date(o.end).toLocaleDateString(cfg.lang === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`, plain: !fullCall(o.call) }));
    }
    tip.classList.add('pinned'); tip.hidden = false; pinned = true;
    tip.style.left = Math.min(W - 250, x + 14) + 'px'; tip.style.top = Math.max(50, y - 10) + 'px';
    tip.innerHTML = `<button class="tipx" type="button" aria-label="✕">✕</button><b>${title}</b><br>` +
      items.slice(0, 10).map((i) => `${i.plain ? `<b>${esc(i.call)}</b>` : `<a class="cs pin" href="${callUrl(i.call)}" target="_blank" rel="noopener">${esc(i.call)}</a>`} <small>${esc(i.sub)}</small>`).join('<br>') +
      `<br><small>↗ ${callbookName()}</small>`;
  }
  function onMarker(m, x, y) {
    if (m.heard) { openCall(m.heard.rx); return; }
    if (m.beacon) { openCall(m.beacon.call); return; }
    if (m.o) {
      select(m.o.list[0].id);
      const calls = new Set(m.o.list.map((sp) => sp.dx));
      if (calls.size === 1) openCall(m.o.list[0].dx); else pin(m, x, y);
      return;
    }
    if (m.dxped) {
      const ops = m.dxped.g.ops;
      if (ops.length === 1 && fullCall(ops[0].call)) openCall(ops[0].call); else pin(m, x, y);
    }
  }
  /** Clic su un punto vuoto: locator, paese, zone CQ/ITU, distanza e azimut da Caserta (percorso corto e lungo). */
  function probeAt(x, y) {
    let ll = proj.invert && proj.invert([x, y]);
    if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1]) || Math.abs(ll[1]) > 85 || !vis(ll)) return;
    ll = [((ll[0] + 540) % 360) - 180, ll[1]];
    probe = { ll, beam: probe ? probe.beam : false, x, y };
    probePop();
    loadZonePolys().then(() => { if (probe && probe.ll === ll) probePop(); });
  }
  function probePop() {
    if (!probe) return;
    const { ll, x, y } = probe, P = paths(HOME, ll), lat = ll[1], lon = ll[0];
    const cq = zoneAt('cq', lon, lat), itu = zoneAt('itu', lon, lat);
    const country = land.features.find((f) => geoContains(f, ll));
    const alt = sunAlt(ll, Date.now()), altH = sunAlt(HOME, Date.now());
    const ph = (a) => (a > 8 ? '☀️' : a < -8 ? '🌙' : '🌅');
    const loc = llToLocator(lon, lat), solar = new Date(Date.now() + (lon / 15) * 3600e3);
    tip.classList.add('pinned'); tip.hidden = false; pinned = true;
    tip.style.left = Math.max(4, Math.min(W - 270, x + 14)) + 'px'; tip.style.top = Math.max(50, Math.min(H - 250, y - 10)) + 'px';
    tip.innerHTML = `<button class="tipx" type="button" aria-label="✕">✕</button><b>${loc}</b> · ${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}` +
      `<br>${country ? esc(country.properties.name) : t('ocean')}` +
      `<br>${t('zoneCq')} <b>${cq ? cq.n : '…'}</b>${cq && cq.name ? ' <small>' + esc(cq.name) + '</small>' : ''} · ITU <b>${itu ? itu.n : '…'}</b>` +
      `<br><b>${Math.round(P.sp).toLocaleString('it-IT')} km</b> · ${t('azimuth')} <b>${Math.round(P.azSp)}°</b> <small>(${t('shortPath')})</small>` +
      `<br>${Math.round(P.lp).toLocaleString('it-IT')} km · ${Math.round(P.azLp)}° <small>(${t('longPath')})</small>` +
      `<br><small>${ph(altH)} Caserta · ${ph(alt)} ${t('there')} · ${String(solar.getUTCHours()).padStart(2, '0')}:${String(solar.getUTCMinutes()).padStart(2, '0')} ${t('solarTime')}</small>` +
      `<br><span class="tools"><button type="button" class="tb" data-tool="beam">${probe.beam ? t('beamOff') : t('beamOn')}</button><button type="button" class="tb" data-tool="loc">${t('copyLoc')}</button><button type="button" class="tb" data-tool="clear">${t('clear')}</button></span>`;
  }
  tip.addEventListener('click', (e) => {
    if (e.target.closest('.tipx')) { unpin(); return; }
    const tool = e.target.closest('[data-tool]')?.dataset.tool;
    if (!tool || !probe) return;
    if (tool === 'beam') { probe.beam = !probe.beam; probePop(); }
    if (tool === 'loc') { navigator.clipboard?.writeText(llToLocator(probe.ll[0], probe.ll[1])); toastText(`${llToLocator(probe.ll[0], probe.ll[1])} ${t('copied')}`); }
    if (tool === 'clear') { probe = null; unpin(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') unpin(); });
  // Tocco: un dito sposta, due dita ingrandiscono (attorno al punto centrale) e ruotano/inclinano non serve: si sposta con il dito rimasto.
  const fingers = new Map(); let pinch = 0, lastTap = null;
  const pinchInfo = () => { const [a, b] = [...fingers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; };
  const endFinger = (e) => { fingers.delete(e.pointerId); pinch = 0; if (fingers.size) drag = null; };
  cv.addEventListener('pointercancel', (e) => { endFinger(e); cv.classList.remove('drag'); drag = null; });
  cv.addEventListener('pointerdown', (e) => {
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2) { drag = null; pinch = pinchInfo().d; cv.classList.remove('drag'); unpin(); return; }
    if (fingers.size > 2) return;
    unpin(); cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, rot: rot.slice(), tx: view.tx, ty: view.ty, lon0: view.lon0, m0: merc(view.lat0), moved: false }; cv.classList.add('drag'); auto = false; });
  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2 && pinch) {
      const p = pinchInfo(), f = p.d / pinch;
      if (f > 1.02 || f < 0.98) { zoomAt(p.cx - r.left, p.cy - r.top, f); pinch = p.d; auto = false; }
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (rotating()) { const k = (cfg.proj === 'globe' ? 0.35 : 0.3) / view.k; rot = [drag.rot[0] + dx * k, Math.max(-85, Math.min(85, drag.rot[1] - dy * k))]; proj.rotate(rot); glDirty = true; }
      else { view.lon0 = drag.lon0 - (dx / flatK) / DEG; view.lat0 = Math.max(-82, Math.min(82, unmerc(drag.m0 + dy / flatK))); needSetup = true; }
      return;
    }
    hover = hit(x, y);
    cv.style.cursor = hover ? 'pointer' : 'grab';
    if (pinned) return;
    if (hover && (hover.quake || hover.sat)) {
      const q = hover.quake, w = hover.sat;
      tip.hidden = false; tip.style.left = Math.min(W - 270, x + 14) + 'px'; tip.style.top = Math.max(50, y - 10) + 'px';
      tip.innerHTML = q ? `<b>M ${q.mag.toFixed(1)}</b> · ${esc(q.place)}<br>${ago(q.t)} · ${t('depth')} ${Math.round(q.depth)} km`
        : `<b>${esc(w.name)}</b> · ${Math.round(w.alt)} km<br>${w.el > 0 ? `<b style="color:#3ddc97">${t('satUp')}</b> · ` : ''}az ${Math.round(w.az)}° · el ${Math.round(w.el)}°`;
    } else if (hover && hover.heard) {
      const h = hover.heard;
      tip.hidden = false; tip.style.left = Math.min(W - 270, x + 14) + 'px'; tip.style.top = Math.max(50, y - 10) + 'px';
      tip.innerHTML = `<b>${esc(h.rx)}</b> ${t('heardYou')}<br>${h.band.name} · ${esc(h.mode)}${Number.isFinite(h.snr) ? ' · SNR ' + h.snr + ' dB' : ''}<br>${h.km.toLocaleString('it-IT')} km · ${esc(h.loc || '')} · ${ago(h.t)}<br><small>↗ ${callbookName()}</small>`;
    } else if (hover && hover.dxped) {
      const { g, spotted, isNew } = hover.dxped, dfmt = (ms) => new Date(ms).toLocaleDateString(cfg.lang === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      tip.hidden = false; tip.style.left = Math.min(W - 290, x + 14) + 'px'; tip.style.top = Math.max(50, y - 10) + 'px';
      tip.innerHTML = `<b>${esc(g.name)}</b> · DXpedition${isNew ? ` <b style="color:${NEEDCOL.dxcc}">${t('need_dxcc')}</b>` : ''}` + g.ops.slice(0, 4).map((o) => `<br><b>${esc(o.call)}</b> ${o.live ? t('tkUntil') + ' ' + dfmt(o.end) : dfmt(o.start) + ' → ' + dfmt(o.end)}${o.qsl ? ' · QSL ' + esc(o.qsl) : ''}<br><small>${esc(o.info.slice(0, 90))}</small>`).join('') + (g.ops.length > 4 ? `<br><small>+${g.ops.length - 4}…</small>` : '') + spotted.slice(0, 2).map((s) => `<br><b style="color:#3ddc97">● ${esc(s.dx)} ${(s.f / 1000).toFixed(3)} MHz ${esc(s.mode)}</b>`).join('');
    } else if (hover && hover.beacon) {
      const bc = hover.beacon;
      tip.hidden = false; tip.style.left = Math.min(W - 250, x + 14) + 'px'; tip.style.top = Math.max(50, y - 10) + 'px';
      tip.innerHTML = `<b>${esc(bc.call)}</b> · NCDXF/IARU<br>${esc(bc.place)} · ${esc(bc.loc)}<br>${bc.band} · ${(bc.freq / 1000).toFixed(3)} MHz<br><small>↗ ${callbookName()}</small>`;
    } else if (hover) {
      const s = hover.o.list[0];
      tip.hidden = false; tip.style.left = Math.min(W - 250, x + 14) + 'px'; tip.style.top = Math.max(50, y - 10) + 'px';
      tip.innerHTML = `<b>${esc(s.country)}</b><br>${hover.o.list.length} spot · ${esc(s.dx)} ${(s.f / 1000).toFixed(3)} MHz ${esc(s.mode)}<br><small>de ${esc(s.de)} · ${ago(s.t)} · ↗ ${callbookName()}</small>${hover.o.need ? `<br><b style="color:${NEEDCOL[hover.o.need]}">${t('need_' + hover.o.need)}</b>` : ''}`;
    } else tip.hidden = true;
  });
  cv.addEventListener('pointerup', (e) => {
    const multi = fingers.size > 1; endFinger(e);
    if (multi) { cv.classList.remove('drag'); drag = null; return; }
    const wasClick = drag && !drag.moved; cv.classList.remove('drag'); drag = null;
    if (!wasClick) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, m = hit(x, y); // anche al tocco: non serve il passaggio del mouse
    const now = performance.now();
    if (e.pointerType === 'touch' && lastTap && now - lastTap.t < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 30) { lastTap = null; unpin(); zoomAt(x, y, 2.5); return; }
    lastTap = { t: now, x, y };
    if (m) onMarker(m, x, y); else probeAt(x, y);
  });
  cv.addEventListener('pointerleave', () => { if (!pinned) tip.hidden = true; });
  const KMAX = () => (256 * 2 ** MAX_Z * 1.6) / W; // ~1,6 volte oltre il livello 15 (Sentinel-2)
  function zoomAt(x, y, factor) {
    if (cfg.proj === 'flat') {
      const k0 = flatK, lonC = view.lon0 * DEG + (x - W / 2) / k0, mC = merc(view.lat0) - (y - H / 2) / k0;
      view.k = Math.max(0.7, Math.min(KMAX(), view.k * factor));
      const k1 = (W * view.k) / (2 * Math.PI);
      view.lon0 = (lonC - (x - W / 2) / k1) / DEG; view.lat0 = Math.max(-82, Math.min(82, unmerc(mC + (y - H / 2) / k1)));
      setup();
    } else if (factor > 1 && view.k >= 7.5) {
      // per il dettaglio a 10 m serve la vista Piana: si continua lì, sullo stesso punto
      const R = Math.min(W, H) / 2 - (cfg.proj === 'globe' ? 14 : 12), s = cfg.proj === 'globe' ? R * view.k : (R * view.k) / Math.PI;
      const c = { lon: -rot[0], lat: -rot[1] };
      cfg.proj = 'flat'; store.set('proj', 'flat'); auto = false;
      view = { k: Math.max(1, (2 * Math.PI * s) / W), tx: 0, ty: 0, lon0: c.lon, lat0: Math.max(-70, Math.min(70, c.lat)) };
      $$('#projSeg button').forEach((b) => b.classList.toggle('on', b.dataset.proj === 'flat'));
      setup();
    } else { view.k = Math.max(0.7, Math.min(8, view.k * factor)); setup(); }
  }
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), f = Math.abs(e.deltaY) > 150 ? 1.5 : 1.25;
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? f : 1 / f);
  }, { passive: false });
  const resetView = () => {
    view = { k: 1, tx: 0, ty: 0, lon0: HOME[0], lat0: 17 };
    rot = cfg.proj === 'azim' ? [-HOME[0], -HOME[1]] : [-HOME[0], -25];
    auto = cfg.proj === 'globe'; setup();
  };
  cv.addEventListener('dblclick', (e) => { const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, 2.5); });
  $('#btnReset').addEventListener('click', resetView);
  new ResizeObserver(() => setup()).observe(cv);
  GL.onLoad = () => { glDirty = true; };
  if (GL.ok) GL.loadEarth('icons/earth.webp');
  setInterval(() => { glDirty = true; }, 30000); // il terminatore si sposta lentamente
  readColors(); setup(); requestAnimationFrame(loop);
  return {
    setup, focus, gl: GL,
    debug: () => ({ view, proj, tileInfo, flatK, W, H, markers }),
    readColors() { readColors(); glDirty = true; },
    touch() { glDirty = true; },
    setProj(p) { cfg.proj = p; store.set('proj', p); resetView(); $$('#projSeg button').forEach((b) => b.classList.toggle('on', b.dataset.proj === p)); },
    onSpots() { /* le animazioni sono gestite da s.born nel loop */ },
  };
})();
if (location.hostname === 'localhost') window.__map = map; // solo per le prove in locale
$('#projSeg').addEventListener('click', (e) => { const p = e.target.closest('button')?.dataset.proj; if (p) map.setProj(p); });
const layoutEl = $('#layout');
const applyWide = () => { layoutEl.toggleAttribute('data-wide', cfg.wide); $('#btnWide').classList.toggle('on', cfg.wide); requestAnimationFrame(() => map.setup()); };
$('#btnWide').addEventListener('click', () => { cfg.wide = !cfg.wide; store.set('wide', cfg.wide); applyWide(); });
applyWide();
$('#btnFull').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else $('#mapcard').requestFullscreen?.().catch(() => {}); });
document.addEventListener('fullscreenchange', () => requestAnimationFrame(() => map.setup()));
$('#optArcs').checked = cfg.arcs; $('#optArcs').addEventListener('change', (e) => { cfg.arcs = e.target.checked; store.set('arcs', cfg.arcs); });
$('#optNight').checked = cfg.night; $('#optNight').addEventListener('change', (e) => { cfg.night = e.target.checked; store.set('night', cfg.night); map.touch(); });
$('#optAurora').checked = cfg.aurora; $('#optAurora').addEventListener('change', (e) => { cfg.aurora = e.target.checked; store.set('aurora', cfg.aurora); map.touch(); if (cfg.aurora) loadAurora(); });
function bindLayer(id, key, zone) {
  const el = $('#' + id); el.checked = cfg[key];
  el.addEventListener('change', (e) => { cfg[key] = e.target.checked; store.set(key, cfg[key]); if (cfg[key] && zone) loadZones(zone); if (key === 'beacons') renderBeacons(); if (key === 'heard') loadHeard(); });
  if (cfg[key] && zone) loadZones(zone);
}
bindLayer('optTiles', 'tiles', null); bindLayer('optCq', 'cq', 'cq'); bindLayer('optItu', 'itu', 'itu'); bindLayer('optBeacons', 'beacons', null); bindLayer('optDxped', 'dxped', null); bindLayer('optHeard', 'heard', null); bindLayer('optSats', 'sats', null); bindLayer('optMoon', 'moon', null); bindLayer('optQuakes', 'quakes', null);
function renderBeacons() {
  const el = $('#beacons'), unix = Date.now() / 1000, left = slotLeft(unix);
  el.innerHTML = BEACON_BANDS.map(([bid, bname, freq], b) => {
    const i = onAir(unix, b), col = (BANDS.find((x) => x.id === bid) || {}).color || '#fff';
    return `<div class="bc" style="--c:${col}"><span class="bb">${bname}</span><span class="bf">${(freq / 1000).toFixed(3)}</span><b>${esc(BEACONS[i][0])}</b><em>${esc(BEACONS[i][2])}</em><i style="width:${((10 - left) / 10) * 100}%"></i></div>`;
  }).join('');
}
setInterval(renderBeacons, 1000); renderBeacons();
async function loadAurora() {
  if (!map.gl.ok) return;
  try {
    const r = await fetch('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json'); if (!r.ok) return;
    const j = await r.json(); if (Array.isArray(j.coordinates)) { map.gl.setAurora(j.coordinates); }
  } catch { /* opzionale */ }
}
if (cfg.aurora) loadAurora();
setInterval(() => { if (cfg.aurora) loadAurora(); }, 15 * 60e3);


/* ------------------------------------------------------------------ dati solari (NOAA SWPC) */
let solarData = { sfi: null, kp: null, a: null, flare: '' };
function paintHf() { const h = $('#hfT'); if (h) h.textContent = cfg.lang === 'en' ? 'HF propagation by band' : 'Propagazione HF per banda'; const el = $('#hf'); if (el) renderHf(el, solarData, cfg.lang); }
async function loadSolar() {
  const el = $('#solar'), parts = [];
  solarData = { sfi: null, kp: null, a: null, flare: '' };
  const j = async (u) => { const r = await fetch('https://services.swpc.noaa.gov/' + u); if (!r.ok) throw new Error(r.status); return r.json(); };
  const first = (x) => (Array.isArray(x) ? x[0] : x);
  try { const f = first(await j('products/summary/10cm-flux.json')); const v = f.flux ?? f.Flux; if (v != null) { solarData.sfi = Number(v); parts.push(`<span>SFI <b>${esc(v)}</b></span>`); } } catch { /* opzionale */ }
  try {
    const k = await j('products/noaa-planetary-k-index.json'), last = k[k.length - 1];
    const kp = parseFloat(Array.isArray(last) ? last[1] : last.Kp), a = Array.isArray(last) ? null : last.a_running;
    if (!Number.isNaN(kp)) solarData.kp = kp;
    if (a != null) solarData.a = Number(a);
    if (!Number.isNaN(kp)) parts.push(`<span class="${kp < 4 ? 'k-lo' : kp < 5 ? 'k-mid' : 'k-hi'}">K <b>${kp.toFixed(1)}</b></span>`);
    if (a != null) parts.push(`<span>A <b>${esc(a)}</b></span>`);
  } catch { /* opzionale */ }
  try { const w = first(await j('products/summary/solar-wind-speed.json')); const v = w.proton_speed ?? w.WindSpeed; if (v != null) parts.push(`<span>${t('wind')} <b>${esc(Math.round(v))}</b> km/s</span>`); } catch { /* opzionale */ }
  try { // brillamento solare recente (classe M o X): blackout sulle HF del lato diurno
    const f = first(await j('json/goes/primary/xray-flares-latest.json')), cls = String(f.max_class || f.current_class || ''), when = Date.parse(f.max_time || f.time_tag || '');
    if (/^[MX]/.test(cls) && Date.now() - when < 3 * 3600e3) {
      solarData.flare = cls[0];
      parts.push(`<span class="k-hi" title="${t('flareT')}">${t('flare')} <b>${esc(cls)}</b></span>`);
      spaceAlert('flare-' + f.max_time, `${t('flare')} ${cls}: ${t('flareT')}`);
    }
  } catch { /* opzionale */ }
  const km = /K <b>(\d)/.exec(parts.join('')); if (km && Number(km[1]) >= 5) spaceAlert('k-' + new Date().toISOString().slice(0, 13), `${t('storm')} K${km[1]}: ${t('stormT')}`);
  el.innerHTML = parts.join('');
  paintHf();
}
function spaceAlert(key, msg) {
  try { if (localStorage.getItem('iq8do.spaceAlert') === key) return; localStorage.setItem('iq8do.spaceAlert', key); } catch { /* */ }
  toastText('☀ ' + msg, 15000);
  if (cfg.notify && 'Notification' in window && Notification.permission === 'granted') navigator.serviceWorker?.getRegistration().then((r) => r && r.showNotification('IQ8DO · ' + t('spaceW'), { body: msg, icon: 'icons/icon-192.png' }));
}

/* ------------------------------------------------------------------ UI: dialoghi, tema, lingua, tab */
/* ------------------------------------------------------------------ area personale */
const SYNC_KEYS = ['needAlerts', 'sound', 'notify', 'openAlerts', 'confirmedOnly', 'awake', 'haptic', 'lang', 'callbook', 'poll'];
function currentSettings() {
  const o = { watch: cfg.watch };
  for (const k of SYNC_KEYS) o[k] = cfg[k];
  return o;
}
function applySettings(st) {
  if (Array.isArray(st.watch)) { cfg.watch = st.watch; store.set('watch', cfg.watch); compileWatch(); $('#alertDot').hidden = !cfg.watch.length; }
  for (const k of SYNC_KEYS) if (st[k] !== undefined) { cfg[k] = st[k]; store.set(k, st[k]); }
  logVer++; applyAwake(); applyI18n(); refresh();
}
let acct = null;

/* ------------------------------------------------------------------ legenda dei simboli della mappa (in trasparenza) */
const LG = {
  dot: (c) => `<svg viewBox="0 0 22 16"><path d="M1 12 Q11 -4 21 8" fill="none" stroke="${c}" stroke-width="1.3" opacity=".7"/><circle cx="18" cy="6.6" r="3.3" fill="${c}"/></svg>`,
  ring: (c) => `<svg viewBox="0 0 22 16"><circle cx="11" cy="8" r="3" fill="#8fa6c8"/><circle cx="11" cy="8" r="6.6" fill="none" stroke="${c}" stroke-width="1.6" stroke-dasharray="3 2.4"/></svg>`,
  home: () => `<svg viewBox="0 0 22 16"><circle cx="11" cy="8" r="5.2" fill="#fff" stroke="#f5b942" stroke-width="2"/></svg>`,
  heard: () => `<svg viewBox="0 0 22 16"><path d="M1 12 Q11 -4 21 8" fill="none" stroke="#4dd0ff" stroke-width="1.3" opacity=".8"/><circle cx="18" cy="6.6" r="3.2" fill="#4dd0ff" stroke="#fff" stroke-width="1.2"/></svg>`,
  dxLive: () => `<svg viewBox="0 0 22 16"><circle cx="11" cy="8" r="7" fill="none" stroke="#3ddc97" opacity=".5"/><path d="M11 2.5 L16.5 8 L11 13.5 L5.5 8Z" fill="#3ddc97" stroke="#3ddc97" stroke-width="1.6"/></svg>`,
  dxPlan: () => `<svg viewBox="0 0 22 16"><path d="M11 3 L16 8 L11 13 L6 8Z" fill="rgba(10,16,32,.85)" stroke="#9aa9c4" stroke-width="1.8"/></svg>`,
  beacon: () => `<svg viewBox="0 0 22 16"><circle cx="11" cy="8" r="7" fill="none" stroke="#4cc9f0" opacity=".45"/><circle cx="11" cy="8" r="4.2" fill="#4cc9f0" stroke="#fff"/></svg>`,
  sat: (c) => `<svg viewBox="0 0 22 16"><g transform="rotate(45 11 8)" fill="${c}"><rect x="8" y="5" width="6" height="6"/><rect x="1.5" y="6.5" width="5" height="3"/><rect x="15.5" y="6.5" width="5" height="3"/></g></svg>`,
  moon: () => `<svg viewBox="0 0 22 16"><circle cx="11" cy="8" r="6.5" fill="#e8e6d8"/></svg>`,
  quake: () => `<svg viewBox="0 0 22 16"><circle cx="8" cy="9" r="4" fill="rgba(255,165,59,.45)" stroke="#ffa53b" stroke-width="1.2"/><circle cx="16" cy="7" r="5.5" fill="rgba(255,59,92,.55)" stroke="#ff3b5c" stroke-width="1.2"/></svg>`,
  line: (c, dash) => `<svg viewBox="0 0 22 16"><path d="M1 8 H21" stroke="${c}" stroke-width="2" ${dash ? 'stroke-dasharray="4 3"' : ''}/></svg>`,
};
function renderLegend() {
  const el = $('#legend'); if (!el) return;
  const rows = [[LG.dot('#4cc9f0'), 'lgSpot'], [LG.home(), 'lgHome']];
  if (MyLog.hasLog()) rows.push([LG.ring('#ff3b5c'), 'lgNeed']);
  if (cfg.heard) rows.push([LG.heard(), 'lgHeard']);
  if (cfg.dxped) rows.push([LG.dxLive(), 'lgDxLive'], [LG.dxPlan(), 'lgDxPlan']);
  if (cfg.beacons) rows.push([LG.beacon(), 'lgBeacon']);
  if (cfg.sats) rows.push([LG.sat('#3ddc97'), 'lgSatUp'], [LG.sat('#8fa6c8'), 'lgSat']);
  if (cfg.moon) rows.push([LG.moon(), 'lgMoon']);
  if (cfg.quakes) rows.push([LG.quake(), 'lgQuake']);
  if (cfg.cq) rows.push([LG.line('#f5b942', true), 'lgCq']);
  if (cfg.itu) rows.push([LG.line('#4cc9f0', true), 'lgItu']);
  el.classList.toggle('closed', !cfg.legend);
  el.innerHTML = `<button type="button" class="lgh" aria-expanded="${cfg.legend}">ⓘ ${t('lgTitle')} <span>${cfg.legend ? '▾' : '▸'}</span></button>` +
    (cfg.legend ? `<ul>${rows.map(([svg, k]) => `<li>${svg}<span>${t(k)}</span></li>`).join('')}</ul>` : '');
}
$('#legend')?.addEventListener('click', (e) => { if (!e.target.closest('.lgh')) return; cfg.legend = !cfg.legend; store.set('legend', cfg.legend); renderLegend(); });
document.addEventListener('change', (e) => { if (e.target.closest('.layers')) setTimeout(renderLegend, 0); });
document.addEventListener('iq8do:state', renderLegend);
function applyI18n() {
  document.documentElement.lang = cfg.lang;
  $$('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  $$('[data-i18n-ph]').forEach((n) => { n.placeholder = t(n.dataset.i18nPh); });
  $$('[data-i18n-title]').forEach((n) => { n.title = t(n.dataset.i18nTitle); });
  syncChips(); renderLegend(); if (acct) acct.rerender();
}
function applyTheme() {
  document.documentElement.dataset.theme = cfg.theme;
  $('meta[name=theme-color]').content = cfg.theme === 'light' ? '#e9eff9' : '#050b18';
  map.readColors(); renderSpark(); renderHeat();
}
$('#btnTheme').addEventListener('click', () => { cfg.theme = cfg.theme === 'dark' ? 'light' : 'dark'; store.set('theme', cfg.theme); applyTheme(); });
$('#btnAlerts').addEventListener('click', () => {
  $('#watchText').value = cfg.watch.join(', '); $('#optOpen').checked = cfg.openAlerts; $('#optSound').checked = cfg.sound; $('#optNotify').checked = cfg.notify;
  $$('#needAlerts input').forEach((i) => { i.checked = cfg.needAlerts.includes(i.value); });
  renderPush(); $('#dlgAlerts').showModal();
});
$('#dlgAlerts').addEventListener('close', async (e) => {
  if (e.target.returnValue !== 'ok') return;
  cfg.watch = $('#watchText').value.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  cfg.openAlerts = $('#optOpen').checked; store.set('openAlerts', cfg.openAlerts);
  cfg.sound = $('#optSound').checked; cfg.notify = $('#optNotify').checked;
  if (cfg.notify && 'Notification' in window && Notification.permission === 'default') { const p = await Notification.requestPermission(); if (p !== 'granted') cfg.notify = false; }
  cfg.needAlerts = $$('#needAlerts input').filter((i) => i.checked).map((i) => i.value); store.set('needAlerts', cfg.needAlerts);
  cfg.pushOpts = Object.fromEntries($$('#pushOpts input').map((i) => [i.value, i.checked])); store.set('pushOpts', cfg.pushOpts); pushResync();
  store.set('watch', cfg.watch); store.set('sound', cfg.sound); store.set('notify', cfg.notify); compileWatch(); $('#alertDot').hidden = !cfg.watch.length; refresh();
});
$('#btnSettings').addEventListener('click', () => { $('#optAwake').checked = cfg.awake; $('#optHaptic').checked = cfg.haptic; $('#myCall').value = cfg.myCall; $('#lang').value = cfg.lang; $('#poll').value = String(cfg.poll); $('#confMode').value = cfg.confirmedOnly ? 'c' : 'w'; $('#callbook').value = cfg.callbook; renderLogInfo(); $('#dlgSettings').showModal(); });
$('#dlgSettings').addEventListener('close', (e) => {
  if (e.target.returnValue !== 'ok') return;
  cfg.myCall = $('#myCall').value.trim().toUpperCase(); cfg.lang = $('#lang').value; cfg.poll = Number($('#poll').value);
  cfg.confirmedOnly = $('#confMode').value === 'c'; store.set('confirmedOnly', cfg.confirmedOnly); logVer++;
  cfg.callbook = $('#callbook').value; store.set('callbook', cfg.callbook);
  cfg.awake = $('#optAwake').checked; store.set('awake', cfg.awake); cfg.haptic = $('#optHaptic').checked; store.set('haptic', cfg.haptic); applyAwake();
  pushResync(); store.set('myCall', cfg.myCall); store.set('lang', cfg.lang); store.set('poll', cfg.poll); applyI18n(); refresh(); poll(); loadHeard(); renderGrey(); document.dispatchEvent(new Event('iq8do:state')); paintHf();
});
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tab === 'ana') { act.close(); ana.open(); return; }
  if (b.dataset.tab === 'act') { ana.close(); act.open(); return; }
  if (ana.isOpen()) ana.close();
  if (act.isOpen()) act.close();
  $('#layout').dataset.tab = b.dataset.tab; $$('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  requestAnimationFrame(() => { map.setup(); renderSpark(); renderHeat(); });
});

/* ------------------------------------------------------------------ il mio log (ADIF) */
function renderLogInfo() {
  const d = MyLog.info(), el = $('#logInfo');
  if (!d) { el.textContent = t('noLog'); $('#logClear').hidden = true; return; }
  el.textContent = `${d.file} · ${d.used.toLocaleString()} QSO · ${Object.keys(d.w).length} DXCC ${t('worked')}, ${Object.keys(d.c).length} ${t('confirmed')}` + (d.z ? ` · ${Object.keys(d.z).length} ${t('zonesCq')} · ${Object.keys(d.g).length} ${t('grids')}` : '');
  $('#logClear').hidden = false;
}
/** Analizza un log ADIF e lo rende attivo su questo dispositivo. Lancia un errore se il file non e' valido. */
async function importAdif(text, fileName, silent) {
  const d = MyLog.analyze(text, fileName);
  if (!d.used) throw new Error('logEmpty');
  if (!MyLog.save(d)) throw new Error('logNoSpace');
  logVer++; renderLogInfo(); refresh(); document.dispatchEvent(new Event('iq8do:state'));
  if (!silent) toastText(`✓ ${t('logLoaded')}: ${Object.keys(d.w).length} DXCC`);
  return d;
}
$('#logFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const el = $('#logInfo'); el.textContent = t('logReading');
  await new Promise((r) => setTimeout(r, 30));
  try {
    const text = await f.text();
    await importAdif(text, f.name);
    if (acct) acct.syncLocalLog(text); // se sei connesso, il log va anche sul profilo
  } catch (err) { el.textContent = t(err && err.message === 'logEmpty' ? 'logEmpty' : err && err.message === 'logNoSpace' ? 'logNoSpace' : 'logError'); }
  e.target.value = '';
});
$('#logClear').addEventListener('click', () => { MyLog.clear(); logVer++; renderLogInfo(); refresh(); document.dispatchEvent(new Event('iq8do:state')); });
function renderMyDx() {
  const el = $('#mydx'), st = MyLog.stats();
  if (!st) { el.innerHTML = `<p class="hint">${t('myDxHint')}</p>`; return; }
  const pct = (n) => Math.min(100, (n / st.total) * 100);
  const bands = BANDS.filter((b) => b.id !== 'SHF' && st.perBand[b.id]);
  el.innerHTML = `<div class="dxprog"><div><b>${st.worked}</b> ${t('worked')} <span>/ ${st.total}</span></div><div class="pbar"><i style="width:${pct(st.worked)}%"></i><i class="c" style="width:${pct(st.confirmed)}%"></i></div><div class="sub"><b>${st.confirmed}</b> ${t('confirmed')}</div></div>
  <div class="bandmini">${bands.map((b) => `<span style="--c:${b.color}" title="${b.name}: ${st.perBand[b.id].w} ${t('worked')}, ${st.perBand[b.id].c} ${t('confirmed')}"><i></i>${b.name} <b>${st.perBand[b.id].w}</b></span>`).join('')}</div>
  ${st.zones !== undefined && !st.hasWk ? `<p class="hint">${t('logReload')}</p>` : ''}
  ${st.zones !== undefined ? `<div class="wkgrid"><div><b>${st.zones}</b><span>/ 40 ${t('zonesCq')}</span><small>${st.zonesC} ${t('confirmed')}</small></div><div><b>${st.itu}</b><span>/ 90 ${t('zonesItu')}</span><small>${st.ituC} ${t('confirmed')}</small></div><div><b>${st.grids}</b><span>${t('grids')}</span><small>${st.gridsC} ${t('confirmed')}</small></div></div>` : `<p class="hint">${t('logReload')}</p>`}
  <p class="hint">${t('myDxLegend')}</p>`;
}

/* ------------------------------------------------------------------ dove mi sentono / propagazione / greyline */
let heardList = [], heardErr = '';
const followCall = () => (cfg.myCall || 'IQ8DO').toUpperCase();
const nearestCont = (ll) => {
  let best = '', bd = 1e9;
  for (const c of Object.values(countries)) { const d = distanceKm(ll, c.ll); if (d < bd) { bd = d; best = c.r; } }
  return best;
};
/* ------------------------------------------------------------------ satelliti e terremoti */
let satRecs = [];
async function loadSats() {
  try { satRecs = await loadTles(); satList = satRecs; satErr = ''; satPasses24 = satPasses(satRecs, HOME); } catch (e) { satErr = String(e.message || e); }
  renderSats();
}
async function loadQuakes() {
  try { quakeList = await fetchQuakes(); quakeErr = ''; } catch (e) { quakeErr = String(e.message || e); }
  renderQuakes();
}
function renderSats() {
  const el = $('#sats'); if (!el) return;
  if (satErr && !satRecs.length) { el.innerHTML = `<p class="hint">${t('satErr')}</p>`; return; }
  if (!satRecs.length) { el.innerHTML = `<p class="hint">…</p>`; return; }
  const now = Date.now(), hm = (ms) => new Date(ms).toLocaleTimeString(cfg.lang === 'en' ? 'en-GB' : 'it-IT', { hour: '2-digit', minute: '2-digit' });
  const list = satPasses24.filter((p) => p.los > now).slice(0, 8);
  el.innerHTML = list.length ? `<table class="pass">${list.map((p) => {
    const live = p.aos <= now, mins = Math.round(((live ? p.los : p.aos) - now) / 60e3), dur = Math.round((p.los - p.aos) / 60e3);
    return `<tr class="${live ? 'live' : ''}"><td><b>${esc(p.name)}</b></td><td>${hm(p.aos)}</td><td>${dur}′</td><td>${Math.round(p.maxEl)}°</td><td>${Math.round(p.azAos)}°→${Math.round(p.azLos)}°</td><td>${live ? t('satUp') + ' · ' + t('satEnds') + ' ' + mins + '′' : t('satIn') + ' ' + (mins >= 90 ? Math.round(mins / 60) + ' h' : mins + '′')}</td></tr>`;
  }).join('')}</table><p class="hint">${t('satHint')}</p>` : `<p class="hint">${t('satNone')}</p>`;
}
function renderMoon() {
  const el = $('#moon'); if (!el) return;
  const now = Date.now(), m = moonAt(now, HOME), rs = riseSet(HOME, now), hm = (ms) => (ms ? new Date(ms).toLocaleTimeString(cfg.lang === 'en' ? 'en-GB' : 'it-IT', { hour: '2-digit', minute: '2-digit' }) : '–');
  const up = m.el > 0, eme = m.dist < 370000 ? t('moonPer') : m.dist > 400000 ? t('moonApo') : '';
  el.innerHTML = `<div class="moonrow"><span class="disc" style="--i:${m.illum.toFixed(2)};--w:${m.age < 180 ? -1 : 1}"></span><div><b>${t('ph_' + phaseName(m.age))}</b> · ${Math.round(m.illum * 100)}%<br><small>${up ? `<b style="color:#3ddc97">${t('moonUp')}</b>` : t('moonDown')} · az ${Math.round(m.az)}° · el ${Math.round(m.el)}°</small><br><small>${t('moonRise')} ${hm(rs.rise)} · ${t('moonSet')} ${hm(rs.set)} · ${Math.round(m.dist / 1000)}·10³ km${eme ? ' · ' + eme : ''}</small></div></div>`;
}
function renderTrend() {
  const el = $('#trend'); if (!el) return;
  const list = trending([...spots.values()]);
  el.innerHTML = list.length ? list.map((e) => `<button type="button" class="tr" data-call="${esc(e.call)}">${e.iso ? `<img src="flags/${esc(e.iso)}.svg" alt="" width="20" height="14">` : ''}<b>${esc(e.call)}</b> <span>${esc(e.country)}</span><em>▲ ${e.recent} · ${esc(e.bands.join(' '))}</em></button>`).join('') + `<p class="hint">${t('trendHint')}</p>` : `<p class="hint">${t('trendNone')}</p>`;
}
$('#trend')?.addEventListener('click', (e) => { const b = e.target.closest('.tr'); if (!b) return; F.q = b.dataset.call; $('#q').value = F.q; refresh(); });
let contestList = [], contestErr = false;
async function loadContests() {
  try { contestList = await fetchContests(); contestErr = false; } catch { contestErr = true; }
  renderContests();
}
function renderContests() {
  const el = $('#contests'); if (!el) return;
  if (contestErr && !contestList.length) { el.innerHTML = `<p class="hint">${t('contestErr')}</p>`; return; }
  const now = Date.now(), loc = cfg.lang === 'en' ? 'en-GB' : 'it-IT';
  const fmt = (ms) => new Date(ms).toLocaleString(loc, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  const inH = (ms) => { const m = Math.round((ms - now) / 60e3); return m < 90 ? m + '′' : m < 2880 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' g'; };
  const live = contestList.filter((c) => c.start <= now), next = contestList.filter((c) => c.start > now && c.start < now + 7 * 86400e3);
  const rows = [...live.sort((a, b) => Number(b.big) - Number(a.big)).slice(0, 5), ...next.slice(0, 8)];
  el.innerHTML = rows.length ? `<ul class="cts">${rows.map((c) => {
    const on = c.start <= now;
    return `<li class="${on ? 'on' : ''}"><a href="${esc(c.link)}" target="_blank" rel="noopener">${c.big ? '★ ' : ''}${esc(c.title)}</a><small>${on ? `<b>${t('ctLive')}</b> · ${t('ctEnds')} ${inH(c.end)}` : `${fmt(c.start)}Z · ${t('satIn')} ${inH(c.start)}`}</small></li>`;
  }).join('')}</ul><p class="hint">${t('ctHint')}</p>` : `<p class="hint">${t('ctNone')}</p>`;
}
function renderQuakes() {
  const el = $('#quakes'); if (!el) return;
  if (quakeErr && !quakeList.length) { el.innerHTML = `<p class="hint">${t('quakeErr')}</p>`; return; }
  const top = [...quakeList].sort((a, b) => b.mag - a.mag).slice(0, 5);
  el.innerHTML = top.length ? `<div class="qk">${top.map((q) => `<div><b class="${q.mag >= 6 ? 'big' : ''}">M ${q.mag.toFixed(1)}</b> ${esc(q.place)} <small>${ago(q.t)}</small></div>`).join('')}</div><p class="hint">${quakeList.length} ${t('quakeCount')}</p>` : `<p class="hint">${t('quakeNone')}</p>`;
}

let heardWatch = null, heardFor = '';
function loadHeard() { // avvia/riavvia il feed in tempo reale se serve (livello attivo e nominativo cambiato)
  const call = followCall();
  if (!cfg.heard) { if (heardWatch) heardWatch.stop(); heardWatch = null; heardFor = ''; heardList = []; renderHeard(); return; }
  if (heardWatch && heardFor === call) return;
  if (heardWatch) heardWatch.stop();
  heardFor = call; heardList = []; heardErr = '';
  heardWatch = watchHeard(call, HOME, (l) => { heardList = l; renderHeard(); renderProp(); });
  renderHeard();
}
function renderHeard() {
  const el = $('#heard'), call = followCall(), lim = Date.now() - 30 * 60e3, list = heardList.filter((r) => r.t >= lim);
  let html = `<p class="hint">${t('heardFor')} <b>${esc(call)}</b> · ${t('heardChange')}</p>`;
  if (!cfg.heard) html = `<p class="hint">${t('heardOff')}</p>`;
  else if (heardErr && !list.length) html += `<p class="hint">${t('heardErr')}</p>`;
  else if (!list.length) html += `<p class="hint">${t('heardNone')}</p>`;
  else {
    const far = list.reduce((a, b) => (b.km > a.km ? b : a));
    html += `<div class="hsum"><b>${new Set(list.map((r) => r.rx)).size}</b> ${t('heardStations')} · ${t('heardFar')} <b>${far.km.toLocaleString('it-IT')} km</b> (${esc(far.rx)})</div>`;
    const by = {};
    for (const r of list) { const b = (by[r.band.id] ||= { band: r.band, n: 0, far: r }); b.n++; if (r.km > b.far.km) b.far = r; }
    html += BANDS.filter((b) => by[b.id]).map((b) => { const x = by[b.id]; return `<div class="hb" style="--c:${b.color}"><span class="bb">${b.name}</span><b>${x.n}</b><em>${t('heardMax')} ${x.far.km.toLocaleString('it-IT')} km · ${esc(x.far.rx)}</em></div>`; }).join('');
  }
  el.innerHTML = html;
}
function renderProp() {
  const el = $('#prop');
  const m = openMatrix([...spots.values()], { home: HOME, centroid, contOf, minutes: 30 });
  const heard = new Set(heardList.filter((r) => r.t >= Date.now() - 30 * 60e3).map((r) => `${r.band.id}|${nearestCont(r.ll)}`));
  const cls = (n) => (n >= 4 ? 'o3' : n >= 1 ? 'o2' : 'o0');
  let html = `<table class="pm"><thead><tr><th></th>${REGIONS.map((r) => `<th>${r}</th>`).join('')}</tr></thead><tbody>`;
  for (const b of PROP_BANDS) {
    const band = BANDS.find((x) => x.id === b);
    html += `<tr><th style="--c:${band.color}">${band.name}</th>${REGIONS.map((r) => `<td class="${cls(m[b][r])}" title="${band.name} → ${r}: ${m[b][r]} spot${heard.has(`${b}|${r}`) ? ' · ' + t('propHeardMe') : ''}">${heard.has(`${b}|${r}`) ? '★' : m[b][r] || ''}</td>`).join('')}</tr>`;
  }
  el.innerHTML = html + `</tbody></table><p class="hint">${t('propLegend')}</p>`;
}
/* ------------------------------------------------------------------ notifiche push (anche ad app chiusa) */
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64u8 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
async function pushSub() { try { const reg = await navigator.serviceWorker.getRegistration(); return reg ? await reg.pushManager.getSubscription() : null; } catch { return null; } }
async function pushSend(sub) {
  const r = await fetch('push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub: sub.toJSON(), call: cfg.myCall, watch: cfg.watch, opts: cfg.pushOpts }) });
  if (!r.ok) throw new Error('push ' + r.status);
}
async function pushEnable() {
  if (!pushSupported()) { toastText(t('pushNo'), 7000); return; }
  if ((await Notification.requestPermission()) !== 'granted') { toastText(t('pushDenied'), 6000); return; }
  try {
    const reg = await navigator.serviceWorker.ready, key = (await (await fetch('push/key')).json()).key;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u8(key) });
    await pushSend(sub); toastText(t('pushOn'), 5000);
  } catch (e) { toastText(t('pushFail') + ' ' + String(e.message || e), 7000); }
  renderPush();
}
async function pushDisable() {
  const sub = await pushSub();
  if (sub) { try { await fetch('push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub: sub.toJSON() }) }); } catch { /* server non raggiungibile */ } await sub.unsubscribe(); }
  toastText(t('pushOff'), 4000); renderPush();
}
async function pushResync() { const sub = await pushSub(); if (sub) { try { await pushSend(sub); } catch { /* riprova al prossimo salvataggio */ } } }
async function renderPush() {
  const b = $('#btnPush'); if (!b) return;
  const on = pushSupported() && Notification.permission === 'granted' && !!(await pushSub());
  b.textContent = on ? t('pushDisable') : t('pushEnable'); b.dataset.on = on ? '1' : '';
  $('#pushHint').textContent = pushSupported() ? (on ? t('pushIsOn') : t('pushHint')) : (isIos ? t('installIos') : t('pushNo'));
  $$('#pushOpts input').forEach((i) => { i.checked = cfg.pushOpts[i.value] !== false; i.disabled = !on; });
}
$('#btnPush')?.addEventListener('click', () => ($('#btnPush').dataset.on ? pushDisable() : pushEnable()));

/* ------------------------------------------------------------------ avviso: banda che si apre verso una regione */
const openSeen = new Map(); let openBase = true;
function checkOpenings() {
  if (!cfg.openAlerts || !spots.size) return;
  const m = openMatrix([...spots.values()], { home: HOME, centroid, contOf, minutes: 20 }), now = Date.now(), hits = [];
  for (const b of PROP_BANDS) for (const r of REGIONS) {
    if (m[b][r] < 4) continue;
    const key = b + '|' + r;
    if (now - (openSeen.get(key) || 0) > 2 * 3600e3) { openSeen.set(key, now); if (!openBase) hits.push({ b, r, n: m[b][r] }); }
  }
  openBase = false; // al primo passaggio si memorizza solo lo stato attuale
  for (const h of hits.slice(0, 3)) {
    const band = BANDS.find((x) => x.id === h.b);
    toastText(`📶 ${band.name} ${t('openTo')} ${t('reg_' + h.r)} (${h.n} spot)`, 9000); buzz([90]);
  }
}
setInterval(checkOpenings, 60e3);
function greyTargets() {
  const out = [], seen = new Set();
  const add = (label, ent, tag) => {
    if (ent < 0 || seen.has(label)) return;
    seen.add(label); out.push({ label, name: ENTITIES[ent][0], ll: [ENTITIES[ent][5], ENTITIES[ent][4]], tag });
  };
  for (const w of cfg.watch) { const base = String(w).replace(/\*.*$/, ''); if (base) add(w, resolveEnt(base), '★'); }
  for (const o of dxpeditions()) {
    if (!o.live || o.ent < 0) continue;
    if (MyLog.hasLog() && !MyLog.newEntity(o.ent, cfg.confirmedOnly)) continue;
    add(o.call, o.ent, MyLog.hasLog() ? '🆕' : '📡');
  }
  return out.slice(0, 10);
}
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`; };
function renderGrey() {
  const el = $('#grey'), targets = greyTargets(), now = Date.now();
  if (!targets.length) { el.innerHTML = `<p class="hint">${t('greyHint')}</p>`; return; }
  const ph = (p) => (p === 'day' ? '☀️' : p === 'night' ? '🌙' : '🌅');
  el.innerHTML = targets.map((g) => {
    const r = greyline(HOME, g.ll, now), nx = r.next;
    let when = t('greyNone');
    if (nx) {
      const rise = nx.sideRising ? t('sunrise') : t('sunset'), kind = nx.kind === 'both' ? t('greyBoth') : nx.kind === 'home' ? `${rise} ${t('atCaserta')}, ${t('darkThere')}` : `${rise} ${t('there')}, ${t('darkHere')}`;
      const mins = Math.round((nx.start - now) / 60e3);
      when = nx.start <= now + 1000 ? `✅ ${t('greyNow')} ${hhmm(nx.end)} · ${kind}` : `${hhmm(nx.start)}–${hhmm(nx.end)} (${t('greyIn')} ${Math.floor(mins / 60)} h ${mins % 60} min) · ${kind}`;
    }
    return `<div class="gl${r.now.kind ? ' go' : ''}"><b>${g.tag} ${esc(g.label)}</b><span>${esc(g.name)}</span><i>${ph(r.now.h)} ${t('atCaserta')} · ${ph(r.now.t)} ${t('there')}</i><em>${when}</em></div>`;
  }).join('');
}
if (location.hostname === 'localhost') window.__prop = { get heard() { return heardList; } };

/* ------------------------------------------------------------------ avvio */
setInterval(() => { $('#utc').textContent = new Date().toISOString().slice(11, 19); }, 1000);
setInterval(() => { $$('.age').forEach((a) => { a.textContent = ago(Number(a.dataset.t)); }); renderBands(); renderTop(); renderSpark(); }, 15000);
addEventListener('resize', () => { renderSpark(); renderHeat(); });
$('#utc').textContent = new Date().toISOString().slice(11, 19);
compileWatch(); $('#alertDot').hidden = !cfg.watch.length;
applyAwake(); readHash(); applyI18n();
acct = initAccount({ $, $$, esc, cfg, store, toastText, MyLog, applySettings, currentSettings, importAdif, lang: () => cfg.lang }); applyTheme(); map.setProj(cfg.proj);
refresh(); poll(); loadSolar(); loadHeat();
initSpotBar({ $, getLang: () => cfg.lang, getAcct: () => acct, onSent: () => setTimeout(poll, 2500) });
initTools({ $, $$, esc, getLang: () => cfg.lang, getAcct: () => acct });
ana = initAnalytics({ $, $$, esc, getLang: () => cfg.lang, store });
$('#btnAna').addEventListener('click', () => { act.close(); ana.open(); });
act = initActivation({ $, $$, esc, getLang: () => cfg.lang, store, deps: { MyLog, resolve: resolveEnt, addWatch } });
$('#btnAct').addEventListener('click', () => { ana.close(); act.open(); });
// link condivisibile dell'edizione speciale: https://…/#9t0md (o /9t0md.html)
const openSpecial = (force) => { if (force === true || /^#(9t0md|special)$/i.test(location.hash)) { ana.close(); if (!act.isOpen()) act.open(); } };
if (SPECIAL_LINK) openSpecial(true);
addEventListener('hashchange', () => openSpecial());
$('#actBar').addEventListener('click', () => { ana.close(); act.open(); });
$('#onlBadge').addEventListener('click', () => { showTab('stats'); if (!isPhone()) $('#visitors')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
initTicker({ getLang: () => cfg.lang, getConfirmedOnly: () => cfg.confirmedOnly, t, callUrl });
renderHeard(); renderProp(); renderGrey(); loadHeard();
loadSats(); loadQuakes(); loadContests(); setInterval(loadContests, 30 * 60e3); setInterval(renderContests, 60e3); setInterval(loadQuakes, 10 * 60e3); setInterval(loadSats, 6 * 3600e3); setInterval(renderSats, 30e3); renderMoon(); setInterval(renderMoon, 30e3);
setInterval(loadHeard, 5 * 60e3); setInterval(() => { renderProp(); renderGrey(); }, 60e3);
setInterval(loadSolar, 10 * 60e3); setInterval(loadHeat, 30 * 60e3);
/* ------------------------------------------------------------------ installazione come app */
let installEv = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
function showInstall() {
  const hide = isStandalone(); // già installata: la voce sparisce
  ['#btnInstall', '#btnInstall2'].forEach((q) => { const b = $(q); if (b) b.hidden = hide; });
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEv = e; showInstall(); });
window.addEventListener('appinstalled', () => { installEv = null; showInstall(); toastText(t('installed')); });
async function doInstall() {
  if (installEv) { installEv.prompt(); await installEv.userChoice.catch(() => {}); installEv = null; showInstall(); return; }
  const ua = navigator.userAgent, key = isIos ? 'installIos' : /android/i.test(ua) ? 'installAndroid' : /firefox/i.test(ua) ? 'installFirefox' : /safari/i.test(ua) && !/chrome|chromium|edg/i.test(ua) ? 'installSafari' : 'installDesktop';
  toastText(t(key), 12000);
}
$('#btnInstall')?.addEventListener('click', doInstall);
$('#btnInstall2')?.addEventListener('click', () => { $('#dlgSettings').close(); doInstall(); });
showInstall();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
// Il link telnet usa il dominio con cui si visita il sito (es. decowebcluster.ft2.it).
{ const tl = document.getElementById('telnetLink'); if (tl && location.hostname && location.protocol !== 'file:') { tl.href = 'telnet://' + location.hostname + ':7300'; } }
