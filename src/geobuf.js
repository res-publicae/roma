import * as THREE from 'three';

const CELL = 520;

// Accumulates quads and triangles for one material, already transformed into world space,
// so the whole city ends up as a handful of draw calls.
export class GeoBuf {
  constructor(ctx, material, tu = 1, tv = tu) {
    this.ctx = ctx; this.material = material; this.tu = tu; this.tv = tv;
    this.cells = new Map(); this._use(0, 0);
  }

  // Geometry is filed by which 520 m square of the city it stands in, and each square becomes
  // its own mesh. The renderer can then skip squares that are out of view, which matters most
  // for the shadow maps: the nearest one only covers a few dozen metres.
  _use(x, z) {
    const key = Math.floor(x / CELL) * 4096 + Math.floor(z / CELL);
    let c = this.cells.get(key);
    if (!c) this.cells.set(key, (c = { pos: [], nrm: [], uv: [], idx: [] }));
    this.pos = c.pos; this.nrm = c.nrm; this.uv = c.uv; this.idx = c.idx;
  }

  _p(p) {
    const e = this.ctx.matrix.elements, x = p[0], y = p[1], z = p[2];
    return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
  }

  // Corners a,b,c,d in order round the face. Without `uv`, texture coordinates follow real size
  // (u along a->b, v along a->d) divided by the buffer's tile size. `uv` = [u0, v0, u1, v1] overrides.
  quad(a, b, c, d, uv) {
    const A = this._p(a), B = this._p(b), C = this._p(c), D = this._p(d);
    this._use(A[0], A[2]);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = D[0] - A[0], vy = D[1] - A[1], vz = D[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9) return;
    nx /= nl; ny /= nl; nz /= nl;
    let u0 = 0, v0 = 0, u1, v1;
    if (uv) { [u0, v0, u1, v1] = uv; } else { u1 = Math.hypot(ux, uy, uz) / this.tu; v1 = Math.hypot(vx, vy, vz) / this.tv; }
    const i = this.pos.length / 3;
    this.pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], D[0], D[1], D[2]);
    this.nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  // Quad with a texture coordinate given for each corner.
  quadUV(a, b, c, d, ta, tb, tc, td) {
    const A = this._p(a), B = this._p(b), C = this._p(c), D = this._p(d);
    this._use(A[0], A[2]);
    // normal from the two diagonals, so a quad with one collapsed edge still works
    const ux = C[0] - A[0], uy = C[1] - A[1], uz = C[2] - A[2];
    const vx = D[0] - B[0], vy = D[1] - B[1], vz = D[2] - B[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9) return;
    nx /= nl; ny /= nl; nz /= nl;
    const i = this.pos.length / 3;
    this.pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], D[0], D[1], D[2]);
    this.nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.uv.push(ta[0], ta[1], tb[0], tb[1], tc[0], tc[1], td[0], td[1]);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  tri(a, b, c) {
    const A = this._p(a), B = this._p(b), C = this._p(c);
    this._use(A[0], A[2]);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9) return;
    nx /= nl; ny /= nl; nz /= nl;
    const ul = Math.hypot(ux, uy, uz) || 1;
    const along = (vx * ux + vy * uy + vz * uz) / ul;
    const up = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - along * along));
    const i = this.pos.length / 3;
    this.pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
    this.nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.uv.push(0, 0, ul / this.tu, 0, along / this.tu, up / this.tv);
    this.idx.push(i, i + 1, i + 2);
  }

  // One mesh per occupied square.
  build(name) {
    const out = [];
    for (const c of this.cells.values()) {
      if (!c.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(c.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(c.uv, 2));
      g.setIndex(c.idx);
      const m = new THREE.Mesh(g, this.material);
      m.name = name; m.castShadow = true; m.receiveShadow = true;
      out.push(m);
    }
    return out;
  }
}

// ---- shape helpers (all in the current local frame) ----

// opts.top: true (same buffer), false, or another GeoBuf (e.g. roof tiles).
export function box(buf, x0, x1, y0, y1, z0, z1, opts = {}) {
  const { top = true, bottom = false } = opts;
  buf.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  buf.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
  buf.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
  buf.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
  if (top) (top === true ? buf : top).quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
  if (bottom) buf.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
}

