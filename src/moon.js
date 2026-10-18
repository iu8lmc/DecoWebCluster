// Luna: fase, posizione (sottopunto, azimut/elevazione dal luogo) e sorgere/tramonto. Formule di bassa precisione (~0,3°), sufficienti per l'EME.
const R = Math.PI / 180, mod = (x, m) => ((x % m) + m) % m;

export function moon(ms, home) {
  const d = ms / 86400e3 + 2440587.5 - 2451545;
  const L = 218.316 + 13.176396 * d, M = 134.963 + 13.064993 * d, F = 93.272 + 13.22935 * d;
  const lon = L + 6.289 * Math.sin(M * R), lat = 5.128 * Math.sin(F * R), dist = 385001 - 20905 * Math.cos(M * R);
  const eps = (23.4393 - 3.563e-7 * d) * R, lr = lon * R, br = lat * R;
  const ra = Math.atan2(Math.sin(lr) * Math.cos(eps) - Math.tan(br) * Math.sin(eps), Math.cos(lr));
  const dec = Math.asin(Math.sin(br) * Math.cos(eps) + Math.cos(br) * Math.sin(eps) * Math.sin(lr));
  const gmst = mod(280.46061837 + 360.98564736629 * d, 360);
  const sub = [mod(ra / R - gmst + 180, 360) - 180, dec / R];
  const g = 357.528 + 0.9856003 * d, ls = 280.46 + 0.9856474 * d + 1.915 * Math.sin(g * R) + 0.02 * Math.sin(2 * g * R);
  const elong = mod(lon - ls, 360), illum = (1 - Math.cos(elong * R)) / 2;
  const out = { sub, dist, illum, age: elong, ll: sub };
  if (home) {
    const H = (gmst + home[0]) * R - ra, phi = home[1] * R;
    const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
    let alt = Math.asin(sinAlt);
    alt -= (6378 / dist) * Math.cos(alt); // parallasse
    const az = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(H));
    out.el = alt / R; out.az = mod(az / R, 360);
  }
  return out;
}

/** Nome della fase in base all'elongazione (0 = nuova, 180 = piena). */
export function phaseName(age) {
  const n = ['new', 'waxC', 'fq', 'waxG', 'full', 'wanG', 'lq', 'wanC'];
  return n[Math.round(age / 45) % 8];
}

/** Prossimo sorgere e tramonto (elevazione 0°) nelle 30 ore successive. */
export function riseSet(home, from = Date.now()) {
  let prev = moon(from, home).el, rise = null, set = null;
  for (let t = from + 300e3; t <= from + 30 * 3600e3 && !(rise && set); t += 300e3) {
    const e = moon(t, home).el;
    if (prev < 0 && e >= 0 && !rise) rise = t;
    if (prev >= 0 && e < 0 && !set) set = t;
    prev = e;
  }
  return { rise, set };
}
