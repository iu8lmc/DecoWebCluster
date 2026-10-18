// Server di sviluppo: serve dist/ e inoltra /spotlist e /plot_* al cluster reale (stessa origine, niente CORS).
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const TARGET = process.env.TARGET || 'http://iq8do.aricaserta.it';
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (/^\/(spotlist|plot_get_)/.test(u.pathname)) {
    try {
      const r = await fetch(TARGET + u.pathname + u.search);
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch { res.writeHead(502); res.end('proxy error'); }
    return;
  }
  if (u.pathname.startsWith('/api/')) { // prova: inoltra al servizio area personale locale (porta 18093)
    const chunks = []; for await (const c of req) chunks.push(c);
    try {
      const r = await fetch('http://127.0.0.1:18093' + req.url, { method: req.method, headers: { 'Content-Type': req.headers['content-type'] || 'application/json', 'X-IQ8DO': req.headers['x-iq8do'] || '', 'X-IQ8DO-Enc': req.headers['x-iq8do-enc'] || '', Cookie: req.headers.cookie || '', Origin: req.headers.origin || '' }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const h = { 'Content-Type': r.headers.get('content-type') || 'application/json' }; const sc = r.headers.get('set-cookie'); if (sc) h['Set-Cookie'] = sc;
      res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
    } catch { res.writeHead(502); res.end('{}'); }
    return;
  }
  if (u.pathname === '/contests.rss') { // come nginx: inoltra il calendario dei contest
    try { const r = await fetch('https://www.contestcalendar.com/calendar.rss', { headers: { 'User-Agent': 'IQ8DO-DXCluster/2 dev' } }); res.writeHead(r.status, { 'Content-Type': 'application/rss+xml' }); res.end(Buffer.from(await r.arrayBuffer())); } catch { res.writeHead(502); res.end(); }
    return;
  }
  if (u.pathname === '/skimlist') { // prova: elenco finto come quello del raccoglitore
    const now = Math.floor(Date.now() / 1000), rows = [['DL9GTB', 'YO3FBD', 18100, 'FT8 -11 dB', 3], ['F6KGL', 'TM47CDXC', 14022, 'CW 17 dB 24 WPM', 5], ['EI4HQ', 'A61Q', 21012, 'CW 9 dB', 2], ['LB9KJ', 'JH1RGG', 21074, 'FT8 -17 dB', 1]];
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(rows.map((r, i) => ({ rowid: 1790000000000 + i, de: r[0], dx: r[1], freq: r[2], time: now - i * 40, comm: r[3] + ' · ' + r[4] + ' skimmer', skim: 1, n: r[4] })))); return;
  }
  if (u.pathname === '/pskr') { // come farà nginx: inoltra PSK Reporter (s = secondi indietro, solo per le prove)
    const call = u.searchParams.get('call') || '', s = /^-\d+$/.test(u.searchParams.get('s') || '') ? u.searchParams.get('s') : '-3600';
    if (!/^[A-Za-z0-9]{1,3}[0-9][A-Za-z0-9/]{1,8}$/.test(call)) { res.writeHead(400); res.end('bad call'); return; }
    if (process.env.PSK_MOCK) { // dati finti per provare l'interfaccia senza interrogare PSK Reporter
      const rx = [['IK8ABC', 'JN70'], ['DL1XYZ', 'JO62'], ['G4ABC', 'IO91'], ['W1AW', 'FN31pr'], ['K6XX', 'CM87'], ['VK2ABC', 'QF56'], ['JA1XYZ', 'PM95'], ['PY2XX', 'GG66'], ['ZS6XX', 'KG46'], ['9K2XX', 'LL48'], ['UA0XX', 'PO60'], ['LU1XX', 'GF05'], ['OH2XX', 'KP20'], ['EA8XX', 'IL18']];
      const fr = [14074000, 7074000, 21074000, 10136000, 28074000, 18100000, 14074000, 21074000];
      const now = Math.floor(Date.now() / 1000);
      const items = rx.map(([c, l], i) => `<receptionReport receiverCallsign="${c}" receiverLocator="${l}" senderCallsign="${call}" senderLocator="JN71" frequency="${fr[i % fr.length]}" flowStartSeconds="${now - 60 * (i * 2 + 1)}" mode="FT8" sNR="${-20 + i * 2}"/>`).join('');
      res.writeHead(200, { 'Content-Type': 'text/xml' }); res.end(`<?xml version="1.0"?><receptionReports>${items}</receptionReports>`); return;
    }
    try { const r = await fetch(`https://retrieve.pskreporter.info/query?senderCallsign=${call}&flowStartSeconds=${s}&rronly=1&appcontact=${encodeURIComponent(process.env.PSK_CONTACT || "")}`); res.writeHead(r.status, { 'Content-Type': 'text/xml' }); res.end(Buffer.from(await r.arrayBuffer())); }
    catch { res.writeHead(502); res.end('proxy error'); } return;
  }
  if (u.pathname === '/adxo.html') { // come farà nginx sul server: inoltra la pagina NG3K
    try { const r = await fetch('https://www.ng3k.com/Misc/adxo.html'); res.writeHead(r.status, { 'Content-Type': 'text/html' }); res.end(Buffer.from(await r.arrayBuffer())); }
    catch { res.writeHead(502); res.end('proxy error'); } return;
  }
  let f = join('dist', decodeURIComponent(u.pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': T[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(f));
}).listen(8099, () => console.log('http://localhost:8099'));