// Foundation hidden below ground so buildings on slopes never float.
export function skirt(buf, x0, x1, z0, z1, depth = 10) { box(buf, x0, x1, -depth, 0, z0, z1, { top: false }); }

// Box whose sides are tiled one texture repeat per bay and per storey (arcades, shopfronts).
export function arcBox(buf, x0, x1, y0, y1, z0, z1, bay, storeys = 1) {
  const nx = Math.max(1, Math.round((x1 - x0) / bay)), nz = Math.max(1, Math.round((z1 - z0) / bay));
  buf.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, nx, storeys]);
  buf.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, nx, storeys]);
  buf.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [0, 0, nz, storeys]);
  buf.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [0, 0, nz, storeys]);
}

// Pitched roof over a rectangle. Ridge runs along z unless alongX.
export function gable(roofBuf, wallBuf, x0, x1, y, z0, z1, { rise, over = 0.5, alongX = false }) {
  if (!alongX) {
    const xm = (x0 + x1) / 2, hw = (x1 - x0) / 2, ye = y - (over * rise) / hw, yr = y + rise;
    roofBuf.quad([x0 - over, ye, z0 - over], [x0 - over, ye, z1 + over], [xm, yr, z1 + over], [xm, yr, z0 - over]);
    roofBuf.quad([x1 + over, ye, z1 + over], [x1 + over, ye, z0 - over], [xm, yr, z0 - over], [xm, yr, z1 + over]);
    wallBuf.tri([x0, y, z1], [x1, y, z1], [xm, yr, z1]);
    wallBuf.tri([x1, y, z0], [x0, y, z0], [xm, yr, z0]);
  } else {
    const zm = (z0 + z1) / 2, hd = (z1 - z0) / 2, ye = y - (over * rise) / hd, yr = y + rise;
    roofBuf.quad([x1 + over, ye, z0 - over], [x0 - over, ye, z0 - over], [x0 - over, yr, zm], [x1 + over, yr, zm]);
    roofBuf.quad([x0 - over, ye, z1 + over], [x1 + over, ye, z1 + over], [x1 + over, yr, zm], [x0 - over, yr, zm]);
    wallBuf.tri([x1, y, z1], [x1, y, z0], [x1, yr, zm]);
    wallBuf.tri([x0, y, z0], [x0, y, z1], [x0, yr, zm]);
  }
}

// Sweep a cross-section along a row of "ribs". Each rib runs from an inner point (s=0) to an
// outer point (s=1); the profile is a list of [s, height]. Used for seating banks.
export function sweepRibs(buf, ribs, profile, { capBuf = null } = {}) {
  const P = (r, s, y) => [r.x0 + (r.x1 - r.x0) * s, y, r.z0 + (r.z1 - r.z0) * s];
  for (let i = 0; i < ribs.length - 1; i++) {
    const r = ribs[i], q = ribs[i + 1];
    for (let j = 0; j < profile.length - 1; j++) {
      const [s0, y0] = profile[j], [s1, y1] = profile[j + 1];
      buf.quad(P(r, s0, y0), P(q, s0, y0), P(q, s1, y1), P(r, s1, y1));
    }
  }
  if (capBuf) {
    for (const r of [ribs[0], ribs[ribs.length - 1]]) {
      for (let j = 0; j < profile.length - 1; j++) {
        const [s0, y0] = profile[j], [s1, y1] = profile[j + 1];
        if (s1 > s0) capBuf.quad(P(r, s0, 0), P(r, s1, 0), P(r, s1, y1), P(r, s0, y0));
      }
    }
  }
}

export function fan(buf, a, b, y, n = 48, cx = 0, cz = 0) {
  for (let i = 0; i < n; i++) {
    const p = (i / n) * Math.PI * 2, q = ((i + 1) / n) * Math.PI * 2;
    buf.tri([cx, y, cz], [cx + a * Math.cos(q), y, cz + b * Math.sin(q)], [cx + a * Math.cos(p), y, cz + b * Math.sin(p)]);
  }
}

