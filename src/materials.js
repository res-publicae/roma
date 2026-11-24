import * as THREE from 'three';
import { mulberry32 } from './util.js';

// Surfaces. Plain stone, brick, tile, plaster, sand and paving use photographed CC0 texture
// sets from Poly Haven (polyhaven.com), kept in the textures/ folder so the model works
// offline. Walls with openings (windows, shops, arcades) are still painted onto canvases, over
// a photographed base. A file missing from textures/ is fetched from Poly Haven instead, and if
// that fails too, that surface falls back to its fully painted version.

const PHOTO = { ground: 'stone_tiles_02', stone: 'white_sandstone_blocks_02', brick: 'medieval_red_brick',
  roof: 'clay_roof_tiles_02', plaster: 'white_rough_plaster', sand: 'sand_01' };
const LOCAL = new URL('../textures/', import.meta.url).href;
const REMOTE = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/';
const url = (id, map) => `${id}_${map}_1k.jpg`;

function loadOne(src) {
  return new Promise((res) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    const t = setTimeout(() => res(null), 10000);
    im.onload = () => { clearTimeout(t); res(im); };
    im.onerror = () => { clearTimeout(t); res(null); };
    im.src = src;
  });
}
async function loadImg(file) {
  return (await loadOne(LOCAL + file)) || loadOne(REMOTE + file.replace(/_(diff|nor_gl)_1k\.jpg$/, '') + '/' + file);
}

// ---------- weathering ----------
// Every wall, roof and pavement is aged in the shader from where it stands in the world rather
// than from its texture coordinates, so no two buildings weather alike and the repeat of the
// photographs is broken up: slow drifts of tone, blotchy stains, dark streaks running down
// walls, and a band of splashed dirt where a wall meets the ground. `wHeight` is the terrain
// height map, which is how a wall knows how far above the ground each point is.
function noiseTex(seed) {
  const S = 256, d = new Uint8Array(S * S * 4), rng = mulberry32(seed);
  const lat = (n) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = rng(); return [a, n]; };
  const samp = ([L, n], u, v) => {
    const x = u * n, y = v * n, i = Math.floor(x), j = Math.floor(y);
    let fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const g = (a, b) => L[(b % n) * n + (a % n)];
    return (g(i, j) * (1 - fx) + g(i + 1, j) * fx) * (1 - fy) + (g(i, j + 1) * (1 - fx) + g(i + 1, j + 1) * fx) * fy;
  };
  const chans = [[4, 8, 16, 32], [5, 10, 20, 40], [16, 32, 64], [3, 6, 12]].map((ns) => ns.map(lat));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    chans.forEach((oct, c) => {
      let v = 0, w = 0, a = 1;
      for (const o of oct) { v += samp(o, x / S, y / S) * a; w += a; a *= 0.55; }
      d[(y * S + x) * 4 + c] = Math.max(0, Math.min(255, ((v / w - 0.5) * 2.1 + 0.5) * 255));
    });
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// time, shared with the fire shader
export const FLAME = { uTime: { value: 0 } };
export const WEATHER = { wHeight: { value: null }, wNoise: { value: null }, wMap: { value: new THREE.Vector4() } };

export function weatherPatch(shader, amount) {
  Object.assign(shader.uniforms, WEATHER, { wAmt: { value: amount } });
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 wp = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
      #endif
      vWPos = ( modelMatrix * wp ).xyz; }`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D wHeight, wNoise;\nuniform vec4 wMap;\nuniform float wAmt;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 wn = normalize( cross( dFdx( vWPos ), dFdy( vWPos ) ) );
        float wall = 1.0 - smoothstep( 0.35, 0.75, abs( wn.y ) );
        float hg = vWPos.y - texture2D( wHeight, vWPos.xz * wMap.xy + wMap.zw ).r;
        vec2 c = wall > 0.5 ? ( abs( wn.x ) > abs( wn.z ) ? vWPos.zy : vWPos.xy ) : vWPos.xz;
        vec4 big = texture2D( wNoise, vWPos.xz / 120.0 + vWPos.y / 260.0 );
        vec4 mid = texture2D( wNoise, c / 14.0 );
        float fine = texture2D( wNoise, c / 3.3 ).r;
        float run = texture2D( wNoise, vec2( c.x / 6.0, c.y / 80.0 ) ).b;
        vec3 col = diffuseColor.rgb;
        col *= mix( 1.0, 0.8 + 0.4 * big.r, wAmt );                                  // slow drift of tone
        col *= mix( vec3( 1.0 ), mix( vec3( 1.05, 1.0, 0.93 ), vec3( 0.95, 1.0, 1.04 ), big.a ), wAmt ); // warmer here, greyer there
        col *= 1.0 - 0.26 * wAmt * smoothstep( 0.45, 0.8, mid.g * 0.6 + fine * 0.4 ); // stains
        col *= 1.0 - wall * wAmt * 0.2 * smoothstep( 0.5, 0.9, run ) * ( 0.35 + mid.g ); // streaks down walls
        float dirt = wall * exp( -max( hg, 0.0 ) / ( 0.5 + 2.2 * mid.r ) );         // splashed dirt at the foot of a wall
        col = mix( col, col * vec3( 0.52, 0.46, 0.38 ) + vec3( 0.025, 0.02, 0.015 ), clamp( dirt * wAmt * 0.95, 0.0, 0.85 ) );
        float lichen = ( 1.0 - wall ) * smoothstep( 2.0, 5.0, hg ) * smoothstep( 0.55, 0.8, mid.r * 0.7 + fine * 0.3 );
        col *= 1.0 - 0.3 * wAmt * lichen;                                           // dark patches on roofs
        diffuseColor.rgb = col;
      }`);
}

