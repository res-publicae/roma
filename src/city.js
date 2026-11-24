import * as THREE from 'three';
import { box, gable, statue } from './geobuf.js';
import { frame, fbox, q, bay } from './facade.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rotY, mulberry32, polyDist } from './util.js';

// Fills the ground between the monuments with apartment blocks (insulae). Almost none of
// Rome's ordinary housing is recorded, so this is invented: street grids that turn from
// district to district, blocks split into lots, two to six storeys with shops at street level.
export function buildHousing(ctx, terrain, rng, bounds, districts, focus = []) {
  const B = ctx.bufs, BW = 44, BD = 27, ST = 5;
  const nearest = (x, z) => { let b = 0, bd = Infinity; districts.forEach((d, i) => { const q = (x - d[0]) ** 2 + (z - d[1]) ** 2; if (q < bd) { bd = q; b = i; } }); return b; };
  let count = 0;

  districts.forEach(([sx, sz, bearing], k) => {
    const a = rotY(bearing), cos = Math.cos(a), sin = Math.sin(a);
    for (let i = -48; i <= 48; i++) for (let j = -70; j <= 70; j++) {
      const lx = i * (BW + ST), lz = j * (BD + ST);
      const wx = sx + lx * cos + lz * sin, wz = sz - lx * sin + lz * cos;
      if (wx < bounds.minX + 30 || wx > bounds.maxX - 30 || wz < bounds.minZ + 30 || wz > bounds.maxZ - 30) continue;
      if (nearest(wx, wz) !== k) continue;
      ctx.begin(wx, 0, wz, a);

      // split the block into lots
      const lots = [], cuts = [-BW / 2];
      const n = rng() < 0.45 ? 2 : 3;
      for (let c = 1; c < n; c++) cuts.push(-BW / 2 + (BW * (c + (rng() - 0.5) * 0.4)) / n);
      cuts.push(BW / 2);
      for (let c = 0; c < n; c++) {
        if (rng() < 0.55) { const zc = (rng() - 0.5) * BD * 0.25; lots.push([cuts[c], cuts[c + 1], -BD / 2, zc], [cuts[c], cuts[c + 1], zc, BD / 2]); }
        else lots.push([cuts[c], cuts[c + 1], -BD / 2, BD / 2]);
      }

      for (const [x0, x1, z0, z1] of lots) {
        if (rng() < 0.07) continue;
        const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [(x0 + x1) / 2, (z0 + z1) / 2]];
        let ok = true, lo = Infinity, hi = -Infinity, centre = 0;
        for (let q = 0; q < 5 && ok; q++) {
          const p = ctx.toWorld(pts[q][0], 0, pts[q][1]), px = p[0], pz = p[2];
          if (terrain.padAt(px, pz, 7) || terrain.roadDist(px, pz) < 2.5 || terrain.riverDist(px, pz) < 62 || terrain.noHouse(px, pz) > 0.04) { ok = false; break; }
          const hh = terrain.h(px, pz);
          lo = Math.min(lo, hh); hi = Math.max(hi, hh);
          if (q === 4) centre = hh;
        }
        if (!ok || hi - lo > 7) continue;

        const storeys = 2 + Math.floor(rng() * rng() * 5), gh = 3.6;
        const yb = lo - 1, gy = centre + gh, yt = gy + (storeys - 1) * 3.1;
        const tint = Math.floor(rng() * ctx.plasterCount), wall = B['plaster' + tint];
        const uo = rng() < 0.5 ? 0 : 0.5, vo = rng() < 0.5 ? 0 : 0.5;
        const sides = [
          [[x0, z1], [x1, z1]], [[x1, z0], [x0, z0]], [[x1, z1], [x1, z0]], [[x0, z0], [x0, z1]],
        ];
        // Near the places you walk, house fronts are built for real: shops you can see into,
        // windows set into the wall, shutters, string courses. Further off they are painted.
        const wc = ctx.toWorld((x0 + x1) / 2, 0, (z0 + z1) / 2);
        const fine = focus.some(([fx, fz, fr]) => (wc[0] - fx) ** 2 + (wc[2] - fz) ** 2 < fr * fr);
        const street = [z1 === BD / 2, z0 === -BD / 2, x1 === BW / 2, x0 === -BW / 2];
        sides.forEach(([[ax, az], [bx, bz]], si) => {
          const len = Math.hypot(bx - ax, bz - az), nb = Math.max(1, Math.round(len / 3.2)) / 2;
          if (!fine) {
            B.shop.quad([ax, yb, az], [bx, yb, bz], [bx, gy, bz], [ax, gy, az], [uo, 0, uo + nb, 1]);
            wall.quad([ax, gy, az], [bx, gy, bz], [bx, yt, bz], [ax, yt, az], [uo, vo, uo + nb, vo + (storeys - 1) / 2]);
          } else front(ctx, terrain, [ax, az], [bx, bz], [(x0 + x1) / 2, (z0 + z1) / 2], { yb, gy, yt, centre, storeys, tint, seed: count * 7 + si, shops: street[si] });
          if (fine && street[si]) {
            // the raised pavement runs on round the corner of the block on the two long sides
            const c0 = si === 0 ? x0 === -BW / 2 : si === 1 ? x1 === BW / 2 : false, c1 = si === 0 ? x1 === BW / 2 : si === 1 ? x0 === -BW / 2 : false;
            pavement(ctx, terrain, [ax, az], [bx, bz], [(x0 + x1) / 2, (z0 + z1) / 2], { e0: c0, e1: c1, seed: count * 13 + si });
          }
        });
        // Street-side extras, only on faces that look onto a street and not onto a neighbour:
        // a tiled lean-to roof over the shops, and on taller blocks a timber balcony.
        const onStreet = [z1 === BD / 2, z0 === -BD / 2, x1 === BW / 2, x0 === -BW / 2];
        sides.forEach(([a, b], si) => {
          if (!onStreet[si]) return;
          const F = frame(a, b, 0, [(x0 + x1) / 2, (z0 + z1) / 2]);
          const pick = rng();
          if (pick < 0.13 && F.L > 7) {
            // covered pavement: a row of piers carrying a tiled roof
            const np = Math.max(2, Math.round(F.L / 3.3));
            for (let pi = 0; pi <= np; pi++) { const u = 0.3 + ((F.L - 0.6) * pi) / np; fbox(B.stucco, F, u - 0.28, u + 0.28, yb, gy - 0.5, 2.3, 2.86); }
            fbox(B.stucco, F, 0, F.L, gy - 0.5, gy - 0.1, 2.3, 2.86);
            B.roof.quad(F.P(0, gy + 0.35, 0), F.P(F.L, gy + 0.35, 0), F.P(F.L, gy - 0.1, 3.1), F.P(0, gy - 0.1, 3.1));
          } else if (pick < 0.65) B.roof.quad(F.P(0.2, gy + 0.15, 0), F.P(F.L - 0.2, gy + 0.15, 0), F.P(F.L - 0.2, gy - 0.45, 1.5), F.P(0.2, gy - 0.45, 1.5));
          if (storeys >= 3 && F.L > 6 && rng() < 0.3) {
            const vb = gy + 3.05;
            fbox(B.wood, F, 1, F.L - 1, vb - 0.18, vb, 0, 1);
            fbox(B.wood, F, 1, F.L - 1, vb, vb + 0.95, 0.92, 1);
          }
        });
        const w = x1 - x0, d = z1 - z0;
        if (rng() < 0.82) {
          const ax = w > d;
          gable(B.roof, B.stucco, x0, x1, yt, z0, z1, { rise: Math.min(w, d) * 0.19, over: 0.5, alongX: ax });
        } else {
          B.stucco.quad([x0, yt - 0.4, z1], [x1, yt - 0.4, z1], [x1, yt - 0.4, z0], [x0, yt - 0.4, z0]);
          if (w > 7 && d > 7) { // a room built on the roof terrace
            const px = x0 + 1 + rng() * (w - 7), pz = z0 + 1 + rng() * (d - 7);
            box(B.stucco, px, px + 5, yt - 0.4, yt + 2.3, pz, pz + 5, { top: false });
            gable(B.roof, B.stucco, px, px + 5, yt + 2.3, pz, pz + 5, { rise: 0.9, over: 0.35 });
          }
        }
        ctx.solid(x0, x1, z0, z1, yt);
        count++;
      }
    }
  });
  return count;
}

