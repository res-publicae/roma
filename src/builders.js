import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuf, box, skirt, gable, sweepRibs, fan, sweep, figure, statue, limb } from './geobuf.js';
import { bay, bayRun, bayBox, frame, fbox, q } from './facade.js';
import { forumAugustus, forumCaesar, forumNerva, templePeace } from './fora.js';

const _m = new THREE.Matrix4(), _v = new THREE.Vector3();

// Shared build state: the current building's frame, the geometry buffers, and the lists of
// columns, one-off meshes and collision solids that builders add to.
export class Ctx {
  constructor(mats, solids) {
    this.matrix = new THREE.Matrix4(); this.rot = 0; this.gy = 0; this.stack = [];
    this.M = mats.M; this.plasterCount = mats.plasterCount; this.solids = solids;
    this.bufs = {};
    for (const k in mats.bufs) { const [m, t] = mats.bufs[k]; this.bufs[k] = new GeoBuf(this, m, t); }
    this.columns = []; this.extras = []; this.fires = []; this.statues = [];
  }
  begin(x, y, z, a) { this.matrix.makeRotationY(a).setPosition(x, y, z); this.rot = a; this.gy = y; this.stack.length = 0; }
  push(dx, dz, r = 0) { this.stack.push([this.matrix.clone(), this.rot]); this.matrix.multiply(_m.makeRotationY(r).setPosition(dx, 0, dz)); this.rot += r; }
  pop() { const [m, r] = this.stack.pop(); this.matrix.copy(m); this.rot = r; }
  toWorld(x, y, z) { return _v.set(x, y, z).applyMatrix4(this.matrix).toArray(); }
  // Collision box in the local frame; y0 at z0 rising or falling to y1 at z1 makes a ramp.
  solid(x0, x1, z0, z1, y0, y1 = y0) {
    const p = this.toWorld((x0 + x1) / 2, 0, (z0 + z1) / 2);
    this.solids.addOBB(p[0], p[2], (x1 - x0) / 2, (z1 - z0) / 2, this.rot, this.gy + y0, this.gy + y1);
  }
  custom(R, fn, thick) {
    const p = this.toWorld(0, 0, 0), c = Math.cos(this.rot), s = Math.sin(this.rot), gy = this.gy, wx = p[0], wz = p[2];
    this.solids.addCustom(wx, wz, R, (x, z) => { const dx = x - wx, dz = z - wz, t = fn(dx * c - dz * s, dx * s + dz * c); return t === -Infinity ? t : t + gy; }, thick);
  }
  // Collision box given in a facade frame (see facade.js): u along the wall, w out from it.
  solidFrame(F, u0, u1, w0, w1, top, thick) {
    const c = F.P((u0 + u1) / 2, 0, (w0 + w1) / 2), p = this.toWorld(c[0], 0, c[2]);
    this.solids.addOBB(p[0], p[2], (u1 - u0) / 2, (w1 - w0) / 2, this.rot + Math.atan2(-F.tz, F.tx), this.gy + top, this.gy + top, thick);
  }
  // fine: use the fully modelled column (real flutes, Attic base, Corinthian capital)
  column(x, y, z, h, dia, tint = 0, fine = false) {
    const p = this.toWorld(x, y, z);
    this.columns.push([p[0], p[1], p[2], h, dia, this.rot, tint, fine]);
    this.solids.addOBB(p[0], p[2], dia * 0.6, dia * 0.6, this.rot, p[1] + h);
  }
  extra(geom, mat, x, y, z, rx = 0, rz = 0) {
    const m = new THREE.Mesh(geom, mat);
    m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.updateMatrix(); m.applyMatrix4(this.matrix);
    m.castShadow = m.receiveShadow = true;
    this.extras.push(m);
    return m;
  }
}

// ---------- temples ----------

// Entablature profile as [distance out, height], both in units of the entablature's height:
// three-stepped architrave, plain frieze, a band for the dentils, then the overhanging cornice.
export const ENTAB = [[0, 0], [0, 0.11], [0.012, 0.11], [0.012, 0.22], [0.026, 0.22], [0.026, 0.32], [0.055, 0.345], [0.055, 0.365],
  [0.004, 0.37], [0.004, 0.63], [0.03, 0.66], [0.05, 0.66], [0.05, 0.745], [0.1, 0.765], [0.26, 0.785], [0.26, 0.88], [0.285, 0.89],
  [0.33, 0.96], [0.35, 0.97], [0.35, 1]];
const RAKE = [[0, -0.3], [0.08, -0.3], [0.1, -0.235], [0.26, -0.215], [0.26, -0.11], [0.285, -0.1], [0.33, -0.03], [0.35, 0]];

// Row of dentils (small blocks under the cornice) from A to B on a face whose outward direction is (nx, nz).
function dentils(buf, A, B, nx, nz, y0, y1, w0, w1, size, gap) {
  const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), tx = dx / L, tz = dz / L;
  const n = Math.max(1, Math.floor(L / (size + gap))), pitch = L / n;
  const P = (u, y, w) => [A[0] + tx * u + nx * w, y, A[1] + tz * u + nz * w];
  for (let i = 0; i < n; i++) {
    const u0 = i * pitch + (pitch - size) / 2, u1 = u0 + size;
    buf.quad(P(u0, y0, w1), P(u1, y0, w1), P(u1, y1, w1), P(u0, y1, w1));
    buf.quad(P(u0, y0, w0), P(u0, y0, w1), P(u0, y1, w1), P(u0, y1, w0));
    buf.quad(P(u1, y0, w1), P(u1, y0, w0), P(u1, y1, w0), P(u1, y1, w1));
    buf.quad(P(u0, y0, w0), P(u1, y0, w0), P(u1, y0, w1), P(u0, y0, w1));
  }
}

// The great doorway of a temple cella, cut into the wall that frame F runs along (c is half the
// wall's length): bronze doors with raised panels, a stepped surround, a cornice on brackets.
export function templeDoor(ctx, F, c, colH) {
  const B = ctx.bufs, dw = Math.min(c * 0.3, 3), dh = colH * 0.64, rv = 0.7;
    q(B.ashlar, F, [0, 0, 0], [c - dw, 0, 0], [c - dw, colH, 0], [0, colH, 0]);
    q(B.ashlar, F, [c + dw, 0, 0], [2 * c, 0, 0], [2 * c, colH, 0], [c + dw, colH, 0]);
    q(B.ashlar, F, [c - dw, dh, 0], [c + dw, dh, 0], [c + dw, colH, 0], [c - dw, colH, 0]);
    q(B.ashlar, F, [c - dw, 0, 0], [c - dw, dh, 0], [c - dw, dh, -rv], [c - dw, 0, -rv], 's');
    q(B.ashlar, F, [c + dw, 0, 0], [c + dw, dh, 0], [c + dw, dh, -rv], [c + dw, 0, -rv], 's');
    q(B.ashlar, F, [c - dw, dh, 0], [c + dw, dh, 0], [c + dw, dh, -rv], [c - dw, dh, -rv], 't');
    // door leaves, each with a border and four raised panels
    B.door.quad(F.P(c - dw, 0, -rv), F.P(c + dw, 0, -rv), F.P(c + dw, dh, -rv), F.P(c - dw, dh, -rv));
    fbox(B.door, F, c - 0.07, c + 0.07, 0, dh, -rv, -rv + 0.12);
    for (const s of [-1, 1]) {
      const u0 = s < 0 ? c - dw : c + 0.07, u1 = s < 0 ? c - 0.07 : c + dw, bw = (u1 - u0) * 0.14;
      for (let r = 0; r < 4; r++) {
        const v0 = dh * (0.04 + r * 0.24), v1 = v0 + dh * (r === 3 ? 0.2 : 0.2);
        fbox(B.door, F, u0 + bw, u1 - bw, v0, v1, -rv, -rv + 0.09);
        fbox(B.door, F, u0 + bw * 1.8, u1 - bw * 1.8, v0 + bw * 0.8, v1 - bw * 0.8, -rv, -rv + 0.2);
      }
      for (const v of [0.28, 0.52, 0.76]) fbox(B.gold, F, (s < 0 ? u1 - bw * 0.7 : u0 + bw * 0.2), (s < 0 ? u1 - bw * 0.2 : u0 + bw * 0.7), dh * v - 0.06, dh * v + 0.06, -rv, -rv + 0.16);
    }
    // stepped surround, and a cornice over the door carried on two brackets
    for (const [e, wd, pr] of [[0, 0.3, 0.2], [0.3, 0.2, 0.13], [0.5, 0.12, 0.07]]) {
      fbox(B.fine, F, c - dw - e - wd, c - dw - e, 0, dh + e + wd, 0, pr);
      fbox(B.fine, F, c + dw + e, c + dw + e + wd, 0, dh + e + wd, 0, pr);
      fbox(B.fine, F, c - dw - e, c + dw + e, dh + e, dh + e + wd, 0, pr);
    }
    const cy = dh + 0.95;
    fbox(B.fine, F, c - dw - 0.75, c + dw + 0.75, cy, cy + 0.12, 0, 0.3);
    fbox(B.fine, F, c - dw - 0.9, c + dw + 0.9, cy + 0.12, cy + 0.3, 0, 0.5);
    fbox(B.fine, F, c - dw - 0.98, c + dw + 0.98, cy + 0.3, cy + 0.38, 0, 0.58);
    for (const s of [-1, 1]) { const u = c + s * (dw + 0.78); fbox(B.fine, F, u - 0.13, u + 0.13, cy - 0.75, cy, 0, 0.18); fbox(B.fine, F, u - 0.13, u + 0.13, cy - 0.3, cy, 0.18, 0.3); }
}

export function temple(ctx, o) {
  const { w, d, podium: ph = 3, colH = 12, cols = 6, peripteral = false, roof = 'roof' } = o;
  const B = ctx.bufs, dia = o.dia ?? colH / 9.5, m = dia * 0.72, CM = B[o.cellaMat ?? 'ashlar'];
  const sd = Math.min(ph * 1.5, d * 0.25), zf = d / 2 - sd, zcheek = d / 2 - sd * 0.25;
  box(B.ashlar, -w / 2, w / 2, 0, ph, -d / 2, zf);
  skirt(B.stone, -w / 2, w / 2, -d / 2, d / 2);
  ctx.solid(-w / 2, w / 2, -d / 2, zf, ph);
  const n = o.steps ?? Math.max(2, Math.round(ph / 0.26));
  for (let i = 0; i < n; i++) box(B.fine, -w / 2 + 1, w / 2 - 1, 0, (ph * (n - i)) / (n + 1), zf + (sd * i) / n, zf + (sd * (i + 1)) / n);
  ctx.solid(-w / 2, w / 2, zf, d / 2, ph, 0);
  // low walls flanking the stair, and the altar that stood in front of every temple
  for (const s of [-1, 1]) {
    const a = s < 0 ? -w / 2 : w / 2 - 1, b = a + 1;
    box(B.ashlar, a, b, 0, ph, zf, zcheek);
    box(B.fine, a - 0.1, b + 0.1, ph, ph + 0.25, zf, zcheek + 0.1);
    ctx.solid(a, b, zf, zcheek, ph + 0.25);
  }
  if (!o.noAltar && w > 12) {
    // in front of the steps, or (stairAltar) on a landing in the middle of the flight, splitting it in two
    const mid = Math.floor(n / 2), ay = o.stairAltar ? (ph * (n - mid)) / (n + 1) : 0;
    const az = o.stairAltar ? zf + (sd * (mid + 0.5)) / n : d / 2 + Math.max(4, w * 0.2), aw = Math.min(2.2, w * 0.09), ad = o.stairAltar ? Math.min(aw * 0.6, sd / n * 1.6) : aw * 0.6;
    const rect = [[-aw, az - ad], [aw, az - ad], [aw, az + ad], [-aw, az + ad]];
    ctx.push(0, 0); ctx.gy += ay; ctx.matrix.multiply(new THREE.Matrix4().makeTranslation(0, ay, 0)); // pop() restores the frame
    box(B.fine, -aw, aw, 0, 1.45, az - ad, az + ad);
    sweep(B.fine, rect, [[0.16, 0], [0.16, 0.14], [0.04, 0.26], [0, 0.3]]);
    sweep(B.fine, rect, [[0, 1.1], [0.05, 1.14], [0.16, 1.3], [0.18, 1.33], [0.18, 1.45], [0, 1.45]]);
    ctx.solid(-aw, aw, az - ad, az + ad, 1.45);
    ctx.gy -= ay; ctx.pop();
  }
  // podium mouldings: a stepped base and a projecting cap, round the sides and back
  {
    const k = Math.min(1, Math.max(0.5, ph / 5)), path = [[-w / 2, zcheek], [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, zcheek]];
    sweep(B.fine, path, [[0.34 * k, 0], [0.34 * k, 0.36 * k], [0.26 * k, 0.42 * k], [0.24 * k, 0.56 * k], [0.07 * k, 0.72 * k], [0, 0.8 * k]], false);
    sweep(B.fine, path, [[0, ph - 0.6 * k], [0.06 * k, ph - 0.54 * k], [0.2 * k, ph - 0.26 * k], [0.27 * k, ph - 0.22 * k], [0.27 * k, ph], [0, ph]], false);
  }

  const zc = zf - dia * 0.9, zb = -d / 2 + m, xs = w / 2 - m, sp = (2 * xs) / (cols - 1);
  const ex = xs + dia * 0.45, ezf = zc + dia * 0.45, ezb = zb - dia * 0.45; // outer face of the architrave
  for (let i = 0; i < cols; i++) ctx.column(-xs + i * sp, ph, zc, colH, dia, 0, true);
  let cx, cz0, cz1;
  if (peripteral) {
    // sine postico: columns on the front and sides only, the back a plain wall the full width
    // (the temples of Mars Ultor and Venus Genetrix stood against their precinct walls)
    const sp0 = o.sinePostico, ns = Math.max(2, Math.round((zc - zb) / sp)), ss = (zc - zb) / ns;
    for (let j = 1; j <= (sp0 ? ns - 1 : ns); j++) for (const s of [-1, 1]) ctx.column(s * xs, ph, zc - j * ss, colH, dia, 0, true);
    if (!sp0) for (let i = 1; i < cols - 1; i++) ctx.column(-xs + i * sp, ph, zb, colH, dia, 0, true);
    cx = xs - sp; cz0 = sp0 ? ezb + 0.5 : zb + ss; cz1 = zc - 2 * ss;
    if (sp0) { box(CM, -ex, ex, ph, ph + colH, ezb, ezb + 1.4); ctx.solid(-ex, ex, ezb, ezb + 1.4, ph + colH); }
  } else {
    const porch = o.porch ?? (cols >= 6 ? 3 : 2);
    for (let j = 1; j < porch; j++) for (const s of [-1, 1]) ctx.column(s * xs, ph, zc - j * sp, colH, dia, 0, true);
    cx = ex - 0.5; cz0 = ezb + 0.5; cz1 = zc - (porch - 0.5) * sp;
  }

  // cella: side and back walls, and a front wall with a real doorway and bronze doors set back in it
  const ct = ph + colH;
  CM.quad([cx, ph, cz1], [cx, ph, cz0], [cx, ct, cz0], [cx, ct, cz1]);
  CM.quad([-cx, ph, cz0], [-cx, ph, cz1], [-cx, ct, cz1], [-cx, ct, cz0]);
  if (!o.backDoor) CM.quad([cx, ph, cz0], [-cx, ph, cz0], [-cx, ct, cz0], [cx, ct, cz0]);
  else { // a double temple: a second doorway and a second flight of steps at the far end
    templeDoor(ctx, frame([cx, cz0], [-cx, cz0], ph, [0, 0]), cx, colH);
    for (let i = 0; i < n; i++) box(B.fine, -w / 2 + 1, w / 2 - 1, 0, (ph * (n - i)) / (n + 1), -d / 2 - (sd * (i + 1)) / n, -d / 2 - (sd * i) / n);
    ctx.solid(-w / 2, w / 2, -d / 2 - sd, -d / 2, 0, ph);
  }
  ctx.solid(-cx, cx, cz0, cz1, ct);
  templeDoor(ctx, frame([-cx, cz1], [cx, cz1], ph, [0, 0]), cx, colH);
  // pilasters down the sides and back of the cella
  const popt = { mat: o.cellaMat ?? 'ashlar', kind: 'blank', cornice: false, pilW: dia * 0.9 }, pe = 0.06;
  for (const s of [-1, 1]) bayRun(ctx, [s * (cx + pe), cz0], [s * (cx + pe), cz1], ph, ct, [0, 0], sp, popt);
  if (!o.backDoor && !o.sinePostico) bayRun(ctx, [-cx, cz0 - pe], [cx, cz0 - pe], ph, ct, [0, 0], sp, popt);

  // entablature, moulded all round, with dentils under the cornice
  const eh = colH * 0.22, ey = ct, rect = [[-ex, ezb], [ex, ezb], [ex, ezf], [-ex, ezf]];
  sweep(B.fine, rect, ENTAB.map(([a, b]) => [a * eh, ey + b * eh]));
  B.coffer.quad([-ex, ey, ezb], [ex, ey, ezb], [ex, ey, ezf], [-ex, ey, ezf]); // coffered ceiling of the colonnade
  { const y0 = ey + eh * 0.67, y1 = ey + eh * 0.745, w0 = eh * 0.05, w1 = eh * 0.1, sz = eh * 0.055, gp = eh * 0.04;
    dentils(B.fine, [-ex, ezf], [ex, ezf], 0, 1, y0, y1, w0, w1, sz, gp);
    dentils(B.fine, [ex, ezb], [-ex, ezb], 0, -1, y0, y1, w0, w1, sz, gp);
    dentils(B.fine, [ex, ezf], [ex, ezb], 1, 0, y0, y1, w0, w1, sz, gp);
    dentils(B.fine, [-ex, ezb], [-ex, ezf], -1, 0, y0, y1, w0, w1, sz, gp); }

  // roof and pediments: the raking cornice follows the roof slope and the gable wall sits back behind it
  const y1 = ey + eh, rise = ex * 0.27, ov = eh * 0.35, yr = y1 + (ov * rise) / ex, xe = ex + ov;
  gable(B[roof], B.fine, -ex, ex, yr, ezb, ezf, { rise, over: ov });
  for (const [zF, sz] of [[ezf, 1], [ezb, -1]]) {
    B.fine.quad([-ex, y1, zF], [ex, y1, zF], [ex, yr, zF], [-ex, yr, zF]);
    for (const s of [-1, 1]) for (let k = 0; k < RAKE.length - 1; k++) {
      const [o0, l0] = RAKE[k], [o1, l1] = RAKE[k + 1];
      B.fine.quad([s * xe, y1 + l0 * eh, zF + sz * o0 * eh], [0, yr + rise + l0 * eh, zF + sz * o0 * eh], [0, yr + rise + l1 * eh, zF + sz * o1 * eh], [s * xe, y1 + l1 * eh, zF + sz * o1 * eh]);
    }
    // gilded figures on the roof: one at the peak, one at each corner
    const zo = zF + sz * ov * 0.5;
    box(B.fine, -0.5, 0.5, yr + rise - 0.2, yr + rise + 0.35, zo - 0.4, zo + 0.4);
    figure(B.gold, 0, yr + rise + 0.35, zo, Math.max(1.6, rise * 0.55));
    for (const s of [-1, 1]) { box(B.fine, s * xe - 0.4, s * xe + 0.4, y1 - 0.1, y1 + 0.45, zo - 0.4, zo + 0.4); figure(B.gold, s * xe, y1 + 0.45, zo, Math.max(1.2, rise * 0.36)); }
  }
  // sculpture in the front pediment, standing on the cornice, tallest at the centre
  for (let i = -5; i <= 5; i++) {
    const fx = (i * ex) / 6.4, room = rise * (1 - Math.abs(fx) / ex) - eh * 0.3 + (yr - y1);
    if (room < 0.9) continue;
    figure(B.fine, fx, y1, ezf + ov * 0.45, room * 0.92, i * 0.5);
  }
  // upright tiles along the eaves
  { const na = Math.round((ezf - ezb) / 0.75);
    for (let i = 0; i <= na; i++) for (const s of [-1, 1]) { const z = ezb + ((ezf - ezb) * i) / na, x = s * (xe - 0.08); box(B.fine, x - 0.06, x + 0.06, y1, y1 + 0.34, z - 0.13, z + 0.13); } }
}

