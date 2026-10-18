#!/usr/bin/env python3
"""Area personale degli OM per IQ8DO DX Cluster: registrazione, accesso con link via email (senza password), profilo, log ADIF.

Dati in SQLite (/var/lib/iq8do-accounts). Le email partono dal sito aricaserta.it (plugin "iq8do-mail-relay") con firma HMAC.
Ascolta solo su 127.0.0.1:8093; nginx inoltra /api/."""
import gzip, hashlib, hmac, json, os, re, secrets, socket, sqlite3, threading, time, urllib.request, zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.cookies import SimpleCookie
from urllib.parse import urlparse, parse_qs

STATE = os.environ.get('STATE_DIRECTORY', '/var/lib/iq8do-accounts')
DB = os.path.join(STATE, 'accounts.db')
SITE = os.environ.get('SITE', 'https://iq8do.aricaserta.it')
MAIL_URL = os.environ.get('MAIL_URL', 'https://www.aricaserta.it/wp-json/iq8do/v1/mail')
SECRET = os.environ.get('MAIL_SECRET', '')
DEBUG_LINKS = os.environ.get('DEBUG_LINKS_FILE', '')   # solo per le prove in locale
PORT = int(os.environ.get('PORT', '8093'))
COOKIE = 'iq8do_sid'
NODE = ('127.0.0.1', 7300)         # nodo DXSpider locale
SPOT_SSID = os.environ.get('SPOT_SSID', '9')   # gli spot dal web escono come NOMINATIVO-9
SPOTCALL = re.compile(r'^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,6}(/[A-Z0-9]{1,4}){0,2}$')
TOKEN_TTL = 20 * 60
SESSION_TTL = 30 * 86400
MAX_USERS = 5000
MAX_LOG = 40 * 1024 * 1024        # dimensione massima del log ADIF (non compresso)
MAX_GZ = 12 * 1024 * 1024         # dimensione massima del caricamento compresso
CALLRE = re.compile(r'^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,4}(/[A-Z0-9]{1,4})?$')
EMAILRE = re.compile(r'^[^@\s<>"\',;:]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$')
LOCRE = re.compile(r'^[A-Ra-r]{2}[0-9]{2}([A-Xa-x]{2})?$')

rate_lock = threading.Lock()
rate = {}          # chiave -> [timestamp]


def limited(key, n, per):
    """True se la chiave ha gia' superato n eventi negli ultimi `per` secondi (e registra l'evento altrimenti)."""
    now = time.time()
    with rate_lock:
        L = [t for t in rate.get(key, []) if now - t < per]
        if len(L) >= n:
            rate[key] = L
            return True
        L.append(now)
        rate[key] = L
        if len(rate) > 20000:
            for k in [k for k, v in rate.items() if not v or now - v[-1] > 7200]:
                del rate[k]
    return False


def db():
    c = sqlite3.connect(DB, timeout=15)
    c.row_factory = sqlite3.Row
    c.execute('pragma journal_mode=wal')
    c.execute('pragma foreign_keys=on')
    return c


def init_db():
    c = db()
    with c:
        c.executescript('''
        create table if not exists users(
          id integer primary key, call text unique not null, email text not null, email_lc text not null,
          name text default '', qth text default '', locator text default '', station text default '{}', settings text default '{}',
          email_ok integer default 0, approved integer default 0, is_admin integer default 0,
          consent_at integer, created integer, last_login integer);
        create index if not exists users_email on users(email_lc);
        create table if not exists tokens(hash text primary key, user_id integer not null references users(id) on delete cascade, exp integer, used integer default 0);
        create table if not exists sessions(hash text primary key, user_id integer not null references users(id) on delete cascade, exp integer, created integer);
        create table if not exists logs(user_id integer primary key references users(id) on delete cascade, adif blob, qso integer, bytes integer, updated integer);
        ''')
        if 'pw' not in [r[1] for r in c.execute('pragma table_info(users)')]:
            c.execute("alter table users add column pw text default ''")   # hash della password (facoltativa)
    c.close()


# ---- password (facoltativa, in aggiunta al link via email) ------------------------------------------------------
PW_MIN, PW_MAX = 8, 128
PW_COMMON = {'password', 'password1', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'iloveyou', 'abcd1234', '11111111', 'password123', 'admin1234'}


def hash_pw(pw):
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode('utf-8'), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return 'scrypt$%s$%s' % (salt.hex(), h.hex())


def check_pw(pw, stored):
    try:
        kind, salt, h = stored.split('$')
        if kind != 'scrypt':
            return False
        t = hashlib.scrypt(pw.encode('utf-8'), salt=bytes.fromhex(salt), n=2 ** 14, r=8, p=1, dklen=32)
        return hmac.compare_digest(t, bytes.fromhex(h))
    except (ValueError, TypeError):
        return False