// Umbrella pines and cypresses on the open hills and in walled gardens. Three shapes of each,
// built from lumpy blobs and shaded darker underneath, then turned and stretched per tree.
function lump(g, cx, cy, cz, amt, seed, lo, hi) {
  const p = g.attributes.position, col = new Float32Array(p.count * 3), nr = g.attributes.normal;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.count; i++) { y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i)); }
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 2.1 + seed) * Math.cos(z * 1.7 - seed * 2) + Math.sin(y * 2.9 + z * 1.3 + seed * 3) * 0.6;
    const dx = x - cx, dz = z - cz, k = 1 + n * amt;
    p.setXYZ(i, cx + dx * k, cy + (y - cy) * (1 + n * amt * 0.5), cz + dz * k);
    const t = (y - y0) / (y1 - y0 || 1), sh = (lo + (hi - lo) * t) * (0.9 + 0.2 * Math.sin(n * 5 + seed));
    col[i * 3] = sh; col[i * 3 + 1] = sh; col[i * 3 + 2] = sh * 0.9;
    const l = Math.hypot(dx, (y - cy) * 0.6 + 0.4, dz) || 1; // soft, rounded shading
    nr.setXYZ(i, dx / l, ((y - cy) * 0.6 + 0.4) / l, dz / l);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function buildTrees(ctx, terrain, solids, rng, bounds, attempts = 9000) {
  const pines = [[], [], []], cypress = [[], [], []];
  let count = 0;
  for (let i = 0; i < attempts; i++) {
    const x = bounds.minX + 20 + rng() * (bounds.maxX - bounds.minX - 40), z = bounds.minZ + 20 + rng() * (bounds.maxZ - bounds.minZ - 40);
    const pad = terrain.padAt(x, z, 2);
    const garden = pad && pad.trees && terrain.padAt(x, z, -4) === pad;
    const open = !pad && terrain.noHouse(x, z) > 0.2;
    if (!garden && !open) continue;
    if (garden && rng() < 0.55) continue;
    if (terrain.roadDist(x, z) < 4 || terrain.riverDist(x, z) < 60 || solids.inside(x, z)) continue;
    let crowded = false; // keep crowns clear of walls, colonnades and roofs
    for (let q = 0; q < 8 && !crowded; q++) if (solids.inside(x + Math.cos(q * 0.785) * 5, z + Math.sin(q * 0.785) * 5)) crowded = true;
    if (crowded) continue;
    (rng() < 0.45 ? cypress : pines)[Math.floor(rng() * 3)].push([x, terrain.h(x, z) - 0.3, z, 0.75 + rng() * 0.6, rng() * 6.283, 0.85 + rng() * 0.35]);
    count++;
  }
  const out = [];
  const inst = (geom, mat, list) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geom, mat, list.length), mm = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    list.forEach(([x, y, z, s, r, w], i) => { mm.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, r), new THREE.Vector3(s * w, s, s * w)); m.setMatrixAt(i, mm); });
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    out.push(m);
  };
  for (let v = 0; v < 3; v++) {
    const r = mulberry32(900 + v);
    // cypress: a tall spindle, widest a third of the way up
    const prof = [[0.05, 0.5], [0.75, 1.3], [1.15, 3.2], [1.2, 5.5], [0.95, 8], [0.55, 10.2], [0.05, 12 + v * 0.8]].map(([a, b]) => new THREE.Vector2(a, b));
    inst(lump(new THREE.LatheGeometry(prof, 9), 0, 6, 0, 0.16, v * 7.3, 0.45, 1.05), ctx.M.foliageDark, cypress[v]);
    // pine: a leaning trunk, a couple of bare boughs, and a flat crown made of several clumps
    const lean = (r() - 0.5) * 1.6, th = 7.5 + v * 1.2, parts = [], wood = [];
    const trunk = new THREE.CylinderGeometry(0.22, 0.42, th, 7, 4); trunk.translate(0, th / 2, 0);
    { const p = trunk.attributes.position; for (let i = 0; i < p.count; i++) { const t = p.getY(i) / th; p.setX(i, p.getX(i) + lean * t * t); } trunk.computeVertexNormals(); }
    wood.push(trunk);
    const nb = 5 + v;
    for (let b = 0; b < nb; b++) {
      const a = (b / nb) * 6.283 + r(), d = b === 0 ? 0 : 1.6 + r() * 1.5, rad = 1.7 + r() * 0.9;
      const cx = lean + Math.cos(a) * d, cz = Math.sin(a) * d, cy = th + 0.9 + r() * 0.7;
      const g = new THREE.IcosahedronGeometry(rad, 1); g.scale(1, 0.5, 1); g.translate(cx, cy, cz);
      parts.push(lump(g, cx, cy, cz, 0.2, b * 3.1 + v, 0.5, 1.1));
      if (b > 0 && b < 4) { // bough from the trunk out to this clump
        const len = Math.hypot(d, 1.6), bough = new THREE.CylinderGeometry(0.07, 0.13, len, 5); bough.translate(0, len / 2, 0);
        bough.rotateZ(-Math.atan2(d, 1.6)); bough.rotateY(-a); bough.translate(lean * 0.8, th - 1.2, 0);
        wood.push(bough);
      }
    }
    inst(mergeGeometries(parts), ctx.M.foliage, pines[v]);
    inst(mergeGeometries(wood), ctx.M.trunk, pines[v]);
  }
  return { meshes: out, count };
}

