// Converte cty.dat (country-files.com, uso libero) in un JSON compatto per il browser.
// Uso: node tools/build-cty.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const raw = readFileSync(new URL('./cty.dat', import.meta.url), 'utf8').replace(/\r/g, '');
const blocks = raw.split(';\n').map((b) => b.trim()).filter(Boolean);

const entities = []; // [nome, cq, itu, continente, lat, lon, prefissoPrimario]
const prefixes = {}; // prefisso -> indice entita'
const exact = {};    // nominativo esatto -> indice entita'

for (const b of blocks) {
  const nl = b.indexOf('\n');
  const head = b.slice(0, nl).split(':').map((x) => x.trim());
  if (head.length < 8) continue;
  const [name, cq, itu, cont, lat, lon, , pfx] = head;
  const idx = entities.length;
  entities.push([name, Number(cq), Number(itu), cont, Number(lat), -Number(lon), pfx.replace('*', ''), pfx.startsWith('*') ? 1 : 0]); // ultimo campo: 1 = non e' un'entita' DXCC (solo WAE)
  const list = b.slice(nl + 1).replace(/\s+/g, '').split(',').filter(Boolean);
  for (let tok of list) {
    tok = tok.replace(/\([^)]*\)|\[[^\]]*\]|<[^>]*>|\{[^}]*\}|~[^~]*~/g, ''); // rimuove override CQ/ITU/lat-lon/continente/fuso
    if (!tok) continue;
    if (tok.startsWith('=')) exact[tok.slice(1)] = idx;
    else prefixes[tok] = idx;
  }
}
writeFileSync(new URL('../src/data/cty.json', import.meta.url), JSON.stringify({ e: entities, p: prefixes, x: exact }));
console.log(`entita': ${entities.length}, prefissi: ${Object.keys(prefixes).length}, nominativi esatti: ${Object.keys(exact).length}`);
