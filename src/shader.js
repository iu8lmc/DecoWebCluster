// Shader della mappa giorno/notte di DecoClock (iu8lmc/decoclock, assets/shaders/map.frag.glsl),
// portato su WebGL: senza radar, con selettore giorno/notte e esterno del disco trasparente.
export const FRAG = `precision highp float;
// Mappa giorno/notte: per ogni pixel calcola l'altezza del Sole e miscela giorno, crepuscolo e notte.
// Tutti i colori arrivano dai token come uniform.

// Tre proiezioni, scelte da u_azimuthal (formule gemelle in src/layers/projection.rs):
// - Mercatore: il pixel u_origin corrisponde alla longitudine u_center_lon e all'equatore;
//   u_scale è l'ampiezza di un pixel in radianti (2π / larghezza del mondo).
// - Azimutale equidistante: u_origin è il centro del disco, u_center è (lat, lon) del centro
//   in radianti, u_scale sono i radianti di distanza per pixel (π / raggio del disco).
// - Globo (ortografica): u_origin è il centro del globo, u_center il punto al centro, u_scale
//   è 1 / raggio della Terra in pixel. Il bordo del globo si scurisce un poco (effetto sfera).

uniform sampler2D u_earth;   // R terra, G rilievo (0.8 = pianura), B luci notturne
uniform vec3 u_sun;          // versore del Sole nel sistema terrestre
uniform float u_azimuthal;   // 0 Mercatore, 1 azimutale, 2 globo
uniform float u_center_lon;  // radianti, Mercatore
uniform vec2 u_center;       // (lat, lon) in radianti, azimutale
uniform vec2 u_origin;       // pixel, origine in basso a sinistra come gl_FragCoord
uniform float u_scale;       // radianti per pixel
uniform float u_lights;      // 1.0 se il tema ha le luci delle città
uniform float u_clip;        // pixel dal centro oltre cui si è fuori dal disco azimutale
uniform sampler2D u_aurora;  // probabilità di aurora OVATION: 361 colonne (lon 0..360), 181 righe (lat -90..90)
uniform float u_aurora_on;   // 1.0 se ci sono dati OVATION
uniform vec4 u_aurora_color; // colore e opacità massima dell'aurora

uniform vec3 u_ocean;
uniform vec3 u_ocean_night;
uniform vec3 u_land_day;
uniform vec3 u_land_shadow;
uniform vec3 u_land_night;
uniform vec3 u_city_lights;
uniform vec3 u_greyline;
uniform vec3 u_twilight;
uniform float u_daynight;    // 1.0 mostra il terminatore, 0.0 tutto giorno

const float PI = 3.14159265;

// Limiti astronomici dei crepuscoli (altezza del Sole in gradi).
const float RISE_SET = -0.833;
const float CIVIL = -6.0;
const float NAUTICAL = -12.0;
const float ASTRONOMICAL = -18.0;

// Aurora: sotto AURORA_MIN per cento non si disegna, da AURORA_FULL è piena. Di giorno resta
// solo un accenno, perché non è visibile.
const float AURORA_MIN = 0.05;
const float AURORA_FULL = 0.5;
const float AURORA_DAY = 0.2;

// Resa: quanto il crepuscolo tinge la notte, larghezza della greyline, luce radente.
const float TWILIGHT_TINT = 0.6;
const float GREYLINE_SIGMA = 0.85;
const float GREYLINE_STRENGTH = 0.45;
const float LOW_SUN_DIM = 0.25;
const float LOW_SUN_ALT = 15.0;
const float RELIEF_FLAT = 0.8;
const float RELIEF_MAX = 1.15;
// Globo: luce al bordo rispetto al centro.
const float GLOBE_LIMB = 0.7;

void main() {
    vec2 p = (gl_FragCoord.xy - u_origin) * u_scale;
    float lat;
    float lon;
    float limb = 1.0;
    if (u_azimuthal > 1.5) {
        vec2 q = (gl_FragCoord.xy - u_origin) * u_scale;
        float rho = length(q);
        if (rho > 1.0) {
            gl_FragColor = vec4(0.0);
            return;
        }
        float cos_c = sqrt(max(1.0 - rho * rho, 0.0));
        lat = asin(clamp(cos_c * sin(u_center.x) + q.y * cos(u_center.x), -1.0, 1.0));
        lon = u_center.y + atan(q.x, cos_c * cos(u_center.x) - q.y * sin(u_center.x));
        limb = mix(GLOBE_LIMB, 1.0, sqrt(cos_c));
    } else if (u_azimuthal > 0.5) {
        float rho = length(p);
        if (rho > PI || length(gl_FragCoord.xy - u_origin) > u_clip) {
            gl_FragColor = vec4(0.0);
            return;
        }
        float c = max(rho, 1e-6);
        float sin_c = sin(c);
        float cos_c = cos(c);
        lat = asin(clamp(cos_c * sin(u_center.x) + p.y * sin_c * cos(u_center.x) / c, -1.0, 1.0));
        lon = u_center.y + atan(p.x * sin_c, c * cos(u_center.x) * cos_c - p.y * sin(u_center.x) * sin_c);
    } else {
        lon = u_center_lon + p.x;
        lat = 2.0 * atan(exp(p.y)) - 0.5 * PI;
    }
    vec3 earth = texture2D(u_earth, vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI)).rgb;

    vec3 normal = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
    float h = degrees(asin(clamp(dot(normal, u_sun), -1.0, 1.0)));
    if (u_daynight < 0.5) h = 60.0;

    float relief = min(earth.g / RELIEF_FLAT, RELIEF_MAX);
    vec3 day = mix(u_ocean, mix(u_land_shadow, u_land_day, relief), earth.r);
    vec3 night = mix(u_ocean_night, u_land_night, earth.r);

    // Crepuscolo astronomico, nautico e civile: la tinta cresce a gradini morbidi.
    float glow = (smoothstep(ASTRONOMICAL, NAUTICAL, h)
                + smoothstep(NAUTICAL, CIVIL, h)
                + smoothstep(CIVIL, 0.0, h)) / 3.0;
    vec3 dusk = mix(night, u_twilight, TWILIGHT_TINT * glow);

    float sun_up = smoothstep(CIVIL * 0.5, -RISE_SET * 3.0, h);
    float low_sun = 1.0 - LOW_SUN_DIM * (1.0 - smoothstep(0.0, LOW_SUN_ALT, h));
    vec3 color = mix(dusk, day * low_sun, sun_up);

    float g = (h - RISE_SET) / GREYLINE_SIGMA;
    color = mix(color, u_greyline, GREYLINE_STRENGTH * exp(-0.5 * g * g));

    float lights_on = 1.0 - smoothstep(CIVIL - 2.0, RISE_SET - 1.0, h);
    color += u_city_lights * earth.b * lights_on * u_lights;

    if (u_aurora_on > 0.5) {
        float lon_deg = mod(degrees(lon), 360.0);
        vec2 uv = vec2((lon_deg + 0.5) / 361.0, (degrees(lat) + 90.5) / 181.0);
        float prob = texture2D(u_aurora, uv).r;
        float a = smoothstep(AURORA_MIN, AURORA_FULL, prob) * u_aurora_color.a;
        a *= mix(1.0, AURORA_DAY, sun_up);
        color = mix(color, u_aurora_color.rgb, a);
    }

    gl_FragColor = vec4(min(color * limb, 1.0), 1.0);
}
`;
