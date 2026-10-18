// Widget incorporabile (iframe) per aricaserta.it: mappa piccola con gli ultimi spot + elenco. Nessun dato personale.
import { geoEquirectangular, geoPath, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';
import world from './data/world.json';
import countries from './data/countries.json';
import { bandOf, modeOf, prefixToIso } from './radio.js';

const HOME = [14.33, 41.07];
const OVERRIDE = { ru: [45, 56], ca: [-95, 53], us: [-97, 39], au: [134, -26], cn: [104, 34], kz: [67, 48], no: [10, 61], se: [16, 61], fi: [26, 63] };
const cent = (iso) => OVERRIDE[iso] || countries[iso]?.ll || null;
const land = feature(world, world.objects.countries);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cs = getComputedStyle(document.documentElement);
const css = (k) => cs.getPropertyValue(k).trim();
const cv = $('#m'), ctx = cv.getContext('2d');
let spots = [], W = 0, H = 0;

function draw() {
  const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
  W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const proj = geoEquirectangular().fitExtent([[2, 2], [W - 2, H - 2]], { type: 'Sphere' });
  const path = geoPath(proj, ctx);
  ctx.fillStyle = css('--sea'); ctx.fillRect(0, 0, W, H);
  ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = css('--grid'); ctx.lineWidth = 0.5; ctx.stroke();
  ctx.beginPath(); path(land); ctx.fillStyle = css('--land'); ctx.fill(); ctx.strokeStyle = css('--edge'); ctx.lineWidth = 0.4; ctx.stroke();
  const h = proj(HOME), now = Date.now();
  for (const s of spots.slice(0, 40)) {
    if (!s.ll || !s.band || now - s.t > 30 * 60e3) continue;
    const p = proj(s.ll);
    ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.lineTo(p[0], p[1]); ctx.strokeStyle = s.band.color; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fillStyle = s.band.color; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(h[0], h[1], 4.5, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = css('--acc'); ctx.lineWidth = 2; ctx.stroke();
}

const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60e3); return m < 1 ? 'ora' : m < 60 ? m + ' min' : Math.round(m / 60) + ' h'; };
function list() {
  $('#l').innerHTML = spots.slice(0, 8).map((s) => `<a href="https://www.qrz.com/db/${encodeURIComponent(s.dx)}" target="_blank" rel="noopener"><i style="background:${s.band ? s.band.color : '#888'}"></i><b>${esc(s.dx)}</b><span>${(s.f / 1000).toFixed(3)} · ${esc(s.mode)}</span><em>${ago(s.t)}</em></a>`).join('');
}
async function load() {
  try {
    const rows = await (await fetch('spotlist', { cache: 'no-store' })).json();
    spots = rows.map((r) => {
      const f = Number(r.freq), iso = (r.iso || '').toLowerCase();
      return { dx: r.dx, f, band: bandOf(f), mode: modeOf(f, r.comm), t: r.time * 1000, ll: cent(iso) };
    }).sort((a, b) => b.t - a.t);
    $('#n').textContent = spots.filter((s) => Date.now() - s.t < 30 * 60e3).length;
    list(); draw();
  } catch { $('#l').textContent = 'Cluster non raggiungibile'; }
}
new ResizeObserver(draw).observe(cv);
load(); setInterval(load, 30e3); setInterval(list, 30e3);
