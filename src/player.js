import { clamp, rad } from './util.js';

const EYE = 1.7, STEP = 0.75;

// First-person walker. Follows the ground, climbs steps and ramps, is stopped by walls,
// and can switch to free flight.
export class Player {
  constructor(camera, dom, terrain, solids) {
    this.camera = camera; this.dom = dom; this.terrain = terrain; this.solids = solids;
    this.x = 0; this.z = 0; this.feet = 0; this.eyeY = 0; this.yaw = 0; this.pitch = 0; this.fly = false;
    this.keys = new Set(); this.locked = false; this.enabled = false;

    addEventListener('keydown', (e) => { if (!e.metaKey && !e.ctrlKey) this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; });
    let drag = false;
    dom.addEventListener('mousedown', () => {
      if (!this.enabled) return;
      drag = true;
      if (!this.locked && dom.requestPointerLock) { try { const p = dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* drag-look still works */ } }
    });
    addEventListener('mouseup', () => { drag = false; });
    addEventListener('mousemove', (e) => {
      if (!this.enabled || !(this.locked || drag)) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = clamp(this.pitch - e.movementY * 0.0022, -1.45, 1.45);
    });
  }

  // Ground height at a point for someone whose feet are at `feet`; null if a wall is in the way.
  ground(x, z, feet) {
    let g = this.terrain.h(x, z);
    for (const s of this.solids.at(x, z)) {
      const t = s.fn(x, z);
      if (t === -Infinity) continue;
      if (s.thick !== undefined && t > feet + STEP) {
        // a slab above: it is a ceiling if there is headroom under it, a wall if not
        if (t - s.thick < feet + EYE + 0.15) return null;
        continue;
      }
      if (t > feet + STEP) return null;
      if (t > g) g = t;
    }
    return g;
  }

  teleport(x, z, bearing, flyHeight) {
    this.x = x; this.z = z; this.yaw = -rad(bearing); this.pitch = flyHeight ? -0.28 : 0;
    this.fly = !!flyHeight;
    const g = this.terrain.h(x, z);
    this.feet = flyHeight ? g + flyHeight : (this.ground(x, z, g + 0.1) ?? g);
    this.eyeY = this.feet + EYE;
  }

  update(dt) {
    const k = this.keys, run = k.has('ShiftLeft') || k.has('ShiftRight');
    if (k.has('ArrowLeft')) this.yaw += 1.6 * dt;
    if (k.has('ArrowRight')) this.yaw -= 1.6 * dt;
    let f = 0, s = 0, v = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD')) s += 1;
    if (k.has('KeyA')) s -= 1;
    if (k.has('KeyE') || k.has('Space')) v += 1;
    if (k.has('KeyQ') || k.has('KeyC')) v -= 1;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);

    if (this.fly) {
      const sp = (run ? 160 : 45) * dt, cp = Math.cos(this.pitch);
      this.x += (-sy * cp * f + cy * s) * sp;
      this.z += (-cy * cp * f - sy * s) * sp;
      this.feet += (Math.sin(this.pitch) * f + v) * sp;
      this.feet = Math.max(this.feet, this.terrain.h(this.x, this.z) + 0.3);
      this.eyeY = this.feet + EYE;
    } else {
      const sp = (run ? 13 : 4.5) * dt, len = Math.hypot(f, s) || 1;
      const dx = ((-sy * f + cy * s) / len) * sp, dz = ((-cy * f - sy * s) / len) * sp;
      if (dx || dz) {
        const stuck = this.ground(this.x, this.z, this.feet) === null;
        let g = this.ground(this.x + dx, this.z + dz, this.feet);
        if (g !== null || stuck) { this.x += dx; this.z += dz; }
        else if ((g = this.ground(this.x + dx, this.z, this.feet)) !== null) this.x += dx;
        else if ((g = this.ground(this.x, this.z + dz, this.feet)) !== null) this.z += dz;
      }
      const g = this.ground(this.x, this.z, this.feet) ?? this.terrain.h(this.x, this.z);
      this.feet = g >= this.feet ? g : Math.max(g, this.feet - 30 * dt);
      this.eyeY += (this.feet + EYE - this.eyeY) * Math.min(1, dt * 14);
    }
    const b = this.terrain.b;
    this.x = clamp(this.x, b.minX + 5, b.maxX - 5); this.z = clamp(this.z, b.minZ + 5, b.maxZ - 5);
    this.camera.position.set(this.x, this.eyeY, this.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  toggleFly() {
    this.fly = !this.fly;
    if (this.fly) this.feet += 2;
  }
}