function tholos(ctx, o) {
  const { r, podium: ph = 2, colH: ch = 9 } = o, M = ctx.M, B = ctx.bufs;
  const lathe = (pts, mat, seg = 48) => ctx.extra(new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), seg), mat, 0, 0, 0);
  const eh = ch * 0.2, ey = ph + ch, re = r * 0.9 + ch / 10 * 0.45;
  lathe([[0, 0], [r + 0.3, 0], [r + 0.3, 0.3], [r + 0.2, 0.38], [r + 0.05, 0.6], [r, 0.66], [r, ph - 0.45], [r + 0.06, ph - 0.4], [r + 0.2, ph - 0.2], [r + 0.24, ph - 0.16], [r + 0.24, ph], [0, ph]], M.marbleFlat);
  lathe([[r * 0.62, ph], [r * 0.62, ey]], M.marbleFlat, 36);
  lathe([[0, ey], ...ENTAB.map(([a, b]) => [re + a * eh, ey + b * eh]), [0, ey + eh]], M.marbleFlat);
  for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2 + 0.157; ctx.column(Math.cos(a) * r * 0.9, ph, Math.sin(a) * r * 0.9, ch, ch / 10, 0, true); }
  lathe([[re + eh * 0.42, ey + eh - 0.05], [re * 0.5, ey + eh + r * 0.34], [0.5, ey + eh + r * 0.5], [0.5, ey + eh + r * 0.5 + 0.5], [0, ey + eh + r * 0.5 + 0.9]], M.roofFlat);
  ctx.solid(-r * 0.8, r * 0.8, -r * 0.8, r * 0.8, ph);
  ctx.solid(-r * 0.5, r * 0.5, -r * 0.5, r * 0.5, ph + ch);
  const sd = ph * 1.5, n = Math.max(2, Math.round(ph / 0.26));
  for (let i = 0; i < n; i++) box(B.marble, -2.5, 2.5, 0, (ph * (n - i)) / (n + 1), r * 0.8 + (sd * i) / n, r * 0.8 + (sd * (i + 1)) / n);
  ctx.solid(-2.5, 2.5, r * 0.8, r * 0.8 + sd, ph, 0);
}

function venusRoma(ctx, o) {
  const { w, d } = o, B = ctx.bufs;
  temple(ctx, { w: 53, d: 107, podium: 2.6, colH: 18, cols: 10, peripteral: true, roof: 'bronze', backDoor: true });
  // down each long side of the precinct, a portico: two rows of grey granite columns under a tiled roof
  const ch = 9, eh = 1.3, zl = d / 2 - 6;
  for (const s of [-1, 1]) {
    const xa = s * (w / 2 - 7.6), xb = s * (w / 2 - 3), x0 = Math.min(xa, xb) - 0.55, x1 = Math.max(xa, xb) + 0.55;
    for (let z = -zl; z <= zl + 0.01; z += 4.6) { ctx.column(xa, 0.3, z, ch, 1, 1); ctx.column(xb, 0.3, z, ch, 1, 1); }
    box(B.fine, x0 - 0.4, x1 + 0.4, 0, 0.3, -zl - 1, zl + 1); ctx.solid(x0 - 0.4, x1 + 0.4, -zl - 1, zl + 1, 0.3);
    const path = [[x0, zl + 0.55], [x1, zl + 0.55], [x1, -zl - 0.55], [x0, -zl - 0.55]], y = ch + 0.3;
    sweep(B.fine, path, [[0, y], ...ENTAB.map(([p, q2]) => [p * eh, y + q2 * eh]), [0, y + eh]]);
    sweep(B.fine, path, [[-1.1, y], [0, y]]); // the soffit of the beams
    B.coffer.quad([x0 + 1.1, y + 0.6, zl], [x1 - 1.1, y + 0.6, zl], [x1 - 1.1, y + 0.6, -zl], [x0 + 1.1, y + 0.6, -zl]);
    gable(B.roof, B.fine, x0, x1, y + eh, -zl - 0.55, zl + 0.55, { rise: 1.5, over: 0.45 });
  }
}

// ---------- halls, basilicas, arches ----------

function hall(ctx, o) {
  const { w, d, h, mat = 'stucco', roof = 'roof' } = o, B = ctx.bufs;
  box(B[mat], -w / 2, w / 2, 0, h, -d / 2, d / 2, { top: false });
  skirt(B.stone, -w / 2, w / 2, -d / 2, d / 2);
  const e = 0.3;
  bayBox(ctx, -w / 2 - e, w / 2 + e, 0, h * 0.55, -d / 2 - e, d / 2 + e, 4.4, { mat, kind: 'blank', cornice: false, pilW: 0.7 });
  bayBox(ctx, -w / 2 - e, w / 2 + e, h * 0.55, h, -d / 2 - e, d / 2 + e, 4.4, { mat, kind: 'window', ww: 1.3, wh: h * 0.2, depth: 0.28, pilW: 0.7 });
  gable(B[roof], B[mat], -w / 2 - e, w / 2 + e, h, -d / 2 - e, d / 2 + e, { rise: w * 0.16, over: 0.9 });
  B.dark.quad([-w * 0.12, 0, d / 2 + 0.75], [w * 0.12, 0, d / 2 + 0.75], [w * 0.12, h * 0.42, d / 2 + 0.75], [-w * 0.12, h * 0.42, d / 2 + 0.75]);
  box(B.marble, -w * 0.12 - 0.5, w * 0.12 + 0.5, 0, h * 0.42 + 0.5, d / 2 + 0.3, d / 2 + 0.7);
  ctx.solid(-w / 2, w / 2, -d / 2, d / 2, h);
}

function basilica(ctx, o) {
  const { w, d, h, roof = 'roof' } = o, B = ctx.bufs, st = 0.9, ai = Math.min(d * 0.22, 10), h1 = h * 0.58, hs = h1 / 2;
  const E = [w / 2 + 2, d / 2 + 2], rectOf = (x, z) => [[-x, -z], [x, -z], [x, z], [-x, z]];
  // platform with four steps all round
  box(B.ashlar, -E[0], E[0], 0, st, -E[1], E[1], { top: false });
  B.floor.quad([-w / 2, st, d / 2], [w / 2, st, d / 2], [w / 2, st, -d / 2], [-w / 2, st, -d / 2]); // inlaid floor indoors, plain slabs on the surround
  const ring = (buf, y, ox, oz, ix, iz) => {
    buf.quad([-ox, y, oz], [ox, y, oz], [ox, y, iz], [-ox, y, iz]); buf.quad([-ox, y, -iz], [ox, y, -iz], [ox, y, -oz], [-ox, y, -oz]);
    buf.quad([-ox, y, iz], [-ix, y, iz], [-ix, y, -iz], [-ox, y, -iz]); buf.quad([ix, y, iz], [ox, y, iz], [ox, y, -iz], [ix, y, -iz]);
  };
  ring(B.fine, st, E[0], E[1], w / 2, d / 2);
  skirt(B.stone, -E[0] - 1.2, E[0] + 1.2, -E[1] - 1.2, E[1] + 1.2);
  sweep(B.fine, rectOf(E[0], E[1]), [[1.2, 0], [1.2, 0.225], [0.8, 0.225], [0.8, 0.45], [0.4, 0.45], [0.4, 0.675], [0, 0.675], [0, st]]);
  ctx.solid(-E[0] - 0.8, E[0] + 0.8, -E[1] - 0.8, E[1] + 0.8, 0.45);
  ctx.solid(-E[0], E[0], -E[1], E[1], st);

  // two storeys of arches between engaged columns, each storey finished with a full entablature
  const eh = hs * 0.15, ch = hs - eh, dia = ch / 8.5, co = 0.12, off = co + dia * 0.42;
  const nw = Math.max(1, Math.round(w / 5.2)), nd = Math.max(1, Math.round(d / 5.2));
  for (let k = 0; k < 2; k++) {
    const y0 = st + k * hs;
    bayBox(ctx, -w / 2, w / 2, y0, y0 + ch, -d / 2, d / 2, 5.2, { mat: 'ashlar', depth: 1.4, open: true, pil: false, cornice: false, parapet: k ? 1.05 : 0 });
    for (let i = 0; i <= nw; i++) for (const sg of [-1, 1]) ctx.column(-w / 2 + (w * i) / nw, y0, sg * (d / 2 + co), ch, dia);
    for (let j = 1; j < nd; j++) for (const sg of [-1, 1]) ctx.column(sg * (w / 2 + co), y0, -d / 2 + (d * j) / nd, ch, dia);
    const Y = y0 + ch;
    sweep(B.fine, rectOf(w / 2, d / 2), [[0, Y], [off, Y], ...ENTAB.map(([p, q2]) => [off + p * eh, Y + q2 * eh]), [0, Y + eh]]);
    if (k === 0) sweep(B.fine, rectOf(w / 2, d / 2), [[0, Y + eh], [off + 0.1, Y + eh], [off + 0.1, Y + eh + 0.02]]); // ledge the upper columns stand on
  }
  ring(B.roof, st + h1, w / 2, d / 2, w / 2 - ai, d / 2 - ai); // aisle roofs, leaving the nave open above
  // the nave rises above the aisles, lit by a row of windows
  const xa = -w / 2 + ai, xb = w / 2 - ai, za = -d / 2 + ai, zb = d / 2 - ai;
  bayBox(ctx, xa, xb, st + h1, st + h, za, zb, 5.2, { mat: 'stucco', kind: 'window', ww: 1.7, wh: (h - h1) * 0.5, sill: (h - h1) * 0.2, depth: 0.35, pilW: 0.7, open: true });
  gable(B[roof], B.stucco, xa, xb, st + h, za, zb, { rise: (d / 2 - ai) * 0.32, over: 0.9, alongX: true });
  // coffered timber ceilings: low over the aisles, high over the nave
  ring(B.coffer, st + h1 - 0.15, w / 2, d / 2, (xb - xa) / 2, (zb - za) / 2);
  B.coffer.quad([xa, st + h - 0.1, zb], [xb, st + h - 0.1, zb], [xb, st + h - 0.1, za], [xa, st + h - 0.1, za]);
  // inside: a nave ringed by tall columns that carry the clerestory, with aisles all round
  const ich = h1 - 1.4, idia = ich / 10;
  const nx = Math.max(2, Math.round((xb - xa) / 5.2)), nz = Math.max(1, Math.round((zb - za) / 5.2));
  for (let i = 0; i <= nx; i++) for (const z of [za, zb]) ctx.column(xa + ((xb - xa) * i) / nx, st, z, ich, idia);
  for (let j = 1; j < nz; j++) for (const x of [xa, xb]) ctx.column(x, st, za + ((zb - za) * j) / nz, ich, idia);
  const ir = [[xa, za], [xb, za], [xb, zb], [xa, zb]], ie = 1.4, ip = ENTAB.map(([p, q2]) => [0.45 + p * ie, st + ich + q2 * ie]);
  sweep(B.fine, ir, [[-0.45, st + ich], [0.45, st + ich], ...ip]);
  sweep(B.fine, ir, [[-0.45, st + ich], [-0.45, st + h1]]);
}

function tabularium(ctx, o) {
  const { w, d, h } = o, B = ctx.bufs;
  box(B.stone, -w / 2, w / 2, 0, h * 0.5, -d / 2, d / 2, { top: false });
  skirt(B.stone, -w / 2, w / 2, -d / 2, d / 2);
  bayBox(ctx, -w / 2, w / 2, h * 0.5, h * 0.78, -d / 2, d / 2, 6.6, { mat: 'stone', depth: 1.5 });
  box(B.stone, -w / 2, w / 2, h * 0.78, h, -d / 2, d / 2, { top: B.roof });
  ctx.solid(-w / 2, w / 2, -d / 2, d / 2, h);
}

export function arch(ctx, o) {
  const { w, d, h } = o, B = ctx.bufs, ha = h * 0.68, eh = ha * 0.14, yc = ha - eh, r = w * 0.2, hs = yc * 0.92 - r, pedH = yc * 0.24;
  const rect = (g) => [[-w / 2 - g, d / 2 + g], [w / 2 + g, d / 2 + g], [w / 2 + g, -d / 2 - g], [-w / 2 - g, -d / 2 - g]];
  // the two faces, each with the archway cut through it; the passage has a coffered vault
  for (const s of [-1, 1]) {
    const F = frame([-s * w / 2, s * d / 2], [s * w / 2, s * d / 2], 0, [0, 0]), u0 = w / 2 - r, u1 = w / 2 + r, n = 16, dp = d / 2;
    q(B.fine, F, [0, 0, 0], [u0, 0, 0], [u0, yc, 0], [0, yc, 0]); q(B.fine, F, [u1, 0, 0], [w, 0, 0], [w, yc, 0], [u1, yc, 0]);
    q(B.fine, F, [u0, 0, 0], [u0, hs, 0], [u0, hs, -dp], [u0, 0, -dp], 's'); q(B.fine, F, [u1, 0, 0], [u1, hs, 0], [u1, hs, -dp], [u1, 0, -dp], 's');
    for (let k = 0; k < n; k++) {
      const a0 = Math.PI - (k * Math.PI) / n, a1 = Math.PI - ((k + 1) * Math.PI) / n, P = (a, rr) => [w / 2 + rr * Math.cos(a), hs + rr * Math.sin(a)];
      const pa = P(a0, r), pb = P(a1, r), oa = P(a0, r + 0.5), ob = P(a1, r + 0.5), ra = P(a0, r + 0.62), rb = P(a1, r + 0.62);
      q(B.fine, F, [pa[0], pa[1], 0], [pb[0], pb[1], 0], [pb[0], yc, 0], [pa[0], yc, 0]);
      B.coffer.quad(F.P(pa[0], pa[1], 0), F.P(pb[0], pb[1], 0), F.P(pb[0], pb[1], -dp), F.P(pa[0], pa[1], -dp));
      // the moulded band round the arch
      B.fine.quad(F.P(pa[0], pa[1], 0.1), F.P(pb[0], pb[1], 0.1), F.P(ob[0], ob[1], 0.1), F.P(oa[0], oa[1], 0.1));
      B.fine.quad(F.P(oa[0], oa[1], 0.1), F.P(ob[0], ob[1], 0.1), F.P(rb[0], rb[1], 0.16), F.P(ra[0], ra[1], 0.16));
      B.fine.quad(F.P(ra[0], ra[1], 0.16), F.P(rb[0], rb[1], 0.16), F.P(rb[0], rb[1], 0), F.P(ra[0], ra[1], 0));
      B.fine.quad(F.P(pa[0], pa[1], 0), F.P(pb[0], pb[1], 0), F.P(pb[0], pb[1], 0.1), F.P(pa[0], pa[1], 0.1));
    }
    for (const [a, b] of [[u0 - 0.6, u0], [u1, u1 + 0.6]]) { fbox(B.fine, F, a, b, hs - 0.34, hs, -dp, 0.18); fbox(B.fine, F, a, b, hs - 0.1, hs, 0.18, 0.26); } // imposts, carried through the passage
    for (const u of [u0, u1]) { const sg = u === u0 ? 1 : -1; B.fine.quad(F.P(u + sg * 0.12, hs - 0.34, 0), F.P(u + sg * 0.12, hs - 0.34, -dp), F.P(u + sg * 0.12, hs, -dp), F.P(u + sg * 0.12, hs, 0)); B.fine.quad(F.P(u, hs - 0.34, 0), F.P(u + sg * 0.12, hs - 0.34, 0), F.P(u + sg * 0.12, hs - 0.34, -dp), F.P(u, hs - 0.34, -dp)); }
    // keystone: a scrolled bracket carrying a small figure
    fbox(B.fine, F, w / 2 - 0.42, w / 2 + 0.42, hs + r - 0.1, yc, 0, 0.5); fbox(B.fine, F, w / 2 - 0.5, w / 2 + 0.5, hs + r + 0.75, hs + r + 0.9, 0, 0.6);
    { const c = F.P(w / 2, hs + r - 0.05, 0.55); statue(B, c[0], hs + r - 0.05 - 0.0, c[2], Math.min(1.0, yc - hs - r), s > 0 ? 0 : Math.PI, 'figure'); }
    // carved panels on the walls of the passage
    for (const u of [u0, u1]) {
      const sg = u === u0 ? -1 : 1, x = u - sg * 0.001, v0 = hs * 0.42, v1 = hs - 0.55, wa = -dp + 0.35, wb = -0.45;
      B.marble.quad(F.P(x, v0, wa), F.P(x, v0, wb), F.P(x, v1, wb), F.P(x, v1, wa));
      for (const [a, b, c2, e] of [[v0 - 0.14, v0, wa - 0.14, wb + 0.14], [v1, v1 + 0.14, wa - 0.14, wb + 0.14], [v0, v1, wa - 0.14, wa], [v0, v1, wb, wb + 0.14]]) B.fine.quad(F.P(u - sg * 0.07, a, c2), F.P(u - sg * 0.07, a, e), F.P(u - sg * 0.07, b, e), F.P(u - sg * 0.07, b, c2));
    }
    // four engaged columns on tall pedestals
    const ch = yc - pedH, dia = ch / 9.4;
    for (const u of (o.plain ? [] : [0.85, u0 - 0.95, u1 + 0.95, w - 0.85])) {
      fbox(B.fine, F, u - 0.62, u + 0.62, 0.5, pedH - 0.18, 0, 0.95);
      fbox(B.fine, F, u - 0.72, u + 0.72, 0, 0.5, 0, 1.05); fbox(B.fine, F, u - 0.72, u + 0.72, pedH - 0.18, pedH, 0, 1.05);
      const c = F.P(u, 0, 0.42); ctx.column(c[0], pedH, c[2], ch, dia, 0, true);
    }
    // the inscription on the attic: a framed marble panel with lines of bronze letters
    const A0 = ha + (h - ha) * 0.2, A1 = h - (h - ha) * 0.26, FA = frame([-s * w / 2, s * d / 2], [s * w / 2, s * d / 2], 0, [0, 0]);
    fbox(B.fine, FA, w * 0.16, w * 0.84, A0 - 0.16, A0, 0, 0.12); fbox(B.fine, FA, w * 0.16, w * 0.84, A1, A1 + 0.16, 0, 0.12);
    for (const u of [w * 0.16, w * 0.84 - 0.16]) fbox(B.fine, FA, u, u + 0.16, A0, A1, 0, 0.12);
    const lines = 4, lh = (A1 - A0) / (lines + 0.6);
    for (let l = 0; l < lines; l++) {
      const y = A1 - (l + 0.85) * lh, inset = l === lines - 1 ? w * 0.12 : 0;
      for (let u = w * 0.2 + inset; u < w * 0.8 - inset - 0.2; u += 0.42) fbox(B.bronze, FA, u, u + (((u * 7.3 + l * 3.1) % 1) > 0.25 ? 0.3 : 0.14), y, y + lh * 0.55, 0, 0.03);
    }
  }
  for (const s of [-1, 1]) B.fine.quad([s * w / 2, 0, d / 2], [s * w / 2, 0, -d / 2], [s * w / 2, yc, -d / 2], [s * w / 2, yc, d / 2]);
  // plinth, entablature over the columns, and the attic with its base and crowning cornice
  sweep(B.fine, rect(0), [[0, 0], [0.16, 0], [0.16, 0.42], [0.06, 0.5], [0, 0.5]]);
  sweep(B.fine, rect(0.02), [[0, yc], [0.5, yc], ...ENTAB.map(([p, q2]) => [0.5 + p * eh, yc + q2 * eh]), [0, ha]]);
  dentils(B.fine, [-w / 2 - 0.5, d / 2 + 0.5], [w / 2 + 0.5, d / 2 + 0.5], 0, 1, yc + eh * 0.66, yc + eh * 0.745, eh * 0.05, eh * 0.1, eh * 0.07, eh * 0.05);
  dentils(B.fine, [w / 2 + 0.5, -d / 2 - 0.5], [-w / 2 - 0.5, -d / 2 - 0.5], 0, -1, yc + eh * 0.66, yc + eh * 0.745, eh * 0.05, eh * 0.1, eh * 0.07, eh * 0.05);
  box(B.fine, -w / 2, w / 2, ha, h, -d / 2, d / 2, { bottom: true });
  sweep(B.fine, rect(0), [[0, ha], [0.22, ha], [0.22, ha + 0.3], [0.08, ha + 0.42], [0, ha + 0.42]]);
  { const ce = (h - ha) * 0.2; sweep(B.fine, rect(0), [[0, h - ce], ...ENTAB.slice(9).map(([p, q2]) => [p * ce * 2.2, h - ce + ((q2 - 0.63) / 0.37) * ce]), [0, h]]); }
  ctx.solid(-w / 2, -r, -d / 2, d / 2, h); ctx.solid(r, w / 2, -d / 2, d / 2, h);

  if (o.figures) { // gilded statues standing on the attic instead of a chariot
    const G = B.gold, gb = { fine: G, bronze: G, gold: G };
    box(B.fine, -w / 2 + 0.4, w / 2 - 0.4, h, h + 0.4, -d / 2 + 0.3, d / 2 - 0.3);
    for (let i = 0; i < o.figures; i++) statue(gb, -w / 2 + (w * (i + 0.5)) / o.figures, h + 0.4, 0, Math.min(2.6, h * 0.24), 0, 'general');
    return;
  }
  // on top: a gilded bronze four-horse chariot with its driver
  const G = B.gold, y = h + 0.45, gb = { fine: G, bronze: G, gold: G };
  box(B.fine, -3.6, 3.6, h, y, -1.9, 2.1);
  for (const x of [-2.25, -0.75, 0.75, 2.25]) {
    const lift = x === -0.75 || x === 2.25;
    box(G, x - 0.3, x + 0.3, y + 1.2, y + 1.85, -0.75, 1.0);
    limb(G, [x, y + 1.7, 0.85], [x, y + 2.55, 1.45], 0.2); limb(G, [x, y + 2.6, 1.38], [x, y + 2.2, 1.95], 0.13); // neck and head
    limb(G, [x, y + 2.55, 1.3], [x, y + 1.8, 0.7], 0.07); // mane
    for (const sx of [-0.2, 0.2]) {
      if (lift && sx > 0) { limb(G, [x + sx, y + 1.3, 0.85], [x + sx, y + 0.95, 1.35], 0.085); limb(G, [x + sx, y + 0.95, 1.35], [x + sx, y + 0.5, 1.2], 0.07); }
      else limb(G, [x + sx, y + 1.3, 0.85], [x + sx, y, 0.95], 0.08);
      limb(G, [x + sx, y + 1.3, -0.6], [x + sx, y + 0.65, -0.85], 0.09); limb(G, [x + sx, y + 0.65, -0.85], [x + sx, y, -0.7], 0.07);
    }
    limb(G, [x, y + 1.75, -0.75], [x, y + 0.9, -1.1], 0.06); // tail
  }
  box(G, -0.75, 0.75, y + 0.75, y + 0.85, -1.85, -0.85, { bottom: true });                              // chariot floor
  for (const sx of [-1, 1]) box(G, sx * 0.75 - 0.04, sx * 0.75 + 0.04, y + 0.85, y + 1.7, -1.85, -0.95); // its sides
  box(G, -0.75, 0.75, y + 0.85, y + 1.8, -0.95, -0.88);
  limb(G, [0, y + 0.9, -0.9], [0, y + 1.25, 0.9], 0.05);                                                 // pole
  for (const sx of [-1, 1]) { const g = new THREE.CylinderGeometry(0.72, 0.72, 0.1, 18); g.rotateZ(Math.PI / 2); ctx.extra(g, ctx.M.gold, sx * 0.92, y + 0.72, -1.35); }
  statue(gb, 0, y + 0.85, -1.4, 2.3, 0, 'rider');
}

