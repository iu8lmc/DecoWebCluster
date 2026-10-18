// "Dove mi sentono": rapporti di ricezione di PSK Reporter per un nominativo (FT8, FT4, CW da skimmer, ecc.),
// in tempo reale dal feed MQTT pubblico (wss://mqtt.pskreporter.info:1886). Il feed non ha storico: i rapporti
// si accumulano finché la pagina resta aperta e si tengono gli ultimi 60 minuti.
import { locatorToLL, distanceKm } from './geo.js';
import { bandOf } from './radio.js';

const URL = 'wss://mqtt.pskreporter.info:1886';
const KEEP = 60 * 60e3;
const enc = new TextEncoder(), dec = new TextDecoder();

const str = (s) => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
const varLen = (n) => { const o = []; do { let d = n % 128; n = Math.floor(n / 128); if (n) d |= 128; o.push(d); } while (n); return o; };
const packet = (type, body) => new Uint8Array([type, ...varLen(body.length), ...body]);

/** Ascolta i rapporti per `call`; onChange(lista) a ogni novità. Ritorna { stop() }. Si riconnette da solo. */
export function watchHeard(call, home, onChange) {
  const best = new Map();
  let ws = null, ping = null, retry = null, stopped = false, wait = 3000, dirty = null;
  const list = () => [...best.values()].sort((a, b) => b.t - a.t);
  const push = () => { if (!dirty) dirty = setTimeout(() => { dirty = null; onChange(list()); }, 400); };

  const onReport = (j) => {
    const ll = locatorToLL(j.rl);
    const f = Number(j.f) / 1000; // Hz → kHz
    const band = bandOf(f);
    if (!ll || !band || String(j.sc || '').toUpperCase() !== call) return;
    const rep = { rx: j.rc, loc: j.rl, ll, f, band, mode: j.md || '', snr: Number(j.rp), t: Number(j.t) * 1000, km: Math.round(distanceKm(home, ll)) };
    const key = `${rep.rx}|${band.id}|${rep.mode}`;
    if (!best.has(key) || best.get(key).t < rep.t) { best.set(key, rep); push(); }
  };

  function connect() {
    if (stopped) return;
    try { ws = new WebSocket(URL, 'mqtt'); } catch { return again(); }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(packet(0x10, [0, 4, 77, 81, 84, 84, 4, 2, 0, 60, ...str('iq8do' + Math.random().toString(16).slice(2, 10))]));
    ws.onmessage = (e) => {
      const b = new Uint8Array(e.data), type = b[0] >> 4;
      if (type === 2) { // CONNACK → sottoscrizione ai rapporti di questo nominativo
        wait = 3000;
        ws.send(packet(0x82, [0, 1, ...str(`pskr/filter/v2/+/+/${call}/#`), 0]));
        ping = setInterval(() => { try { ws.send(new Uint8Array([0xc0, 0])); } catch { /* chiusa */ } }, 45e3);
      } else if (type === 3) { // PUBLISH (QoS 0): remaining length, topic, payload JSON
        let i = 1, mul = 1, len = 0, d;
        do { d = b[i++]; len += (d & 127) * mul; mul *= 128; } while (d & 128);
        const tl = (b[i] << 8) | b[i + 1];
        try { onReport(JSON.parse(dec.decode(b.subarray(i + 2 + tl, i + len)))); } catch { /* messaggio non valido */ }
      }
    };
    ws.onclose = () => { clearInterval(ping); again(); };
    ws.onerror = () => { try { ws.close(); } catch { /* già chiusa */ } };
  }
  function again() { if (stopped || retry) return; retry = setTimeout(() => { retry = null; connect(); }, wait); wait = Math.min(wait * 2, 60e3); }

  const prune = setInterval(() => { const lim = Date.now() - KEEP; let n = 0; for (const [k, r] of best) if (r.t < lim) { best.delete(k); n++; } if (n) push(); }, 60e3);
  connect();
  return { stop() { stopped = true; clearInterval(prune); clearInterval(ping); clearTimeout(retry); clearTimeout(dirty); try { ws && ws.close(); } catch { /* già chiusa */ } } };
}
