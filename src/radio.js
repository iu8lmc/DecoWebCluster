// Utilità radioamatoriali: bande, modi, prefissi → paese.

// ---- Bande (kHz) ---------------------------------------------------------
export const BANDS = [
  { id: '160', name: '160m', lo: 1800, hi: 2000, color: '#ff5d73', cw: 1843 },
  { id: '80', name: '80m', lo: 3500, hi: 4000, color: '#ff9a3c', cw: 3600 },
  { id: '60', name: '60m', lo: 5250, hi: 5450, color: '#ffd23f', cw: 5360 },
  { id: '40', name: '40m', lo: 7000, hi: 7300, color: '#c5e63a', cw: 7040 },
  { id: '30', name: '30m', lo: 10100, hi: 10150, color: '#5ee08a', cw: 10130 },
  { id: '20', name: '20m', lo: 14000, hi: 14350, color: '#22d3c5', cw: 14070 },
  { id: '17', name: '17m', lo: 18068, hi: 18168, color: '#38bdf8', cw: 18095 },
  { id: '15', name: '15m', lo: 21000, hi: 21450, color: '#6690ff', cw: 21070 },
  { id: '12', name: '12m', lo: 24890, hi: 24990, color: '#a78bfa', cw: 24915 },
  { id: '10', name: '10m', lo: 28000, hi: 29700, color: '#e879f9', cw: 28070 },
  { id: '6', name: '6m', lo: 50000, hi: 54000, color: '#f472b6', cw: 50100 },
  { id: 'VHF', name: 'VHF', lo: 70000, hi: 470000, color: '#94a3b8', cw: 0 },
  { id: 'SHF', name: 'SHF+', lo: 470000, hi: 1e9, color: '#64748b', cw: 0 },
];
export const bandOf = (khz) => BANDS.find((b) => khz >= b.lo && khz <= b.hi) || null;

// ---- Modi ----------------------------------------------------------------
const DIGI = [ // [modo, frequenze di ritrovo (kHz), tolleranza (kHz)]: gli spot riportano la frequenza del segnale, non del ricevitore
  ['FT8', [1840, 3573, 5357, 7074, 10136, 14074, 18100, 21074, 24915, 28074, 50313, 50323]],
  ['JS8', [3578, 7078, 10130, 14078, 21078, 24922, 28078], 1.2],
  ['FT4', [3575, 7047.5, 10140, 14080, 18104, 21140, 24919, 28180, 50318]],
  ['FT2', [7052, 14052, 21052, 28052]],
  ['WSPR', [1836.6, 3568.6, 5287.2, 7038.6, 10138.7, 14095.6, 21094.6, 24924.6, 28124.6, 50293.6], 1],
];
const KEYWORDS = [
  [/\bFT-?8\b/i, 'FT8'], [/\bFT-?4\b/i, 'FT4'], [/\bFT-?2\b/i, 'FT2'],
  [/\b(CW|QRS|QRQ|WPM)\b/i, 'CW'], [/\b(SSB|USB|LSB|PHONE)\b/i, 'SSB'],
  [/\bJS-?8(CALL)?\b/i, 'JS8'], [/\bWSPR\b/i, 'WSPR'], [/\bVARA\b/i, 'VARA'], [/\bRTTY\b/i, 'RTTY'], [/\bPSK\d*\b/i, 'PSK'], [/\bJT\d+\b/i, 'JT'],
  [/\b(MFSK|OLIVIA|SSTV|DIGI|PACKET|ROS|THOR|HELL)\b/i, 'DIGI'],
  [/\bFM\b/i, 'FM'], [/\bAM\b/i, 'AM'],
];
export function modeOf(khz, comment) {
  const c = comment || '';
  for (const [re, m] of KEYWORDS) if (re.test(c)) return m;
  for (const [m, list, tol] of DIGI) if (list.some((f) => Math.abs(f - khz) <= (tol || 2.5))) return m;
  const b = bandOf(khz);
  if (!b) return 'SSB';
  if (b.id === 'VHF' || b.id === 'SHF') return 'FM';
  // Sotto il segmento CW della banda → CW; sopra → fonia.
  const cwTop = { 160: 1840, 80: 3570, 60: 5354, 40: 7040, 30: 10150, 20: 14100, 17: 18109, 15: 21150, 12: 24930, 10: 28225, 6: 50100 }[b.id];
  return khz < cwTop ? 'CW' : 'SSB';
}
export const MODE_GROUP = { CW: 'CW', SSB: 'PHONE', FM: 'PHONE', AM: 'PHONE', FT8: 'DIGI', FT4: 'DIGI', FT2: 'DIGI', RTTY: 'DIGI', PSK: 'DIGI', JT: 'DIGI', WSPR: 'DIGI', JS8: 'DIGI', VARA: 'DIGI', DIGI: 'DIGI' };
/** Modi digitali distinti (chiave, etichetta): il resto finisce in 'DIGI' (altri). */
export const DIGI_MODES = [['FT8', 'FT8'], ['FT4', 'FT4'], ['FT2', 'FT2'], ['RTTY', 'RTTY'], ['PSK', 'PSK'], ['JT', 'JT65/JT9'], ['WSPR', 'WSPR'], ['JS8', 'JS8Call'], ['VARA', 'VARA'], ['DIGI', '…']];

