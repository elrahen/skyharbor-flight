// Skyharbor Flight — tuning, palette and mission definitions.
// One clear job: every number the rest of the game balances against lives here,
// so the flight model, the world and the missions can be tuned without hunting
// through rendering or input code. All names, places and aircraft are original.

export const CONFIG = {
  canvas: { minWidth: 640, minHeight: 360 },
  flight: {
    minSpeed: 38,          // knots: below this the wing stops flying
    cruiseSpeed: 130,
    maxSpeed: 248,         // knots: past this the airframe complains
    speedGain: 0.55,       // world units per second per knot
    throttleResponse: 0.55,
    pitchResponse: 1.55,   // radians per second toward the commanded pitch
    rollResponse: 2.4,
    maxPitch: 0.52,        // about 30 degrees up or down
    maxRoll: 1.05,         // about 60 degrees of bank
    turnFactor: 0.62,      // heading change per second per radian of bank
    stallSpeed: 58,
    fuelBurn: 0.055,       // percent per second at full throttle
    fuelBurnIdle: 0.012,
    damageOnHardTouch: 22,
    crashSpeed: 95,        // touching terrain above this speed is a crash
  },
  camera: { focalScale: 0.92, horizonFraction: 0.44 },
  world: {
    seed: 20261126,
    gridRows: 34,
    gridCols: 25,
    farDepth: 1250,
    nearDepth: 5,
    hillHeight: 26,
    runwayHalfWidth: 17,
  },
  scoring: {
    ringPoints: 150,
    landingPoints: 400,
    beaconPoints: 500,
    smoothLandingBonus: 150,
    timeBonusPerSecond: 2,
  },
};

export const PALETTE = {
  skyTop: '#2e6fb8',
  skyMid: '#7db3e8',
  skyHorizon: '#f2c98a',
  dawnTop: '#3a4a8f',
  dawnHorizon: '#ff9e5e',
  sea: '#2f7fb8',
  fieldA: '#7fae4e',
  fieldB: '#a8b84a',
  fieldC: '#5d9440',
  fieldD: '#c9b458',
  forest: '#3d6b34',
  rock: '#8a7f74',
  sand: '#d9c48f',
  road: '#6f6f72',
  runway: '#3c3f45',
  runwayMark: '#f5f2e6',
  ring: '#ffb400',
  ringGlow: '#ffe27a',
  panel: '#1c222c',
  panelEdge: '#39434f',
  gaugeFace: '#101820',
  gaugeLit: '#ffd27a',
  gaugeGreen: '#7dffb0',
  gaugeRed: '#ff5a4e',
  hudText: '#ffffff',
  hudShadow: 'rgba(10,20,35,0.85)',
};

export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run over Coral Fields',
    short: 'Ring Run',
    briefing: 'Thread 10 golden rings above the coral fields. Keep speed between 90 and 190 knots — smooth, steady flying scores best.',
    goal: 'Fly through all 10 rings',
    ringCount: 10,
    startRunway: 0,
  },
  {
    id: 'three-strip-hop',
    name: 'Three-Strip Hop',
    short: 'Three-Strip Hop',
    briefing: 'Touch down gently on three island strips in order, then return home. A gentle touchdown under 90 knots earns the smooth bonus.',
    goal: 'Land on all 3 strips, then home',
    ringCount: 0,
    startRunway: 0,
  },
  {
    id: 'beacon-rescue',
    name: 'Beacon Rescue in the Storm',
    short: 'Beacon Rescue',
    briefing: 'Reach the storm beacon on Gull Rock, then land back at Skyharbor. Storm cells hurt the airframe — give the dark clouds room.',
    goal: 'Reach the beacon, then land home',
    ringCount: 0,
    startRunway: 0,
  },
];

export const AIRCRAFT_NAME = 'Kestrel-7';
export const HOME_FIELD = 'Skyharbor Field';
export const GAME_TITLE = 'Skyharbor Flight';
