import { box, skirt, sweep, statue, limb } from './geobuf.js';
import { bay, bayRun, frame, fbox, q } from './facade.js';
import { ENTAB, temple, templeDoor, horse, arch } from './builders.js';

// The imperial fora between the Forum Romanum and Trajan's Forum: Caesar's, Augustus's, Nerva's,
// and Vespasian's Temple of Peace. Each is a walled square with a temple at the far end, but
// each was built differently, and those differences are what this file models.

const lo = Math.min, hi = Math.max;

// A wall standing on the ground between two x and two z values, given in any order.
function wall(ctx, buf, xa, xb, za, zb, h) {
  const a = lo(xa, xb), b = hi(xa, xb), c = lo(za, zb), e = hi(za, zb);
  box(buf, a, b, 0, h, c, e); skirt(buf, a, b, c, e); ctx.solid(a, b, c, e, h);
}

// Travertine string courses and a coping along the outer face of a wall from A to B (ref inside):
// one every 6.4 m, or n courses dividing the wall into equal sections.
function bands(ctx, A, B, ref, h, n) {
  const F = frame(A, B, 0, ref), T = ctx.bufs.travertine;
  const ys = n ? Array.from({ length: n }, (_, k) => (h * (k + 1)) / (n + 1)) : Array.from({ length: Math.max(0, Math.ceil((h - 2.5) / 6.4) - 1) }, (_, k) => 6.4 * (k + 1));
  for (const y of ys) fbox(T, F, 0, F.L, y, y + 0.45, 0, 0.12);
  fbox(T, F, 0, F.L, h - 0.55, h, 0, 0.3);
}

// A flat disc in the plane x = const, facing along x: a shield on an attic, a chariot wheel.
function disc(buf, x, y, z, r, n = 16) {
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    buf.tri([x, y, z], [x, y + Math.sin(a0) * r, z + Math.cos(a0) * r], [x, y + Math.sin(a1) * r, z + Math.cos(a1) * r]);
  }
}

// A run of statue niches along a wall from A to B, the statues varied as they go.
function niches(ctx, A, B, y0, y1, ref, len, o = {}) {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.round(L / len));
  for (let i = 0; i < n; i++) {
    const a = [A[0] + ((B[0] - A[0]) * i) / n, A[1] + ((B[1] - A[1]) * i) / n], b = [A[0] + ((B[0] - A[0]) * (i + 1)) / n, A[1] + ((B[1] - A[1]) * (i + 1)) / n];
    bay(ctx, a, b, y0, y1, ref, { mat: 'marble', back: 'marble', kind: 'arch', depth: 0.8, cornice: false, pilW: 0.55, uo: (L * i) / n, statue: 1 + ((i + (o.k ?? 0)) % 4), ...o });
  }
}

// A portico running along local z: the colonnade at x = xc facing the open square, its back
// wall at x = xw. A raised floor with a step, marble columns, the entablature, a coffered
// ceiling and a lean-to roof; optionally a second row of columns, and an attic over the front.
function portico(ctx, xc, xw, za, zb, o = {}) {
  const { colH = 10, st = 0.6, sp = 4.4, tint = 0, inner = false, attic = 0 } = o;
  const B = ctx.bufs, s = Math.sign(xw - xc), dia = colH / 9.4, eh = colH * 0.15, ey = st + colH, at = ey + eh;
  const X = (a, b) => [lo(a, b), hi(a, b)];
  const [p0, p1] = X(xc - s * 1.3, xw), [s0, s1] = X(xc - s * 2, xw);
  box(B.fine, s0, s1, 0, st / 2, za - 0.7, zb + 0.7);
  box(B.fine, p0, p1, 0, st, za, zb, { top: false });
  B.floor.quad([p0, st, zb], [p1, st, zb], [p1, st, za], [p0, st, za]);
  ctx.solid(s0, s1, za - 0.7, zb + 0.7, st / 2); ctx.solid(p0, p1, za, zb, st);
  const n = Math.max(1, Math.round((zb - za - 2) / sp)), Z = (i) => za + 1 + ((zb - za - 2) * i) / n;
  for (let i = 0; i <= n; i++) {
    ctx.column(xc, st, Z(i), colH, dia, tint, true);
    if (inner) ctx.column((xc + xw) / 2, st, Z(i), colH, dia, tint, true);
  }
  const [e0, e1] = X(xc - s * 0.55, xw);
  sweep(B.fine, [[e0, zb + 0.55], [e1, zb + 0.55], [e1, za - 0.55], [e0, za - 0.55]], [[-1.1, ey], [0, ey], ...ENTAB.map(([p, q2]) => [p * eh, ey + q2 * eh]), [0, at]]);
  const [c0, c1] = X(xc - s * 0.6, xw);
  B.coffer.quad([c0, ey + 0.5, zb], [c1, ey + 0.5, zb], [c1, ey + 0.5, za], [c0, ey + 0.5, za]);
  let top = at, rx = xc - s * 0.55;
  if (attic) {
    const [a0, a1] = X(xc - s * 0.42, xc + s * 0.9), [k0, k1] = X(xc - s * 1.2, xc + s * 1.1);
    box(B.fine, a0, a1, at, at + attic, za - 0.5, zb + 0.5);
    box(B.fine, k0, k1, at + attic, at + attic + 0.4, za - 0.8, zb + 0.8, { bottom: true });
    top = at + attic + 0.4; rx = xc + s * 1.1;
    if (o.caryatids) for (let i = 0; i <= n; i++) {
      // a maiden carrying the cornice over every column, copied from the Erechtheion in Athens,
      // and between each pair a shield carved with the head of Jupiter Ammon
      statue(B, xc - s * 0.8, at + 0.02, Z(i), attic * 0.93, (-s * Math.PI) / 2, 'caryatid');
      if (i === n) continue;
      const zm = (Z(i) + Z(i + 1)) / 2, px = xc - s * 0.44, cy = at + attic * 0.5, r = Math.min(1.15, attic * 0.3);
      disc(B.marble, px, cy, zm, r + 0.16); disc(B.fine, px - s * 0.08, cy, zm, r);
      box(B.fine, lo(px, px - s * 0.4), hi(px, px - s * 0.4), cy - 0.45, cy + 0.4, zm - 0.3, zm + 0.3);
    }
  }
  const ry = o.roofY ?? top + Math.abs(xw - xc) * 0.22;
  B.roof.quad([rx, top - 0.3, za - 0.55], [rx, top - 0.3, zb + 0.55], [xw, ry, zb + 0.55], [xw, ry, za - 0.55]);
  return { ey, at, top, ry };
}

