import { statue } from './geobuf.js';

// Real wall geometry: one "bay" of a facade with an arched opening or a window actually cut
// into it, with depth, plus the pilaster and cornice that frame it.
//
// A bay is described in its own flat frame: u runs along the wall from A to B, v is height
// above the bay's base, w is distance out from the wall face (negative = into the wall).

export function frame(A, B, y0, ref, inward = false, uo = 0) {
  const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), tx = dx / L, tz = dz / L;
  let nx = tz, nz = -tx;
  let s = nx * ((A[0] + B[0]) / 2 - ref[0]) + nz * ((A[1] + B[1]) / 2 - ref[1]) >= 0 ? 1 : -1;
  if (inward) s = -s;
  nx *= s; nz *= s;
  return { L, y0, uo, tx, tz, P: (u, v, w) => [A[0] + tx * u + nx * w, y0 + v, A[1] + tz * u + nz * w] };
}

// Quad from four [u, v, w] corners. `mode` picks which two axes drive the texture:
// 'f' a face of the wall, 's' a vertical face running into the wall, 't' a horizontal face.
export function q(buf, F, p0, p1, p2, p3, mode = 'f') {
  const uv = (p) => (mode === 'f' ? [(F.uo + p[0]) / buf.tu, (F.y0 + p[1]) / buf.tv]
    : mode === 's' ? [p[2] / buf.tu, (F.y0 + p[1]) / buf.tv] : [(F.uo + p[0]) / buf.tu, p[2] / buf.tv]);
  buf.quadUV(F.P(...p0), F.P(...p1), F.P(...p2), F.P(...p3), uv(p0), uv(p1), uv(p2), uv(p3));
}

// Block standing out from the wall between w0 and w1 (no back face).
export function fbox(buf, F, u0, u1, v0, v1, w0, w1) {
  q(buf, F, [u0, v0, w1], [u1, v0, w1], [u1, v1, w1], [u0, v1, w1]);
  q(buf, F, [u0, v0, w0], [u0, v0, w1], [u0, v1, w1], [u0, v1, w0], 's');
  q(buf, F, [u1, v0, w1], [u1, v0, w0], [u1, v1, w0], [u1, v1, w1], 's');
  q(buf, F, [u0, v1, w1], [u1, v1, w1], [u1, v1, w0], [u0, v1, w0], 't');
  q(buf, F, [u0, v0, w0], [u1, v0, w0], [u1, v0, w1], [u0, v0, w1], 't');
}

