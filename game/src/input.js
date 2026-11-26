// Keyboard and mouse input for Skyharbor Flight.
// One clear job: turn raw browser events into the small control object the
// flight model consumes, and remember clicks so the title screen can use them.
// Nothing here decides what a control means in the game; main.js does that.

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    mouseX: 0, mouseY: 0, mouseDown: false,
    mouseSteer: false,
    wheelDelta: 0,
    clicks: [],
    pressed: new Set(),
  };

  function keyName(event) {
    return event.key.length === 1 ? event.key.toLowerCase() : event.key;
  }

  window.addEventListener('keydown', (event) => {
    const name = keyName(event);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    if (!input.keys.has(name)) input.pressed.add(name);
    input.keys.add(name);
  });
  window.addEventListener('keyup', (event) => {
    input.keys.delete(keyName(event));
  });
  window.addEventListener('blur', () => {
    input.keys.clear(); input.mouseDown = false;
  });

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (event.clientX - rect.left) / rect.width;
    input.mouseY = (event.clientY - rect.top) / rect.height;
    input.mouseSteer = true;
  });
  canvas.addEventListener('mousedown', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseDown = true;
    input.clicks.push({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
  });
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    input.wheelDelta += event.deltaY > 0 ? -1 : 1;
  }, { passive: false });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return input;
}

export function takeClicks(input) {
  const clicks = input.clicks;
  input.clicks = [];
  return clicks;
}

export function takePressed(input) {
  const pressed = new Set(input.pressed);
  input.pressed.clear();
  return pressed;
}

// Build the flight-model control object from keys, mouse and wheel.
export function readControls(input, throttle) {
  let pitch = 0; let roll = 0;
  if (input.keys.has('ArrowUp') || input.keys.has('w')) pitch += 1;
  if (input.keys.has('ArrowDown') || input.keys.has('s')) pitch -= 1;
  if (input.keys.has('ArrowLeft') || input.keys.has('a')) roll -= 1;
  if (input.keys.has('ArrowRight') || input.keys.has('d')) roll += 1;
  // Gentle mouse steering: the mouse position away from centre banks and
  // pitches the aircraft, so the game is fully playable with mouse alone.
  if (input.mouseSteer && !input.mouseDown) {
    const dx = input.mouseX - 0.5;
    const dy = input.mouseY - 0.5;
    if (Math.abs(dx) > 0.08) roll += clampMouse(dx * 2.2);
    if (Math.abs(dy) > 0.08) pitch += clampMouse(-dy * 1.8);
  }
  let nextThrottle = throttle;
  if (input.keys.has('Shift')) nextThrottle += 0.35;
  if (input.keys.has('Control')) nextThrottle -= 0.35;
  if (input.keys.has('+') || input.keys.has('=')) nextThrottle += 0.3;
  if (input.keys.has('-') || input.keys.has('_')) nextThrottle -= 0.3;
  if (input.wheelDelta !== 0) {
    nextThrottle += input.wheelDelta * 0.07;
    input.wheelDelta = 0;
  }
  return {
    pitch: Math.max(-1, Math.min(1, pitch)),
    roll: Math.max(-1, Math.min(1, roll)),
    throttle: Math.max(0, Math.min(1, nextThrottle)),
    brake: input.keys.has(' ') || input.keys.has('b'),
  };
}

function clampMouse(v) {
  return Math.max(-1, Math.min(1, v));
}