// One street front of an apartment block, built in full. Ground floor: a row of shops, each a
// wide opening under a timber beam with a room behind it, some with a masonry counter, some
// shuttered, some under an awning. Above: a window to every bay on every floor, set into the
// wall, with shutters open, closed or missing.
function front(ctx, terrain, A, Bp, ref, { yb, gy, yt, centre, storeys, tint, seed, shops }) {
  const B = ctx.bufs, R = mulberry32(seed + 11), name = 'plain' + tint, W = B[name];
  const F = frame(A, Bp, 0, ref), L = F.L, nb = Math.max(1, Math.round(L / 3.3)), bl = L / nb;
  const G = shops && R() < 0.4 ? B.brick : W; // brick-faced or plastered at street level
  const at = (u) => [A[0] + ((Bp[0] - A[0]) * u) / L, A[1] + ((Bp[1] - A[1]) * u) / L];
  for (let k = 0; k < nb; k++) {
    const ub = k * bl, ue = ub + bl, m = F.P(ub + bl / 2, 0, 0.6), g = terrain.h(...((p) => [p[0], p[2]])(ctx.toWorld(m[0], 0, m[2])));
    const kind = R(), extra = R();
    if (!shops || bl < 2.6 || g > centre + 0.5 || g < centre - 1.1 || kind < 0.08) { q(G, F, [ub, yb, 0], [ue, yb, 0], [ue, gy, 0], [ub, gy, 0]); }
    else {
      const s0 = ub + 0.45, s1 = ue - 0.45, sill = centre + 0.12, top = centre + 2.75, dp = 0.45, back = -3;
      q(G, F, [ub, yb, 0], [s0, yb, 0], [s0, gy, 0], [ub, gy, 0]);
      q(G, F, [s1, yb, 0], [ue, yb, 0], [ue, gy, 0], [s1, gy, 0]);
      q(G, F, [s0, top, 0], [s1, top, 0], [s1, gy, 0], [s0, gy, 0]);
      q(G, F, [s0, yb, 0], [s1, yb, 0], [s1, sill, 0], [s0, sill, 0]);
      q(G, F, [s0, sill, 0], [s0, top, 0], [s0, top, -dp], [s0, sill, -dp], 's');
      q(G, F, [s1, sill, 0], [s1, top, 0], [s1, top, -dp], [s1, sill, -dp], 's');
      q(B.wood, F, [s0, top, 0], [s1, top, 0], [s1, top, -dp], [s0, top, -dp], 't');
      q(B.stone, F, [s0, sill, 0], [s1, sill, 0], [s1, sill, -dp], [s0, sill, -dp], 't');
      fbox(B.wood, F, s0 - 0.22, s1 + 0.22, top, top + 0.26, 0, 0.07); // the beam over the opening
      if (kind < 0.3) { // shut for the day: a wall of planks dropped into the threshold
        const n = Math.max(3, Math.round((s1 - s0) / 0.34));
        for (let i = 0; i < n; i++) { const a = s0 + ((s1 - s0) * i) / n, b = s0 + ((s1 - s0) * (i + 1)) / n - 0.025; B[i % 2 ? 'wood' : 'plank'].quad(F.P(a, sill, -0.18 - (i % 2) * 0.02), F.P(b, sill, -0.18 - (i % 2) * 0.02), F.P(b, top, -0.18 - (i % 2) * 0.02), F.P(a, top, -0.18 - (i % 2) * 0.02)); }
      } else { // open: the room behind
        const i0 = ub + 0.12, i1 = ue - 0.12;
        B.void.quad(F.P(i0, sill, back), F.P(i1, sill, back), F.P(i1, top + 0.4, back), F.P(i0, top + 0.4, back));
        q(W, F, [i0, sill, -dp], [i0, top + 0.4, -dp], [i0, top + 0.4, back], [i0, sill, back], 's');
        q(W, F, [i1, sill, -dp], [i1, top + 0.4, -dp], [i1, top + 0.4, back], [i1, sill, back], 's');
        q(W, F, [i0, sill, -dp], [s0, sill, -dp], [s0, top + 0.4, -dp], [i0, top + 0.4, -dp]);
        q(W, F, [s1, sill, -dp], [i1, sill, -dp], [i1, top + 0.4, -dp], [s1, top + 0.4, -dp]);
        B.void.quad(F.P(i0, top + 0.4, -dp), F.P(i1, top + 0.4, -dp), F.P(i1, top + 0.4, back), F.P(i0, top + 0.4, back));
        B.stone.quad(F.P(i0, sill, -dp), F.P(i1, sill, -dp), F.P(i1, sill, back), F.P(i0, sill, back));
        if (kind < 0.7) { // a masonry counter across part of the front, with pots sunk into its top
          const c1 = s0 + (s1 - s0) * 0.62;
          fbox(B.stucco, F, s0, c1, sill, sill + 0.95, -0.85, -0.12);
          fbox(B.fine, F, s0 - 0.02, c1 + 0.04, sill + 0.95, sill + 1.0, -0.88, -0.09);
          for (let u = s0 + 0.35; u < c1 - 0.2; u += 0.55) fbox(B.dark, F, u - 0.15, u + 0.15, sill + 1.0, sill + 1.012, -0.62, -0.32);
          fbox(B.wood, F, i0 + 0.1, i1 - 0.1, sill + 1.7, sill + 1.76, back + 0.02, back + 0.4); // a shelf on the back wall
          for (let u = i0 + 0.4; u < i1 - 0.3; u += 0.42) fbox(B.brick, F, u - 0.11, u + 0.11, sill + 1.76, sill + 2.05, back + 0.1, back + 0.32);
        } else { // or goods stacked inside: sacks and crates
          fbox(B.plank, F, s0 + 0.2, s0 + 1.0, sill, sill + 0.6, -1.9, -1.1); fbox(B.plank, F, s0 + 0.35, s0 + 0.95, sill + 0.6, sill + 1.1, -1.8, -1.2);
          fbox(B.sand, F, s1 - 1.0, s1 - 0.2, sill, sill + 0.42, -1.6, -0.9);
        }
      }
      if (extra < 0.22) { // a cloth awning on two poles
        const cloth = extra < 0.08 ? B.awningRed : B.awning;
        cloth.quad(F.P(s0 - 0.1, top + 0.55, 0.02), F.P(s1 + 0.1, top + 0.55, 0.02), F.P(s1 + 0.1, top - 0.2, 1.5), F.P(s0 - 0.1, top - 0.2, 1.5));
        for (const u of [s0, s1]) fbox(B.wood, F, u - 0.035, u + 0.035, g - 0.2, top - 0.2, 1.42, 1.49);
      }
    }
    // the floors above
    for (let st = 1; st < storeys; st++) {
      const y0 = gy + (st - 1) * 3.1, sh = R(), small = st === storeys - 1 && storeys > 3;
      const ww = small ? 0.75 : 0.95, wh = small ? 1.0 : 1.4, sl = small ? 1.3 : 1.0;
      bay(ctx, at(ub), at(ue), y0, y0 + 3.1, ref, { kind: bl < 1.8 ? 'blank' : 'window', mat: name, pil: false, cornice: false, ww, wh, sill: sl, depth: 0.32, uo: ub });
      if (bl < 1.8) continue;
      const w0 = ub + (bl - ww) / 2, w1 = w0 + ww, v0 = y0 + sl, v1 = v0 + wh;
      if (sh < 0.3) { for (const [a, b] of [[w0, (w0 + w1) / 2 - 0.01], [(w0 + w1) / 2 + 0.01, w1]]) B.wood.quad(F.P(a, v0, -0.1), F.P(b, v0, -0.1), F.P(b, v1, -0.1), F.P(a, v1, -0.1)); } // shutters closed
      else if (sh < 0.75) { fbox(B.wood, F, w0 - ww / 2 - 0.03, w0 - 0.03, v0, v1, 0, 0.045); fbox(B.wood, F, w1 + 0.03, w1 + ww / 2 + 0.03, v0, v1, 0, 0.045); } // folded back
      else if (sh < 0.83) fbox(B.wood, F, w0, w1, v0 - 0.02, v1, 0.02, 0.07); // a hinged board propped shut
    }
  }
  fbox(W, F, 0, L, gy - 0.14, gy + 0.1, 0, 0.13); // string course over the shops
  fbox(W, F, 0, L, yt - 0.3, yt, 0, 0.2);          // and a plain cornice under the eaves
}

