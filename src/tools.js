// Strumenti radio: locator, DX e sole, convertitori, antenne, riferimenti e console del cluster (per i soci verificati).
import { locatorToLL, llToLocator, distanceKm, paths, sunAlt, loadZonePolys, zoneAt } from './geo.js';
import { resolve, ENTITIES } from './dxcc.js';
import { bandOf, prefixToIso } from './radio.js';

const HOME = [14.33, 41.07];
const L = {
  it: {
    title: 'Strumenti radio', close: 'Chiudi', tLoc: 'Locator', tDx: 'DX e sole', tConv: 'Convertitori', tAnt: 'Antenne', tRef: 'Riferimenti', tCon: 'Console',
    from: 'Da (locator o lat,lon)', to: 'A (locator o lat,lon)', homeHint: 'Vuoto = Caserta (JN71)', calc: 'Calcola', bad: 'Non riconosco questo valore.',
    loc6: 'Locator', coords: 'Coordinate', sp: 'Percorso corto', lp: 'Percorso lungo', dist: 'Distanza', az: 'Azimut', cqz: 'Zona CQ', ituz: 'Zona ITU',
    call: 'Nominativo o prefisso', entity: 'Entità', cont: 'Continente', solar: 'Ora solare locale', rise: 'Alba', set: 'Tramonto', sunalt: 'Altezza del Sole', grey: 'Greyline adesso', yes: 'sì', no: 'no',
    polarN: 'notte polare', polarD: 'sole di mezzanotte', utc: 'UTC', rome: 'Ora di Roma', timeIn: 'Ora UTC (HH:MM)', now: 'adesso',
    freq: 'Frequenza (MHz)', lambda: 'Lunghezza d\'onda', band: 'Banda', w: 'Potenza (W)', dbm: 'dBm', dbw: 'dBW', gain: 'Guadagno antenna (dBi)', loss: 'Perdita cavo (dB)', erp: 'ERP', eirp: 'EIRP', smeter: 'S-meter',
    sIn: 'Livello (S o dBm)', dip: 'Dipolo mezz\'onda (totale)', leg: 'ogni braccio', ver: 'Verticale 1/4 d\'onda', rad: 'Radiali (1/4)', loop: 'Loop onda intera', vf: 'Fattore di velocità cavo', coax: 'Cavo mezz\'onda',
    qT: 'Codici Q', rstT: 'Codice RST', phT: 'Alfabeto fonetico', moT: 'Alfabeto Morse',
    cLogin: 'Accedi all\'Area personale e fatti verificare dalla Sezione per usare la console.', cPend: 'Il tuo nominativo è in attesa di verifica dalla Sezione.', cHint: 'Comandi di sola lettura, ad esempio',
    cRun: 'Esegui', cPh: 'sh/dx 20, sh/wwv, sh/sun JA, sh/muf 7', cErr: 'Comando non riuscito.', cBadCmd: 'Comando non consentito.', cWait: 'Attendi…', cMany: 'Troppi comandi: riprova tra poco.',
  },
  en: {
    title: 'Radio tools', close: 'Close', tLoc: 'Locator', tDx: 'DX & sun', tConv: 'Converters', tAnt: 'Antennas', tRef: 'Reference', tCon: 'Console',
    from: 'From (locator or lat,lon)', to: 'To (locator or lat,lon)', homeHint: 'Empty = Caserta (JN71)', calc: 'Calculate', bad: 'I do not recognise this value.',
    loc6: 'Locator', coords: 'Coordinates', sp: 'Short path', lp: 'Long path', dist: 'Distance', az: 'Bearing', cqz: 'CQ zone', ituz: 'ITU zone',
    call: 'Callsign or prefix', entity: 'Entity', cont: 'Continent', solar: 'Local solar time', rise: 'Sunrise', set: 'Sunset', sunalt: 'Sun elevation', grey: 'Greyline now', yes: 'yes', no: 'no',
    polarN: 'polar night', polarD: 'midnight sun', utc: 'UTC', rome: 'Rome time', timeIn: 'UTC time (HH:MM)', now: 'now',
    freq: 'Frequency (MHz)', lambda: 'Wavelength', band: 'Band', w: 'Power (W)', dbm: 'dBm', dbw: 'dBW', gain: 'Antenna gain (dBi)', loss: 'Cable loss (dB)', erp: 'ERP', eirp: 'EIRP', smeter: 'S-meter',
    sIn: 'Level (S or dBm)', dip: 'Half-wave dipole (total)', leg: 'each leg', ver: 'Quarter-wave vertical', rad: 'Radials (1/4)', loop: 'Full-wave loop', vf: 'Cable velocity factor', coax: 'Half-wave cable',
    qT: 'Q codes', rstT: 'RST code', phT: 'Phonetic alphabet', moT: 'Morse code',
    cLogin: 'Log in to your account and get verified by the Section to use the console.', cPend: 'Your callsign is waiting to be verified by the Section.', cHint: 'Read-only commands, for example',
    cRun: 'Run', cPh: 'sh/dx 20, sh/wwv, sh/sun JA, sh/muf 7', cErr: 'Command failed.', cBadCmd: 'Command not allowed.', cWait: 'Please wait…', cMany: 'Too many commands: try again shortly.',
  },
};
const Q = [['QRA', 'Nome della stazione / Station name'], ['QRB', 'Distanza tra le stazioni / Distance'], ['QRG', 'Frequenza esatta / Exact frequency'], ['QRH', 'La frequenza varia / Frequency varies'], ['QRI', 'Tono della trasmissione / Tone'],
  ['QRK', 'Intelligibilità / Readability'], ['QRL', 'Frequenza occupata / Busy (is the frequency in use?)'], ['QRM', 'Interferenza / Interference'], ['QRN', 'Disturbi atmosferici / Static'], ['QRO', 'Aumenta potenza / Increase power'],
  ['QRP', 'Diminuisci potenza / Low power'], ['QRQ', 'Trasmetti più velocemente / Send faster'], ['QRS', 'Trasmetti più lentamente / Send slower'], ['QRT', 'Cessa la trasmissione / Stop sending'], ['QRU', 'Nulla per te / Nothing for you'],
  ['QRV', 'Sono pronto / I am ready'], ['QRX', 'Attendi / Stand by'], ['QRZ', 'Chi mi chiama? / Who is calling me?'], ['QSA', 'Intensità del segnale / Signal strength'], ['QSB', 'Evanescenza / Fading'],
  ['QSL', 'Confermo la ricezione / Acknowledged'], ['QSO', 'Collegamento / Contact'], ['QSP', 'Inoltra il messaggio / Relay'], ['QSY', 'Cambia frequenza / Change frequency'], ['QTH', 'Posizione / Location'], ['QTR', 'Ora esatta / Exact time']];
