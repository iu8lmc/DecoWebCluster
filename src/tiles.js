// Immagini satellitari a zoom profondo (proiezione Web Mercator), come nella vista Globo di DecoClock:
// - livelli 0-8: NASA GIBS Blue Marble Next Generation (~600 m/px all'equatore)
// - livelli 9-15: Sentinel-2 cloudless 2016 di EOX (dettaglio vero 10 m)
// Le tessere sono JPEG 256x256, caricate dal browser dell'utente e tenute in una piccola cache in RAM.
export const MAX_Z = 15;
const SIZE = 256;
const MAX_CACHE = 420;
const MAX_INFLIGHT = 6;
const cache = new Map(); // "z/x/y" -> { img, state: 'loading'|'ok'|'fail', used, failedAt }
const queue = [];
let inflight = 0;

const urlOf = (z, x, y) => z <= 8
  ? `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`
  : `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${z}/${y}/${x}.jpg`;

function pump() {
  while (inflight < MAX_INFLIGHT && queue.length) {
    const key = queue.pop(); // le richieste più recenti (quelle visibili ora) per prime
    const e = cache.get(key); if (!e) continue;
    e.queued = false;
    if (e.state !== 'loading' || e.started) continue;
    if (performance.now() - e.used > 1500) continue; // non più visibile: si richiede se serve di nuovo
    e.started = true; inflight++;
    const [z, x, y] = key.split('/').map(Number);
    e.img.onload = () => { e.state = 'ok'; inflight--; pump(); };
    e.img.onerror = () => { e.state = 'fail'; e.failedAt = Date.now(); inflight--; pump(); };
    e.img.decoding = 'async';
    e.img.src = urlOf(z, x, y);
  }
}
function evict() {
  if (cache.size <= MAX_CACHE) return;
  const old = [...cache.entries()].filter(([, e]) => e.state !== 'loading').sort((a, b) => a[1].used - b[1].used);
  for (const [k] of old.slice(0, cache.size - MAX_CACHE + 40)) cache.delete(k);
}
function get(z, x, y, fetchIt) {
  const key = `${z}/${x}/${y}`;
  let e = cache.get(key);
  if (!e) {
    if (!fetchIt) return null;
    e = { img: new Image(), state: 'loading', used: performance.now(), queued: true };
    cache.set(key, e); queue.push(key); pump(); evict();
  } else if (e.state === 'fail' && fetchIt && Date.now() - e.failedAt > 30000) {
    e.state = 'loading'; e.started = false; e.img = new Image(); e.queued = true; e.used = performance.now(); queue.push(key); pump();
  } else if (fetchIt && e.state === 'loading' && !e.started && !e.queued) { e.queued = true; e.used = performance.now(); queue.push(key); pump(); }
  e.used = performance.now();
  return e.state === 'ok' ? e.img : null;
}

/** Scala del mondo in pixel CSS: 2π·k. Livello di zoom scelto perché una tessera sia ~256 pixel fisici. */
export function levelFor(worldCss, dpr) {
  return Math.max(0, Math.min(MAX_Z, Math.ceil(Math.log2((worldCss * dpr) / SIZE))));
}
/** Metri per pixel di una tessera a livello z e latitudine lat (gradi). */
export const metersPerPixel = (z, lat) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

/**
 * Disegna le tessere visibili. Il centro dello schermo (W/2, H/2) è (lon0 gradi, mercatore m0 radianti);
 * k = pixel CSS per radiante. Se una tessera manca si usa il livello più basso già caricato.
 * Ritorna { z, drawn, pending }.
 */
export function drawTiles(ctx, { W, H, k, lon0, m0, dpr, alpha }) {
  const worldCss = 2 * Math.PI * k;
  let z = levelFor(worldCss, dpr);
  const n = () => 2 ** z;
  // non più di ~90 tessere sullo schermo
  while (z > 0) {
    const tile = worldCss / n();
    if ((W / tile + 2) * (H / tile + 2) <= 90) break;
    z--;
  }
  const N = n(), tile = worldCss / N;
  // longitudine (radianti) ai bordi dello schermo
  const lonL = lon0 * Math.PI / 180 - (W / 2) / k, lonR = lon0 * Math.PI / 180 + (W / 2) / k;
  const mTop = m0 + (H / 2) / k, mBot = m0 - (H / 2) / k; // mercatore m = ln tan(pi/4 + lat/2)
  const yOf = (m) => (1 - m / Math.PI) / 2 * N; // indice tile (frazionario) dal mercatore
  const y0 = Math.max(0, Math.floor(yOf(mTop))), y1 = Math.min(N - 1, Math.floor(yOf(mBot)));
  const x0 = Math.floor(((lonL + Math.PI) / (2 * Math.PI)) * N), x1 = Math.floor(((lonR + Math.PI) / (2 * Math.PI)) * N);
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  let drawn = 0, pending = 0;
  for (let y = y0; y <= y1; y++) {
    const sy = H / 2 + k * (m0 - Math.PI * (1 - 2 * y / N)); // bordo superiore della tessera, pixel CSS
    for (let x = x0; x <= x1; x++) {
      const wx = ((x % N) + N) % N;
      const sx = W / 2 + k * ((x / N) * 2 * Math.PI - Math.PI - lon0 * Math.PI / 180);
      const img = get(z, wx, y, true);
      if (img) { ctx.drawImage(img, sx, sy, tile + 0.6, tile + 0.6); drawn++; continue; }
      pending++;
      // livello più basso già disponibile (fino a 5 livelli sopra)
      for (let d = 1; d <= 5 && z - d >= 0; d++) {
        const pimg = get(z - d, wx >> d, y >> d, d === 1);
        if (pimg) {
          const span = SIZE / 2 ** d, px = (wx % 2 ** d) * span, py = (y % 2 ** d) * span;
          ctx.drawImage(pimg, px, py, span, span, sx, sy, tile + 0.6, tile + 0.6);
          break;
        }
      }
    }
  }
  ctx.restore();
  return { z, drawn, pending };
}