// The raised pavement along a street front: kerb and walkway following the slope of the street,
// here and there a pair of stepping stones for crossing in the wet, and at some corners a
// public fountain, a stone trough fed from a spout.
function pavement(ctx, terrain, A, Bp, ref, { e0, e1, seed }) {
  const B = ctx.bufs, F = frame(A, Bp, 0, ref), W = 1.15, R = mulberry32(seed + 5);
  const u0 = e0 ? -W : 0, u1 = F.L + (e1 ? W : 0), n = Math.max(1, Math.round((u1 - u0) / 2.2));
  const hAt = (u, w) => { const p = F.P(u, 0, w), g = ctx.toWorld(p[0], 0, p[2]); return terrain.h(g[0], g[2]); };
  const st = [];
  for (let i = 0; i <= n; i++) { const u = u0 + ((u1 - u0) * i) / n; st.push([u, Math.max(hAt(u, 0), hAt(u, W)) + 0.22]); }
  for (let i = 0; i < n; i++) {
    const [ua, ya] = st[i], [ub, yb] = st[i + 1];
    B.stone.quad(F.P(ua, ya, W - 0.3), F.P(ub, yb, W - 0.3), F.P(ub, yb, 0), F.P(ua, ya, 0));                 // walkway
    B.travertine.quad(F.P(ua, ya, W), F.P(ub - 0.03, yb, W), F.P(ub - 0.03, yb, W - 0.3), F.P(ua, ya, W - 0.3)); // kerb stones, a joint between each
    B.travertine.quad(F.P(ua, ya - 0.8, W), F.P(ub - 0.03, yb - 0.8, W), F.P(ub - 0.03, yb, W), F.P(ua, ya, W));
  }
  for (const [u, y] of [st[0], st[n]]) B.travertine.quad(F.P(u, y - 0.8, 0), F.P(u, y - 0.8, W), F.P(u, y, W), F.P(u, y, 0));
  const fountain = e0 && R() < 0.3, stones = R() < 0.3 && F.L > 7;
  if (stones) {
    const us = 2.5 + R() * (F.L - 5);
    for (const w of [W + 0.8, W + 2.05]) {
      const y = hAt(us, w);
      fbox(B.travertine, F, us - 0.45, us + 0.45, y - 0.3, y + 0.24, w - 0.34, w + 0.34);
      B.travertine.quad(F.P(us - 0.45, y - 0.3, w - 0.34), F.P(us + 0.45, y - 0.3, w - 0.34), F.P(us + 0.45, y + 0.24, w - 0.34), F.P(us - 0.45, y + 0.24, w - 0.34));
    }
  }
  if (fountain) {
    const c = F.P(u0 + 1.3, 0, W + 0.45), y = hAt(u0 + 1.3, W + 0.45);
    ctx.push(c[0], c[2], Math.atan2(-F.tz, F.tx));
    trough(ctx, y);
    ctx.pop();
  }
}