function finish(t, srgb = true) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
const imgTex = (img, srgb = true) => finish(new THREE.Texture(img), srgb);

// Canvas texture. Drawing code works in a w x h space; `scale` multiplies the real resolution.
function tex(w, h, draw, scale = 1) {
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const g = c.getContext('2d');
  g.scale(scale, scale);
  draw(g, w, h);
  return finish(new THREE.CanvasTexture(c));
}

// Like tex(), but the openings and trim are drawn on their own layer, which also yields a
// normal map: dark features read as recessed, light ones as raised, so painted windows and
// shopfronts still catch the light along their edges.
function texFeat(w, h, drawBase, drawFeat, scale = 1, strength = 2.4) {
  const mk = () => { const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale; const g = c.getContext('2d'); g.scale(scale, scale); return [c, g]; };
  const [c, g] = mk(), [fc, fg] = mk();
  drawBase(g, w, h); drawFeat(fg, w, h);
  const W = c.width, H = c.height, src = fg.getImageData(0, 0, W, H).data, ht = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const a = src[i * 4 + 3] / 255, l = (0.3 * src[i * 4] + 0.6 * src[i * 4 + 1] + 0.1 * src[i * 4 + 2]) / 255;
    ht[i] = 0.75 * (1 - a) + l * a;
  }
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(fc, 0, 0);
  const nc = document.createElement('canvas'); nc.width = W; nc.height = H;
  const ng = nc.getContext('2d'), out = ng.createImageData(W, H), o = out.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const xl = (x - 1 + W) % W, xr = (x + 1) % W, yu = (y - 1 + H) % H, yd = (y + 1) % H;
    const dx = (ht[y * W + xl] - ht[y * W + xr]) * strength, dy = (ht[yd * W + x] - ht[yu * W + x]) * strength;
    const k = 1 / Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    o[i] = (dx * k * 0.5 + 0.5) * 255; o[i + 1] = (dy * k * 0.5 + 0.5) * 255; o[i + 2] = (k * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  ng.putImageData(out, 0, 0);
  return { map: finish(new THREE.CanvasTexture(c)), normalMap: finish(new THREE.CanvasTexture(nc), false) };
}

function mottle(g, w, h, rng, n, amt, max = 3) {
  for (let i = 0; i < n; i++) {
    const s = 1 + rng() * max;
    g.fillStyle = rng() < 0.5 ? `rgba(0,0,0,${rng() * amt})` : `rgba(255,255,255,${rng() * amt})`;
    g.fillRect(rng() * w, rng() * h, s, s);
  }
}

// Fill with a photograph (repeated `reps` times across) washed towards a colour, or the flat colour.
function photoBase(g, w, h, img, color, wash, reps = 1) {
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  if (!img) return false;
  const s = w / reps;
  for (let x = 0; x < w; x += s) for (let y = 0; y < h; y += s) g.drawImage(img, x, y, s, s);
  g.globalAlpha = wash; g.fillStyle = color; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
  return true;
}

function washed(img, color, wash) { return tex(1024, 1024, (g, w, h) => photoBase(g, w, h, img, color, wash)); }