// A fountain basin with a nymph on a pedestal in the middle.
function fountain(ctx, x, z, a = 2.6, b = 1.8) {
  const B = ctx.bufs;
  ctx.push(x, z);
  for (const sx of [-1, 1]) { box(B.fine, sx * a - 0.25, sx * a + 0.25, 0, 0.75, -b - 0.25, b + 0.25); box(B.fine, -a, a, 0, 0.75, sx * b - 0.25, sx * b + 0.25); }
  B.pool.quad([-a, 0.55, b], [a, 0.55, b], [a, 0.55, -b], [-a, 0.55, -b]);
  box(B.fine, -0.6, 0.6, 0, 1.5, -0.6, 0.6); statue(B, 0, 1.5, 0, 2.1, 0, 'woman');
  ctx.solid(-a - 0.25, a + 0.25, -b - 0.25, b + 0.25, 0.75);
  ctx.pop();
}

// A moulded statue base, w by d and h high.
function base(ctx, w, d, h) {
  const B = ctx.bufs, r = [[-w, d], [w, d], [w, -d], [-w, -d]];
  box(B.fine, -w, w, 0, h, -d, d);
  sweep(B.fine, r, [[0.35, 0], [0.35, 0.5], [0.2, 0.62], [0.14, 0.85], [0, 0.95]]);
  sweep(B.fine, r, [[0, h - 0.6], [0.08, h - 0.52], [0.24, h - 0.26], [0.32, h - 0.22], [0.32, h], [0, h]]);
  ctx.solid(-w - 0.35, w + 0.35, -d - 0.35, d + 0.35, h);
}

// A war trophy: captured arms hung on a stake (armour, helmet, two shields, crossed spears),
// h tall, facing `face` (0 = local +z). Used in the upper niches of the Forum of Augustus.
function trophy(B, x, y, z, h, face) {
  const c = Math.cos(face), s = Math.sin(face), G = B.bronze;
  const W = (lx, ly, lz) => [x + (lx * c + lz * s) * h, y + ly * h, z + (-lx * s + lz * c) * h];
  limb(G, W(0, 0, 0), W(0, 0.95, 0), 0.022 * h);
  limb(G, W(-0.34, 0.74, 0), W(0.34, 0.74, 0), 0.02 * h);
  limb(G, W(0, 0.42, 0.02), W(0, 0.76, 0.02), 0.13 * h);            // cuirass
  limb(G, W(0, 0.42, 0.02), W(0, 0.36, 0.06), 0.15 * h);            // its skirt of straps
  limb(G, W(0, 0.8, 0.02), W(0, 0.95, 0.02), 0.075 * h);            // helmet
  limb(G, W(0, 0.95, -0.04), W(0, 1.02, 0.05), 0.025 * h);          // crest
  for (const sx of [-1, 1]) {
    limb(G, W(sx * 0.4, 0.05, -0.04), W(-sx * 0.25, 1.05, -0.04), 0.01 * h); // spear
    const cx = sx * 0.3, cy = 0.5, r = 0.17, n = 12;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * 6.2832, a1 = ((k + 1) / n) * 6.2832;
      G.tri(W(cx, cy, 0.12), W(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r * 1.3, 0.1), W(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r * 1.3, 0.1));
    }
  }
}

