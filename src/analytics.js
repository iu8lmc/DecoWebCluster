// Pannello statistiche completo (zone CQ/ITU, quadranti, DXCC, bande, modi, distanze…) e visitatori online.
// I dati arrivano dal servizio iq8do-stats (/stats/…): archivio proprio degli spot, nessun dato personale.
import { BANDS, prefixToIso } from './radio.js';

const L = {
  it: {
    title: 'Analisi · statistiche DX', close: 'Chiudi', period: 'Periodo', p1: '24 ore', p7: '7 giorni', p30: '30 giorni', p90: '90 giorni', p365: '1 anno', p0: 'Tutto',
    side: 'Vista', sdx: 'DX spottati', sde: 'Chi spotta (spotter)', filters: 'Filtri', none: 'nessuno', reset: 'Azzera filtri', exact: 'Solo quadranti dal locator reale',
    exactH: 'Se spento, i spot senza locator usano il centro dell\'entità DXCC (approssimato).',
    loading: 'Caricamento…', err: 'Statistiche non disponibili al momento.', since: 'Archivio dal', rows: 'spot in archivio', upd: 'aggiornato',
    k_total: 'Spot', k_dx: 'DX diversi', k_dxcc: 'DXCC', k_de: 'Spotter', k_cq: 'Zone CQ', k_itu: 'Zone ITU', k_grid: 'Quadranti', k_km: 'Distanza media', k_max: 'Più lontano', k_rate: 'Spot/min',
    activity: 'Andamento', perMin: 'Spot al minuto · ultima ora', perDay: 'Spot al giorno', perHour: 'Spot per ora UTC (ora corrente evidenziata)',
    bands: 'Bande', modes: 'Modi', groups: 'Tipo di emissione', conts: 'Continenti', contsOther: 'Continente di chi spotta', contsOtherDe: 'Continente dei DX',
    contBand: 'Continente × banda', cqT: 'Zone CQ', ituT: 'Zone ITU', cqBand: 'Zona CQ × banda', fieldT: 'Quadranti Maidenhead · campi (2 lettere)', squares: 'Quadranti più attivi', sub: 'Sotto-quadranti del campo',
    dxccT: 'DXCC più attivi', topDx: 'Nominativi più spottati', topDe: 'Spotter più attivi', km: 'Distanza da Caserta', hb: 'Ora × banda (UTC)',
    spots: 'spot', spotters: 'spotter', zone: 'Zona', dxcc: 'DXCC', calls: 'Nominativo', show: 'mostra', more: 'mostra altri', less: 'mostra meno', csv: 'Scarica CSV', hint: 'Tocca una barra, una zona, un campo o una banda per filtrare tutto il pannello.',
    visT: 'Visitatori online', visNow: 'online ora', visToday: 'oggi', visYest: 'ieri', visWeek: '7 giorni', visMonth: '30 giorni', visTotal: 'dall\'inizio', visPeak: 'picco 24 h',
    visWhere: 'Dove sono', visDev: 'Dispositivi', visLang: 'Lingua', visReg: 'Area', visTrend: 'Online nelle ultime 24 ore', visDaily: 'Visitatori al giorno (30 giorni)', visPriv: 'Conteggio anonimo: nessun IP, nessun cookie.',
    t_map: 'Mappa', t_feed: 'Spot', t_stats: 'Statistiche', t_ana: 'Analisi', mobile: 'telefono', desktop: 'computer', tablet: 'tablet', badge: 'visitatori online',
    EU: 'Europa', NA: 'Nord America', SA: 'Sud America', AS: 'Asia', AF: 'Africa', OC: 'Oceania', AN: 'Antartide',
  },
  en: {
    title: 'Analysis · DX statistics', close: 'Close', period: 'Period', p1: '24 hours', p7: '7 days', p30: '30 days', p90: '90 days', p365: '1 year', p0: 'All',
    side: 'View', sdx: 'DX spotted', sde: 'Who spots (spotters)', filters: 'Filters', none: 'none', reset: 'Clear filters', exact: 'Only squares from real locators',
    exactH: 'When off, spots without a locator use the centre of the DXCC entity (approximate).',
    loading: 'Loading…', err: 'Statistics not available right now.', since: 'Archive since', rows: 'spots archived', upd: 'updated',
    k_total: 'Spots', k_dx: 'Distinct DX', k_dxcc: 'DXCC', k_de: 'Spotters', k_cq: 'CQ zones', k_itu: 'ITU zones', k_grid: 'Grid squares', k_km: 'Average distance', k_max: 'Farthest', k_rate: 'Spots/min',
    activity: 'Activity', perMin: 'Spots per minute · last hour', perDay: 'Spots per day', perHour: 'Spots per UTC hour (current hour highlighted)',
    bands: 'Bands', modes: 'Modes', groups: 'Emission type', conts: 'Continents', contsOther: 'Spotters\' continent', contsOtherDe: 'DX continent',
    contBand: 'Continent × band', cqT: 'CQ zones', ituT: 'ITU zones', cqBand: 'CQ zone × band', fieldT: 'Maidenhead · fields (2 letters)', squares: 'Most active squares', sub: 'Sub-squares of the field',
    dxccT: 'Most active DXCC', topDx: 'Most spotted callsigns', topDe: 'Most active spotters', km: 'Distance from Caserta', hb: 'Hour × band (UTC)',
    spots: 'spots', spotters: 'spotters', zone: 'Zone', dxcc: 'DXCC', calls: 'Callsign', show: 'show', more: 'show more', less: 'show less', csv: 'Download CSV', hint: 'Tap a bar, a zone, a field or a band to filter the whole panel.',
    visT: 'Visitors online', visNow: 'online now', visToday: 'today', visYest: 'yesterday', visWeek: '7 days', visMonth: '30 days', visTotal: 'since start', visPeak: '24 h peak',
    visWhere: 'Where they are', visDev: 'Devices', visLang: 'Language', visReg: 'Area', visTrend: 'Online in the last 24 hours', visDaily: 'Visitors per day (30 days)', visPriv: 'Anonymous count: no IP, no cookies.',
    t_map: 'Map', t_feed: 'Spots', t_stats: 'Statistics', t_ana: 'Analysis', mobile: 'phone', desktop: 'computer', tablet: 'tablet', badge: 'visitors online',
    EU: 'Europe', NA: 'North America', SA: 'South America', AS: 'Asia', AF: 'Africa', OC: 'Oceania', AN: 'Antarctica',
  },
};
const CONT_ORDER = ['EU', 'NA', 'SA', 'AS', 'AF', 'OC', 'AN'];
const B_IDS = BANDS.map((b) => b.id);
const bandName = (id) => BANDS.find((b) => b.id === id)?.name || id;
const bandColor = (id) => BANDS.find((b) => b.id === id)?.color || '#8ea3c7';
const MODE_COL = { CW: '#f5b942', SSB: '#4cc9f0', FM: '#7aa2ff', AM: '#9aa8c7', FT8: '#3ddc97', FT4: '#5ee08a', FT2: '#a3e635', RTTY: '#ff8fd0', PSK: '#d199ff', JT: '#ffa53b', WSPR: '#94a3b8', JS8: '#22d3c5', VARA: '#f472b6', DIGI: '#b8c4de' };

