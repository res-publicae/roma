import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GeoBuf, drawStatue } from './geobuf.js';
import { statue as nearStatue } from './statue-near.js';

// Statues as instances, with two levels of detail. Every statue recorded during the build
// (ctx.statues: position, height, facing, role, materials) is drawn as one instance of a template
// built once per role, at unit height facing +z. Far away that is the simple turned figure; within
// NEAR metres of the viewer it is swapped for the detailed one. A few hundred statues of a few
// hundred triangles each are cheap; only the handful near the viewer pay for detail, so the
// detailed version can be as fine as a simplified scan.
const NEAR = 45, MOVE = 1.5;

// Roles that have a sculpted mesh (models/statues/<name>-near.glb and -far.glb, 1 unit tall,
// soles at the origin, facing +z, made from a photograph: see models/statues/README.md). They
// replace the procedural figure for that role once loaded; roles without one, or whose file is
// missing, keep it. Riders and small figures keep it on purpose: the sculptures all stand.
const MESHES = {
  magistrate: 'togatus', general: 'prima-porta', woman: 'herculaneum-woman', priest: 'via-labicana',
  dacian: 'dacian', caryatid: 'caryatid',
};

// One kind, drawn by `gen` at the origin, split by role: 'body' (marble, bronze or gold) and
// 'spear' (the second material some kinds carry). Faces with an invalid point are dropped.
function template(gen, kind) {
  const ctx = { matrix: new THREE.Matrix4() }, dummy = new THREE.MeshBasicMaterial();
  const body = new GeoBuf(ctx, dummy, 1), spear = new GeoBuf(ctx, dummy, 1);
  gen(kind === 1 ? { fine: body, bronze: body, gold: spear } : { fine: body, bronze: spear, gold: spear }, 0, 0, 0, 1, 0, kind);
  const merge = (buf) => {
    const gs = buf.build('t').map((m) => m.geometry);
    if (!gs.length) return null;
    const g = gs.length > 1 ? mergeGeometries(gs) : gs[0], pos = g.getAttribute('position').array, idx = g.index.array, keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      if ([idx[i], idx[i + 1], idx[i + 2]].every((v) => Number.isFinite(pos[v * 3]) && Number.isFinite(pos[v * 3 + 1]) && Number.isFinite(pos[v * 3 + 2]))) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) pos[i] = 0;
    g.setIndex(keep); g.computeBoundingSphere();
    return g;
  };
  return { body: merge(body), spear: merge(spear) };
}

