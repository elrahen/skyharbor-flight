// All drawing for Skyharbor Flight: sky, terrain, runways, rings, the
// aircraft, the lit cockpit panel and the HUD, plus the title and end screens.
// One clear job: paint the current state. It never changes the state (except
// remembering where the title-screen buttons are, so clicks can find them).

import { CONFIG, PALETTE, GAME_TITLE, AIRCRAFT_NAME, MISSIONS } from './config.js';
import { clamp, lerp, degrees } from './random.js';
import { terrainHeight, groundColour, landKind, RUNWAYS, BEACON } from './world.js';
import { nextTarget, targetLabel, distanceToTarget, bearingToTarget, missionProgressText, missionScore } from './missions.js';

function cameraBasis(plane) {
  const heading = plane.heading;
  const pitch = plane.pitch * 0.85;
  return {
    sinH: Math.sin(heading), cosH: Math.cos(heading),
    sinP: Math.sin(pitch), cosP: Math.cos(pitch),
    focal: 0,
  };
}

export function projectPoint(wx, wy, wz, plane, w, h, basis) {
  const dx = wx - plane.x; const dy = wy - plane.y; const dz = wz - plane.z;
  const fwd = dx * basis.sinH + dz * basis.cosH;
  const right = dx * basis.cosH - dz * basis.sinH;
  const fwd2 = fwd * basis.cosP + dy * basis.sinP;
  const up2 = -fwd * basis.sinP + dy * basis.cosP;
  if (fwd2 < 2.5) return null;
  const focal = h * CONFIG.camera.focalScale;
  return {
    x: w / 2 + (right * focal) / fwd2,
    y: h * CONFIG.camera.horizonFraction - (up2 * focal) / fwd2,
    depth: fwd2,
    focal,
  };
}

function fogBlend(rgb, depth, horizonRgb) {
  const f = Math.pow(clamp(depth / CONFIG.world.farDepth, 0, 1), 0.65) * 0.72;
  return `rgb(${Math.round(lerp(rgb[0], horizonRgb[0], f))},${Math.round(lerp(rgb[1], horizonRgb[1], f))},${Math.round(lerp(rgb[2], horizonRgb[2], f))})`;
}

function drawSky(ctx, w, h, plane, time, timeOfDay) {
  const dawn = timeOfDay === 'dawn';
  const top = dawn ? PALETTE.dawnTop : PALETTE.skyTop;
  const mid = PALETTE.skyMid;
  const horizon = dawn ? PALETTE.dawnHorizon : PALETTE.skyHorizon;
  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  grad.addColorStop(0, top); grad.addColorStop(0.62, mid); grad.addColorStop(1, horizon);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h * 0.56);
  // Sun with a soft glow, placed by heading so turning moves it across the sky.
  const sunAngle = wrapSun(plane.heading);
  const sunX = w / 2 + sunAngle * w * 0.32;
  const sunY = h * 0.16 - plane.pitch * 120;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 110);
  glow.addColorStop(0, 'rgba(255,244,200,0.95)');
  glow.addColorStop(0.25, 'rgba(255,226,150,0.55)');
  glow.addColorStop(1, 'rgba(255,226,150,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sunX, sunY, 110, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff7d6'; ctx.beginPath(); ctx.arc(sunX, sunY, 22, 0, Math.PI * 2); ctx.fill();
  // Distant mountain ridge, silhouetted against the haze.
  ctx.fillStyle = dawn ? '#5a4a7a' : '#6f87b8';
  ctx.beginPath();
  ctx.moveTo(0, h * CONFIG.camera.horizonFraction + 2);
  for (let x = 0; x <= w; x += 16) {
    const n = Math.sin(x * 0.011 + plane.heading * 2.2) * 0.5 + Math.sin(x * 0.027 + 1.7) * 0.3 + Math.sin(x * 0.005) * 0.4;
    ctx.lineTo(x, h * CONFIG.camera.horizonFraction + 2 - (26 + n * 34) - plane.pitch * 90);
  }
  ctx.lineTo(w, h * CONFIG.camera.horizonFraction + 2);
  ctx.closePath(); ctx.fill();
}

function wrapSun(heading) {
  let a = ((heading + Math.PI) % (Math.PI * 2)) - Math.PI;
  return clamp(a / Math.PI, -1, 1);
}