DUMMY_PW = hash_pw('dummy-password-for-timing')


def pw_problem(pw, u):
    """Motivo per cui la password non va bene, oppure None."""
    if len(pw) < PW_MIN:
        return 'la password deve avere almeno %d caratteri' % PW_MIN
    if len(pw) > PW_MAX:
        return 'password troppo lunga'
    low = pw.lower()
    if low in PW_COMMON or low in (u['call'].lower(), u['email_lc'], u['email_lc'].split('@')[0]):
        return 'password troppo facile da indovinare'
    if len(set(pw)) < 4:
        return 'password troppo semplice'
    return None


def sha(s):
    return hashlib.sha256(s.encode()).hexdigest()


# ---- ADIF: lettura, scrittura, unione senza doppioni ----------------------------------------------------------
CONFIRM = ('qsl_rcvd', 'qsl_sent', 'lotw_qsl_rcvd', 'lotw_qsl_sent', 'eqsl_qsl_rcvd', 'eqsl_qsl_sent', 'dcl_qsl_rcvd', 'dcl_qsl_sent')


def parse_adif(text):
    """Elenco di QSO (dizionari con i campi in minuscolo). L'intestazione (fino a <EOH>) viene ignorata."""
    m = re.search(r'<eoh>', text, re.I)
    i = m.end() if m else 0
    n = len(text)
    out, rec = [], {}
    while i < n:
        lt = text.find('<', i)
        if lt < 0:
            break
        gt = text.find('>', lt)
        if gt < 0:
            break
        tag = text[lt + 1:gt]
        i = gt + 1
        low = tag.lower()
        if low == 'eor':
            if rec.get('call'):
                out.append(rec)
            rec = {}
            continue
        if low == 'eoh':
            continue
        parts = tag.split(':')
        try:
            ln = int(parts[1])
        except (IndexError, ValueError):
            continue
        if not parts[0] or ln < 0:
            continue
        rec[parts[0].lower()] = text[i:i + ln]
        i += ln
    if rec.get('call'):
        out.append(rec)
    return out


def qkey(r):
    """Due QSO sono lo stesso se coincidono nominativo, data, ora (HHMM), banda e modo."""
    t = (r.get('time_on') or '0000')[:4].ljust(4, '0')
    band = (r.get('band') or '').upper()
    if not band:
        try:
            band = str(int(float(r.get('freq') or 0)))
        except ValueError:
            band = ''
    mode = (r.get('submode') or r.get('mode') or '').upper()
    return (r.get('call', '').upper().strip(), (r.get('qso_date') or '')[:8], t, band, mode)


def merge_into(base, rec):
    """Completa il QSO gia' presente con i dati mancanti e con le conferme (Y vince). True se ha aggiunto qualcosa."""
    changed = False
    for k, v in rec.items():
        if k in CONFIRM:
            if str(v).upper() == 'Y' and str(base.get(k, '')).upper() != 'Y':
                base[k] = 'Y'
                changed = True
        elif v and not base.get(k):
            base[k] = v
            changed = True
    return changed


def merge_logs(old, new):
    """Unisce i QSO nuovi a quelli esistenti. Ritorna (elenco, statistiche)."""
    idx, out = {}, []
    st = {'added': 0, 'dup_existing': 0, 'dup_file': 0, 'completed': 0}
    for r in old:
        k = qkey(r)
        if k in idx:
            continue
        idx[k] = r
        out.append(r)
    seen_new = set()
    for r in new:
        k = qkey(r)
        if k in seen_new:
            st['dup_file'] += 1                      # doppione dentro lo stesso file: scartato (ma ne raccoglie le conferme)
            if k in idx:
                merge_into(idx[k], r)
            continue
        seen_new.add(k)
        if k in idx:
            st['dup_existing'] += 1                  # gia' nel log: si uniscono i dati
            if merge_into(idx[k], r):
                st['completed'] += 1
        else:
            idx[k] = r
            out.append(r)
            st['added'] += 1
    return out, st


def write_adif(recs):
    parts = ['IQ8DO DX Cluster - log unito\n<ADIF_VER:5>3.1.4\n<PROGRAMID:5>IQ8DO\n<EOH>\n']
    for r in sorted(recs, key=lambda x: ((x.get('qso_date') or ''), (x.get('time_on') or ''))):
        parts.append(''.join('<%s:%d>%s ' % (k.upper(), len(v), v) for k, v in r.items() if v != '' and v is not None) + '<EOR>\n')
    return ''.join(parts)