// A wall from A to B, y0 to y1, divided into n bays, each with a rectangular niche (sill and height
// measured from y0) holding a statue, a trophy, or nothing. Half-columns can stand between the bays.
function rectNiches(ctx, A, Bp, y0, y1, ref, n, o = {}) {
  const B = ctx.bufs, buf = B[o.mat ?? 'fine'], back = B[o.back ?? o.mat ?? 'fine'], dp = o.depth ?? 0.7, H = y1 - y0;
  const len = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
  for (let i = 0; i < n; i++) {
    const a = [A[0] + ((Bp[0] - A[0]) * i) / n, A[1] + ((Bp[1] - A[1]) * i) / n], b = [A[0] + ((Bp[0] - A[0]) * (i + 1)) / n, A[1] + ((Bp[1] - A[1]) * (i + 1)) / n];
    const F = frame(a, b, y0, ref, o.inward, (len * i) / n + (o.uo ?? 0)), L = F.L, m = L / 2;
    const big = o.big === i, nw = Math.min(L - 0.5, big ? (o.bigW ?? 2.6) : (o.nw ?? 1.5)), v0 = o.sill, v1 = v0 + (big ? (o.bigH ?? o.nh * 1.8) : o.nh);
    const u0 = m - nw / 2, u1 = m + nw / 2;
    q(buf, F, [0, 0, 0], [u0, 0, 0], [u0, H, 0], [0, H, 0]); q(buf, F, [u1, 0, 0], [L, 0, 0], [L, H, 0], [u1, H, 0]);
    q(buf, F, [u0, 0, 0], [u1, 0, 0], [u1, v0, 0], [u0, v0, 0]); q(buf, F, [u0, v1, 0], [u1, v1, 0], [u1, H, 0], [u0, H, 0]);
    q(buf, F, [u0, v0, 0], [u0, v1, 0], [u0, v1, -dp], [u0, v0, -dp], 's'); q(buf, F, [u1, v0, 0], [u1, v1, 0], [u1, v1, -dp], [u1, v0, -dp], 's');
    q(buf, F, [u0, v0, 0], [u1, v0, 0], [u1, v0, -dp], [u0, v0, -dp], 't'); q(buf, F, [u0, v1, 0], [u1, v1, 0], [u1, v1, -dp], [u0, v1, -dp], 't');
    back.quad(F.P(u0, v0, -dp), F.P(u1, v0, -dp), F.P(u1, v1, -dp), F.P(u0, v1, -dp));
    fbox(B.fine, F, u0 - 0.18, u1 + 0.18, v0 - 0.16, v0, 0, 0.14);          // sill
    fbox(B.fine, F, u0 - 0.12, u1 + 0.12, v1, v1 + 0.14, 0, 0.1);           // lintel moulding
    const n0 = F.P(0, 0, 0), n1 = F.P(0, 0, 1), face = Math.atan2(n1[0] - n0[0], n1[2] - n0[2]), c = F.P(m, v0, -dp * 0.5);
    if (o.content === 'statue') {
      const sh = (v1 - v0) * 0.88;
      statue(B, c[0], c[1], c[2], sh, face, big ? 'general' : (i + (o.k ?? 0)) % 2 ? 'magistrate' : 'general'); // Rome's triumphant generals, in armour or in the toga
      if (big) { const d2 = F.P(m + nw * 0.28, v0, -dp * 0.45); statue(B, d2[0], d2[1], d2[2], sh * 0.55, face, 'figure'); } // stand-in for the Aeneas and Romulus groups
    } else if (o.content === 'trophy') trophy(B, c[0], c[1], c[2], (v1 - v0) * 0.85, face);
    if (o.halfCol && i > 0) { const p = F.P(0, 0, o.halfCol.out ?? 0.3); ctx.column(p[0], y0, p[2], o.halfCol.h ?? H, o.halfCol.dia ?? 0.9, o.halfCol.tint ?? 0, true); }
  }
}

// An arched opening through a wall running along x, from xa to xb, between z0 and z1 (its two
// faces), crown at height ha, with the wall above up to h. The piers either side are separate walls.
function archway(ctx, buf, xa, xb, z0, z1, ha, h) {
  const r = (xb - xa) / 2, xm = (xa + xb) / 2, hs = ha - r, n = 14;
  box(buf, xa, xb, ha, h, z0, z1, { bottom: true });
  for (let k = 0; k < n; k++) {
    const a0 = Math.PI - (k * Math.PI) / n, a1 = Math.PI - ((k + 1) * Math.PI) / n;
    const p0 = [xm + r * Math.cos(a0), hs + r * Math.sin(a0)], p1 = [xm + r * Math.cos(a1), hs + r * Math.sin(a1)];
    for (const z of [z0, z1]) buf.quad([p0[0], p0[1], z], [p1[0], p1[1], z], [p1[0], ha, z], [p0[0], ha, z]);
    buf.quad([p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1]);
  }
}

// ---------- Forum of Augustus ----------