const NATO = 'Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu'.split(' ');
const ITA = 'Ancona Bologna Como Domodossola Empoli Firenze Genova Hotel Imola Jolly Kappa Livorno Milano Napoli Otranto Palermo Quarto Roma Savona Torino Udine Venezia Washington Xilofono Yacht Zara'.split(' ');
const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '/': '-..-.', '?': '..--..', '.': '.-.-.-', ',': '--..--' };

const D = Math.PI / 180;
/** Alba e tramonto (UTC, ms) per un luogo e un giorno, con l'equazione solare standard (precisione circa 1 minuto). */
export function sunTimes(lat, lon, ms) {
  const d = new Date(ms), day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const n = Math.ceil((day + 43200000) / 86400000 + 2440587.5 - 2451545.0 + 0.0008), js = n - lon / 360;   // il mezzogiorno solare arriva prima verso est
  const M = (357.5291 + 0.98560028 * js) % 360, C = 1.9148 * Math.sin(M * D) + 0.02 * Math.sin(2 * M * D) + 0.0003 * Math.sin(3 * M * D);
  const lam = (M + C + 180 + 102.9372) % 360, jt = 2451545.0 + js + 0.0053 * Math.sin(M * D) - 0.0069 * Math.sin(2 * lam * D);
  const dec = Math.asin(Math.sin(lam * D) * Math.sin(23.44 * D));
  const cw = (Math.sin(-0.833 * D) - Math.sin(lat * D) * Math.sin(dec)) / (Math.cos(lat * D) * Math.cos(dec));
  if (cw > 1) return { polar: 'N' };
  if (cw < -1) return { polar: 'D' };
  const w = Math.acos(cw) / D, toMs = (j) => (j - 2440587.5) * 86400000;
  return { rise: toMs(jt - w / 360), set: toMs(jt + w / 360) };
}

/** "JN71", "JN71ov" o "41.07, 14.33" → [lon, lat] */
export function parsePlace(txt) {
  const s = String(txt || '').trim();
  if (!s) return null;
  const ll = locatorToLL(s);
  if (ll) return ll;
  const m = /^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/.exec(s);
  if (!m) return null;
  const lat = Number(m[1].replace(',', '.')), lon = Number(m[2].replace(',', '.'));
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lon, lat] : null;
}