function rostra(ctx, o) {
  const { w, d, h } = o, B = ctx.bufs;
  box(B.marble, -w / 2, w / 2, 0, h, -d / 2, d / 2);
  ctx.solid(-w / 2, w / 2, -d / 2, d / 2, h);
  const n = 10, rd = 6;
  for (let i = 0; i < n; i++) box(B.marble, -4, 4, 0, (h * (i + 1)) / (n + 1), -d / 2 - rd + (rd * i) / n, -d / 2 - rd + (rd * (i + 1)) / n);
  ctx.solid(-4, 4, -d / 2 - rd, -d / 2, 0, h);
}

// The imperial palace: wings round a court like any great house, but faced in marble below and
// painted stucco above, every bay framed by pilasters, a columned portico across each end, state
// halls rising through the roofs with bronze doors, and a colonnaded garden court with a pool.
function palace(ctx, o) {
  const { w, d, h = 18, wing = 16, halls = [], arcade = false } = o, B = ctx.bufs;
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, storeys = 3, sh = h / storeys, e = 0.35, bl = 4.6;
  const low = arcade ? { mat: 'ashlar', kind: 'arch', depth: 0.3, pilW: 0.8 } : { mat: 'ashlar', kind: 'blank', pilW: 0.8 };
  const up = { mat: 'imperial', kind: 'window', ww: 1.3, wh: sh * 0.42, sill: sh * 0.26, depth: 0.3, pilW: 0.7 };
  for (let s = 0; s < storeys; s++) bayBox(ctx, x0 - e, x1 + e, s * sh, (s + 1) * sh, z0 - e, z1 + e, bl, s ? up : low);
  for (const [a, b, c, f, ax] of [[x0, x1, z1 - wing, z1, true], [x0, x1, z0, z0 + wing, true], [x0, x0 + wing, z0 + wing, z1 - wing, false], [x1 - wing, x1, z0 + wing, z1 - wing, false]]) {
    box(B.imperial, a, b, 0, h, c, f, { top: false }); skirt(B.stone, a, b, c, f);
    gable(B.roof, B.imperial, a, b, h, c, f, { rise: wing * 0.18, alongX: ax });
    ctx.solid(a, b, c, f, h);
  }
  // state halls
  for (const hl of halls) {
    const a = hl.x - hl.w / 2, b = hl.x + hl.w / 2, c = hl.z - hl.d / 2, f = hl.z + hl.d / 2, ax = hl.w > hl.d;
    bayBox(ctx, a - 0.3, b + 0.3, h, hl.h, c - 0.3, f + 0.3, 4.4, { mat: 'imperial', kind: 'window', ww: 1.5, wh: (hl.h - h) * 0.5, sill: (hl.h - h) * 0.22, depth: 0.26, pilW: 0.8 });
    bayBox(ctx, a - 0.3, b + 0.3, 0, h, c - 0.3, f + 0.3, 4.4, { mat: 'ashlar', kind: 'blank', pilW: 0.8 });
    box(B.imperial, a, b, 0, hl.h, c, f, { top: false });
    gable(B.roof, B.fine, a - 0.3, b + 0.3, hl.h, c - 0.3, f + 0.3, { rise: (ax ? hl.d : hl.w) * 0.17, alongX: ax, over: 0.8 });
    ctx.solid(a, b, c, f, hl.h);
  }
  // a portico across each end, standing clear of any hall that pushes forward
  for (const sg of [1, -1]) {
    ctx.push(0, 0, sg > 0 ? 0 : Math.PI);
    const hs = halls.map((hl) => ({ x: sg * hl.x, z: sg * hl.z, w: hl.w, d: hl.d })).filter((hl) => hl.z + hl.d / 2 > d / 2 - 1);
    const ext = Math.max(d / 2 + e, ...hs.map((hl) => hl.z + hl.d / 2 + 0.3)), pd = 5.2, zc = ext + pd, st = 0.8;
    const X0 = x0 + 5, X1 = x1 - 5, colH = 2 * sh - 1.5 - st, eh = 1.5, ey = st + colH, zw = d / 2 + e;
    box(B.fine, X0, X1, 0, st, zw, zc + 1.3);
    for (let i = 0; i < 3; i++) box(B.fine, X0, X1, 0, (st * (3 - i)) / 4, zc + 1.3 + 0.4 * i, zc + 1.7 + 0.4 * i);
    ctx.solid(X0, X1, zw, zc + 1.3, st); ctx.solid(X0, X1, zc + 1.3, zc + 2.5, st, 0);
    const n = Math.round((X1 - X0 - 2) / 4.4);
    for (let i = 0; i <= n; i++) ctx.column(X0 + 1 + ((X1 - X0 - 2) * i) / n, st, zc, colH, colH / 9.4, 0, true);
    const rect = [[X0 + 0.45, zc + 0.55], [X1 - 0.45, zc + 0.55], [X1 - 0.45, zw], [X0 + 0.45, zw]];
    sweep(B.fine, rect, [[-1.1, ey], [0, ey], ...ENTAB.map(([p, q2]) => [p * eh, ey + q2 * eh]), [0, ey + eh]]);
    B.coffer.quad([X0 + 1.5, ey + 0.5, zc - 0.5], [X1 - 1.5, ey + 0.5, zc - 0.5], [X1 - 1.5, ey + 0.5, zw], [X0 + 1.5, ey + 0.5, zw]);
    B.roof.quad([X0 + 0.2, ey + eh, zc + 0.9], [X1 - 0.2, ey + eh, zc + 0.9], [X1 - 0.2, ey + eh + 1.3, zw], [X0 + 0.2, ey + eh + 1.3, zw]);
    for (const hl of hs) templeDoor(ctx, frame([hl.x - hl.w / 2, hl.z + hl.d / 2 + 0.34], [hl.x + hl.w / 2, hl.z + hl.d / 2 + 0.34], st, [hl.x, 0]), hl.w / 2, 2 * sh - st - 0.4);
    ctx.pop();
  }
  // the court inside: storeyed walls, and where no hall crosses it a colonnade round a pool
  const ci = wing + e, cw = w - 2 * ci, cd = d - 2 * ci;
  if (cw > 10 && cd > 10) {
    for (let s = 0; s < storeys; s++) bayBox(ctx, x0 + ci, x1 - ci, s * sh, (s + 1) * sh, z0 + ci, z1 - ci, bl, { ...(s ? up : { mat: 'ashlar', kind: 'blank', pilW: 0.8 }), inward: true });
    // the clear part of the court: halls that push into it, or cross it, cut it short
    let zlo = z0 + ci, zhi = z1 - ci;
    for (const hl of halls) {
      if (Math.abs(hl.x) - hl.w / 2 > cw / 2) continue;
      if (hl.z > 1) zhi = Math.min(zhi, hl.z - hl.d / 2 - 0.3); else if (hl.z < -1) zlo = Math.max(zlo, hl.z + hl.d / 2 + 0.3); else zhi = Math.min(zhi, hl.z - hl.d / 2 - 0.3);
    }
    if (zhi - zlo > 16) {
      const m = 4.6, xa = x0 + ci + m, xb = x1 - ci - m, za = zlo + m, zb = zhi - m, eh = 0.95, ch = sh - eh, dia = ch / 9.4, zm = (zlo + zhi) / 2;
      const nx = Math.round((xb - xa) / 3.6), nz = Math.round((zb - za) / 3.6);
      for (let i = 0; i <= nx; i++) for (const z of [za, zb]) ctx.column(xa + ((xb - xa) * i) / nx, 0.2, z, ch - 0.2, dia, 0, true);
      for (let j = 1; j < nz; j++) for (const x of [xa, xb]) ctx.column(x, 0.2, za + ((zb - za) * j) / nz, ch - 0.2, dia, 0, true);
      const path = [[xa - 0.45, zb + 0.45], [xb + 0.45, zb + 0.45], [xb + 0.45, za - 0.45], [xa - 0.45, za - 0.45]];
      sweep(B.fine, path, [[0.9, ch], [0, ch], ...ENTAB.map(([p, q2]) => [-p * eh, ch + q2 * eh]), [0, sh], [0.9, sh]]);
      const wx = x0 + ci, wX = x1 - ci, wz = zlo, wZ = zhi, y0 = sh, y1 = sh + 1.1;
      B.roof.quad([xa - 0.9, y0, zb + 0.9], [xb + 0.9, y0, zb + 0.9], [wX, y1, wZ], [wx, y1, wZ]); B.roof.quad([xb + 0.9, y0, za - 0.9], [xa - 0.9, y0, za - 0.9], [wx, y1, wz], [wX, y1, wz]);
      B.roof.quad([xa - 0.9, y0, za - 0.9], [xa - 0.9, y0, zb + 0.9], [wx, y1, wZ], [wx, y1, wz]); B.roof.quad([xb + 0.9, y0, zb + 0.9], [xb + 0.9, y0, za - 0.9], [wX, y1, wz], [wX, y1, wZ]);
      for (const [a, b, c, f] of [[xa - 1, xb + 1, zb - 1, wZ], [xa - 1, xb + 1, wz, za + 1], [wx, xa + 1, za, zb], [xb - 1, wX, za, zb]]) box(B.fine, Math.min(a, b), Math.max(a, b), 0, 0.2, Math.min(c, f), Math.max(c, f));
      // the pool, with a fountain figure on an island in the middle
      const pw = (xb - xa) * 0.17, pl = (zb - za) * 0.2;
      ctx.push(0, zm);
      for (const sx of [-1, 1]) { box(B.fine, sx * pw - 0.25, sx * pw + 0.25, 0, 0.55, -pl - 0.25, pl + 0.25); box(B.fine, -pw, pw, 0, 0.55, sx * pl - 0.25, sx * pl + 0.25); }
      B.pool.quad([-pw, 0.4, pl], [pw, 0.4, pl], [pw, 0.4, -pl], [-pw, 0.4, -pl]);
      box(B.fine, -1.1, 1.1, 0, 0.9, -1.1, 1.1); box(B.fine, -0.6, 0.6, 0.9, 2.1, -0.6, 0.6); statue(B, 0, 2.1, 0, 2.4, 0, 'woman');
      ctx.solid(-pw - 0.25, pw + 0.25, -pl - 0.25, pl + 0.25, 0.9);
      ctx.pop();
    }
  }
}

// ---------- colonnaded courts (imperial fora, precincts) ----------

function court(ctx, o) {
  const { w, d, wallH = 14, colH = 9, pd = 9, porticoes = 'sides', temple: tp, templeAt = 'back', gap = 10, statue } = o;
  const B = ctx.bufs, t = 1.6, x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const walls = [[x0, x0 + t, z0, z1], [x1 - t, x1, z0, z1]];
  if (!o.openBack) walls.push([x0, x1, z0, z0 + t]);
  if (gap > 0) walls.push([x0, -gap / 2, z1 - t, z1], [gap / 2, x1, z1 - t, z1]); else walls.push([x0, x1, z1 - t, z1]);
  for (const [a, b, c, e] of walls) { box(B.stone, a, b, 0, wallH, c, e); skirt(B.stone, a, b, c, e); ctx.solid(a, b, c, e, wallH); }
  const wopt = { mat: 'stone', kind: 'blank', pilW: 0.8 }, wb = Math.max(4, colH * 0.84), xi = w / 2 - t - 0.06;
  for (const s of [-1, 1]) bayRun(ctx, [s * xi, z0 + t], [s * xi, z1 - t], 0, wallH, [s * w, 0], wb, wopt);
  if (!o.openBack) bayRun(ctx, [-xi, z0 + t + 0.06], [xi, z0 + t + 0.06], 0, wallH, [0, -d], wb, wopt);

  if (porticoes !== 'none') {
    const dia = colH / 9, sp = colH * 0.42, ey = colH + 1, ry = Math.min(wallH - 0.3, ey + pd * 0.24);
    for (const s of [-1, 1]) {
      const xc = s * (w / 2 - pd), za = z0 + t + 1, zb = z1 - t - 1, n = Math.max(1, Math.round((zb - za) / sp));
      for (let i = 0; i <= n; i++) ctx.column(xc, 0, za + ((zb - za) * i) / n, colH, dia);
      box(B.marble, xc - 0.6, xc + 0.6, colH, ey, za - 0.5, zb + 0.5);
      B.roof.quad([xc - s * 0.7, ey, za - 0.5], [xc - s * 0.7, ey, zb + 0.5], [s * (w / 2 - t), ry, zb + 0.5], [s * (w / 2 - t), ry, za - 0.5]);
    }
    if (porticoes === 'all') {
      const ends = tp && templeAt === 'back' ? [1] : [-1, 1];
      for (const s of ends) {
        const zc = s * (d / 2 - pd), xa = x0 + pd, xb = x1 - pd, n = Math.max(1, Math.round((xb - xa) / sp));
        for (let i = 1; i < n; i++) {
          const x = xa + ((xb - xa) * i) / n;
          if (s === 1 && Math.abs(x) < gap / 2) continue;
          ctx.column(x, 0, zc, colH, dia);
        }
        box(B.marble, xa, xb, colH, ey, zc - 0.6, zc + 0.6);
        B.roof.quad([xb, ey, zc - s * 0.7], [xa, ey, zc - s * 0.7], [xa, ry, s * (d / 2 - t)], [xb, ry, s * (d / 2 - t)]);
      }
    }
  }
  if (tp) {
    ctx.push(0, templeAt === 'centre' ? 0 : z0 + t + tp.d / 2 + 0.5);
    temple(ctx, tp);
    ctx.pop();
  }
  if (statue) { box(B.marble, -2, 2, 0, 4, -3.5, 3.5); box(B.gold, -1, 1, 4, 6.6, -3, 3); box(B.gold, -0.7, 0.7, 6.6, 9, -0.6, 1); ctx.solid(-2, 2, -3.5, 3.5, 9); }
}

// ---------- courtyard buildings (palaces, warehouses, barracks) ----------

function block(ctx, o) {
  const { w, d, h = 12, wing = 12, mat = 'stucco', halls = [], colonnade = true } = o, B = ctx.bufs;
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  // outer face: real windows in two or three storeys, a little proud of the plain wall behind
  const storeys = h > 15 ? 3 : 2, e = 0.4;
  for (let s = 0; s < storeys; s++) {
    bayBox(ctx, x0 - e, x1 + e, (s * h) / storeys, ((s + 1) * h) / storeys, z0 - e, z1 + e, 3.4,
      { mat, kind: 'window', pil: false, cornice: s === storeys - 1, depth: 0.34 });
  }
  const wings = [[x0, x1, z1 - wing, z1, true], [x0, x1, z0, z0 + wing, true], [x0, x0 + wing, z0 + wing, z1 - wing, false], [x1 - wing, x1, z0 + wing, z1 - wing, false]];
  for (const [a, b, c, e, ax] of wings) {
    box(B[mat], a, b, 0, h, c, e, { top: false });
    skirt(B.stone, a, b, c, e);
    gable(B.roof, B[mat], a, b, h, c, e, { rise: wing * 0.18, alongX: ax });
    ctx.solid(a, b, c, e, h);
  }
  if (colonnade) {
    const ch = Math.min(h * 0.55, 7), dia = ch / 9, m = 3, xa = x0 + wing + m, xb = x1 - wing - m, za = z0 + wing + m, zb = z1 - wing - m;
    if (xb - xa > 8 && zb - za > 8) {
      const nx = Math.round((xb - xa) / 3.6), nz = Math.round((zb - za) / 3.6);
      for (let i = 0; i <= nx; i++) for (const z of [za, zb]) ctx.column(xa + ((xb - xa) * i) / nx, 0, z, ch, dia);
      for (let j = 1; j < nz; j++) for (const x of [xa, xb]) ctx.column(x, 0, za + ((zb - za) * j) / nz, ch, dia);
    }
  }
  // courtyard faces
  const ci = wing + e;
  if (w - 2 * ci > 10 && d - 2 * ci > 10) {
    for (let s = 0; s < storeys; s++) {
      bayBox(ctx, x0 + ci, x1 - ci, (s * h) / storeys, ((s + 1) * h) / storeys, z0 + ci, z1 - ci, 3.4,
        { mat, kind: 'window', pil: false, cornice: s === storeys - 1, depth: 0.34, inward: true });
    }
  }
  for (const hl of halls) {
    const a = hl.x - hl.w / 2, b = hl.x + hl.w / 2, c = hl.z - hl.d / 2, e = hl.z + hl.d / 2, ax = hl.w > hl.d;
    bayBox(ctx, a - 0.3, b + 0.3, h, hl.h, c - 0.3, e + 0.3, 4.2, { mat, kind: 'window', ww: 1.4, wh: (hl.h - h) * 0.4, sill: (hl.h - h) * 0.3, depth: 0.28, pilW: 0.7 });
    box(B[mat], a, b, 0, hl.h, c, e, { top: false });
    gable(B.roof, B[mat], a, b, hl.h, c, e, { rise: (ax ? hl.d : hl.w) * 0.17, alongX: ax });
    ctx.solid(a, b, c, e, hl.h);
  }
}