// Augustus's forum, finished in 2 BC. Sources for what follows: Platner & Ashby, A Topographical
// Dictionary of Ancient Rome (1929), "Forum Augustum"; Lanciani; Middleton; Suetonius, Augustus 29
// and 31; and the Italian Wikipedia article for the later excavations (temple size, steps, porticoes).
// - The Temple of Mars the Avenger: Luna marble, columns 15.30 m high and 1.76 m across, peripteral
//   except at the back, which abuts the enclosure wall; 17 steps with an altar set in the flight.
// - The enclosure: a firewall of peperino blocks (36 m by Platner, 33 m by others) faced inside with
//   marble and stucco, divided outside by two travertine courses; the Arco dei Pantani is one of its
//   original arched gateways, beside the temple.
// - Down each side a portico of giallo antico columns raised on steps, its attic carried by
//   caryatids with shields between them, and niches between half-columns on its back wall.
// - Behind each portico a half-round hall, screened by four pilasters and six fluted cipollino
//   columns 9.5 m high under a white marble entablature; round its wall two rows of rectangular
//   niches, the lower about 2.5 m and the upper about 15 m above the pavement: fourteen in the lower
//   row plus a large one in the middle, with four more between each hall and the temple. Statues of
//   Rome's triumphant generals stood in the lower niches, trophies probably in the upper.
// - The two arches Tiberius set up beside the temple in AD 19 for Drusus and Germanicus.
// - In the middle of the square, by most reconstructions, Augustus in a four-horse chariot.
// Not settled by the sources and chosen here: wall heights towards the entrance, the entrance, the
// portico's depth and spacing, the exedra radius, the rooms behind the porticoes.
export function forumAugustus(ctx, o) {
  const { w, d, colH = 10, pd = 13, temple: tp } = o, B = ctx.bufs;
  const H = 33, hF = 20, t = 1.8, hw = w / 2, z0 = -d / 2, z1 = d / 2, R = 17, st = 0.9, gate = 14;
  const xw = hw - t - R - 1.2, xc = xw - pd, zE = z0 + t + 30, zf = zE + R + 8, hX = 19.2;
  // the firewall: full height round the back half, lower towards the entrance; the Arco dei
  // Pantani goes through the back wall on the north-west side of the temple (local -x)
  const ax = -(tp.w / 2 + 3.4), aw = 5.2, ah = 9;
  wall(ctx, B.ashlar, -hw, ax - aw / 2, z0, z0 + t, H); wall(ctx, B.ashlar, ax + aw / 2, hw, z0, z0 + t, H);
  archway(ctx, B.ashlar, ax - aw / 2, ax + aw / 2, z0, z0 + t, ah, H);
  for (const xx of [ax - aw / 2 - 0.5, ax + aw / 2]) box(B.travertine, xx, xx + 0.5, 0, ah - aw / 2, z0 - 0.15, z0 + t + 0.15); // travertine jambs
  bands(ctx, [-hw, z0], [hw, z0], [0, 0], H, 2);
  const zi = z0 + t + 0.03, SB = B.stucco; // inside: stucco over the stone above the porticoes and behind the temple
  SB.quad([-hw + t, 0, zi], [ax - aw / 2, 0, zi], [ax - aw / 2, H, zi], [-hw + t, H, zi]);
  SB.quad([ax + aw / 2, 0, zi], [hw - t, 0, zi], [hw - t, H, zi], [ax + aw / 2, H, zi]);
  SB.quad([ax - aw / 2, ah, zi], [ax + aw / 2, ah, zi], [ax + aw / 2, H, zi], [ax - aw / 2, H, zi]);
  for (const s of [-1, 1]) {
    wall(ctx, B.ashlar, s * hw, s * (hw - t), z0, zf, H); bands(ctx, [s * hw, z0], [s * hw, zf], [0, 0], H, 2);
    wall(ctx, B.ashlar, s * hw, s * (hw - t), zf, z1, hF); bands(ctx, [s * hw, zf], [s * hw, z1], [0, 0], hF, 2);
    wall(ctx, B.ashlar, s * gate / 2, s * (hw - t), z1 - t, z1, hF); bands(ctx, [s * gate / 2, z1], [s * hw, z1], [0, 0], hF, 2);
    { const x = s * (hw - t - 0.03); SB.quad([x, hF, z0 + t], [x, hF, zf], [x, H, zf], [x, H, z0 + t]); }
    bayRun(ctx, [s * gate / 2, z1 - t - 0.06], [s * xc, z1 - t - 0.06], 0, hF, [0, d], 5, { mat: 'marble', kind: 'blank', pilW: 0.8 });
    for (const x of [s * gate / 2, s * (gate / 2 + 0.6)]) box(B.travertine, lo(x, x + s * 0.6), hi(x, x + s * 0.6), 0, 12, z1 - t - 0.3, z1 + 0.3);

    // the portico; on its back wall, niches with statues between half-columns of giallo antico,
    // four between the hall and the temple, and the same rhythm towards the entrance
    const P = portico(ctx, s * xc, s * xw, z0 + t, z1 - t, { colH, st, sp: 4.4, tint: 3, attic: 4, caryatids: true, roofY: hF - 0.2 });
    const ref = [s * (xw + 50), 0], nopt = { sill: 2.5 - st, nh: 3.4, nw: 1.9, content: 'statue', halfCol: { h: colH, dia: 0.95, tint: 3, out: 0.3 } };
    rectNiches(ctx, [s * xw, z0 + t], [s * xw, zE - R], st, P.ey + 0.5, ref, 4, { ...nopt, k: s > 0 ? 0 : 1 });
    rectNiches(ctx, [s * xw, zE + R], [s * xw, z1 - t], st, P.ey + 0.5, ref, Math.round((z1 - t - zE - R) / 4.4), { ...nopt, k: s > 0 ? 1 : 0 });
    // the mass of rooms and stairs between the portico and the firewall
    const xb = s * (xw + 0.85), xo = s * (hw - t);
    for (const [c, e] of [[z0 + t, zE - R - 1.2], [zE + R + 1.2, z1 - t]]) {
      const [a, b] = [lo(xb, xo), hi(xb, xo)];
      box(B.stone, a, b, 0, hF, c, e, { top: B.roof }); ctx.solid(a, b, c, e, hF);
    }

    // the half-round hall: fifteen bays round the curve, each with a niche for a statue at about
    // 2.5 m and one for a trophy at about 15 m; a coffered ceiling; a raised floor
    const cx = s * xw, ctr = [cx, zE], N = 15, pt = (k) => { const a = -Math.PI / 2 + (k * Math.PI) / N; return [cx + s * R * Math.cos(a), zE + R * Math.sin(a)]; };
    box(B.fine, lo(cx, cx + s * R), hi(cx, cx + s * R), 0, st, zE - R, zE + R, { top: B.floor });
    ctx.solid(lo(cx, cx + s * R), hi(cx, cx + s * R), zE - R, zE + R, st);
    for (let k = 0; k < N; k++) {
      const A = pt(k), Bp = pt(k + 1), F = frame(A, Bp, 0, ctr, true), mid = k === (N - 1) / 2;
      rectNiches(ctx, A, Bp, st, st + 11, ctr, 1, { inward: true, uo: k * 3.6, sill: 2.5 - st, nh: 3.4, nw: 1.9, content: 'statue', k, big: mid ? 0 : -1, bigW: 2.7, bigH: 6.2 });
      rectNiches(ctx, A, Bp, st + 11, hX, ctr, 1, { inward: true, uo: k * 3.6, sill: 15 - st - 11, nh: 2.5, nw: 1.4, content: 'trophy' });
      fbox(B.fine, F, 0, F.L, 11 - 0.3, 11, 0, 0.3); // cornice between the rows
      ctx.solidFrame(F, 0, F.L, -1, 0, hX);
    }
    const [ra, rb] = [lo(cx, xo), hi(cx, xo)];
    box(B.stone, ra, rb, hX, hX + 0.9, zE - R - 1.2, zE + R + 1.2, { bottom: true, top: B.roof });
    B.coffer.quad([ra, hX - 0.03, zE - R], [rb, hX - 0.03, zE - R], [rb, hX - 0.03, zE + R], [ra, hX - 0.03, zE + R]);
    // the screen across its mouth: four pilasters and six fluted cipollino columns, 9.5 m, under
    // a white marble entablature, with a wall above to the ceiling
    const sx = s * (xw + 0.9), sh = 9.5, se = 1.4, sy = st + sh;
    for (let i = 0; i < 10; i++) {
      const z = zE - R + 1 + ((2 * R - 2) * i) / 9;
      if (i < 2 || i > 7) { box(B.fine, sx - 0.5, sx + 0.5, st, sy, z - 0.5, z + 0.5); ctx.solid(sx - 0.5, sx + 0.5, z - 0.5, z + 0.5, sy); }
      else ctx.column(sx, st, z, sh, sh / 9.4, 4, true);
    }
    const r0 = [[sx - 0.6, zE + R], [sx + 0.6, zE + R], [sx + 0.6, zE - R], [sx - 0.6, zE - R]];
    sweep(B.fine, r0, [[-0.6, sy], [0, sy], ...ENTAB.map(([p, q2]) => [p * se, sy + q2 * se]), [0, sy + se]]);
    box(B.marble, sx - 0.35, sx + 0.35, sy + se, hX, zE - R, zE + R, { bottom: true });

    // Tiberius's arches of AD 19, for Drusus and Germanicus, one on each side of the temple
    ctx.push(s * (tp.w / 2 + 3), z0 + t + 13);
    arch(ctx, { w: 5.6, d: 3, h: 11, figures: 1, plain: true });
    ctx.pop();
  }

  ctx.push(0, z0 + t + tp.d / 2 + 0.3);
  temple(ctx, { ...tp, peripteral: true, sinePostico: true });
  ctx.pop();

  // Augustus in his triumphal chariot, gilded, on a base in the middle of the square
  ctx.push(0, z1 - 32);
  const bh = 2.8, k = 1.35, gb = { fine: B.gold, bronze: B.gold, gold: B.gold };
  base(ctx, 4.4, 5, bh);
  for (const x of [-2.6, -0.87, 0.87, 2.6]) horse(B.gold, x, bh, 1.4, k, Math.abs(x) > 2);
  box(B.gold, -1.3, 1.3, bh + 0.75, bh + 2.0, -2.5, -1.1);
  for (const sx of [-1, 1]) disc(B.gold, sx * 1.42, bh + 0.85, -1.8, 0.85);
  statue(gb, 0, bh + 0.75, -1.8, 2.7, 0, 'rider');
  ctx.pop();
}

