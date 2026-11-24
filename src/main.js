import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { mulberry32, rotY, rad, clamp } from './util.js';
import { makeMaterials, WEATHER, FLAME, weatherPatch } from './materials.js';
import { Terrain, Solids } from './terrain.js';
import { Ctx, BUILDERS, buildColumns } from './builders.js';
import { buildStatues } from './statues.js';
import { buildHousing, buildStreets, buildTrees } from './city.js';
import { Player } from './player.js';
import { SITES, ZONES, HILLS, LEVELS, ROADS, RIVER, BOUNDS, DISTRICTS, PLACES, YEAR } from './sites.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.52;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 1, 0.4, 9000);

// ---------- sky and light ----------
const sky = new Sky(); sky.scale.setScalar(10000); scene.add(sky);
const envScene = new THREE.Scene(), envSky = new Sky(); envSky.scale.setScalar(10000); envScene.add(envSky);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;

// The sun casts shadows through four nested shadow maps (cascades), so shadows stay sharp
// at your feet and still reach across the whole city. The last one runs to the horizon,
// because anything beyond the final cascade would receive no sunlight at all.
const SPLITS = [50, 250, 1200, 9000];
const csm = new CSM({ camera, parent: scene, cascades: 4, maxFar: 9000, mode: 'custom', shadowMapSize: 2048,
  customSplitsCallback: (n, near, far, breaks) => { for (const s of SPLITS) breaks.push(s / far); },
  lightDirection: new THREE.Vector3(-1, -1, -1).normalize(), lightIntensity: 4, lightNear: 1, lightFar: 24000, lightMargin: 600, shadowBias: -0.000004 });
csm.fade = true;
// The bias is a fraction of the shadow camera's whole depth range, which is 24 km here, so it
// must be tiny: -0.0002 meant 4.8 m, and the foot of every tree, column and wall cast no shadow,
// leaving each shadow floating several metres away from what cast it. -0.000004 is about 10 cm.
// The normal bias keeps lit surfaces free of speckle; it grows with each coarser cascade.
csm.lights.forEach((l, i) => { l.shadow.normalBias = 0.15 + i * 0.3; });

// Dust and haze, added to the finished picture from the depth of each pixel (see the haze pass).
const HAZE_GAIN = 1.5;
const HAZE = { tDiffuse: { value: null }, tDepth: { value: null }, invProj: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() },
  camPos: { value: new THREE.Vector3() }, sunDir: { value: new THREE.Vector3() }, hazeCol: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() } };

const hemi = new THREE.HemisphereLight('#bcd2ff', '#8a7a66', 0.7);
scene.add(hemi);
scene.environmentIntensity = 0.5;
// Firelight: only the four fires nearest the camera are lit at any moment, each fading out
// with distance so that the hand-over from one to the next is never seen.
const fireLights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight('#ff9238', 0, 26, 2); scene.add(l); return l; });
let fireT = 0, shadowFrame = 0, shadowFresh = 4;
function updateFires(dt) {
  fireT += dt; FLAME.uTime.value = fireT;
  const c = camera.position, near = [];
  for (const f of world.fires) {
    if (Math.abs(f[1] - c.y) > 7) continue; // not this floor
    const d = Math.hypot(f[0] - c.x, f[2] - c.z);
    if (d < 50) near.push([d, f]);
  }
  near.sort((a, b) => a[0] - b[0]);
  fireLights.forEach((l, i) => {
    const n = near[i];
    if (!n) { l.intensity = 0; return; }
    const ph = n[1][0] * 1.3 + n[1][2] * 0.7, flick = 0.86 + 0.09 * Math.sin(fireT * 11 + ph) + 0.05 * Math.sin(fireT * 23.7 + ph * 2);
    l.position.set(n[1][0], n[1][1], n[1][2]);
    l.intensity = 48 * flick * (1 - clamp((n[0] - 30) / 18, 0, 1));
  });
}
const sunDir = new THREE.Vector3();
let hour = 16.5;

function setTime(h) {
  hour = clamp(h, 6.5, 19);
  const t = (hour - 6) / 12.5, el = Math.max(Math.sin(Math.PI * t) * rad(68), rad(-4)), az = rad(90 + ((hour - 6) / 12) * 180);
  sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  const low = 1 - clamp(el / rad(35), 0, 1);
  for (const s of [sky, envSky]) {
    const u = s.material.uniforms;
    u.turbidity.value = 2.5 + low * 5; u.rayleigh.value = 1.1 + low * 1.6; u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.82;
    u.sunPosition.value.copy(sunDir);
  }
  csm.lightDirection.copy(sunDir).negate();
  const col = new THREE.Color('#fff3e0').lerp(new THREE.Color('#ff9d5c'), low * low);
  const power = 4.6 * clamp(el / rad(8), 0, 1) * (1 - low * 0.25);
  for (const l of csm.lights) { l.color.copy(col); l.intensity = power; }
  hemi.intensity = 0.4 + 0.4 * clamp(el / rad(25), 0.1, 1);
  const day = clamp(el / rad(12), 0.15, 1);
  HAZE.hazeCol.value.set('#c3d0dc').lerp(new THREE.Color('#e0b98f'), low * 0.85).multiplyScalar(HAZE_GAIN * (0.5 + 0.5 * day));
  HAZE.sunCol.value.copy(col).multiplyScalar(HAZE_GAIN * 0.9 * day);
  HAZE.sunDir.value.copy(sunDir);
  shadowFresh = 2;
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene, 0, 1, 20000);
  scene.environment = envRT.texture;
}

