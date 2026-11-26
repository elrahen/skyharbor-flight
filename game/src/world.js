// The Skyharbor world: hills, fields, river, roads, runways, clouds and storms.
// One clear job: answer "what is the ground here?" for any world coordinate,
// and describe the fixed places (runways, beacon, storm cells) the missions use.
// Nothing here draws; render.js asks these questions and paints the answers.

import { CONFIG } from './config.js';
import { fractalNoise, hashCell, valueNoise, clamp } from './random.js';

const SEED = CONFIG.world.seed;

export const RUNWAYS = [
  { id: 'home', name: 'Skyharbor', x: 0, z: 120, length: 620, heading: 0, label: 'SKY' },
  { id: 'coral', name: 'Coral Strip', x: 780, z: 1050, length: 460, heading: 0, label: 'COR' },
  { id: 'gull', name: 'Gull Rock', x: -860, z: 1560, length: 420, heading: 0, label: 'GUL' },
  { id: 'palm', name: 'Palm Cove', x: 240, z: 2050, length: 460, heading: 0, label: 'PAL' },
];

export const BEACON = { x: -860, z: 1560, y: 150, name: 'Gull Rock Beacon' };

export function riverCentreX(z) {
  return 330 * Math.sin(z * 0.0011 + 1.2) + 120 * Math.sin(z * 0.0027);
}

export function roadCentreX(z) {
  return -300 + 180 * Math.sin(z * 0.0009 + 0.4);
}

function nearRunway(x, z) {
  for (const r of RUNWAYS) {
    const dz = Math.abs(z - r.z);
    const dx = Math.abs(x - r.x);
    if (dx < 60 && dz < r.length / 2 + 60) return true;
  }
  return false;
}

export function terrainHeight(x, z) {
  // Open sea beyond the charted islands.
  if (z > 2900 || Math.abs(x) > 2400) return -6;
  const hills = fractalNoise(x * 0.0016, z * 0.0016, SEED, 4);
  const ridge = fractalNoise(x * 0.0006 + 40, z * 0.0006, SEED + 7, 3);
  let height = 4 + hills * CONFIG.world.hillHeight + Math.max(0, ridge - 0.62) * 90;
  // The river carves a shallow valley.
  const riverDist = Math.abs(x - riverCentreX(z));
  if (riverDist < 70) height -= (1 - riverDist / 70) * 7;
  // Runway aprons are flat so landings read honestly: blend the hills down
  // to strip level over a generous apron around every runway, not just on it.
  for (const r of RUNWAYS) {
    const dx = Math.abs(x - r.x) / 170;
    const dz = Math.abs(z - r.z) / (r.length / 2 + 170);
    const d = Math.max(dx, dz);
    // On the strip itself the ground is dead flat; it eases back to the
    // hills over the apron so the strip never sits in a hollow or on a hump.
    const t = clamp((d - 0.55) / 1.15, 0, 1);
    const ease = t * t * (3 - 2 * t);
    height = 2 + (height - 2) * ease;
  }
  if (nearRunway(x, z) && height < 2) height = 2;
  return height;
}

export function landKind(x, z) {
  if (z > 2900 || Math.abs(x) > 2400) return 'sea';
  if (Math.abs(x - riverCentreX(z)) < 16) return 'river';
  if (Math.abs(x - roadCentreX(z)) < 5) return 'road';
  for (const r of RUNWAYS) {
    if (Math.abs(x - r.x) < CONFIG.world.runwayHalfWidth && Math.abs(z - r.z) < r.length / 2) return 'runway';
  }
  const h = terrainHeight(x, z);
  if (h > 52) return 'rock';
  if (h < 1.5) return 'sand';
  const cell = hashCell(Math.floor(x / 150), Math.floor(z / 150), SEED + 3);
  if (cell < 0.16) return 'forest';
  if (cell < 0.22) return 'orchard';
  const patch = valueNoise(x * 0.004, z * 0.004, SEED + 11);
  if (patch > 0.72) return 'fieldB';
  if (patch < 0.3) return 'fieldC';
  return 'fieldA';
}

export function groundColour(x, z) {
  const kind = landKind(x, z);
  switch (kind) {
    case 'sea': return [47, 127, 184];
    case 'river': return [64, 142, 196];
    case 'road': return [111, 111, 114];
    case 'runway': return [60, 63, 69];
    case 'rock': return [138, 127, 116];
    case 'sand': return [217, 196, 143];
    case 'forest': return [61, 107, 52];
    case 'orchard': return [94, 140, 66];
    case 'fieldB': return [168, 184, 74];
    case 'fieldC': return [93, 148, 64];
    default: return [127, 174, 78];
  }
}

export function makeClouds() {
  const clouds = [];
  const rngSeed = SEED + 99;
  for (let i = 0; i < 46; i += 1) {
    const cx = (hashCell(i, 7, rngSeed) - 0.5) * 4200;
    const cz = hashCell(i, 13, rngSeed) * 2800 - 200;
    const cy = 210 + hashCell(i, 21, rngSeed) * 130;
    clouds.push({ x: cx, y: cy, z: cz, r: 55 + hashCell(i, 29, rngSeed) * 85, drift: 1.5 + hashCell(i, 31, rngSeed) * 3 });
  }
  return clouds;
}

export function makeStormCells() {
  return [
    { x: -420, y: 130, z: 780, r: 130 },
    { x: 420, y: 150, z: 1250, r: 150 },
    { x: -620, y: 140, z: 1750, r: 140 },
    { x: 180, y: 120, z: 2250, r: 130 },
  ];
}

export function ringCourse(count) {
  const rings = [];
  for (let i = 0; i < count; i += 1) {
    const z = 420 + i * 250;
    const x = Math.sin(i * 0.85) * 260 + Math.sin(i * 0.31) * 60;
    const y = 110 + 26 * Math.sin(i * 1.1) + fractalNoise(i * 0.7, 3, SEED + 5, 2) * 20;
    rings.push({ x, y, z, radius: 34, passed: false, index: i });
  }
  return rings;
}

export function clampToChart(x, z) {
  return { x: clamp(x, -2350, 2350), z: clamp(z, -350, 2850) };
}
