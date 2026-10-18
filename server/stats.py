#!/usr/bin/env python3
"""IQ8DO statistiche: archivio compatto degli spot + visitatori online.

 * Legge gli spot nuovi da MariaDB (utente di sola lettura, MYSQL_PWD dall'ambiente) e li copia in un
   archivio SQLite proprio, gia' arricchito: banda, modo, continente, zone CQ/ITU, quadrante, distanza da Caserta.
 * GET /stats/summary?days=N&side=dx|de&band=&cq=&itu=&cont=&grid2=&mode=&exact=1  -> aggregati in JSON
 * POST/GET /stats/ping  (id casuale del browser)  -> conta i visitatori online. Nessun IP, nessun cookie.
 * GET /stats/online -> numeri live dei visitatori.
Ascolta solo su 127.0.0.1:8094 (nginx inoltra /stats/)."""
import json, math, os, re, sqlite3, subprocess, sys, threading, time, hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.environ.get('STATE_DIRECTORY', '/var/lib/iq8do-stats')
DB = os.path.join(STATE, 'stats.db')
HOME = (14.33, 41.07)      # Caserta [lon, lat]
KEEP_DAYS = 400
ONLINE_WINDOW = 90         # secondi
MYSQL_USER = os.environ.get('MYSQL_USER', 'iq8do_stats')

CTY = json.load(open(os.path.join(HERE, 'cty.json')))
ENT, PFX, EXACT = CTY['e'], CTY['p'], CTY['x']   # e: [nome,cq,itu,cont,lat,lon,prefisso,nonDxcc]

# ---- bande e modi (stessa logica di radio.js) -----------------------------------------------
BANDS = [('160', 1800, 2000), ('80', 3500, 4000), ('60', 5250, 5450), ('40', 7000, 7300), ('30', 10100, 10150), ('20', 14000, 14350),
         ('17', 18068, 18168), ('15', 21000, 21450), ('12', 24890, 24990), ('10', 28000, 29700), ('6', 50000, 54000), ('VHF', 70000, 470000), ('SHF', 470000, 1e9)]
DIGI = [('FT8', [1840, 3573, 5357, 7074, 10136, 14074, 18100, 21074, 24915, 28074, 50313, 50323], 2.5),
        ('JS8', [3578, 7078, 10130, 14078, 21078, 24922, 28078], 1.2),
        ('FT4', [3575, 7047.5, 10140, 14080, 18104, 21140, 24919, 28180, 50318], 2.5),
        ('FT2', [7052, 14052, 21052, 28052], 2.5),
        ('WSPR', [1836.6, 3568.6, 5287.2, 7038.6, 10138.7, 14095.6, 21094.6, 24924.6, 28124.6, 50293.6], 1)]
KEYWORDS = [(r'\bFT-?8\b', 'FT8'), (r'\bFT-?4\b', 'FT4'), (r'\bFT-?2\b', 'FT2'), (r'\b(CW|QRS|QRQ|WPM)\b', 'CW'), (r'\b(SSB|USB|LSB|PHONE)\b', 'SSB'),
            (r'\bJS-?8(CALL)?\b', 'JS8'), (r'\bWSPR\b', 'WSPR'), (r'\bVARA\b', 'VARA'), (r'\bRTTY\b', 'RTTY'), (r'\bPSK\d*\b', 'PSK'), (r'\bJT\d+\b', 'JT'),
            (r'\b(MFSK|OLIVIA|SSTV|DIGI|PACKET|ROS|THOR|HELL)\b', 'DIGI'), (r'\bFM\b', 'FM'), (r'\bAM\b', 'AM')]
KEYWORDS = [(re.compile(p, re.I), m) for p, m in KEYWORDS]
CWTOP = {'160': 1840, '80': 3570, '60': 5354, '40': 7040, '30': 10150, '20': 14100, '17': 18109, '15': 21150, '12': 24930, '10': 28225, '6': 50100}
GROUP = {'CW': 'CW', 'SSB': 'PHONE', 'FM': 'PHONE', 'AM': 'PHONE'}


def band_of(f):
    for i, lo, hi in BANDS:
        if lo <= f <= hi:
            return i
    return ''


def mode_of(f, comm):
    for rx, m in KEYWORDS:
        if rx.search(comm or ''):
            return m
    for m, lst, tol in DIGI:
        if any(abs(x - f) <= tol for x in lst):
            return m
    b = band_of(f)
    if not b:
        return 'SSB'
    if b in ('VHF', 'SHF'):
        return 'FM'
    return 'CW' if f < CWTOP[b] else 'SSB'