// Grey, evenly bright copy of a photograph, so vertex colours can tint it.
// Roman street paving: big many-sided blocks of dark lava fitted tightly together, each one
// slightly domed and worn, with earth packed into the joints. The outlines are worked out from
// scattered points (each stone is the ground nearest one point); the grain of the stone comes
// from a photograph when one is available. Returns a colour map and a matching normal map.
function basalt(seed, img) {
  const S = 2048, N = 14, rng = mulberry32(seed), px = new Float32Array(N * N), py = new Float32Array(N * N), tone = new Float32Array(N * N), warm = new Float32Array(N * N), tilt = new Float32Array(N * N * 2);
  for (let i = 0; i < N * N; i++) { px[i] = (i % N) + 0.12 + rng() * 0.76; py[i] = Math.floor(i / N) + 0.12 + rng() * 0.76; tone[i] = rng(); warm[i] = rng(); tilt[i * 2] = rng() - 0.5; tilt[i * 2 + 1] = rng() - 0.5; }
  let grain = null;
  if (img) { const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g.drawImage(img, x * S / 2, y * S / 2, S / 2, S / 2); grain = g.getImageData(0, 0, S, S).data; }
  const c = document.createElement('canvas'), nc = document.createElement('canvas'); c.width = c.height = nc.width = nc.height = S;
  const g = c.getContext('2d'), ng = nc.getContext('2d'), out = g.createImageData(S, S), o = out.data, nout = ng.createImageData(S, S), no = nout.data, ht = new Float32Array(S * S);
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let gsum = 0;
  if (grain) { for (let i = 0; i < S * S; i += 16) gsum += grain[i * 4 + 1]; gsum /= (S * S) / 16; }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x / S) * N, v = (y / S) * N, cu = Math.floor(u), cv = Math.floor(v);
    let d1 = 1e9, d2 = 1e9, i1 = 0, ax = 0, ay = 0, bx = 0, by = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ci = cu + di, cj = cv + dj, id = ((cj + N) % N) * N + ((ci + N) % N);
      const qx = px[id] + ci - ((ci + N) % N), qy = py[id] + cj - ((cj + N) % N), d = (qx - u) ** 2 + (qy - v) ** 2;
      if (d < d1) { d2 = d1; bx = ax; by = ay; d1 = d; ax = qx; ay = qy; i1 = id; } else if (d < d2) { d2 = d; bx = qx; by = qy; }
    }
    const e = (d2 - d1) / (2 * Math.hypot(bx - ax, by - ay) + 1e-6); // distance to the edge of the stone
    const k = (y * S + x) * 4, gr = grain ? grain[k + 1] / gsum : 1, gd = Math.max(0.55, Math.min(1.45, 1 + (gr - 1) * 0.9));
    const joint = sm(0.012, 0.045, e), body = 0.62 + 0.3 * tone[i1], edge = 0.86 + 0.14 * sm(0.03, 0.22, e);
    const w = warm[i1] * 0.07, l = body * gd * edge;
    o[k] = 255 * (joint * l * (1 + w) + (1 - joint) * 0.3); o[k + 1] = 255 * (joint * l + (1 - joint) * 0.265); o[k + 2] = 255 * (joint * l * (1 - w) + (1 - joint) * 0.21); o[k + 3] = 255;
    ht[y * S + x] = joint * (0.55 + 0.45 * sm(0.03, 0.4, e)) + tone[i1] * 0.1 + ((u - ax) * tilt[i1 * 2] + (v - ay) * tilt[i1 * 2 + 1]) * 0.22 + (gd - 1) * 0.12;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const xl = (x - 1 + S) % S, xr = (x + 1) % S, yu = (y - 1 + S) % S, yd = (y + 1) % S;
    const dx = (ht[y * S + xl] - ht[y * S + xr]) * 9, dy = (ht[yd * S + x] - ht[yu * S + x]) * 9, kk = 1 / Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    no[i] = (dx * kk * 0.5 + 0.5) * 255; no[i + 1] = (dy * kk * 0.5 + 0.5) * 255; no[i + 2] = (kk * 0.5 + 0.5) * 255; no[i + 3] = 255;
  }
  g.putImageData(out, 0, 0); ng.putImageData(nout, 0, 0);
  const normalMap = finish(new THREE.CanvasTexture(nc), false); normalMap.repeat.set(0.5, 0.5);
  return { map: finish(new THREE.CanvasTexture(c)), normalMap };
}

function neutral(img) {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1024, 1024);
  const d = g.getImageData(0, 0, 1024, 1024), p = d.data;
  let sum = 0;
  for (let i = 0; i < p.length; i += 4) sum += 0.3 * p[i] + 0.6 * p[i + 1] + 0.1 * p[i + 2];
  const k = (0.8 * 255) / (sum / (p.length / 4));
  for (let i = 0; i < p.length; i += 4) {
    const l = (0.3 * p[i] + 0.6 * p[i + 1] + 0.1 * p[i + 2]) * k;
    for (let j = 0; j < 3; j++) p[i + j] = Math.min(255, l * 0.8 + p[i + j] * k * 0.2);
  }
  g.putImageData(d, 0, 0);
  return finish(new THREE.CanvasTexture(c));
}

// ---------- painted fallbacks for plain surfaces ----------

function ashlar(seed) {
  return tex(256, 256, (g, w, h) => {
    const rng = mulberry32(seed);
    g.fillStyle = '#e4dccb'; g.fillRect(0, 0, w, h);
    const rows = 8, rh = h / rows, bw = 96;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (bw / 2) + rng() * 10;
      for (let x = -bw; x < w + bw; x += bw) {
        g.fillStyle = rng() < 0.5 ? `rgba(0,0,0,${rng() * 0.08})` : `rgba(255,255,255,${rng() * 0.08})`;
        g.fillRect(x + off, r * rh, bw, rh);
        g.fillStyle = 'rgba(40,30,20,0.28)'; g.fillRect(x + off, r * rh, 1.5, rh);
      }
      g.fillStyle = 'rgba(40,30,20,0.3)'; g.fillRect(0, r * rh, w, 1.5);
    }
    mottle(g, w, h, rng, 2500, 0.07);
  });
}

function brick(seed) {
  return tex(256, 256, (g, w, h) => {
    const rng = mulberry32(seed);
    g.fillStyle = '#a9643f'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 5) {
      g.fillStyle = 'rgba(232,214,190,0.5)'; g.fillRect(0, y, w, 1.2);
      const off = rng() * 30;
      for (let x = -30; x < w; x += 30) {
        g.fillStyle = rng() < 0.5 ? `rgba(0,0,0,${rng() * 0.14})` : `rgba(255,220,180,${rng() * 0.12})`;
        g.fillRect(x + off, y + 1.2, 29, 3.8);
      }
    }
    mottle(g, w, h, rng, 1500, 0.06);
  });
}

