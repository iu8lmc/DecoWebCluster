// Risoluzione nominativo → entità DXCC, con i dati di cty.dat (country-files.com).
import cty from './data/cty.json';

export const ENTITIES = cty.e; // [nome, cq, itu, continente, lat, lon, prefissoPrimario, nonDxcc]
export const DXCC_TOTAL = ENTITIES.filter((e) => !e[7]).length;
const P = cty.p;
const X = cty.x;
const cache = new Map();

// Suffissi che non cambiano entità.
const NEUTRAL = /^(P|M|QRP|A|AM|B|LH|LT|R|T|J|K|X|MM|MOBILE|PORTABLE|\d)$/;

function base(call) {
  let c = call.toUpperCase().trim();
  if (!c) return null;
  const parts = c.split('/');
  if (parts.length === 1) return c;
  if (parts.some((p) => p === 'MM' || p === 'AM')) return null; // in mare/aereo: nessuna entità
  const kept = parts.filter((p, i) => !(i > 0 && NEUTRAL.test(p)));
  if (kept.length === 1) return kept[0];
  // due parti significative: il prefisso di solito è la parte più corta (EA8/IZ8XXE, IZ8XXE/EA8)
  const [a, b] = kept;
  return a.length <= b.length ? a : b;
}

/** Restituisce l'indice dell'entità (in ENTITIES) oppure -1. */
export function resolve(call) {
  if (!call) return -1;
  if (cache.has(call)) return cache.get(call);
  let r = -1;
  const c = base(call);
  if (c) {
    if (X[c] !== undefined) r = X[c];
    else {
      for (let n = Math.min(c.length, 7); n >= 1; n--) {
        const v = P[c.slice(0, n)];
        if (v !== undefined) { r = v; break; }
      }
    }
  }
  cache.set(call, r);
  return r;
}
export const isDxcc = (idx) => idx >= 0 && !ENTITIES[idx][7];
export const entName = (idx) => (idx >= 0 ? ENTITIES[idx][0] : '');
