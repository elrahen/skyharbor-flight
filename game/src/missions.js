// Missions for Skyharbor Flight: objectives, progress and scoring.
// One clear job: given the aircraft and the world, say what the pilot still
// has to do, what just happened, and when a sortie is complete. Rendering and
// input never decide mission rules; this file does.

import { CONFIG, MISSIONS } from './config.js';
import { RUNWAYS, BEACON, ringCourse, makeStormCells } from './world.js';
import { degrees } from './random.js';

export function buildMission(missionIndex) {
  const def = MISSIONS[missionIndex] ?? MISSIONS[0];
  const mission = {
    index: missionIndex,
    def,
    rings: def.ringCount ? ringCourse(def.ringCount) : [],
    ringsPassed: 0,
    landings: [],          // runway ids touched, in order
    requiredLandings: [],
    beaconReached: false,
    stormCells: missionIndex === 2 ? makeStormCells() : [],
    startedAt: 0,
    elapsed: 0,
    complete: false,
    message: def.briefing,
    messageUntil: 0,
  };
  if (missionIndex === 1) mission.requiredLandings = ['coral', 'gull', 'palm', 'home'];
  return mission;
}

export function nextTarget(mission) {
  if (mission.index === 0) {
    return mission.rings.find((r) => !r.passed) ?? null;
  }
  if (mission.index === 1) {
    const nextId = mission.requiredLandings[mission.landings.length];
    if (!nextId) return null;
    return RUNWAYS.find((r) => r.id === nextId) ?? null;
  }
  if (mission.index === 2) {
    if (!mission.beaconReached) return { ...BEACON, kind: 'beacon' };
    return RUNWAYS[0];
  }
  return null;
}

export function targetLabel(mission, target) {
  if (!target) return 'Sortie complete';
  if (mission.index === 0) return `Ring ${target.index + 1} of ${mission.rings.length}`;
  if (mission.index === 1) return `Land at ${target.name}`;
  if (target.kind === 'beacon') return 'Reach the Gull Rock beacon';
  return 'Land back at Skyharbor';
}

export function distanceToTarget(plane, mission) {
  const target = nextTarget(mission);
  if (!target) return 0;
  const ty = target.y ?? 60;
  return Math.hypot(plane.x - target.x, plane.y - ty, plane.z - target.z);
}

export function bearingToTarget(plane, mission) {
  const target = nextTarget(mission);
  if (!target) return 0;
  const dx = target.x - plane.x; const dz = target.z - plane.z;
  return degrees(Math.atan2(dx, dz));
}

// Called every frame with the flight model's events. Returns new messages.
export function updateMission(mission, plane, events, now) {
  const notes = [];
  for (const event of events) {
    if (event === 'takeoff') notes.push('Airborne — gear up, eyes on the course.');
    if (event === 'fuel-out') notes.push('Fuel exhausted — glide her down gently.');
  }
  // Rings: crossing the ring plane within its radius counts.
  if (mission.index === 0) {
    for (const ring of mission.rings) {
      if (ring.passed) continue;
      const dx = plane.x - ring.x; const dz = plane.z - ring.z; const dy = plane.y - ring.y;
      if (Math.hypot(dx, dy) < ring.radius && Math.abs(dz) < 26) {
        ring.passed = true; mission.ringsPassed += 1;
        notes.push(`Ring ${ring.index + 1} — ${CONFIG.scoring.ringPoints} points!`);
      }
    }
    if (mission.ringsPassed >= mission.rings.length && !mission.complete) {
      mission.complete = true;
      notes.push('All rings flown — sortie complete! Land at Skyharbor when ready.');
    }
  }
  // Landings: the flight model reports 'landed' with the runway on the plane.
  if (events.includes('landed') && plane.landedRunway) {
    const runway = plane.landedRunway;
    if (mission.index === 1) {
      const expected = mission.requiredLandings[mission.landings.length];
      if (runway.id === expected) {
        mission.landings.push(runway.id);
        const gentle = plane.lastTouchSpeed < 90 && plane.lastTouchDescent < 9;
        notes.push(gentle
          ? `Smooth touchdown at ${runway.name} — ${CONFIG.scoring.landingPoints + CONFIG.scoring.smoothLandingBonus} points!`
          : `Down at ${runway.name} — ${CONFIG.scoring.landingPoints} points. Softer next time.`);
        if (mission.landings.length >= mission.requiredLandings.length) mission.complete = true;
      } else {
        notes.push(`That was ${runway.name} — the course wants ${expected === 'home' ? 'Skyharbor' : expected} next.`);
      }
    } else {
      notes.push(`Landed at ${runway.name}.`);
      if (mission.index === 2 && mission.beaconReached && runway.id === 'home') mission.complete = true;
      if (mission.index === 0 && mission.complete) { /* already scored */ }
    }
  }
  // Beacon: fly within 60 units of the tower top.
  if (mission.index === 2 && !mission.beaconReached) {
    const d = Math.hypot(plane.x - BEACON.x, plane.y - BEACON.y, plane.z - BEACON.z);
    if (d < 70) {
      mission.beaconReached = true;
      notes.push(`Beacon reached — ${CONFIG.scoring.beaconPoints} points! Now land at Skyharbor.`);
    }
  }
  if (notes.length) {
    mission.message = notes[notes.length - 1];
    mission.messageUntil = now + 5;
  }
  return notes;
}

export function missionScore(mission, plane) {
  let score = mission.ringsPassed * CONFIG.scoring.ringPoints;
  score += mission.landings.length * CONFIG.scoring.landingPoints;
  if (mission.beaconReached) score += CONFIG.scoring.beaconPoints;
  if (mission.complete) score += Math.max(0, 600 - Math.floor(mission.elapsed) * CONFIG.scoring.timeBonusPerSecond);
  score = Math.max(0, score - Math.floor(plane.damage * 0.6));
  return score;
}

export function missionProgressText(mission) {
  if (mission.index === 0) return `Rings ${mission.ringsPassed}/${mission.rings.length}`;
  if (mission.index === 1) return `Strips ${mission.landings.length}/${mission.requiredLandings.length}`;
  return mission.beaconReached ? 'Beacon reached — land home' : 'Beacon not reached';
}