// ---------- post-processing: ambient occlusion, tone mapping, colour grade ----------
// The scene is drawn once into a target that keeps its depth buffer, and the ambient-occlusion
// pass works from that depth at half resolution. (The stock setup draws the whole city a
// second time just to get depth and normals, which was most of the frame.)
class ScenePass extends Pass {
  constructor() {
    super();
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1) });
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader, fragmentShader: CopyShader.fragmentShader, depthTest: false, depthWrite: false, blending: THREE.NoBlending }));
  }
  setSize(w, h) { this.rt.setSize(w, h); }
  render(r, writeBuffer) {
    r.setRenderTarget(this.rt); r.clear(); r.render(scene, camera);
    this.quad.material.uniforms.tDiffuse.value = this.rt.texture;
    r.setRenderTarget(writeBuffer); this.quad.render(r);
  }
}
const scenePass = new ScenePass();
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
composer.addPass(scenePass);
const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.setGBuffer(scenePass.rt.depthTexture); // set after construction: passing it to the constructor trips a bug in this three.js version
gtao.updateGtaoMaterial({ radius: 2.2, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: 10 });
gtao.blendIntensity = 1;
composer.addPass(gtao);
// Haze: a thin layer of dust lying over the city and a thicker, fainter one above it. How much
// of each a sightline passes through is worked out exactly, so distant buildings fade, valleys
// look dustier than hilltops, and the air glows towards the sun.
HAZE.tDepth.value = scenePass.rt.depthTexture;
const hazePass = new ShaderPass({
  uniforms: HAZE,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse, tDepth; uniform mat4 invProj, camWorld; uniform vec3 camPos, sunDir, hazeCol, sunCol; varying vec2 vUv;
    float layer(float a, float H, float y0, float dy, float t){
      float k = dy / H, e = a * exp(-max(camPos.y - y0, -H) / H);
      return e * (abs(k) < 1e-5 ? t : (1.0 - exp(clamp(-k * t, -40.0, 40.0))) / k);
    }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float d = texture2D(tDepth, vUv).x;
      vec4 v = invProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w;
      float t = length(v.xyz), sky = 1.0;
      vec3 dir = normalize((camWorld * vec4(v.xyz, 0.0)).xyz);
      if (d >= 1.0) {                                   // sky, or the plain beyond the city
        if (dir.y < -1e-4) t = min((camPos.y - 6.2) / -dir.y, 30000.0);
        else { t = 30000.0; sky = 0.3; }
      }
      float od = sky * (layer(0.00042, 55.0, 12.0, dir.y, t) + layer(0.00011, 900.0, 12.0, dir.y, t));
      float glow = pow(max(dot(dir, sunDir), 0.0), 5.0);
      vec3 haze = hazeCol + sunCol * glow * 0.55;
      gl_FragColor = vec4(mix(c.rgb, haze, 1.0 - exp(-od)), c.a);
    }`,
});
hazePass.uniforms = hazePass.material.uniforms = HAZE; // share the live values rather than a copy
composer.addPass(hazePass);
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.7, 1.6);
{ const full = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => full(Math.ceil(w / 2), Math.ceil(h / 2)); } // a glow is a blur: half resolution looks the same and costs less
// Bloom blurs and spreads its input, so a single invalid (NaN) pixel would grow into a black square:
// its first pass treats such pixels as black.
bloom.materialHighPassFilter.fragmentShader = bloom.materialHighPassFilter.fragmentShader.replace(
  'vec4 texel = texture2D( tDiffuse, vUv );',
  'vec4 texel = texture2D( tDiffuse, vUv );\n\t\t\tif ( any( isnan( texel ) ) || any( isinf( texel ) ) ) texel = vec4( 0.0 );');
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.14);                              // a little more saturation
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.4);               // gentle film contrast curve
      c *= mix(vec3(0.97, 0.99, 1.05), vec3(1.05, 1.0, 0.94), smoothstep(0.15, 0.7, l)); // cool shadows, warm lights
      float v = smoothstep(1.2, 0.35, length(vUv - 0.5) * 1.45);
      c *= mix(0.7, 1.0, v);                                  // vignette
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
}));
let post = true;

// ---------- build the city ----------
async function build() {
  const mats = await makeMaterials();
  const t0 = performance.now();
  for (const m of mats.all) {
    csm.setupMaterial(m);
    // on top of the shadow patch: the ground's own patch, and weathering where a surface has it
    const shadowPatch = m.onBeforeCompile, own = m.userData.patch, age = m.userData.weather;
    if (!own && !age) continue;
    m.onBeforeCompile = (shader, r) => { shadowPatch.call(m, shader, r); if (own) own(shader); if (age) weatherPatch(shader, age); };
    m.customProgramCacheKey = () => (own ? 'own' : '') + (age ? 'aged' : '');
  }
  const rng = mulberry32(180);

  const sites = SITES.filter((s) => s.built <= YEAR).map((s) => ({ ...s, x: s.xz[0], z: s.xz[1], a: rotY(s.bearing) }));
  const terrain = new Terrain({ bounds: BOUNDS, step: 3, levels: LEVELS, hills: HILLS, pads: [], roads: ROADS, river: RIVER });
  const pads = [];
  for (const zn of ZONES) {
    pads.push({ id: zn.id, name: zn.name, cx: zn.xz[0], cz: zn.xz[1], hw: zn.w / 2, hd: zn.d / 2, a: rotY(zn.bearing),
      ground: zn.ground ?? 0, flatten: zn.flatten !== false, blend: 10, color: zn.color, zone: true });
  }
  for (const s of sites) {
    s.ground = s.ground ?? terrain.base(s.x, s.z);
    const pp = s.pad || {}, m = pp.margin ?? 6;
    pads.push({ id: s.id, name: s.name, note: s.note, cx: s.x, cz: s.z, hw: (pp.w ?? s.p.w ?? 20) / 2 + m, hd: (pp.d ?? s.p.d ?? 20) / 2 + m, a: s.a,
      ground: s.ground, flatten: true, blend: 10, color: pp.color === undefined ? 'paved' : pp.color, ellipse: !!pp.ellipse, trees: !!pp.trees });
  }
  terrain.setPads(pads);
  scene.add(terrain.build(mats.M.ground));
  { // terrain heights as a texture, for the weathering shader
    const { nx, nz, step, H } = terrain;
    const ht = new THREE.DataTexture(Float32Array.from(H), nx, nz, THREE.RedFormat, THREE.FloatType);
    ht.minFilter = ht.magFilter = THREE.LinearFilter; ht.needsUpdate = true;
    WEATHER.wHeight.value = ht;
    WEATHER.wMap.value.set(1 / (step * nx), 1 / (step * nz), (-BOUNDS.minX / step + 0.5) / nx, (-BOUNDS.minZ / step + 0.5) / nz);
  }

  const water = new THREE.Mesh(new THREE.PlaneGeometry(BOUNDS.maxX - BOUNDS.minX, BOUNDS.maxZ - BOUNDS.minZ), mats.M.water);
  water.rotation.x = -Math.PI / 2; water.position.set((BOUNDS.minX + BOUNDS.maxX) / 2, 6.6, (BOUNDS.minZ + BOUNDS.maxZ) / 2);
  water.receiveShadow = true; scene.add(water);
  // Flat land out to the horizon so the modelled area does not end at a visible edge.
  const far = new THREE.Mesh(new THREE.CircleGeometry(9000, 48), mats.M.far);
  far.rotation.x = -Math.PI / 2; far.position.y = 6.2;
  // Drawn straight after the sky and kept out of the depth buffer: it lies under everything, and
  // at that distance depth is too coarse for ambient occlusion, which showed up as stripes.
  far.material.depthWrite = false; far.renderOrder = -1; sky.renderOrder = -2;
  scene.add(far);
  const solids = new Solids();
  const ctx = new Ctx(mats, solids);
  for (const s of sites) {
    const fn = BUILDERS[s.type];
    if (!fn) { console.warn('no builder for', s.type); continue; }
    ctx.begin(s.x, s.ground, s.z, s.a);
    fn(ctx, s.p);
  }
  const houses = buildHousing(ctx, terrain, rng, BOUNDS, DISTRICTS, PLACES.slice(0, 8).map((p) => [p[1], p[2], 400]));
  buildStreets(ctx, terrain, solids, ROADS, mulberry32(418));
  const trees = buildTrees(ctx, terrain, solids, rng, BOUNDS);

  for (const k in ctx.bufs) for (const m of ctx.bufs[k].build(k)) scene.add(m);
  const columns = buildColumns(ctx); scene.add(columns);
  const statues = buildStatues(ctx); scene.add(statues);
  for (const m of ctx.extras) scene.add(m);
  for (const m of trees.meshes) scene.add(m);

  const stats = { sites: sites.length, houses, columns: ctx.columns.length, statues: ctx.statues.length, trees: trees.count, solids: solids.count,
    photos: `${mats.photos}/${mats.photoTotal}`, ms: Math.round(performance.now() - t0) };
  console.log('Roma built', stats);
  return { terrain, solids, pads, stats, fires: ctx.fires, columns, statues };
}

// ---------- run ----------
let world, player, last = performance.now(), placeTimer = 0, frames = 0, fpsT = 0, fps = 0;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  gtao.setSize(Math.round((w * renderer.getPixelRatio()) / 2), Math.round((h * renderer.getPixelRatio()) / 2));
  camera.aspect = w / h; camera.updateProjectionMatrix();
  csm.updateFrustums();
}
addEventListener('resize', resize);

function go(i) {
  const p = PLACES[i];
  if (p) player.teleport(p[1], p[2], p[3], p[4]);
  shadowFresh = 2;
}

function updatePlace() {
  let best = null, area = Infinity;
  for (const p of world.terrain.pads) {
    if (world.terrain.padDist(p, player.x, player.z) < 12) {
      const a = p.hw * p.hd * (p.zone ? 4 : 1);
      if (a < area) { area = a; best = p; }
    }
  }
  $('place').textContent = best ? best.name : '';
  $('note').textContent = best && best.note ? best.note : '';
  const hh = Math.floor(hour), mm = Math.round((hour - hh) * 60);
  $('status').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${player.fly ? 'flying' : 'walking'} · ${fps} fps${post ? '' : ' · effects off'}`;
}

