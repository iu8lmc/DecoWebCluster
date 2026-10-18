import { geoMercator, geoAzimuthalEquidistant, geoOrthographic, geoPath, geoGraticule10, geoCircle, geoInterpolate, geoDistance, geoContains } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import world from './data/world.json';
import { createGL } from './glmap.js';
import { drawTiles, metersPerPixel, MAX_Z } from './tiles.js';
import { BEACONS, BEACON_BANDS, POS as BPOS, onAir } from './beacons.js';
import { zonesLoaded } from './zones.js';
import { dxpeditions } from './ticker.js';
import { ENTITIES } from './dxcc.js';
import { llToLocator, bearing, destination, paths, zoneAt, sunAlt, loadZonePolys } from './geo.js';
import { where as satWhere } from './sat.js';
import { moon as moonAt } from './moon.js';
import * as MyLog from './mylog.js';
import { BANDS } from './radio.js';

const DEG = Math.PI / 180;

const land = feature(world, world.objects.countries);
const coast = mesh(world, world.objects.countries, (a, b) => a === b);
const borders = mesh(world, world.objects.countries, (a, b) => a !== b);
const sphere = { type: 'Sphere' };
const graticule = geoGraticule10();
function sunPos(ms) {
  const rad = DEG, n = ms / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, eps = (23.439 - 4e-7 * n) * rad;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam)), ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  return [((ra / rad - gmst + 540) % 360) - 180, dec / rad];
}

/**
 * Mappa del cluster (proiezioni piana, azimutale e globo, WebGL).
 * Riceve dall'app solo valori e funzioni: nessuno stato condiviso è letto direttamente.
 */
export function createMap(o) {
  const { cfg, spots, F, HOME, store, t, esc, centroid, NEEDCOL, bestNeed, ago, callUrl, callbookName, select, visible, toastText, $, $$, getSelected, getHeard, getSats, getQuakes } = o;
return (() => {
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
      const isSel = s.id === getSelected();
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
    const sel = getSelected() && spots.get(getSelected());
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
    for (const r of getHeard()) {
      if (r.t < lim || (F.bands.size && !F.bands.has(r.band.id)) || !vis(r.ll)) continue;
      const col = r.band.color, p = proj(r.ll); if (!p) continue;
      ctx.save(); ctx.beginPath(); poly(HOME, r.ll); ctx.strokeStyle = col; ctx.globalAlpha = Math.max(0.28, Math.min(0.9, 0.5 + (r.snr + 20) / 70)); ctx.lineWidth = 1.3; ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.arc(p[0], p[1], 3.8, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      markers.push({ p, rad: 5, iso: 'heard', heard: r });
    }
  }
  /** Terremoti delle ultime 24 ore: cerchio proporzionale alla magnitudo, onda per quelli dell'ultima ora. */
  function drawQuakes(now) {
    for (const q of getQuakes()) {
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
    for (const s of getSats()) {
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
  if (GL.ok) GL.loadEarth(o.earth || 'icons/earth.webp');
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
}