// The great imperial baths, on the plan Trajan's architect set: a walled garden with the bath
// block standing in it. Down the middle, the swimming pool open to the sky behind a high wall of
// statue niches, then the cold hall under three cross vaults lit by half-round windows, then the
// hot hall with its apse facing the afternoon sun, between domed sweating rooms. On either side a
// colonnaded exercise court. Walls are brick-faced; the domes are sheathed in lead.
function baths(ctx, o) {
  const { w, d } = o, B = ctx.bufs, M = ctx.M, k = Math.max(0.5, w / 330), hk = Math.max(0.65, k);
  court(ctx, { w, d, wallH: 9, porticoes: 'none', gap: 14 });
  const mw = w * 0.58, md = d * 0.44, X = (f) => f * mw, Z = (f) => f * md, bl = 5.2 * hk;
  const h0 = 16 * hk, hF = 20 * hk, hC = 26 * hk, hT = 36 * hk;
  ctx.push(0, d * 0.1);
  const block = (x0, x1, z0, z1, h, flat = false) => {
    const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(z0, z1), e = Math.max(z0, z1);
    box(B.brick, a, b, 0, h, c, e, { top: false }); skirt(B.stone, a, b, c, e);
    const t = h > 20 ? 3 : 2;
    for (let s = 0; s < t; s++) bayBox(ctx, a - 0.3, b + 0.3, (s * h) / t, ((s + 1) * h) / t, c - 0.3, e + 0.3, bl, { mat: 'brick', kind: s ? 'arch' : 'blank', depth: 0.45, pilW: 0.8, cornice: s === t - 1 });
    if (flat) B.roof.quad([a - 0.3, h, e + 0.3], [b + 0.3, h, e + 0.3], [b + 0.3, h, c - 0.3], [a - 0.3, h, c - 0.3]);
    else gable(B.roof, B.brick, a - 0.3, b + 0.3, h, c - 0.3, e + 0.3, { rise: Math.min(b - a, e - c) * 0.1, over: 0.6, alongX: b - a > e - c });
    ctx.solid(a, b, c, e, h);
  };
  // a half-round window split by two mullions, under a travertine arch
  const thermal = (F, u, v, r) => {
    const n = 12, P = (a, rr, ww) => F.P(u + rr * Math.cos(a), v + rr * Math.sin(a), ww);
    for (let i = 0; i < n; i++) {
      const a0 = (i * Math.PI) / n, a1 = ((i + 1) * Math.PI) / n;
      B.void.tri(F.P(u, v, 0.04), P(a0, r, 0.04), P(a1, r, 0.04));
      B.travertine.quad(P(a0, r, 0.04), P(a1, r, 0.04), P(a1, r + 0.8, 0.3), P(a0, r + 0.8, 0.3));
    }
    fbox(B.travertine, F, u - r - 0.5, u + r + 0.5, v - 0.4, v, 0, 0.4);
    for (const s of [-1, 1]) fbox(B.travertine, F, u + (s * r) / 3 - 0.28, u + (s * r) / 3 + 0.28, v, v + r * 0.94, 0, 0.14);
  };

  // frigidarium: the cold hall, with its clerestory rising above the roofs
  const riseF = Z(0.4) * 0.1;
  block(X(-0.3), X(0.3), Z(-0.2), Z(0.2), hF);
  {
    const a = X(-0.2), b = X(0.2), c = Z(-0.1), e = Z(0.1), H = hT - hF;
    box(B.brick, a, b, hF, hT, c, e, { top: false });
    [frame([a, e], [b, e], hF, [0, 0]), frame([b, c], [a, c], hF, [0, 0]), frame([b, e], [b, c], hF, [0, 0]), frame([a, c], [a, e], hF, [0, 0])].forEach((F, fi) => {
      const n = fi < 2 ? 3 : 1, v = fi < 2 ? riseF / 2 + 0.8 : riseF + 0.8;
      for (let i = 0; i < n; i++) {
        thermal(F, (F.L * (i + 0.5)) / n, v, Math.min(F.L / n / 2 - 1.6, H - v - 1.4));
        if (i) fbox(B.brick, F, (F.L * i) / n - 0.7, (F.L * i) / n + 0.7, 0, H, 0, 0.45);
      }
    });
    sweep(B.travertine, [[a, e], [b, e], [b, c], [a, c]], [[0, hT - 0.7], [0.3, hT - 0.6], [0.6, hT - 0.2], [0.65, hT], [0, hT]]);
    gable(B.roof, B.brick, a - 0.5, b + 0.5, hT, c - 0.5, e + 0.5, { rise: (e - c) * 0.14, over: 0.3, alongX: true });
  }

  // natatio: the swimming pool, open to the sky, closed at the front by a high wall of statue niches
  const zf = Z(0.5), zn = Z(0.2), xn = X(0.2), wt = 1.5;
  bayRun(ctx, [xn, zf - wt], [-xn, zf - wt], 0, h0, [0, zf + 5], bl * 1.2, { mat: 'brick', depth: 0.7, statue: true, pilW: 0.8 });
  B.travertine.quad([-xn, h0, zf - wt], [xn, h0, zf - wt], [xn, h0, zf], [-xn, h0, zf]);
  ctx.solid(-xn, xn, zf - wt, zf, h0);
  for (const s of [-1, 1]) block(s * X(0.2), s * X(0.3), Z(0.2), Z(0.5), h0);
  B.fine.quad([-xn, 0.06, zf - wt], [xn, 0.06, zf - wt], [xn, 0.06, zn + 0.3], [-xn, 0.06, zn + 0.3]);
  {
    const px = X(0.15), pz0 = Z(0.27), pz1 = Z(0.42);
    for (const s of [-1, 1]) { box(B.fine, s * px - 0.3, s * px + 0.3, 0, 0.55, pz0 - 0.3, pz1 + 0.3); const z = s > 0 ? pz1 : pz0; box(B.fine, -px, px, 0, 0.55, z - 0.3, z + 0.3); }
    B.pool.quad([-px, 0.4, pz1], [px, 0.4, pz1], [px, 0.4, pz0], [-px, 0.4, pz0]);
    ctx.solid(-px - 0.3, px + 0.3, pz0 - 0.3, pz1 + 0.3, 0.55);
    // a screen of columns in front of the cold hall
    const sc = 13 * hk, zs = zn + 3, ns = Math.max(2, Math.round((2 * xn - 4) / 5.5));
    for (let i = 0; i <= ns; i++) ctx.column(-xn + 2 + ((2 * xn - 4) * i) / ns, 0, zs, sc, sc / 9.4, 0, true);
    box(B.fine, -xn + 1.2, xn - 1.2, sc, sc * 1.13, zs - 0.75, zs + 0.75, { bottom: true });
  }
  // the entrance: a columned porch with bronze doors in the middle of the front wall
  {
    const dw = Math.min(7, xn * 0.4), st = 0.8, colH = 10 * hk, zc = zf + 4.5 * hk, eh = colH * 0.13, ext = { mat: 'brick', kind: 'arch', depth: 0.4, pilW: 0.8 };
    box(B.fine, -dw - 1, dw + 1, 0, st, zf, zc + 1.2); ctx.solid(-dw - 1, dw + 1, zf, zc + 1.2, st);
    for (let i = 0; i < 3; i++) box(B.fine, -dw - 1, dw + 1, 0, (st * (3 - i)) / 4, zc + 1.2 + 0.4 * i, zc + 1.6 + 0.4 * i);
    ctx.solid(-dw - 1, dw + 1, zc + 1.2, zc + 2.4, st, 0);
    for (const f of [-1, -1 / 3, 1 / 3, 1]) ctx.column(f * (dw - 0.4), st, zc, colH, colH / 9.4, 0, true);
    box(B.fine, -dw - 0.6, dw + 0.6, st + colH, st + colH + eh, zf, zc + 0.6, { bottom: true });
    gable(B.roof, B.fine, -dw - 0.6, dw + 0.6, st + colH + eh, zf, zc + 0.6, { rise: 2 * hk, over: 0.3 });
    templeDoor(ctx, frame([-dw, zf + 0.04], [dw, zf + 0.04], st, [0, 0]), dw, colH);
    B.brick.quad([-dw, st + colH, zf + 0.02], [dw, st + colH, zf + 0.02], [dw, h0, zf + 0.02], [-dw, h0, zf + 0.02]);
    bayRun(ctx, [-xn, zf], [-dw, zf], 0, h0, [0, 0], bl, ext); bayRun(ctx, [dw, zf], [xn, zf], 0, h0, [0, 0], bl, ext);
  }

  // caldarium: the hot hall, its apse of tall windows facing the garden
  block(X(-0.13), X(0.13), Z(-0.5), Z(-0.2), hC);
  {
    const R = X(0.08), cyl = Math.max(4, hC - R * 0.8), za = Z(-0.5);
    ctx.extra(new THREE.CylinderGeometry(R, R, cyl, 40, 1, true, Math.PI / 2, Math.PI), M.brickFlat, 0, cyl / 2, za);
    ctx.extra(new THREE.SphereGeometry(R, 40, 12, Math.PI, Math.PI, 0, Math.PI / 2), M.lead, 0, cyl, za);
    for (let j = 0; j < 5; j++) {
      const a = Math.PI / 2 + (Math.PI * (j + 0.5)) / 5, ww = 1.8 * hk;
      ctx.push(Math.sin(a) * (R + 0.06), za + Math.cos(a) * (R + 0.06), a);
      B.void.quad([-ww, cyl * 0.2, 0], [ww, cyl * 0.2, 0], [ww, cyl * 0.85, 0], [-ww, cyl * 0.85, 0]);
      box(B.travertine, -ww - 0.3, ww + 0.3, cyl * 0.2 - 0.3, cyl * 0.2, -0.1, 0.35);
      ctx.pop();
    }
    ctx.solid(-R, R, za - R, za, cyl);
  }
  // domed sweating rooms either side of it
  for (const s of [-1, 1]) {
    block(s * X(0.13), s * X(0.3), Z(-0.5), Z(-0.2), h0, true);
    const rr = Math.min(X(0.07), Z(0.12)), cx = s * X(0.215), cz = Z(-0.35), dh = 6 * hk;
    ctx.extra(new THREE.CylinderGeometry(rr, rr, dh, 36, 1, true), M.brickFlat, cx, h0 + dh / 2, cz);
    ctx.extra(new THREE.SphereGeometry(rr, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.lead, cx, h0 + dh, cz);
    const tor = new THREE.TorusGeometry(rr + 0.2, 0.35, 6, 36); tor.rotateX(Math.PI / 2); ctx.extra(tor, M.marbleFlat, cx, h0 + dh, cz);
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * Math.PI * 2;
      ctx.push(cx + Math.sin(a) * (rr + 0.05), cz + Math.cos(a) * (rr + 0.05), a);
      B.void.quad([-0.8, h0 + dh * 0.3, 0], [0.8, h0 + dh * 0.3, 0], [0.8, h0 + dh * 0.8, 0], [-0.8, h0 + dh * 0.8, 0]);
      ctx.pop();
    }
  }

  // palaestrae: an exercise court either side, colonnaded all round, entered by a gate at the front
  for (const s of [-1, 1]) {
    const lo = Math.min(s * X(0.3), s * X(0.45)), hi = Math.max(s * X(0.3), s * X(0.45)), hp = 14 * hk, gw = 3 * hk, xm = (lo + hi) / 2;
    block(s * X(0.45), s * X(0.5), Z(-0.5), Z(0.5), hp);
    block(lo, xm - gw, Z(0.4), Z(0.5), hp); block(xm + gw, hi, Z(0.4), Z(0.5), hp);
    block(lo, hi, Z(-0.5), Z(-0.4), hp);
    const wa = lo + 0.3, wb = hi - 0.3, wc = Z(-0.4) + 0.3, we = Z(0.4) - 0.3, m = 4.2 * hk, ch = 8 * hk;
    B.stone.quad([wa, 0.05, we], [wb, 0.05, we], [wb, 0.05, wc], [wa, 0.05, wc]);
    if (wb - wa < 2 * m + 5) continue;
    const xa = wa + m, xb = wb - m, za = wc + m, zb = we - m, eh = ch * 0.13, dia = ch / 9.4;
    const nx = Math.max(1, Math.round((xb - xa) / 3.8)), nz = Math.max(1, Math.round((zb - za) / 3.8));
    for (let i = 0; i <= nx; i++) for (const z of [za, zb]) ctx.column(xa + ((xb - xa) * i) / nx, 0, z, ch, dia);
    for (let j = 1; j < nz; j++) for (const x of [xa, xb]) ctx.column(x, 0, za + ((zb - za) * j) / nz, ch, dia);
    sweep(B.fine, [[xa - 0.4, zb + 0.4], [xb + 0.4, zb + 0.4], [xb + 0.4, za - 0.4], [xa - 0.4, za - 0.4]], [[0.8, ch], [0, ch], ...ENTAB.map(([p, q2]) => [-p * eh, ch + q2 * eh]), [0, ch + eh], [0.8, ch + eh]]);
    const y0 = ch + eh, y1 = y0 + 1.2;
    B.roof.quad([xa - 0.9, y0, zb + 0.9], [xb + 0.9, y0, zb + 0.9], [wb, y1, we], [wa, y1, we]); B.roof.quad([xb + 0.9, y0, za - 0.9], [xa - 0.9, y0, za - 0.9], [wa, y1, wc], [wb, y1, wc]);
    B.roof.quad([xa - 0.9, y0, za - 0.9], [xa - 0.9, y0, zb + 0.9], [wa, y1, we], [wa, y1, wc]); B.roof.quad([xb + 0.9, y0, zb + 0.9], [xb + 0.9, y0, za - 0.9], [wb, y1, wc], [wb, y1, we]);
  }
  ctx.pop();
}

// ---------- seating banks: amphitheatre, theatre, circus ----------

// Seating between an inner ellipse (a0, b0) and an outer one (a1, b1). `full` is a closed
// amphitheatre with gates on the four axes; otherwise a half-circle theatre on the -z side.
function cavea(ctx, o) {
  const { a0, b0, a1, b1, h, bays, full = true, cz = 0, storeys = 3, podium = 3.6 } = o, B = ctx.bufs;
  const D = (full ? 2 * Math.PI : Math.PI) / bays, base = full ? 0 : Math.PI;
  const rib = (phi) => { const c = Math.cos(phi), s = Math.sin(phi); return { x0: a0 * c, z0: cz + b0 * s, x1: a1 * c, z1: cz + b1 * s }; };
  const sTop = 0.86, seatTop = h * 0.74, top = h - 1.2, da = a1 - a0, db = b1 - b0;
  // Real rows of seats, each a step you can climb, with two broad walkways dividing the bank into
  // three tiers. A full amphitheatre ends in a roofed gallery at the top instead of a blank wall.
  const N = Math.max(8, Math.round((seatTop - podium) / 0.62)), walk = [Math.round(N * 0.3), Math.round(N * 0.62)];
  const wts = Array.from({ length: N }, (_, r) => (walk.includes(r) ? 3.2 : 1)), wsum = wts.reduce((p, c) => p + c, 0);
  const profile = [[0, 0], [0, podium], [0.03, podium]], rows = [];
  for (let r = 0, sa = 0.03; r < N; r++) {
    const y = podium + ((seatTop - podium) * (r + 1)) / N;
    profile.push([sa, y]); sa += ((sTop - 0.03) * wts[r]) / wsum; profile.push([sa, y]); rows.push([sa, y]);
  }
  if (!full) profile.push([sTop, top], [1, top]);
  // Staircases in the ring corridor of a full amphitheatre: two sets on opposite sides, each three
  // flights of three bays, climbing from the street to the top gallery through holes in the floors.
  const sC = 0.915, dS = 1 / da, pol = (phi, sv) => [(a0 + sv * da) * Math.cos(phi), cz + (b0 + sv * db) * Math.sin(phi)];
  const flights = full ? [3, 43].flatMap((b) => [0, 1, 2].map((st) => ({ st, i0: b + 3 * st }))) : [];
  const inFlight = (st, i) => flights.some((f) => f.st === st && i >= f.i0 && i < f.i0 + 3);
  const levelY = (st) => (st >= storeys ? seatTop : (st * h * 0.7) / storeys);
  const profY = (s) => { if (s < 0.03) return podium; for (const [se, y] of rows) if (s <= se) return y; return full ? seatTop : top; };
  const roofProf = [[sTop - 0.03, top - 0.7], [sTop - 0.03, top], [1, top]];
  const gates = full ? [0, bays / 4, bays / 2, (3 * bays) / 4] : [];

  if (full) {
    for (let q = 0; q < 4; q++) {
      const ribs = [];
      for (let k = 0; k < bays / 4; k++) ribs.push(rib(((q * bays) / 4 + k + 0.5) * D));
      sweepRibs(B.travertine, ribs, profile, { capBuf: B.stone });
      sweepRibs(B.travertine, ribs, roofProf);
    }
  } else {
    const ribs = [];
    for (let k = 0; k <= bays; k++) ribs.push(rib(base + k * D));
    sweepRibs(B.travertine, ribs, profile, { capBuf: B.stone });
  }

  // each arcaded storey: arches between engaged columns, under a full entablature
  const eh = ((h * 0.7) / storeys) * 0.13, cdia = ((h * 0.7) / storeys - eh) / 9, co = 0.1, off = co + cdia * 0.42, path = [];
  for (let i = 0; i <= (full ? bays - 1 : bays); i++) {
    const phi = full ? (i - 0.5) * D : base + i * D, c = Math.cos(phi), sn = Math.sin(phi), nl = Math.hypot(c / a1, sn / b1), nx = c / a1 / nl, nz = sn / b1 / nl;
    path.push([a1 * c, cz + b1 * sn]);
    for (let st = 0; st < storeys; st++) {
      ctx.push(a1 * c + nx * co, cz + b1 * sn + nz * co, Math.atan2(nx, nz));
      ctx.column(0, (st * h * 0.7) / storeys, 0, (h * 0.7) / storeys - eh, cdia);
      ctx.pop();
    }
    if (full) { // column of the top gallery (no collision box: the ring corridor runs beneath it)
      const sg = sTop + 0.012, p = ctx.toWorld((a0 + sg * da) * c, seatTop, cz + (b0 + sg * db) * sn);
      ctx.columns.push([p[0], p[1], p[2], top - 0.7 - seatTop, 1.05, ctx.rot + Math.atan2(nx, nz), 0, false]);
      const bx = a1 * c + nx * 17, bz = cz + b1 * sn + nz * 17; // boundary stone on the paved apron
      box(B.travertine, bx - 0.28, bx + 0.28, 0, 1.75, bz - 0.28, bz + 0.28);
    }
  }
  for (let st = 1; st <= storeys; st++) {
    const Y = (st * h * 0.7) / storeys - eh;
    sweep(B.travertine, path, [[0, Y], [off, Y], ...ENTAB.map(([p, q2]) => [off + p * eh, Y + q2 * eh]), [0, Y + eh]], full);
  }
  { const ce = Math.min(4, h * 0.085); sweep(B.travertine, path, [...ENTAB.map(([p, q2]) => [0.38 + p * ce * 0.75, h - ce + q2 * ce]), [-1.3, h]], full); }

  const arcH = (h * 0.7) / storeys;
  for (let i = 0; i < bays; i++) {
    const p0 = full ? (i - 0.5) * D : base + i * D, p1 = p0 + D;
    const xa = a1 * Math.cos(p0), za = cz + b1 * Math.sin(p0), xb = a1 * Math.cos(p1), zb = cz + b1 * Math.sin(p1);
    const A = [xa, za], Bp = [xb, zb], ref = [0, cz], uo = i * Math.hypot(xb - xa, zb - za);
    for (let s = 0; s < storeys; s++) {
      if (s === 0 && gates.includes(i)) continue;
      bay(ctx, A, Bp, s * arcH, (s + 1) * arcH - eh, ref, { mat: 'travertine', depth: full && s === 0 ? 2.2 : 1.7, uo, open: full, thick: s > 0 ? arcH : undefined, statue: full && s > 0 ? 4 + ((i * 7 + s * 3) % 4) : false, parapet: full && s > 0 ? 1 : 0, parapetW: -0.42, pil: false, cornice: false });
    }
    if (full) {
      // ring corridor behind the ground-floor arches: inner wall and a ceiling at each storey
      const ri = (phi) => [(a0 + sTop * (a1 - a0)) * Math.cos(phi), cz + (b0 + sTop * (b1 - b0)) * Math.sin(phi)];
      const ia = ri(p0), ib = ri(p1);
      B.travertine.quad([ia[0], 0, ia[1]], [ib[0], 0, ib[1]], [ib[0], storeys * arcH, ib[1]], [ia[0], storeys * arcH, ia[1]]);
      // floors: each storey's, the ceiling of the top one, and the gallery floor, holed where a stair comes up
      const slab = (y, hole) => {
        if (!hole) { B.stone.quad([xa, y, za], [xb, y, zb], [ib[0], y, ib[1]], [ia[0], y, ia[1]]); return; }
        const oa = pol(p0, sC + dS), ob = pol(p1, sC + dS), na = pol(p0, sC - dS), nb = pol(p1, sC - dS);
        B.stone.quad([xa, y, za], [xb, y, zb], [ob[0], y, ob[1]], [oa[0], y, oa[1]]);
        B.stone.quad([na[0], y, na[1]], [nb[0], y, nb[1]], [ib[0], y, ib[1]], [ia[0], y, ia[1]]);
      };
      for (let s = 1; s < storeys; s++) slab(s * arcH, inFlight(s - 1, i));
      slab(storeys * arcH, inFlight(storeys - 1, i)); slab(seatTop, inFlight(storeys - 1, i));
    }
    // attic storey: solid wall with pilasters and a small window in every other bay
    bay(ctx, A, Bp, storeys * arcH, h, ref, { mat: 'travertine', kind: i % 2 ? 'window' : 'blank', ww: 1.2, wh: 1.4, sill: (h - storeys * arcH) * 0.42, uo, shield: full, cornice: false, pilW: 1.1 });
    if (full) { // timber masts that carried the awning, three to a bay
      const F = frame(A, Bp, storeys * arcH, ref), ah = h - storeys * arcH;
      for (const t of [1 / 6, 1 / 2, 5 / 6]) {
        fbox(B.wood, F, F.L * t - 0.13, F.L * t + 0.13, ah * 0.6, ah + 5, 0.42, 0.68);
        fbox(B.travertine, F, F.L * t - 0.3, F.L * t + 0.3, ah * 0.53, ah * 0.6, 0, 0.85); // the stone bracket each mast stands on
        fbox(B.travertine, F, F.L * t - 0.22, F.L * t + 0.22, ah * 0.46, ah * 0.53, 0, 0.5);
      }
    }
  }
  if (full) fan(B.sand, a0, b0, 0.1, 56, 0, cz);
  if (full && o.awning !== false) {
    // The awning: a strip of linen for every bay, hung from the masts and sloping down to a rope
    // ring over the lower seats, so the arena itself stays open to the sky.
    const sIn = 0.2, yOut = h + 3.6, yIn = h - 11, NS = 6;
    const at = (phi, t) => { const sv = 1 - t * (1 - sIn); return [(a0 + sv * da) * Math.cos(phi), yOut + t * (yIn - yOut) - 1.6 * Math.sin(Math.PI * t), cz + (b0 + sv * db) * Math.sin(phi)]; };
    for (let i = 0; i < bays; i++) {
      const pA = (i - 0.5) * D + D * 0.07, pB = (i + 0.5) * D - D * 0.07, cloth = i % 5 === 2 ? B.awningRed : B.awning;
      for (let k = 0; k < NS; k++) cloth.quad(at(pA, k / NS), at(pB, k / NS), at(pB, (k + 1) / NS), at(pA, (k + 1) / NS));
      const r0 = at((i - 0.5) * D, 1), r1 = at((i + 0.5) * D, 1);
      B.wood.quad(r0, r1, [r1[0], r1[1] + 0.3, r1[2]], [r0[0], r0[1] + 0.3, r0[2]]); // the rope ring
    }
  }
  if (full) furnishArena(ctx, { a0, b0, da, db, cz, D, bays, podium, profile, rows, walk, rib, roofProf, sTop, arcH, storeys, seatTop, flights, inFlight, levelY, sC, dS });
  if (full) {
    // Where you can walk above ground: the corridor floors, the gallery, and the stair flights.
    const R = Math.max(a1, b1) + Math.abs(cz) + 2;
    const where = (lx, lz) => {
      lz -= cz;
      if ((lx / a1) ** 2 + (lz / b1) ** 2 > 1 || (lx / a0) ** 2 + (lz / b0) ** 2 < 1) return null;
      let lo = 0, hi = 1;
      for (let i = 0; i < 18; i++) { const s = (lo + hi) / 2; if ((lx / (a0 + s * da)) ** 2 + (lz / (b0 + s * db)) ** 2 > 1) lo = s; else hi = s; }
      const s = (lo + hi) / 2;
      if (s < sTop) return null;
      const u = (Math.atan2(lz / (b0 + s * db), lx / (a0 + s * da)) / D + 0.5 + bays) % bays; // bay number, with fraction
      return [s, u];
    };
    const onStair = (w, st) => Math.abs(w[0] - sC) <= dS && inFlight(st, Math.floor(w[1]));
    for (let k = 1; k <= storeys; k++) {
      const y = levelY(k), thick = k === storeys ? seatTop - storeys * arcH + 0.6 : 0.6;
      ctx.custom(R, (lx, lz) => { const w = where(lx, lz); return !w || onStair(w, k - 1) ? -Infinity : y; }, thick);
    }
    for (const f of flights) {
      const y0 = levelY(f.st), y1 = levelY(f.st + 1), n = Math.round((y1 - y0) / 0.24);
      ctx.custom(R, (lx, lz) => {
        const w = where(lx, lz);
        if (!w || Math.abs(w[0] - sC) > dS || w[1] < f.i0 || w[1] >= f.i0 + 3) return -Infinity;
        return y0 + ((y1 - y0) * Math.ceil(((w[1] - f.i0) / 3) * n)) / n;
      }, 0.5);
    }
  }

  ctx.custom(Math.max(a1, b1) + Math.abs(cz) + 2, (lx, lz) => {
    lz -= cz;
    if (!full && lz > 0) return -Infinity;
    if ((lx / a1) ** 2 + (lz / b1) ** 2 > 1 || (lx / a0) ** 2 + (lz / b0) ** 2 < 1) return -Infinity;
    let lo = 0, hi = 1;
    for (let i = 0; i < 18; i++) { const s = (lo + hi) / 2; if ((lx / (a0 + s * da)) ** 2 + (lz / (b0 + s * db)) ** 2 > 1) lo = s; else hi = s; }
    const s = (lo + hi) / 2;
    if (full) {
      if (s > sTop + 0.004) return -Infinity; // the corridor behind the outer arcade; its piers block separately
      const phi = Math.atan2(lz / (b0 + s * db), lx / (a0 + s * da)), kq = Math.round(phi / (Math.PI / 2));
      if (Math.abs(phi - (kq * Math.PI) / 2) < D / 2) return -Infinity;
    }
    return profY(s);
  });
}