function roofTiles(seed) {
  return tex(256, 256, (g, w, h) => {
    const rng = mulberry32(seed);
    g.fillStyle = '#b26c47'; g.fillRect(0, 0, w, h);
    const cols = 8, cw = w / cols, rows = 6, rh = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      g.fillStyle = rng() < 0.5 ? `rgba(0,0,0,${rng() * 0.16})` : `rgba(255,210,170,${rng() * 0.14})`;
      g.fillRect(c * cw, r * rh, cw, rh);
    }
    for (let c = 0; c < cols; c++) {
      const x = c * cw, gr = g.createLinearGradient(x, 0, x + 11, 0);
      gr.addColorStop(0, 'rgba(60,25,10,0.5)'); gr.addColorStop(0.35, 'rgba(240,170,120,0.55)'); gr.addColorStop(1, 'rgba(70,30,12,0.5)');
      g.fillStyle = gr; g.fillRect(x, 0, 11, h);
    }
    for (let r = 0; r < rows; r++) { g.fillStyle = 'rgba(50,20,8,0.4)'; g.fillRect(0, r * rh, w, 2.5); }
  });
}

// Normal map for column shafts: 24 shallow vertical grooves (flutes) round the drum.
function flutes() {
  const W = 64, c = document.createElement('canvas'); c.width = W; c.height = 4;
  const g = c.getContext('2d'), im = g.createImageData(W, 4), p = im.data;
  for (let x = 0; x < W; x++) {
    const t = x / W, f = t < 0.14 ? 0 : -(2 * ((t - 0.14) / 0.86) - 1) * 0.85, k = 1 / Math.hypot(f, 1);
    for (let y = 0; y < 4; y++) { const i = (y * W + x) * 4; p[i] = (f * k * 0.5 + 0.5) * 255; p[i + 1] = 128; p[i + 2] = (k * 0.5 + 0.5) * 255; p[i + 3] = 255; }
  }
  g.putImageData(im, 0, 0);
  const tx = finish(new THREE.CanvasTexture(c), false);
  tx.repeat.set(24, 1);
  return tx;
}

// Dressed marble: smooth, faintly veined, for mouldings and sculpture...
function veined(g, w, h, rng, n) {
  g.fillStyle = '#ece4d3'; g.fillRect(0, 0, w, h);
  mottle(g, w, h, rng, 2600, 0.05, 11);
  g.lineWidth = 0.7;
  for (let i = 0; i < n; i++) {
    let x = rng() * w, y = rng() * h, a = rng() * 6.283;
    g.strokeStyle = `rgba(112,104,96,${0.07 + rng() * 0.13})`;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 14; k++) { a += (rng() - 0.5) * 0.9; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); }
    g.stroke();
  }
}
function fineMarble(seed) { return tex(512, 512, (g, w, h) => veined(g, w, h, mulberry32(seed), 26)); }

// ...and the same cut into large, tightly jointed blocks for walls and podiums: eight courses and
// three blocks to a 4.8 m tile, each block a slightly different tone.
function marbleBlocks(seed, rows = 8, per = 3) {
  return texFeat(512, 512, (g, w, h) => {
    const rng = mulberry32(seed); veined(g, w, h, rng, 30);
    const rh = h / rows, bw = w / per;
    for (let r = 0; r < rows; r++) for (let b = -1; b < per; b++) {
      g.fillStyle = rng() < 0.6 ? `rgba(96,74,44,${rng() * 0.16})` : `rgba(255,255,255,${rng() * 0.12})`;
      g.fillRect(b * bw + (r % 2) * bw / 2, r * rh, bw, rh);
    }
  }, (g, w, h) => {
    const rh = h / rows, bw = w / per;
    g.fillStyle = 'rgba(70,60,48,0.6)';
    for (let r = 0; r < rows; r++) {
      g.fillRect(0, r * rh, w, 1.6);
      for (let b = -1; b < per; b++) g.fillRect(b * bw + (r % 2) * bw / 2, r * rh, 1.6, rh);
    }
  }, 1, 1.6);
}

// The carved band that winds up Trajan's Column: one turn of it, drawn slanting so that the
// copies stacked up the shaft join into a single spiral. The figures are only suggested: rows
// of small upright shapes standing on the band's ground line.
function spiralRelief(seed) {
  const t = texFeat(1024, 128, (g, w, h) => {
    const rng = mulberry32(seed); g.fillStyle = '#e6dcc8'; g.fillRect(0, 0, w, h); mottle(g, w, h, rng, 2600, 0.07, 4);
  }, (g, w, h) => {
    const rng = mulberry32(seed + 1);
    for (const oy of [-h, 0, h]) {
      g.strokeStyle = 'rgba(70,60,48,0.75)'; g.lineWidth = 4; g.beginPath(); g.moveTo(-2, h + oy); g.lineTo(w + 2, oy); g.stroke();
    }
    for (let i = 0; i < 150; i++) {
      const x = rng() * w, yb = h - (x * h) / w, sc = 0.8 + rng() * 0.35, a = 0.55 + rng() * 0.4, kind = rng();
      for (const oy of [-h, 0, h]) {
        g.fillStyle = 'rgba(58,48,36,0.4)'; g.fillRect(x + h * 0.09 * sc, yb + oy - h * 0.7 * sc, h * 0.07, h * 0.66 * sc); // the shadowed hollow beside each figure
        g.fillStyle = `rgba(255,250,238,${a})`;
        if (kind < 0.8) { // a standing figure
          g.beginPath(); g.ellipse(x, yb + oy - h * 0.36 * sc, h * 0.085 * sc, h * 0.3 * sc, 0, 0, 7); g.fill();
          g.beginPath(); g.arc(x, yb + oy - h * 0.74 * sc, h * 0.075 * sc, 0, 7); g.fill();
        } else g.fillRect(x - h * 0.3, yb + oy - h * 0.55, h * 0.6, h * 0.45); // a wall, a boat, a wagon
      }
    }
  }, 2, 3.2);
  t.map.repeat.set(1, 23); t.normalMap.repeat.set(1, 23);
  return t;
}