// A public fountain in the current frame: a stone trough of water with a pier and spout behind.
function trough(ctx, y) {
  const B = ctx.bufs;
    for (const s of [-1, 1]) {
      box(B.travertine, -0.95, 0.95, y - 0.4, y + 0.8, s > 0 ? 0.5 : -0.65, s > 0 ? 0.65 : -0.5);
      box(B.travertine, s > 0 ? 0.8 : -0.95, s > 0 ? 0.95 : -0.8, y - 0.4, y + 0.8, -0.5, 0.5);
    }
    B.pool.quad([-0.8, y + 0.64, 0.5], [0.8, y + 0.64, 0.5], [0.8, y + 0.64, -0.5], [-0.8, y + 0.64, -0.5]);
    box(B.travertine, -0.22, 0.22, y + 0.8, y + 1.5, -0.65, -0.42);
    box(B.travertine, -0.28, 0.28, y + 1.5, y + 1.58, -0.7, -0.38, { bottom: true });
    box(B.bronze, -0.045, 0.045, y + 1.08, y + 1.16, -0.42, -0.2);
    box(B.pool, -0.02, 0.02, y + 0.64, y + 1.1, -0.235, -0.205, { top: false });
    ctx.solid(-0.95, 0.95, -0.65, 0.65, y + 0.8);
}

