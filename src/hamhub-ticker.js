// Barra ADXO (DXpedition annunciate) per la home di hamhub.cloud.
// Riusa il modulo del cluster; la pagina viene letta dal server del cluster tramite /cluster-api/.
import { initTicker } from './ticker.js';
import { I18N } from './i18n.js';

const t = (k) => (I18N.it)[k] ?? k;
const callUrl = (c) => 'https://www.qrz.com/db/' + encodeURIComponent(c);

/** Monta la barra dentro il contenitore indicato: la barra ha id "ticker", come nel cluster. */
function mount(container) {
  if (!container || container.dataset.mounted) return;
  container.dataset.mounted = '1';
  container.innerHTML = '<footer class="ticker" id="ticker" aria-label="DXpedition annunciate (NG3K ADXO)"></footer>';
  initTicker({ getLang: () => 'it', getConfirmedOnly: () => false, t, callUrl, source: 'cluster/adxo.html' });
}

window.HamTicker = { mount };