// Inlaid floor of coloured marbles: squares holding diamonds and discs, as in the great halls.
function opusSectile(seed) {
  return tex(512, 512, (g, w, h) => {
    const rng = mulberry32(seed), S = w / 2;
    const stone = { white: '#ded7c9', yellow: '#cfa962', purple: '#6b3340', green: '#506a55', grey: '#8b8790', veined: '#cfc3c6' };
    const fill = (c) => { g.fillStyle = stone[c]; };
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const x = i * S, y = j * S, alt = (i + j) % 2;
      fill(alt ? 'veined' : 'white'); g.fillRect(x, y, S, S);
      fill(alt ? 'yellow' : 'grey'); g.fillRect(x + S * 0.09, y + S * 0.09, S * 0.82, S * 0.82);
      if (alt) { fill('purple'); g.beginPath(); g.arc(x + S / 2, y + S / 2, S * 0.33, 0, 6.283); g.fill(); fill('white'); g.beginPath(); g.arc(x + S / 2, y + S / 2, S * 0.12, 0, 6.283); g.fill(); }
      else { fill('yellow'); g.beginPath(); g.moveTo(x + S / 2, y + S * 0.12); g.lineTo(x + S * 0.88, y + S / 2); g.lineTo(x + S / 2, y + S * 0.88); g.lineTo(x + S * 0.12, y + S / 2); g.fill();
        fill('green'); g.fillRect(x + S * 0.36, y + S * 0.36, S * 0.28, S * 0.28); }
      g.strokeStyle = 'rgba(40,32,26,0.5)'; g.lineWidth = 1.2; g.strokeRect(x, y, S, S); g.strokeRect(x + S * 0.09, y + S * 0.09, S * 0.82, S * 0.82);
    }
    mottle(g, w, h, rng, 5000, 0.07, 6);
    g.lineWidth = 0.8;
    for (let k = 0; k < 40; k++) { let x = rng() * w, y = rng() * h, a = rng() * 6.283; g.strokeStyle = `rgba(255,255,255,${0.04 + rng() * 0.08})`; g.beginPath(); g.moveTo(x, y);
      for (let q = 0; q < 8; q++) { a += (rng() - 0.5); x += Math.cos(a) * 12; y += Math.sin(a) * 12; g.lineTo(x, y); } g.stroke(); }
  });
}

// One coffer of a timber ceiling: a frame of beams round a stepped, painted panel with a gilt rosette.
function coffers(seed) {
  return texFeat(256, 256, (g, w, h) => {
    const rng = mulberry32(seed); g.fillStyle = '#6a4a2c'; g.fillRect(0, 0, w, h); mottle(g, w, h, rng, 1800, 0.1, 5);
  }, (g, w, h) => {
    g.fillStyle = 'rgba(70,46,26,1)'; g.fillRect(w * 0.16, h * 0.16, w * 0.68, h * 0.68);
    g.fillStyle = 'rgba(38,26,18,1)'; g.fillRect(w * 0.23, h * 0.23, w * 0.54, h * 0.54);
    g.fillStyle = 'rgba(30,40,70,1)'; g.fillRect(w * 0.29, h * 0.29, w * 0.42, h * 0.42);
    g.fillStyle = 'rgba(214,170,78,1)'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.1, 0, 6.283); g.fill();
    for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283; g.beginPath(); g.arc(w / 2 + Math.cos(a) * w * 0.11, h / 2 + Math.sin(a) * w * 0.11, w * 0.045, 0, 6.283); g.fill(); }
  }, 1, 3);
}

function speckled(base, seed, n = 3000, amt = 0.1) {
  return tex(256, 256, (g, w, h) => { const rng = mulberry32(seed); g.fillStyle = base; g.fillRect(0, 0, w, h); mottle(g, w, h, rng, n, amt, 4); });
}

// ---------- painted walls with openings ----------

function plaster(g, w, h, rng, img) {
  if (!photoBase(g, w, h, img, '#f1eadc', 0.62, 2)) mottle(g, w, h, rng, 3000, 0.05, 5);
  for (let i = 0; i < 26; i++) {
    const x = rng() * w, len = 30 + rng() * 140;
    const gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, `rgba(70,55,40,${0.05 + rng() * 0.07})`); gr.addColorStop(1, 'rgba(70,55,40,0)');
    g.save(); g.translate(x, rng() * h); g.fillStyle = gr; g.fillRect(0, 0, 3 + rng() * 8, len); g.restore();
  }
}