// Run a moulding profile along a path of [x, z] points with mitred corners. The profile is a
// list of [distance out from the path, height]. `closed` joins the last point back to the first.
export function sweep(buf, path, profile, closed = true) {
  const n = path.length;
  let cx = 0, cz = 0; for (const p of path) { cx += p[0] / n; cz += p[1] / n; }
  const en = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = path[i], b = path[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    let nx = dz / l, nz = -dx / l;
    if (nx * ((a[0] + b[0]) / 2 - cx) + nz * ((a[1] + b[1]) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
    en.push([nx, nz]);
  }
  const mit = path.map((p, i) => {
    const e1 = en[closed ? (i + n - 1) % n : Math.max(i - 1, 0)], e2 = en[closed ? i : Math.min(i, n - 2)];
    const k = 1 + e1[0] * e2[0] + e1[1] * e2[1];
    return [(e1[0] + e2[0]) / k, (e1[1] + e2[1]) / k];
  });
  const P = (i, [o, y]) => [path[i][0] + mit[i][0] * o, y, path[i][1] + mit[i][1] * o];
  for (let i = 0; i < en.length; i++) {
    const j = (i + 1) % n;
    for (let k = 0; k < profile.length - 1; k++) buf.quad(P(i, profile[k]), P(j, profile[k]), P(j, profile[k + 1]), P(i, profile[k + 1]));
  }
}

// A standing draped figure, turned like a chess piece and flattened front to back.
const FIGURE = [[0.15, 0], [0.16, 0.03], [0.125, 0.07], [0.135, 0.3], [0.11, 0.5], [0.125, 0.62], [0.16, 0.74], [0.13, 0.8],
  [0.05, 0.83], [0.065, 0.87], [0.072, 0.92], [0.05, 0.975], [0, 1]];
export function figure(buf, x, y, z, h, turn = 0) {
  const N = 8, pt = (i, [r, v]) => { const a = (i / N) * Math.PI * 2 + turn; return [x + Math.cos(a) * r * h, y + v * h, z + Math.sin(a) * r * h * 0.72]; };
  for (let i = 0; i < N; i++) for (let k = 0; k < FIGURE.length - 1; k++) buf.quad(pt(i, FIGURE[k]), pt(i + 1, FIGURE[k]), pt(i + 1, FIGURE[k + 1]), pt(i, FIGURE[k + 1]));
}

// Four-sided bar from point a to point b, r thick: an arm, a spear shaft, a strut.
export function limb(buf, a, b, r) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dl = Math.hypot(...d) || 1, up = Math.abs(d[1]) > 0.9 * dl;
  const cr = (p, q2) => [p[1] * q2[2] - p[2] * q2[1], p[2] * q2[0] - p[0] * q2[2], p[0] * q2[1] - p[1] * q2[0]];
  const nm = (p) => { const l = Math.hypot(...p) || 1; return [p[0] / l, p[1] / l, p[2] / l]; };
  const u = up ? [1, 0, 0] : nm(cr(d, [0, 1, 0])), v = nm(cr(d, u));
  const o = [0, 1, 2, 3].map((k) => { const an = k * Math.PI / 2 + Math.PI / 4, c = Math.cos(an) * r * 1.414, s = Math.sin(an) * r * 1.414; return [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s]; });
  const P = (p, k) => [p[0] + o[k][0], p[1] + o[k][1], p[2] + o[k][2]];
  for (let k = 0; k < 4; k++) buf.quad(P(a, k), P(a, (k + 1) % 4), P(b, (k + 1) % 4), P(b, k));
  buf.quad(P(b, 0), P(b, 1), P(b, 2), P(b, 3));
}

// A statue: the draped figure given arms, turned to face `face` (0 = local +z), and varied by
// `kind` so a row of them is not a row of copies: marble or gilded bronze, a man in a toga or
// a woman in a long robe, some holding a spear.
const ROBED = [[0.17, 0], [0.175, 0.03], [0.15, 0.08], [0.14, 0.3], [0.115, 0.52], [0.105, 0.6], [0.135, 0.72], [0.115, 0.79],
  [0.05, 0.83], [0.062, 0.86], [0.076, 0.92], [0.062, 0.97], [0.035, 1.0], [0, 1.01]];
//
// `kind` is a role, saying who the statue shows, so the right sculpture can be drawn for it:
//   'magistrate' a man in a toga        'general'  a general in a cuirass (bronze)
//   'woman'      a woman in a mantle    'priest'   a man with his toga drawn over his head
//   'dacian'     a Dacian prisoner      'caryatid' a maiden carrying a cornice
//   'rider'      a figure on a horse or in a chariot (stays the simple figure: the sculptures stand)
//   'figure'     a small figure in a relief or on a keystone (stays the simple figure)
// A number 0-3 picks magistrate, general, woman or priest in turn, for rows of varied statues.
//
// In the city, statues are not drawn here: they are recorded on the build context (ctx.statues)
// and drawn later as instances, detailed near the viewer and simple further off (statues.js).
// Called with buffers that have no such list (the statue preview page), the simple figure is drawn.
export const STATUE_ROLES = { magistrate: 0, general: 1, woman: 2, priest: 3, dacian: 0, caryatid: 2, rider: 3, figure: 0 };
const ROLE_OF = ['magistrate', 'general', 'woman', 'priest'];
export function statue(B, x, y, z, h, face = 0, kind = 0) {
  const role = typeof kind === 'string' ? kind : ROLE_OF[((kind % 4) + 4) % 4], k = STATUE_ROLES[role] ?? 0, bronze = role === 'general';
  const ctx = B.fine.ctx;
  if (ctx && ctx.statues) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(ctx.matrix);
    ctx.statues.push({ x: p.x, y: p.y, z: p.z, h, face: ctx.rot + face, role, kind: k,
      body: (bronze ? B.bronze : B.fine).material, spear: (bronze ? B.gold : B.bronze).material });
    return;
  }
  drawStatue(B, x, y, z, h, face, k);
}

