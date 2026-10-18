// Barra "Invia uno spot": per chi ha fatto l'accesso all'Area personale (e il cui nominativo è verificato dalla Sezione).
// Lo spot parte dal servizio account (/api/spot), che entra nel nodo come NOMINATIVO-9 e lo invia al cluster.
const L = {
  it: {
    title: 'Invia uno spot', login: 'Accedi per inviare uno spot', pending: 'Il tuo nominativo è in attesa di verifica da parte della Sezione: potrai inviare spot appena sarà verificato.',
    dx: 'DX (es. 3Y0J)', freq: 'kHz (es. 14074)', com: 'Commento (FT8 -10 dB, CW 599…)', send: 'Invia', sending: 'Invio…',
    ok: 'Spot inviato come', badDx: 'Controlla il nominativo DX.', badFreq: 'Controlla la frequenza (in kHz, es. 14074).', err: 'Invio non riuscito, riprova.',
    login401: 'Sessione scaduta: accedi di nuovo.', 'e403': 'Nominativo non ancora verificato dalla Sezione.', e429: 'Troppi spot inviati: riprova tra qualche minuto.', e409: 'Hai già inviato questo spot da poco.',
    e502: 'Il nodo del cluster non risponde, riprova tra poco.', hint: 'Lo spot esce come',
  },
  en: {
    title: 'Send a spot', login: 'Log in to send a spot', pending: 'Your callsign is waiting to be verified by the Section: you will be able to send spots as soon as it is.',
    dx: 'DX (e.g. 3Y0J)', freq: 'kHz (e.g. 14074)', com: 'Comment (FT8 -10 dB, CW 599…)', send: 'Send', sending: 'Sending…',
    ok: 'Spot sent as', badDx: 'Check the DX callsign.', badFreq: 'Check the frequency (in kHz, e.g. 14074).', err: 'Could not send, please retry.',
    login401: 'Session expired: please log in again.', 'e403': 'Callsign not yet verified by the Section.', e429: 'Too many spots sent: try again in a few minutes.', e409: 'You already sent this spot a moment ago.',
    e502: 'The cluster node is not answering, retry shortly.', hint: 'The spot goes out as',
  },
};

export function initSpotBar({ $, getLang, getAcct, onSent }) {
  const bar = $('#spotbar'); if (!bar) return;
  const tr = (k) => (L[getLang()] || L.it)[k] ?? L.it[k] ?? k;
  const phone = () => matchMedia('(max-width: 760px)').matches;
  let state = '';
  const say = (txt, bad) => { const m = $('#sbMsg'); m.textContent = txt; m.className = bad ? 'bad' : 'ok'; };

  function sync() {
    const me = getAcct()?.me, st = !me ? 'out' : me.approved || me.admin ? 'ok' : 'pending';
    const open = bar.classList.contains('open');
    if (st === state && bar.dataset.lang === getLang() && bar.dataset.open === String(open)) return;
    state = st; bar.dataset.lang = getLang(); bar.dataset.open = String(open);
    bar.hidden = false;
    bar.dataset.state = st;
    $('#sbToggle').textContent = (st === 'out' ? '📡 ' + tr('login') : '📡 ' + tr('title')) + (st === 'ok' ? (open ? ' ▴' : ' ▾') : '');
    $('#sbDx').placeholder = tr('dx'); $('#sbFreq').placeholder = tr('freq'); $('#sbCom').placeholder = tr('com'); $('#sbSend').textContent = tr('send');
    ['#sbDx', '#sbFreq', '#sbCom', '#sbSend'].forEach((q) => { $(q).disabled = st !== 'ok'; });
    $('#sbInfo').textContent = st === 'pending' ? tr('pending') : st === 'ok' ? `${tr('hint')} ${me.call}-9` : '';
    if (st === 'pending' && !phone()) bar.classList.add('open');
  }

  $('#sbToggle').addEventListener('click', () => {
    if (state === 'out') { $('#btnAccount').click(); return; }
    bar.classList.toggle('open'); sync();
    if (bar.classList.contains('open') && state === 'ok') $('#sbDx').focus();
  });

  bar.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state !== 'ok') return;
    const dx = $('#sbDx').value.trim().toUpperCase(), freq = $('#sbFreq').value.trim().replace(',', '.'), comment = $('#sbCom').value.trim();
    if (!/^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,6}(\/[A-Z0-9]{1,4}){0,2}$/.test(dx)) { say(tr('badDx'), true); $('#sbDx').focus(); return; }
    if (!/^\d{1,7}(\.\d{1,3})?$/.test(freq) || Number(freq) < 0.1) { say(tr('badFreq'), true); $('#sbFreq').focus(); return; }
    const btn = $('#sbSend'); btn.disabled = true; btn.textContent = tr('sending'); say('');
    try {
      const r = await fetch('api/spot', { method: 'POST', headers: { 'X-IQ8DO': '1', 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ dx, freq, comment }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        say(`✓ ${tr('ok')} ${j.spotter}`, false);
        $('#sbDx').value = ''; $('#sbFreq').value = ''; $('#sbCom').value = '';
        if (onSent) onSent();
      } else if (r.status === 401) say(tr('login401'), true);
      else if ([403, 409, 429, 502].includes(r.status)) say(tr('e' + r.status), true);
      else say(j.error ? j.error.charAt(0).toUpperCase() + j.error.slice(1) + '.' : tr('err'), true);
    } catch { say(tr('err'), true); }
    btn.disabled = false; btn.textContent = tr('send');
  });

  if (!phone()) bar.classList.add('open');
  sync();
  setInterval(sync, 2500);
  document.addEventListener('iq8do:state', sync);
}
