// Base della mappa in WebGL: shader giorno/notte di DecoClock (Mercatore, azimutale, globo).
import { FRAG } from './shader.js';

// Temi dai token di DecoClock (design/tokens.json): «night» per il tema scuro, «geochron-classic» per il chiaro.
const THEMES = {
  dark: { ocean: '#070B14', ocean_night: '#04070D', land_day: '#5E6B52', land_shadow: '#3A4436', land_night: '#0C121D', city_lights: '#FFB547', greyline: '#E8C36A', twilight: '#1B2A44', lights: 1 },
  light: { ocean: '#A9CBDD', ocean_night: '#3E5568', land_day: '#E9D9A6', land_shadow: '#D8C38A', land_night: '#5C6B78', city_lights: '#FFE3A0', greyline: '#D08A2E', twilight: '#7E93A3', lights: 1 },
};
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const VERT = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';

export function createGL(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
  if (!gl) return { ok: false };
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('WebGL non utilizzabile:', e.message); return { ok: false }; }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  const u = (n) => (U[n] ??= gl.getUniformLocation(prog, n));

  const tex = (unit) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    return t;
  };
  // Terra: R terra, G rilievo, B luci notturne. Finché non è caricata: 1 pixel neutro.
  const earth = tex(0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 200, 0]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // Aurora (OVATION): 361 x 181, lon 0..360, lat -90..90.
  const aurora = tex(1);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([0]));
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let auroraOn = 0;

  const api = {
    ok: true,
    onLoad: null,
    loadEarth(url) {
      const img = new Image();
      img.onerror = () => { if (url.endsWith('.webp')) this.loadEarth(url.replace('.webp', '.png')); }; // browser senza WebP
      img.onload = () => {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, earth);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D); // 2048x1024: potenza di due
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        api.onLoad && api.onLoad();
      };
      img.src = url;
    },
    /** points: [[lon 0..359, lat -90..90, probabilità 0..100], ...] */
    setAurora(points) {
      const w = 361, h = 181, data = new Uint8Array(w * h);
      for (const [lon, lat, v] of points) {
        const x = Math.round(lon), y = Math.round(lat + 90);
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        const val = Math.max(0, Math.min(255, Math.round((v / 100) * 255)));
        data[y * w + x] = val;
        if (x === 0) data[y * w + 360] = val;
      }
      gl.activeTexture(gl.TEXTURE0 + 1); gl.bindTexture(gl.TEXTURE_2D, aurora);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
      auroraOn = 1; api.onLoad && api.onLoad();
    },
    /**
     * p: { w, h (pixel del canvas), mode 0 Mercatore | 1 azimutale | 2 globo, ox, oy (origine, pixel GL dal basso-sinistra),
     *      scale (radianti per pixel), clat, clon (radianti), clon0 (Mercatore, radianti), clip (px), sun [x,y,z], theme, night, aurora }
     */
    draw(p) {
      if (canvas.width !== p.w || canvas.height !== p.h) { canvas.width = p.w; canvas.height = p.h; }
      gl.viewport(0, 0, p.w, p.h);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      const th = THEMES[p.theme] || THEMES.dark;
      gl.uniform1i(u('u_earth'), 0); gl.uniform1i(u('u_aurora'), 1);
      gl.uniform3fv(u('u_sun'), p.sun);
      gl.uniform1f(u('u_azimuthal'), p.mode);
      gl.uniform1f(u('u_center_lon'), p.clon0 || 0);
      gl.uniform2f(u('u_center'), p.clat || 0, p.clon || 0);
      gl.uniform2f(u('u_origin'), p.ox, p.oy);
      gl.uniform1f(u('u_scale'), p.scale);
      gl.uniform1f(u('u_lights'), th.lights);
      gl.uniform1f(u('u_clip'), p.clip || 1e9);
      gl.uniform1f(u('u_daynight'), p.night ? 1 : 0);
      gl.uniform1f(u('u_aurora_on'), p.aurora && auroraOn ? 1 : 0);
      gl.uniform4f(u('u_aurora_color'), 0.3, 1.0, 0.6, 0.6);
      gl.uniform3fv(u('u_ocean'), rgb(th.ocean)); gl.uniform3fv(u('u_ocean_night'), rgb(th.ocean_night));
      gl.uniform3fv(u('u_land_day'), rgb(th.land_day)); gl.uniform3fv(u('u_land_shadow'), rgb(th.land_shadow));
      gl.uniform3fv(u('u_land_night'), rgb(th.land_night)); gl.uniform3fv(u('u_city_lights'), rgb(th.city_lights));
      gl.uniform3fv(u('u_greyline'), rgb(th.greyline)); gl.uniform3fv(u('u_twilight'), rgb(th.twilight));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
  return api;
}