# ---- email: tramite il sito aricaserta.it (plugin iq8do-mail-relay) --------------------------------------------
def send_mail(to, subject, text):
    def run():
        if DEBUG_LINKS:
            with open(DEBUG_LINKS, 'a') as f:
                f.write(json.dumps({'to': to, 'subject': subject, 'text': text}) + '\n')
            return
        if not SECRET:
            print('mail: MAIL_SECRET mancante, email non inviata', flush=True)
            return
        body = json.dumps({'to': to, 'subject': subject, 'text': text})
        ts = str(int(time.time()))
        sig = hmac.new(SECRET.encode(), (ts + '\n' + body).encode(), hashlib.sha256).hexdigest()
        req = urllib.request.Request(MAIL_URL, data=body.encode(), method='POST', headers={
            'Content-Type': 'application/json', 'X-IQ8DO-Ts': ts, 'X-IQ8DO-Sig': sig, 'User-Agent': 'IQ8DO-accounts/1'})
        try:
            urllib.request.urlopen(req, timeout=25).read()
        except Exception as e:
            print('mail: invio fallito:', repr(e)[:160], flush=True)
    threading.Thread(target=run, daemon=True).start()


def mail_text(call, link):
    return ('Ciao %s,\n\nper entrare nella tua area personale di IQ8DO DX Cluster (A.R.I. Caserta) apri questo link entro 20 minuti:\n\n%s\n\n'
            'Il link vale una sola volta. Se non hai chiesto tu l\'accesso, ignora questo messaggio: nessuno puo\' entrare senza il link.\n\n'
            '73 de IQ8DO' % (call, link))


def new_login_link(c, user_id):
    tok = secrets.token_urlsafe(32)
    with c:
        c.execute('delete from tokens where user_id=? and (used=1 or exp<?)', (user_id, int(time.time())))
        c.execute('insert into tokens(hash,user_id,exp) values(?,?,?)', (sha(tok), user_id, int(time.time()) + TOKEN_TTL))
    return SITE + '/#login=' + tok


def valid_settings(s):
    if not isinstance(s, dict):
        return {}
    out = {}
    if isinstance(s.get('watch'), list):
        out['watch'] = [str(x).upper()[:14] for x in s['watch'][:60] if re.match(r'^[A-Za-z0-9/*]{2,14}$', str(x))]
    if isinstance(s.get('needAlerts'), list):
        out['needAlerts'] = [x for x in s['needAlerts'] if x in ('dxcc', 'band', 'slot', 'zone', 'zband', 'grid')]
    for k in ('sound', 'notify', 'openAlerts', 'confirmedOnly', 'awake', 'haptic'):
        if isinstance(s.get(k), bool):
            out[k] = s[k]
    if s.get('lang') in ('it', 'en'):
        out['lang'] = s['lang']
    if s.get('callbook') in ('qrz', 'hamqth'):
        out['callbook'] = s['callbook']
    if isinstance(s.get('poll'), int) and 5 <= s['poll'] <= 120:
        out['poll'] = s['poll']
    return out


def valid_station(s):
    if not isinstance(s, dict):
        return {}
    return {k: str(s.get(k, ''))[:120] for k in ('rig', 'antenna', 'power', 'notes') if s.get(k)}


# ---- invio spot al cluster -----------------------------------------------------------------------------------
spot_lock = threading.Lock()


def _read_until(sock, pats, timeout):
    """Legge dal nodo fino a trovare uno dei modelli (bytes) o fino allo scadere del tempo. Restituisce quanto letto."""
    buf = b''
    end = time.time() + timeout
    while time.time() < end:
        sock.settimeout(max(0.2, end - time.time()))
        try:
            d = sock.recv(4096)
        except socket.timeout:
            break
        if not d:
            break
        buf += d
        if any(p in buf for p in pats):
            break
    return buf


def send_spot(call, dx, freq, comment):
    """Entra nel nodo locale come CALL-SSID e invia `dx freq dx comment`. Ritorna (ok, messaggio)."""
    spotter = '%s-%s' % (call, SPOT_SSID)
    with spot_lock:                      # una sola connessione alla volta: niente sovrapposizioni dello stesso SSID
        s = socket.create_connection(NODE, timeout=8)
        try:
            if b'login' not in _read_until(s, (b'login:', b'login '), 8).lower():
                return False, 'il nodo non risponde'
            s.sendall((spotter + '\r\n').encode())
            _read_until(s, (b'dxspider >', b'> '), 8)
            line = ('dx %s %s %s' % (freq, dx, comment)).strip()
            s.sendall((line + '\r\n').encode('utf-8', 'replace'))
            out = _read_until(s, (b'DX de ', b'Sorry', b'not in band', b'Need a callsign', b'invalid'), 5)
            time.sleep(0.4)
            out += _read_until(s, (b'@@nessuna-corrispondenza@@',), 0.6)
            try:
                s.sendall(b'bye\r\n')
            except OSError:
                pass
        finally:
            s.close()
    txt = out.decode('latin1', 'replace')
    low = txt.lower()
    if 'duplicate' in low:
        return False, "spot già presente (duplicato)"
    if 'not in band' in low:
        return False, 'frequenza fuori dalle bande radioamatoriali'
    if 'sorry' in low or 'invalid' in low or 'need a callsign' in low:
        return False, 'il nodo ha rifiutato lo spot'
    return True, 'ok'