// Upper storeys of an apartment block: 2 bays x 2 storeys per repeat.
function insulaWall(seed, img) {
  return texFeat(512, 512, (g, w, h) => plaster(g, w, h, mulberry32(seed), img), (g) => {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      const cx = c * 256 + 128, top = r * 256 + 70, ww = 72, wh = 104;
      g.fillStyle = 'rgba(60,45,30,0.16)'; g.fillRect(cx - ww / 2 - 4, top + wh, ww + 8, 40);
      g.fillStyle = '#6a4a2c'; g.fillRect(cx - ww / 2 - 5, top - 5, ww + 10, wh + 10);
      g.fillStyle = '#241f1b'; g.fillRect(cx - ww / 2, top, ww, wh);
      const kind = (r * 2 + c + seed) % 4;
      if (kind === 1 || kind === 2) {
        g.fillStyle = '#7a5733';
        const sw = kind === 1 ? ww / 2 : ww;
        g.fillRect(cx - ww / 2, top, sw, wh);
        g.fillStyle = 'rgba(30,18,8,0.45)';
        for (let y = top + 6; y < top + wh; y += 9) g.fillRect(cx - ww / 2, y, sw, 2);
      }
      g.fillStyle = '#d8cfbd'; g.fillRect(cx - ww / 2 - 9, top + wh + 5, ww + 18, 6);
      g.fillStyle = 'rgba(80,60,40,0.16)'; g.fillRect(c * 256, r * 256 + 252, 256, 3);
    }
  }, 2);
}

// Street level: shop openings (tabernae), 2 bays x 1 storey per repeat.
function shopWall(seed, img) {
  return texFeat(512, 256, (g, w, h) => {
    const rng = mulberry32(seed);
    plaster(g, w, h, rng, img);
    g.fillStyle = 'rgba(150,62,44,0.82)'; g.fillRect(0, h * 0.62, w, h * 0.38);
    mottle(g, w, h, rng, 1200, 0.06, 4);
  }, (g, w, h) => {
    for (let c = 0; c < 2; c++) {
      const x0 = c * 256 + (c ? 70 : 36), ow = c ? 116 : 184, top = 48;
      const gr = g.createLinearGradient(0, top, 0, h);
      gr.addColorStop(0, '#15110e'); gr.addColorStop(1, '#3d3128');
      g.fillStyle = gr; g.fillRect(x0, top, ow, h - top);
      g.fillStyle = '#5a3d22'; g.fillRect(x0 - 10, top - 14, ow + 20, 14);
      if (!c) { g.fillStyle = '#8a7a66'; g.fillRect(x0, h - 62, ow * 0.55, 62); g.fillStyle = '#b3a48e'; g.fillRect(x0, h - 66, ow * 0.55, 6); }
      else { g.fillStyle = '#6f4e2d'; g.fillRect(x0, top, ow * 0.45, h - top); }
    }
    g.fillStyle = 'rgba(40,30,22,0.35)'; g.fillRect(0, h - 5, w, 5);
  }, 2);
}

function seats(seed, img) {
  return tex(256, 256, (g, w, h) => {
    const rng = mulberry32(seed);
    if (!photoBase(g, w, h, img, '#d6cdba', 0.5, 1)) mottle(g, w, h, rng, 1800, 0.08);
    for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(40,30,20,0.45)'; g.fillRect(0, y, w, 5); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, y + 5, w, 4); }
  }, 2);
}