function drawTerrain(ctx, w, h, plane, basis, timeOfDay) {
  const horizonRgb = timeOfDay === 'dawn' ? [255, 158, 94] : [242, 201, 138];
  const rows = [];
  let depth = CONFIG.world.nearDepth;
  while (depth < CONFIG.world.farDepth) { rows.push(depth); depth *= 1.17; }
  rows.push(CONFIG.world.farDepth);
  const cols = CONFIG.world.gridCols;
  const half = (cols - 1) / 2;
  // Project the whole grid first, far rows last in paint order (draw far first).
  const grid = rows.map((d) => {
    const pts = [];
    for (let j = 0; j < cols; j += 1) {
      const lateral = (j - half) * (d * 0.105 + 9);
      const wx = plane.x + basis.sinH * d + basis.cosH * lateral;
      const wz = plane.z + basis.cosH * d - basis.sinH * lateral;
      const wy = terrainHeight(wx, wz);
      const p = projectPoint(wx, wy, wz, plane, w, h, basis);
      pts.push({ p, wx, wz, wy });
    }
    return { depth: d, pts };
  });
  for (let i = grid.length - 1; i > 0; i -= 1) {
    const far = grid[i]; const near = grid[i - 1];
    for (let j = 0; j < cols - 1; j += 1) {
      const a = far.pts[j]; const b = far.pts[j + 1]; const c = near.pts[j + 1]; const dPt = near.pts[j];
      if (!a.p || !b.p || !c.p || !dPt.p) continue;
      const cx = (a.wx + c.wx) / 2; const cz = (a.wz + c.wz) / 2;
      const colour = groundColour(cx, cz);
      ctx.fillStyle = fogBlend(colour, far.depth, horizonRgb);
      ctx.beginPath();
      ctx.moveTo(a.p.x, a.p.y); ctx.lineTo(b.p.x, b.p.y); ctx.lineTo(c.p.x, c.p.y); ctx.lineTo(dPt.p.x, dPt.p.y);
      ctx.closePath(); ctx.fill();
      if (far.depth < 180) {
        ctx.strokeStyle = 'rgba(20,30,20,0.05)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.p.x, a.p.y); ctx.lineTo(b.p.x, b.p.y); ctx.stroke();
      }
    }
  }
}

function drawRunway(ctx, w, h, plane, basis) {
  for (const runway of RUNWAYS) {
    const corners = [
      projectPoint(runway.x - 17, 3.2, runway.z - runway.length / 2, plane, w, h, basis),
      projectPoint(runway.x + 17, 3.2, runway.z - runway.length / 2, plane, w, h, basis),
      projectPoint(runway.x + 17, 3.2, runway.z + runway.length / 2, plane, w, h, basis),
      projectPoint(runway.x - 17, 3.2, runway.z + runway.length / 2, plane, w, h, basis),
    ];
    if (corners.some((p) => !p)) continue;
    if (corners[0].depth > 1500) continue;
    ctx.fillStyle = '#3c3f45';
    ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y);
    for (const p of corners.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = PALETTE.runwayMark; ctx.lineWidth = Math.max(1, 60 / corners[0].depth);
    ctx.stroke();
    // Centreline dashes.
    ctx.fillStyle = PALETTE.runwayMark;
    for (let dz = -runway.length / 2 + 30; dz < runway.length / 2 - 20; dz += 60) {
      const d1 = projectPoint(runway.x - 1.4, 3.4, runway.z + dz, plane, w, h, basis);
      const d2 = projectPoint(runway.x + 1.4, 3.4, runway.z + dz + 26, plane, w, h, basis);
      if (!d1 || !d2) continue;
      ctx.fillRect(Math.min(d1.x, d2.x), Math.min(d1.y, d2.y), Math.abs(d2.x - d1.x) + 1, Math.abs(d2.y - d1.y) + 1);
    }
    // Threshold bars and the strip name at the near end.
    const near = corners[0].depth < corners[3].depth ? corners[0] : corners[3];
    if (near.depth < 700) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(10, Math.round(260 / near.depth))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(runway.label, (corners[0].x + corners[1].x) / 2, corners[0].y + 22);
    }
  }
}