// The main roads get a kerb and a raised pavement down each side, stepping stones across at
// intervals, and now and then a fountain. Nothing is built where a road runs through a
// monument's precinct, meets another road, or where a building already stands.
export function buildStreets(ctx, terrain, solids, roads, rng) {
  const B = ctx.bufs, K = 0.25, W = 1.0;
  ctx.begin(0, 0, 0, 0);
  for (const road of roads) {
    // stations every couple of metres along the road
    const st = [];
    for (let i = 0; i < road.pts.length - 1; i++) {
      const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2.2));
      for (let k = i ? 1 : 0; k <= n; k++) st.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    const N = st.length, tan = st.map((p, i) => { const a = st[Math.max(i - 2, 0)], b = st[Math.min(i + 2, N - 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; });
    const others = roads.filter((r) => r !== road);
    const free = (x, z) => !terrain.padAt(x, z, 2) && !solids.inside(x, z) && terrain.riverDist(x, z) > 50 && others.every((r) => polyDist(x, z, r.pts) > r.w / 2 + 2.5);
    const okBoth = new Array(N).fill(true);
    for (const side of [-1, 1]) {
      const at = (i, o) => [st[i][0] + tan[i][1] * side * o, st[i][1] - tan[i][0] * side * o];
      const o0 = road.w / 2 + K, o1 = o0 + W;
      const ok = st.map((_, i) => { const m = at(i, (o0 + o1) / 2), e = at(i, o1 + 0.3); return free(m[0], m[1]) && free(e[0], e[1]); });
      const P = st.map((_, i) => { const a = at(i, o0), k = at(i, o0 + 0.3), b = at(i, o1), y = Math.max(terrain.h(a[0], a[1]), terrain.h(b[0], b[1])) + 0.22; return { a, k, b, y }; });
      const cap = (p) => B.travertine.quad([p.a[0], p.y - 0.8, p.a[1]], [p.b[0], p.y - 0.8, p.b[1]], [p.b[0], p.y, p.b[1]], [p.a[0], p.y, p.a[1]]);
      for (let i = 0; i < N; i++) {
        if (!ok[i]) okBoth[i] = false;
        if (i === N - 1 || !ok[i] || !ok[i + 1]) continue;
        const p = P[i], q2 = P[i + 1];
        B.stone.quad([p.k[0], p.y, p.k[1]], [q2.k[0], q2.y, q2.k[1]], [q2.b[0], q2.y, q2.b[1]], [p.b[0], p.y, p.b[1]]);
        B.travertine.quad([p.a[0], p.y, p.a[1]], [q2.a[0] - tan[i][0] * 0.03, q2.y, q2.a[1] - tan[i][1] * 0.03], [q2.k[0] - tan[i][0] * 0.03, q2.y, q2.k[1] - tan[i][1] * 0.03], [p.k[0], p.y, p.k[1]]);
        B.travertine.quad([p.a[0], p.y - 0.8, p.a[1]], [q2.a[0] - tan[i][0] * 0.03, q2.y - 0.8, q2.a[1] - tan[i][1] * 0.03], [q2.a[0] - tan[i][0] * 0.03, q2.y, q2.a[1] - tan[i][1] * 0.03], [p.a[0], p.y, p.a[1]]);
        B.stone.quad([p.b[0], p.y - 0.8, p.b[1]], [q2.b[0], q2.y - 0.8, q2.b[1]], [q2.b[0], q2.y, q2.b[1]], [p.b[0], p.y, p.b[1]]);
        if (i === 0 || !ok[i - 1]) cap(p);
        if (i + 2 >= N || !ok[i + 2]) cap(q2);
        // a fountain against the pavement every so often
        if (i % 55 === (side > 0 ? 20 : 47) && ok[Math.max(i - 1, 0)]) {
          const c = at(i, o1 + 0.75), y = terrain.h(c[0], c[1]);
          if (free(c[0], c[1]) && free(...at(i, o1 + 1.6))) { ctx.push(c[0], c[1], Math.atan2(-tan[i][1], tan[i][0]) + (side > 0 ? 0 : Math.PI)); trough(ctx, y); ctx.pop(); }
        }
      }
    }
    // stepping stones from pavement to pavement
    for (let i = 14; i < N - 4; i += 21) {
      if (!okBoth[i] || !okBoth[i + 1]) continue;
      const n = Math.round(road.w / 1.7), r = Math.atan2(-tan[i][1], tan[i][0]);
      for (let k = 0; k < n; k++) {
        const o = -road.w / 2 + (road.w * (k + 0.5)) / n, x = st[i][0] + tan[i][1] * o, z = st[i][1] - tan[i][0] * o, y = terrain.h(x, z);
        ctx.push(x, z, r); box(B.travertine, -0.48, 0.48, y - 0.3, y + 0.24, -0.36, 0.36); ctx.pop();
      }
    }
  }

  // The open squares: honorific statues on pedestals, columns carrying a gilded figure, and
  // altars, set out on a loose grid wherever the paving is clear.
  for (const zn of terrain.pads.filter((p) => p.zone)) {
    const G = 24;
    for (let lx = -zn.hw + 8; lx <= zn.hw - 8; lx += G) for (let lz = -zn.hd + 8; lz <= zn.hd - 8; lz += G) {
      const jx = lx + (rng() - 0.5) * 9, jz = lz + (rng() - 0.5) * 9, pick = rng(), kind = Math.floor(rng() * 4);
      const x = zn.cx + jx * zn.cos + jz * zn.sin, z = zn.cz - jx * zn.sin + jz * zn.cos;
      let clear = pick < 0.6 && terrain.roadDist(x, z) > 3;
      // (the Forum's own open square counts as clear paving)
      for (let a = 0; a < 8 && clear; a++) { const cx = x + Math.cos(a * 0.785) * 4.5, cz2 = z + Math.sin(a * 0.785) * 4.5, pd = terrain.padAt(cx, cz2, 4); if (solids.inside(cx, cz2) || (pd && !pd.zone && pd.id !== 'forum')) clear = false; }
      if (!clear || solids.inside(x, z)) continue;
      const y = terrain.h(x, z);
      ctx.begin(x, 0, z, zn.a + (jx > 0 ? Math.PI / 2 : -Math.PI / 2)); // facing in across the square
      if (pick < 0.36) { // a statue on a tall pedestal with a bronze inscription plate
        box(B.fine, -0.85, 0.85, y - 0.3, y + 0.25, -0.85, 0.85); box(B.ashlar, -0.62, 0.62, y + 0.25, y + 1.95, -0.62, 0.62);
        box(B.fine, -0.8, 0.8, y + 1.95, y + 2.15, -0.8, 0.8, { bottom: true });
        box(B.bronze, -0.42, 0.42, y + 0.85, y + 1.5, 0.62, 0.64);
        statue(B, 0, y + 2.15, 0, 2.5, 0, kind);
        ctx.solid(-0.85, 0.85, -0.85, 0.85, y + 2.15);
      } else if (pick < 0.48) { // an honorary column
        box(B.fine, -1.1, 1.1, y - 0.3, y + 0.3, -1.1, 1.1); box(B.ashlar, -0.85, 0.85, y + 0.3, y + 1.5, -0.85, 0.85);
        box(B.fine, -1.0, 1.0, y + 1.5, y + 1.7, -1.0, 1.0, { bottom: true });
        ctx.column(0, y + 1.7, 0, 9.5, 1.05, 0, true);
        box(B.fine, -0.5, 0.5, y + 11.2, y + 11.5, -0.5, 0.5, { bottom: true });
        statue({ fine: B.gold, bronze: B.gold, gold: B.gold }, 0, y + 11.5, 0, 2.4, 0, kind);
        ctx.solid(-1.1, 1.1, -1.1, 1.1, y + 1.7);
      } else { // an altar on a step
        box(B.fine, -1.5, 1.5, y - 0.3, y + 0.22, -1.1, 1.1); box(B.fine, -1.0, 1.0, y + 0.22, y + 1.25, -0.6, 0.6);
        box(B.fine, -1.12, 1.12, y + 1.25, y + 1.4, -0.72, 0.72, { bottom: true });
        for (const sx of [-1, 1]) box(B.fine, sx * 0.95 - 0.17, sx * 0.95 + 0.17, y + 1.4, y + 1.62, -0.72, 0.72);
        box(B.gold, -0.5, 0.5, y + 0.55, y + 0.95, 0.6, 0.62);
        ctx.solid(-1.5, 1.5, -1.1, 1.1, y + 1.4);
      }
    }
  }
}
