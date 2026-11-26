// Seeded randomness and smooth noise for the Skyharbor world.
// One clear job: deterministic numbers only. The same seed must build the same
// hills, fields, rivers and clouds on every run, so screenshots and replays
// agree and the harness runs stay byte-identical in what they hand in.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashCell(cx, cz, seed) {
  let h = (cx * 374761393 + cz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothStep(t) {
  return t * t * (3 - 2 * t);
}

// Value noise: hashed lattice corners, smoothly interpolated.
export function valueNoise(x, z, seed) {
  const xi = Math.floor(x); const zi = Math.floor(z);
  const xf = x - xi; const zf = z - zi;
  const a = hashCell(xi, zi, seed);
  const b = hashCell(xi + 1, zi, seed);
  const c = hashCell(xi, zi + 1, seed);
  const d = hashCell(xi + 1, zi + 1, seed);
  const u = smoothStep(xf); const v = smoothStep(zf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fractalNoise(x, z, seed, octaves) {
  let total = 0; let amp = 1; let freq = 1; let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    total += valueNoise(x * freq, z * freq, seed + i * 131) * amp;
    norm += amp; amp *= 0.5; freq *= 2.03;
  }
  return total / norm;
}

export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function wrapAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function degrees(radians) {
  return ((radians * 180) / Math.PI + 360) % 360;
}