function drawRing(ctx, ring, plane, w, h, basis, time, isNext) {
  const p = projectPoint(ring.x, ring.y, ring.z, plane, w, h, basis);
  if (!p || p.depth > 1500) return;
  const rx = (ring.radius * p.focal) / p.depth;
  const ry = rx * 0.52;
  if (rx < 2) return;
  // A ring whose centre is off the frame reads as a stray arc (its radius
  // blows up as it draws near); the target arrow and the HUD bearing already
  // point the pilot to it, so skip the ellipse until it comes into view.
  if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) return;
  const pulse = isNext ? 1 + Math.sin(time * 5) * 0.08 : 1;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (isNext) {
    ctx.strokeStyle = 'rgba(255,226,122,0.35)';
    ctx.lineWidth = rx * 0.34 * pulse;
    ctx.beginPath(); ctx.ellipse(0, 0, rx * pulse, ry * pulse, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.strokeStyle = isNext ? PALETTE.ring : '#c98f1e';
  ctx.lineWidth = Math.max(2, rx * 0.16);
  ctx.beginPath(); ctx.ellipse(0, 0, rx * pulse, ry * pulse, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = isNext ? 'rgba(255,214,90,0.10)' : 'rgba(255,214,90,0.04)';
  ctx.beginPath(); ctx.ellipse(0, 0, rx * pulse, ry * pulse, 0, 0, Math.PI * 2); ctx.fill();
  // Small pennant above the next ring so it reads at a glance.
  if (isNext && rx > 14) {
    ctx.fillStyle = '#fff3c4';
    ctx.font = `bold ${Math.max(11, Math.round(rx * 0.42))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`RING ${ring.index + 1}`, 0, -ry - 8);
  }
  ctx.restore();
}

function drawClouds(ctx, state, w, h, basis, time) {
  const sorted = [...state.clouds].sort((a, b) => {
    const da = Math.hypot(a.x - state.plane.x, a.z - state.plane.z);
    const db = Math.hypot(b.x - state.plane.x, b.z - state.plane.z);
    return db - da;
  });
  for (const cloud of sorted) {
    const driftedX = cloud.x + time * cloud.drift * 0.15;
    const p = projectPoint(driftedX, cloud.y, cloud.z, state.plane, w, h, basis);
    if (!p || p.depth > 1600 || p.y > h * 0.62) continue;
    const r = (cloud.r * p.focal) / p.depth;
    if (r < 3) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.34, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - r * 0.5, p.y + r * 0.08, r * 0.6, r * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + r * 0.5, p.y + r * 0.08, r * 0.6, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(210,225,245,0.5)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.12, r * 0.9, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBeaconAndStorms(ctx, state, w, h, basis, time) {
  const plane = state.plane;
  const base = projectPoint(BEACON.x, terrainHeight(BEACON.x, BEACON.z) + 2, BEACON.z, plane, w, h, basis);
  const top = projectPoint(BEACON.x, BEACON.y, BEACON.z, plane, w, h, basis);
  if (base && top && top.depth < 1600) {
    ctx.strokeStyle = '#2c3138'; ctx.lineWidth = Math.max(1, 40 / top.depth);
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke();
    const glow = Math.sin(time * 3) > 0;
    ctx.fillStyle = glow ? '#ff6a55' : '#7a2a22';
    ctx.beginPath(); ctx.arc(top.x, top.y, Math.max(3, 90 / top.depth), 0, Math.PI * 2); ctx.fill();
    if (top.depth < 500) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('BEACON', top.x, top.y - 14);
    }
  }
  for (const cell of state.mission.stormCells) {
    const p = projectPoint(cell.x, cell.y, cell.z, plane, w, h, basis);
    if (!p || p.depth > 1600) continue;
    const r = (cell.r * p.focal) / p.depth;
    ctx.fillStyle = 'rgba(52,58,72,0.92)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - r * 0.45, p.y + r * 0.1, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + r * 0.45, p.y + r * 0.1, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(30,34,44,0.9)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.16, r * 0.9, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    if (Math.sin(time * 0.9 + cell.x) > 0.94 && r > 8) {
      ctx.strokeStyle = '#ffe98a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y + r * 0.2);
      ctx.lineTo(p.x - 6, p.y + r * 0.6); ctx.lineTo(p.x + 4, p.y + r * 0.6); ctx.lineTo(p.x - 2, p.y + r); ctx.stroke();
    }
  }
}

function drawAircraft(ctx, plane, w, h, time) {
  const s = h / 480;
  const ax = w / 2;
  const ay = h * 0.60 + plane.pitch * 26 * s;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(-plane.roll * 0.85);
  ctx.scale(s, s);
  // Propeller blur: a faint disc ahead of the nose.
  ctx.fillStyle = 'rgba(220,230,240,0.28)';
  ctx.beginPath(); ctx.ellipse(0, -118, 10, 46, 0, 0, Math.PI * 2); ctx.fill();
  // Main wing, swept slightly back, cream with a teal leading edge.
  ctx.fillStyle = '#f2ead8';
  ctx.beginPath();
  ctx.moveTo(-168, 6); ctx.quadraticCurveTo(-120, -22, -52, -14); ctx.lineTo(52, -14);
  ctx.quadraticCurveTo(120, -22, 168, 6); ctx.quadraticCurveTo(120, 20, 52, 14); ctx.lineTo(-52, 14);
  ctx.quadraticCurveTo(-120, 20, -168, 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1f7a8c';
  ctx.fillRect(-166, -2, 332, 7);
  // Wingtip navigation lights, lit.
  const strobe = Math.sin(time * 6) > 0.4;
  ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(-166, 2, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#37e08a'; ctx.beginPath(); ctx.arc(166, 2, 6, 0, Math.PI * 2); ctx.fill();
  if (strobe) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 118, 5, 0, Math.PI * 2); ctx.fill(); }
  // Tailplane and fin.
  ctx.fillStyle = '#e8dfc9';
  ctx.beginPath();
  ctx.moveTo(-58, 96); ctx.quadraticCurveTo(0, 78, 58, 96); ctx.lineTo(44, 112); ctx.lineTo(-44, 112); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1f7a8c';
  ctx.beginPath(); ctx.moveTo(-8, 88); ctx.quadraticCurveTo(0, 52, 10, 86); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('K-7', 1, 84);
  // Fuselage: tapering body from tail to nose, sunset stripe along it.
  const body = ctx.createLinearGradient(0, -120, 0, 122);
  body.addColorStop(0, '#f7f1e2'); body.addColorStop(0.55, '#efe6cf'); body.addColorStop(1, '#d9cfae');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -124);
  ctx.quadraticCurveTo(26, -60, 24, 10); ctx.quadraticCurveTo(22, 80, 12, 122);
  ctx.quadraticCurveTo(0, 130, -12, 122); ctx.quadraticCurveTo(-22, 80, -24, 10);
  ctx.quadraticCurveTo(-26, -60, 0, -124); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8833a';
  ctx.beginPath(); ctx.moveTo(-20, 34); ctx.quadraticCurveTo(0, 26, 20, 34); ctx.lineTo(18, 52); ctx.quadraticCurveTo(0, 44, -18, 52); ctx.closePath(); ctx.fill();
  // Canopy: lit glass with a sky glint.
  ctx.fillStyle = '#274b63';
  ctx.beginPath(); ctx.ellipse(0, -52, 15, 30, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(180,225,255,0.75)';
  ctx.beginPath(); ctx.ellipse(-5, -62, 6, 12, -0.3, 0, Math.PI * 2); ctx.fill();
  // Exhaust shimmer when the throttle is high.
  if (plane.throttle > 0.7) {
    ctx.fillStyle = 'rgba(255,170,90,0.35)';
    ctx.beginPath(); ctx.ellipse(0, -132, 7, 14 + Math.sin(time * 30) * 3, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawDial(ctx, x, y, r, label, valueText, needleAngle, lit) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.gaugeFace; ctx.fill();
  ctx.strokeStyle = lit ? PALETTE.gaugeLit : '#3a4552'; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i += 1) {
    const a = -Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6));
    ctx.lineTo(x + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2));
    ctx.stroke();
  }
  ctx.strokeStyle = PALETTE.gaugeLit; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(needleAngle) * (r - 9), y + Math.sin(needleAngle) * (r - 9)); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lit ? '#ffe9b0' : '#c8d2dc';
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(valueText, x, y + r + 13);
  ctx.fillStyle = '#8fa0b0'; ctx.font = '9px sans-serif';
  ctx.fillText(label, x, y - r - 5);
  ctx.restore();
}

function drawHorizonGauge(ctx, x, y, r, plane) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y); ctx.rotate(-plane.roll);
  const offset = clamp(plane.pitch, -0.5, 0.5) * r * 1.6;
  ctx.fillStyle = '#3f8fd2'; ctx.fillRect(-r, -r - offset, r * 2, r + offset);
  ctx.fillStyle = '#7a5a34'; ctx.fillRect(-r, offset, r * 2, r);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-r, -offset); ctx.lineTo(r, -offset); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
  for (const dy of [-22, 22]) {
    ctx.beginPath(); ctx.moveTo(-16, -offset + dy); ctx.lineTo(16, -offset + dy); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = PALETTE.gaugeLit; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffd27a'; ctx.beginPath();
  ctx.moveTo(x - 14, y); ctx.lineTo(x, y - 4); ctx.lineTo(x + 14, y); ctx.lineTo(x, y + 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c8d2dc'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', x, y - r - 5);
}

function drawBar(ctx, x, y, width, height, fraction, colour, label, valueText) {
  ctx.fillStyle = '#0c1118'; ctx.fillRect(x, y, width, height);
  ctx.fillStyle = colour; ctx.fillRect(x + 2, y + 2, Math.max(0, (width - 4) * clamp(fraction, 0, 1)), height - 4);
  ctx.strokeStyle = '#3a4552'; ctx.lineWidth = 1; ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = '#e8eef4'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(label, x, y - 4);
  ctx.textAlign = 'right';
  ctx.fillText(valueText, x + width, y - 4);
}

function drawWarningLight(ctx, x, y, text, active, colour) {
  ctx.fillStyle = active ? colour : '#2a323d';
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
  if (active) {
    ctx.strokeStyle = colour; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = active ? '#ffffff' : '#6b7a89';
  ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(text, x + 14, y + 3);
}

function drawPanel(ctx, state, w, h) {
  const plane = state.plane;
  const panelTop = h - 106;
  const grad = ctx.createLinearGradient(0, panelTop, 0, h);
  grad.addColorStop(0, '#232c38'); grad.addColorStop(0.12, PALETTE.panel); grad.addColorStop(1, '#12171f');
  ctx.fillStyle = grad; ctx.fillRect(0, panelTop, w, 106);
  ctx.fillStyle = PALETTE.panelEdge; ctx.fillRect(0, panelTop, w, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let x = 14; x < w; x += 92) { ctx.beginPath(); ctx.arc(x, panelTop + 12, 2, 0, Math.PI * 2); ctx.fill(); }
  const cy = panelTop + 52;
  const lit = true;
  drawHorizonGauge(ctx, 62, cy, 32, plane);
  drawDial(ctx, 152, cy, 30, 'AIRSPEED KT', `${Math.round(plane.speed)}`, -Math.PI * 0.75 + (clamp(plane.speed, 0, 260) / 260) * Math.PI * 1.5, lit);
  drawDial(ctx, 238, cy, 30, 'ALTITUDE FT', `${Math.round(plane.y * 22)}`, -Math.PI * 0.75 + (clamp(plane.y, 0, 420) / 420) * Math.PI * 1.5, lit);
  // Centre: the three numbers the brief asks for, large and lit.
  const cx = w / 2;
  ctx.textAlign = 'center';
  const boxes = [
    { label: 'ALTITUDE', value: `${Math.round(plane.y * 22)} FT` },
    { label: 'AIRSPEED', value: `${Math.round(plane.speed)} KT` },
    { label: 'HEADING', value: `${String(Math.round(degrees(plane.heading))).padStart(3, '0')}°` },
  ];
  boxes.forEach((box, i) => {
    const bx = cx - 150 + i * 150;
    ctx.fillStyle = '#0c1118'; ctx.fillRect(bx - 66, panelTop + 16, 132, 52);
    ctx.strokeStyle = PALETTE.gaugeLit; ctx.lineWidth = 1.5; ctx.strokeRect(bx - 66, panelTop + 16, 132, 52);
    ctx.fillStyle = '#8fa0b0'; ctx.font = 'bold 10px sans-serif';
    ctx.fillText(box.label, bx, panelTop + 32);
    ctx.fillStyle = '#ffe9b0'; ctx.font = 'bold 21px monospace';
    ctx.fillText(box.value, bx, panelTop + 56);
  });
  ctx.fillStyle = '#8fa0b0'; ctx.font = '10px sans-serif';
  ctx.fillText(`THROTTLE ${Math.round(plane.throttle * 100)}%  ·  V/S ${plane.verticalSpeed >= 0 ? '+' : ''}${Math.round(plane.verticalSpeed * 22)} FT/MIN`, cx, panelTop + 88);
  // Right: fuel, damage, warnings.
  const rx = w - 268;
  drawBar(ctx, rx, panelTop + 30, 150, 12, plane.fuel / 100, plane.fuel < 18 ? PALETTE.gaugeRed : PALETTE.gaugeGreen, 'FUEL', `${Math.round(plane.fuel)}%`);
  drawBar(ctx, rx, panelTop + 62, 150, 12, 1 - plane.damage / 100, plane.damage > 60 ? PALETTE.gaugeRed : '#7db3e8', 'AIRFRAME', `${Math.round(100 - plane.damage)}%`);
  drawWarningLight(ctx, rx + 176, panelTop + 34, 'STALL', plane.stallWarning, PALETTE.gaugeRed);
  drawWarningLight(ctx, rx + 176, panelTop + 62, 'FUEL', plane.lowFuelWarning, '#ffb400');
  drawWarningLight(ctx, rx + 176, panelTop + 90, 'SPEED', plane.overspeedWarning, PALETTE.gaugeRed);
}

function drawHud(ctx, state, w, h) {
  const plane = state.plane; const mission = state.mission;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.shadowColor = PALETTE.hudShadow; ctx.shadowBlur = 4;
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`${GAME_TITLE} — ${AIRCRAFT_NAME}`, 16, 26);
  ctx.font = '12px sans-serif'; ctx.fillStyle = '#ffe9b0';
  ctx.fillText(mission.def.name, 16, 44);
  ctx.fillStyle = '#ffffff'; ctx.font = '12px sans-serif';
  ctx.fillText(missionProgressText(mission), 16, 62);
  ctx.textAlign = 'right';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`SCORE ${missionScore(mission, plane)}`, w - 16, 26);
  ctx.font = '12px sans-serif';
  const mins = Math.floor(state.elapsed / 60); const secs = Math.floor(state.elapsed % 60);
  ctx.fillText(`TIME ${mins}:${String(secs).padStart(2, '0')}`, w - 16, 44);
  ctx.fillText(state.muted ? 'M: SOUND OFF' : 'M: SOUND ON', w - 16, 62);
  // Objective and target, centred where the eye lands first.
  const target = nextTarget(mission);
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#ffffff';
  ctx.fillText(targetLabel(mission, target), w / 2, 26);
  if (target) {
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#ffe9b0';
    ctx.fillText(`${Math.round(distanceToTarget(plane, mission))} units  ·  bearing ${String(Math.round(bearingToTarget(plane, mission))).padStart(3, '0')}°`, w / 2, 44);
  }
  // Pilot message, large enough to read when the sheet shrinks.
  if (state.now < mission.messageUntil) {
    ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = '#ffffff';
    ctx.fillText(mission.message, w / 2, h - 118);
  }
  if (state.banner) {
    ctx.font = 'bold 26px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(state.banner, w / 2, 84);
  }
  ctx.restore();
}

function drawTargetMarker(ctx, state, w, h, basis) {
  const target = nextTarget(state.mission);
  if (!target) return;
  const ty = target.y ?? 60;
  const p = projectPoint(target.x, ty, target.z, state.plane, w, h, basis);
  if (p && p.depth < 1500 && p.x > 30 && p.x < w - 30 && p.y > 30 && p.y < h - 130) {
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2.5;
    ctx.strokeRect(-9, -9, 18, 18);
    ctx.restore();
    return;
  }
  // Off-screen: an edge arrow pointing the way.
  const dx = target.x - state.plane.x; const dz = target.z - state.plane.z;
  const relX = dx * basis.cosH - dz * basis.sinH;
  const relZ = dx * basis.sinH + dz * basis.cosH;
  const angle = Math.atan2(relX, Math.max(1, relZ));
  const ex = w / 2 + Math.sin(angle) * (w / 2 - 60);
  const ey = 90;
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(angle);
  ctx.fillStyle = '#ffe27a';
  ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(9, 8); ctx.lineTo(-9, 8); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = []; let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) { lines.push(line); line = word; }
    else line = trial;
  }
  if (line) lines.push(line);
  return lines;
}

function drawTitle(ctx, state, w, h) {
  ctx.fillStyle = 'rgba(8,16,30,0.62)'; ctx.fillRect(0, 0, w, h - 106);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(GAME_TITLE, w / 2, 86);
  ctx.fillStyle = '#ffe9b0'; ctx.font = '16px sans-serif';
  ctx.fillText('Fly the Kestrel-7 out of Skyharbor Field. Rings, strips and one storm beacon.', w / 2, 114);
  const cardW = Math.min(300, (w - 80) / 3);
  const cardH = 148;
  const top = 140;
  state.uiButtons = [];
  MISSIONS.forEach((def, i) => {
    const cx = w / 2 + (i - 1) * (cardW + 16);
    const bx = cx - cardW / 2;
    ctx.fillStyle = 'rgba(20,32,48,0.92)';
    ctx.fillRect(bx, top, cardW, cardH);
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2; ctx.strokeRect(bx, top, cardW, cardH);
    ctx.fillStyle = '#ffd27a'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`${i + 1}. ${def.short.toUpperCase()}`, cx, top + 26);
    ctx.fillStyle = '#ffffff'; ctx.font = '12px sans-serif';
    const lines = wrapText(ctx, def.briefing, cardW - 24);
    lines.slice(0, 5).forEach((line, li) => ctx.fillText(line, cx, top + 50 + li * 17));
    state.uiButtons.push({ x: bx, y: top, width: cardW, height: cardH, mission: i });
  });
  ctx.fillStyle = '#dbe7f2'; ctx.font = '13px sans-serif';
  ctx.fillText('Arrows / WASD — pitch and bank  ·  Shift / wheel — throttle  ·  Mouse — steer  ·  Space — brake  ·  P — pause  ·  M — sound', w / 2, top + cardH + 34);
  ctx.fillText('Click a mission card, or press 1, 2 or 3. Land gently: slow, level, on the strip.', w / 2, top + cardH + 56);
}

function drawOverlay(ctx, state, w, h, title, lines, accent) {
  ctx.fillStyle = 'rgba(8,16,30,0.66)'; ctx.fillRect(0, 0, w, h - 106);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent; ctx.font = 'bold 36px sans-serif';
  ctx.fillText(title, w / 2, h / 2 - 40);
  ctx.fillStyle = '#ffffff'; ctx.font = '15px sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h / 2 - 4 + i * 24));
}

export function drawScene(ctx, state, w, h) {
  const plane = state.plane;
  const basis = cameraBasis(plane);
  const time = state.frozen ? state.frozenTime : state.now;
  ctx.clearRect(0, 0, w, h);
  drawSky(ctx, w, h, plane, time, state.timeOfDay);
  drawTerrain(ctx, w, h, plane, basis, state.timeOfDay);
  drawRunway(ctx, w, h, plane, basis);
  drawClouds(ctx, state, w, h, basis, time);
  const next = nextTarget(state.mission);
  for (const ring of state.mission.rings) {
    if (!ring.passed) drawRing(ctx, ring, plane, w, h, basis, time, next === ring);
  }
  drawBeaconAndStorms(ctx, state, w, h, basis, time);
  drawTargetMarker(ctx, state, w, h, basis);
  drawAircraft(ctx, plane, w, h, time);
  drawPanel(ctx, state, w, h);
  drawHud(ctx, state, w, h);
  if (state.mode === 'title') drawTitle(ctx, state, w, h);
  else if (state.mode === 'paused') drawOverlay(ctx, state, w, h, 'PAUSED', ['Press P to keep flying.', 'R restarts the sortie.'], '#ffe9b0');
  else if (state.mode === 'crashed') drawOverlay(ctx, state, w, h, 'DOWN IN THE FIELDS', [state.crashReason, `Score ${missionScore(state.mission, plane)} — press R to fly again, or 1 / 2 / 3 for another mission.`], '#ff8a7a');
  else if (state.mode === 'complete') drawOverlay(ctx, state, w, h, 'SORTIE COMPLETE', [`${state.mission.def.name} — score ${missionScore(state.mission, plane)}.`, 'Press R to fly it again, or 1 / 2 / 3 for another mission.'], '#ffe27a');
}