export function buildStatues(ctx) {
  const group = new THREE.Group(), list = ctx.statues;
  const far = [0, 1, 2, 3].map((k) => template(drawStatue, k)), near = [0, 1, 2, 3].map((k) => template(nearStatue, k));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const place = (st) => { q.setFromAxisAngle(up, st.face); return m.compose(v.set(st.x, st.y, st.z), q, sc.set(st.h, st.h, st.h)); };

  // one group of meshes per (role, body material, spear material)
  const groups = new Map();
  list.forEach((st) => {
    const key = `${st.role}|${st.body.uuid}|${st.spear.uuid}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { role: st.role, kind: st.kind, body: st.body, spear: st.spear, items: [] }));
    g.items.push(st);
  });
  const meshes = [];
  for (const g of groups.values()) {
    const mk = (geom, mat, n) => {
      if (!geom) return null;
      const im = new THREE.InstancedMesh(geom, mat, n);
      im.castShadow = im.receiveShadow = true; im.name = 'statues'; group.add(im);
      return im;
    };
    g.far = [mk(far[g.kind].body, g.body, g.items.length), mk(far[g.kind].spear, g.spear, g.items.length)].filter(Boolean);
    g.near = [mk(near[g.kind].body, g.body, g.items.length), mk(near[g.kind].spear, g.spear, g.items.length)].filter(Boolean);
    g.items.forEach((st, i) => { place(st); for (const im of g.far) im.setMatrixAt(i, m); });
    for (const im of g.far) im.computeBoundingSphere();
    for (const im of g.near) im.count = 0;
    meshes.push(g);
  }

  // Each frame (when the viewer has moved): statues within NEAR metres go into the detailed meshes
  // and are hidden in the simple ones.
  let lx = Infinity, lz = Infinity;
  group.userData.lod = (p) => {
    if (Math.hypot(p.x - lx, p.z - lz) < MOVE) return;
    lx = p.x; lz = p.z;
    for (const g of meshes) {
      let n = 0;
      g.items.forEach((st, i) => {
        const close = Math.hypot(st.x - p.x, st.z - p.z, (st.y - p.y) * 0.5) < NEAR;
        for (const im of g.far) im.setMatrixAt(i, close ? zero : place(st));
        if (close) { place(st); for (const im of g.near) im.setMatrixAt(n, m); n++; }
      });
      for (const im of g.far) im.instanceMatrix.needsUpdate = true;
      for (const im of g.near) { im.count = n; im.instanceMatrix.needsUpdate = true; if (n) im.computeBoundingSphere(); }
    }
  };
  // swap in the sculpted meshes as they arrive (the city is usable meanwhile)
  const loader = new GLTFLoader();
  const geometryOf = async (url) => {
    const gltf = await loader.loadAsync(url), gs = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); gs.push(g.index ? g.toNonIndexed() : g); } });
    const g = gs.length > 1 ? mergeGeometries(gs) : gs[0];
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    // A zero-length normal (faces that cancel out) makes the lighting NaN, and bloom spreads one
    // NaN pixel into a black square: give such vertices their face's normal instead.
    const nrm = g.getAttribute('normal'), pos = g.getAttribute('position'), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < nrm.count; i++) {
      const x = nrm.getX(i), y = nrm.getY(i), z = nrm.getZ(i), l = Math.hypot(x, y, z);
      if (Number.isFinite(l) && l > 1e-6) continue;
      const f = i - (i % 3); a.fromBufferAttribute(pos, f); b.fromBufferAttribute(pos, f + 1); c.fromBufferAttribute(pos, f + 2);
      const n = b.sub(a).cross(c.sub(a)); if (n.lengthSq() < 1e-20) n.set(0, 1, 0); n.normalize();
      nrm.setXYZ(i, n.x, n.y, n.z);
    }
    g.computeBoundingSphere();
    return g;
  };
  group.userData.loaded = Promise.all(Object.entries(MESHES).filter(([role]) => meshes.some((g) => g.role === role)).map(async ([role, name]) => {
    try {
      const [n, f] = await Promise.all([geometryOf(`models/statues/${name}-near.glb`), geometryOf(`models/statues/${name}-far.glb`)]);
      for (const g of meshes) {
        if (g.role !== role) continue;
        for (const [ims, geom] of [[g.near, n], [g.far, f]]) {
          ims[0].geometry = geom; ims[0].boundingSphere = null;  // the body
          if (ims[0].count) ims[0].computeBoundingSphere();
          for (const im of ims.slice(1)) im.visible = false;     // the sculpture has no separate spear
        }
      }
      tris[role] = { near: n.attributes.position.count / 3, far: f.attributes.position.count / 3 };
    } catch (e) { console.warn('statue mesh not loaded:', name, e.message); }
  }));
  const tris = {};
  group.userData.meshTris = tris;
  group.userData.count = list.length;
  group.userData.roles = Object.fromEntries([...new Set(list.map((st) => st.role))].map((r) => [r, list.filter((st) => st.role === r).length]));
  group.userData.triangles = (lod) => [0, 1, 2, 3].map((k) => (lod[k].body?.index.count ?? 0) / 3 + (lod[k].spear?.index.count ?? 0) / 3);
  group.userData.tris = { far: group.userData.triangles(far), near: group.userData.triangles(near) };
  return group;
}
