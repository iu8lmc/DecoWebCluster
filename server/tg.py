#!/usr/bin/env python3
"""IQ8DO -> Telegram della Sezione: inoltra pochi avvisi utili al canale (via il sito aricaserta.it, firmato HMAC).

 * DXpedition nuove annunciate (da NG3K ADXO, la stessa pagina del ticker del cluster);
 * spot, fatti da persone, di una DXpedition in corso o di un nominativo della lista /etc/iq8do-tg.json ("watch");
 * tempeste geomagnetiche (K>=5) e brillamenti solari M5+/X (NOAA SWPC).
Con "enabled": false (predefinito) non invia nulla: scrive nel log cosa invierebbe (prova a secco).
Limiti: massimo `max_per_hour` messaggi all'ora, nessuna ripetizione dello stesso avviso."""
import hashlib, hmac, json, os, re, socket, threading, time, urllib.request
from collections import deque
from html.parser import HTMLParser

STATE = os.environ.get('STATE_DIRECTORY', '/var/lib/iq8do-tg')
CONF = os.environ.get('TG_CONF', '/etc/iq8do-tg.json')
SECRET = os.environ.get('MAIL_SECRET', '')
WP = os.environ.get('WP_TG_URL', 'https://www.aricaserta.it/wp-json/iq8do/v1/telegram')
ADXO = os.environ.get('ADXO_URL', 'https://iq8do.aricaserta.it/adxo.html')
NODE = ('127.0.0.1', 7300)
CALL = b'IQ8DO-7'
SITE = 'https://iq8do.aricaserta.it/'
MONTHS = {m: i + 1 for i, m in enumerate('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split())}

lock = threading.Lock()
sent_times = deque()
dedupe = {}                 # chiave -> ultimo invio
seen_ops = set()
active_calls = {}           # nominativo DXpedition in corso -> info
seeded = False


def log(*a):
    msg = ' '.join(str(x) for x in (time.strftime('%H:%M:%S'),) + a)
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        print(msg.encode('ascii', 'replace').decode(), flush=True)


def conf():
    base = {'enabled': False, 'watch': [], 'max_per_hour': 12}
    try:
        base.update(json.load(open(CONF)))
    except (OSError, ValueError):
        pass
    return base


def send(text, key):
    """Invia (o simula) un avviso, rispettando limiti e deduplica. Ritorna True se inviato/simulato."""
    c = conf()
    now = time.time()
    with lock:
        if key in dedupe and now - dedupe[key] < 6 * 3600:
            return False
        while sent_times and now - sent_times[0] > 3600:
            sent_times.popleft()
        if len(sent_times) >= int(c['max_per_hour']):
            log('limite orario raggiunto, scartato:', text[:60])
            return False
        dedupe[key] = now
        sent_times.append(now)
        if len(dedupe) > 5000:
            for k in [k for k, v in dedupe.items() if now - v > 86400]:
                del dedupe[k]
    if not c['enabled']:
        log('[PROVA A SECCO] invierei:', text.replace('\n', ' | '))
        return True
    if not SECRET:
        log('MAIL_SECRET mancante: non posso firmare')
        return False
    body = json.dumps({'text': text}, ensure_ascii=False)
    ts = str(int(now))
    sig = hmac.new(SECRET.encode(), (ts + '\n' + body).encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(WP, data=body.encode('utf-8'), method='POST',
                                 headers={'Content-Type': 'application/json', 'X-IQ8DO-Ts': ts, 'X-IQ8DO-Sig': sig, 'User-Agent': 'IQ8DO-tg/1'})
    try:
        urllib.request.urlopen(req, timeout=25).read()
        log('inviato:', text.replace('\n', ' | ')[:100])
        return True
    except Exception as e:
        log('invio fallito:', repr(e)[:160])
        return False


# ---- DXpedition (NG3K ADXO) ---------------------------------------------------------------------------------
class AdxoParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ops, self.row, self.cur = [], None, None

    def handle_starttag(self, tag, attrs):
        cls = (dict(attrs).get('class') or '').split()
        if tag == 'tr' and 'adxoitem' in cls:
            self.row = {'dates': [], 'call': '', 'cty': '', 'qsl': '', 'info': ''}
        elif self.row is not None:
            for k in ('date', 'call', 'cty', 'qsl', 'info'):
                if k in cls:
                    self.cur = k
                    if k == 'date':
                        self.row['dates'].append('')
                    break

    def handle_endtag(self, tag):
        if tag == 'tr' and self.row is not None:
            if len(self.row['dates']) >= 2 and self.row['call']:
                self.ops.append(self.row)
            self.row, self.cur = None, None
        elif tag == 'td':
            self.cur = None

    def handle_data(self, data):
        if self.row is None or not self.cur:
            return
        if self.cur == 'date':
            self.row['dates'][-1] += data
        else:
            self.row[self.cur] += data


def parse_date(txt):
    m = re.search(r'(\d{4})\s+([A-Za-z]{3})(\d{1,2})', txt or '')
    if not m or m.group(2) not in MONTHS:
        return None
    return time.mktime((int(m.group(1)), MONTHS[m.group(2)], int(m.group(3)), 12, 0, 0, 0, 0, -1))


def adxo_loop():
    global seeded
    while True:
        try:
            html = urllib.request.urlopen(urllib.request.Request(ADXO, headers={'User-Agent': 'IQ8DO-tg/1'}), timeout=40).read().decode('utf-8', 'replace')
            p = AdxoParser(); p.feed(html)
            now = time.time(); act, fresh = {}, []
            for r in p.ops:
                s, e = parse_date(r['dates'][0]), parse_date(r['dates'][1])
                call = (r['call'].split() or [''])[0].upper()
                if not s or not e or not call:
                    continue
                key = '%s|%d' % (call, s)
                info = re.sub(r'\s+', ' ', r['info']).strip()
                if s - 86400 <= now <= e + 86400:
                    act[call] = {'cty': r['cty'].strip(), 'e': e}
                if key not in seen_ops:
                    seen_ops.add(key)
                    if seeded and e >= now and s - now < 75 * 86400:
                        fresh.append((call, r['cty'].strip(), s, e, re.sub(r'\s+', ' ', r['qsl']).strip(), info))
            active_calls.clear(); active_calls.update(act)
            if not seeded:
                log('ADXO: %d operazioni note, %d in corso (primo giro: nessun avviso)' % (len(seen_ops), len(act)))
                seeded = True
            for call, cty, s, e, qsl, info in fresh[:3]:
                d = lambda t: time.strftime('%d/%m', time.localtime(t))
                send('🆕 **DXpedition annunciata: %s** (%s)\n📅 %s → %s%s%s\nSegui gli spot: %s' % (
                    call, cty, d(s), d(e), ' · QSL ' + qsl if qsl else '', '\n' + info[:160] if info else '', SITE), 'new-' + call + str(int(s)))
        except Exception as ex:
            log('adxo:', repr(ex)[:160])
        time.sleep(600)


# ---- meteo spaziale (NOAA SWPC) ----------------------------------------------------------------------------
def noaa(path):
    return json.loads(urllib.request.urlopen(urllib.request.Request('https://services.swpc.noaa.gov/' + path, headers={'User-Agent': 'IQ8DO-tg/1'}), timeout=30).read())


def space_loop():
    while True:
        try:
            k = noaa('products/noaa-planetary-k-index.json')[-1]
            kp = float(k[1] if isinstance(k, list) else k['Kp'])
            if kp >= 5:
                send('🌐 **Tempesta geomagnetica K%d**: HF degradate alle alte latitudini, possibili aperture insolite e aurora. %s' % (int(kp), SITE),
                     'k-%s' % time.strftime('%Y%m%d%H', time.gmtime(int(time.time() // (3 * 3600) * 3 * 3600))))
        except Exception as ex:
            log('noaa K:', repr(ex)[:120])
        try:
            f = noaa('json/goes/primary/xray-flares-latest.json')
            f = f[0] if isinstance(f, list) else f
            cls = str(f.get('max_class') or f.get('current_class') or '')
            m = re.match(r'^([MX])(\d+(?:\.\d+)?)', cls)
            if m and (m.group(1) == 'X' or float(m.group(2)) >= 5):
                send('☀️ **Brillamento solare %s**: possibile blackout sulle HF del lato diurno. %s' % (cls, SITE), 'flare-' + str(f.get('max_time') or cls))
        except Exception as ex:
            log('noaa flare:', repr(ex)[:120])
        time.sleep(300)


# ---- spot di DXpedition in corso o nominativi controllati ----------------------------------------------------
LINE = re.compile(r'^DX de (\S+?):\s+([\d.]+)\s+(\S+)\s+(.*?)\s+(\d{4})Z')
BANDS = [(1800, 2000, '160m'), (3500, 4000, '80m'), (7000, 7300, '40m'), (10100, 10150, '30m'), (14000, 14350, '20m'), (18068, 18168, '17m'),
         (21000, 21450, '15m'), (24890, 24990, '12m'), (28000, 29700, '10m'), (50000, 54000, '6m'), (5250, 5450, '60m')]


def wild(p):
    return re.compile('^' + re.escape(p.strip().upper()).replace(r'\*', '.*') + '$')


def on_spot(line):
    m = LINE.match(line.strip())
    if not m:
        return
    de, freq, dx, comm, _ = m.groups()
    if de.endswith('-#'):
        return                                          # solo spot di persone
    dx = dx.upper()
    base = re.sub(r'/(P|M|QRP|MM|AM)$', '', dx)
    hit = base in active_calls
    why = 'DXpedition in corso' if hit else ''
    if not hit:
        for pat in conf().get('watch', []):
            if wild(pat).match(base):
                hit, why = True, 'in lista di controllo'
                break
    if not hit:
        return
    f = float(freq)
    band = next((n for lo, hi, n in BANDS if lo <= f <= hi), '')
    ent = active_calls.get(base, {}).get('cty', '')
    send('📡 **%s** spottato su %s kHz%s%s\nDa %s · %s\n%s' % (dx, freq, ' (%s)' % band if band else '', (' · ' + ent) if ent else '', de, comm[:60] or '—', SITE),
         'spot-%s-%s' % (base, band or freq))


def spot_loop():
    wait = 5
    while True:
        try:
            s = socket.create_connection(NODE, timeout=10)
            f = s.makefile('rb')
            buf = b''
            s.settimeout(20)
            while b'login' not in buf.lower():
                buf += s.recv(512)
            s.sendall(CALL + b'\r\n'); time.sleep(2)
            s.sendall(b'set/nobeep\r\nset/width 250\r\n')
            wait = 5
            s.settimeout(300)
            for line in f:
                on_spot(line.decode('latin1'))
        except Exception as ex:
            log('spot:', repr(ex)[:120])
        time.sleep(wait); wait = min(wait * 2, 120)


def main():
    os.makedirs(STATE, exist_ok=True)
    log('avvio, invio %s' % ('ATTIVO' if conf()['enabled'] else 'DISATTIVO (prova a secco)'))
    for fn in (adxo_loop, space_loop, spot_loop):
        threading.Thread(target=fn, daemon=True).start()
    while True:
        time.sleep(3600)


if __name__ == '__main__':
    main()