// ---------- Forum of Caesar ----------

// Caesar's forum, the first of them, rebuilt by Trajan: a long square with a double portico down
// each side and across the entrance end, and at the far end the Temple of Venus Genetrix, Venus
// the Mother, from whom Caesar claimed descent. Fountains of nymphs flank its steps, and in front
// of it stands Caesar on his horse. Behind the south-west portico, two storeys of shops face out
// onto the Clivus Argentarius.
export function forumCaesar(ctx, o) {
  const { w, d, colH = 9, temple: tp } = o, B = ctx.bufs;
  const t = 1.6, hw = w / 2, z0 = -d / 2, z1 = d / 2, st = 0.6, H = 14, pd = 11, xw = hw - t, xc = xw - pd, gate = 10;
  wall(ctx, B.stone, -hw, hw, z0, z0 + t, 18); bands(ctx, [-hw, z0], [hw, z0], [0, 0], 18);
  for (const s of [-1, 1]) {
    wall(ctx, B.stone, s * hw, s * xw, z0, z1, H);
    wall(ctx, B.stone, s * gate / 2, s * xw, z1 - t, z1, H); bands(ctx, [s * gate / 2, z1], [s * hw, z1], [0, 0], H);
    const P = portico(ctx, s * xc, s * xw, z0 + t, z1 - t, { colH, st, sp: 3.9, inner: true });
    bayRun(ctx, [s * (xw - 0.06), z0 + t], [s * (xw - 0.06), z1 - t], st, P.ey + 0.5, [s * w, 0], 3.9, { mat: 'marble', kind: 'blank', cornice: false, pilW: 0.55 });
    bayRun(ctx, [s * gate / 2, z1 - t - 0.06], [s * xc, z1 - t - 0.06], st, P.ey + 0.5, [0, d], 3.9, { mat: 'marble', kind: 'blank', cornice: false, pilW: 0.55 });
  }
  bands(ctx, [hw, z0], [hw, z1], [0, 0], H);
  // across the entrance end (in a frame turned a quarter: x' = -z, z' = x)
  ctx.push(0, 0, Math.PI / 2);
  portico(ctx, -(z1 - t - pd), -(z1 - t), -xc + 1, xc - 1, { colH, st, sp: 3.9, inner: true });
  ctx.pop();
  // the shops on the outside: arched doorways below, windows above, a travertine course between
  {
    const xo = -hw - 0.04;
    bayRun(ctx, [xo, z0], [xo, z1], 0, 5.4, [0, 0], 4.2, { mat: 'brick', kind: 'arch', depth: 0.03, pilW: 0.5, cornice: false });
    bayRun(ctx, [xo, z0], [xo, z1], 5.4, 10.6, [0, 0], 4.2, { mat: 'brick', kind: 'window', ww: 1.2, wh: 1.6, sill: 1.4, depth: 0.03, pilW: 0.5 });
    box(B.travertine, -hw - 0.4, -hw, 5.2, 5.6, z0, z1);
    for (let z = z0 + 2.1; z < z1; z += 4.2 * 3) box(B.wood, -hw - 0.9, -hw - 0.05, 2.7, 2.78, z - 1.4, z + 1.4); // an awning rail over every third shop
  }

  const tz = z0 + t + tp.d / 2 + 0.3;
  ctx.push(0, tz);
  temple(ctx, { ...tp, peripteral: true, sinePostico: true });
  ctx.pop();
  for (const s of [-1, 1]) fountain(ctx, s * (tp.w / 2 + 5.5), tz + tp.d / 2 - 7);
  // Caesar on horseback, the horse with a raised foreleg
  ctx.push(0, tz + tp.d / 2 + 17);
  base(ctx, 1.6, 3.4, 4.4);
  horse(B.gold, 0, 4.4, 0, 2.2, true);
  statue({ fine: B.gold, bronze: B.gold, gold: B.gold }, 0, 4.4 + 1.25 * 2.2, 0.1 * 2.2, 1.75 * 2.2, 0, 'rider');
  ctx.pop();
}