// One bay between ground points A and B, from height y0 to y1. `ref` is any point on the
// inside of the building, used to work out which way is out.
//   kind: 'arch' | 'window' | 'blank'.  open: an arch you can walk through (no dark panel behind).
//   back: material for the back of a closed opening (a statue niche is marble, not darkness).
export function bay(ctx, A, B, y0, y1, ref, o = {}) {
  const { kind = 'arch', mat = 'stone', pil = true, cornice = true, depth = 1.1, inward = false, uo = 0 } = o;
  const buf = ctx.bufs[mat], dark = ctx.bufs[o.back ?? 'void'], F = frame(A, B, y0, ref, inward, uo), L = F.L, H = y1 - y0;
  const eh = cornice ? Math.min(H * 0.12, 1.6) : 0, Hw = H - eh;

  if (kind === 'arch' && L > 2.4) {
    let r = Math.min(L * 0.28, (L - 1.6) / 2), hs = Hw * 0.88 - r;
    if (hs < Hw * 0.3) { hs = Hw * 0.3; r = Math.min(r, Hw * 0.55); }
    const u0 = L / 2 - r, u1 = L / 2 + r, n = 10;
    q(buf, F, [0, 0, 0], [u0, 0, 0], [u0, Hw, 0], [0, Hw, 0]);
    q(buf, F, [u1, 0, 0], [L, 0, 0], [L, Hw, 0], [u1, Hw, 0]);
    for (let k = 0; k < n; k++) {
      const a0 = Math.PI - (k * Math.PI) / n, a1 = Math.PI - ((k + 1) * Math.PI) / n;
      const pa = [L / 2 + r * Math.cos(a0), hs + r * Math.sin(a0)], pb = [L / 2 + r * Math.cos(a1), hs + r * Math.sin(a1)];
      q(buf, F, [pa[0], pa[1], 0], [pb[0], pb[1], 0], [pb[0], Hw, 0], [pa[0], Hw, 0]);
      q(buf, F, [pa[0], pa[1], 0], [pb[0], pb[1], 0], [pb[0], pb[1], -depth], [pa[0], pa[1], -depth], 't');
    }
    q(buf, F, [u0, 0, 0], [u0, hs, 0], [u0, hs, -depth], [u0, 0, -depth], 's');
    q(buf, F, [u1, 0, 0], [u1, hs, 0], [u1, hs, -depth], [u1, 0, -depth], 's');
    if (!o.open) {
      dark.quad(F.P(u0, 0, -depth), F.P(u1, 0, -depth), F.P(u1, hs + r, -depth), F.P(u0, hs + r, -depth));
    } else {
      // open arcade: the wall needs an inside face too, and the piers become obstacles
      q(buf, F, [0, 0, -depth], [u0, 0, -depth], [u0, Hw, -depth], [0, Hw, -depth]);
      q(buf, F, [u1, 0, -depth], [L, 0, -depth], [L, Hw, -depth], [u1, Hw, -depth]);
      for (let k = 0; k < n; k++) {
        const a0 = Math.PI - (k * Math.PI) / n, a1 = Math.PI - ((k + 1) * Math.PI) / n;
        const pa = [L / 2 + r * Math.cos(a0), hs + r * Math.sin(a0)], pb = [L / 2 + r * Math.cos(a1), hs + r * Math.sin(a1)];
        q(buf, F, [pa[0], pa[1], -depth], [pb[0], pb[1], -depth], [pb[0], Hw, -depth], [pa[0], Hw, -depth]);
      }
      if (cornice) q(buf, F, [0, Hw, -depth], [L, Hw, -depth], [L, H, -depth], [0, H, -depth]);
      if (!o.noSolid) { ctx.solidFrame(F, 0, u0, -depth, 0, y1, o.thick); ctx.solidFrame(F, u1, L, -depth, 0, y1, o.thick); }
    }
    if (o.statue) { // a figure on a pedestal standing in the arch
      const m = L / 2, fh = Math.min(2.7, hs * 0.55), wb = -depth + 0.25;
      fbox(buf, F, m - 0.5, m + 0.5, 0, 0.9, wb, wb + 0.9);
      const c = F.P(m, 0.9, wb + 0.45), n0 = F.P(0, 0, 0), n1 = F.P(0, 0, 1);
      statue(ctx.bufs, c[0], c[1], c[2], fh * 1.25, Math.atan2(n1[0] - n0[0], n1[2] - n0[2]), o.statue === true ? 0 : o.statue);
      if (o.open && !o.noSolid) ctx.solidFrame(F, m - 0.5, m + 0.5, wb, wb + 0.9, y1, o.thick);
    }
    if (o.parapet) { // parapet across the opening of an upper arch; on a walkable floor it stops you stepping out
      const pw = o.parapetW ?? -depth * 0.55;
      fbox(buf, F, u0, u1, 0, o.parapet, pw, pw + 0.28);
      fbox(buf, F, u0, u1, o.parapet, o.parapet + 0.09, pw - 0.05, pw + 0.33);
      if (o.open && !o.noSolid && o.thick !== undefined) ctx.solidFrame(F, u0, u1, -depth, 0, y0 + o.parapet, o.parapet + 0.4);
    }
    // projecting impost blocks where the arch springs
    for (const u of [u0, u1]) fbox(buf, F, u - 0.35, u + 0.35, hs - 0.3, hs, 0, 0.14);
  } else if (kind === 'window' && L > 1.2) {
    const ww = Math.min(o.ww ?? 1.1, L * 0.5), wh = Math.min(o.wh ?? 1.6, Hw * 0.55), vb = o.sill ?? Hw * 0.3;
    const u0 = (L - ww) / 2, u1 = u0 + ww, v0 = vb, v1 = vb + wh, d = Math.min(depth, 0.5);
    q(buf, F, [0, 0, 0], [u0, 0, 0], [u0, Hw, 0], [0, Hw, 0]);
    q(buf, F, [u1, 0, 0], [L, 0, 0], [L, Hw, 0], [u1, Hw, 0]);
    q(buf, F, [u0, 0, 0], [u1, 0, 0], [u1, v0, 0], [u0, v0, 0]);
    q(buf, F, [u0, v1, 0], [u1, v1, 0], [u1, Hw, 0], [u0, Hw, 0]);
    q(buf, F, [u0, v0, 0], [u0, v1, 0], [u0, v1, -d], [u0, v0, -d], 's');
    q(buf, F, [u1, v0, 0], [u1, v1, 0], [u1, v1, -d], [u1, v0, -d], 's');
    q(buf, F, [u0, v0, 0], [u1, v0, 0], [u1, v0, -d], [u0, v0, -d], 't');
    q(buf, F, [u0, v1, 0], [u1, v1, 0], [u1, v1, -d], [u0, v1, -d], 't');
    if (!o.open) dark.quad(F.P(u0, v0, -d), F.P(u1, v0, -d), F.P(u1, v1, -d), F.P(u0, v1, -d)); // open: a real hole that lets the sun in
    fbox(buf, F, u0 - 0.15, u1 + 0.15, v0 - 0.14, v0, 0, 0.16); // sill
  } else {
    q(buf, F, [0, 0, 0], [L, 0, 0], [L, Hw, 0], [0, Hw, 0]);
    if (o.shield) { const m = L / 2, r = Math.min(0.9, L * 0.16); fbox(ctx.bufs.gold, F, m - r, m + r, Hw * 0.5 - r, Hw * 0.5 + r, 0, 0.12); }
  }

  if (pil) { const pw = o.pilW ?? 0.9; fbox(buf, F, -pw / 2, pw / 2, 0, Hw, 0, 0.38); }
  if (cornice) {
    fbox(buf, F, 0, L, Hw, H, 0, 0.32);
    fbox(buf, F, 0, L, H - Math.min(0.4, eh * 0.35), H, 0.32, 0.8);
  }
}

// A straight run of identical bays from A to B.
export function bayRun(ctx, A, B, y0, y1, ref, bayLen, o = {}) {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.round(L / bayLen));
  for (let i = 0; i < n; i++) {
    const a = [A[0] + ((B[0] - A[0]) * i) / n, A[1] + ((B[1] - A[1]) * i) / n];
    const b = [A[0] + ((B[0] - A[0]) * (i + 1)) / n, A[1] + ((B[1] - A[1]) * (i + 1)) / n];
    bay(ctx, a, b, y0, y1, ref, { ...o, uo: (L * i) / n });
  }
}

// All four sides of a rectangle as runs of bays.
export function bayBox(ctx, x0, x1, y0, y1, z0, z1, bayLen, o = {}) {
  const ref = [(x0 + x1) / 2, (z0 + z1) / 2];
  bayRun(ctx, [x0, z1], [x1, z1], y0, y1, ref, bayLen, o);
  bayRun(ctx, [x1, z1], [x1, z0], y0, y1, ref, bayLen, o);
  bayRun(ctx, [x1, z0], [x0, z0], y0, y1, ref, bayLen, o);
  bayRun(ctx, [x0, z0], [x0, z1], y0, y1, ref, bayLen, o);
}
