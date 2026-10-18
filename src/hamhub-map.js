// Punto di ingresso per la dashboard di hamhub.cloud: monta la mappa del cluster
// (stessa grafica di /cluster/) alimentandola con gli spot di /cluster-api/spotlist.
import { createMap } from './mapview.js';
import { bandOf, modeOf, MODE_GROUP, prefixToIso } from './radio.js';
import { resolve as resolveEnt } from './dxcc.js';
import countries from './data/countries.json';
import { I18N } from './i18n.js';

const HOME = [14.33, 41.07]; // QTH: IQ8DO, Caserta
const POLL_S = 60;
const API = '/cluster-api/';

// Opzioni della mappa: solo gli strati principali, come nella vista di default del cluster
const cfg = {
  proj: 'flat', theme: 'dark', night: true, aurora: false, itu: false, cq: false, beacons: false,
  dxped: false, heard: false, quakes: false, sats: false, moon: false, arcs: true, tiles: false,
  wide: false, lang: 'it', confirmedOnly: false, callbook: 'qrz',
};
const spots = new Map();
const F = { bands: new Set() };
const store = { get: (k, d) => d, set() {} };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const t = (k) => (I18N[cfg.lang] || I18N.it)[k] ?? I18N.it[k] ?? k;
const centroid = (iso) => countries[iso]?.ll || null;
const NEEDCOL = {};
const bestNeed = () => null;
const ago = (ts) => { const m = Math.round((Date.now() - ts) / 60000); return m < 60 ? m + ' min' : Math.round(m / 60) + ' h'; };
const callUrl = (c) => 'https://www.qrz.com/db/' + encodeURIComponent(c);
const callbookName = () => 'QRZ';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const visible = () => [...spots.values()].sort((a, b) => b.t - a.t);

let selectedId = null;
let map = null;
let first = true;

function enrich(r) {
  const f = Number(r.freq);
  const band = bandOf(f);
  const mode = modeOf(f, r.comm);
  return {
    id: r.rowid, de: r.de, dx: r.dx, f, band, mode, grp: MODE_GROUP[mode] || 'PHONE', comm: r.comm || '',
    t: r.time * 1000, iso: (r.iso || '').toLowerCase(), country: r.country || '', deIso: prefixToIso(r.de),
    born: 0, ent: resolveEnt(r.dx), skim: false, nsk: 0, smode: '',
  };
}

async function poll() {
  try {
    const res = await fetch(API + 'spotlist', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const list = await res.json();
    for (const r of list.slice().reverse()) {
      if (spots.has(r.rowid)) continue;
      const s = enrich(r);
      if (!first) s.born = performance.now();
      spots.set(s.id, s);
    }
    const limit = Date.now() - 3 * 3600e3;
    for (const [id, s] of spots) if (s.t < limit || spots.size > 500) spots.delete(id);
    first = false;
    if (map) map.touch();
    window.dispatchEvent(new CustomEvent('hamhub-map-spots', { detail: { count: spots.size } }));
  } catch { /* riprova al prossimo giro */ }
  setTimeout(poll, POLL_S * 1000);
}

/** Monta la mappa dentro il contenitore indicato (una sola volta). */
function mount(container) {
  if (map || !container) return;
  container.innerHTML = '<div class="hm-wrap">'
    + '<canvas id="mapgl" aria-hidden="true"></canvas><canvas id="map" aria-label="Mappa mondiale degli spot"></canvas>'
    + '<div class="tip" id="tip" hidden></div><div class="zoomhud" id="zoomhud" hidden></div><div id="tileAttrib"></div>'
    + '<div class="map-tools"><div class="seg" id="projSeg" role="group" aria-label="Vista">'
    + '<button type="button" data-proj="flat">Piana</button><button type="button" data-proj="azim">Azimutale</button><button type="button" data-proj="globe">Globo</button>'
    + '</div><button type="button" id="btnReset" class="hm-reset" title="Vista iniziale">⌂</button></div>'
    + '</div>';
  map = createMap({
    cfg, spots, F, HOME, store, t, esc, centroid, NEEDCOL, bestNeed, ago, callUrl, callbookName,
    select: (id) => { selectedId = selectedId === id ? null : id; }, visible, toastText: () => {},
    $, $$, earth: 'map/icons/earth.webp',
    getSelected: () => selectedId, getHeard: () => [], getSats: () => [], getQuakes: () => [],
  });
  $$('#projSeg button').forEach((b) => b.addEventListener('click', () => map.setProj(b.dataset.proj)));
  poll();
}

// Colori dal tema: la mappa li legge da :root, quindi va chiamato dopo un cambio di tema
function theme() { if (map) { map.readColors(); map.touch(); } }

window.HamMap = { mount, theme };