# ---- console del cluster: solo comandi di lettura ----------------------------------------------------------
CONSOLE_OK = re.compile(r'^(sh|show)/(dx|wwv|wcy|sun|moon|muf|dxcc|prefix|heading|time|dxstat|hfstats|vhfstats|ann|wx|dxsquare|bands|fdx|users|cluster|version|dupes)(( [A-Za-z0-9/*.\-]{1,16}){0,4})', re.I)
CONSOLE_SSID = os.environ.get('CONSOLE_SSID', '8')
ANSI = re.compile(rb'\x1b\[[0-9;?]*[A-Za-z]|\xff[\xfb-\xfe].|\xff\xfa.*?\xff\xf0|\xff.')


def node_command(call, cmd):
    """Entra nel nodo come CALL-SSID, esegue UN comando di lettura e restituisce il testo (massimo 8000 caratteri)."""
    with spot_lock:
        s = socket.create_connection(NODE, timeout=8)
        try:
            if b'login' not in _read_until(s, (b'login:', b'login '), 8).lower():
                return None
            s.sendall(('%s-%s\r\n' % (call, CONSOLE_SSID)).encode())
            _read_until(s, (b'dxspider >', b'> '), 8)
            s.sendall((cmd + '\r\n').encode('ascii', 'ignore'))
            buf = b''
            end = time.time() + 8
            idle = time.time() + 2.0            # prima risposta entro 2 s, poi si chiude dopo 0.8 s di silenzio
            while time.time() < min(end, idle):
                s.settimeout(0.3)
                try:
                    d = s.recv(4096)
                except socket.timeout:
                    continue
                if not d:
                    break
                buf += d
                idle = time.time() + 0.8
                if len(buf) > 40000:
                    break
            try:
                s.sendall(b'bye\r\n')
            except OSError:
                pass
        finally:
            s.close()
    txt = ANSI.sub(b'', buf).decode('latin1', 'replace').replace('\r', '')
    lines = [ln for ln in txt.split('\n')]
    while lines and not lines[-1].strip():
        lines.pop()
    if lines and lines[-1].rstrip().endswith('>'):     # toglie il prompt finale
        lines.pop()
    return '\n'.join(lines)[:8000]


def profile(u, c):
    lg = c.execute('select qso,bytes,updated from logs where user_id=?', (u['id'],)).fetchone()
    return {'call': u['call'], 'email': u['email'], 'name': u['name'], 'qth': u['qth'], 'locator': u['locator'],
            'station': json.loads(u['station'] or '{}'), 'settings': json.loads(u['settings'] or '{}'),
            'approved': bool(u['approved']), 'admin': bool(u['is_admin']), 'created': u['created'], 'password': bool(u['pw']),
            'log': ({'qso': lg['qso'], 'bytes': lg['bytes'], 'updated': lg['updated']} if lg else None)}