// ---- Prefissi ITU → ISO paese (prefisso più lungo vince) ------------------
const P = {};
const add = (iso, list) => list.split(/\s+/).forEach((p) => (P[p] = iso));
add('us', 'K N W AA AB AC AD AE AF AG AH AI AJ AK AL');
add('ca', 'VE VA VY VO CF CG CH CI CJ CK CY CZ');
add('mx', 'XE XF 4A 4B 4C 6D 6E 6F 6G 6H 6I 6J');
add('cu', 'CO CM CL T4'); add('do', 'HI'); add('ht', 'HH'); add('jm', '6Y'); add('pr', 'KP4 NP4 WP4');
add('cr', 'TI TE'); add('pa', 'HP HO H3 H8 H9'); add('gt', 'TG TD'); add('ni', 'YN HT H6 H7'); add('hn', 'HR HQ'); add('sv', 'YS HU'); add('bz', 'V3');
add('br', 'PY PP PQ PR PS PT PU PV PW PX ZV ZW ZX ZY ZZ'); add('ar', 'LU LO LP LQ LR LS LT LV LW AY AZ L2 L3 L4 L5 L6 L7 L8 L9');
add('cl', 'CE CA CB CC CD XQ XR 3G'); add('uy', 'CX CV CW'); add('co', 'HK HJ 5J 5K'); add('ve', 'YV YW YX YY 4M'); add('pe', 'OA OB OC 4T');
add('ec', 'HC HD'); add('bo', 'CP'); add('py', 'ZP'); add('tt', '9Y 9Z'); add('bb', '8P'); add('cw', 'PJ'); add('aw', 'P4');
add('de', 'DL DA DB DC DD DF DG DH DJ DK DM DN DO DP DQ DR Y2 Y3 Y4 Y5 Y6 Y7 Y8 Y9');
add('fr', 'F TM TK TP TQ TH TV TX'); add('gb', 'G M 2 GM GW GI GD GJ GU MM MW MI MD MJ MU 2E 2I 2M 2W 2D 2J 2U');
add('it', 'I IK IZ IU IW IQ IN IR IT IS IB IC ID IE IF IG IH IJ IL IM IO IP IV IX IY'); add('es', 'EA EB EC ED EE EF EG EH AM AN AO');
add('pt', 'CT CS CQ CR CU'); add('be', 'ON OO OP OQ OR OS OT'); add('nl', 'PA PB PC PD PE PF PG PH PI');
add('dk', 'OZ OU OV OW 5P 5Q'); add('se', 'SM SA SB SC SD SE SF SG SH SI SJ SK SL 7S 8S'); add('no', 'LA LB LC LD LE LF LG LH LI LJ LK LL LM LN JW JX');
add('fi', 'OH OF OG OI OJ'); add('pl', 'SP SN SO SQ SR 3Z HF'); add('cz', 'OK OL'); add('sk', 'OM'); add('hu', 'HA HG'); add('ro', 'YO YP YQ YR');
add('bg', 'LZ'); add('gr', 'SV SW SX SY SZ J4'); add('rs', 'YU YT YZ'); add('hr', '9A'); add('si', 'S5'); add('ba', 'E7'); add('mk', 'Z3'); add('me', '4O');
add('al', 'ZA'); add('at', 'OE'); add('ch', 'HB HE'); add('li', 'HB0'); add('lu', 'LX'); add('ie', 'EI EJ'); add('is', 'TF'); add('ee', 'ES'); add('lv', 'YL');
add('lt', 'LY'); add('ua', 'UR US UT UU UV UW UX UY UZ EM EN EO'); add('ru', 'R UA UB UC UD UE UF UG UH UI'); add('by', 'EW'); add('md', 'ER');
add('kz', 'UN UO UP UQ'); add('kg', 'EX'); add('tj', 'EY'); add('tm', 'EZ'); add('uz', 'UJ UK UL UM'); add('az', '4J 4K'); add('ge', '4L'); add('am', 'EK');
add('tr', 'TA TB TC YM'); add('cy', '5B C4 H2 P3'); add('il', '4X 4Z'); add('lb', 'OD'); add('jo', 'JY'); add('sa', 'HZ 7Z 8Z'); add('ae', 'A6'); add('qa', 'A7');
add('bh', 'A9'); add('kw', '9K'); add('om', 'A4'); add('ye', '7O'); add('iq', 'YI'); add('ir', 'EP EQ'); add('pk', 'AP 6P 6Q'); add('mt', '9H'); add('mc', '3A');
add('jp', 'JA JB JC JD JE JF JG JH JI JJ JK JL JM JN JO JP JQ JR JS 7J 7K 7L 7M 7N 8J 8K 8L 8M 8N'); add('kr', 'HL DS DT DU 6K 6L 6M 6N');
add('cn', 'B BA BD BG BH BI BJ BL BY 3H 3J 3K 3L 3M 3N 3O 3P 3Q 3R 3S 3T 3U'); add('tw', 'BM BN BO BP BQ BU BV BW BX'); add('hk', 'VR'); add('mo', 'XX');
add('th', 'HS E2'); add('vn', 'XV 3W'); add('kh', 'XU'); add('la', 'XW'); add('mm', 'XY XZ 1Z'); add('my', '9M 9W'); add('sg', '9V S6'); add('id', 'YB YC YD YE YF YG YH 7A 7B 7C 7D 7E 7F 7G 7H 7I 8A 8B 8C 8D 8E 8F 8G 8H 8I');
add('ph', 'DU DV DW DX DY DZ 4D 4E 4F 4G 4H 4I'); add('in', 'VU 8T 8U 8V 8W 8X 8Y AT AU AV AW'); add('lk', '4S 4R'); add('np', '9N'); add('bd', 'S2 S3'); add('bt', 'A5'); add('mv', '8Q'); add('mn', 'JT JU JV');
add('au', 'VK AX VH VI VJ VL VM VN'); add('nz', 'ZL ZM ZK ZN ZO'); add('fj', '3D2'); add('pg', 'P2'); add('nc', 'FK'); add('pf', 'FO'); add('to', 'A3'); add('ws', '5W'); add('ki', 'T3'); add('nr', 'C2'); add('pw', 'T8'); add('sb', 'H4'); add('vu', 'YJ');
add('za', 'ZS ZR ZT ZU'); add('ng', '5N 5O'); add('ke', '5Z 5Y'); add('tz', '5H 5I'); add('ug', '5X'); add('rw', '9X'); add('zm', '9J 9I'); add('mw', '7Q'); add('zw', 'Z2'); add('bw', 'A2'); add('na', 'V5'); add('mz', 'C9'); add('mg', '5R 5S 6X'); add('mu', '3B8');
add('sc', 'S7'); add('cv', 'D4'); add('ma', 'CN 5C 5D 5E 5F 5G'); add('dz', '7X 7T 7U 7V 7W 7Y'); add('tn', '3V TS'); add('ly', '5A'); add('eg', 'SU 6A 6B'); add('sd', 'ST 6T 6U'); add('et', 'ET 9E 9F'); add('dj', 'J2'); add('so', '6O T5');
add('ci', 'TU'); add('gh', '9G'); add('sn', '6V 6W'); add('ga', 'TR'); add('td', 'TT'); add('km', 'D6'); add('cm', 'TJ'); add('cd', '9O 9P 9Q 9R 9S 9T'); add('ao', 'D2 D3'); add('lr', 'EL 5L 5M A8 D5'); add('sl', '9L'); add('gm', 'C5'); add('bj', 'TY'); add('tg', '5V'); add('bf', 'XT'); add('ml', 'TZ'); add('mr', '5T'); add('ne', '5U'); add('gq', '3C'); add('st', 'S9'); add('er', 'E3'); add('ls', '7P'); add('sz', '3DA');
add('fo', 'OY'); add('gl', 'OX XP'); add('gp', 'FG'); add('mq', 'FM'); add('gf', 'FY'); add('re', 'FR'); add('yt', 'FH'); add('pm', 'FP');
add('ad', 'C3'); add('sm', 'T7'); add('va', 'HV'); add('gi', 'ZB ZG'); add('ai', 'VP2E'); add('cu', 'CO CM');

const KEYS = Object.keys(P);
const cache = new Map();
export function prefixToIso(call) {
  if (!call) return null;
  const c = call.toUpperCase().replace(/\/(P|M|MM|QRP|A|AM)$/, '');
  const parts = c.split('/');
  const base = parts.length > 1 ? (parts[0].length <= parts[1].length ? parts[0] : parts[1]) : c;
  if (cache.has(base)) return cache.get(base);
  let hit = null;
  for (let n = Math.min(4, base.length); n >= 1 && !hit; n--) hit = P[base.slice(0, n)] || null;
  cache.set(base, hit);
  return hit;
}
export { KEYS as _prefixKeys };
