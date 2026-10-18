// Newsticker delle DXpedition: scraping della pagina NG3K "Announced DX Operations" (ADXO).
// La pagina passa dal server del cluster (/adxo.html, con cache di 5 minuti) perché ng3k.com non
// consente la lettura da altri siti. Qui la si legge, si estraggono le righe della tabella e si
// mostrano le operazioni in corso e quelle in arrivo, aggiornando ogni 5 minuti.
import { resolve } from './dxcc.js';
import * as MyLog from './mylog.js';

const SOURCE = 'adxo.html';
const NG3K = 'https://www.ng3k.com/Misc/adxo.html';
const REFRESH_MS = 5 * 60e3;
const UPCOMING_DAYS = 45;
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function parseDate(txt) {
  const m = /(\d{4})\s+([A-Za-z]{3})(\d{1,2})/.exec(txt || '');
  if (!m || MONTHS[m[2]] === undefined) return null;
  return Date.UTC(Number(m[1]), MONTHS[m[2]], Number(m[3]));
}

/** Estrae le operazioni dalla pagina ADXO (tabella con righe tr.adxoitem). */
export function parseAdxo(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const ops = [];
  doc.querySelectorAll('tr.adxoitem').forEach((tr) => {
    const dates = tr.querySelectorAll('td.date');
    const start = parseDate(dates[0]?.textContent), end = parseDate(dates[1]?.textContent);
    const call = tr.querySelector('.call')?.textContent.trim();
    if (!start || !end || !call) return;
    ops.push({
      start, end, call,
      country: tr.querySelector('td.cty')?.textContent.trim() || '',
      qsl: tr.querySelector('td.qsl')?.textContent.trim() || '',
      info: (tr.querySelector('td.info')?.textContent || '').replace(/\s+/g, ' ').trim(),
    });
  });
  const upd = /Last updated:\s*([^<\n]+)/i.exec(doc.body ? doc.body.textContent : html);
  return { ops, updated: upd ? upd[1].trim() : '' };
}

let data = null; // ultimo elenco ADXO letto (condiviso con la mappa)
const UPCOMING_MS = UPCOMING_DAYS * 86400e3;

/** Operazioni in corso e in arrivo (entro 45 giorni), in corso per prime. */
function activeList() {
  if (!data) return [];
  const now = Date.now(), day = 86400e3;
  const active = data.ops.filter((o) => o.start <= now && now < o.end + day).sort((a, b) => a.end - b.end);
  const soon = data.ops.filter((o) => o.start > now && o.start - now <= UPCOMING_MS).sort((a, b) => a.start - b.start);
  return [...active.map((o) => ({ ...o, live: true })), ...soon.map((o) => ({ ...o, live: false }))];
}
/** Per la mappa: le operazioni con l'indice dell'entità DXCC (-1 se il nominativo non si risolve). */
export const dxpeditions = () => activeList().map((o) => ({ ...o, ent: resolve(o.call) }));

export function initTicker({ getLang, getConfirmedOnly, t, callUrl, source = SOURCE, extra = () => [] }) {
  const box = document.getElementById('ticker');
  if (!box) return;
  let lastKey = '', paused = false;

  const fmt = (ms) => new Date(ms).toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  const items = () => activeList().slice(0, 30);

  function html(list) {
    return list.map((o) => {
      const ent = resolve(o.call);
      const isNew = MyLog.hasLog() && ent >= 0 && MyLog.newEntity(ent, getConfirmedOnly());
      const when = o.live ? `${t('tkUntil')} ${fmt(o.end)}` : `${fmt(o.start)} → ${fmt(o.end)}`;
      const info = o.info.length > 90 ? o.info.slice(0, 87) + '…' : o.info;
      // il nominativo porta al callbook (solo se è un nominativo intero: "V4" o "FH" sono prefissi); il resto alla pagina NG3K
      const call = /\d/.test(o.call) && o.call.length > 3 ? `<a class="cs" href="${callUrl(o.call)}" target="_blank" rel="noopener">${esc(o.call)}</a>` : esc(o.call);
      return `<span class="tk-item ${o.live ? 'live' : ''}" title="${esc(o.info)}"><i class="tk-dot"></i><b>${call}</b> <a class="tk-more" href="${NG3K}" target="_blank" rel="noopener">${esc(o.country)}${isNew ? ` <u class="nb nb-dxcc">${t('need_dxcc')}</u>` : ''} <span>· ${when}${o.qsl ? ' · QSL ' + esc(o.qsl) : ''}${info ? ' · ' + esc(info) : ''}</span></a></span>`;
    }).join('');
  }

  function render() {
    const list = items();
    const xs = extra();
    if (!list.length && !xs.length) {
      box.innerHTML = `<span class="tk-label">DXN</span><span class="tk-empty">${data ? t('tkNone') : t('tkLoading')}</span>`;
      lastKey = '';
      return;
    }
    const exHtml = xs.map((x) => `<span class="tk-item"><i class="tk-dot"></i><b><a class="cs" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.text)}</a></b> <span>· ${esc(x.source)}</span></span>`).join('');
    const body = exHtml + html(list);
    const key = body + getLang();
    if (key === lastKey) return; // niente da cambiare: l'animazione non riparte
    lastKey = key;
    box.innerHTML = `<span class="tk-label" title="${esc(data ? data.updated : '')}">📡 DXN</span>
      <div class="tk-track"><div class="tk-move"><div class="tk-group">${body}</div><div class="tk-group" aria-hidden="true">${body}</div></div></div>
      <button class="tk-pause" type="button" aria-label="${t('tkPause')}" title="${t('tkPause')}">${paused ? '▶' : '⏸'}</button>`;
    const move = box.querySelector('.tk-move'), w = box.querySelector('.tk-group').scrollWidth;
    move.style.setProperty('--tk-dur', Math.max(30, w / 80) + 's'); // circa 80 px al secondo
    move.classList.toggle('paused', paused);
    box.querySelector('.tk-pause').addEventListener('click', (e) => {
      paused = !paused; move.classList.toggle('paused', paused); e.currentTarget.textContent = paused ? '▶' : '⏸';
    });
  }

  async function load() {
    try {
      const r = await fetch(source, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const html = new TextDecoder('iso-8859-1').decode(await r.arrayBuffer());
      const d = parseAdxo(html);
      if (d.ops.length) data = d;
    } catch { /* si tiene l'ultimo elenco buono */ }
    render();
  }

  document.addEventListener('iq8do:state', render);
  render(); load();
  setInterval(load, REFRESH_MS);
  setInterval(render, 60e3); // le operazioni cambiano stato a mezzanotte UTC
}