// ---------- Forum of Nerva ----------

// The "passage forum", squeezed by Domitian into the street that ran between the Forum Romanum and
// the Subura, and opened by Nerva in 97. Too narrow for porticoes, its long walls are dressed with
// a row of columns standing just clear of them; the entablature breaks forward over each column,
// and above it an attic with a pedestal over every column and relief panels between, Minerva
// among them. At the far end, the Temple of Minerva.
export function forumNerva(ctx, o) {
  const { w, d, colH = 10, pd = 2.5, temple: tp } = o, B = ctx.bufs;
  const t = 1.6, hw = w / 2, z0 = -d / 2, z1 = d / 2, st = 1.1, eh = 1.6, ey = st + colH, at = ey + eh, ah = 3.8, H = at + ah + 0.6, gate = 12;
  const xf = hw - t, xc = xf - pd, dia = colH / 9.4;
  wall(ctx, B.stone, -hw, hw, z0, z0 + t, H); bands(ctx, [-hw, z0], [hw, z0], [0, 0], H);
  const za = z0 + t + 3, zb = z1 - t - 3, n = Math.round((zb - za) / 5.4), sp = (zb - za) / n;
  for (const s of [-1, 1]) {
    const X = (a, b) => [lo(s * a, s * b), hi(s * a, s * b)];
    wall(ctx, B.stone, s * hw, s * xf, z0, z1, H); bands(ctx, [s * hw, z0], [s * hw, z1], [0, 0], H);
    wall(ctx, B.stone, s * gate / 2, s * xf, z1 - t, z1, H); bands(ctx, [s * gate / 2, z1], [s * hw, z1], [0, 0], H);
    bayRun(ctx, [s * gate / 2, z1 - t - 0.06], [s * xf, z1 - t - 0.06], 0, H, [0, d], 5.4, { mat: 'ashlar', kind: 'blank', pilW: 0.8 });
    // the members that run the whole length: a base, the entablature in shallow relief, the top cornice
    let [a, b] = X(xf - 0.25, xf); box(B.fine, a, b, 0, st, z0 + t, z1 - t);
    [a, b] = X(xf - 0.3, xf); box(B.fine, a, b, ey, at, z0 + t, z1 - t);
    [a, b] = X(xf - 0.55, xf); box(B.fine, a, b, at - 0.35, at, z0 + t, z1 - t, { bottom: true });
    [a, b] = X(xf - 0.9, xf); box(B.fine, a, b, H - 0.6, H, z0 + t, z1 - t, { bottom: true });
    for (let i = 0; i <= n; i++) {
      const z = za + i * sp;
      [a, b] = X(xc - 0.8, xf); box(B.fine, a, b, 0, st, z - 0.8, z + 0.8); ctx.solid(a, b, z - 0.8, z + 0.8, st);
      ctx.column(s * xc, st, z, colH, dia, 0, true);
      [a, b] = X(xf - 0.35, xf); box(B.fine, a, b, st, ey, z - 0.55, z + 0.55); // pilaster behind the column
      // the entablature breaks forward over the column, and so does the attic
      [a, b] = X(xc - 0.62, xf);
      sweep(B.fine, [[a, z + 0.72], [b, z + 0.72], [b, z - 0.72], [a, z - 0.72]], ENTAB.map(([p, q2]) => [p * eh, ey + q2 * eh]));
      B.fine.quad([a, ey, z - 0.72], [b, ey, z - 0.72], [b, ey, z + 0.72], [a, ey, z + 0.72]);
      [a, b] = X(xc - 0.5, xf); box(B.fine, a, b, at, H - 0.6, z - 0.8, z + 0.8);
      [a, b] = X(xc - 0.8, xf); box(B.fine, a, b, H - 0.6, H, z - 1.05, z + 1.05, { bottom: true });
      if (i === n) continue;
      // a framed relief panel between: Minerva, and the women of the myths she presides over
      const zm = z + sp / 2, pw = sp / 2 - 1.3;
      [a, b] = X(xf - 0.2, xf);
      box(B.fine, a, b, at + 0.2, at + 0.42, zm - pw, zm + pw); box(B.fine, a, b, H - 0.85, H - 0.63, zm - pw, zm + pw);
      box(B.fine, a, b, at + 0.2, H - 0.63, zm - pw, zm - pw + 0.22); box(B.fine, a, b, at + 0.2, H - 0.63, zm + pw - 0.22, zm + pw);
      statue(B, s * (xf - 0.3), at + 0.42, zm, ah - 1.3, (-s * Math.PI) / 2, 'woman');
    }
  }
  ctx.push(0, z0 + t + tp.d / 2 + 0.3);
  temple(ctx, tp);
  ctx.pop();
}