// The simple statue, drawn into buffers: the far version, about 250 triangles.
export function drawStatue(B, x, y, z, h, face = 0, kind = 0) {
  const k = ((kind % 4) + 4) % 4, buf = k === 1 ? B.bronze : B.fine, prof = k === 2 ? ROBED : FIGURE;
  const c = Math.cos(face), s = Math.sin(face), N = 8;
  const W = (lx, ly, lz) => [x + (lx * c + lz * s) * h, y + ly * h, z + (-lx * s + lz * c) * h];
  const pt = (i, [r, v]) => { const a = (i / N) * Math.PI * 2; return W(Math.cos(a) * r, v, Math.sin(a) * r * 0.72); };
  for (let i = 0; i < N; i++) for (let j = 0; j < prof.length - 1; j++) buf.quad(pt(i, prof[j]), pt(i + 1, prof[j]), pt(i + 1, prof[j + 1]), pt(i, prof[j + 1]));
  const spear = k === 1 || k === 3;
  limb(buf, W(-0.145, 0.765, 0), W(-0.17, 0.6, 0.03), 0.03 * h); limb(buf, W(-0.17, 0.6, 0.03), W(-0.12, 0.5, 0.11), 0.026 * h); // left arm, bent across the body
  if (spear) {
    limb(buf, W(0.145, 0.765, 0), W(0.21, 0.7, 0.05), 0.03 * h); limb(buf, W(0.21, 0.7, 0.05), W(0.25, 0.84, 0.07), 0.026 * h);
    limb(k === 1 ? B.gold : B.bronze, W(0.26, 0, 0.08), W(0.26, 1.22, 0.08), 0.011 * h);
    limb(k === 1 ? B.gold : B.bronze, W(0.26, 1.22, 0.08), W(0.26, 1.34, 0.08), 0.02 * h);
  } else {
    limb(buf, W(0.145, 0.765, 0), W(0.175, 0.6, 0.02), 0.03 * h); limb(buf, W(0.175, 0.6, 0.02), W(0.17, 0.46, 0.06), 0.026 * h);
  }
}