export function initAnalytics({ $, $$, esc, getLang, store }) {
  const API = window.CLUSTER_API ?? '/';
  const tr = (k) => (L[getLang()] || L.it)[k] ?? L.it[k] ?? k;
  const nf = (n) => Number(n || 0).toLocaleString(getLang() === 'en' ? 'en-GB' : 'it-IT');
  const S = { days: store.get('anaDays', 1), side: store.get('anaSide', 'dx'), band: '', mode: '', cont: '', cq: '', itu: '', grid2: '', exact: false };
  let data = null, openFlag = false, token = 0, showMoreSq = false, showMoreDx = false;
  const root = $('#ana');

  /* ---------------------------------------------------------------- visitatori */
  const vid = (() => {
    const mk = () => { const a = new Uint8Array(12); (crypto || window.msCrypto).getRandomValues(a); return [...a].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 20); };
    try { let v = localStorage.getItem('iq8do.vid'); if (!v) { v = mk(); localStorage.setItem('iq8do.vid', v); } return v; } catch { return mk(); }
  })();
  const dev = () => (matchMedia('(max-width: 760px)').matches ? 'mobile' : matchMedia('(max-width: 1100px)').matches ? 'tablet' : 'desktop');
  const region = () => { try { return (Intl.DateTimeFormat().resolvedOptions().timeZone || '').split('/')[0] || ''; } catch { return ''; } };
  const curTab = () => (openFlag ? 'ana' : ($('#layout')?.dataset.tab || 'map'));
  let lastOnline = null;
  function setBadge(n) {
    const b = $('#onlBadge'); if (!b) return;
    b.hidden = false; $('#onlN').textContent = n == null ? '–' : String(n); b.title = n == null ? '' : `${n} ${tr('badge')}`;
  }
  async function ping() {
    if (document.visibilityState === 'hidden') return;
    try {
      const r = await fetch(API + 'stats/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: vid, tab: curTab(), dev: dev(), lang: getLang(), region: region() }), keepalive: true });
      if (r.ok) { const j = await r.json(); setBadge(j.online); }
    } catch { /* offline */ }
  }
  const spark = (pts, w = 300, h = 46, col = 'var(--acc)') => {
    if (!pts.length) return '';
    const max = Math.max(2, ...pts.map((p) => p[1])), n = pts.length;
    const xy = pts.map((p, i) => [(i / Math.max(1, n - 1)) * (w - 4) + 2, h - 4 - (p[1] / max) * (h - 10)]);
    const d = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    return `<svg viewBox="0 0 ${w} ${h}" class="spk" preserveAspectRatio="none"><path d="${d}L${w - 2} ${h}L2 ${h}Z" fill="${col}" opacity=".18"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  };
  const miniBars = (obj, nameFn = (k) => k) => {
    const e = Object.entries(obj).slice(0, 6), max = Math.max(1, ...e.map((x) => x[1]));
    return e.map(([k, v]) => `<div class="mb"><span>${esc(nameFn(k))}</span><div><i style="width:${(v / max) * 100}%"></i></div><b>${v}</b></div>`).join('') || '—';
  };
  function visHtml(d) {
    if (!d) return `<p class="hint">${tr('loading')}</p>`;
    const tabName = (k) => tr('t_' + k) !== 't_' + k ? tr('t_' + k) : k;
    return `<div class="vis-top"><div class="vis-big"><span class="dotl"></span><b>${d.online}</b><small>${tr('visNow')}</small></div>
      <div class="vis-num"><b>${nf(d.today)}</b><small>${tr('visToday')}</small></div><div class="vis-num"><b>${nf(d.yesterday)}</b><small>${tr('visYest')}</small></div>
      <div class="vis-num"><b>${nf(d.week)}</b><small>${tr('visWeek')}</small></div><div class="vis-num"><b>${nf(d.month)}</b><small>${tr('visMonth')}</small></div>
      <div class="vis-num"><b>${nf(d.total)}</b><small>${tr('visTotal')}</small></div><div class="vis-num"><b>${d.peak24}</b><small>${tr('visPeak')}</small></div></div>
      <div class="vis-grid"><div><h4>${tr('visTrend')}</h4>${spark(d.series.length > 1 ? d.series : [[0, d.online], [1, d.online]])}</div>
      <div><h4>${tr('visDaily')}</h4>${spark(d.daily.map((x) => [x[0], x[1]]), 300, 46, 'var(--acc2)')}</div></div>
      <div class="vis-grid vis4"><div><h4>${tr('visWhere')}</h4>${miniBars(d.tab, tabName)}</div><div><h4>${tr('visDev')}</h4>${miniBars(d.dev, (k) => tr(k) !== k ? tr(k) : k)}</div>
      <div><h4>${tr('visLang')}</h4>${miniBars(d.lang, (k) => k.toUpperCase())}</div><div><h4>${tr('visReg')}</h4>${miniBars(d.region)}</div></div>
      <p class="hint">${tr('visPriv')} ${tr('since')} ${esc(d.since)}.</p>`;
  }
  async function loadVisitors() {
    try {
      const r = await fetch(API + 'stats/online', { cache: 'no-store' }); if (!r.ok) throw 0;
      lastOnline = await r.json(); setBadge(lastOnline.online);
      const el = $('#visitors'); if (el) el.innerHTML = visHtml(lastOnline);
      const el2 = $('#anaVis'); if (el2) el2.innerHTML = visHtml(lastOnline);
    } catch { /* servizio non raggiungibile */ }
  }
  const visibleNow = () => document.visibilityState !== 'hidden' && (openFlag || ($('#visitors') && $('#visitors').offsetParent !== null));

  /* ---------------------------------------------------------------- grafici */
  const heatP = (v, max) => (v > 0 ? Math.round(12 + 88 * Math.sqrt(v / Math.max(1, max))) : 0);
  const cols = (vals, labels, o = {}) => {
    const w = 640, h = o.h || 130, n = vals.length, max = Math.max(1, ...vals), bw = w / Math.max(n, 1), pad = 14;
    const bars = vals.map((v, i) => {
      const bh = (v / max) * (h - pad - 12);
      return `<g><title>${esc(labels[i])}: ${nf(v)}</title><rect x="${(i * bw + 1).toFixed(1)}" y="${(h - pad - bh).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" class="${o.hl === i ? 'hl' : ''}" fill="${o.col || 'var(--acc)'}"/></g>`;
    }).join('');
    const every = Math.max(1, Math.ceil(n / (o.ticks || 12)));
    const tk = labels.map((l, i) => (i % every === 0 ? `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${h - 2}" text-anchor="middle">${esc(l)}</text>` : '')).join('');
    return `<svg viewBox="0 0 ${w} ${h}" class="cols" preserveAspectRatio="none">${bars}${tk}</svg>`;
  };
  const hbars = (items, o = {}) => { // items: [key,label,value,color]
    const max = Math.max(1, ...items.map((x) => x[2])), tot = o.total || items.reduce((a, x) => a + x[2], 0) || 1;
    return `<div class="hbars">${items.map(([k, label, v, col]) => `<button type="button" class="hbr ${o.sel === k ? 'on' : ''}" data-f="${o.f || ''}" data-k="${esc(k)}" style="--c:${col || 'var(--acc)'}"><span>${esc(label)}</span><div><i style="width:${(v / max) * 100}%"></i></div><b>${nf(v)}</b><em>${((v / tot) * 100).toFixed(1)}%</em></button>`).join('')}</div>`;
  };
  const tiles = (count, perRow, vals, labelFn, o = {}) => {
    const max = Math.max(1, ...Object.values(vals).map(Number));
    let h = `<div class="tiles" style="--cols:${perRow}">`;
    for (let i = 1; i <= count; i++) {
      const v = Number(vals[i] || 0);
      h += `<button type="button" class="tile ${String(o.sel) === String(i) ? 'on' : ''} ${v ? '' : 'z'}" data-f="${o.f}" data-k="${i}" style="--p:${heatP(v, max)}" title="${esc(labelFn(i, v))}"><b>${i}</b><span>${v ? nf(v) : '·'}</span></button>`;
    }
    return h + '</div>';
  };
  const matrix = (rows, colsIds, get, rowLabel, colLabel, o = {}) => {
    let max = 1;
    for (const r of rows) for (const c of colsIds) max = Math.max(max, get(r, c) || 0);
    let h = `<div class="mx-wrap"><table class="mx"><thead><tr><th></th>${colsIds.map((c) => `<th>${esc(colLabel(c))}</th>`).join('')}</tr></thead><tbody>`;
    for (const r of rows) {
      h += `<tr><th>${esc(rowLabel(r))}</th>`;
      for (const c of colsIds) { const v = get(r, c) || 0; h += `<td style="--p:${heatP(v, max)}" title="${esc(rowLabel(r) + ' · ' + colLabel(c) + ': ' + nf(v))}">${v ? (o.compact ? (v >= 1000 ? Math.round(v / 100) / 10 + 'k' : v) : nf(v)) : ''}</td>`; }
      h += '</tr>';
    }
    return h + '</tbody></table></div>';
  };
  const flag = (pfx) => { const iso = prefixToIso(pfx || ''); return iso ? `<img class="fl" src="flags/${iso}.svg" alt="" loading="lazy">` : '<i class="fl"></i>'; };

  /* ---------------------------------------------------------------- pannello */
  const qs = () => {
    const p = new URLSearchParams({ days: String(S.days), side: S.side });
    ['band', 'mode', 'cont', 'cq', 'itu', 'grid2'].forEach((k) => { if (S[k]) p.set(k, S[k]); });
    if (S.exact) p.set('exact', '1');
    return p.toString();
  };
  async function load() {
    const my = ++token;
    $('#anaBody').classList.add('busy');
    try {
      const r = await fetch(API + 'stats/summary?' + qs(), { cache: 'no-store' }); if (!r.ok) throw 0;
      const j = await r.json(); if (my !== token) return;
      data = j; render();
    } catch { if (my === token) { $('#anaBody').innerHTML = `<p class="hint">${tr('err')}</p>`; } }
    $('#anaBody')?.classList.remove('busy');
  }
  const chip = (cls, f, k, label) => `<button type="button" class="${cls}" data-f="${f}" data-k="${esc(k)}">${esc(label)}</button>`;
  function filterChips() {
    const act = [];
    if (S.band) act.push(['band', bandName(S.band)]); if (S.mode) act.push(['mode', S.mode]); if (S.cont) act.push(['cont', tr(S.cont)]);
    if (S.cq) act.push(['cq', 'CQ ' + S.cq]); if (S.itu) act.push(['itu', 'ITU ' + S.itu]); if (S.grid2) act.push(['grid2', S.grid2]);
    return act.length ? act.map(([f, l]) => `<button type="button" class="fchip" data-clear="${f}">${esc(l)} ✕</button>`).join('') + `<button type="button" class="fchip rst" data-clear="*">${tr('reset')}</button>` : `<span class="hint">${tr('hint')}</span>`;
  }
  function render() {
    const d = data; if (!d) return;
    const side = d.side, cn = (k) => tr(k) !== k ? tr(k) : k;
    const dayFmt = (s) => s.slice(5).replace('-', '/');
    const span = d.archive.from ? new Date(d.archive.from * 1000).toISOString().slice(0, 10) : '—';
    const mins = S.days > 0 ? S.days * 1440 : Math.max(1, (d.now - (d.archive.from || d.now)) / 60);
    const rate = d.total / Math.min(mins, Math.max(1, (d.now - (d.archive.from || d.now)) / 60));
    const kp = (l, v, sub = '') => `<div class="kpi"><b>${v}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const contItems = CONT_ORDER.filter((c) => d.cont[c]).map((c) => [c, tr(c), d.cont[c]]);
    const otherItems = CONT_ORDER.filter((c) => d.otherCont[c]).map((c) => [c, tr(c), d.otherCont[c]]);
    const bandItems = B_IDS.filter((b) => d.band[b]).map((b) => [b, bandName(b), d.band[b], bandColor(b)]);
    const modeItems = Object.entries(d.mode).sort((a, b) => b[1] - a[1]).map(([m, n]) => [m, m, n, MODE_COL[m] || 'var(--acc)']);
    const grpItems = ['CW', 'PHONE', 'DIGI'].filter((g) => d.grp[g]).map((g) => [g, g === 'PHONE' ? 'SSB/FM/AM' : g === 'DIGI' ? 'DIGI' : 'CW', d.grp[g], g === 'CW' ? '#f5b942' : g === 'PHONE' ? '#4cc9f0' : '#3ddc97']);
    const cqTip = (z, v) => `CQ ${z}: ${nf(v)} ${tr('spots')}` + ((d.cqTop && d.cqTop[z]) ? ' — ' + d.cqTop[z].map((x) => x[0]).join(', ') : '');
    const fieldRows = 'RQPONMLKJIHGFEDCBA'.split(''), fieldCols = 'ABCDEFGHIJKLMNOPQR'.split('');
    const gmax = Math.max(1, ...Object.values(d.grid2).map((x) => x[0]));
    const field = `<div class="fld">${fieldRows.map((r) => fieldCols.map((c) => { const k = c + r, v = d.grid2[k] ? d.grid2[k][0] : 0; return `<button type="button" class="fc ${S.grid2 === k ? 'on' : ''} ${v ? '' : 'z'}" data-f="grid2" data-k="${k}" style="--p:${heatP(v, gmax)}" title="${k}: ${nf(v)}">${k}</button>`; }).join('')).join('')}</div>`;
    let sub = '';
    if (S.grid2) {
      const m = Object.fromEntries(d.grid4); const sm = Math.max(1, ...Object.values(m).map(Number));
      sub = `<h4>${tr('sub')} ${esc(S.grid2)}</h4><div class="sub10">${[9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((la) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((lo) => { const k = S.grid2 + lo + la, v = m[k] || 0; return `<span style="--p:${heatP(v, sm)}" title="${k}: ${nf(v)}">${v ? k : ''}</span>`; }).join('')).join('')}</div>`;
    }
    const sq = d.grid4.slice(0, showMoreSq ? 100 : 24);
    const dxc = d.dxcc.slice(0, showMoreDx ? 60 : 20);
    const dmax = Math.max(1, ...d.dxcc.map((x) => x[2]));
    const hbRows = B_IDS.filter((b) => d.hourBand[b]);
    const nowH = new Date().getUTCHours();
    const kmLabels = d.kmBins.map((_, i) => (i === 20 ? '20k+' : i + 'k'));
    const dl = getLang() === 'en' ? { aria: 'Statistics' } : { aria: 'Statistiche' };
    const activity = S.days <= 1
      ? `<h4>${tr('perMin')}</h4>${cols(fillMin(d.perMinute, d.now), fillMin(d.perMinute, d.now).map((_, i) => (i % 10 === 0 ? String(60 - i) + '′' : '')), { col: 'var(--acc)', ticks: 60 })}`
      : `<h4>${tr('perDay')}</h4>${cols(d.perDay.map((x) => x[1]), d.perDay.map((x) => dayFmt(x[0])), { col: 'var(--acc)' })}`;
    $('#anaBody').innerHTML = `
      <div class="ana-note" aria-label="${dl.aria}">${tr('since')} ${esc(span)} · ${nf(d.archive.rows)} ${tr('rows')}${d.archive.err ? ' · ⚠' : ''}</div>
      <div class="kpis">${kp(tr('k_total'), nf(d.total))}${kp(tr('k_dx'), nf(d.uniq.dx))}${kp(tr('k_dxcc'), nf(d.uniq.dxcc))}${kp(tr('k_de'), nf(d.uniq.de))}${kp(tr('k_cq'), d.uniq.cq + '/40')}${kp(tr('k_itu'), d.uniq.itu + '/90')}${kp(tr('k_grid'), nf(d.uniq.grid4), `${d.total ? Math.round((d.exact / d.total) * 100) : 0}% locator`)}${kp(tr('k_km'), nf(d.km.avg) + ' km')}${kp(tr('k_max'), nf(d.km.max) + ' km')}${kp(tr('k_rate'), rate.toFixed(rate < 10 ? 1 : 0))}</div>
      <section class="acard wide"><h3>${tr('activity')}</h3>${activity}<h4>${tr('perHour')}</h4>${cols(d.perHour, d.perHour.map((_, i) => String(i).padStart(2, '0')), { hl: nowH, col: 'var(--acc2)', ticks: 24 })}</section>
      <div class="agrid">
        <section class="acard"><h3>${tr('bands')}</h3>${hbars(bandItems, { f: 'band', sel: S.band })}</section>
        <section class="acard"><h3>${tr('modes')}</h3>${hbars(modeItems, { f: 'mode', sel: S.mode })}<h4>${tr('groups')}</h4>${hbars(grpItems, { f: 'mode', sel: S.mode })}</section>
        <section class="acard"><h3>${tr('conts')}</h3>${hbars(contItems, { f: 'cont', sel: S.cont })}<h4>${side === 'dx' ? tr('contsOther') : tr('contsOtherDe')}</h4>${hbars(otherItems, { f: '' })}</section>
      </div>
      <section class="acard wide"><h3>${tr('cqT')} <small>${d.uniq.cq}/40</small></h3>${tiles(40, 10, d.cq, cqTip, { f: 'cq', sel: S.cq })}</section>
      <section class="acard wide"><h3>${tr('ituT')} <small>${d.uniq.itu}/90</small></h3>${tiles(90, 15, d.itu, (z, v) => `ITU ${z}: ${nf(v)} ${tr('spots')}`, { f: 'itu', sel: S.itu })}</section>
      <section class="acard wide"><h3>${tr('cqBand')}</h3>${matrix(Array.from({ length: 40 }, (_, i) => i + 1).filter((z) => d.cq[z]), B_IDS.filter((b) => d.band[b]), (z, b) => (d.cqBand[z] || {})[b], (z) => 'CQ ' + z, bandName, { compact: true })}</section>
      <section class="acard wide"><h3>${tr('contBand')}</h3>${matrix(CONT_ORDER.filter((c) => d.cont[c]), B_IDS.filter((b) => d.band[b]), (c, b) => (d.contBand[c] || {})[b], (c) => tr(c), bandName)}</section>
      <div class="agrid g2">
        <section class="acard"><h3>${tr('fieldT')}</h3>${field}${sub}<label class="chk ex"><input type="checkbox" id="anaExact" ${S.exact ? 'checked' : ''}> <span>${tr('exact')}</span></label><p class="hint">${tr('exactH')}</p></section>
        <section class="acard"><h3>${tr('squares')}</h3><ol class="rank cols2">${sq.map(([g, n]) => `<li><button type="button" data-f="grid2" data-k="${g.slice(0, 2)}"><b>${esc(g)}</b><span>${nf(n)}</span></button></li>`).join('') || '<li class="hint">—</li>'}</ol>${d.grid4.length > 24 ? `<button type="button" class="more" data-more="sq">${showMoreSq ? tr('less') : tr('more')}</button>` : ''}</section>
      </div>
      <section class="acard wide"><h3>${tr('dxccT')}</h3><div class="dxcc">${dxc.map(([name, pfx, n, de]) => `<div class="dr">${flag(pfx)}<span>${esc(name)}</span><div><i style="width:${(n / dmax) * 100}%"></i></div><b>${nf(n)}</b><em>${nf(de)} ${tr('spotters')}</em></div>`).join('')}</div>${d.dxcc.length > 20 ? `<button type="button" class="more" data-more="dx">${showMoreDx ? tr('less') : tr('more')}</button>` : ''}</section>
      <div class="agrid g2">
        <section class="acard"><h3>${tr('topDx')}</h3><ol class="rank">${d.topDx.slice(0, 25).map(([c, n, name, pfx]) => `<li><a href="https://www.qrz.com/db/${encodeURIComponent(c.split('/')[0])}" target="_blank" rel="noopener">${flag(pfx)}<b>${esc(c)}</b><span>${esc(name)}</span></a><em>${nf(n)}</em></li>`).join('')}</ol></section>
        <section class="acard"><h3>${tr('topDe')}</h3><ol class="rank">${d.topDe.slice(0, 25).map(([c, n]) => `<li><a href="https://www.qrz.com/db/${encodeURIComponent(c.split('/')[0])}" target="_blank" rel="noopener"><b>${esc(c)}</b></a><em>${nf(n)}</em></li>`).join('')}</ol></section>
      </div>
      <section class="acard wide"><h3>${tr('km')}</h3>${cols(d.kmBins, kmLabels, { col: 'var(--ok)', ticks: 21 })}</section>
      <section class="acard wide"><h3>${tr('hb')}</h3>${matrix(hbRows, Array.from({ length: 24 }, (_, i) => i), (b, h) => d.hourBand[b][h], bandName, (h) => String(h).padStart(2, '0'), { compact: true })}</section>
      <div class="ana-actions"><button type="button" id="anaCsv" class="ghost">⬇ ${tr('csv')}</button></div>`;
    $('#anaFilters').innerHTML = filterChips();
    $$('#anaPeriod button').forEach((b) => b.classList.toggle('on', Number(b.dataset.k) === S.days));
    $$('#anaSide button').forEach((b) => b.classList.toggle('on', b.dataset.k === S.side));
  }
  const fillMin = (rows, now) => { const a = new Array(60).fill(0), cur = Math.floor(now / 60); rows.forEach(([m, n]) => { const i = 59 - (cur - m); if (i >= 0 && i < 60) a[i] = n; }); return a; };

  function csv() {
    const d = data; if (!d) return;
    const out = [['sezione', 'chiave', 'spot'], ...Object.entries(d.cq).map(([k, v]) => ['CQ', k, v]), ...Object.entries(d.itu).map(([k, v]) => ['ITU', k, v]),
      ...Object.entries(d.band).map(([k, v]) => ['banda', k, v]), ...Object.entries(d.mode).map(([k, v]) => ['modo', k, v]), ...Object.entries(d.cont).map(([k, v]) => ['continente', k, v]),
      ...d.grid4.map(([k, v]) => ['quadrante', k, v]), ...d.dxcc.map(([k, , v]) => ['DXCC', k, v]), ...d.topDx.map(([k, v]) => ['DX', k, v]), ...d.topDe.map(([k, v]) => ['spotter', k, v])];
    const txt = out.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv' })); a.download = `iq8do-statistiche-${S.side}-${S.days}d.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function shell() {
    root.innerHTML = `<div class="ana-head"><h2 id="anaTitle"></h2><button type="button" id="anaClose" class="ico" aria-label="Chiudi">✕</button></div>
      <div class="ana-ctl"><div class="chips" id="anaPeriod">${[1, 7, 30, 90, 365, 0].map((p) => `<button type="button" data-k="${p}">${tr('p' + p)}</button>`).join('')}</div>
        <div class="chips" id="anaSide"><button type="button" data-k="dx">${tr('sdx')}</button><button type="button" data-k="de">${tr('sde')}</button></div></div>
      <div class="ana-fil" id="anaFilters"></div>
      <section class="acard wide anavis"><h3>${tr('visT')}</h3><div id="anaVis"></div></section>
      <div id="anaBody" class="ana-body"><p class="hint">${tr('loading')}</p></div>`;
    $('#anaTitle').textContent = '📈 ' + tr('title');
    if (lastOnline) $('#anaVis').innerHTML = visHtml(lastOnline);
  }
  function applyStatic() { const h = $('#visT'); if (h) h.textContent = tr('visT'); const b = $('#onlBadge'); if (b && lastOnline) b.title = `${lastOnline.online} ${tr('badge')}`; const bt = $('#btnAna'); if (bt) bt.title = tr('t_ana'); const tb = $('#tabAnaTxt'); if (tb) tb.textContent = tr('t_ana'); }

  function open() {
    openFlag = true; document.body.classList.add('ana-open'); root.hidden = false; shell(); load(); loadVisitors(); ping(); root.scrollTop = 0;
  }
  function close() { openFlag = false; document.body.classList.remove('ana-open'); root.hidden = true; const l = $('#layout'); $$('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === l.dataset.tab)); }

  root.addEventListener('click', (e) => {
    const t0 = e.target;
    if (t0.closest('#anaClose')) return close();
    if (t0.closest('#anaCsv')) return csv();
    const more = t0.closest('[data-more]'); if (more) { if (more.dataset.more === 'sq') showMoreSq = !showMoreSq; else showMoreDx = !showMoreDx; return render(); }
    const per = t0.closest('#anaPeriod button'); if (per) { S.days = Number(per.dataset.k); store.set('anaDays', S.days); return load(); }
    const sd = t0.closest('#anaSide button'); if (sd) { S.side = sd.dataset.k; store.set('anaSide', S.side); return load(); }
    const clr = t0.closest('[data-clear]');
    if (clr) { if (clr.dataset.clear === '*') Object.assign(S, { band: '', mode: '', cont: '', cq: '', itu: '', grid2: '' }); else S[clr.dataset.clear] = ''; return load(); }
    const f = t0.closest('[data-f]'); if (f && f.dataset.f) { const k = f.dataset.f, v = f.dataset.k; S[k] = S[k] === v ? '' : v; load(); }
  });
  root.addEventListener('change', (e) => { if (e.target.id === 'anaExact') { S.exact = e.target.checked; load(); } });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && openFlag && !document.querySelector('dialog[open]')) close(); });
  document.addEventListener('iq8do:state', () => { applyStatic(); if (openFlag) { shell(); if (data) render(); } else { const el = $('#visitors'); if (el && lastOnline) el.innerHTML = visHtml(lastOnline); } });

  // avvio: battito ogni 30 s (solo se la pagina è visibile) e numeri live
  applyStatic(); ping(); loadVisitors();
  setInterval(() => { ping(); if (visibleNow()) loadVisitors(); }, 30000);
  setInterval(() => { if (openFlag && document.visibilityState !== 'hidden') load(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { ping(); if (visibleNow()) loadVisitors(); } });
  return { open, close, isOpen: () => openFlag, ping };
}