// Everything that stood inside the amphitheatre: the gates and the tunnels behind them, the
// imperial and magistrates' boxes, the safety fence round the arena, trapdoors, cages and gear
// on the sand, doorways onto the walkways, and benches, statues and braziers in the ring corridor.
function furnishArena(ctx, { a0, b0, da, db, cz, D, bays, podium, profile, rows, walk, rib, roofProf, sTop, arcH, storeys, seatTop, flights, inFlight, levelY, sC, dS }) {
  const B = ctx.bufs, M = ctx.M;
  const polar = (phi, s) => [(a0 + s * da) * Math.cos(phi), cz + (b0 + s * db) * Math.sin(phi)];
  // run fn in a frame standing at (phi, s): x to the right, z towards the centre of the arena
  const place = (phi, s, fn) => { const [x, z] = polar(phi, s), l = Math.hypot(x, z - cz) || 1; ctx.push(x, z, Math.atan2(-x / l, -(z - cz) / l)); fn(); ctx.pop(); };
  // small round things (jars, baskets, bars, wheels) are gathered here and merged into one mesh per material
  const props = { brickFlat: [], bronze: [], wood: [], flame: [], dark: [], basket: [], fruit: [], greens: [] };
  const put = (key, g, x, y, z) => { g.translate(x, y, z); g.applyMatrix4(ctx.matrix); props[key].push(g); };
  const lat = (pts, seg = 10) => new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), seg);
  const brazier = (y) => {
    for (let l = 0; l < 3; l++) { const a = (l / 3) * Math.PI * 2; limb(B.dark, [Math.cos(a) * 0.34, y, Math.sin(a) * 0.34], [Math.cos(a) * 0.1, y + 1.08, Math.sin(a) * 0.1], 0.025); }
    put('bronze', lat([[0.05, 1.0], [0.1, 1.06], [0.28, 1.12], [0.37, 1.27], [0.39, 1.33], [0.33, 1.33], [0.3, 1.29]]), 0, y, 0);
    B.dark.quad([-0.3, y + 1.3, 0.3], [0.3, y + 1.3, 0.3], [0.3, y + 1.3, -0.3], [-0.3, y + 1.3, -0.3]); // the bed of coals
    put('flame', lat([[0.3, 1.28], [0.29, 1.4], [0.22, 1.6], [0.12, 1.86], [0.03, 2.1], [0, 2.2]], 10), 0, y, 0);
    put('flame', lat([[0.17, 1.3], [0.15, 1.42], [0.08, 1.62], [0, 1.8]], 8), 0.03, y, -0.02);
    ctx.fires.push(ctx.toWorld(0, y + 1.75, 0));
  };
  // a doorway in the inner wall: marble frame, darkness beyond, and timber doors standing ajar
  const door = (y) => {
    B.void.quad([-0.9, y, 0.6], [0.9, y, 0.6], [0.9, y + 3.3, 0.6], [-0.9, y + 3.3, 0.6]);
    for (const u of [-1.05, 1.05]) box(B.fine, u - 0.15, u + 0.15, y, y + 3.3, 0.5, 0.72);
    box(B.fine, -1.3, 1.3, y + 3.3, y + 3.65, 0.5, 0.78, { bottom: true });
    for (const [hx, r] of [[-0.9, 1.2], [0.9, Math.PI - 0.45]]) {
      ctx.push(hx, 0.57, r);
      box(B.wood, 0, 0.9, y + 0.02, y + 3.26, -0.04, 0.04);
      for (const yy of [0.45, 1.6, 2.75]) box(B.bronze, 0.03, 0.87, y + yy, y + yy + 0.1, -0.055, 0.055);
      ctx.pop();
    }
  };
  const nearGate = (phi, m) => { const q = phi / (Math.PI / 2); return Math.abs(q - Math.round(q)) * (Math.PI / 2) < m; };

  // seats carried across the four entrances on a tunnel roof, and the gates themselves
  const j = profile.findIndex((p, i) => i >= 3 && p[1] >= 6.2), sClip = profile[j][0], tH = 5.2;
  for (let k = 0; k < 4; k++) {
    const ph = (k * Math.PI) / 2, ribs = [rib(ph - D / 2), rib(ph + D / 2)];
    sweepRibs(B.travertine, ribs, [[sClip, tH], ...profile.slice(j)]);
    sweepRibs(B.travertine, ribs, roofProf);
    sweepRibs(B.stone, ribs, [[sClip, tH], [sTop, tH]]);
    const R0 = k % 2 ? b0 : a0, gw = (k % 2 ? a0 : b0) * Math.sin(D / 2), xC = R0 + sClip * (k % 2 ? db : da), top = podium + 0.9;
    ctx.push(0, cz, -ph);
    for (const s of [-1, 1]) box(B.fine, R0 - 0.35, R0 + 0.35, 0, top, s > 0 ? gw : -gw - 0.7, s > 0 ? gw + 0.7 : -gw);
    box(B.fine, R0 - 0.45, R0 + 0.45, 3.1, top, -gw - 0.7, gw + 0.7, { bottom: true });
    box(B.fine, R0 - 0.6, R0 + 0.6, top, top + 0.22, -gw - 0.9, gw + 0.9, { bottom: true });
    if (k % 2 === 0) {
      // arena gate on the long axis, its doors standing open
      for (const s of [-1, 1]) {
        const hx = R0 - 0.36, hz = s * gw, ex = hx - gw * 0.85, ez = s * (gw + gw * 0.55);
        B.wood.quad([hx, 0, hz], [ex, 0, ez], [ex, 3.1, ez], [hx, 3.1, hz]);
        for (const y of [0.5, 1.55, 2.6]) B.bronze.quad([hx - 0.01, y, hz], [ex - 0.01, y, ez], [ex - 0.01, y + 0.16, ez], [hx - 0.01, y + 0.16, hz]);
      }
    } else {
      // a box of honour on the short axis: the emperor's on one side, the magistrates' opposite
      B.wood.quad([R0 - 0.36, 0, -gw], [R0 - 0.36, 0, gw], [R0 - 0.36, 3.1, gw], [R0 - 0.36, 3.1, -gw]);
      const fy = podium + 1.2, hw = gw + 3;
      box(B.fine, R0 - 0.5, xC + 0.3, top, fy, -hw, hw, { bottom: true });
      for (const s of [-1, 1]) box(B.fine, R0 - 0.5, xC + 0.3, podium, fy + 1, s > 0 ? hw - 0.25 : -hw, s > 0 ? hw : -hw + 0.25);
      box(B.fine, R0 - 0.5, R0 - 0.25, fy, fy + 0.95, -hw, hw);
      box(B.gold, R0 - 0.56, R0 - 0.5, fy + 0.25, fy + 0.7, -1.1, 1.1); // gilded panel on the front
      const cx0 = R0 + 0.15, cx1 = xC - 0.2, czz = hw - 0.6, chh = 3.5;
      for (const x of [cx0, cx1]) for (const z of [-czz, czz]) ctx.column(x, fy, z, chh, 0.42);
      box(B.fine, cx0 - 0.4, cx1 + 0.4, fy + chh, fy + chh + 0.35, -czz - 0.4, czz + 0.4, { bottom: true });
      const cloth = k === 1 ? B.awningRed : B.awning;
      cloth.quad([cx0 - 0.9, fy + chh + 0.4, -czz - 0.5], [cx0 - 0.9, fy + chh + 0.4, czz + 0.5], [cx1 + 0.5, fy + chh + 1.1, czz + 0.5], [cx1 + 0.5, fy + chh + 1.1, -czz - 0.5]);
      const xm = (R0 + xC) / 2 + 0.2;
      for (const z of k === 1 ? [0] : [-1.2, 1.2]) {
        box(B.fine, xm, xm + 0.9, fy, fy + 0.55, z - 0.6, z + 0.6);
        box(B.fine, xm + 0.72, xm + 0.9, fy + 0.55, fy + 1.8, z - 0.6, z + 0.6);
        for (const s of [-1, 1]) box(B.fine, xm, xm + 0.75, fy + 0.55, fy + 0.95, z + s * 0.6 - 0.09, z + s * 0.6 + 0.09);
        if (k === 1) for (const s of [-1, 1]) box(B.gold, xm + 0.7, xm + 0.92, fy + 1.8, fy + 2.05, z + s * 0.5 - 0.12, z + s * 0.5 + 0.12);
        box(k === 1 ? B.awningRed : B.awning, xm + 0.02, xm + 0.7, fy + 0.55, fy + 0.66, z - 0.5, z + 0.5); // cushion
      }
      for (const s of [-1, 1]) { box(B.fine, xC - 0.5, xC + 0.2, fy, fy + 0.9, s * (hw - 1.3) - 0.35, s * (hw - 1.3) + 0.35); figure(k === 1 ? B.gold : B.fine, xC - 0.15, fy + 0.9, s * (hw - 1.3), 1.9); }
    }
    ctx.pop();
  }

  // round the arena: a marble parapet on the podium, with posts and a rope for the safety net
  const NP = 120;
  for (let i = 0; i < NP; i++) {
    const p0 = (i / NP) * Math.PI * 2, p1 = ((i + 1) / NP) * Math.PI * 2;
    if (nearGate(p0 + Math.PI / NP, D / 2 + Math.PI / NP)) continue;
    const a = polar(p0, 0.004), b = polar(p1, 0.004);
    B.fine.quad([a[0], podium, a[1]], [b[0], podium, b[1]], [b[0], podium + 0.95, b[1]], [a[0], podium + 0.95, a[1]]);
    B.wood.quad([a[0], podium + 3.05, a[1]], [b[0], podium + 3.05, b[1]], [b[0], podium + 3.12, b[1]], [a[0], podium + 3.12, a[1]]);
    if (i % 2 === 0) place(p0, 0.004, () => { box(B.wood, -0.07, 0.07, podium, podium + 3.2, -0.07, 0.07); box(B.bronze, -0.09, 0.09, podium + 3.2, podium + 3.36, -0.09, 0.09); });
  }

  // on the sand: trapdoors over the lifts, beast cages, racks of spears and a stack of jars
  for (const gx of [-30, -15, 0, 15, 30]) for (const gz of [-13, 0, 13]) {
    if ((gx / a0) ** 2 + (gz / b0) ** 2 > 0.62) continue;
    const hx = gx === 0 && gz === 0 ? 3 : 1.4, hz = 1.4;
    B.dark.quad([gx - hx - 0.12, 0.12, cz + gz + hz + 0.12], [gx + hx + 0.12, 0.12, cz + gz + hz + 0.12], [gx + hx + 0.12, 0.12, cz + gz - hz - 0.12], [gx - hx - 0.12, 0.12, cz + gz - hz - 0.12]);
    B.plank.quad([gx - hx, 0.14, cz + gz + hz], [gx + hx, 0.14, cz + gz + hz], [gx + hx, 0.14, cz + gz - hz], [gx - hx, 0.14, cz + gz - hz]);
    for (let pz = -hz + 0.4; pz < hz - 0.1; pz += 0.4) B.dark.quad([gx - hx, 0.15, cz + gz + pz + 0.02], [gx + hx, 0.15, cz + gz + pz + 0.02], [gx + hx, 0.15, cz + gz + pz - 0.02], [gx - hx, 0.15, cz + gz + pz - 0.02]);
  }
  const cage = (x, z, r) => { // a beast cage on a cart: timber frame, iron bars, straw on the floor
    ctx.push(x, cz + z, r);
    for (const sx of [-0.85, 0.85]) for (const sz of [-0.9, 0.9]) { const g = new THREE.CylinderGeometry(0.33, 0.33, 0.09, 14); g.rotateX(Math.PI / 2); put('wood', g, sx, 0.43, sz); }
    for (const sx of [-0.85, 0.85]) box(B.wood, sx - 0.05, sx + 0.05, 0.38, 0.48, -0.9, 0.9);
    box(B.plank, -1.25, 1.25, 0.5, 0.62, -0.8, 0.8, { bottom: true });
    B.sand.quad([-1.1, 0.63, 0.68], [1.1, 0.63, 0.68], [1.1, 0.63, -0.68], [-1.1, 0.63, -0.68]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(B.wood, sx * 1.19 - 0.06, sx * 1.19 + 0.06, 0.62, 2.1, sz * 0.74 - 0.06, sz * 0.74 + 0.06);
    for (const sz of [-1, 1]) box(B.wood, -1.25, 1.25, 1.32, 1.4, sz * 0.74 - 0.04, sz * 0.74 + 0.04, { bottom: true });
    for (const sx of [-1, 1]) box(B.wood, sx * 1.19 - 0.04, sx * 1.19 + 0.04, 1.32, 1.4, -0.74, 0.74, { bottom: true });
    box(B.plank, -1.32, 1.32, 2.1, 2.2, -0.87, 0.87, { bottom: true });
    const bar = (bx, bz) => put('dark', new THREE.CylinderGeometry(0.022, 0.022, 1.48, 6), bx, 1.36, bz);
    for (let i = 0; i < 11; i++) for (const sz of [-0.74, 0.74]) bar(-1 + i * 0.2, sz);
    for (let i = 0; i < 6; i++) for (const sx of [-1.19, 1.19]) bar(sx, -0.5 + i * 0.2);
    limb(B.wood, [1.25, 0.52, 0], [2.7, 0.2, 0], 0.05); // the pole it is hauled by
    ctx.solid(-1.3, 1.3, -0.9, 0.9, 2.2);
    ctx.pop();
  };
  cage(-a0 + 7, 5, 0.3); cage(-a0 + 8, -5.5, -0.2); cage(-a0 + 11.5, 6.5, 1.3); cage(a0 - 8, -4, 0.1);
  const rack = (x, z, r) => {
    ctx.push(x, cz + z, r);
    for (const s of [-1, 1]) box(B.wood, s * 1.1 - 0.06, s * 1.1 + 0.06, 0.1, 1.5, -0.06, 0.06);
    box(B.wood, -1.2, 1.2, 1.3, 1.4, -0.05, 0.05); box(B.wood, -1.2, 1.2, 0.3, 0.4, 0.3, 0.4);
    for (let i = 0; i < 7; i++) { // spears leaning on the top rail
      const u = -0.9 + i * 0.3, sh = new THREE.CylinderGeometry(0.018, 0.018, 2.27, 6), hd = new THREE.ConeGeometry(0.045, 0.32, 6);
      sh.rotateX(-0.178); hd.rotateX(-0.178); put('wood', sh, u, 1.235, 0.18); put('bronze', hd, u, 2.5, -0.05);
    }
    for (let i = 0; i < 3; i++) { // round shields propped against the lower rail
      const g = new THREE.SphereGeometry(0.9, 16, 4, 0, Math.PI * 2, 0, 0.5); g.translate(0, -0.9 * Math.cos(0.5), 0); g.rotateX(Math.PI / 2 - 0.25);
      put(i === 1 ? 'fruit' : 'bronze', g, -0.8 + i * 0.8, 0.55, 0.42);
      const boss = new THREE.SphereGeometry(0.09, 8, 6); put('bronze', boss, -0.8 + i * 0.8, 0.58, 0.52);
    }
    ctx.pop();
  };
  rack(a0 - 6, 6, -1.2); rack(-a0 + 14, -9, 0.6);
  {
    const prof = [[0.04, 0], [0.13, 0.1], [0.21, 0.36], [0.2, 0.56], [0.08, 0.76], [0.07, 0.9], [0.1, 0.93]].map(([a, b]) => new THREE.Vector2(a, b)), jars = [];
    const rng = (n) => { const t = Math.sin(n * 91.7) * 43758.5; return t - Math.floor(t); };
    [[a0 - 10, 8.5], [-a0 + 16, 9], [4, -b0 + 3.5]].forEach(([jx, jz], c) => {
      for (let i = 0; i < 7; i++) { const g = new THREE.LatheGeometry(prof, 8); g.translate(jx + (i % 3) * 0.48 + rng(c * 9 + i) * 0.1, 0.1, cz + jz + Math.floor(i / 3) * 0.48 + rng(c * 5 + i + 3) * 0.1); jars.push(g); }
    });
    ctx.extra(mergeGeometries(jars), M.brickFlat, 0, 0, 0);
  }

  // doorways from the stairs onto the two walkways
  for (const w of walk) for (let i = 0; i < bays; i++) {
    if (i % 5 !== 2) continue;
    const y0 = rows[w][1];
    place(i * D, rows[w][0] - 0.004, () => {
      for (const u of [-1, 1]) box(B.travertine, u > 0 ? 0.7 : -1.15, u > 0 ? 1.15 : -0.7, y0, y0 + 2.6, -0.5, 0.95);
      box(B.travertine, -0.7, 0.7, y0 + 2.1, y0 + 2.6, -0.5, 0.95, { bottom: true });
      box(B.fine, -1.3, 1.3, y0 + 2.6, y0 + 2.8, -0.6, 1.05, { bottom: true });
      B.void.quad([-0.7, y0, -0.12], [0.7, y0, -0.12], [0.7, y0 + 2.1, -0.12], [-0.7, y0 + 2.1, -0.12]);
      box(B.wood, -0.69, -0.62, y0, y0 + 2.05, -0.08, 0.8); // the door, folded back against the jamb
    });
  }

  // ring corridor: benches, statues, stair doors along the inner wall, and braziers by the piers
  for (let i = 0; i < bays; i++) {
    if (i % 20 === 0) continue;
    place(i * D, sTop + 0.014, () => {
      if (i % 4 === 1) { box(B.travertine, -1.2, 1.2, 0.38, 0.5, 0.1, 0.62); for (const u of [-0.95, 0.95]) box(B.travertine, u - 0.12, u + 0.12, 0, 0.38, 0.14, 0.58); }
      else if (i % 4 === 2) { box(B.fine, -0.5, 0.5, 0, 1.1, -0.1, 0.6); box(B.fine, -0.58, 0.58, 1.1, 1.22, -0.18, 0.66, { bottom: true }); statue(B, 0, 1.22, 0.25, 2.4, Math.PI, i >> 2); }
      else if (i % 4 === 3) door(0);
    });
    if (i % 4 === 0) place((i + 0.5) * D, 0.955, () => brazier(0));
  }

  // an arch across the corridor at every pier, on all three floors
  for (let i = 0; i < bays; i++) for (let st = 0; st < storeys; st++) {
    if (flights.some((f) => f.st === st && i >= f.i0 && i <= f.i0 + 3)) continue; // a stair passes here
    const phi = (i - 0.5) * D, A = polar(phi, 1 - (st ? 1.7 : 2.2) / da - 0.001), Bp = polar(phi, sTop + 0.001);
    bay(ctx, A, Bp, st * arcH, (st + 1) * arcH - 0.05, polar(phi + D, 0.93), { mat: 'travertine', open: true, pil: false, cornice: false, depth: 0.9, thick: st ? arcH : undefined });
  }
  // the stairs themselves: stone steps between low side walls
  for (const f of flights) {
    const y0 = levelY(f.st), y1 = levelY(f.st + 1), n = Math.round((y1 - y0) / 0.24), rs = (y1 - y0) / n, hw = dS * da;
    for (let j = 0; j < n; j++) {
      const pa = (f.i0 - 0.5 + (3 * j) / n) * D, pb = (f.i0 - 0.5 + (3 * (j + 1)) / n) * D, a = polar(pa, sC), b = polar(pb, sC);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.56, yt = y0 + rs * (j + 1);
      place((pa + pb) / 2, sC, () => {
        box(B.travertine, -len, len, yt - rs - 0.5, yt, -hw, hw, { bottom: true });
        for (const s of [-1, 1]) box(B.fine, -len, len, yt, yt + 0.95, s * hw - (s > 0 ? 0.14 : 0), s * hw + (s > 0 ? 0 : 0.14));
      });
    }
  }
  // upper corridors: benches and statues along the inner wall, as on the ground floor
  for (let st = 1; st < storeys; st++) for (let i = 0; i < bays; i++) {
    if (i % 4 !== 1 && i % 4 !== 2) continue;
    const y = st * arcH;
    place(i * D, sTop + 0.014, () => {
      if (i % 4 === 1) { box(B.travertine, -1.2, 1.2, y + 0.38, y + 0.5, 0.1, 0.62); for (const u of [-0.95, 0.95]) box(B.travertine, u - 0.12, u + 0.12, y, y + 0.38, 0.14, 0.58); }
      else { box(B.fine, -0.5, 0.5, y, y + 1.1, -0.1, 0.6); box(B.fine, -0.58, 0.58, y + 1.1, y + 1.22, -0.18, 0.66, { bottom: true }); statue(B, 0, y + 1.22, 0.25, 2.4, Math.PI, (i >> 2) + st); }
    });
  }
  // upper corridors: stair doors along the inner wall and braziers by the piers
  for (let st = 1; st < storeys; st++) for (let i = 0; i < bays; i++) {
    const y = st * arcH;
    if (i % 4 === 3) place(i * D, sTop + 0.014, () => door(y));
    if (i % 4 === 1) place((i + 0.5) * D, 0.96, () => brazier(y));
  }
  // food and drink stalls in the ground corridor: a table under a cloth canopy, with baskets and jars
  for (let i = 5; i < bays; i += 8) if (!inFlight(0, i)) place(i * D, sTop + 0.05, () => {
    box(B.wood, -1.3, 1.3, 0.78, 0.86, -0.5, 0.3, { bottom: true });
    for (const u of [-1.2, 1.2]) for (const v of [-0.42, 0.22]) box(B.wood, u - 0.05, u + 0.05, 0, 0.78, v - 0.05, v + 0.05, { top: false });
    for (const u of [-1.4, 1.4]) for (const v of [-0.75, 0.45]) box(B.wood, u - 0.04, u + 0.04, 0, v < 0 ? 2.25 : 2.6, v - 0.04, v + 0.04);
    (i % 16 === 5 ? B.awningRed : B.awning).quad([-1.55, 2.2, -0.95], [1.55, 2.2, -0.95], [1.55, 2.62, 0.5], [-1.55, 2.62, 0.5]);
    [['fruit', -1.0], ['greens', -0.45], ['basket', 0.1]].forEach(([what, u], k) => { // baskets heaped with fruit, greens and bread
      put('basket', lat([[0.001, 0], [0.17, 0], [0.2, 0.1], [0.25, 0.2], [0.23, 0.2]], 12), u, 0.86, -0.12);
      const heap = new THREE.SphereGeometry(0.23, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); heap.scale(1, 0.55, 1); put(what, heap, u, 1.03, -0.12);
      for (let m = 0; m < 5; m++) { const a = m * 1.26 + k, lump = new THREE.SphereGeometry(0.075, 7, 5); lump.scale(1, what === 'basket' ? 0.6 : 0.9, 1); put(what, lump, u + Math.cos(a) * 0.11, 1.13, -0.12 + Math.sin(a) * 0.11); }
    });
    put('bronze', lat([[0.001, 0], [0.08, 0], [0.13, 0.1], [0.11, 0.24], [0.05, 0.31], [0.075, 0.38], [0, 0.37]], 10), 0.7, 0.86, -0.2); // wine jug
    for (let k = 0; k < 4; k++) put('brickFlat', lat([[0.001, 0], [0.035, 0], [0.06, 0.08], [0, 0.07]], 8), 0.95 + (k % 2) * 0.17, 0.86, -0.3 + (k >> 1) * 0.2); // cups
    for (let k = 0; k < 5; k++) { // amphorae leaning against the front of the table
      const g = lat([[0.001, 0], [0.05, 0.1], [0.16, 0.4], [0.185, 0.58], [0.13, 0.76], [0.055, 0.84], [0.05, 0.98], [0.085, 1.02], [0, 1.02]], 10);
      g.rotateZ(((k * 7) % 3 - 1) * 0.07); g.rotateX(0.2); put('brickFlat', g, -1.1 + k * 0.36, 0, -0.78);
    }
  });

  // marble facing on the arena wall, and a low wall along the arena side of each walkway
  for (let i = 0; i < NP; i++) {
    const p0 = (i / NP) * Math.PI * 2, p1 = ((i + 1) / NP) * Math.PI * 2;
    if (!nearGate(p0 + Math.PI / NP, D / 2 + Math.PI / NP)) {
      const a = polar(p0, -0.004), b = polar(p1, -0.004);
      B.fine.quad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], podium, b[1]], [a[0], podium, a[1]]);
      B.gold.quad([a[0], podium - 0.5, a[1] ], [b[0], podium - 0.5, b[1]], [b[0], podium - 0.42, b[1]], [a[0], podium - 0.42, a[1]]);
    }
    for (const w of walk) {
      const a = polar(p0, rows[w - 1][0] + 0.003), b = polar(p1, rows[w - 1][0] + 0.003), y = rows[w][1];
      B.fine.quad([a[0], y, a[1]], [b[0], y, b[1]], [b[0], y + 0.7, b[1]], [a[0], y + 0.7, a[1]]);
    }
  }
  // stairways running up through the seats, a half-height step in front of every row
  const rise = rows[1][1] - rows[0][1];
  for (let i = 0; i < bays; i += 5) for (let r = 1; r < rows.length; r++) {
    place((i + 2.5) * D, rows[r - 1][0], () => box(B.fine, -0.5, 0.5, rows[r - 1][1], rows[r - 1][1] + rise / 2, 0, 0.36));
  }
  // timber benches in the top gallery, where the poorest spectators sat
  {
    const g = seatTop, tiers = [[0.9, g], [0.9, g + 0.45], [0.925, g + 0.45], [0.925, g + 0.9], [0.95, g + 0.9], [0.95, g + 1.35], [0.99, g + 1.35]];
    for (let k = 0; k < bays; k++) if (!inFlight(storeys - 1, k)) sweepRibs(B.plank, [rib((k - 0.5) * D), rib((k + 0.5) * D)], tiers); // left clear where a stair arrives
  }
  for (const key in props) {
    if (!props[key].length) continue;
    const m = new THREE.Mesh(mergeGeometries(props[key]), M[key]);
    m.castShadow = key !== 'flame'; m.receiveShadow = true;
    ctx.extras.push(m);
  }
}