// ---------- Temple of Peace ----------

// A low round bush, turned like a chess piece.
function shrub(buf, x, y, z, r, h) {
  const N = 9, P = [[0.6, 0], [1, 0.3], [0.9, 0.62], [0.5, 0.9], [0, 1]];
  const pt = (i, [a, b]) => { const t = (i / N) * Math.PI * 2 + x; return [x + Math.cos(t) * a * r, y + b * h, z + Math.sin(t) * a * r]; };
  for (let i = 0; i < N; i++) for (let k = 0; k < P.length - 1; k++) buf.quad(pt(i, P[k]), pt(i + 1, P[k]), pt(i + 1, P[k + 1]), pt(i, P[k + 1]));
}

// Vespasian's Temple of Peace, built from the spoils of Jerusalem: less a forum than a public
// garden and museum. Porticoes of red Egyptian granite on three sides; on the fourth the temple,
// its columns standing in line with the porticoes, between halls that held a library and the
// great marble plan of the city. In the square, six long raised beds of roses either side of a
// water channel, and Greek bronzes on pedestals.
export function templePeace(ctx, o) {
  const { w, d, colH = 9, pd = 10, temple: tp } = o, B = ctx.bufs;
  const t = 1.6, hw = w / 2, hd = d / 2, st = 0.9, H = 15, Hb = 21, gate = 14;
  const xw = hw - t, xc = xw - pd, zw = hd - t, zcf = zw - pd, zbk = -hd + t + 0.8, zcb = zbk + pd - 0.8, tw = tp.w / 2 + 1.5;
  const opt = { colH, st, sp: 4.4, tint: 2 };
  for (const s of [-1, 1]) {
    wall(ctx, B.stone, s * hw, s * xw, -hd, hd, H); bands(ctx, [s * hw, -hd], [s * hw, hd], [0, 0], H);
    wall(ctx, B.stone, s * gate / 2, s * xw, zw, hd, H); bands(ctx, [s * gate / 2, hd], [s * hw, hd], [0, 0], H);
    wall(ctx, B.stone, s * (tw - 1.5), s * hw, -hd, zbk, Hb); bands(ctx, [s * (tw - 1.5), -hd], [s * hw, -hd], [0, 0], Hb);
    const P = portico(ctx, s * xc, s * xw, zbk, zw, opt);
    bayRun(ctx, [s * (xw - 0.06), zbk], [s * (xw - 0.06), zw], st, P.ey + 0.5, [s * w, 0], 4.4, { mat: 'marble', kind: 'blank', cornice: false, pilW: 0.55 });
    bayRun(ctx, [s * gate / 2, zw - 0.06], [s * xc, zw - 0.06], st, P.ey + 0.5, [0, d], 4.4, { mat: 'marble', kind: 'blank', cornice: false, pilW: 0.55 });
    // the halls either side of the temple, each entered by a great bronze door
    const hx = s * (tw + (xc - tw) / 2), F = frame([hx - 5, zbk + 0.75], [hx + 5, zbk + 0.75], st, [0, -d]);
    templeDoor(ctx, F, 5, colH);
    for (const u of [0, 10]) q(B.ashlar, F, [u, 0, 0], [u, colH, 0], [u, colH, -0.75], [u, 0, -0.75], 's');
    bayRun(ctx, [s * tw, zbk + 0.03], [hx - s * 5, zbk + 0.03], st, P.ey + 0.5, [0, -d], 4.4, { mat: 'marble', kind: 'blank', cornice: false, pilW: 0.55 });
    bayRun(ctx, [hx + s * 5, zbk + 0.03], [s * xw, zbk + 0.03], st, P.ey + 0.5, [0, -d], 4.4, { mat: 'marble', kind: 'blank', cornice: false, pilW: 0.55 });
  }
  // porticoes across the entrance end, and across the back either side of the temple
  ctx.push(0, 0, Math.PI / 2);
  portico(ctx, -zcf, -zw, -xc + 1, xc - 1, opt);
  portico(ctx, -zcb, -zbk, -xc + 1, -tw, opt);
  portico(ctx, -zcb, -zbk, tw, xc - 1, opt);
  ctx.pop();

  // the temple, its front columns in line with the porticoes; the hall behind reaches beyond the wall
  const ph = tp.podium ?? 1, dia = tp.colH / 9.5, zcl = tp.d / 2 - Math.min(ph * 1.5, tp.d * 0.25) - dia * 0.9;
  ctx.push(0, zcb - zcl);
  temple(ctx, tp);
  ctx.pop();

  // the garden
  const gz0 = zcb + 17, gz1 = zcf - 6, beds = [-32.5, -19.5, -6.5, 6.5, 19.5, 32.5], bw = 2.6;
  for (const x of beds) {
    box(B.fine, x - bw, x + bw, 0, 0.55, gz0, gz1, { top: false });
    for (const sx of [-1, 1]) box(B.fine, x + sx * bw - 0.2, x + sx * bw + 0.2, 0.55, 0.65, gz0 - 0.2, gz1 + 0.2);
    for (const sz of [gz0, gz1]) box(B.fine, x - bw - 0.2, x + bw + 0.2, 0.55, 0.65, sz - 0.2, sz + 0.2);
    B.greens.quad([x - bw, 0.45, gz1], [x + bw, 0.45, gz1], [x + bw, 0.45, gz0], [x - bw, 0.45, gz0]);
    let k = 0;
    for (let z = gz0 + 1; z < gz1 - 0.6; z += 1.45, k++) shrub(B.greens, x + (k % 2 ? 1.1 : -1.1), 0.45, z, 0.5 + (k % 3) * 0.08, 0.7 + (k % 4) * 0.1);
    ctx.solid(x - bw - 0.2, x + bw + 0.2, gz0 - 0.2, gz1 + 0.2, 0.65);
    // Greek bronzes at the ends of the beds
    for (const [z, f] of [[gz0 - 2.4, Math.PI], [gz1 + 2.2, 0]]) { ctx.push(x, z); base(ctx, 0.6, 0.6, 1.4); statue(B, 0, 1.4, 0, 2.2, f, (x > 0 ? 1 : 3)); ctx.pop(); }
  }
  // the water channel down the middle
  for (const sx of [-1, 1]) box(B.fine, sx * 1.6 - 0.25, sx * 1.6 + 0.25, 0, 0.5, gz0, gz1);
  for (const sz of [gz0, gz1]) box(B.fine, -1.85, 1.85, 0, 0.5, sz - 0.25, sz + 0.25);
  B.pool.quad([-1.35, 0.3, gz1], [1.35, 0.3, gz1], [1.35, 0.3, gz0], [-1.35, 0.3, gz0]);
  ctx.solid(-1.85, 1.85, gz0 - 0.25, gz1 + 0.25, 0.5);
}
