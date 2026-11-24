import * as THREE from 'three';
import { lerp, clamp, smooth, rad, fbm, polyDist } from './util.js';

const COLORS = {
  city: '#9a917f', paved: '#d2cab8', sand: '#cdb68c', garden: '#6f7d49', grass: '#7c8450', scrub: '#6c6a47',
  road: '#5f5b56', mud: '#5d5a42',
};

// Heightfield for the valleys and hills, flattened under each building's footprint ("pad").
export class Terrain {
  constructor({ bounds, step = 3, levels, hills, pads, roads, river }) {
    this.b = bounds; this.step = step; this.levels = levels; this.roads = roads; this.river = river;
    this.hills = hills.map((h) => ({ ...h, sb: Math.sin(rad(h.bearing)), cb: Math.cos(rad(h.bearing)) }));
    this.pads = [];
    this.nx = Math.floor((bounds.maxX - bounds.minX) / step) + 1;
    this.nz = Math.floor((bounds.maxZ - bounds.minZ) / step) + 1;
    this.H = new Float32Array(this.nx * this.nz);
    this.setPads(pads);
  }

  setPads(pads) {
    this.pads = pads.map((p) => ({ ...p, cos: Math.cos(p.a), sin: Math.sin(p.a), R: Math.hypot(p.hw, p.hd) + (p.blend ?? 10) + 2 }));
  }

  hillF(h, x, z) {
    const dx = x - h.x, dz = z - h.z;
    const al = dx * h.sb - dz * h.cb, pe = dx * h.cb + dz * h.sb;
    const q = Math.hypot(al / h.ra, pe / h.rb);
    return 1 - smooth(0, h.fall, (q - 1) * Math.min(h.ra, h.rb));
  }

  // Natural ground before any building pads are cut in.
  base(x, z) {
    let sw = 0, sh = 0;
    for (const c of this.levels) {
      const d2 = (x - c[0]) ** 2 + (z - c[1]) ** 2 + 10000, w = 1 / (d2 * d2);
      sw += w; sh += w * c[2];
    }
    let h = sh / sw + (fbm(x / 90, z / 90) - 0.5) * 2.5;
    for (const hl of this.hills) {
      const f = this.hillF(hl, x, z);
      if (f > 0) { const top = hl.h + (fbm(x / 60 + 7, z / 60) - 0.5) * 3; h += Math.max(0, top - h) * f; }
    }
    return h;
  }

  // Strongest "no housing" hill influence at a point (0..1).
  noHouse(x, z) {
    let m = 0;
    for (const h of this.hills) if (h.noHousing) m = Math.max(m, this.hillF(h, x, z));
    return m;
  }