function amphitheatre(ctx, o) { cavea(ctx, { ...o, bays: 80, full: true, storeys: 3 }); }

function theatre(ctx, o) {
  const { r, h } = o, B = ctx.bufs, cz = 25;
  cavea(ctx, { a0: 18, b0: 18, a1: r, b1: r, h, bays: 30, full: false, cz, storeys: 2, podium: 1.5 });
  box(B.stone, -r, r, 0, h, cz, cz + 14, { top: B.roof });
  skirt(B.stone, -r, r, cz, cz + 14);
  for (let s = 0; s < 3; s++) bayBox(ctx, -r - 0.3, r + 0.3, (s * h) / 3, ((s + 1) * h) / 3, cz - 0.3, cz + 14.3, 6.5, { mat: 'stone', kind: s ? 'window' : 'blank', ww: 1.6, wh: 2.6, depth: 0.5 });
  ctx.solid(-r, r, cz, cz + 14, h);
}

function circus(ctx) {
  const B = ctx.bufs, M = ctx.M, r0 = 39.5, r1 = 67.5, zA = -300, zB = 240, sh = 8, h = 3 * sh, top = h + 3.2, pod = 2.5, seatTop = 20, sT = 0.9;
  // rows of seats in three banks divided by two walkways, and a roofed gallery along the top
  const N = Math.round((seatTop - pod) / 0.62), walk = [Math.round(N * 0.33), Math.round(N * 0.66)];
  const wts = Array.from({ length: N }, (_, r) => (walk.includes(r) ? 3 : 1)), wsum = wts.reduce((a, b) => a + b, 0);
  const profile = [[0, 0], [0, pod], [0.03, pod]], rows = [];
  for (let r = 0, sa = 0.03; r < N; r++) { const y = pod + ((seatTop - pod) * (r + 1)) / N; profile.push([sa, y]); sa += ((sT - 0.03) * wts[r]) / wsum; profile.push([sa, y]); rows.push([sa, y]); }
  profile.push([1, seatTop]);
  const roofProf = [[sT - 0.04, top - 0.9], [sT - 0.04, top - 0.2], [1, top + 0.3]];
  const profY = (s) => { if (s < 0.03) return pod; for (const [se, y] of rows) if (s <= se) return y; return seatTop; };
  const n = Math.round((zB - zA) / 5.5), mArc = 16, g = 4.5 / r1, quarter = Math.PI / 2 - g;
  const arcRib = (t) => ({ x0: r0 * Math.cos(t), z0: zB + r0 * Math.sin(t), x1: r1 * Math.cos(t), z1: zB + r1 * Math.sin(t), nx: Math.cos(t), nz: Math.sin(t) });
  const west = [], east = [];
  for (let i = 0; i <= n; i++) { const z = zA + ((zB - zA) * i) / n; west.push({ x0: -r0, z0: z, x1: -r1, z1: z, nx: -1, nz: 0 }); }
  for (let i = 1; i <= mArc; i++) west.push(arcRib(Math.PI - (quarter * i) / mArc));
  for (let i = 0; i <= mArc; i++) east.push(arcRib(quarter - (quarter * i) / mArc));
  for (let i = 1; i <= n; i++) { const z = zB - ((zB - zA) * i) / n; east.push({ x0: r0, z0: z, x1: r1, z1: z, nx: 1, nz: 0 }); }
  const cdia = (sh - 1) / 9;
  for (const ribs of [west, east]) {
    sweepRibs(B.travertine, ribs, profile, { capBuf: B.stone });
    sweepRibs(B.roof, ribs, roofProf);
    for (let i = 0; i < ribs.length; i++) {
      const a = ribs[i], rot = Math.atan2(a.nx, a.nz);
      // engaged columns up the outside, a column of the top gallery, and the arena wall's marble face
      for (let s = 0; s < 3; s++) { const p = ctx.toWorld(a.x1 + a.nx * 0.12, s * sh, a.z1 + a.nz * 0.12); ctx.columns.push([p[0], p[1], p[2], sh - 1, cdia, ctx.rot + rot, 0, false]); }
      { const sg = sT - 0.03, p = ctx.toWorld(a.x0 + (a.x1 - a.x0) * sg, seatTop, a.z0 + (a.z1 - a.z0) * sg); ctx.columns.push([p[0], p[1], p[2], top - 0.9 - seatTop, 0.7, ctx.rot + rot, 0, false]); }
      if (i === ribs.length - 1) continue;
      const b = ribs[i + 1], ref = [0, Math.min((a.z1 + b.z1) / 2, zB)], A = [a.x1, a.z1], Bp = [b.x1, b.z1];
      bay(ctx, A, Bp, 0, sh, ref, { mat: 'travertine', depth: 1.3, uo: i * 5.5, pil: false });
      bay(ctx, A, Bp, sh, 2 * sh, ref, { mat: 'travertine', depth: 1.3, uo: i * 5.5, pil: false });
      bay(ctx, A, Bp, 2 * sh, h, ref, { mat: 'travertine', kind: 'window', ww: 1.4, wh: 2.4, sill: 2.4, depth: 0.5, uo: i * 5.5, pil: false });
      bay(ctx, A, Bp, h, top, ref, { mat: 'travertine', kind: 'blank', uo: i * 5.5, pil: false });
      B.fine.quad([a.x0 - a.nx * 0.05, 0, a.z0 - a.nz * 0.05], [b.x0 - b.nx * 0.05, 0, b.z0 - b.nz * 0.05], [b.x0 - b.nx * 0.05, pod, b.z0 - b.nz * 0.05], [a.x0 - a.nx * 0.05, pod, a.z0 - a.nz * 0.05]);
      B.fine.quad([a.x0, pod, a.z0], [b.x0, pod, b.z0], [b.x0, pod + 0.9, b.z0], [a.x0, pod + 0.9, a.z0]);
      B.gold.quad([a.x0 - a.nx * 0.06, pod - 0.45, a.z0 - a.nz * 0.06], [b.x0 - b.nx * 0.06, pod - 0.45, b.z0 - b.nz * 0.06], [b.x0 - b.nx * 0.06, pod - 0.37, b.z0 - b.nz * 0.06], [a.x0 - a.nx * 0.06, pod - 0.37, a.z0 - a.nz * 0.06]);
      for (const wr of walk) { const sv = rows[wr - 1][0] + 0.004, y = rows[wr][1], P = (r) => [r.x0 + (r.x1 - r.x0) * sv, r.z0 + (r.z1 - r.z0) * sv]; const pa = P(a), pb = P(b); B.fine.quad([pa[0], y, pa[1]], [pb[0], y, pb[1]], [pb[0], y + 0.7, pb[1]], [pa[0], y + 0.7, pa[1]]); }
    }
  }

  // the imperial box on the Palatine side: a temple front set into the seats
  {
    const pal = ctx.toWorld(1, 0, 0), org = ctx.toWorld(0, 0, 0), sd = (pal[0] - org[0]) * (-80 - org[0]) + (pal[2] - org[2]) * (320 - org[2]) > 0 ? 1 : -1;
    ctx.push(sd * (r0 + 15), -20, (-sd * Math.PI) / 2);
    temple(ctx, { w: 26, d: 20, podium: 11.5, colH: 8.5, cols: 6, roof: 'bronze', noAltar: true });
    ctx.pop();
  }

  // starting gates: twelve arched stalls with timber gates, a gallery over them, a tower at each end
  const pw = 1.4, stall = (2 * r0 - pw) / 12, gh = 7.5;
  for (let i = 0; i < 12; i++) {
    const xa = -r0 + i * stall + pw / 2, xb = xa + stall;
    bay(ctx, [xa, zA], [xb, zA], 0, gh, [0, zA - 5], { mat: 'travertine', open: true, depth: 1.4, pil: false, cornice: false, noSolid: true });
    bay(ctx, [xb, zA - 10], [xa, zA - 10], 0, gh, [0, zA - 5], { mat: 'travertine', open: true, depth: 1.4, pil: false, cornice: false, noSolid: true });
    const m = (xa + xb) / 2, gw = stall * 0.28;
    for (const sx of [-1, 1]) { // a pair of barred gates, shut
      box(B.wood, m + sx * 0.03, m + sx * gw, 0.25, 0.42, zA - 0.95, zA - 0.85); box(B.wood, m + sx * 0.03, m + sx * gw, 2.6, 2.77, zA - 0.95, zA - 0.85);
      for (let k = 0; k <= 4; k++) { const x = m + sx * (0.06 + ((gw - 0.1) * k) / 4); box(B.wood, x - 0.035, x + 0.035, 0.1, 3.1, zA - 0.94, zA - 0.86); }
    }
    box(B.fine, xa - 0.25, xa + 0.25, 0, 2.2, zA + 0.02, zA + 0.5); statue(B, xa, 2.2, zA + 0.26, 1.3, 0, 'figure'); // a herm between the gates
  }
  for (let i = 0; i <= 12; i++) { const x = -r0 + i * stall; box(B.travertine, x, x + pw, 0, gh, zA - 8.6, zA - 1.4); ctx.solid(x, x + pw, zA - 10, zA, gh); }
  box(B.travertine, -r0, r0, gh, gh + 1.2, zA - 10, zA, { bottom: true });
  B.coffer.quad([-r0, gh - 0.02, zA - 8.6], [r0, gh - 0.02, zA - 8.6], [r0, gh - 0.02, zA - 1.4], [-r0, gh - 0.02, zA - 1.4]);
  { // the gallery above, with the presiding magistrate's box in the middle
    const y = gh + 1.2, nC = 26;
    for (let i = 0; i <= nC; i++) { const x = -r0 + 1 + ((2 * r0 - 2) * i) / nC; if (Math.abs(x) < 5) continue; ctx.column(x, y, zA - 0.9, 4.2, 0.5); }
    box(B.fine, -r0, r0, y + 4.2, y + 4.9, zA - 1.5, zA - 0.3, { bottom: true });
    B.roof.quad([-r0, y + 4.9, zA - 0.1], [r0, y + 4.9, zA - 0.1], [r0, y + 6.2, zA - 10], [-r0, y + 6.2, zA - 10]);
    box(B.travertine, -r0, r0, y, y + 6.2, zA - 10, zA - 9.4);
    box(B.fine, -r0, r0, y, y + 0.95, zA - 0.5, zA - 0.25);
    box(B.fine, -5.5, 5.5, y, y + 0.5, zA - 3, zA + 1.6, { bottom: true });
    for (const sx of [-1, 1]) ctx.column(sx * 4.8, y + 0.5, zA + 1.0, 5.2, 0.6, 0, true);
    box(B.fine, -5.6, 5.6, y + 5.7, y + 6.5, zA - 3, zA + 1.7, { bottom: true });
    gable(B.bronze, B.fine, -5.6, 5.6, y + 6.5, zA - 3, zA + 1.7, { rise: 1.8, over: 0.4 });
    box(B.awningRed, -3.5, 3.5, y + 0.5, y + 1.5, zA + 1.4, zA + 1.5);
  }
  for (const s of [-1, 1]) {
    const a = s < 0 ? -r1 : r0, b = s < 0 ? -r0 : r1, th = 30;
    box(B.travertine, a, b, 0, th, zA - 14, zA + 2, { top: false });
    bayBox(ctx, a - 0.3, b + 0.3, 0, th * 0.5, zA - 14.3, zA + 2.3, 5.6, { mat: 'travertine', kind: 'blank', pilW: 0.9 });
    bayBox(ctx, a - 0.3, b + 0.3, th * 0.5, th, zA - 14.3, zA + 2.3, 5.6, { mat: 'travertine', kind: 'window', ww: 1.3, wh: 3, depth: 0.26, pilW: 0.9 });
    gable(B.roof, B.travertine, a - 0.3, b + 0.3, th, zA - 14.3, zA + 2.3, { rise: 3.2, over: 0.9, alongX: true });
    ctx.solid(a, b, zA - 14, zA + 2, th);
  }

  // the central barrier: a line of marble basins full of water, carrying the monuments of the track
  const sw = 3.6, sy = 1.3, basins = [[-168, -118], [-108, -62], [-52, -9], [9, 52], [62, 108], [118, 168]];
  for (const [a, b] of basins) {
    for (const sx of [-1, 1]) box(B.fine, sx * sw - 0.3, sx * sw + 0.3, 0, sy, a, b);
    for (const z of [a, b]) box(B.fine, -sw, sw, 0, sy, z - 0.3, z + 0.3);
    B.pool.quad([-sw, sy - 0.25, b], [sw, sy - 0.25, b], [sw, sy - 0.25, a], [-sw, sy - 0.25, a]);
  }
  for (const z of [-113, -57, 0, 57, 113]) box(B.fine, -sw - 0.3, sw + 0.3, 0, sy + 0.2, z - 5.3, z + 5.3);
  ctx.solid(-sw - 0.3, sw + 0.3, -168.3, 168.3, sy + 0.2);
  // the obelisk Augustus brought from Egypt, on its pedestal
  box(B.granite ?? B.fine, -1.8, 1.8, sy + 0.2, sy + 3.4, -1.8, 1.8); box(B.fine, -2.1, 2.1, sy + 0.2, sy + 0.7, -2.1, 2.1);
  { const ob = new THREE.CylinderGeometry(0.85, 1.5, 22, 4); ob.rotateY(Math.PI / 4); ctx.extra(ob, M.granite, 0, sy + 3.4 + 11, 0); const tip = new THREE.ConeGeometry(0.85, 1.7, 4); tip.rotateY(Math.PI / 4); ctx.extra(tip, M.gold, 0, sy + 3.4 + 22 + 0.85, 0); }
  // lap counters: seven eggs at one end, seven dolphins at the other, each row on a beam between two columns
  for (const [z, eggs] of [[-113, true], [113, false]]) {
    for (const sx of [-1, 1]) ctx.column(sx * 2.6, sy + 0.2, z, 5.2, 0.55, 0, true);
    box(B.fine, -3.1, 3.1, sy + 5.4, sy + 5.8, z - 0.4, z + 0.4, { bottom: true });
    for (let k = 0; k < 7; k++) {
      const x = -2.25 + k * 0.75;
      if (eggs) { const e = new THREE.SphereGeometry(0.26, 10, 8); e.scale(1, 1.35, 1); ctx.extra(e, M.marbleFlat, x, sy + 6.15, z); }
      else { const dph = new THREE.SphereGeometry(0.2, 8, 6); dph.scale(1, 1, 2.6); dph.rotateX(-0.5); ctx.extra(dph, M.bronze, x, sy + 6.1, z); limb(B.bronze, [x, sy + 6.2, z - 0.45], [x, sy + 6.55, z - 0.7], 0.07); }
    }
  }
  // small shrines, and columns carrying gilded Victories
  for (const z of [-57, 57]) {
    box(B.fine, -2.4, 2.4, sy + 0.2, sy + 0.5, z - 3.4, z + 3.4);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) ctx.column(sx * 1.9, sy + 0.5, z + sz * 2.6, 3.8, 0.42, 0, true);
    box(B.fine, -2.4, 2.4, sy + 4.3, sy + 4.9, z - 3.1, z + 3.1, { bottom: true });
    gable(B.bronze, B.fine, -2.4, 2.4, sy + 4.9, z - 3.1, z + 3.1, { rise: 1.1, over: 0.3 });
    box(B.fine, -0.5, 0.5, sy + 0.5, sy + 1.5, z - 0.5, z + 0.5); statue(B, 0, sy + 1.5, z, 2.0, z < 0 ? Math.PI : 0, 1);
  }
  for (const z of [-140, -85, -30, 30, 85, 140]) {
    box(B.fine, -0.7, 0.7, sy - 0.25, sy + 0.9, z - 0.7, z + 0.7);
    ctx.column(0, sy + 0.9, z, 7.5, 0.8, 0, true);
    statue({ fine: B.gold, bronze: B.gold, gold: B.gold }, 0, sy + 8.5, z, 2.2, z < 0 ? Math.PI : 0, 2);
  }
  // turning posts: three gilded cones on a rounded base at each end
  for (const z of [-178, 178]) {
    const base = new THREE.CylinderGeometry(3.9, 3.9, 2.2, 24, 1, false, 0, Math.PI); base.rotateY(z < 0 ? Math.PI / 2 : -Math.PI / 2);
    ctx.extra(base, M.marbleFlat, 0, 1.1, z + (z < 0 ? 2 : -2));
    for (const x of [-2.1, 0, 2.1]) { ctx.extra(new THREE.ConeGeometry(0.75, 5.6, 14), M.gold, x, 2.2 + 2.8, z + (z < 0 ? 0.6 : -0.6)); ctx.extra(new THREE.SphereGeometry(0.3, 10, 8), M.gold, x, 2.2 + 5.7, z + (z < 0 ? 0.6 : -0.6)); }
    ctx.solid(-3.9, 3.9, Math.min(z, z + (z < 0 ? 2 : -2)) - 2, Math.max(z, z + (z < 0 ? 2 : -2)) + 2, 2.2);
  }

  ctx.custom(345, (lx, lz) => {
    if (lz < zA || lz > zB + r1) return -Infinity;
    const r = lz <= zB ? Math.abs(lx) : Math.hypot(lx, lz - zB);
    if (r < r0 || r > r1) return -Infinity;
    if (lz > zB && Math.abs(lx) < 4.5) return -Infinity;
    return profY((r - r0) / (r1 - r0));
  });
}

