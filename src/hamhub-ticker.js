// Barra ADXO (DXpedition annunciate) per la home di hamhub.cloud.
// Riusa il modulo del cluster; la pagina viene letta dal server del cluster tramite /cluster-api/.
import { initTicker } from './ticker.js';
import { I18N } from './i18n.js';

const t = (k) => (I18N.it)[k] ?? k;
const callUrl = (c) => 'https://www.qrz.com/db/' + encodeURIComponent(c);

/** Monta la barra dentro il contenitore indicato: la barra ha id "ticker", come nel cluster. */
let extraNews = [];
function mount(container) {
  if (!container || container.dataset.mounted) return;
  container.dataset.mounted = '1';
  container.innerHTML = '<footer class="ticker" id="ticker" aria-label="DXpedition annunciate (NG3K ADXO)"></footer>';
  initTicker({ getLang: () => 'it', getConfirmedOnly: () => false, t, callUrl, source: 'cluster/adxo.html', extra: () => extraNews });
  // notizie del bollettino 425 DX News, mostrate prima delle DXpedition ADXO
  fetch('/data/news425.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).then((list) => {
    extraNews = list; document.dispatchEvent(new Event('iq8do:state'));
  }).catch(() => { /* senza notizie resta la sola ADXO */ });
}

window.HamTicker = { mount };