  padDist(p, x, z) {
    const dx = x - p.cx, dz = z - p.cz;
    if (Math.abs(dx) > p.R + 40 || Math.abs(dz) > p.R + 40) return Infinity;
    const lx = dx * p.cos - dz * p.sin, lz = dx * p.sin + dz * p.cos;
    if (p.ellipse) return (Math.hypot(lx / p.hw, lz / p.hd) - 1) * Math.min(p.hw, p.hd);
    const ex = Math.abs(lx) - p.hw, ez = Math.abs(lz) - p.hd;
    return ex > 0 || ez > 0 ? Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) : Math.max(ex, ez);
  }

  // Last pad within `margin` of the point (later pads sit on top of earlier ones), or null.
  padAt(x, z, margin = 0) {
    for (let i = this.pads.length - 1; i >= 0; i--) if (this.padDist(this.pads[i], x, z) < margin) return this.pads[i];
    return null;
  }

  roadDist(x, z) {
    let best = Infinity;
    for (const r of this.roads) best = Math.min(best, polyDist(x, z, r.pts) - r.w / 2);
    return best;
  }

  riverDist(x, z) { return polyDist(x, z, this.river); }

  build(material) {
    const { nx, nz, step, b, H } = this;
    const col = new Float32Array(nx * nz * 3);
    const C = {};
    for (const k in COLORS) { const c = new THREE.Color(COLORS[k]); C[k] = [c.r, c.g, c.b]; }
    const padT = new Float32Array(nx * nz), padK = new Array(nx * nz).fill(null), pave = new Float32Array(nx * nz);

    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = b.minX + i * step, z = b.minZ + j * step, k = j * nx + i;
      let h = this.base(x, z);
      for (const p of this.pads) {
        const d = this.padDist(p, x, z);
        if (d === Infinity) continue;
        if (p.flatten && d < p.blend) h = lerp(h, p.ground, 1 - smooth(0, p.blend, d));
        if (p.color && d < 2) { padT[k] = 1 - smooth(-1, 2, d); padK[k] = p.color; }
        else if (d < 0) { padT[k] = 0; padK[k] = null; }
      }
      const rd = this.riverDist(x, z);
      if (rd < 90) h = lerp(4.5, h, smooth(35, 90, rd));
      H[k] = h;
    }

    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = b.minX + i * step, z = b.minZ + j * step, k = j * nx + i;
      const hl = H[j * nx + Math.max(i - 1, 0)], hr = H[j * nx + Math.min(i + 1, nx - 1)];
      const hu = H[Math.max(j - 1, 0) * nx + i], hd = H[Math.min(j + 1, nz - 1) * nx + i];
      const slope = Math.max(Math.abs(hr - hl), Math.abs(hd - hu)) / (2 * step);
      let c = C.city.slice(), pv = 1; // pv: how much stone paving shows here (0 = grass, earth, sand)
      const mix = (to, t, paved) => { c[0] = lerp(c[0], to[0], t); c[1] = lerp(c[1], to[1], t); c[2] = lerp(c[2], to[2], t); pv = lerp(pv, paved, t); };
      const n = fbm(x / 14, z / 14);
      mix(C.grass, clamp(this.noHouse(x, z) * 1.6, 0, 1) * (0.55 + n * 0.45), 0);
      mix(C.scrub, smooth(0.25, 0.6, slope), 0);
      const rdist = this.roadDist(x, z);
      if (rdist < 1.5) mix(C.road, 1 - smooth(-0.5, 1.5, rdist), 1);
      if (padK[k]) mix(C[padK[k]], padT[k], padK[k] === 'paved' ? 2 : 0); // 2 = dressed slabs rather than street cobbles
      if (H[k] < 7.6) mix(C.mud, 1 - smooth(6.6, 7.6, H[k]), 0);
      pave[k] = pv;
      const shade = 0.88 + n * 0.24;
      col[k * 3] = c[0] * shade; col[k * 3 + 1] = c[1] * shade; col[k * 3 + 2] = c[2] * shade;
    }

    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = b.minX + i * step, z = b.minZ + j * step;
      pos[k * 3] = x; pos[k * 3 + 1] = H[k]; pos[k * 3 + 2] = z;
      uv[k * 2] = x / 4.5; uv[k * 2 + 1] = z / 4.5;
    }
    // One set of vertices, drawn as tiles of 160 x 160 squares so off-screen ground is skipped.
    const position = new THREE.BufferAttribute(pos, 3), color = new THREE.BufferAttribute(col, 3);
    const uvAttr = new THREE.BufferAttribute(uv, 2), paveAttr = new THREE.BufferAttribute(pave, 1);
    const whole = new THREE.BufferGeometry();
    whole.setAttribute('position', position);
    const all = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i; all.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1); }
    whole.setIndex(all); whole.computeVertexNormals();
    const normal = whole.getAttribute('normal');
    const group = new THREE.Group(); group.name = 'terrain';
    const T = 160;
    for (let tj = 0; tj < nz - 1; tj += T) for (let ti = 0; ti < nx - 1; ti += T) {
      const idx = [];
      let lo = Infinity, hi = -Infinity;
      const i1 = Math.min(ti + T, nx - 1), j1 = Math.min(tj + T, nz - 1);
      for (let j = tj; j < j1; j++) for (let i = ti; i < i1; i++) {
        const a = j * nx + i; idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
        lo = Math.min(lo, H[a]); hi = Math.max(hi, H[a]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', position); g.setAttribute('normal', normal); g.setAttribute('color', color);
      g.setAttribute('uv', uvAttr); g.setAttribute('aPave', paveAttr);
      g.setIndex(idx);
      const x0 = b.minX + ti * step, x1 = b.minX + i1 * step, z0 = b.minZ + tj * step, z1 = b.minZ + j1 * step;
      const c = new THREE.Vector3((x0 + x1) / 2, (lo + hi) / 2, (z0 + z1) / 2);
      g.boundingSphere = new THREE.Sphere(c, Math.hypot(x1 - x0, z1 - z0, hi - lo) / 2 + 4);
      const mesh = new THREE.Mesh(g, material);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }

  // Height of the built mesh at any point.
  h(x, z) {
    const { nx, nz, step, b, H } = this;
    const fx = clamp((x - b.minX) / step, 0, nx - 1.001), fz = clamp((z - b.minZ) / step, 0, nz - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * nx + i;
    return lerp(lerp(H[k], H[k + 1], u), lerp(H[k + nx], H[k + nx + 1], u), v);
  }
}

// Things the walker cannot pass through, or can stand on. Each returns the height of its top
// at a point (or -Infinity when the point is outside it). Low tops and ramps can be climbed.
export class Solids {
  constructor(cell = 20) { this.cell = cell; this.map = new Map(); this.count = 0; }

  _add(s) {
    const c = this.cell;
    for (let ix = Math.floor((s.minx + 4000) / c); ix <= Math.floor((s.maxx + 4000) / c); ix++)
      for (let iz = Math.floor((s.minz + 4000) / c); iz <= Math.floor((s.maxz + 4000) / c); iz++) {
        const key = ix * 4096 + iz;
        let l = this.map.get(key);
        if (!l) this.map.set(key, (l = []));
        l.push(s);
      }
    this.count++;
  }

  // Oriented box; top runs from y0 at local z = -hd to y1 at z = +hd (equal for a flat top).
  // `thick` makes it a slab that far down from its top, with open space beneath: an upper floor,
  // a flight of stairs, a pier standing on an upper floor. Without it the solid runs to the ground.
  addOBB(cx, cz, hw, hd, a, y0, y1 = y0, thick) {
    const c = Math.cos(a), s = Math.sin(a), R = Math.hypot(hw, hd);
    this._add({
      minx: cx - R, maxx: cx + R, minz: cz - R, maxz: cz + R, thick,
      fn: (x, z) => {
        const dx = x - cx, dz = z - cz, lx = dx * c - dz * s;
        if (lx < -hw || lx > hw) return -Infinity;
        const lz = dx * s + dz * c;
        if (lz < -hd || lz > hd) return -Infinity;
        return y0 === y1 ? y0 : y0 + ((y1 - y0) * (lz + hd)) / (2 * hd);
      },
    });
  }

  addCustom(cx, cz, R, fn, thick) { this._add({ minx: cx - R, maxx: cx + R, minz: cz - R, maxz: cz + R, fn, thick }); }

  at(x, z) { return this.map.get(Math.floor((x + 4000) / this.cell) * 4096 + Math.floor((z + 4000) / this.cell)) || EMPTY; }

  inside(x, z) { for (const s of this.at(x, z)) if (s.fn(x, z) !== -Infinity) return true; return false; }
}
const EMPTY = [];
