// Prova da terminale: node tools/test-log.mjs percorso.adi  (confronta con il campo DXCC di Club Log)
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

await build({ entryPoints: ['src/mylog.js'], bundle: true, format: 'esm', platform: 'node', outfile: '.tmp-mylog.mjs', loader: { '.json': 'json' }, logLevel: 'silent' });
const L = await import(pathToFileURL(process.cwd() + '/.tmp-mylog.mjs').href);
const text = readFileSync(process.argv[2], 'utf8');
const t0 = Date.now();
const d = L.analyze(text, 'test.adi');
console.log(`QSO nel file: ${d.qsos}, usati: ${d.used}, scartati: ${d.skipped}, tempo: ${Date.now() - t0} ms`);
const recs = L.parseAdif(text);
const clubDxcc = new Set(recs.map((r) => r.dxcc).filter(Boolean));
console.log('entita\' distinte: nostre', Object.keys(d.w).length, '| confermate', Object.keys(d.c).length, '| DXCC del file (Club Log)', clubDxcc.size);

console.log('dimensione dati salvati:', JSON.stringify(d).length, 'byte');
// prova di stato
globalThis.localStorage = { getItem: () => JSON.stringify(d), setItem() {}, removeItem() {} };
L.load();
console.log('stats', JSON.stringify(L.stats()).slice(0, 300));
