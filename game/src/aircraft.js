// The flight model for Kestrel-7: throttle, pitch, bank, stall and landings.
// One clear job: move the aircraft and report what happened (rings, landings,
// crashes, warnings). It never draws and never reads the keyboard directly —
// main.js hands it a small control object each step, which keeps it testable
// and keeps the screenshot staging honest.

import { CONFIG } from './config.js';
import { clamp, wrapAngle, lerp } from './random.js';
import { terrainHeight, RUNWAYS } from './world.js';

export function createAircraft() {
  return {
    x: 0, y: 4, z: -160,
    heading: 0, pitch: 0, roll: 0,
    speed: 0, throttle: 0,
    fuel: 100, damage: 0,
    onGround: true, airborne: false,
    verticalSpeed: 0, groundSpeed: 0,
    stallWarning: false, overspeedWarning: false, lowFuelWarning: false,
    landedRunway: null, lastTouchSpeed: 0, lastTouchDescent: 0,
  };
}

export function resetAircraft(plane, runwayIndex) {
  const runway = RUNWAYS[runwayIndex] ?? RUNWAYS[0];
  plane.x = runway.x;
  plane.y = terrainHeight(runway.x, runway.z - runway.length / 2 + 40) + 2;
  plane.z = runway.z - runway.length / 2 + 40;
  plane.heading = runway.heading;
  plane.pitch = 0; plane.roll = 0;
  plane.speed = 0; plane.throttle = 0;
  plane.fuel = 100; plane.damage = 0;
  plane.onGround = true; plane.airborne = false;
  plane.verticalSpeed = 0; plane.groundSpeed = 0;
  plane.stallWarning = false; plane.overspeedWarning = false; plane.lowFuelWarning = false;
  plane.landedRunway = null;
}

export function onRunway(plane, runway) {
  const half = CONFIG.world.runwayHalfWidth + 6;
  return Math.abs(plane.x - runway.x) < half && Math.abs(plane.z - runway.z) < runway.length / 2 + 10;
}

export function nearestRunway(plane) {
  let best = null; let bestDist = Infinity;
  for (const r of RUNWAYS) {
    const d = Math.hypot(plane.x - r.x, plane.z - r.z);
    if (d < bestDist) { bestDist = d; best = r; }
  }
  return { runway: best, distance: bestDist };
}

// controls: { pitch: -1..1 (pull up positive), roll: -1..1, throttle: 0..1,
//             brake: bool }  dt in seconds. Returns an array of event strings.
export function updateAircraft(plane, controls, dt) {
  const F = CONFIG.flight;
  const events = [];
  plane.throttle = clamp(controls.throttle, 0, 1);
  const targetSpeed = F.minSpeed + plane.throttle * (F.maxSpeed - F.minSpeed);
  const accel = plane.onGround ? 34 : 26;
  plane.speed += clamp(targetSpeed - plane.speed, -accel * dt * 1.4, accel * dt);

  const targetPitch = clamp(controls.pitch, -1, 1) * F.maxPitch;
  const targetRoll = clamp(controls.roll, -1, 1) * F.maxRoll;
  const pitchRate = plane.onGround ? 0.4 : F.pitchResponse;
  plane.pitch = lerp(plane.pitch, plane.onGround ? 0 : targetPitch, Math.min(1, pitchRate * dt));
  plane.roll = lerp(plane.roll, targetRoll, Math.min(1, F.rollResponse * dt));

  // A banked wing turns; a slow wing stalls and drops its nose.
  const stalled = !plane.onGround && plane.speed < F.stallSpeed;
  plane.stallWarning = stalled;
  if (stalled) plane.pitch = lerp(plane.pitch, -0.3, Math.min(1, 1.6 * dt));
  const turnRate = -plane.roll * F.turnFactor * clamp(plane.speed / F.cruiseSpeed, 0.3, 1.3);
  plane.heading = wrapAngle(plane.heading + turnRate * dt);

  const speedUnits = plane.speed * F.speedGain;
  const cosP = Math.cos(plane.pitch);
  const vx = Math.sin(plane.heading) * cosP * speedUnits;
  const vz = Math.cos(plane.heading) * cosP * speedUnits;
  let vy = Math.sin(plane.pitch) * speedUnits;
  if (stalled) vy -= 26;
  if (plane.onGround) {
    // Rolling: stay on the strip until rotation speed, then lift off.
    vy = 0;
    if (plane.speed > 78 && plane.throttle > 0.55) {
      plane.onGround = false; plane.airborne = true; events.push('takeoff');
    }
  }
  plane.verticalSpeed = vy;
  plane.x += vx * dt;
  plane.z += vz * dt;
  plane.y += vy * dt;
  plane.groundSpeed = Math.hypot(vx, vz);

  // Fuel: throttle is the bill.
  const burn = (F.fuelBurnIdle + plane.throttle * (F.fuelBurn - F.fuelBurnIdle)) * (plane.onGround ? 0.4 : 1);
  plane.fuel = Math.max(0, plane.fuel - burn * dt);
  plane.lowFuelWarning = plane.fuel < 18;
  if (plane.fuel <= 0 && plane.throttle > 0.05) {
    plane.throttle = 0.05;
    events.push('fuel-out');
  }
  plane.overspeedWarning = plane.speed > 225 && !plane.onGround;

  // Ground contact.
  const ground = terrainHeight(plane.x, plane.z);
  if (plane.y <= ground + 2) {
    plane.y = ground + 2;
    if (!plane.onGround) {
      const runway = RUNWAYS.find((r) => onRunway(plane, r));
      plane.lastTouchSpeed = plane.speed;
      plane.lastTouchDescent = -vy;
      if (runway && plane.speed < F.crashSpeed && vy > -14 && Math.abs(wrapAngle(plane.heading - runway.heading)) < 0.5) {
        plane.onGround = true; plane.airborne = false;
        plane.landedRunway = runway;
        plane.pitch = 0; plane.roll *= 0.3;
        events.push('landed');
      } else {
        plane.damage = 100;
        events.push('crashed');
      }
    } else {
      plane.onGround = true;
    }
    if (plane.onGround && controls.brake) plane.speed = Math.max(0, plane.speed - 55 * dt);
    if (plane.onGround) plane.speed = Math.min(plane.speed, 120);
  }
  if (plane.damage >= 100) events.push('destroyed');
  return events;
}

export function applyStormDamage(plane, dt, insideStorm) {
  if (!insideStorm) return false;
  plane.damage = Math.min(100, plane.damage + 9 * dt);
  return plane.damage >= 100;
}
