// Small shared helpers: random numbers, noise, and map coordinates.

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const rad = (d) => (d * Math.PI) / 180;

export function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash2(xi, zi), hash2(xi + 1, zi), u), lerp(hash2(xi, zi + 1), hash2(xi + 1, zi + 1), u), v);
}
export function fbm(x, z) { return vnoise(x, z) * 0.5 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.2; }

// World frame: metres, +x east, +z south, origin between the Forum and the Colosseum.
export const LAT0 = 41.8915, LON0 = 12.488;
export function ll(lat, lon) { return [(lon - LON0) * 82870, -(lat - LAT0) * 111050]; }

// A "bearing" is degrees clockwise from north. Buildings are modelled facing local +z,
// so a building whose front faces `bearing` gets this rotation about the vertical axis.
export const rotY = (bearing) => Math.PI - rad(bearing);
export const bdir = (bearing) => [Math.sin(rad(bearing)), -Math.cos(rad(bearing))];

// World -> local for a frame at (cx, cz) rotated by a (cos, sin precomputed).
export function toLocal(x, z, cx, cz, cos, sin) { const dx = x - cx, dz = z - cz; return [dx * cos - dz * sin, dx * sin + dz * cos]; }

export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
export function polyDist(px, pz, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}