function frame(now) {
  requestAnimationFrame(frame);
  tick(now);
}

function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  player.update(dt);
  camera.updateMatrixWorld();
  csm.update();
  // The two far shadow cascades cover hundreds of metres to kilometres and barely change between
  // frames, so they are redrawn every second and every fourth frame (all of them after a jump or
  // a change of time). The near two, where movement shows, are redrawn every frame.
  shadowFrame++;
  const L = csm.lights, fresh = shadowFresh > 0;
  if (fresh) shadowFresh--;
  L[2].shadow.autoUpdate = L[3].shadow.autoUpdate = false;
  L[2].shadow.needsUpdate = fresh || shadowFrame % 2 === 0;
  L[3].shadow.needsUpdate = fresh || shadowFrame % 4 === 1;
  world.columns.userData.lod(camera.position);
  world.statues.userData.lod(camera.position);
  updateFires(dt);
  sky.position.copy(camera.position);
  HAZE.invProj.value.copy(camera.projectionMatrixInverse); HAZE.camWorld.value.copy(camera.matrixWorld); HAZE.camPos.value.copy(camera.position);
  if (post) composer.render(dt); else renderer.render(scene, camera);
  frames++; fpsT += dt; placeTimer += dt;
  if (fpsT >= 1) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
  if (placeTimer > 0.3) { placeTimer = 0; updatePlace(); }
}

