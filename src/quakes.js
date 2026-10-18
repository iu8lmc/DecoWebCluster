// Terremoti delle ultime 24 ore (EMSC, seismicportal.eu): magnitudo 4,5 o più nel mondo.
const BASE = 'https://www.seismicportal.eu/fdsnws/event/1/query';

export async function fetchQuakes(minMag = 4.5) {
  const start = new Date(Date.now() - 24 * 3600e3).toISOString().slice(0, 19);
  const r = await fetch(`${BASE}?format=json&orderby=time&limit=200&minmag=${minMag}&start=${start}`);
  if (!r.ok) throw new Error('EMSC ' + r.status);
  const j = await r.json();
  return (j.features || []).map((f) => ({
    id: f.id, ll: [f.geometry.coordinates[0], f.geometry.coordinates[1]], depth: -f.geometry.coordinates[2],
    mag: Number(f.properties.mag), place: f.properties.flynn_region || '', t: Date.parse(f.properties.time),
  })).filter((q) => Number.isFinite(q.mag) && q.ll.every(Number.isFinite));
}