// ---------- Trajan's Markets ----------

// Trajan's Markets: a great curve of brick. At street level a row of shops, each a doorway in a
// travertine frame with a small window over it; above them a storey of arched windows between
// pilasters; then a terrace, with a second row of shops set back behind it. Behind rises the
// market hall.
function markets(ctx, o) {
  const B = ctx.bufs, R0 = o.r ?? 30, R1 = R0 + 10, R2 = R1 + 12, h1 = 5.6, h = 11.6, h3 = 6, cz = 14, n = 24;
  const pt = (R, k) => { const a = Math.PI + (k * Math.PI) / n; return [R * Math.cos(a), cz + R * Math.sin(a)]; };
  const shop = (A, Bp, y0, H, ref, uo, shut) => {
    const F = frame(A, Bp, y0, ref, true, uo), L = F.L, dw = Math.min(1.0, L * 0.27), m = L / 2, dh = H * 0.56, dp = 0.45, back = -3.2;
    const ww = 0.45, w0 = dh + 0.75, w1 = Math.min(H - 0.5, w0 + 0.8), i0 = 0.15, i1 = L - 0.15, rh = dh + 0.3;
    q(B.brick, F, [0, 0, 0], [m - dw, 0, 0], [m - dw, H, 0], [0, H, 0]); q(B.brick, F, [m + dw, 0, 0], [L, 0, 0], [L, H, 0], [m + dw, H, 0]);
    q(B.brick, F, [m - dw, dh, 0], [m + dw, dh, 0], [m + dw, w0, 0], [m - dw, w0, 0]); q(B.brick, F, [m - dw, w1, 0], [m + dw, w1, 0], [m + dw, H, 0], [m - dw, H, 0]);
    q(B.brick, F, [m - dw, w0, 0], [m - ww, w0, 0], [m - ww, w1, 0], [m - dw, w1, 0]); q(B.brick, F, [m + ww, w0, 0], [m + dw, w0, 0], [m + dw, w1, 0], [m + ww, w1, 0]);
    B.void.quad(F.P(m - ww, w0, -0.3), F.P(m + ww, w0, -0.3), F.P(m + ww, w1, -0.3), F.P(m - ww, w1, -0.3));
    fbox(B.travertine, F, m - dw - 0.28, m - dw, 0, dh, -dp, 0.08); fbox(B.travertine, F, m + dw, m + dw + 0.28, 0, dh, -dp, 0.08);
    fbox(B.travertine, F, m - dw - 0.4, m + dw + 0.4, dh, dh + 0.4, -dp, 0.1); fbox(B.travertine, F, m - ww - 0.12, m + ww + 0.12, w0 - 0.12, w0, 0, 0.06);
    fbox(B.travertine, F, m - dw - 0.28, m + dw + 0.28, -0.05, 0.12, -dp, 0.2); // threshold
    if (shut) { for (const [a, b] of [[m - dw, m - 0.02], [m + 0.02, m + dw]]) B.wood.quad(F.P(a, 0.12, -0.3), F.P(b, 0.12, -0.3), F.P(b, dh, -0.3), F.P(a, dh, -0.3)); return; }
    q(B.brick, F, [i0, 0, -dp], [i0, rh, -dp], [i0, rh, back], [i0, 0, back], 's'); q(B.brick, F, [i1, 0, -dp], [i1, rh, -dp], [i1, rh, back], [i1, 0, back], 's');
    q(B.brick, F, [i0, 0, -dp], [m - dw, 0, -dp], [m - dw, rh, -dp], [i0, rh, -dp]); q(B.brick, F, [m + dw, 0, -dp], [i1, 0, -dp], [i1, rh, -dp], [m + dw, rh, -dp]);
    B.void.quad(F.P(i0, 0, back), F.P(i1, 0, back), F.P(i1, rh, back), F.P(i0, rh, back)); B.void.quad(F.P(i0, rh, -dp), F.P(i1, rh, -dp), F.P(i1, rh, back), F.P(i0, rh, back));
    B.stone.quad(F.P(i0, 0.1, -dp), F.P(i1, 0.1, -dp), F.P(i1, 0.1, back), F.P(i0, 0.1, back));
    fbox(B.plank, F, i0 + 0.2, i0 + 1.0, 0.1, 0.7, back + 0.2, back + 1.0); fbox(B.brick, F, i1 - 0.9, i1 - 0.3, 0.1, 0.75, back + 0.2, back + 0.8); // stock inside
  };
  for (let k = 0; k < n; k++) {
    const [ax, az] = pt(R0, k), [bx, bz] = pt(R0, k + 1), [cx, cz1] = pt(R1, k), [dx, dz] = pt(R1, k + 1), [ex, ez] = pt(R2, k), [fx, fz] = pt(R2, k + 1);
    const ref = [0, cz], F0 = frame([ax, az], [bx, bz], 0, ref, true, k * 4), F1 = frame([cx, cz1], [dx, dz], 0, ref, true, k * 4);
    shop([ax, az], [bx, bz], 0, h1, ref, k * 4, k % 5 === 3);
    fbox(B.travertine, F0, 0, F0.L, h1 - 0.26, h1, 0, 0.22);
    bay(ctx, [ax, az], [bx, bz], h1, h, ref, { mat: 'brick', inward: true, depth: 0.5, uo: k * 4, pilW: 0.7 });
    fbox(B.travertine, F0, 0, F0.L, h - 0.2, h + 0.05, 0, 0.5);
    B.stone.quad([ax, h, az], [bx, h, bz], [dx, h, dz], [cx, h, cz1]);                     // the terrace
    fbox(B.brick, F0, 0, F0.L, h, h + 1.0, -0.35, 0); q(B.brick, F0, [F0.L, h, -0.35], [0, h, -0.35], [0, h + 1.0, -0.35], [F0.L, h + 1.0, -0.35]); // its parapet
    shop([cx, cz1], [dx, dz], h, h3, ref, k * 4 + 2, k % 4 === 1);
    fbox(B.travertine, F1, 0, F1.L, h + h3 - 0.22, h + h3, 0, 0.3);
    B.roof.quad([cx, h + h3, cz1], [dx, h + h3, dz], [fx, h + h3 + 1.2, fz], [ex, h + h3 + 1.2, ez]);
    B.brick.quad([ex, 0, ez], [fx, 0, fz], [fx, h + h3 + 1.2, fz], [ex, h + h3 + 1.2, ez]);
  }
  for (const s of [-1, 1]) {
    const a = s < 0 ? -R2 : R0, b = s < 0 ? -R0 : R2;
    box(B.brick, a, b, 0, h, cz, cz + 10, { top: B.roof });
    bayBox(ctx, a - 0.3, b + 0.3, 0, h1, cz - 0.3, cz + 10.3, 4.2, { mat: 'brick', kind: 'blank', pilW: 0.7 });
    bayBox(ctx, a - 0.3, b + 0.3, h1, h, cz - 0.3, cz + 10.3, 4.2, { mat: 'brick', depth: 0.26, pilW: 0.7 });
    ctx.solid(a, b, cz, cz + 10, h);
  }
  // the market hall behind: two tiers of great arched windows between brick pilasters
  const bz0 = cz - R2 - 16, bz1 = cz - R2 + 2, hh = h + 20;
  box(B.brick, -R2 - 14, R2 + 14, 0, hh, bz0, bz1, { top: false });
  for (let t = 0; t < 2; t++) bayBox(ctx, -R2 - 14.3, R2 + 14.3, (t * hh) / 2, ((t + 1) * hh) / 2, bz0 - 0.3, bz1 + 0.3, 6.2, { mat: 'brick', depth: 0.28, pilW: 0.9 });
  sweep(B.travertine, [[-R2 - 14.3, bz1 + 0.3], [R2 + 14.3, bz1 + 0.3], [R2 + 14.3, bz0 - 0.3], [-R2 - 14.3, bz0 - 0.3]], [[0, hh - 0.6], [0.3, hh - 0.5], [0.55, hh - 0.15], [0.6, hh], [0, hh]]);
  gable(B.roof, B.brick, -R2 - 14.3, R2 + 14.3, hh, bz0 - 0.3, bz1 + 0.3, { rise: 3, alongX: true, over: 0.9 });
  ctx.solid(-R2 - 14, R2 + 14, bz0, bz1, hh);
  ctx.custom(R2 + cz + 2, (lx, lz) => {
    lz -= cz;
    if (lz > 0) return -Infinity;
    const r = Math.hypot(lx, lz);
    return r < R0 || r > R2 ? -Infinity : r <= R1 ? h : h + h3;
  });
}

// One of the two libraries beside Trajan's Column: a tall brick hall with a marble porch of four
// columns and bronze doors on the side that faces the column, pilasters and high windows all round.
function library(ctx, o) {
  const B = ctx.bufs, W = o.d, D = o.w, h = o.h, st = 0.9, colH = 9, eh = 1.3;
  ctx.push(0, 0, o.front > 0 ? Math.PI / 2 : -Math.PI / 2);
  box(B.brick, -W / 2, W / 2, 0, h, -D / 2, D / 2, { top: false }); skirt(B.stone, -W / 2, W / 2, -D / 2, D / 2);
  bayBox(ctx, -W / 2 - 0.3, W / 2 + 0.3, 0, h * 0.58, -D / 2 - 0.3, D / 2 + 0.3, 4.5, { mat: 'brick', kind: 'blank', pilW: 0.8 });
  bayBox(ctx, -W / 2 - 0.3, W / 2 + 0.3, h * 0.58, h, -D / 2 - 0.3, D / 2 + 0.3, 4.5, { mat: 'brick', kind: 'window', ww: 1.4, wh: h * 0.2, depth: 0.26, pilW: 0.8 });
  const rect = [[-W / 2 - 0.3, D / 2 + 0.3], [W / 2 + 0.3, D / 2 + 0.3], [W / 2 + 0.3, -D / 2 - 0.3], [-W / 2 - 0.3, -D / 2 - 0.3]];
  sweep(B.travertine, rect, [[0, h - 0.5], [0.25, h - 0.42], [0.5, h - 0.12], [0.55, h], [0, h]]);
  gable(B.roof, B.brick, -W / 2 - 0.3, W / 2 + 0.3, h, -D / 2 - 0.3, D / 2 + 0.3, { rise: D * 0.17, over: 0.9, alongX: true });
  ctx.solid(-W / 2, W / 2, -D / 2, D / 2, h);
  // the porch
  const zf = D / 2 + 0.3, zc = zf + 4.4, pw = 7.6;
  box(B.fine, -pw - 0.6, pw + 0.6, 0, st, zf, zc + 1.2);
  for (let i = 0; i < 3; i++) box(B.fine, -pw - 0.6, pw + 0.6, 0, (st * (3 - i)) / 4, zc + 1.2 + 0.4 * i, zc + 1.6 + 0.4 * i);
  ctx.solid(-pw - 0.6, pw + 0.6, zf, zc + 1.2, st); ctx.solid(-pw - 0.6, pw + 0.6, zc + 1.2, zc + 2.4, st, 0);
  for (const x of [-6.6, -2.2, 2.2, 6.6]) ctx.column(x, st, zc, colH, colH / 9.4, 0, true);
  const pr = [[-pw, zc + 0.55], [pw, zc + 0.55], [pw, zf], [-pw, zf]], ey = st + colH;
  sweep(B.fine, pr, [[-1, ey], [0, ey], ...ENTAB.map(([p, q2]) => [p * eh, ey + q2 * eh]), [0, ey + eh]]);
  B.coffer.quad([-pw + 1, ey + 0.4, zc - 0.4], [pw - 1, ey + 0.4, zc - 0.4], [pw - 1, ey + 0.4, zf], [-pw + 1, ey + 0.4, zf]);
  gable(B.roof, B.fine, -pw - 0.4, pw + 0.4, ey + eh, zf, zc + 0.95, { rise: 2.3, over: 0.3 });
  templeDoor(ctx, frame([-5, zf + 0.04], [5, zf + 0.04], st, [0, 0]), 5, colH);
  for (const sx of [-1, 1]) { box(B.fine, sx * 6.6 - 0.55, sx * 6.6 + 0.55, st, st + 1.3, zf + 0.5, zf + 1.6); statue(B, sx * 6.6, st + 1.3, zf + 1.05, 2.3, 0, sx > 0 ? 2 : 0); }
  ctx.pop();
}

// ---------- single monuments ----------