export async function makeMaterials() {
  const keys = Object.keys(PHOTO);
  const loaded = await Promise.all(keys.flatMap((k) => [loadImg(url(PHOTO[k], 'diff')), loadImg(url(PHOTO[k], 'nor_gl'))]));
  const D = {}, N = {};
  keys.forEach((k, i) => { D[k] = loaded[i * 2]; N[k] = loaded[i * 2 + 1] ? imgTex(loaded[i * 2 + 1], false) : null; });
  const photos = keys.filter((k) => D[k]).length;

  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, side: THREE.DoubleSide, ...o });
  const nm = (k, s = 1) => (N[k] ? { normalMap: N[k], normalScale: new THREE.Vector2(s, s) } : {});
  const ins = insulaWall(14, D.plaster), shp = shopWall(15, D.plaster), relief = new THREE.Vector2(1.6, 1.6);
  const T = {
    stone: D.stone ? washed(D.stone, '#efe8d8', 0.25) : ashlar(11),
    brick: D.brick ? imgTex(D.brick) : brick(12),
    roof: D.roof ? imgTex(D.roof) : roofTiles(13),
    stucco: D.plaster ? washed(D.plaster, '#ebe2d2', 0.6) : speckled('#ebe2d2', 20, 2500, 0.06),
    sand: D.sand ? washed(D.sand, '#d2bb90', 0.35) : speckled('#cdb68c', 19),
    ground: D.ground ? neutral(D.ground) : speckled('#f0f0f0', 21, 6000, 0.13),
    soft: speckled('#d4d4d4', 22, 9000, 0.16),
    seats: seats(18, D.stone),
  };
  const M = {
    marble: std({ map: T.stone, color: '#fffaf0', roughness: 0.8, ...nm('stone', 0.8) }),
    stone: std({ map: T.stone, color: '#b9ab94', ...nm('stone', 1.2) }),
    brick: std({ map: T.brick, color: D.brick ? '#e9c4a8' : '#ffffff', ...nm('brick') }),
    stucco: std({ map: T.stucco, ...nm('plaster', 0.5) }),
    roof: std({ map: T.roof, roughness: 0.85, ...nm('roof', 1.4) }),
    bronze: std({ color: '#d6ab4c', metalness: 0.2, roughness: 0.5, ...nm('roof', 0.8) }),
    gold: std({ color: '#e2b750', metalness: 0.35, roughness: 0.4 }),
    palace: std({ map: ins.map, normalMap: ins.normalMap, normalScale: relief, color: '#f5eee0' }),
    shop: std({ map: shp.map, normalMap: shp.normalMap, normalScale: relief }),
    seats: std({ map: T.seats }),
    void: std({ color: '#2b231c', roughness: 1 }),   // the dark behind an opening
    wood: std({ color: '#6b4a2c', roughness: 0.9 }),
    sand: std({ map: T.sand, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...nm('sand', 0.6) }),
    dark: std({ color: '#3a2a1b', metalness: 0.35, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    // untextured variants for round primitives
    marbleFlat: std({ color: '#efe8da', roughness: 0.75 }),
    column: std({ color: '#f1ebdf', roughness: 0.7, normalMap: flutes(), normalScale: new THREE.Vector2(1, 1) }),
    fine: std({ map: fineMarble(31), color: '#e9dfcc', roughness: 0.62 }),
    ashlar: (() => { const t = marbleBlocks(32); return std({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1, 1), color: '#e6dbc6', roughness: 0.68 }); })(),
    travertine: (() => { const t = marbleBlocks(36, 8, 3); return std({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1.3, 1.3), color: '#d9c7a6', roughness: 0.86 }); })(),
    // awning cloth: a little self-lit so the underside looks like sun coming through linen
    awning: std({ color: '#e6d8ba', roughness: 1, emissive: '#7a6644', emissiveIntensity: 0.55 }),
    awningRed: std({ color: '#a8503a', roughness: 1, emissive: '#5a2418', emissiveIntensity: 0.55 }),
    plank: std({ color: '#a98758', roughness: 0.95 }),
    // fire: a see-through, self-lit sheet that licks and tears as it rises (v runs from base to tip)
    flame: new THREE.ShaderMaterial({
      uniforms: FLAME, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `uniform float uTime; varying vec2 vUv; varying float vPh;
        void main(){
          vUv = uv; vec3 p = position; float k = uv.y * uv.y;
          vPh = floor(p.x * 0.5) * 1.7 + floor(p.z * 0.5) * 2.3;      // a different rhythm for each fire
          float t = uTime + vPh;
          p.x += (sin(t * 7.3 + p.y * 5.0) + 0.6 * sin(t * 13.1 + p.z * 9.0)) * 0.085 * k;
          p.z += (cos(t * 6.1 + p.y * 6.0) + 0.6 * sin(t * 11.7 + p.x * 9.0)) * 0.085 * k;
          p.y += (sin(t * 9.0) * 0.5 + sin(t * 15.7 + uv.x * 6.283) * 0.5) * 0.16 * k;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vPh;
        void main(){
          float t = uTime + vPh, a = vUv.x * 6.2832;
          float n = sin(a * 3.0 + vUv.y * 9.0 - t * 8.0) * sin(a * 5.0 - vUv.y * 13.0 + t * 5.5) * 0.5 + 0.5;
          n = mix(n, sin(a * 2.0 + t * 3.0 - vUv.y * 20.0) * 0.5 + 0.5, 0.4);
          float body = clamp(1.25 * (1.0 - vUv.y) - n * vUv.y * 1.1, 0.0, 1.0);
          vec3 col = mix(vec3(1.0, 0.82, 0.42), vec3(1.0, 0.3, 0.04), smoothstep(0.0, 0.85, vUv.y + n * 0.25));
          gl_FragColor = vec4(col * body * body * 2.6, 1.0);
        }`,
    }),
    floor: std({ map: opusSectile(34), roughness: 0.32 }),
    coffer: (() => { const t = coffers(35); return std({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(2, 2), roughness: 0.7 }); })(),
    glow: std({ color: '#000000', emissive: '#e4ecff', emissiveIntensity: 2.2 }), // daylight seen through a window from indoors
    columnFine: std({ color: '#e4dac6', roughness: 0.66 }), // fully modelled columns: the flutes are real
    door: std({ color: '#7a6238', metalness: 0.45, roughness: 0.45 }),
    roofFlat: std({ color: '#b26c47' }),
    brickFlat: std({ color: '#a9643f' }),
    spiral: (() => { const t = spiralRelief(52); return std({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(3, 3), color: '#ddd2ba', roughness: 0.7 }); })(),
    imperial: std({ map: T.stucco, color: '#fbe9c2', roughness: 0.85, ...nm('plaster', 0.4) }), // the painted stucco of the palace walls, kept in repair
    lead: std({ color: '#8e8c86', roughness: 0.7, metalness: 0.05, envMapIntensity: 0.6 }), // sheet lead over the domes
    basket: std({ color: '#b3915a', roughness: 1 }),
    pool: std({ color: '#4f7074', roughness: 0.08, metalness: 0.15 }), // still water in a street fountain
    fruit: std({ color: '#8a3b2b', roughness: 0.7 }),
    greens: std({ color: '#6f7a3c', roughness: 0.9 }),
    granite: std({ color: '#a3563f', roughness: 0.6 }),
    foliageDark: std({ color: '#5a7a48', roughness: 1, vertexColors: true }),
    foliage: std({ color: '#7d9a55', roughness: 1, vertexColors: true }),
    trunk: std({ color: '#5b4632', roughness: 1 }),
    ground: (() => { const t = basalt(41, D.ground); return std({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1.5, 1.5), vertexColors: true, roughness: 0.95, side: THREE.FrontSide }); })(),
    water: std({ color: '#6c6b47', roughness: 0.22, metalness: 0.1, side: THREE.FrontSide }),
    far: std({ color: '#a89f8b', roughness: 1, side: THREE.FrontSide }),
  };
  const tints = ['#f1e3c6', '#e9cb93', '#e2b98f', '#dba682', '#f5f0e7', '#d39876'];
  M.plaster = tints.map((c) => std({ map: ins.map, normalMap: ins.normalMap, normalScale: relief, color: c }));
  // the same colours as bare plaster, for house fronts whose windows and shops are built rather than painted
  M.plain = tints.map((c) => std({ map: T.stucco, color: c, ...nm('plaster', 0.6) }));

  const slabs = marbleBlocks(33, 6, 4);
  // The ground shows paving only where `aPave` says so; grass, earth and sand get a soft grain instead.
  M.ground.userData.patch = (shader) => {
    shader.uniforms.map2 = { value: T.soft };
    shader.uniforms.map3 = { value: slabs.map };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPave;\nvarying float vPave;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPave = aPave;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPave;\nuniform sampler2D map2, map3;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv * 0.5 );   // one repeat of the paving is 9 m across
        // drifts of dust and trodden earth lying over the stones, and patches worn smooth
        float gDust = smoothstep( 0.5, 0.8, texture2D( wNoise, vMapUv * 0.43 ).r * 0.6 + texture2D( wNoise, vMapUv * 0.09 ).g * 0.4 ) * 0.7;
        float gWorn = smoothstep( 0.45, 0.75, texture2D( wNoise, vMapUv * 0.27 ).b );
        sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, vec3( 1.02, 0.95, 0.82 ) * ( 0.82 + 0.18 * sampledDiffuseColor.g ), gDust );
        vec3 softGrain = texture2D( map2, vMapUv * 0.37 ).rgb * 1.12;
        // squares and precincts are laid in rectangular slabs, set out on the Forum's axis
        float slab = clamp( vPave - 1.0, 0.0, 1.0 );
        vec2 sw = vMapUv * 4.5;
        vec2 su = vec2( sw.x * 0.9063 + sw.y * 0.4226, sw.x * 0.4226 - sw.y * 0.9063 ) / 4.8;
        sampledDiffuseColor.rgb = mix( softGrain, sampledDiffuseColor.rgb, min( vPave, 1.0 ) );
        sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, texture2D( map3, su ).rgb, slab );
        diffuseColor *= sampledDiffuseColor;
      #endif`)
      .replace('#include <normal_fragment_maps>', 'vec3 flatN = normal;\n#include <normal_fragment_maps>\nnormal = normalize( mix( flatN, normal, min( vPave, 1.0 ) * ( 1.0 - 0.85 * clamp( vPave - 1.0, 0.0, 1.0 ) ) * ( 1.0 - 0.75 * gDust ) ) );')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.48, min( vPave, 1.0 ) * ( 1.0 - clamp( vPave - 1.0, 0.0, 1.0 ) ) * ( 1.0 - gDust ) * gWorn * smoothstep( 0.45, 0.7, sampledDiffuseColor.g ) );');
  };

  // name -> [material, tile size in metres (1 = caller supplies texture coordinates)]
  const bufs = {
    marble: [M.marble, 4.2], stone: [M.stone, 4.2], brick: [M.brick, 2.6], stucco: [M.stucco, 4],
    roof: [M.roof, 2.6], bronze: [M.bronze, 2.6], gold: [M.gold, 1], palace: [M.palace, 6.4],
    shop: [M.shop, 1], seats: [M.seats, 5.6], sand: [M.sand, 3], dark: [M.dark, 1], void: [M.void, 1], wood: [M.wood, 1], door: [M.door, 1], fine: [M.fine, 3], ashlar: [M.ashlar, 4.8], floor: [M.floor, 2.4], awning: [M.awning, 1], awningRed: [M.awningRed, 1], flame: [M.flame, 1], plank: [M.plank, 1], travertine: [M.travertine, 4.8], coffer: [M.coffer, 1.5], glow: [M.glow, 1], imperial: [M.imperial, 4], pool: [M.pool, 1], greens: [M.greens, 2],
  };
  M.plaster.forEach((m, i) => { bufs['plaster' + i] = [m, 1]; });
  M.plain.forEach((m, i) => { bufs['plain' + i] = [m, 4]; });
  // how strongly each surface weathers (marble was kept clean; plaster and tile were not)
  WEATHER.wNoise.value = noiseTex(77);
  const age = { marble: 0.55, stone: 1, brick: 0.9, stucco: 1, roof: 1, palace: 0.6, shop: 1, seats: 0.7, sand: 0.5,
    marbleFlat: 0.55, column: 0.55, columnFine: 0.9, door: 0.5, fine: 0.9, ashlar: 0.95, floor: 0.35, coffer: 0.3, awning: 0.7, awningRed: 0.7, plank: 0.9, travertine: 1, roofFlat: 1, brickFlat: 0.9, spiral: 0.7, imperial: 0.3, lead: 0.4, granite: 0.4, ground: 0.6, wood: 0.6, far: 0.5 };
  for (const k in age) M[k].userData.weather = age[k];
  M.plaster.forEach((m) => { m.userData.weather = 1.1; });
  M.plain.forEach((m) => { m.userData.weather = 1.1; });
  const all = [...Object.values(M).filter((m) => m.isMaterial && !m.isShaderMaterial), ...M.plaster, ...M.plain];
  return { M, bufs, all, plasterCount: tints.length, photos, photoTotal: keys.length };
}
