// Skyharbor Flight — the game loop and state machine.
// One clear job: own the state, step the flight model and the mission each
// frame, route keyboard/mouse/shot-mode decisions, and ask render.js to paint.
// All rules live in aircraft.js and missions.js; all pixels in render.js.

import { CONFIG, MISSIONS } from './config.js';
import { createAircraft, resetAircraft, updateAircraft, applyStormDamage } from './aircraft.js';
import { createInput, takeClicks, takePressed, readControls } from './input.js';
import { drawScene } from './render.js';
import { buildMission, updateMission, missionScore } from './missions.js';
import { makeClouds, makeStormCells, BEACON } from './world.js';
import { parseShotQuery, applyShot } from './shots.js';
import { ensureAudio, updateEngine, playRing, playTakeoff, playLand, playBeacon, playCrash, playWarning, toggleMute, isMuted } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

export function createGameState() {
  return {
    plane: createAircraft(),
    mission: buildMission(0),
    clouds: makeClouds(),
    mode: 'title',           // title | flying | paused | crashed | complete
    now: 0,
    elapsed: 0,
    frozen: false,
    frozenTime: 0,
    timeOfDay: 'morning',
    banner: '',
    crashReason: '',
    muted: false,
    uiButtons: [],
    shotName: null,
    stormCooldown: 0,
    warningCooldown: 0,
  };
}

const state = createGameState();
const input = createInput(canvas);

function resizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth; const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

let view = resizeCanvas();
window.addEventListener('resize', () => { view = resizeCanvas(); });

function startMission(index) {
  state.mission = buildMission(index);
  resetAircraft(state.plane, 0);
  state.mode = 'flying';
  state.elapsed = 0;
  state.banner = MISSIONS[index].short.toUpperCase();
  state.crashReason = '';
  state.mission.message = MISSIONS[index].briefing;
  state.mission.messageUntil = state.now + 6;
  state.frozen = false;
  ensureAudio();
}

function restartMission() {
  startMission(state.mission.index);
}

function insideStorm(plane) {
  for (const cell of state.mission.stormCells) {
    const d = Math.hypot(plane.x - cell.x, plane.y - cell.y, plane.z - cell.z);
    if (d < cell.r) return true;
  }
  return false;
}

function handleTitleClicks() {
  for (const click of takeClicks(input)) {
    for (const button of state.uiButtons) {
      if (click.x * view.w >= button.x && click.x * view.w <= button.x + button.width
        && click.y * view.h >= button.y && click.y * view.h <= button.y + button.height) {
        startMission(button.mission);
        return;
      }
    }
  }
}

function step(dt) {
  state.now += dt;
  if (state.mode !== 'flying') return;
  state.elapsed += dt;
  state.mission.elapsed = state.elapsed;
  const controls = readControls(input, state.plane.throttle);
  const events = updateAircraft(state.plane, controls, dt);
  if (state.mission.stormCells.length && insideStorm(state.plane)) {
    if (applyStormDamage(state.plane, dt, true)) events.push('crashed');
    if (state.stormCooldown <= 0) {
      state.mission.message = 'In the storm cell — turn away, the airframe is taking damage!';
      state.mission.messageUntil = state.now + 3;
      state.stormCooldown = 4;
      playWarning();
    }
  }
  state.stormCooldown = Math.max(0, state.stormCooldown - dt);
  const notes = updateMission(state.mission, state.plane, events, state.now);
  if (notes.some((n) => n.startsWith('Ring'))) playRing();
  if (events.includes('takeoff')) playTakeoff();
  if (events.includes('landed')) playLand();
  if (notes.some((n) => n.startsWith('Beacon'))) playBeacon();
  if (events.includes('crashed') || state.plane.damage >= 100) {
    state.mode = 'crashed';
    state.crashReason = state.plane.fuel <= 0
      ? 'Out of fuel over the fields.'
      : state.mission.stormCells.length && insideStorm(state.plane)
        ? 'The storm tore the airframe apart.'
        : 'The Kestrel met the ground too hard. Fly slower and level for a landing.';
    playCrash();
  }
  if (state.mission.complete && state.mode === 'flying') {
    // A completed sortie stays flyable; the pilot lands to bank the score.
    // Show the complete screen once they land back at home.
    if (state.plane.onGround && state.plane.landedRunway?.id === 'home') {
      state.mode = 'complete';
    }
  }
  if (state.plane.stallWarning && state.warningCooldown <= 0) {
    playWarning();
    state.warningCooldown = 3;
  }
  state.warningCooldown = Math.max(0, state.warningCooldown - dt);
  updateEngine(state.plane.throttle, state.plane.speed, state.plane.airborne);
  state.muted = isMuted();
}

function handleKeys() {
  const pressed = takePressed(input);
  // First gesture starts audio (browsers require it).
  if (pressed.size) ensureAudio();
  if (pressed.has('m') || pressed.has('M')) {
    state.muted = toggleMute();
  }
  if (state.mode === 'title') {
    if (pressed.has('1')) startMission(0);
    if (pressed.has('2')) startMission(1);
    if (pressed.has('3')) startMission(2);
    if (pressed.has('Enter')) startMission(0);
    handleTitleClicks();
    return;
  }
  if (pressed.has('p') || pressed.has('P')) {
    state.mode = state.mode === 'paused' ? 'flying' : state.mode === 'flying' ? 'paused' : state.mode;
    return;
  }
  if (pressed.has('r') || pressed.has('R')) {
    restartMission();
    return;
  }
  if (state.mode === 'crashed' || state.mode === 'complete') {
    if (pressed.has('1')) startMission(0);
    if (pressed.has('2')) startMission(1);
    if (pressed.has('3')) startMission(2);
  }
}

function frame(timestamp) {
  const dt = Math.min(0.05, (timestamp - (frame.last ?? timestamp)) / 1000 || 0.016);
  frame.last = timestamp;
  if (!state.frozen) {
    handleKeys();
    step(dt);
  }
  drawScene(ctx, state, view.w, view.h);
  if (statusEl && Math.floor(state.now) % 5 === 0) {
    statusEl.textContent = `${state.mission.def.name}. Altitude ${Math.round(state.plane.y * 22)} feet, speed ${Math.round(state.plane.speed)} knots, score ${missionScore(state.mission, state.plane)}.`;
  }
  requestAnimationFrame(frame);
}

// Screenshot staging: freeze the world in a staged, real render.
const shot = parseShotQuery(window.location.search);
if (shot) {
  applyShot(state, shot.shot);
  state.frozenTime = 2.4;
  state.now = 2.4;
  // Settle the staged state with a few fixed steps so instruments and the
  // aircraft attitude are exactly what the frozen frame shows, then hold.
  state.frozen = false;
  for (let i = 0; i < 3; i += 1) step(1 / 60);
  state.frozen = true;
  state.mission.messageUntil = 9999;
} else {
  // A living title screen: the aircraft waits on the strip, dawn light ahead.
  resetAircraft(state.plane, 0);
  state.plane.throttle = 0.3;
}

resizeCanvas();
requestAnimationFrame(frame);

// Keep the storm-cell list import used: mission 3 builds its own cells, and
// this reference documents that the world also knows where storms live.
void makeStormCells; void BEACON; void CONFIG;