function column(ctx) {
  const B = ctx.bufs, M = ctx.M, ph = 5.3, sq = [[-2.75, 2.75], [2.75, 2.75], [2.75, -2.75], [-2.75, -2.75]];
  // pedestal: carved with heaped arms on every side, a door and an inscription on the front
  box(B.fine, -2.75, 2.75, 0, ph, -2.75, 2.75);
  sweep(B.fine, sq, [[0.3, 0], [0.3, 0.5], [0.16, 0.62], [0.12, 0.8], [0, 0.9]]);
  sweep(B.fine, sq, [[0, ph - 0.7], [0.08, ph - 0.62], [0.22, ph - 0.3], [0.3, ph - 0.26], [0.3, ph], [0, ph]]);
  for (let k = 0; k < 4; k++) {
    ctx.push(0, 0, (k * Math.PI) / 2);
    B.marble.quad([-2.3, 1.1, 2.76], [2.3, 1.1, 2.76], [2.3, k ? 4.4 : 3.2, 2.76], [-2.3, k ? 4.4 : 3.2, 2.76]);
    if (!k) {
      box(B.door, -0.5, 0.5, 0.9, 2.6, 2.74, 2.8);
      for (const [a, b, c, e] of [[-2.2, 2.2, 3.35, 3.47], [-2.2, 2.2, 4.3, 4.42], [-2.2, -2.08, 3.47, 4.3], [2.08, 2.2, 3.47, 4.3]]) box(B.fine, a, b, c, e, 2.74, 2.84);
      for (let l = 0; l < 4; l++) for (let u = -1.9; u < 1.75; u += 0.2) box(B.bronze, u, u + (((u * 9.7 + l * 3.3) % 1 + 1) % 1 > 0.3 ? 0.14 : 0.07), 4.1 - l * 0.19, 4.2 - l * 0.19, 2.75, 2.775);
    }
    ctx.pop();
  }
  // a laurel wreath for a base, the shaft with its spiral of carving, a Doric capital with a railed platform
  const tor = new THREE.TorusGeometry(1.95, 0.36, 10, 32); tor.rotateX(Math.PI / 2); ctx.extra(tor, M.marbleFlat, 0, ph + 0.36, 0);
  ctx.extra(new THREE.CylinderGeometry(1.62, 1.85, 26.9, 48, 1, true), M.spiral, 0, ph + 0.5 + 13.45, 0);
  const yc = ph + 0.5 + 26.9;
  ctx.extra(new THREE.CylinderGeometry(1.75, 1.62, 0.3, 40), M.marbleFlat, 0, yc + 0.15, 0);
  ctx.extra(new THREE.CylinderGeometry(2.45, 1.75, 0.8, 40), M.marbleFlat, 0, yc + 0.7, 0);
  box(B.fine, -2.55, 2.55, yc + 1.1, yc + 1.6, -2.55, 2.55, { bottom: true });
  for (const s of [-1, 1]) { box(B.bronze, -2.5, 2.5, yc + 2.5, yc + 2.58, s * 2.46 - 0.04, s * 2.46 + 0.04); box(B.bronze, s * 2.46 - 0.04, s * 2.46 + 0.04, yc + 2.5, yc + 2.58, -2.5, 2.5); }
  for (let i = 0; i <= 8; i++) for (const s of [-1, 1]) { const u = -2.46 + (4.92 * i) / 8; box(B.bronze, u - 0.025, u + 0.025, yc + 1.6, yc + 2.5, s * 2.46 - 0.025, s * 2.46 + 0.025, { top: false }); box(B.bronze, s * 2.46 - 0.025, s * 2.46 + 0.025, yc + 1.6, yc + 2.5, u - 0.025, u + 0.025, { top: false }); }
  ctx.extra(new THREE.CylinderGeometry(1.0, 1.2, 2.2, 24), M.marbleFlat, 0, yc + 2.7, 0);
  ctx.extra(new THREE.SphereGeometry(1.0, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.marbleFlat, 0, yc + 3.8, 0);
  statue({ fine: B.gold, bronze: B.gold, gold: B.gold }, 0, yc + 4.75, 0, 4.6, 0, 'general'); // Trajan in gilded bronze
  ctx.solid(-2.75, 2.75, -2.75, 2.75, 40);
}

// A horse built from bars and a block, k times life size: enough for a gilded statue seen from below.
export function horse(G, x, y, z, k, lift) {
  const P = (a, b, c) => [x + a * k, y + b * k, z + c * k];
  box(G, x - 0.3 * k, x + 0.3 * k, y + 1.2 * k, y + 1.85 * k, z - 0.75 * k, z + 1.0 * k, { bottom: true });
  limb(G, P(0, 1.7, 0.85), P(0, 2.55, 1.45), 0.2 * k); limb(G, P(0, 2.6, 1.38), P(0, 2.2, 1.95), 0.13 * k); limb(G, P(0, 2.55, 1.3), P(0, 1.8, 0.7), 0.07 * k);
  for (const sx of [-0.2, 0.2]) {
    if (lift && sx > 0) { limb(G, P(sx, 1.3, 0.85), P(sx, 0.95, 1.35), 0.085 * k); limb(G, P(sx, 0.95, 1.35), P(sx, 0.5, 1.2), 0.07 * k); }
    else limb(G, P(sx, 1.3, 0.85), P(sx, 0, 0.95), 0.08 * k);
    limb(G, P(sx, 1.3, -0.6), P(sx, 0.65, -0.85), 0.09 * k); limb(G, P(sx, 0.65, -0.85), P(sx, 0, -0.7), 0.07 * k);
  }
  limb(G, P(0, 1.75, -0.75), P(0, 0.9, -1.1), 0.06 * k);
}

// Trajan's Forum: a vast paved square entered through a triumphal gateway. Down each side runs a
// raised portico of marble columns; above its cornice an attic carries statues of Dacian
// prisoners with gilded shields between them. In the middle, the emperor on horseback.
function forumTrajan(ctx, o) {
  const { w, d, wallH = 15, colH = 10, pd = 12 } = o, B = ctx.bufs, t = 1.6, x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, st = 0.6, gw = 24;
  for (const [a, b, c, e] of [[x0, x0 + t, z0, z1], [x1 - t, x1, z0, z1], [x0, -gw / 2, z1 - t, z1], [gw / 2, x1, z1 - t, z1]]) { box(B.stone, a, b, 0, wallH, c, e); skirt(B.stone, a, b, c, e); ctx.solid(a, b, c, e, wallH); }
  const wopt = { mat: 'ashlar', kind: 'blank', pilW: 0.9 }, xi = w / 2 - t - 0.06;
  for (const s of [-1, 1]) {
    bayRun(ctx, [s * xi, z0 + t], [s * xi, z1 - t], 0, wallH, [s * w, 0], 8.4, wopt);
    const a = s < 0 ? x0 + t : gw / 2, b = s < 0 ? -gw / 2 : x1 - t;
    bayRun(ctx, [a, z1 - t - 0.06], [b, z1 - t - 0.06], 0, wallH, [0, d], 6, wopt);
    bayRun(ctx, [a, z1 + 0.06], [b, z1 + 0.06], 0, wallH, [0, 0], 6, wopt);
  }
  ctx.push(0, z1 - 1.2); arch(ctx, { w: gw, d: 7, h: 20.5 }); ctx.pop();

  const dia = colH / 9.4, sp = 4.2, eh = 1.5, ey = st + colH, at = ey + eh, ah = 3.3;
  for (const s of [-1, 1]) {
    const xc = s * (w / 2 - pd), xw = s * (w / 2 - t), za = z0 + 2.5, zb = z1 - t - 1.5, n = Math.max(1, Math.round((zb - za) / sp));
    const lo = Math.min(xc - s * 1.2, xw), hi = Math.max(xc - s * 1.2, xw), lo2 = Math.min(xc - s * 1.7, xw), hi2 = Math.max(xc - s * 1.7, xw);
    box(B.fine, lo2, hi2, 0, st / 2, za - 1.7, zb + 1.2); box(B.fine, lo, hi, 0, st, za - 1.2, zb + 1.2, { top: false });
    B.floor.quad([lo, st, zb + 1.2], [hi, st, zb + 1.2], [hi, st, za - 1.2], [lo, st, za - 1.2]);
    ctx.solid(lo2, hi2, za - 1.7, zb + 1.2, st / 2); ctx.solid(lo, hi, za - 1.2, zb + 1.2, st);
    for (let i = 0; i <= n; i++) {
      const z = za + ((zb - za) * i) / n;
      ctx.column(xc, st, z, colH, dia, 0, true);
      statue(B, xc - s * 0.85, at + 0.02, z, 2.7, (-s * Math.PI) / 2, 'dacian'); // a Dacian prisoner over every column
      if (i < n) { // and a gilded shield between each pair
        const zm = z + (zb - za) / n / 2, yx = xc - s * 0.5, cy = at + ah * 0.52;
        for (let k = 0; k < 12; k++) { const a0 = (k / 12) * 6.2832, a1 = ((k + 1) / 12) * 6.2832; B.gold.tri([yx, cy, zm], [yx, cy + Math.sin(a0) * 0.95, zm + Math.cos(a0) * 0.95], [yx, cy + Math.sin(a1) * 0.95, zm + Math.cos(a1) * 0.95]); }
        box(B.gold, yx - 0.12, yx + 0.12, cy - 0.3, cy + 0.3, zm - 0.3, zm + 0.3);
      }
    }
    const rect = [[Math.min(xc - s * 0.55, xw), zb + 0.55], [Math.max(xc - s * 0.55, xw), zb + 0.55], [Math.max(xc - s * 0.55, xw), za - 0.55], [Math.min(xc - s * 0.55, xw), za - 0.55]];
    sweep(B.fine, rect, [[-1.1, ey], [0, ey], ...ENTAB.map(([p, q2]) => [p * eh, ey + q2 * eh]), [0, at]]);
    B.coffer.quad([lo + 1.6, ey + 0.5, zb], [hi - 0.2, ey + 0.5, zb], [hi - 0.2, ey + 0.5, za], [lo + 1.6, ey + 0.5, za]);
    const a0 = Math.min(xc - s * 0.42, xc + s * 0.8), a1 = Math.max(xc - s * 0.42, xc + s * 0.8);
    box(B.fine, a0, a1, at, at + ah, za - 0.5, zb + 0.5);
    box(B.fine, a0 - 0.22, a1 + 0.22, at + ah, at + ah + 0.3, za - 0.72, zb + 0.72, { bottom: true });
    B.roof.quad([xc + s * 0.8, at + ah - 0.4, za - 0.5], [xc + s * 0.8, at + ah - 0.4, zb + 0.5], [xw, wallH - 0.2, zb + 0.5], [xw, wallH - 0.2, za - 0.5]);
  }
  // the emperor on horseback, in gilded bronze on a high base
  const base = [[-1.6, 3.4], [1.6, 3.4], [1.6, -3.4], [-1.6, -3.4]], bh = 4.6, gb = { fine: B.gold, bronze: B.gold, gold: B.gold };
  box(B.fine, -1.6, 1.6, 0, bh, -3.4, 3.4);
  sweep(B.fine, base, [[0.35, 0], [0.35, 0.5], [0.2, 0.62], [0.14, 0.85], [0, 0.95]]);
  sweep(B.fine, base, [[0, bh - 0.6], [0.08, bh - 0.52], [0.24, bh - 0.26], [0.32, bh - 0.22], [0.32, bh], [0, bh]]);
  for (const s of [-1, 1]) box(B.bronze, s * 1.6 - 0.02, s * 1.6 + 0.02, 1.6, 3.4, -2.4, 2.4);
  horse(B.gold, 0, bh, 0, 2.3, true);
  statue(gb, 0, bh + 1.25 * 2.3, 0.1 * 2.3, 1.75 * 2.3, 0, 'rider');
  ctx.solid(-1.95, 1.95, -3.75, 3.75, bh);
}

function colossus(ctx) {
  const B = ctx.bufs, g = ctx.M.gold, b = 8;
  box(B.marble, -8, 8, 0, b, -7, 7);
  ctx.solid(-8, 8, -7, 7, b + 30);
  for (const s of [-1, 1]) ctx.extra(new THREE.CylinderGeometry(1.5, 1.9, 13, 14), g, s * 2.1, b + 6.5, 0);
  ctx.extra(new THREE.CylinderGeometry(3.4, 2.9, 10, 18), g, 0, b + 18, 0);
  ctx.extra(new THREE.SphereGeometry(2.3, 18, 14), g, 0, b + 25.6, 0);
  ctx.extra(new THREE.CylinderGeometry(0.95, 1.1, 10, 12), g, -4.3, b + 18.2, 0, 0, -0.16);
  ctx.extra(new THREE.CylinderGeometry(0.95, 1.1, 10, 12), g, 4.9, b + 22.5, 1.2, 0.5, 0.75);
  for (let i = 0; i < 7; i++) {
    const a = ((i - 3) / 3) * 1.25;
    ctx.extra(new THREE.ConeGeometry(0.28, 3.2, 8), g, Math.sin(a) * 3.4, b + 25.6 + Math.cos(a) * 3.4, 0, 0, -a);
  }
}

function meta(ctx) {
  const M = ctx.M;
  ctx.extra(new THREE.CylinderGeometry(8, 8, 1.2, 36), M.marbleFlat, 0, 0.6, 0);
  ctx.extra(new THREE.CylinderGeometry(0.7, 3.5, 17, 24), M.brickFlat, 0, 8.5, 0);
  ctx.solid(-7, 7, -7, 7, 1.2);
  ctx.solid(-3, 3, -3, 3, 17);
}

export const BUILDERS = {
  plaza: () => {}, temple, tholos, venusroma: venusRoma, hall, basilica, tabularium, arch, rostra, court, block, baths,
  amphitheatre, theatre, circus, markets, column, colossus, meta, trajanforum: forumTrajan, palace, library,
  augustus: forumAugustus, caesar: forumCaesar, nerva: forumNerva, peace: templePeace,
};

// A fully modelled Corinthian column, one diameter wide and 9.5 tall before it is squashed to
// unit height: plinth and Attic base, a shaft with 24 real flutes and a slight swelling, a ring
// under the capital, then the capital itself: a bell wrapped in two rows of curling acanthus
// leaves, scrolls under the four corners, and a concave-sided abacus on top.
function fineColumn() {
  const parts = [], V2 = (a, b) => new THREE.Vector2(a, b), only = (g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('normal'); n.deleteAttribute('uv'); return n; };
  const tris = [], T = (a, b, c) => tris.push(...a, ...b, ...c), Q = (a, b, c, d) => { T(a, b, c); T(a, c, d); };
  const arc = (cr, cy, rr, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; return V2(cr + rr * Math.cos(a), cy + rr * Math.sin(a)); });
  // base
  const plinth = new THREE.BoxGeometry(1.36, 0.14, 1.36); plinth.translate(0, 0.07, 0); parts.push(only(plinth));
  parts.push(only(new THREE.LatheGeometry([V2(0.6, 0.14), ...arc(0.6, 0.215, 0.075, -90, 90, 5), V2(0.585, 0.3), V2(0.548, 0.325), V2(0.536, 0.355), V2(0.55, 0.385),
    V2(0.567, 0.395), ...arc(0.555, 0.445, 0.05, -90, 90, 5), V2(0.54, 0.5), V2(0.512, 0.525), V2(0.5, 0.56)], 24)));
  // shaft
  const NF = 24, rings = [[0.56, 0.5, 0], [0.76, 0.5, 1], [3.2, 0.497, 1], [5.8, 0.47, 1], [7.96, 0.436, 1], [8.12, 0.433, 0]];
  const prof = [[0, 0], [0.2, 0], [0.42, 0.9], [0.78, 0.9]];
  const sp = (ri, c) => { const [y, r, dp] = rings[ri], f = Math.floor(c / 4) % NF, [t, k] = prof[c % 4], a = ((f + t) / NF) * Math.PI * 2, rr = r - dp * k * 0.045; return [Math.cos(a) * rr, y, Math.sin(a) * rr]; };
  for (let ri = 0; ri < rings.length - 1; ri++) for (let c = 0; c < NF * 4; c++) Q(sp(ri, c), sp(ri, c + 1), sp(ri + 1, c + 1), sp(ri + 1, c));
  parts.push(only(new THREE.LatheGeometry([V2(0.433, 8.12), V2(0.455, 8.14), ...arc(0.455, 8.19, 0.035, -90, 90, 4), V2(0.455, 8.24), V2(0.43, 8.26)], 24)));
  // capital
  const y0 = 8.26;
  parts.push(only(new THREE.LatheGeometry([V2(0.43, y0), V2(0.432, y0 + 0.55), V2(0.46, y0 + 0.85), V2(0.54, y0 + 1.02), V2(0.6, y0 + 1.08)], 16)));
  const leaf = (ang, h, hw, lift) => {
    const line = [[0.01, 0], [0.035, 0.35], [0.07, 0.7], [0.14, 0.93], [0.23, 0.99], [0.27, 0.86]], wid = [0.9, 1, 0.95, 0.8, 0.55, 0.2];
    const c = Math.cos(ang), s = Math.sin(ang), pt = (k, side) => {
      const r = 0.44 + line[k][0] * (h / 0.5) * 0.8 + (side === 0 ? 0.035 : 0) + lift, t = side * hw * wid[k];
      return [r * c - t * s, y0 + 0.02 + line[k][1] * h, r * s + t * c];
    };
    for (let k = 0; k < line.length - 1; k++) { Q(pt(k, -1), pt(k, 0), pt(k + 1, 0), pt(k + 1, -1)); Q(pt(k, 0), pt(k, 1), pt(k + 1, 1), pt(k + 1, 0)); }
  };
  for (let i = 0; i < 8; i++) { leaf((i / 8) * Math.PI * 2, 0.4, 0.16, 0.03); leaf(((i + 0.5) / 8) * Math.PI * 2, 0.72, 0.15, 0); }
  for (let i = 0; i < 4; i++) {
    const a = ((i + 0.5) / 4) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    // corner scroll on a stalk
    const vol = new THREE.CylinderGeometry(0.13, 0.13, 0.1, 10); vol.rotateX(Math.PI / 2); vol.rotateY(-a); vol.translate(c * 0.8, y0 + 0.93, s * 0.8); parts.push(only(vol));
    const P = (r, y, t) => [r * c - t * s, y, r * s + t * c];
    Q(P(0.47, y0 + 0.62, -0.05), P(0.47, y0 + 0.62, 0.05), P(0.72, y0 + 1.04, 0.05), P(0.72, y0 + 1.04, -0.05));
    // pair of small scrolls and a flower at the middle of each face
    const b = (i / 4) * Math.PI * 2, cb = Math.cos(b), sb = Math.sin(b);
    for (const t of [-0.11, 0.11]) { const h = new THREE.CylinderGeometry(0.075, 0.075, 0.06, 8); h.rotateZ(Math.PI / 2); h.rotateY(-b); h.translate(cb * 0.56 - t * sb, y0 + 0.98, sb * 0.56 + t * cb); parts.push(only(h)); }
    const fl = new THREE.BoxGeometry(0.1, 0.15, 0.14); fl.rotateY(-b); fl.translate(cb * 0.62, y0 + 1.16, sb * 0.62); parts.push(only(fl));
  }
  // abacus: a square with hollowed sides and clipped corners, in two steps
  const out = [];
  for (let i = 0; i < 4; i++) {
    const a = ((i + 0.5) / 4) * Math.PI * 2, n = ((i + 1.5) / 4) * Math.PI * 2, R = 0.98, cw = 0.07;
    const A = [Math.cos(a) * R - Math.sin(a) * -cw, Math.sin(a) * R + Math.cos(a) * -cw], A2 = [Math.cos(a) * R - Math.sin(a) * cw, Math.sin(a) * R + Math.cos(a) * cw];
    const Bn = [Math.cos(n) * R - Math.sin(n) * -cw, Math.sin(n) * R + Math.cos(n) * -cw], m = (i + 1) / 4 * Math.PI * 2;
    out.push(A, A2);
    for (let k = 1; k < 6; k++) { const t = k / 6, dip = Math.sin(Math.PI * t) * 0.1; out.push([A2[0] + (Bn[0] - A2[0]) * t - Math.cos(m) * dip, A2[1] + (Bn[1] - A2[1]) * t - Math.sin(m) * dip]); }
  }
  for (const [k, ya, yb] of [[0.94, y0 + 1.08, y0 + 1.17], [1, y0 + 1.17, 9.5]]) {
    for (let i = 0; i < out.length; i++) {
      const p = out[i], n = out[(i + 1) % out.length];
      Q([p[0] * k, ya, p[1] * k], [n[0] * k, ya, n[1] * k], [n[0] * k, yb, n[1] * k], [p[0] * k, yb, p[1] * k]);
      T([0, yb, 0], [p[0] * k, yb, p[1] * k], [n[0] * k, yb, n[1] * k]); T([0, ya, 0], [n[0] * k, ya, n[1] * k], [p[0] * k, ya, p[1] * k]);
    }
  }
  const own = new THREE.BufferGeometry(); own.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3)); parts.push(own);
  // normals are worked out at true proportions, so creases fall where they would on the real thing
  const cr = toCreasedNormals(mergeGeometries(parts), 0.7); cr.scale(1, 1 / 9.5, 1);
  return cr;
}

// One merged instanced mesh for every column in the city.
export function buildColumns(ctx) {
  // shaft with a slight taper, a two-step moulded base on a plinth, and a flaring capital under an abacus
  const shaft = new THREE.CylinderGeometry(0.43, 0.5, 0.81, 14, 1, true); shaft.translate(0, 0.465, 0);
  const plinth = new THREE.BoxGeometry(1.36, 0.022, 1.36); plinth.translate(0, 0.011, 0);
  const torus1 = new THREE.CylinderGeometry(0.56, 0.66, 0.038, 12, 1, true); torus1.translate(0, 0.041, 0);
  const leaves = new THREE.CylinderGeometry(0.56, 0.45, 0.05, 12, 1, true); leaves.translate(0, 0.895, 0);
  const bell = new THREE.CylinderGeometry(0.68, 0.5, 0.055, 12, 1, true); bell.translate(0, 0.9475, 0);
  const abacus = new THREE.BoxGeometry(1.42, 0.022, 1.42); abacus.translate(0, 0.986, 0);
  const volutes = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([vx, vz]) => { const g = new THREE.BoxGeometry(0.2, 0.04, 0.2); g.translate(vx * 0.62, 0.955, vz * 0.62); return g; });
  const parts = [shaft, plinth, torus1, leaves, bell, abacus, ...volutes].map((g) => g.toNonIndexed());
  for (const pgeo of parts.slice(1)) pgeo.getAttribute('uv').array.fill(0); // u = 0 is a flat part of the flute pattern
  const geom = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const arrs = parts.map((p) => p.getAttribute(name).array), size = name === 'uv' ? 2 : 3;
    const out = new Float32Array(arrs.reduce((s, a) => s + a.length, 0));
    let off = 0; for (const a of arrs) { out.set(a, off); off += a.length; }
    geom.setAttribute(name, new THREE.BufferAttribute(out, size));
  }
  // tints: 0 white marble, 1 grey granite, 2 red Aswan granite, 3 yellow Numidian marble (giallo antico), 4 cipollino
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const TINT = ['#ffffff', '#9d9a94', '#b98a7c', '#ddcba2', '#b4bfae'].map((c) => new THREE.Color(c)); // ... 4 green-veined cipollino
  const make = (g, mat, list, name) => {
    const mesh = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach(([x, y, z, h, dia, rot, tint], i) => {
      q.setFromAxisAngle(up, rot);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(dia, h, dia));
      mesh.setMatrixAt(i, m); mesh.setColorAt(i, TINT[tint] ?? TINT[1]);
    });
    mesh.castShadow = mesh.receiveShadow = true; mesh.name = name; mesh.computeBoundingSphere();
    return mesh;
  };
  // Columns are filed by 200 m square, so the renderer can skip the squares out of view (and out
  // of each shadow map). The detailed columns are a third of all the triangles in the city, and
  // shadow maps would draw them four more times each frame, so they cast no shadow themselves: an
  // invisible copy of the simple column stands in each one's place and casts it for them. Beyond
  // 160 m a detailed column is too small on screen to show its flutes, and the simple column,
  // tinted to match, is drawn instead.
  const group = new THREE.Group(), CH = 200, chunks = new Map(), lods = [], hide = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const farTint = new THREE.Color(0.94, 0.92, 0.89);
  for (const c of ctx.columns) {
    const key = Math.floor(c[0] / CH) * 4096 + Math.floor(c[2] / CH);
    let l = chunks.get(key); if (!l) chunks.set(key, (l = { simple: [], fine: [] }));
    (c[7] ? l.fine : l.simple).push(c);
  }
  const fineGeom = fineColumn();
  for (const l of chunks.values()) {
    if (l.simple.length) group.add(make(geom, ctx.M.column, l.simple, 'columns'));
    if (!l.fine.length) continue;
    const fine = make(fineGeom, ctx.M.columnFine, l.fine, 'fine columns'); fine.castShadow = false;
    const caster = make(geom, hide, l.fine, 'fine column shadows'); caster.receiveShadow = false;
    const far = make(geom, ctx.M.column, l.fine, 'fine columns far');
    for (let i = 0; i < l.fine.length; i++) far.setColorAt(i, l.fine[i][6] ? TINT[l.fine[i][6]] : farTint);
    far.visible = false;
    group.add(fine, caster, far);
    lods.push({ c: fine.boundingSphere.center.clone(), r: fine.boundingSphere.radius, fine, caster, far });
  }
  group.userData.lod = (p) => {
    for (const L of lods) { const near = L.c.distanceTo(p) - L.r < 160; L.fine.visible = L.caster.visible = near; L.far.visible = !near; }
  };
  return group;
}