class H(BaseHTTPRequestHandler):
    server_version = 'iq8do'

    def log_message(self, *a):
        pass

    # ---- utilita' ------------------------------------------------------------------------------------------
    def ip(self):
        return self.headers.get('X-Real-IP') or self.client_address[0]

    def send(self, code, obj, cookie=None, raw=None, ctype='application/json', extra=None):
        b = raw if raw is not None else json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(b)))
        if cookie:
            self.send_header('Set-Cookie', cookie)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(b)

    def body(self, limit=16384):
        n = int(self.headers.get('Content-Length', '0') or 0)
        if n < 0 or n > limit:
            raise ValueError('size')
        return self.rfile.read(n) if n else b''

    def json_body(self):
        raw = self.body()
        return json.loads(raw.decode('utf-8')) if raw else {}

    def csrf_ok(self):
        if self.headers.get('X-IQ8DO') != '1':
            return False
        o = self.headers.get('Origin')
        return o is None or o == SITE

    def session(self, c):
        ck = SimpleCookie(self.headers.get('Cookie', ''))
        if COOKIE not in ck:
            return None
        h = sha(ck[COOKIE].value)
        r = c.execute('select u.* from sessions s join users u on u.id=s.user_id where s.hash=? and s.exp>?', (h, int(time.time()))).fetchone()
        return r

    def cookie(self, value, age):
        return '%s=%s; Path=/; Max-Age=%d; HttpOnly; %sSameSite=Lax' % (COOKIE, value, age, '' if DEBUG_LINKS else 'Secure; ')

    # ---- instradamento -------------------------------------------------------------------------------------
    def do_GET(self):
        self.route('GET')

    def do_POST(self):
        self.route('POST')

    def do_PUT(self):
        self.route('PUT')

    def do_DELETE(self):
        self.route('DELETE')

    def route(self, method):
        path = urlparse(self.path).path.rstrip('/')
        try:
            if method != 'GET' and not self.csrf_ok():
                return self.send(403, {'error': 'csrf'})
            fn = getattr(self, 'h_' + method.lower() + '_' + path.replace('/api/', '').replace('/', '_'), None)
            if not fn:
                return self.send(404, {'error': 'not found'})
            c = db()
            try:
                fn(c)
            finally:
                c.close()
        except ValueError as e:
            self.send(413 if str(e) == 'size' else 400, {'error': str(e)[:60]})
        except Exception as e:
            print('errore:', repr(e)[:200], flush=True)
            self.send(500, {'error': 'server'})

    def need_user(self, c):
        u = self.session(c)
        if not u:
            self.send(401, {'error': 'login'})
        return u

    # ---- registrazione e accesso ---------------------------------------------------------------------------
    def h_post_register(self, c):
        b = self.json_body()
        call = str(b.get('call', '')).upper().strip()
        email = str(b.get('email', '')).strip()
        name = str(b.get('name', '')).strip()[:60]
        if not CALLRE.match(call) or not EMAILRE.match(email) or b.get('consent') is not True:
            return self.send(400, {'error': 'dati non validi'})
        if limited('reg-ip-' + self.ip(), 8, 3600) or limited('reg-mail-' + email.lower(), 3, 3600) or limited('mail-global', 120, 3600):
            return self.send(429, {'error': 'troppe richieste, riprova piu\' tardi'})
        u = c.execute('select * from users where call=?', (call,)).fetchone()
        if u is None:
            if c.execute('select count(*) from users').fetchone()[0] >= MAX_USERS:
                return self.send(503, {'error': 'registrazioni chiuse'})
            with c:
                cur = c.execute('insert into users(call,email,email_lc,name,is_admin,consent_at,created) values(?,?,?,?,?,?,?)',
                                (call, email, email.lower(), name, 0, int(time.time()), int(time.time())))
            send_mail(email, 'IQ8DO DX Cluster - conferma il tuo accesso', mail_text(call, new_login_link(c, cur.lastrowid)))
        elif u['email_lc'] == email.lower():
            send_mail(email, 'IQ8DO DX Cluster - il tuo link di accesso', mail_text(call, new_login_link(c, u['id'])))
        else:
            print('registrazione ignorata: nominativo gia\' registrato con un\'altra email:', call, flush=True)
        self.send(200, {'ok': True})   # risposta identica in ogni caso: nessuna informazione su chi e' registrato

    def h_post_login(self, c):
        b = self.json_body()
        email = str(b.get('email', '')).strip().lower()
        call = str(b.get('call', '')).upper().strip()
        if not EMAILRE.match(email) and not (not email and CALLRE.match(call)):
            return self.send(400, {'error': 'dati non validi'})
        if limited('log-ip-' + self.ip(), 15, 3600) or limited('log-mail-' + (email or call), 4, 3600) or limited('mail-global', 120, 3600):
            return self.send(429, {'error': 'troppe richieste, riprova piu\' tardi'})
        if not email:                    # solo il nominativo: il link va all'email con cui si e' registrato
            u = c.execute('select * from users where call=?', (call,)).fetchone()
        elif call:
            u = c.execute('select * from users where email_lc=? and call=?', (email, call)).fetchone()
        else:
            u = c.execute('select * from users where email_lc=? order by last_login desc, id limit 1', (email,)).fetchone()
        if u:
            send_mail(u['email'], 'IQ8DO DX Cluster - il tuo link di accesso', mail_text(u['call'], new_login_link(c, u['id'])))
        self.send(200, {'ok': True})

    def h_post_verify(self, c):
        b = self.json_body()
        tok = str(b.get('token', ''))
        if not re.match(r'^[A-Za-z0-9_-]{30,64}$', tok) or limited('ver-ip-' + self.ip(), 30, 600):
            return self.send(400, {'error': 'link non valido'})
        now = int(time.time())
        with c:
            r = c.execute('select user_id from tokens where hash=? and used=0 and exp>?', (sha(tok), now)).fetchone()
            if not r:
                return self.send(400, {'error': 'link scaduto o gia\' usato'})
            c.execute('update tokens set used=1 where hash=?', (sha(tok),))
            c.execute('update users set email_ok=1, last_login=? where id=?', (now, r['user_id']))
            sid = secrets.token_urlsafe(32)
            c.execute('delete from sessions where exp<?', (now,))
            c.execute('insert into sessions(hash,user_id,exp,created) values(?,?,?,?)', (sha(sid), r['user_id'], now + SESSION_TTL, now))
        u = c.execute('select * from users where id=?', (r['user_id'],)).fetchone()
        self.send(200, profile(u, c), cookie=self.cookie(sid, SESSION_TTL))

    def new_session(self, c, user_id):
        now = int(time.time())
        sid = secrets.token_urlsafe(32)
        with c:
            c.execute('update users set last_login=? where id=?', (now, user_id))
            c.execute('delete from sessions where exp<?', (now,))
            c.execute('insert into sessions(hash,user_id,exp,created) values(?,?,?,?)', (sha(sid), user_id, now + SESSION_TTL, now))
        return sid

    def h_post_login_password(self, c):
        """Accesso con nominativo (o email) e password: alternativa al link via email."""
        b = self.json_body()
        ident = str(b.get('id', '')).strip()
        pw = str(b.get('password', ''))
        if not ident or not pw or len(ident) > 120 or len(pw) > PW_MAX:
            return self.send(400, {'error': 'dati non validi'})
        if limited('pw-ip-' + self.ip(), 25, 600) or limited('pw-id-' + ident.lower(), 8, 900):
            return self.send(429, {'error': 'troppi tentativi, riprova piu\' tardi'})
        if EMAILRE.match(ident):
            rows = c.execute("select * from users where email_lc=? and pw<>'' and email_ok=1", (ident.lower(),)).fetchall()
        else:
            rows = c.execute("select * from users where call=? and pw<>'' and email_ok=1", (ident.upper(),)).fetchall()
        hit = None
        for u in rows:
            if check_pw(pw, u['pw']):
                hit = u
        if not rows:
            check_pw(pw, DUMMY_PW)          # stesso tempo di risposta anche se l'utente non esiste
        if not hit:
            return self.send(401, {'error': 'nominativo o password non corretti'})
        sid = self.new_session(c, hit['id'])
        self.send(200, profile(hit, c), cookie=self.cookie(sid, SESSION_TTL))

    def h_post_password(self, c):
        """Imposta o cambia la password (serve essere gia' entrati; se esiste gia' serve quella attuale)."""
        u = self.need_user(c)
        if not u:
            return
        b = self.json_body()
        new = str(b.get('password', ''))
        if limited('pwset-%d' % u['id'], 10, 900):
            return self.send(429, {'error': 'troppi tentativi, riprova piu\' tardi'})
        if u['pw'] and not check_pw(str(b.get('current', '')), u['pw']):
            return self.send(403, {'error': 'la password attuale non e\' corretta'})
        why = pw_problem(new, u)
        if why:
            return self.send(400, {'error': why})
        ck = SimpleCookie(self.headers.get('Cookie', ''))
        keep = sha(ck[COOKIE].value) if COOKIE in ck else ''
        with c:
            c.execute('update users set pw=? where id=?', (hash_pw(new), u['id']))
            c.execute('delete from sessions where user_id=? and hash<>?', (u['id'], keep))   # le altre sessioni vengono chiuse
        self.send(200, profile(c.execute('select * from users where id=?', (u['id'],)).fetchone(), c))

    def h_delete_password(self, c):
        u = self.need_user(c)
        if not u:
            return
        with c:
            c.execute("update users set pw='' where id=?", (u['id'],))
        self.send(200, profile(c.execute('select * from users where id=?', (u['id'],)).fetchone(), c))

    def h_post_logout(self, c):
        ck = SimpleCookie(self.headers.get('Cookie', ''))
        if COOKIE in ck:
            with c:
                c.execute('delete from sessions where hash=?', (sha(ck[COOKIE].value),))
        self.send(200, {'ok': True}, cookie=self.cookie('', 0))

    # ---- invio di uno spot (solo nominativi verificati dalla Sezione) ---------------------------------------
    def h_post_spot(self, c):
        u = self.need_user(c)
        if not u:
            return
        if not (u['approved'] or u['is_admin']):
            return self.send(403, {'error': 'nominativo non ancora verificato dalla Sezione'})
        b = self.json_body()
        dx = str(b.get('dx', '')).upper().strip()
        freq = str(b.get('freq', '')).strip().replace(',', '.')
        comment = re.sub(r'[^\x20-\x7e]', ' ', str(b.get('comment', ''))).strip()[:60]   # solo ASCII stampabile
        if not SPOTCALL.match(dx):
            return self.send(400, {'error': 'nominativo DX non valido'})
        if not re.match(r'^\d{1,7}(\.\d{1,3})?$', freq) or not (0.1 <= float(freq) <= 1300000):
            return self.send(400, {'error': 'frequenza non valida (kHz, es. 14074)'})
        if comment.lstrip().startswith(('/', '-')):
            return self.send(400, {'error': 'commento non valido'})
        uid = 'spot-%d' % u['id']
        if limited(uid + '-m', 6, 600) or limited(uid + '-d', 60, 86400) or limited('spot-ip-' + self.ip(), 20, 3600) or limited('spot-global', 400, 3600):
            return self.send(429, {'error': 'troppi spot inviati: riprova tra qualche minuto'})
        if limited('dupe-%s-%s-%s' % (u['id'], dx, freq), 1, 180):
            return self.send(409, {'error': "hai già inviato questo spot da poco"})
        try:
            ok, msg = send_spot(u['call'], dx, freq, comment)
        except OSError:
            return self.send(502, {'error': 'nodo non raggiungibile'})
        print('spot %s %s %s %s -> %s' % (u['call'], dx, freq, comment[:40], msg), flush=True)
        self.send(200 if ok else 422, {'ok': ok, 'error': None if ok else msg, 'spotter': '%s-%s' % (u['call'], SPOT_SSID)})

    def h_post_console(self, c):
        """Console di sola lettura per i soci verificati (sh/dx, sh/wwv, sh/sun, ...)."""
        u = self.need_user(c)
        if not u:
            return
        if not (u['approved'] or u['is_admin']):
            return self.send(403, {'error': 'nominativo non ancora verificato dalla Sezione'})
        cmd = re.sub(r'\s+', ' ', str(self.json_body().get('cmd', '')).strip())
        if not CONSOLE_OK.fullmatch(cmd):
            return self.send(400, {'error': 'comando non consentito'})
        uid = 'con-%d' % u['id']
        if limited(uid + '-m', 15, 60) or limited(uid + '-h', 200, 3600) or limited('con-ip-' + self.ip(), 40, 600):
            return self.send(429, {'error': 'troppi comandi, riprova tra poco'})
        try:
            out = node_command(u['call'], cmd)
        except OSError:
            return self.send(502, {'error': 'nodo non raggiungibile'})
        if out is None:
            return self.send(502, {'error': 'il nodo non risponde'})
        print('console %s: %s' % (u['call'], cmd[:60]), flush=True)
        self.send(200, {'ok': True, 'output': out})

    # ---- profilo ---------------------------------------------------------------------------------------------
    def h_get_me(self, c):
        u = self.need_user(c)
        if u:
            self.send(200, profile(u, c))

    def h_put_me(self, c):
        u = self.need_user(c)
        if not u:
            return
        b = self.json_body()
        name = str(b.get('name', u['name']))[:60]
        qth = str(b.get('qth', u['qth']))[:80]
        loc = str(b.get('locator', u['locator'])).strip()
        if loc and not LOCRE.match(loc):
            return self.send(400, {'error': 'locator non valido'})
        station = json.dumps(valid_station(b['station'])) if 'station' in b else u['station']
        settings = json.dumps(valid_settings(b['settings'])) if 'settings' in b else u['settings']
        if len(settings) > 6000 or len(station) > 2000:
            return self.send(413, {'error': 'size'})
        with c:
            c.execute('update users set name=?, qth=?, locator=?, station=?, settings=? where id=?', (name, qth, loc.upper(), station, settings, u['id']))
        self.send(200, profile(c.execute('select * from users where id=?', (u['id'],)).fetchone(), c))

    def h_delete_me(self, c):
        u = self.need_user(c)
        if not u:
            return
        b = self.json_body()
        if str(b.get('confirm', '')).upper() != u['call']:
            return self.send(400, {'error': 'conferma mancante'})
        with c:
            c.execute('delete from users where id=?', (u['id'],))   # sessioni, token e log spariscono a cascata
        self.send(200, {'ok': True}, cookie=self.cookie('', 0))

    def h_get_export(self, c):
        u = self.need_user(c)
        if not u:
            return
        p = profile(u, c)
        lg = c.execute('select adif from logs where user_id=?', (u['id'],)).fetchone()
        p['adif'] = gzip.decompress(lg['adif']).decode('utf-8', 'replace') if lg else None
        self.send(200, None, raw=json.dumps(p, indent=1).encode(), extra={'Content-Disposition': 'attachment; filename="iq8do-%s.json"' % u['call'].replace('/', '_')})

    # ---- log ADIF --------------------------------------------------------------------------------------------
    def h_get_log(self, c):
        u = self.need_user(c)
        if not u:
            return
        lg = c.execute('select adif from logs where user_id=?', (u['id'],)).fetchone()
        if not lg:
            return self.send(404, {'error': 'nessun log'})
        self.send(200, None, raw=gzip.decompress(lg['adif']), ctype='text/plain; charset=utf-8')

    def h_put_log(self, c):
        u = self.need_user(c)
        if not u:
            return
        if limited('logput-%d' % u['id'], 30, 3600):
            return self.send(429, {'error': 'troppi caricamenti'})
        if self.headers.get('X-IQ8DO-Enc') == 'gzip':
            packed = self.body(MAX_GZ)
            d = zlib.decompressobj(16 + zlib.MAX_WBITS)
            try:
                raw = d.decompress(packed, MAX_LOG + 1)
            except zlib.error:
                return self.send(400, {'error': 'compressione non valida'})
            if len(raw) > MAX_LOG or d.unconsumed_tail:
                return self.send(413, {'error': 'size'})
        else:
            raw = self.body(MAX_LOG)
        text = raw.decode('utf-8', 'replace')
        new = parse_adif(text)
        if not new:
            return self.send(400, {'error': 'non sembra un file ADIF'})
        q = parse_qs(urlparse(self.path).query)
        now = int(time.time())
        if q.get('mode', ['merge'])[0] == 'replace':
            old = []
        else:
            cur = c.execute('select adif from logs where user_id=?', (u['id'],)).fetchone()
            old = parse_adif(gzip.decompress(cur['adif']).decode('utf-8', 'replace')) if cur else []
        recs, st = merge_logs(old, new)
        out = write_adif(recs).encode('utf-8')
        with c:
            c.execute('insert or replace into logs(user_id,adif,qso,bytes,updated) values(?,?,?,?,?)', (u['id'], gzip.compress(out, 6), len(recs), len(out), now))
        st.update({'qso': len(recs), 'bytes': len(out), 'updated': now, 'before': len(old), 'in_file': len(new)})
        self.send(200, st)

    def h_delete_log(self, c):
        u = self.need_user(c)
        if u:
            with c:
                c.execute('delete from logs where user_id=?', (u['id'],))
            self.send(200, {'ok': True})

    # ---- amministrazione (solo per i nominativi in ADMIN_CALLS) --------------------------------------------
    def h_get_admin_users(self, c):
        u = self.need_user(c)
        if not u:
            return
        if not u['is_admin']:
            return self.send(403, {'error': 'admin'})
        rows = c.execute('select call,email,name,qth,email_ok,approved,created,last_login from users order by created desc limit 1000').fetchall()
        self.send(200, [dict(r) for r in rows])

    def h_post_admin_approve(self, c):
        u = self.need_user(c)
        if not u:
            return
        if not u['is_admin']:
            return self.send(403, {'error': 'admin'})
        b = self.json_body()
        with c:
            c.execute('update users set approved=? where call=?', (1 if b.get('approved') else 0, str(b.get('call', '')).upper()))
        self.send(200, {'ok': True})

    def h_post_admin_remove(self, c):
        u = self.need_user(c)
        if not u:
            return
        if not u['is_admin']:
            return self.send(403, {'error': 'admin'})
        call = str(self.json_body().get('call', '')).upper()
        if call == u['call']:
            return self.send(400, {'error': 'non puoi eliminare te stesso da qui'})
        with c:
            c.execute('delete from users where call=?', (call,))
        self.send(200, {'ok': True})


def cli(args):
    """Gestione da riga di comando (sysop): --make-admin CALL | --list | --remove CALL"""
    os.makedirs(STATE, exist_ok=True)
    init_db()
    c = db()
    if args[0] == '--list':
        for r in c.execute('select call,email,name,email_ok,approved,is_admin,datetime(created,"unixepoch") cr from users order by id'):
            print(dict(r))
    elif args[0] == '--make-admin' and len(args) == 2:
        with c:
            n = c.execute('update users set is_admin=1, approved=1 where call=?', (args[1].upper(),)).rowcount
        print('amministratore impostato' if n else 'nominativo non registrato')
    elif args[0] == '--remove' and len(args) == 2:
        with c:
            n = c.execute('delete from users where call=?', (args[1].upper(),)).rowcount
        print('eliminato' if n else 'nominativo non registrato')
    else:
        print('uso: accounts.py --list | --make-admin CALL | --remove CALL')


def main():
    os.makedirs(STATE, exist_ok=True)
    init_db()
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), H)
    print('accounts pronto su 127.0.0.1:%d' % PORT, flush=True)
    srv.serve_forever()


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        cli(sys.argv[1:])
    else:
        main()