export function initTools({ $, $$, esc, getLang, getAcct }) {
  const dlg = $('#dlgTools'); if (!dlg) return;
  const API = window.CLUSTER_API ?? '/';
  const tr = (k) => (L[getLang()] || L.it)[k] ?? L.it[k] ?? k;
  const TABS = ['Loc', 'Dx', 'Conv', 'Ant', 'Ref', 'Con'];
  let tab = 'Loc';
  const f1 = (n, d = 1) => Number(n).toLocaleString(getLang() === 'en' ? 'en-GB' : 'it-IT', { maximumFractionDigits: d });
  const hhmm = (ms, tz = 'UTC') => new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  const inp = (id, label, v = '', extra = '') => `<label class="tf"><span>${label}</span><input id="${id}" value="${esc(v)}" autocomplete="off" spellcheck="false" ${extra}></label>`;

  /* ---- Locator ---- */
  function viewLoc() {
    const me = getAcct()?.me;
    return `<div class="trow">${inp('tFrom', tr('from'), me?.locator || '', `placeholder="${tr('homeHint')}"`)}${inp('tTo', tr('to'), '', 'placeholder="PM95, 35.7, 139.7"')}</div>
      <button type="button" class="tbtn" data-t="loc">${tr('calc')}</button><div id="tOut" class="tout"></div>`;
  }
  async function doLoc() {
    await loadZonePolys();
    const a = parsePlace($('#tFrom').value) || HOME, b = parsePlace($('#tTo').value);
    if (!b) { $('#tOut').innerHTML = `<p class="bad">${tr('bad')}</p>`; return; }
    const p = paths(a, b), cq = zoneAt('cq', b[0], b[1]), itu = zoneAt('itu', b[0], b[1]);
    $('#tOut').innerHTML = `<table class="tt">${row(tr('loc6'), `<b>${llToLocator(b[0], b[1])}</b>`)}${row(tr('coords'), `${b[1].toFixed(3)}°, ${b[0].toFixed(3)}°`)}
      ${row(tr('sp'), `${f1(p.sp, 0)} km (${f1(p.sp * 0.621371, 0)} mi) · ${tr('az')} <b>${Math.round(p.azSp)}°</b>`)}${row(tr('lp'), `${f1(p.lp, 0)} km · ${tr('az')} <b>${Math.round(p.azLp)}°</b>`)}
      ${cq ? row(tr('cqz'), `${cq.n} – ${esc(cq.name)}`) : ''}${itu ? row(tr('ituz'), `${itu.n} – ${esc(itu.name)}`) : ''}</table>`;
  }

  /* ---- DX e sole ---- */
  const viewDx = () => `<div class="trow">${inp('tCall', tr('call'), '', 'placeholder="3Y0J, JA1, VK9, JN71ov" style="text-transform:uppercase"')}</div><button type="button" class="tbtn" data-t="dx">${tr('calc')}</button><div id="tOut" class="tout"></div>`;
  async function doDx() {
    const q = $('#tCall').value.trim().toUpperCase(); if (!q) return;
    await loadZonePolys();
    let ll = null, ent = null;
    const isLoc = /^[A-R]{2}\d{2}([A-X]{2}(\d{2})?)?$/.test(q);
    const idx = isLoc ? -1 : resolve(q);
    if (idx >= 0) { ent = ENTITIES[idx]; ll = [ent[5], ent[4]]; } else ll = parsePlace(q);
    if (!ll) { $('#tOut').innerHTML = `<p class="bad">${tr('bad')}</p>`; return; }
    const now = Date.now(), p = paths(HOME, ll), st = sunTimes(ll[1], ll[0], now), alt = sunAlt(ll, now);
    const solar = new Date(now + (ll[0] / 15) * 3600e3), sol = `${String(solar.getUTCHours()).padStart(2, '0')}:${String(solar.getUTCMinutes()).padStart(2, '0')}`;
    const iso = idx >= 0 ? prefixToIso(ent[6]) : null;
    $('#tOut').innerHTML = `<table class="tt">${ent ? row(tr('entity'), `${iso ? `<img class="fl" src="flags/${iso}.svg" alt=""> ` : ''}<b>${esc(ent[0])}</b> (${esc(ent[6])})`) + row(tr('cont'), esc(ent[3])) + row(`${tr('cqz')} / ${tr('ituz')}`, `${ent[1]} / ${ent[2]}`) : row(tr('loc6'), `<b>${llToLocator(ll[0], ll[1])}</b>`)}
      ${row(tr('dist'), `${f1(p.sp, 0)} km · ${tr('az')} <b>${Math.round(p.azSp)}°</b> (${tr('lp')}: ${f1(p.lp, 0)} km, ${Math.round(p.azLp)}°)`)}
      ${row(tr('solar'), `<b>${sol}</b>`)}${row(tr('sunalt'), `${f1(alt, 0)}°`)}
      ${st.polar ? row(tr('rise'), tr(st.polar === 'N' ? 'polarN' : 'polarD')) : row(tr('rise'), `${hhmm(st.rise)}Z`) + row(tr('set'), `${hhmm(st.set)}Z`)}
      ${row(tr('grey'), Math.abs(alt) < 6 ? `<b class="ok">${tr('yes')}</b>` : tr('no'))}</table>`;
  }

  /* ---- Convertitori ---- */
  const viewConv = () => `<h4>${tr('utc')} ↔ ${tr('rome')}</h4><div class="trow">${inp('cT', tr('timeIn'), '', `placeholder="${tr('now')}"`)}<div class="tres" id="cTr"></div></div>
    <h4>${tr('freq')} ↔ ${tr('lambda')}</h4><div class="trow">${inp('cF', tr('freq'), '14.074', 'inputmode="decimal"')}<div class="tres" id="cFr"></div></div>
    <h4>W ↔ dBm ↔ dBW</h4><div class="trow">${inp('cW', tr('w'), '100', 'inputmode="decimal"')}<div class="tres" id="cWr"></div></div>
    <h4>${tr('erp')} / ${tr('eirp')}</h4><div class="trow">${inp('cP', tr('w'), '100', 'inputmode="decimal"')}${inp('cL', tr('loss'), '1', 'inputmode="decimal"')}${inp('cG', tr('gain'), '2.15', 'inputmode="decimal"')}<div class="tres" id="cPr"></div></div>
    <h4>${tr('smeter')}</h4><div class="trow">${inp('cS', tr('sIn'), 'S9', 'placeholder="S7, S9+20, -93"')}<div class="tres" id="cSr"></div></div>`;
  function updConv() {
    const num = (id) => Number(String($('#' + id)?.value || '').replace(',', '.'));
    const t = $('#cT').value.trim(); let d = new Date();
    const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(t); if (m) d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), +m[1], +m[2]));
    $('#cTr').innerHTML = `${hhmm(d)} UTC → <b>${hhmm(d, 'Europe/Rome')}</b> ${tr('rome')}`;
    const f = num('cF'); $('#cFr').innerHTML = f > 0 ? `λ = <b>${f1(299.792458 / f, 3)} m</b> · ${bandOf(f * 1000)?.name || '—'}` : '—';
    const w = num('cW'); $('#cWr').innerHTML = w > 0 ? `<b>${f1(10 * Math.log10(w * 1000), 1)} dBm</b> · ${f1(10 * Math.log10(w), 1)} dBW` : '—';
    const p = num('cP'), l = num('cL'), g = num('cG');
    if (p > 0) { const eirp = p * 10 ** ((g - l) / 10), erp = eirp / 1.64; $('#cPr').innerHTML = `${tr('eirp')} <b>${f1(eirp, 1)} W</b> · ${tr('erp')} <b>${f1(erp, 1)} W</b>`; } else $('#cPr').textContent = '—';
    const s = $('#cS').value.trim().toUpperCase(), sm = /^S(\d)(?:\+(\d+))?$/.exec(s);
    if (sm) { const n = +sm[1], plus = +(sm[2] || 0), dbm = n >= 9 ? -73 + plus : -73 - (9 - n) * 6; $('#cSr').innerHTML = `<b>${dbm} dBm</b> (50 Ω, HF)`; }
    else if (/^-?\d+(\.\d+)?$/.test(s)) { const dbm = +s; $('#cSr').innerHTML = dbm >= -73 ? `<b>S9${dbm > -73 ? '+' + Math.round(dbm + 73) : ''}</b>` : `<b>S${Math.max(0, Math.round(9 - (-73 - dbm) / 6))}</b>`; } else $('#cSr').textContent = '—';
  }

  /* ---- Antenne ---- */
  const viewAnt = () => `<div class="trow">${inp('aF', tr('freq'), '7.1', 'inputmode="decimal"')}${inp('aV', tr('vf'), '0.66', 'inputmode="decimal"')}</div><div id="aOut" class="tout"></div>`;
  function updAnt() {
    const f = Number(String($('#aF').value).replace(',', '.')), vf = Number(String($('#aV').value).replace(',', '.')) || 0.66;
    if (!(f > 0)) { $('#aOut').innerHTML = ''; return; }
    const dip = 142.5 / f, ver = 71.25 / f, loop = 306.3 / f, coax = 150 * vf / f;
    $('#aOut').innerHTML = `<table class="tt">${row(tr('dip'), `<b>${f1(dip, 2)} m</b> (${tr('leg')} ${f1(dip / 2, 2)} m)`)}${row(tr('ver'), `<b>${f1(ver, 2)} m</b>`)}${row(tr('rad'), `${f1(ver, 2)} m`)}${row(tr('loop'), `<b>${f1(loop, 2)} m</b>`)}${row(tr('coax'), `<b>${f1(coax, 2)} m</b> (VF ${vf})`)}</table>
      <p class="hint">${getLang() === 'en' ? 'Starting lengths: trim for SWR; real values depend on height, wire and surroundings.' : 'Lunghezze di partenza: da accorciare con il ROS; i valori reali dipendono da altezza, filo e dintorni.'}</p>`;
  }

  /* ---- Riferimenti ---- */
  function viewRef() {
    const ph = NATO.map((n, i) => `<span><b>${String.fromCharCode(65 + i)}</b> ${n}<em>${ITA[i]}</em></span>`).join('');
    const mo = Object.entries(MORSE).map(([c, m]) => `<span><b>${c}</b> ${m.replace(/\./g, '·').replace(/-/g, '−')}</span>`).join('');
    return `<h4>${tr('rstT')}</h4><p class="hint">R 1-5 (leggibilità/readability) · S 1-9 (intensità/strength) · T 1-9 (tono CW/tone) — es. 599, 59, 57</p>
      <h4>${tr('qT')}</h4><div class="qgrid">${Q.map(([c, d]) => `<span><b>${c}</b> ${d}</span>`).join('')}</div>
      <h4>${tr('phT')}</h4><div class="phgrid">${ph}</div><h4>${tr('moT')}</h4><div class="mogrid">${mo}</div>`;
  }

  /* ---- Console ---- */
  function viewCon() {
    const me = getAcct()?.me;
    if (!me) return `<p class="hint">${tr('cLogin')}</p><button type="button" class="tbtn" data-t="login">🔐</button>`;
    if (!(me.approved || me.admin)) return `<p class="hint">${tr('cPend')}</p>`;
    return `<p class="hint">${tr('cHint')}: <code>${tr('cPh')}</code></p><div class="trow ccon">${inp('kCmd', 'sh/…', '', `placeholder="${tr('cPh')}" maxlength="60"`)}<button type="button" class="tbtn" data-t="run" id="kRun">${tr('cRun')}</button></div><pre id="kOut" class="kout"></pre>`;
  }
  async function runCmd() {
    const cmd = $('#kCmd').value.trim(); if (!cmd) return;
    const out = $('#kOut'), btn = $('#kRun'); btn.disabled = true; out.textContent = tr('cWait');
    try {
      const r = await fetch(API + 'api/console', { method: 'POST', headers: { 'X-IQ8DO': '1', 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ cmd }) });
      const j = await r.json().catch(() => ({}));
      out.textContent = r.ok ? (j.output || '—') : r.status === 429 ? tr('cMany') : r.status === 400 ? tr('cBadCmd') : (j.error || tr('cErr'));
    } catch { out.textContent = tr('cErr'); }
    btn.disabled = false;
  }

  const VIEWS = { Loc: viewLoc, Dx: viewDx, Conv: viewConv, Ant: viewAnt, Ref: viewRef, Con: viewCon };
  function render() {
    $('#toolsTitle').textContent = '🧰 ' + tr('title');
    $('#toolsClose').textContent = tr('close');
    $('#toolsTabs').innerHTML = TABS.map((k) => `<button type="button" data-tab="${k}" class="${k === tab ? 'on' : ''}">${tr('t' + k)}</button>`).join('');
    $('#toolsBody').innerHTML = VIEWS[tab]();
    if (tab === 'Conv') updConv(); if (tab === 'Ant') updAnt();
  }
  $('#toolsTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); } });
  $('#toolsBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    if (b.dataset.t === 'loc') doLoc(); else if (b.dataset.t === 'dx') doDx(); else if (b.dataset.t === 'run') runCmd(); else if (b.dataset.t === 'login') { dlg.close(); $('#btnAccount').click(); }
  });
  $('#toolsBody').addEventListener('input', () => { if (tab === 'Conv') updConv(); else if (tab === 'Ant') updAnt(); });
  $('#toolsBody').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (tab === 'Loc') doLoc(); else if (tab === 'Dx') doDx(); else if (tab === 'Con') runCmd();
  });
  $('#toolsClose').addEventListener('click', () => dlg.close());
  const open = (t) => { if (t) tab = t; render(); if (!dlg.open) dlg.showModal(); };
  $('#btnTools')?.addEventListener('click', () => open());
  document.addEventListener('iq8do:state', () => { if (dlg.open) render(); });
  return { open };
}
