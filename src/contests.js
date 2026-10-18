// Calendario dei contest (WA7BNM, www.contestcalendar.com): letto dal server del cluster (/contests.rss, cache di un'ora).
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const BIG = /CQ ?(WW|WPX|160|M\b)|ARRL|IARU|WAE|RSGB|DARC|WAG|All Asian|JIDX|ARI |Italian|IOTA|Russian DX|King of Spain|Helvetia|Ukrainian|Stew Perry|CQWW|EU HF|SAC|Nordic|OK\/?OM/i;

const ts = (y, mon, d, hhmm) => Date.UTC(y, MON[mon], Number(d), Number(hhmm.slice(0, 2)), Number(hhmm.slice(2)));

/** Interpreta la descrizione ("0230Z-0300Z, Sep 30" oppure "2300Z, Sep 29 to 0600Z, Sep 30") in finestre [inizio, fine] (ms UTC). */
export function windows(desc, now = Date.now()) {
  const y0 = new Date(now).getUTCFullYear(), out = [];
  const year = (mon, d, hhmm) => { let t = ts(y0, mon, d, hhmm); if (t < now - 200 * 86400e3) t = ts(y0 + 1, mon, d, hhmm); return t; };
  const across = /(\d{4})Z,\s*([A-Z][a-z]{2})\s+(\d{1,2})\s+to\s+(\d{4})Z,\s*([A-Z][a-z]{2})\s+(\d{1,2})/g;
  let m;
  while ((m = across.exec(desc))) {
    const a = year(m[2], m[3], m[1]); let b = year(m[5], m[6], m[4]); if (b < a) b = ts(new Date(a).getUTCFullYear() + 1, m[5], m[6], m[4]);
    out.push([a, b]);
  }
  const rest = desc.replace(across, ' ');
  const same = /(\d{4})Z-(\d{4})Z,\s*([A-Z][a-z]{2})\s+(\d{1,2})/g;
  while ((m = same.exec(rest))) {
    const a = year(m[3], m[4], m[1]); let b = year(m[3], m[4], m[2]); if (b <= a) b += 86400e3;
    out.push([a, b]);
  }
  return out;
}

export async function fetchContests(now = Date.now()) {
  const r = await fetch('contests.rss');
  if (!r.ok) throw new Error('contest ' + r.status);
  const doc = new DOMParser().parseFromString(await r.text(), 'text/xml');
  const list = [];
  doc.querySelectorAll('item').forEach((it) => {
    const title = it.querySelector('title')?.textContent.trim() || '', link = it.querySelector('link')?.textContent.trim() || '', desc = it.querySelector('description')?.textContent.trim() || '';
    for (const [a, b] of windows(desc, now)) list.push({ title, link, start: a, end: b, big: BIG.test(title) });
  });
  return list.filter((c) => c.end > now).sort((x, y) => x.start - y.start);
}
