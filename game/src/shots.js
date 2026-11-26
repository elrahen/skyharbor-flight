// Screenshot staging for Skyharbor Flight.
// One clear job: when the page opens with ?shot=start|play|end, place the
// aircraft, the mission and the light in a fixed, recognisable state and freeze
// the simulation there, so the screenshots are real renders of the game's own
// code — the same draw path the player sees, with no composited overlay.
// Normal play (no ?shot) is untouched.

import { resetAircraft } from './aircraft.js';
import { buildMission } from './missions.js';
import { RUNWAYS } from './world.js';

export function parseShotQuery(search) {
  const params = new URLSearchParams(search);
  const shot = params.get('shot');
  if (!shot) return null;
  const seed = Number(params.get('seed') || '1');
  return { shot, seed: Number.isFinite(seed) ? seed : 1 };
}

export function applyShot(state, shotName) {
  const plane = state.plane;
  const mission = buildMission(0);
  state.mission = mission;
  state.mode = 'flying';
  state.frozen = true;
  state.timeOfDay = 'morning';
  mission.startedAt = 0;

  if (shotName === 'start') {
    // On the strip at Skyharbor, engine idling, runway and dawn light ahead.
    resetAircraft(plane, 0);
    plane.throttle = 0.35; plane.speed = 12;
    mission.message = 'Skyharbor Field — throttle up and roll. Rings wait over the coral fields.';
    mission.messageUntil = 9999;
    state.banner = 'SKYHARBOR FIELD';
  } else if (shotName === 'play') {
    // Mid-course: through the ring line, a golden ring dead ahead, fields below.
    resetAircraft(plane, 0);
    plane.x = 120; plane.y = 118; plane.z = 620;
    plane.heading = 0.12; plane.pitch = 0.02; plane.roll = -0.12;
    plane.speed = 148; plane.throttle = 0.62;
    plane.onGround = false; plane.airborne = true;
    mission.rings[0].passed = true; mission.ringsPassed = 1;
    mission.message = 'Ring 2 ahead — hold 140 knots and fly the gold.';
    mission.messageUntil = 9999;
    state.banner = '';
  } else {
    // Final approach: on a diagonal to the strip, so the runway lies ahead
    // and to the left, fully visible beside the aircraft rather than behind it.
    resetAircraft(plane, 0);
    plane.x = 132; plane.y = 42; plane.z = -420;
    plane.heading = -0.30; plane.pitch = -0.07; plane.roll = -0.14;
    plane.speed = 82; plane.throttle = 0.3;
    plane.onGround = false; plane.airborne = true;
    plane.fuel = 61;
    mission.rings.forEach((r) => { r.passed = true; });
    mission.ringsPassed = mission.rings.length;
    mission.complete = true;
    mission.message = 'Final approach — Skyharbor runway ahead. Ease her down.';
    mission.messageUntil = 9999;
    state.banner = 'FINAL APPROACH';
  }
  state.shotName = shotName;
  state.elapsed = shotName === 'play' ? 84 : shotName === 'end' ? 312 : 0;
  return state;
}

export function runwayApproachState(plane) {
  const home = RUNWAYS[0];
  return { x: home.x, z: home.z - home.length / 2 - 180, y: 30 };
}
