// Beacon internazionali NCDXF/IARU: 18 stazioni, 5 bande, 10 secondi ciascuna in un ciclo di 3 minuti
// (ai minuti multipli di 3, UTC). Elenco, ordine e locator come in DecoClock (src/layers/beacons.rs, da ncdxf.org).

// nominativo, locator, luogo
export const BEACONS = [
  ['4U1UN', 'FN30as', 'ONU · New York'], ['VE8AT', 'CP38gh', 'Canada · Inuvik'], ['W6WX', 'CM97bd', 'USA · California'],
  ['KH6RS', 'BL10ts', 'Hawaii'], ['ZL6B', 'RE78tw', 'Nuova Zelanda'], ['VK6RBP', 'OF87av', 'Australia · Rolystone'],
  ['JA2IGY', 'PM84jk', 'Giappone'], ['RR9O', 'NO14kx', 'Russia · Novosibirsk'], ['VR2B', 'OL72bg', 'Hong Kong'],
  ['4S7B', 'MJ96wv', 'Sri Lanka'], ['ZS6DN', 'KG33xi', 'Sudafrica'], ['5Z4B', 'KI88hr', 'Kenya'],
  ['4X6TU', 'KM72jb', 'Israele'], ['OH2B', 'KP20eh', 'Finlandia'], ['CS3B', 'IM12jt', 'Madeira'],
  ['LU4AA', 'GF05tj', 'Argentina'], ['OA4B', 'FH17mw', 'Perù'], ['YV5B', 'FK60nd', 'Venezuela'],
];
// id banda dell'app, nome, frequenza kHz
export const BEACON_BANDS = [['20', '20m', 14100], ['17', '17m', 18110], ['15', '15m', 21150], ['12', '12m', 24930], ['10', '10m', 28200]];

/** Locator Maidenhead (6 caratteri) → [lon, lat] del centro del sottoquadrato. */
export function locator(loc) {
  const c = loc.toUpperCase().split('');
  const lon = -180 + (c[0].charCodeAt(0) - 65) * 20 + Number(c[2]) * 2 + (c[4].charCodeAt(0) - 65) / 12 + 1 / 24;
  const lat = -90 + (c[1].charCodeAt(0) - 65) * 10 + Number(c[3]) + (c[5].charCodeAt(0) - 65) / 24 + 1 / 48;
  return [lon, lat];
}
export const POS = BEACONS.map((b) => locator(b[1]));

/** Indice in BEACONS della stazione in onda sulla banda `band` (0..4) all'istante unix (secondi). */
export function onAir(unix, band) {
  const slot = Math.floor(((unix % 180) + 180) % 180 / 10);
  return (slot + BEACONS.length - (band % BEACON_BANDS.length)) % BEACONS.length;
}
/** Secondi che restano allo slot in corso. */
export const slotLeft = (unix) => 10 - (unix % 10);
