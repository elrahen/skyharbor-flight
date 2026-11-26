// Synthesised sound for Skyharbor Flight: no audio files, no network.
// One clear job: a Web Audio engine hum that follows the throttle, plus short
// event sounds (ring chime, touchdown thud, crash noise, beacon fanfare).
// Everything is generated with oscillators and filtered noise, and the whole
// module stays silent until the player's first gesture starts the context.

let context = null;
let engineOsc = null; let engineOsc2 = null; let engineGain = null;
let muted = false;
let noiseBuffer = null;

export function isMuted() { return muted; }

export function toggleMute() {
  muted = !muted;
  if (engineGain && context) engineGain.gain.value = muted ? 0 : 0.05;
  return muted;
}

export function ensureAudio() {
  if (context) {
    if (context.state === 'suspended') context.resume().catch(() => {});
    return true;
  }
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    context = new AudioContextClass();
    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc2 = context.createOscillator();
    engineOsc2.type = 'square';
    engineGain = context.createGain();
    engineGain.gain.value = muted ? 0 : 0.0;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 420;
    engineOsc.connect(filter); engineOsc2.connect(filter);
    filter.connect(engineGain); engineGain.connect(context.destination);
    engineOsc.start(); engineOsc2.start();
    const len = context.sampleRate * 0.5;
    noiseBuffer = context.createBuffer(1, len, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  } catch {
    return false;
  }
}

export function updateEngine(throttle, speed, airborne) {
  if (!context || !engineOsc) return;
  const t = context.currentTime;
  const base = 42 + throttle * 58 + (airborne ? speed * 0.12 : 0);
  engineOsc.frequency.setTargetAtTime(base, t, 0.08);
  engineOsc2.frequency.setTargetAtTime(base * 0.5 + 3, t, 0.08);
  engineGain.gain.setTargetAtTime(muted ? 0 : 0.028 + throttle * 0.05, t, 0.1);
}

function tone(freq, dur, type, volume, slideTo) {
  if (!context || muted) return;
  try {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type; osc.frequency.value = freq;
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + dur);
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + dur);
    osc.connect(gain); gain.connect(context.destination);
    osc.start(); osc.stop(context.currentTime + dur);
  } catch { /* sound is decoration; never break the game */ }
}

export function playRing() { tone(880, 0.28, 'sine', 0.22, 1320); tone(1320, 0.34, 'sine', 0.12, 1760); }
export function playTakeoff() { tone(220, 0.5, 'triangle', 0.16, 440); }
export function playLand() { tone(140, 0.25, 'sine', 0.25, 70); }
export function playBeacon() { tone(523, 0.18, 'sine', 0.2); setTimeout(() => tone(659, 0.18, 'sine', 0.2), 140); setTimeout(() => tone(784, 0.3, 'sine', 0.22), 280); }
export function playWarning() { tone(620, 0.16, 'square', 0.07); }

export function playCrash() {
  if (!context || muted || !noiseBuffer) return;
  try {
    const src = context.createBufferSource();
    src.buffer = noiseBuffer;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.35, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.7);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 300;
    src.connect(filter); filter.connect(gain); gain.connect(context.destination);
    src.start(); src.stop(context.currentTime + 0.7);
  } catch { /* decoration only */ }
}
