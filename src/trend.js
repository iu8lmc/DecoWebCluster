// "DX in aumento": entità con molti più spot negli ultimi 15 minuti che nei 45 precedenti (pile-up che si forma).
export function trending(spots, now = Date.now(), min = 4) {
  const by = new Map();
  for (const s of spots) {
    if (s.ent < 0 || s.t < now - 60 * 60e3) continue;
    const e = by.get(s.ent) || { ent: s.ent, country: s.country, iso: s.iso, recent: 0, before: 0, calls: new Map(), bands: new Set() };
    if (s.t >= now - 15 * 60e3) { e.recent++; e.calls.set(s.dx, (e.calls.get(s.dx) || 0) + 1); e.bands.add(s.band ? s.band.name : ''); } else e.before++;
    by.set(s.ent, e);
  }
  return [...by.values()].filter((e) => e.recent >= min).map((e) => {
    const [call] = [...e.calls.entries()].sort((a, b) => b[1] - a[1])[0];
    return { ...e, call, score: e.recent / (1 + e.before / 3), bands: [...e.bands].filter(Boolean) };
  }).sort((a, b) => b.score - a.score).slice(0, 5);
}