async function start() {
  resize();
  setTime(hour);
  world = await build();
  player = new Player(camera, canvas, world.terrain, world.solids);
  go(0);

  const list = $('places');
  PLACES.forEach((p, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<span>${i + 1}</span>${p[0]}`;
    b.addEventListener('click', () => { go(i); b.blur(); });
    list.appendChild(b);
  });
  addEventListener('keydown', (e) => {
    if (!player.enabled) return;
    if (e.code === 'KeyF') player.toggleFly();
    else if (e.code === 'BracketRight') setTime(hour + 0.5);
    else if (e.code === 'BracketLeft') setTime(hour - 0.5);
    else if (e.code === 'KeyH') $('help').classList.toggle('hidden');
    else if (e.code === 'KeyP') post = !post;
    else if (/^Digit[1-9]$/.test(e.code)) go(+e.code.slice(5) - 1);
  });

  const s = world.stats;
  $('startmsg').textContent = `${s.sites} monuments, ${s.houses.toLocaleString()} apartment blocks and ${s.columns.toLocaleString()} columns are standing.`;
  $('go').classList.remove('hidden');
  $('start').addEventListener('click', () => { $('start').classList.add('hidden'); player.enabled = true; });

  // Debug handle; `shot` draws one frame on demand (useful when the tab is in the background).
  window.rome = { player, world, scene, renderer, camera, csm, gtao, composer, bloom, go, setTime, enter: () => $('start').click(),
    setPost: (v) => { post = v; }, shot: () => { placeTimer = 1; tick(performance.now()); } };
  requestAnimationFrame(frame);
}

setTimeout(() => {
  start().catch((err) => { console.error(err); $('startmsg').textContent = 'Could not build the city: ' + err.message; });
}, 60);