# ---- nominativo -> entita' --------------------------------------------------------------------
NEUTRAL = re.compile(r'^(P|M|QRP|A|AM|B|LH|LT|R|T|J|K|X|MM|MOBILE|PORTABLE|\d)$')
_cache = {}


def resolve(call):
    if call in _cache:
        return _cache[call]
    r = -1
    c = call.upper().strip()
    parts = c.split('/')
    if len(parts) > 1:
        if any(p in ('MM', 'AM') for p in parts):
            c = ''
        else:
            kept = [p for i, p in enumerate(parts) if not (i > 0 and NEUTRAL.match(p))]
            c = kept[0] if len(kept) == 1 else (min(kept[:2], key=len) if len(kept[0]) != len(kept[1]) else kept[0])
    if c:
        if c in EXACT:
            r = EXACT[c]
        else:
            for n in range(min(len(c), 7), 0, -1):
                if c[:n] in PFX:
                    r = PFX[c[:n]]
                    break
    if len(_cache) > 200000:
        _cache.clear()
    _cache[call] = r
    return r


def km_between(a, b):
    la1, la2, dl = math.radians(a[1]), math.radians(b[1]), math.radians(b[0] - a[0])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0088 * math.asin(min(1, math.sqrt(h)))


def ll_to_grid4(lon, lat):
    L = min(359.999999, max(0, (lon + 180) % 360)); B = min(179.999999, max(0, lat + 90))
    return chr(65 + int(L // 20)) + chr(65 + int(B // 10)) + str(int((L % 20) // 2)) + str(int(B % 10))


def grid_center(g):
    lon = -180 + (ord(g[0]) - 65) * 20 + int(g[2]) * 2 + 1
    lat = -90 + (ord(g[1]) - 65) * 10 + int(g[3]) + 0.5
    return (lon, lat)


LOC = re.compile(r'(?<![A-Za-z0-9])([A-R]{2}[0-9]{2})(?:[A-Xa-x]{2})?(?![A-Za-z0-9])', re.I)


def locator_of(comm, ent):
    """Quadrante a 4 caratteri del DX dal commento ('USB FN31ll -> LO33hc': conta quello dopo la freccia), se coerente con l'entita'."""
    if not comm:
        return ''
    txt = comm.split('->')[-1] if '->' in comm else comm
    m = LOC.search(txt)
    if not m:
        return ''
    g = m.group(1).upper()
    if ent >= 0 and km_between(grid_center(g), (ENT[ent][5], ENT[ent][4])) > 4500:
        return ''
    return g


def enrich(row):
    """row: rowid,time,de,dx,freq,comment,spotcq,spotitu,spottercq,spotteritu -> tupla per la tabella spot."""
    rid, t, de, dx, f, comm, dcq, ditu, scq, situ = row
    comm = comm or ''
    band = band_of(f)
    mode = mode_of(f, comm)
    de_e, dx_e = resolve(de), resolve(dx)
    dx_cont = ENT[dx_e][3] if dx_e >= 0 else ''
    de_cont = ENT[de_e][3] if de_e >= 0 else ''
    loc = locator_of(comm, dx_e)
    exact = 1 if loc else 0
    if loc:
        grid = loc
        ll = grid_center(loc)
    elif dx_e >= 0:
        ll = (ENT[dx_e][5], ENT[dx_e][4])
        grid = ll_to_grid4(*ll)
    else:
        ll, grid = None, ''
    km = int(km_between(HOME, ll)) if ll else None
    dcq = dcq or (ENT[dx_e][1] if dx_e >= 0 else None)
    ditu = ditu or (ENT[dx_e][2] if dx_e >= 0 else None)
    scq = scq or (ENT[de_e][1] if de_e >= 0 else None)
    situ = situ or (ENT[de_e][2] if de_e >= 0 else None)
    return (rid, t, de, dx, f, band, mode, GROUP.get(mode, 'DIGI'), dx_e,
            dx_cont, dcq, ditu, grid, exact, de_e, de_cont, scq, situ, km)


SCHEMA = '''
create table if not exists spot(id integer primary key, t integer not null, de text, dx text, f real, band text, mode text, grp text,
  dx_ent integer, dx_cont text, dx_cq integer, dx_itu integer, dx_grid text, dx_exact integer,
  de_ent integer, de_cont text, de_cq integer, de_itu integer, km integer);
create index if not exists spot_t on spot(t);
create table if not exists visit(day text, vid text, primary key(day, vid));
create table if not exists online_log(ts integer primary key, n integer);
create table if not exists meta(k text primary key, v text);
'''
COLS = 'id,t,de,dx,f,band,mode,grp,dx_ent,dx_cont,dx_cq,dx_itu,dx_grid,dx_exact,de_ent,de_cont,de_cq,de_itu,km'
dblock = threading.Lock()


def conn():
    c = sqlite3.connect(DB, timeout=30)
    c.execute('pragma journal_mode=wal')
    c.execute('pragma synchronous=normal')
    return c


# ---- ingest da MariaDB -----------------------------------------------------------------------
def mysql_rows(last_id, min_time, limit=40000):
    q = (f'select rowid,time,spotter,spotcall,freq,comment,spotcq,spotitu,spottercq,spotteritu from spot '
         f'where rowid>{int(last_id)} and time>{int(min_time)} order by rowid limit {int(limit)}')
    out = subprocess.run(['mysql', '-u', MYSQL_USER, '-N', '-B', '--default-character-set=utf8mb4', 'dxcluster', '-e', q],
                         capture_output=True, text=True, timeout=300, errors='replace')
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[:300])
    rows = []
    for line in out.stdout.split('\n'):
        if not line:
            continue
        p = line.split('\t')
        if len(p) < 10:
            continue
        num = lambda x: None if x in ('NULL', '') else int(x)
        try:
            rows.append((int(p[0]), int(p[1]), p[2], p[3], float(p[4]), None if p[5] == 'NULL' else p[5].replace('\\t', ' ').replace('\\n', ' '),
                         num(p[6]), num(p[7]), num(p[8]), num(p[9])))
        except ValueError:
            continue
    return rows


status = {'last_id': 0, 'rows': 0, 'err': '', 'ingest_ts': 0}


def ingest_loop():
    c = conn()
    c.executescript(SCHEMA)
    row = c.execute('select max(id), count(*) from spot').fetchone()
    status['last_id'], status['rows'] = row[0] or 0, row[1]
    c.close()
    last_prune = 0
    while True:
        try:
            min_time = int(time.time()) - 366 * 86400
            while True:
                rows = mysql_rows(status['last_id'], min_time)
                if not rows:
                    break
                data = [enrich(r) for r in rows]
                with dblock:
                    c = conn()
                    c.executemany(f'insert or ignore into spot({COLS}) values ({",".join("?" * 19)})', data)
                    c.commit(); c.close()
                status['last_id'] = rows[-1][0]
                status['rows'] += len(rows)
                if len(rows) < 40000:
                    break
            status['err'] = ''
            status['ingest_ts'] = int(time.time())
            if time.time() - last_prune > 86400:
                with dblock:
                    c = conn()
                    c.execute('delete from spot where t<?', (int(time.time()) - KEEP_DAYS * 86400,))
                    c.execute('delete from psk where t<?', (int(time.time()) - KEEP_DAYS * 86400,))
                    c.execute('delete from visit where day<?', (time.strftime('%Y-%m-%d', time.gmtime(time.time() - 800 * 86400)),))
                    c.commit(); c.close()
                last_prune = time.time()
        except Exception as e:
            status['err'] = repr(e)[:300]
        time.sleep(10)


# ---- statistiche ------------------------------------------------------------------------------
_cache_sum = {}


def summary(q):
    days = int(q.get('days', '1'))
    side = 'de' if q.get('side') == 'de' else 'dx'
    key = json.dumps(sorted(q.items()))
    hit = _cache_sum.get(key)
    if hit and time.time() - hit[0] < (20 if days <= 1 else 90):
        return hit[1]
    now = int(time.time())
    t0 = 0 if days <= 0 else now - days * 86400
    cont, cq, itu = ('dx_cont', 'dx_cq', 'dx_itu') if side == 'dx' else ('de_cont', 'de_cq', 'de_itu')
    who = 'dx' if side == 'dx' else 'de'
    other_cont = 'de_cont' if side == 'dx' else 'dx_cont'
    where, args = ['t>=?'], [t0]
    f = lambda k: q.get(k, '')
    if f('band'):
        where.append('band=?'); args.append(f('band'))
    if f('mode'):
        where.append('(mode=? or grp=?)'); args += [f('mode'), f('mode')]
    if f('cont'):
        where.append(f'{cont}=?'); args.append(f('cont'))
    if f('cq').isdigit():
        where.append(f'{cq}=?'); args.append(int(f('cq')))
    if f('itu').isdigit():
        where.append(f'{itu}=?'); args.append(int(f('itu')))
    if f('grid2'):
        where.append("substr(dx_grid,1,2)=?"); args.append(f('grid2').upper()[:2])
    if f('exact') == '1':
        where.append('dx_exact=1')
    W = ' where ' + ' and '.join(where)

    def rows(sql, extra=()):
        return c.execute(sql, list(args) + list(extra)).fetchall()

    with dblock:
        c = conn()
        out = {'days': days, 'side': side, 'now': now}
        r = c.execute('select min(t), max(t), count(*) from spot').fetchone()
        out['archive'] = {'from': r[0], 'to': r[1], 'rows': r[2], 'ingest_ts': status['ingest_ts'], 'err': status['err']}
        tot = rows('select count(*), count(distinct dx), count(distinct dx_ent), count(distinct de), count(distinct ' + cq + '), count(distinct ' + itu +
                   '), count(distinct dx_grid), sum(dx_exact), avg(km), max(km) from spot' + W)[0]
        out['total'] = tot[0] or 0
        out['uniq'] = {'dx': tot[1], 'dxcc': tot[2], 'de': tot[3], 'cq': tot[4], 'itu': tot[5], 'grid4': tot[6]}
        out['exact'] = tot[7] or 0
        out['km'] = {'avg': round(tot[8] or 0), 'max': tot[9] or 0}
        span = 'strftime("%Y-%m-%d",t,"unixepoch")'
        out['perDay'] = rows(f'select {span} d, count(*) from spot' + W + ' group by d order by d')[-366:]
        out['perHour'] = [0] * 24
        for h, n in rows('select cast(strftime("%H",t,"unixepoch") as int) h, count(*) from spot' + W + ' group by h'):
            out['perHour'][h] = n
        out['perMinute'] = rows('select (t/60) m, count(*) from spot' + W + ' and t>=? group by m order by m', [now - 3600]) if days <= 1 else []
        out['band'] = dict(rows('select band, count(*) from spot' + W + ' group by band'))
        out['mode'] = dict(rows('select mode, count(*) from spot' + W + ' group by mode'))
        out['grp'] = dict(rows('select grp, count(*) from spot' + W + ' group by grp'))
        out['cont'] = dict(rows(f'select {cont}, count(*) from spot' + W + f' and {cont}<>"" group by {cont}'))
        out['otherCont'] = dict(rows(f'select {other_cont}, count(*) from spot' + W + f' and {other_cont}<>"" group by {other_cont}'))
        out['cq'] = dict(rows(f'select {cq}, count(*) from spot' + W + f' and {cq} is not null group by {cq}'))
        out['itu'] = dict(rows(f'select {itu}, count(*) from spot' + W + f' and {itu} is not null group by {itu}'))
        cb = {}
        for z, b, n in rows(f'select {cq}, band, count(*) from spot' + W + f' and {cq} is not null and band<>"" group by {cq}, band'):
            cb.setdefault(str(z), {})[b] = n
        out['cqBand'] = cb
        cob = {}
        for k, b, n in rows(f'select {cont}, band, count(*) from spot' + W + f' and {cont}<>"" and band<>"" group by {cont}, band'):
            cob.setdefault(k, {})[b] = n
        out['contBand'] = cob
        hb = {}
        for b, h, n in rows('select band, cast(strftime("%H",t,"unixepoch") as int) h, count(*) from spot' + W + ' and band<>"" group by band, h'):
            hb.setdefault(b, [0] * 24)[h] = n
        out['hourBand'] = hb
        gf = rows('select substr(dx_grid,1,2) g, count(*), sum(dx_exact) from spot' + W + ' and dx_grid<>"" group by g')
        out['grid2'] = {g: [n, e or 0] for g, n, e in gf}
        out['grid4'] = rows('select dx_grid, count(*) from spot' + W + ' and dx_grid<>"" group by dx_grid order by 2 desc limit 100')
        out['dxcc'] = [[ENT[e][0], ENT[e][6], n, de] for e, n, de in rows('select dx_ent, count(*), count(distinct de) from spot' + W + ' and dx_ent>=0 group by dx_ent order by 2 desc limit 60')]
        out['topDx'] = [[d, n, ENT[e][0] if e is not None and e >= 0 else '', ENT[e][6] if e is not None and e >= 0 else ''] for d, n, e in rows('select dx, count(*), max(dx_ent) from spot' + W + ' group by dx order by 2 desc limit 40')]
        out['topDe'] = rows('select de, count(*) from spot' + W + ' group by de order by 2 desc limit 40')
        kb = [0] * 21
        for b, n in rows('select min(km/1000,20) b, count(*) from spot' + W + ' and km is not null group by b'):
            kb[int(b)] = n
        out['kmBins'] = kb
        dxz = [(z, ENT[e][0] if e is not None and e >= 0 else '', n) for z, e, n in rows('select dx_cq, dx_ent, count(*) from spot' + W + ' and dx_cq is not null group by dx_cq, dx_ent order by 3 desc')]
        zd = {}
        for z, name, n in dxz:
            if len(zd.setdefault(str(z), [])) < 4:
                zd[str(z)].append([name, n])
        out['cqTop'] = zd if side == 'dx' else {}
        c.close()
    _cache_sum[key] = (time.time(), out)
    if len(_cache_sum) > 300:
        _cache_sum.clear()
    return out


# ---- visitatori ---------------------------------------------------------------------------------
live = {}            # vid -> dict(ts, tab, dev, lang, region)
live_lock = threading.Lock()
ip_hits = {}
peak = {'day': '', 'n': 0}
VALID = re.compile(r'^[A-Za-z0-9_-]{8,40}$')


def day_utc(ts=None):
    return time.strftime('%Y-%m-%d', time.gmtime(ts or time.time()))


def ping(body, ip):
    vid = str(body.get('id', ''))
    if not VALID.match(vid):
        return
    now = time.time()
    k = (ip, int(now // 60))
    ip_hits[k] = ip_hits.get(k, 0) + 1
    if ip_hits[k] > 40:
        return
    if len(ip_hits) > 5000:
        ip_hits.clear()
    clean = lambda s, n: re.sub(r'[^A-Za-z0-9_/-]', '', str(s or ''))[:n]
    with live_lock:
        if len(live) > 20000 and vid not in live:
            return
        live[vid] = {'ts': now, 'tab': clean(body.get('tab'), 12), 'dev': clean(body.get('dev'), 8), 'lang': clean(body.get('lang'), 5).lower(),
                     'region': clean(body.get('region'), 20)}
    h = hashlib.sha1(vid.encode()).hexdigest()[:16]
    with dblock:
        c = conn()
        c.execute('insert or ignore into visit(day,vid) values (?,?)', (day_utc(), h))
        c.commit(); c.close()


def online():
    now = time.time()
    with live_lock:
        for k in [k for k, v in live.items() if now - v['ts'] > ONLINE_WINDOW]:
            del live[k]
        vs = list(live.values())
    n = len(vs)
    d = day_utc()
    if peak['day'] != d:
        peak['day'], peak['n'] = d, 0
    peak['n'] = max(peak['n'], n)
    cnt = lambda key: dict(sorted(((k or '?', sum(1 for v in vs if v[key] == k)) for k in {v[key] for v in vs}), key=lambda x: -x[1]))
    with dblock:
        c = conn()
        today = c.execute('select count(*) from visit where day=?', (d,)).fetchone()[0]
        yest = c.execute('select count(*) from visit where day=?', (day_utc(now - 86400),)).fetchone()[0]
        week = c.execute('select count(distinct vid) from visit where day>=?', (day_utc(now - 6 * 86400),)).fetchone()[0]
        month = c.execute('select count(distinct vid) from visit where day>=?', (day_utc(now - 29 * 86400),)).fetchone()[0]
        total = c.execute('select count(distinct vid) from visit').fetchone()[0]
        daily = c.execute('select day, count(*) from visit group by day order by day desc limit 30').fetchall()[::-1]
        series = c.execute('select ts, n from online_log where ts>=? order by ts', (int(now) - 86400,)).fetchall()
        pk = c.execute('select max(n) from online_log where ts>=?', (int(now) - 86400,)).fetchone()[0] or 0
        c.close()
    return {'online': n, 'tab': cnt('tab'), 'dev': cnt('dev'), 'lang': cnt('lang'), 'region': cnt('region'), 'today': today, 'yesterday': yest, 'week': week,
            'month': month, 'total': total, 'peak24': max(pk, n), 'peakToday': peak['n'], 'daily': daily, 'series': series, 'since': daily[0][0] if daily else d}


def online_logger():
    while True:
        time.sleep(300)
        try:
            n = online()['online']
            with dblock:
                c = conn()
                c.execute('insert or replace into online_log(ts,n) values (?,?)', (int(time.time()) // 300 * 300, n))
                c.execute('delete from online_log where ts<?', (int(time.time()) - 40 * 86400,))
                c.commit(); c.close()
        except Exception as e:
            print('online_logger:', repr(e), flush=True)


# ---- attivazione speciale (es. 9T0MD): spot in entrata/uscita + rapporti PSK Reporter -----------
ACT_CALLS = [c.strip().upper() for c in os.environ.get('ACT_CALLS', '9T0MD').split(',') if c.strip()]
PSK_HOST, PSK_PORT = 'mqtt.pskreporter.info', 1883
PSK_SCHEMA = '''
create table if not exists psk(id integer primary key autoincrement, t integer not null, sc text, rc text, band text, mode text, f real,
  snr integer, sl text, rl text, s_ent integer, r_ent integer, s_cont text, r_cont text, km integer);
create index if not exists psk_t on psk(t);
create index if not exists psk_sc on psk(sc, t);
create index if not exists psk_rc on psk(rc, t);
'''
psk_status = {'ok': False, 'last': 0, 'n': 0, 'err': ''}


def _loc_ll(g):
    g = (g or '').upper()
    if len(g) >= 4 and re.match(r'^[A-R]{2}[0-9]{2}', g):
        return grid_center(g)
    return None


def psk_store(j):
    try:
        sc, rc = str(j.get('sc', '')).upper(), str(j.get('rc', '')).upper()
        f = float(j.get('f', 0)) / 1000.0      # Hz -> kHz
        t = int(j.get('t') or time.time())
        se, re_ = resolve(sc), resolve(rc)
        sl, rl = str(j.get('sl', ''))[:8], str(j.get('rl', ''))[:8]
        a, b = _loc_ll(sl), _loc_ll(rl)
        km = int(km_between(a, b)) if a and b else None
        row = (t, sc, rc, band_of(f), str(j.get('md', ''))[:8], f, int(j.get('rp', 0) or 0), sl, rl, se, re_,
               ENT[se][3] if se >= 0 else '', ENT[re_][3] if re_ >= 0 else '', km)
        with dblock:
            c = conn()
            c.execute('insert into psk(t,sc,rc,band,mode,f,snr,sl,rl,s_ent,r_ent,s_cont,r_cont,km) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', row)
            c.commit(); c.close()
        psk_status['n'] += 1
        psk_status['last'] = int(time.time())
    except Exception as e:
        psk_status['err'] = repr(e)[:200]


def _mqtt_str(s):
    b = s.encode()
    return bytes([len(b) >> 8, len(b) & 255]) + b


def _mqtt_pkt(t, body):
    n, ln = len(body), bytearray()
    while True:
        d = n % 128; n //= 128
        ln.append(d | 128 if n else d)
        if not n:
            break
    return bytes([t]) + bytes(ln) + body


def psk_loop():
    """Sottoscrive via MQTT (TCP 1883) i rapporti PSK Reporter dei nominativi in ACT_CALLS, come mittente e come ricevente."""
    import socket
    wait = 5
    while True:
        try:
            s = socket.create_connection((PSK_HOST, PSK_PORT), timeout=20)
            s.settimeout(40)
            cid = 'iq8do-st' + hashlib.md5(str(time.time()).encode()).hexdigest()[:6]
            s.sendall(_mqtt_pkt(0x10, _mqtt_str('MQTT') + bytes([4, 2, 0, 60]) + _mqtt_str(cid)))
            topics = []
            for call in ACT_CALLS:
                topics += [f'pskr/filter/v2/+/+/{call}/#', f'pskr/filter/v2/+/+/+/{call}/#']
            body = bytes([0, 1]) + b''.join(_mqtt_str(t) + bytes([0]) for t in topics)
            s.sendall(_mqtt_pkt(0x82, body))
            psk_status.update(ok=True, err='')
            wait = 5
            buf, lastping = b'', time.time()
            while True:
                if time.time() - lastping > 40:
                    s.sendall(bytes([0xC0, 0])); lastping = time.time()
                try:
                    chunk = s.recv(65536)
                except socket.timeout:
                    continue
                if not chunk:
                    raise ConnectionError('chiusa')
                buf += chunk
                while len(buf) >= 2:
                    i, mul, ln = 1, 1, 0
                    while i < len(buf):
                        d = buf[i]; i += 1
                        ln += (d & 127) * mul; mul *= 128
                        if not d & 128:
                            break
                    else:
                        break
                    if len(buf) < i + ln:
                        break
                    typ, payload, buf = buf[0] >> 4, buf[i:i + ln], buf[i + ln:]
                    if typ == 3:
                        tl = (payload[0] << 8) | payload[1]
                        try:
                            psk_store(json.loads(payload[2 + tl:].decode('utf-8', 'replace')))
                        except Exception:
                            pass
        except Exception as e:
            psk_status.update(ok=False, err=repr(e)[:200])
            time.sleep(wait)
            wait = min(wait * 2, 120)


_cache_act = {}


def _name(e):
    return ENT[e][0] if e is not None and e >= 0 else ''


def _pfx(e):
    return ENT[e][6] if e is not None and e >= 0 else ''


def activation(q):
    call = (q.get('call') or ACT_CALLS[0]).upper()
    if call not in ACT_CALLS:
        call = ACT_CALLS[0]
    days = int(q.get('days', '30'))
    key = (call, days)
    hit = _cache_act.get(key)
    if hit and time.time() - hit[0] < 20:
        return hit[1]
    now = int(time.time())
    t0 = 0 if days <= 0 else now - days * 86400
    like = (call, call + '/%', '%/' + call)
    hr = 'cast(strftime("%H",t,"unixepoch") as int)'
    day = 'strftime("%Y-%m-%d",t,"unixepoch")'
    out = {'call': call, 'days': days, 'now': now, 'psk_ok': psk_status['ok'], 'psk_n': psk_status['n']}

    def spots(c, col, other, oent, ocont):
        W = f' where t>=? and ({col}=? or {col} like ? or {col} like ?)'
        a = [t0, *like]
        r = lambda sql, ex=(): c.execute(sql, a + list(ex)).fetchall()
        tot = r(f'select count(*), count(distinct {other}), count(distinct {oent}), min(t), max(t), avg(km), max(km) from spot' + W)[0]
        ph = [0] * 24
        for h, n in r(f'select {hr}, count(*) from spot' + W + ' group by 1'):
            ph[h] = n
        hb = {}
        for b, h, n in r(f'select band, {hr}, count(*) from spot' + W + ' and band<>"" group by 1,2'):
            hb.setdefault(b, [0] * 24)[h] = n
        return {
            'total': tot[0] or 0, 'uniq': tot[1] or 0, 'uniqDxcc': tot[2] or 0, 'first': tot[3], 'lastT': tot[4],
            'kmAvg': round(tot[5] or 0), 'kmMax': tot[6] or 0,
            'band': dict(r('select band, count(*) from spot' + W + ' and band<>"" group by band')),
            'mode': dict(r('select mode, count(*) from spot' + W + ' group by mode')),
            'cont': dict(r(f'select {ocont}, count(*) from spot' + W + f' and {ocont}<>"" group by {ocont}')),
            'perDay': r(f'select {day} d, count(*) from spot' + W + ' group by d order by d')[-120:],
            'perHour': ph, 'hourBand': hb,
            'top': [[c_, n, _name(e), _pfx(e)] for c_, n, e in r(f'select {other}, count(*), max({oent}) from spot' + W + ' group by 1 order by 2 desc limit 30')],
            'dxcc': [[_name(e), _pfx(e), n, k] for e, n, k in r(f'select {oent}, count(*), count(distinct {other}) from spot' + W + f' and {oent}>=0 group by 1 order by 2 desc limit 40')],
            'recent': [[t, o, f, b, m, _name(e), _pfx(e)] for t, o, f, b, m, e in r(f'select t, {other}, f, band, mode, {oent} from spot' + W + ' order by t desc limit 40')],
        }

    def psk(c, mine, other, oent, ocont):
        W = f' where t>=? and {mine}=?'
        a = [t0, call]
        r = lambda sql, ex=(): c.execute(sql, a + list(ex)).fetchall()
        tot = r(f'select count(*), count(distinct {other}), count(distinct {oent}), min(t), max(t), avg(km), max(km), avg(snr) from psk' + W)[0]
        ph = [0] * 24
        for h, n in r(f'select {hr}, count(*) from psk' + W + ' group by 1'):
            ph[h] = n
        far = r(f'select {other}, km, band, mode, {oent} from psk' + W + ' and km is not null order by km desc limit 1')
        return {
            'total': tot[0] or 0, 'uniq': tot[1] or 0, 'uniqDxcc': tot[2] or 0, 'first': tot[3], 'lastT': tot[4],
            'kmAvg': round(tot[5] or 0), 'kmMax': tot[6] or 0, 'snrAvg': round(tot[7] or 0, 1),
            'far': [far[0][0], far[0][1], far[0][2], far[0][3], _name(far[0][4])] if far else None,
            'band': {b: [n, k, round(s or 0, 1)] for b, n, k, s in r('select band, count(*), count(distinct ' + other + '), avg(snr) from psk' + W + ' and band<>"" group by band')},
            'mode': dict(r('select mode, count(*) from psk' + W + ' group by mode')),
            'cont': dict(r(f'select {ocont}, count(*) from psk' + W + f' and {ocont}<>"" group by {ocont}')),
            'perHour': ph,
            'perDay': r(f'select {day} d, count(*) from psk' + W + ' group by d order by d')[-120:],
            'top': [[c_, n, _name(e), _pfx(e), km] for c_, n, e, km in r(f'select {other}, count(*), max({oent}), max(km) from psk' + W + ' group by 1 order by 2 desc limit 30')],
            'dxcc': [[_name(e), _pfx(e), n, k] for e, n, k in r(f'select {oent}, count(*), count(distinct {other}) from psk' + W + f' and {oent}>=0 group by 1 order by 2 desc limit 40')],
            'recent': [[t, o, l, b, m, s, km, _pfx(e)] for t, o, l, b, m, s, km, e in r(f'select t, {other}, {"rl" if other == "rc" else "sl"}, band, mode, snr, km, {oent} from psk' + W + ' order by t desc limit 40')],
        }

    with dblock:
        c = conn()
        out['in'] = spots(c, 'dx', 'de', 'de_ent', 'de_cont')
        out['out'] = spots(c, 'de', 'dx', 'dx_ent', 'dx_cont')
        out['heard'] = psk(c, 'sc', 'rc', 'r_ent', 'r_cont')     # chi ha ricevuto il nominativo
        out['hears'] = psk(c, 'rc', 'sc', 's_ent', 's_cont')     # chi ha ricevuto il nominativo (lui come RX)
        c.close()
    ev = [x for x in (out['in']['first'], out['out']['first'], out['heard']['first'], out['hears']['first']) if x]
    ev2 = [x for x in (out['in']['lastT'], out['out']['lastT'], out['heard']['lastT'], out['hears']['lastT']) if x]
    out['first'], out['last'] = (min(ev) if ev else None), (max(ev2) if ev2 else None)
    bands = {}
    for k in ('in', 'out', 'heard', 'hears'):
        for b, v in out[k]['band'].items():
            bands.setdefault(b, {})[k] = v[0] if isinstance(v, list) else v
    out['bands'] = bands
    out['acts'] = ACT_CALLS
    _cache_act[key] = (time.time(), out)
    return out


class H(BaseHTTPRequestHandler):
    server_version = 'iq8do-stats'

    def log_message(self, *a):
        pass

    def send(self, code, obj, cache='no-store'):
        b = json.dumps(obj, separators=(',', ':')).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Cache-Control', cache)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(b)

    def ip(self):
        return self.headers.get('X-Real-IP') or self.client_address[0]

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0][:30] for k, v in parse_qs(u.query).items()}
        try:
            if u.path == '/stats/summary':
                if q.get('days', '1') not in ('0', '1', '7', '30', '90', '365'):
                    q['days'] = '1'
                return self.send(200, summary(q))
            if u.path == '/stats/activation':
                if q.get('days', '30') not in ('0', '1', '7', '30', '90'):
                    q['days'] = '30'
                return self.send(200, activation(q))
            if u.path == '/stats/online':
                return self.send(200, online())
            if u.path == '/stats/ping':
                ping(dict(q, tab=q.get('tab', ''), id=q.get('id', '')), self.ip())
                return self.send(200, {'online': online()['online']})
            if u.path == '/stats/status':
                return self.send(200, dict(status, online=len(live)))
        except Exception as e:
            print('GET', u.path, repr(e), flush=True)
            return self.send(500, {'error': 'errore'})
        self.send(404, {'error': 'non trovato'})

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != '/stats/ping':
            return self.send(404, {'error': 'non trovato'})
        try:
            n = min(int(self.headers.get('Content-Length') or 0), 1024)
            body = json.loads(self.rfile.read(n) or b'{}')
            ping(body if isinstance(body, dict) else {}, self.ip())
            o = online()
            return self.send(200, {'online': o['online'], 'today': o['today']})
        except Exception:
            return self.send(400, {'error': 'richiesta non valida'})


def main():
    os.makedirs(STATE, exist_ok=True)
    c = conn(); c.executescript(SCHEMA); c.executescript(PSK_SCHEMA); c.close()
    threading.Thread(target=ingest_loop, daemon=True).start()
    threading.Thread(target=psk_loop, daemon=True).start()
    threading.Thread(target=online_logger, daemon=True).start()
    ThreadingHTTPServer(('127.0.0.1', 8094), H).serve_forever()


if __name__ == '__main__':
    main()
