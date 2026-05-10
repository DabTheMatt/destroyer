(() => {
"use strict";

const game = document.getElementById("game");
const ctx = game.getContext("2d");

const sonarCanvas = document.getElementById("sonar");
const sonarCtx = sonarCanvas.getContext("2d");
const radarCanvas = document.getElementById("radar");
const radarCtx = radarCanvas.getContext("2d");
const shipView = document.getElementById("shipView");
const shipCtx = shipView.getContext("2d");

const consolePanel = document.getElementById("console");
const sonarButton = document.getElementById("sonarButton");
const sonarStatus = document.getElementById("sonarStatus");
const radarStatus = document.getElementById("radarStatus");
const radarBtn = document.getElementById("radarBtn");
const windBtn = document.getElementById("windBtn");
const infoBtn = document.getElementById("infoBtn");
const speedRead = document.getElementById("speedRead");
const rudderRead = document.getElementById("rudderRead");
const courseRead = document.getElementById("courseRead");
const weaponRead = document.getElementById("weaponRead");
const windShort = document.getElementById("windShort");

const WORLD_W = 30000;
const WORLD_H = 30000;
const KNOT_TO_MS = 0.514444;
const MS_TO_KNOT = 1 / KNOT_TO_MS;
const SIM_SPEED = 10;

let baseMetersPerPixel = 42;
let metersPerPixel = 42;
let zoom = 1.0;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 120.0;

const keys = new Set();
const handled = new Set();

const speedOrders = [
  { name: "WSTECZ 2/3", knots: -12 },
  { name: "WSTECZ 1/3", knots: -6 },
  { name: "STOP", knots: 0 },
  { name: "1/3", knots: 10 },
  { name: "2/3", knots: 20 },
  { name: "CAŁA", knots: 30 },
  { name: "FLANKA", knots: 37 }
];
for (const order of speedOrders) order.value = order.knots * KNOT_TO_MS;
const STOP_INDEX = 2;

const ship = {
  x: WORLD_W / 2,
  y: WORLD_H * 0.62,
  heading: degToRad(0),
  speed: 0,
  targetSpeedIndex: STOP_INDEX,
  rudder: 0,
  maxRudder: 30,
  orderedCourse: null,
  autopilot: false
};

const camera = { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5, manualOffsetX: 0, manualOffsetY: 0 };

const sonar = { on: false, range: 2500, minRange: 300, bearing: degToRad(0), beamWidth: degToRad(14), ping: 0 };
const radar = { on: true, range: 9500, sweepAngle: 0 };

const weather = {
  t: 0,
  rain: 0.28,
  wave: 0.34,
  windDir: degToRad(305),
  windSpeed: 14.5,
  visibility: 5200
};

const guns = {
  mode: "MANUAL",
  bearing: degToRad(0),
  range: 4500,
  minRange: 1200,
  maxRange: 16460,
  muzzleVelocity: 792,
  turnRate: 28.75 * Math.PI / 180
};

const turrets = [
  { name: "A", x: 46, y: 0, arc: [-150, 150], reload: 0.0, baseReload: 4.0 },
  { name: "B", x: 30, y: 0, arc: [-150, 150], reload: 0.7, baseReload: 4.2 },
  { name: "Q", x: -18, y: 0, arc: [-175, 175], reload: 1.4, baseReload: 4.0 },
  { name: "X", x: -39, y: 0, arc: [30, 330], reload: 2.1, baseReload: 4.3 },
  { name: "Y", x: -55, y: 0, arc: [30, 330], reload: 2.8, baseReload: 4.1 }
];

let target = randomTarget();
let lastRadarContact = null;
let lastRadarAirContact = null;
let inputMode = "COURSE";
let courseInput = "";
let angleInput = "";
let lastMessage = "Gotowy.";
let windLayerOn = true;
let infoOn = true;
let audioCtx = null;
let lastTime = performance.now();
let wakeBuild = 0;

const shells = [];
const splashes = [];
const muzzleFlashes = [];
const wake = [];
const radarEchoes = [];
const sonarPulses = [];
const smoke = [];
const aaTracers = [];
const aaBursts = [];
const wrecks = [];
const aircraft = Array.from({ length: 3 }, (_, i) => makeCondor(i));
const subs = Array.from({ length: 3 }, () => makeSub());
const rainDrops = Array.from({ length: 130 }, () => ({ x: Math.random(), y: Math.random(), s: 0.55 + Math.random() * 1.25 }));
const drag = { active: false, lastX: 0, lastY: 0 };

resizeAll();
bindEvents();
requestAnimationFrame(loop);

function bindEvents() {
  window.addEventListener("resize", resizeAll);

  sonarButton.addEventListener("click", () => {
    ensureAudio();
    sonar.on = !sonar.on;
    sonar.ping = 0;
  });

  radarBtn.addEventListener("click", () => {
    radar.on = !radar.on;
    radarBtn.textContent = radar.on ? "RADAR: WŁ." : "RADAR: WYŁ.";
    radarBtn.classList.toggle("on", radar.on);
  });

  windBtn.addEventListener("click", () => {
    windLayerOn = !windLayerOn;
    windBtn.textContent = windLayerOn ? "WIATR: WŁ." : "WIATR: WYŁ.";
    windBtn.classList.toggle("on", windLayerOn);
  });

  infoBtn.addEventListener("click", () => {
    infoOn = !infoOn;
    infoBtn.textContent = infoOn ? "INFO: WŁ." : "INFO: WYŁ.";
    infoBtn.classList.toggle("on", infoOn);
  });

  game.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = game.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const mouse = { x: (event.clientX - rect.left) * dpr, y: (event.clientY - rect.top) * dpr };

    updateMapScale();
    const before = { x: camera.x + mouse.x * metersPerPixel, y: camera.y + mouse.y * metersPerPixel };

    zoom = clamp(zoom * Math.exp(-event.deltaY * 0.0012), MIN_ZOOM, MAX_ZOOM);
    updateMapScale();

    camera.x = before.x - mouse.x * metersPerPixel;
    camera.y = before.y - mouse.y * metersPerPixel;
    camera.manualOffsetX = camera.x - (ship.x - game.width * metersPerPixel * camera.anchorX);
    camera.manualOffsetY = camera.y - (ship.y - game.height * metersPerPixel * camera.anchorY);
  }, { passive: false });

  game.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    drag.active = true;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    game.classList.add("dragging");
  });

  window.addEventListener("mousemove", (event) => {
    if (!drag.active) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    camera.manualOffsetX -= dx * metersPerPixel;
    camera.manualOffsetY -= dy * metersPerPixel;
  });

  window.addEventListener("mouseup", () => {
    drag.active = false;
    game.classList.remove("dragging");
  });

  game.addEventListener("dblclick", () => {
    camera.manualOffsetX = 0;
    camera.manualOffsetY = 0;
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    keys.delete(key);
    handled.delete(key);
  });
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  keys.add(key);
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "+", "-", "add", "subtract"].includes(key)) {
    event.preventDefault();
  }

  if (/^[0-9]$/.test(event.key)) {
    if (inputMode === "AIM") angleInput = (angleInput + event.key).slice(-3);
    else courseInput = (courseInput + event.key).slice(-3);
  }

  if (event.key === "Enter") {
    if (inputMode === "AIM" && angleInput) {
      guns.bearing = degToRad(Number(angleInput) % 360);
      angleInput = "";
    } else if (inputMode === "COURSE" && courseInput) {
      ship.orderedCourse = (Number(courseInput) % 360 + 360) % 360;
      ship.autopilot = true;
      courseInput = "";
    }
  }
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = Math.max(10, Math.floor(rect.width * dpr));
  const h = Math.max(10, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function resizeAll() {
  resizeCanvas(game);
  resizeCanvas(sonarCanvas);
  resizeCanvas(radarCanvas);
  resizeCanvas(shipView);
}

function once(key) {
  if (keys.has(key) && !handled.has(key)) {
    handled.add(key);
    return true;
  }
  return false;
}

function degToRad(deg) { return (deg - 90) * Math.PI / 180; }
function radToCourse(rad) { return (((rad * 180 / Math.PI) + 90) % 360 + 360) % 360; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleDiffRad(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
function angleToPoint(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
function angleDiffDeg(targetCourse, currentCourse) { return ((targetCourse - currentCourse + 540) % 360) - 180; }

function updateMapScale() {
  const minPx = Math.min(game.width, game.height) * 0.43;
  baseMetersPerPixel = radar.range / Math.max(120, minPx);
  metersPerPixel = baseMetersPerPixel / zoom;
}

function updateCamera() {
  updateMapScale();
  camera.x = ship.x - game.width * metersPerPixel * camera.anchorX + camera.manualOffsetX;
  camera.y = ship.y - game.height * metersPerPixel * camera.anchorY + camera.manualOffsetY;
}

function worldToScreen(point) {
  return { x: (point.x - camera.x) / metersPerPixel, y: (point.y - camera.y) / metersPerPixel };
}

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function blip(freq = 800, duration = 0.08, volume = 0.12, type = "square") {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.62), audioCtx.currentTime + duration);
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, audioCtx.currentTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration + 0.02);
}

function burst(duration = 0.25, volume = 0.22, filterFreq = 420) {
  if (!audioCtx) return;
  const buffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * duration), audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  src.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  src.connect(filter).connect(gain).connect(audioCtx.destination);
  src.start();
}

function randomTarget() {
  const d = 3200 + Math.random() * 5200;
  const a = Math.random() * Math.PI * 2;
  return {
    x: (ship.x + Math.cos(a) * d + WORLD_W) % WORLD_W,
    y: (ship.y + Math.sin(a) * d + WORLD_H) % WORLD_H,
    length: 135,
    beam: 18,
    heading: Math.random() * Math.PI * 2,
    speed: 1.0 + Math.random() * 2.5,
    hp: 100,
    maxHp: 100,
    alive: true,
    turnTimer: 5
  };
}

function makeCondor(index = 0) {
  return {
    active: true,
    x: ship.x - 7000 - index * 3500 + Math.random() * 2500,
    y: ship.y - 5000 + Math.random() * 10000,
    heading: angleToPoint({ x: ship.x - 7000, y: ship.y - 2500 + Math.random() * 5000 }, ship) + (Math.random() - 0.5) * 0.55,
    speed: 86 + Math.random() * 12,
    hp: 24,
    maxHp: 24,
    aaCooldown: 0,
    damaged: false
  };
}

function makeSub() {
  const d = 1800 + Math.random() * 3800;
  const a = Math.random() * Math.PI * 2;
  return {
    x: (ship.x + Math.cos(a) * d + WORLD_W) % WORLD_W,
    y: (ship.y + Math.sin(a) * d + WORLD_H) % WORLD_H,
    heading: Math.random() * Math.PI * 2,
    speed: 1.2 + Math.random() * 1.5,
    alive: true
  };
}

function updateOrders(dt) {
  if (once("arrowup") || once("w") || once("+")) ship.targetSpeedIndex = clamp(ship.targetSpeedIndex + 1, 0, speedOrders.length - 1);
  if (once("arrowdown") || once("s") || once("-")) ship.targetSpeedIndex = clamp(ship.targetSpeedIndex - 1, 0, speedOrders.length - 1);

  if (once("arrowleft") || once("a")) {
    ship.rudder = clamp(ship.rudder - 5, -ship.maxRudder, ship.maxRudder);
    ship.autopilot = false;
    ship.orderedCourse = null;
  }

  if (once("arrowright") || once("d")) {
    ship.rudder = clamp(ship.rudder + 5, -ship.maxRudder, ship.maxRudder);
    ship.autopilot = false;
    ship.orderedCourse = null;
  }

  if (once("z")) ship.rudder = 0;
  if (once("x")) ship.targetSpeedIndex = STOP_INDEX;
  if (once("p")) {
    ensureAudio();
    sonar.on = !sonar.on;
    sonar.ping = 0;
  }

  if (keys.has("[") || keys.has("{")) sonar.bearing -= 0.9 * dt;
  if (keys.has("]") || keys.has("}")) sonar.bearing += 0.9 * dt;

  if (once("g")) {
    guns.mode = "MANUAL";
    inputMode = inputMode === "AIM" ? "COURSE" : "AIM";
  }

  if (once("f")) guns.mode = guns.mode === "AUTO" ? "MANUAL" : "AUTO";

  if (once("r")) {
    guns.mode = "MANUAL";
    guns.bearing = ship.heading;
    turrets.forEach((turret, index) => turret.reload = index * 0.5);
    lastMessage = "Działa zresetowane do pozycji początkowej.";
  }

  let turn = 0;
  if (keys.has(",") || keys.has("<")) turn -= guns.turnRate * dt;
  if (keys.has(".") || keys.has(">")) turn += guns.turnRate * dt;
  if (turn) {
    guns.mode = "MANUAL";
    guns.bearing += turn;
  }

  if (keys.has("o")) guns.range = clamp(guns.range + 520 * dt, guns.minRange, guns.maxRange);
  if (keys.has("l")) guns.range = clamp(guns.range - 520 * dt, guns.minRange, guns.maxRange);

  if (once(" ")) fireGuns();

  if (guns.mode === "AUTO" && target.alive) {
    guns.bearing += clamp(angleDiffRad(angleToPoint(ship, target), guns.bearing), -guns.turnRate * dt, guns.turnRate * dt);
  }
}

function updatePhysics(dt) {
  const targetSpeed = speedOrders[ship.targetSpeedIndex].value;
  const accel = Math.abs(targetSpeed) > Math.abs(ship.speed) ? 0.55 : 0.82;
  ship.speed += clamp(targetSpeed - ship.speed, -accel * dt, accel * dt);

  if (ship.autopilot && ship.orderedCourse !== null) {
    const diff = angleDiffDeg(ship.orderedCourse, radToCourse(ship.heading));
    ship.rudder = clamp(diff * 0.16, -15, 15);
    if (Math.abs(diff) < 1.2) {
      ship.rudder = 0;
      ship.heading = degToRad(ship.orderedCourse);
      ship.autopilot = false;
    }
  }

  ship.heading += (ship.rudder / ship.maxRudder) * (Math.abs(ship.speed) / speedOrders.at(-1).value) * 0.105 * dt * Math.sign(ship.speed || 1);

  const windAngle = angleDiffRad(weather.windDir, ship.heading);
  const headWind = Math.cos(windAngle) * weather.windSpeed;
  const crossWind = Math.sin(windAngle) * weather.windSpeed;
  const actualSpeed = (ship.speed - headWind * 0.010 - weather.wave * 0.10 * Math.sign(ship.speed || 1)) * SIM_SPEED;

  ship.x += Math.cos(ship.heading) * actualSpeed * dt + Math.cos(weather.windDir) * crossWind * 0.010 * SIM_SPEED * dt;
  ship.y += Math.sin(ship.heading) * actualSpeed * dt + Math.sin(weather.windDir) * crossWind * 0.010 * SIM_SPEED * dt;
  ship.x = (ship.x + WORLD_W) % WORLD_W;
  ship.y = (ship.y + WORLD_H) % WORLD_H;

  wakeBuild = clamp(wakeBuild + (Math.abs(ship.speed) > 0.5 ? 0.7 : -1.4) * dt, 0, 1);
  if (wakeBuild > 0.05) addWake();

  if (Math.random() < dt * 4 && Math.abs(ship.speed) > 0.4) {
    smoke.push({ x: ship.x - Math.cos(ship.heading) * 22, y: ship.y - Math.sin(ship.heading) * 22, t: 0, r: 4 + Math.random() * 3 });
  }
}

function updateTargets(dt) {
  if (target.alive) {
    target.turnTimer -= dt;
    if (target.turnTimer <= 0) {
      target.heading += (Math.random() - 0.5) * degToRad(34);
      target.speed = clamp(target.speed + (Math.random() - 0.5) * 1.2, 1, 5.4);
      target.turnTimer = 5 + Math.random() * 12;
    }
    target.x = (target.x + Math.cos(target.heading) * target.speed * dt * 4 + WORLD_W) % WORLD_W;
    target.y = (target.y + Math.sin(target.heading) * target.speed * dt * 4 + WORLD_H) % WORLD_H;
  }

  for (const sub of subs) {
    sub.x = (sub.x + Math.cos(sub.heading) * sub.speed * dt * 5 + WORLD_W) % WORLD_W;
    sub.y = (sub.y + Math.sin(sub.heading) * sub.speed * dt * 5 + WORLD_H) % WORLD_H;
    if (Math.random() < dt * 0.035) sub.heading += (Math.random() - 0.5) * 0.5;
  }

  for (let index = 0; index < aircraft.length; index++) {
    const plane = aircraft[index];
    plane.x += Math.cos(plane.heading) * plane.speed * dt * SIM_SPEED;
    plane.y += Math.sin(plane.heading) * plane.speed * dt * SIM_SPEED;
    if (dist(plane, ship) > 18000 || plane.hp <= 0) Object.assign(plane, makeCondor(index));
    updateAA(plane, dt);
  }
}

function addWake() {
  wake.push({
    x: ship.x - Math.cos(ship.heading) * 68,
    y: ship.y - Math.sin(ship.heading) * 68,
    t: 0,
    heading: ship.heading,
    intensity: clamp(Math.abs(ship.speed) / speedOrders.at(-1).value, 0.10, 0.75) * wakeBuild
  });
  while (wake.length > 420) wake.shift();
}

function updateWakeSmoke(dt) {
  for (const mark of wake) mark.t += dt;
  while (wake.length && wake[0].t > 65) wake.shift();

  for (const puff of smoke) {
    puff.t += dt;
    puff.x += Math.cos(weather.windDir) * weather.windSpeed * 0.9 * dt;
    puff.y += Math.sin(weather.windDir) * weather.windSpeed * 0.9 * dt;
    puff.r += 0.8 * dt;
  }
  while (smoke.length && smoke[0].t > 18) smoke.shift();
}

function updateAA(plane, dt) {
  plane.aaCooldown -= dt;
  const range = dist(ship, plane);
  if (range > 3810 || plane.aaCooldown > 0) return;

  plane.aaCooldown = 0.12;
  const muzzle = {
    x: ship.x + Math.cos(ship.heading) * (12 - Math.random() * 45),
    y: ship.y + Math.sin(ship.heading) * (12 - Math.random() * 45)
  };
  const spread = 80 + range * 0.035;
  const hit = Math.random() < (range < 2000 ? 0.10 : 0.035);
  const end = hit ? plane : { x: plane.x + (Math.random() - 0.5) * spread, y: plane.y + (Math.random() - 0.5) * spread };

  aaTracers.push({ x1: muzzle.x, y1: muzzle.y, x2: end.x, y2: end.y, t: 0, maxT: 0.22 });
  aaBursts.push({ x: end.x, y: end.y, t: 0, maxT: hit ? 0.55 : 0.36 });

  if (hit) {
    const damage = 7 + Math.random() * 6;
    plane.hp -= damage;
    plane.damaged = true;
    blip(420, 0.05, 0.06, "square");
  }
}

function nearestSonarContact() {
  let best = null;
  let bestDistance = Infinity;
  for (const sub of subs) {
    const range = dist(ship, sub);
    if (range < sonar.minRange || range > sonar.range) continue;
    const diff = Math.abs(angleDiffRad(angleToPoint(ship, sub), sonar.bearing + ship.heading));
    if (diff < sonar.beamWidth / 2 && range < bestDistance) {
      best = sub;
      bestDistance = range;
    }
  }
  return best;
}

function updateSonar(dt) {
  sonar.ping -= dt;
  if (!sonar.on) return;
  if (sonar.ping <= 0) {
    const contact = nearestSonarContact();
    sonarPulses.push({ x: ship.x, y: ship.y, angle: sonar.bearing + ship.heading, t: 0 });
    blip(contact ? 520 : 1560, 0.14, contact ? 0.16 : 0.12, contact ? "triangle" : "square");
    sonar.ping = 2.4;
  }
}

function updateRadar(dt) {
  if (!radar.on) return;
  if (lastRadarContact) lastRadarContact.age += dt;
  if (lastRadarAirContact) lastRadarAirContact.age += dt;

  radar.sweepAngle = (radar.sweepAngle + dt * Math.PI * 2 / 5.8) % (Math.PI * 2);
  checkRadar(target, "surface");
  for (const plane of aircraft) checkRadar(plane, "air");

  for (let i = radarEchoes.length - 1; i >= 0; i--) {
    radarEchoes[i].t += dt;
    if (radarEchoes[i].t > 1.1) radarEchoes.splice(i, 1);
  }
}

function checkRadar(object, kind) {
  if (!object || object.alive === false || object.active === false) return;
  const range = dist(ship, object);
  if (range > radar.range) return;

  const bearing = angleToPoint(ship, object);
  const tolerance = 0.035 + Math.min(0.018, range / radar.range * 0.018);
  if (Math.abs(angleDiffRad(bearing, radar.sweepAngle)) < tolerance) {
    radarEchoes.push({ x: object.x, y: object.y, t: 0, kind });
    if (kind === "surface") lastRadarContact = { bearing: radToCourse(bearing), range: Math.round(range), age: 0, name: "Frachtowiec" };
    if (kind === "air") lastRadarAirContact = { bearing: radToCourse(bearing), range: Math.round(range), age: 0, name: "Fw 200 Condor" };
    blip(kind === "air" ? 1620 : 1320, 0.045, 0.08, "square");
  }
}

function ballisticFlightTime(range) {
  const v = guns.muzzleVelocity;
  const g = 9.81;
  const ratio = clamp(range * g / (v * v), 0.01, 0.95);
  const angle = Math.asin(ratio) / 2;
  return (2 * v * Math.sin(angle)) / g;
}

function fireGuns() {
  ensureAudio();
  let fired = false;

  for (const turret of turrets) {
    if (turret.reload > 0) continue;
    if (!turretCanFire(turret, guns.bearing)) continue;

    const start = turretWorldPos(turret);
    const aim = getAimPoint();
    const flightTime = ballisticFlightTime(guns.range);

    shells.push({
      startX: start.x,
      startY: start.y,
      endX: aim.x,
      endY: aim.y,
      x: start.x,
      y: start.y,
      z: 0,
      t: 0,
      flightTime,
      turret: turret.name
    });

    muzzleFlashes.push({ x: start.x, y: start.y, angle: guns.bearing, t: 0 });
    turret.reload = turret.baseReload + (Math.random() - 0.5) * 0.8;
    blip(92, 0.16, 0.20, "square");
    burst(0.18, 0.20, 260);
    fired = true;
    break;
  }

  if (!fired) lastMessage = "Żadna armata nie ma sektora ostrzału albo trwa przeładowanie.";
}

function turretCanFire(turret, bearing) {
  const relative = (radToCourse(bearing - ship.heading) + 360) % 360;
  const low = (turret.arc[0] + 360) % 360;
  const high = (turret.arc[1] + 360) % 360;
  return low < high ? relative >= low && relative <= high : relative >= low || relative <= high;
}

function turretWorldPos(turret) {
  return {
    x: ship.x + Math.cos(ship.heading) * turret.x - Math.sin(ship.heading) * turret.y,
    y: ship.y + Math.sin(ship.heading) * turret.x + Math.cos(ship.heading) * turret.y
  };
}

function getAimPoint() {
  return { x: ship.x + Math.cos(guns.bearing) * guns.range, y: ship.y + Math.sin(guns.bearing) * guns.range };
}

function updateProjectiles(dt) {
  for (const turret of turrets) turret.reload = Math.max(0, turret.reload - dt);

  for (let i = shells.length - 1; i >= 0; i--) {
    const shell = shells[i];
    shell.t += dt;
    const p = clamp(shell.t / shell.flightTime, 0, 1);
    shell.x = shell.startX + (shell.endX - shell.startX) * p;
    shell.y = shell.startY + (shell.endY - shell.startY) * p;
    shell.z = Math.sin(p * Math.PI) * 260;

    if (p >= 1) {
      const hit = target.alive && Math.hypot(shell.endX - target.x, shell.endY - target.y) < 58;
      splashes.push({ x: shell.endX, y: shell.endY, t: 0, maxT: hit ? 1.4 : 1.0, hit });

      if (hit) {
        const damage = 42 + Math.random() * 18;
        target.hp = Math.max(0, target.hp - damage);
        lastMessage = `Trafienie ${shell.turret}: -${Math.round(damage)} HP, cel ${Math.round(target.hp)} HP.`;
        if (target.hp <= 0) {
          wrecks.push({ ...target, t: 0 });
          target.alive = false;
          window.setTimeout(() => { target = randomTarget(); }, 10000);
        }
      }

      shells.splice(i, 1);
    }
  }

  for (let i = splashes.length - 1; i >= 0; i--) {
    splashes[i].t += dt;
    if (splashes[i].t > splashes[i].maxT) splashes.splice(i, 1);
  }

  for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
    muzzleFlashes[i].t += dt;
    if (muzzleFlashes[i].t > 0.18) muzzleFlashes.splice(i, 1);
  }

  for (let i = aaTracers.length - 1; i >= 0; i--) {
    aaTracers[i].t += dt;
    if (aaTracers[i].t > aaTracers[i].maxT) aaTracers.splice(i, 1);
  }

  for (let i = aaBursts.length - 1; i >= 0; i--) {
    aaBursts[i].t += dt;
    if (aaBursts[i].t > aaBursts[i].maxT) aaBursts.splice(i, 1);
  }
}

function draw() {
  resizeAll();
  updateCamera();
  game.classList.toggle("aiming", inputMode === "AIM");

  drawOcean();
  drawOverlays();
  drawWrecks();
  drawTarget();
  drawSubs();
  drawRadarSweep();
  drawSonarCone();
  drawSensorEffects();
  drawEffects();
  drawAircraft();
  drawAA();
  drawSmoke();

  const shipScreen = worldToScreen(ship);
  drawFletcher(ctx, shipScreen.x, shipScreen.y, ship.heading, clamp(0.18 * Math.sqrt(zoom), 0.18, 12));

  drawBoxes();
  drawHud();
  drawScopes();
  drawShipPanel();
}

function drawOcean() {
  const w = game.width;
  const h = game.height;
  const gradient = ctx.createRadialGradient(w * 0.52, h * 0.44, 40, w * 0.52, h * 0.44, Math.max(w, h));
  gradient.addColorStop(0, "#1f3f4a");
  gradient.addColorStop(0.55, "#14313c");
  gradient.addColorStop(1, "#071923");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  drawGrid();
  drawWaves();
  drawVisibility();
  drawWake();
  drawRain();
  drawWind();
}

function drawGrid() {
  const step = 10000;
  const w = game.width;
  const h = game.height;
  ctx.save();
  ctx.strokeStyle = "rgba(220,230,215,.18)";
  ctx.lineWidth = 1;

  for (let wx = Math.floor(camera.x / step) * step; wx <= camera.x + w * metersPerPixel + step; wx += step) {
    const sx = (wx - camera.x) / metersPerPixel;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
    ctx.stroke();
  }

  for (let wy = Math.floor(camera.y / step) * step; wy <= camera.y + h * metersPerPixel + step; wy += step) {
    const sy = (wy - camera.y) / metersPerPixel;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
    ctx.stroke();
  }

  ctx.restore();
}

function drawWaves() {
  const w = game.width;
  const h = game.height;
  ctx.save();
  ctx.strokeStyle = `rgba(182,205,210,${0.04 + weather.wave * 0.04})`;
  ctx.lineWidth = 1;

  const spacing = 85;
  const segment = 120;
  const amp = 0.45 + weather.wave * 1.35;

  for (let wy = Math.floor(camera.y / spacing) * spacing; wy <= camera.y + h * metersPerPixel + spacing; wy += spacing) {
    for (let wx = Math.floor(camera.x / segment) * segment; wx <= camera.x + w * metersPerPixel + segment; wx += segment) {
      const sx = (wx - camera.x) / metersPerPixel;
      const sy = (wy - camera.y) / metersPerPixel;
      const len = Math.max(5, Math.min(22, segment / metersPerPixel * 0.28));
      const y = sy + Math.sin((wx + wy * 0.7) * 0.012) * amp;
      ctx.beginPath();
      ctx.moveTo(sx - len * 0.5, y);
      ctx.quadraticCurveTo(sx, y - amp * 0.7, sx + len * 0.5, y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawVisibility() {
  const center = worldToScreen(ship);
  const r = weather.visibility / metersPerPixel;
  ctx.save();

  ctx.strokeStyle = "rgba(207,215,178,.70)";
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const gradient = ctx.createRadialGradient(center.x, center.y, r * 0.96, center.x, center.y, Math.max(r * 1.18, Math.max(game.width, game.height) * 1.05));
  gradient.addColorStop(0, "rgba(190,196,182,0)");
  gradient.addColorStop(0.10, "rgba(190,196,182,.16)");
  gradient.addColorStop(0.30, "rgba(190,196,182,.30)");
  gradient.addColorStop(1, "rgba(190,196,182,.42)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, game.width, game.height);

  ctx.restore();
}

function drawWind() {
  if (!windLayerOn) return;
  const spacing = 280;
  const dx = Math.cos(weather.windDir);
  const dy = Math.sin(weather.windDir);
  const px = -dy;
  const py = dx;
  const offset = (weather.t * weather.windSpeed * 0.35) % spacing;

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "#c0cab8";
  ctx.fillStyle = "#c0cab8";
  ctx.lineWidth = 1;

  for (let row = -2; row < game.height / spacing + 3; row++) {
    for (let col = -2; col < game.width / spacing + 3; col++) {
      const baseX = col * spacing + px * row * 22 + dx * offset;
      const baseY = row * spacing + py * col * 12 + dy * offset;
      const x = ((baseX % (game.width + spacing)) + (game.width + spacing)) % (game.width + spacing) - spacing / 2;
      const y = ((baseY % (game.height + spacing)) + (game.height + spacing)) % (game.height + spacing) - spacing / 2;
      const len = 28;

      ctx.beginPath();
      ctx.moveTo(x - dx * len * 0.5, y - dy * len * 0.5);
      ctx.lineTo(x + dx * len * 0.5, y + dy * len * 0.5);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + dx * len * 0.5, y + dy * len * 0.5);
      ctx.lineTo(x + dx * len * 0.22 + px * 5, y + dy * len * 0.22 + py * 5);
      ctx.lineTo(x + dx * len * 0.22 - px * 5, y + dy * len * 0.22 - py * 5);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawWake() {
  ctx.save();
  for (const mark of wake) {
    const point = worldToScreen(mark);
    const life = clamp(1 - mark.t / 65, 0, 1);
    const len = (90 + mark.t * 18) / metersPerPixel;
    const spread = (15 + mark.t * 4) / metersPerPixel;
    ctx.globalAlpha = 0.20 * life * mark.intensity;
    ctx.strokeStyle = "rgba(220,235,225,.70)";
    ctx.lineWidth = Math.max(0.8, 1.8 * life);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(mark.heading);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-len, -spread);
    ctx.moveTo(0, 0);
    ctx.lineTo(-len, spread);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawRain() {
  ctx.save();
  ctx.strokeStyle = `rgba(210,225,220,${0.018 + weather.rain * 0.03})`;
  for (let i = 0; i < rainDrops.length; i += 2) {
    const drop = rainDrops[i];
    const x = ((drop.x * game.width + weather.t * weather.windSpeed * 8 * drop.s) % (game.width + 80)) - 40;
    const y = ((drop.y * game.height + weather.t * 90 * drop.s) % (game.height + 80)) - 40;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(weather.windDir) * 10 * drop.s, y + (Math.sin(weather.windDir) * 10 + 7) * drop.s);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOverlays() {
  drawRangeCircles();
  drawPredictedTrack();
  drawArrow(ship, ship.heading, 900, "kurs", "rgba(225,235,225,.85)");
  drawGunnery();
}

function drawRangeCircles() {
  const center = worldToScreen(ship);
  function circle(range, color, dash = [], lineWidth = 1.6) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.arc(center.x, center.y, range / metersPerPixel, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  circle(sonar.range, "rgba(111,226,93,.82)", [9, 5]);
  circle(radar.range, "rgba(74,182,255,.95)", [9, 5], 2.2);
  circle(guns.maxRange, "rgba(217,170,42,.9)", [10, 5]);
  circle(weather.visibility, "rgba(207,215,178,.75)", [10, 8]);

  if (infoOn) {
    labelRange(`RADAR ${radar.range}m`, radar.range, 40, "#4ab6ff");
    labelRange(`SONAR ${sonar.range}m`, sonar.range, 140, "#6fe25d");
    labelRange(`DZIAŁA ${guns.maxRange}m`, guns.maxRange, 220, "#d9aa2a");
    labelRange(`WIDZ. ${Math.round(weather.visibility)}m`, weather.visibility, 80, "#cfd7b2");
  }
}

function labelRange(text, range, degrees, color) {
  const center = worldToScreen(ship);
  const x = center.x + Math.cos(degToRad(degrees)) * range / metersPerPixel;
  const y = center.y + Math.sin(degToRad(degrees)) * range / metersPerPixel;
  ctx.save();
  ctx.font = "bold 13px Courier New";
  ctx.fillStyle = "rgba(5,8,6,.72)";
  ctx.strokeStyle = color;
  const width = ctx.measureText(text).width + 12;
  roundRect(ctx, x + 8, y - 18, width, 22, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(text, x + 14, y - 3);
  ctx.restore();
}

function drawPredictedTrack() {
  if (Math.abs(ship.speed) < 0.3) return;
  let x = ship.x;
  let y = ship.y;
  let heading = ship.heading;
  const points = [];

  for (let t = 0; t <= 30; t += 2) {
    heading += (ship.rudder / ship.maxRudder) * (Math.abs(ship.speed) / speedOrders.at(-1).value) * 0.105 * 2 * Math.sign(ship.speed || 1);
    x += Math.cos(heading) * ship.speed * SIM_SPEED * 2;
    y += Math.sin(heading) * ship.speed * SIM_SPEED * 2;
    points.push(worldToScreen({ x, y }));
  }

  ctx.save();
  ctx.strokeStyle = "rgba(255,196,80,.42)";
  ctx.setLineDash([5, 8]);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points) ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.restore();
}

function drawArrow(origin, angle, lengthM, label, color) {
  const screen = worldToScreen(origin);
  const length = lengthM / metersPerPixel;
  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(length, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(length, 0);
  ctx.lineTo(length - 10, -5);
  ctx.lineTo(length - 10, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGunnery() {
  const aim = getAimPoint();
  const shipScreen = worldToScreen(ship);
  const aimScreen = worldToScreen(aim);

  ctx.save();
  ctx.strokeStyle = "rgba(217,170,42,.85)";
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  ctx.moveTo(shipScreen.x, shipScreen.y);
  ctx.lineTo(aimScreen.x, aimScreen.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(aimScreen.x, aimScreen.y, 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  if (infoOn) {
    ctx.save();
    ctx.font = "bold 14px Courier New";
    ctx.fillStyle = "#d9aa2a";
    ctx.fillText(`POCISK ${ballisticFlightTime(guns.range).toFixed(1)}s`, aimScreen.x + 18, aimScreen.y + 28);
    ctx.fillText(`ODL ${target.alive ? Math.round(Math.hypot(aim.x - target.x, aim.y - target.y)) : "---"}m`, aimScreen.x + 18, aimScreen.y + 46);
    ctx.restore();
  }
}

function drawRadarSweep() {
  if (!radar.on) return;
  const center = worldToScreen(ship);
  const length = radar.range / metersPerPixel;
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(radar.sweepAngle);
  const gradient = ctx.createLinearGradient(0, 0, length, 0);
  gradient.addColorStop(0, "rgba(74,182,255,.16)");
  gradient.addColorStop(0.72, "rgba(74,182,255,.54)");
  gradient.addColorStop(1, "rgba(74,182,255,.02)");
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(length, 0);
  ctx.stroke();
  ctx.restore();
}

function drawSonarCone() {
  if (!sonar.on) return;
  const center = worldToScreen(ship);
  const angle = sonar.bearing + ship.heading;
  const radius = sonar.range / metersPerPixel;
  const half = sonar.beamWidth / 2;

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(angle);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, "rgba(111,226,93,.105)");
  gradient.addColorStop(0.45, "rgba(111,226,93,.052)");
  gradient.addColorStop(1, "rgba(111,226,93,.010)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let a = -half; a <= half + 0.001; a += sonar.beamWidth / 30) ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
  ctx.closePath();
  ctx.fill();

  const phase = (weather.t * 420) % sonar.range;
  for (let k = 0; k < 3; k++) {
    const pulseRadius = ((phase + k * sonar.range / 3) % sonar.range) / metersPerPixel;
    ctx.strokeStyle = `rgba(111,226,93,${0.34 * (1 - pulseRadius / radius)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let a = -half; a <= half + 0.001; a += sonar.beamWidth / 32) {
      const x = Math.cos(a) * pulseRadius;
      const y = Math.sin(a) * pulseRadius;
      if (a === -half) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function drawSensorEffects() {
  for (const echo of radarEchoes) {
    const point = worldToScreen(echo);
    ctx.save();
    ctx.strokeStyle = echo.kind === "air" ? `rgba(120,210,255,${1 - echo.t / 1.1})` : `rgba(74,182,255,${1 - echo.t / 1.1})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 8 + echo.t * 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawTarget() {
  if (!target.alive) return;
  drawFreighter(ctx, target, false);
}

function drawWrecks() {
  for (const wreck of wrecks) {
    ctx.save();
    ctx.globalAlpha = 0.62;
    drawFreighter(ctx, wreck, true);
    ctx.restore();
  }
}

function drawFreighter(context, object, wreck = false) {
  const point = worldToScreen(object);
  const scale = 1 / metersPerPixel;
  context.save();
  context.translate(point.x, point.y);
  context.rotate(object.heading);
  context.scale(scale, scale);
  context.fillStyle = wreck ? "rgba(90,75,55,.45)" : "#aeb8aa";
  context.strokeStyle = wreck ? "#cfc3a2" : "#0b100d";
  context.lineWidth = metersPerPixel * 1.2;
  context.beginPath();
  context.moveTo(object.length / 2, 0);
  context.lineTo(object.length / 2 - 18, -object.beam / 2);
  context.lineTo(-object.length / 2, -object.beam / 2);
  context.lineTo(-object.length / 2, object.beam / 2);
  context.lineTo(object.length / 2 - 18, object.beam / 2);
  context.closePath();
  context.fill();
  context.stroke();

  if (wreck) {
    context.beginPath();
    context.moveTo(-object.length / 2, -object.beam / 2);
    context.lineTo(object.length / 2, object.beam / 2);
    context.moveTo(-object.length / 2, object.beam / 2);
    context.lineTo(object.length / 2, -object.beam / 2);
    context.stroke();
  } else {
    context.fillStyle = "#d9e3d3";
    context.fillRect(-20, -4, 28, 8);
  }

  context.restore();
}

function drawSubs() {
  for (const sub of subs) {
    const point = worldToScreen(sub);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(sub.heading);
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#6fe25d";
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawAircraft() {
  for (const plane of aircraft) {
    const point = worldToScreen(plane);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(plane.heading);
    ctx.scale(0.7, 0.7);
    ctx.strokeStyle = plane.damaged ? "rgba(255,210,150,.82)" : "rgba(230,230,230,.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-16, 0);
    ctx.moveTo(-3, 0);
    ctx.lineTo(-12, -12);
    ctx.moveTo(-3, 0);
    ctx.lineTo(-12, 12);
    ctx.moveTo(8, 0);
    ctx.lineTo(18, -18);
    ctx.moveTo(8, 0);
    ctx.lineTo(18, 18);
    ctx.stroke();
    ctx.restore();
  }
}

function drawAA() {
  for (const tracer of aaTracers) {
    const alpha = 1 - tracer.t / tracer.maxT;
    const p1 = worldToScreen({ x: tracer.x1, y: tracer.y1 });
    const p2 = worldToScreen({ x: tracer.x2, y: tracer.y2 });
    ctx.save();
    ctx.strokeStyle = `rgba(255,74,53,${0.85 * alpha})`;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  for (const burstPoint of aaBursts) {
    const alpha = 1 - burstPoint.t / burstPoint.maxT;
    const point = worldToScreen(burstPoint);
    ctx.save();
    ctx.strokeStyle = `rgba(255,74,53,${0.8 * alpha})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4 + burstPoint.t * 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSmoke() {
  ctx.save();
  for (const puff of smoke) {
    const point = worldToScreen(puff);
    const life = clamp(1 - puff.t / 18, 0, 1);
    ctx.globalAlpha = 0.09 * life;
    ctx.fillStyle = "#c7c7bd";
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(1.2, puff.r / metersPerPixel), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawEffects() {
  for (const flash of muzzleFlashes) {
    const point = worldToScreen(flash);
    const alpha = 1 - flash.t / 0.18;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(flash.angle);
    ctx.fillStyle = `rgba(255,74,53,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(20 * alpha, -6 * alpha);
    ctx.lineTo(29 * alpha, 0);
    ctx.lineTo(20 * alpha, 6 * alpha);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  for (const shell of shells) {
    const point = worldToScreen(shell);
    ctx.save();
    ctx.fillStyle = "#ff4a35";
    ctx.beginPath();
    ctx.arc(point.x, point.y - shell.z / metersPerPixel * 0.75, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const splash of splashes) {
    const point = worldToScreen(splash);
    const progress = splash.t / splash.maxT;
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = splash.hit ? "#f3e8bd" : "#d8e8d5";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6 + progress * 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFletcher(context, x, y, heading, scale = 1) {
  context.save();
  context.translate(x, y);
  context.rotate(heading);
  context.scale(scale, scale);
  context.lineWidth = 1.4 / Math.max(scale, 0.1);
  context.strokeStyle = "#0b100d";
  context.fillStyle = "#858f84";
  context.beginPath();
  context.moveTo(58, 0);
  context.lineTo(42, -8);
  context.lineTo(-45, -9);
  context.lineTo(-69, 0);
  context.lineTo(-45, 9);
  context.lineTo(42, 8);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "#aab3a7";
  context.fillRect(-42, -4.8, 82, 9.6);
  context.fillStyle = "#c0c7bd";
  context.fillRect(11, -6.5, 19, 13);
  context.fillStyle = "#747f76";
  context.fillRect(-28, -4.5, 9, 9);
  context.fillRect(-38, -4.2, 7, 8.4);

  for (const turret of turrets) drawTurret(context, turret.x, turret.y, guns.bearing - heading, scale);
  context.restore();
}

function drawTurret(context, x, y, angle, scale) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.fillStyle = "#d7ddd1";
  context.strokeStyle = "#0b100d";
  context.lineWidth = 1 / Math.max(scale, 0.1);
  context.beginPath();
  context.arc(0, 0, 3.2, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(12, 0);
  context.stroke();
  context.restore();
}

function drawBoxes() {
  drawBox(14, 12, [`POZYCJA`, `X ${Math.round(ship.x)} m`, `Y ${Math.round(ship.y)} m`, `SEKTOR ${Math.floor(ship.x / 10000)}-${Math.floor(ship.y / 10000)}`]);

  drawBox(14, 124, lastRadarContact && lastRadarContact.age < 12
    ? [`${lastRadarContact.name}`, `NAMIAR ${lastRadarContact.bearing.toFixed(0).padStart(3, "0")}°`, `ODL. ${lastRadarContact.range} m`, `OD ECHA ${lastRadarContact.age.toFixed(1)} s`]
    : [`RADAR CEL`, `BRAK`, `---`, `---`]);

  drawBox(14, 236, lastRadarAirContact && lastRadarAirContact.age < 12
    ? [`${lastRadarAirContact.name}`, `NAMIAR ${lastRadarAirContact.bearing.toFixed(0).padStart(3, "0")}°`, `ODL. ${lastRadarAirContact.range} m`, `OD ECHA ${lastRadarAirContact.age.toFixed(1)} s`]
    : [`RADAR LOT`, `BRAK`, `---`, `---`]);

  drawBox(game.width - 204, 12, [`POGODA`, `WIATR ${radToCourse(weather.windDir).toFixed(0)}°`, `${weather.windSpeed.toFixed(1)} m/s`, `FALA ${weather.wave.toFixed(2)}`, `WIDZ. ${Math.round(weather.visibility)} m`], 190);
}

function drawBox(x, y, lines, width = 190) {
  ctx.save();
  ctx.font = "bold 17px Courier New";
  const height = 26 + lines.length * 22;
  ctx.fillStyle = "rgba(5,8,6,.72)";
  ctx.strokeStyle = "rgba(217,227,211,.42)";
  roundRect(ctx, x, y, width, height, 8);
  ctx.fill();
  ctx.stroke();
  lines.forEach((line, index) => {
    ctx.fillStyle = index ? "#c0cab8" : "#d9e3d3";
    ctx.fillText(line, x + 10, y + 22 + index * 22);
  });
  ctx.restore();
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function drawHud() {
  const order = speedOrders[ship.targetSpeedIndex];
  const course = radToCourse(ship.heading).toFixed(0).padStart(3, "0");
  const rudderSide = ship.rudder < -0.5 ? "L" : ship.rudder > 0.5 ? "P" : "ZERO";
  const text = `PRĘDKOŚĆ ${order.name} / ${(ship.speed * MS_TO_KNOT).toFixed(1)} w.   STER ${Math.abs(ship.rudder).toFixed(0)}° ${rudderSide}   KURS ${course}°`;

  ctx.save();
  ctx.font = "bold 18px Courier New";
  const width = ctx.measureText(text).width + 32;
  const x = (game.width - width) / 2;
  const y = game.height - 52;
  ctx.fillStyle = "rgba(5,8,6,.76)";
  ctx.strokeStyle = "rgba(217,227,211,.48)";
  roundRect(ctx, x, y, width, 38, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#d9e3d3";
  ctx.fillText(text, x + 16, y + 25);
  ctx.restore();
}

function drawScopes() {
  drawScope(sonarCtx, "sonar");
  drawScope(radarCtx, "radar");
}

function drawScope(context, type) {
  const w = context.canvas.width;
  const h = context.canvas.height;
  const size = Math.min(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const r = size * 0.42;
  const range = type === "sonar" ? sonar.range : radar.range;
  const color = type === "sonar" ? "#6fe25d" : "#4ab6ff";

  context.clearRect(0, 0, w, h);
  context.save();
  context.fillStyle = "#030706";
  context.fillRect(0, 0, w, h);
  context.strokeStyle = color;
  context.lineWidth = 1;

  for (let rr = r / 4; rr <= r; rr += r / 4) {
    context.globalAlpha = 0.45;
    context.beginPath();
    context.arc(cx, cy, rr, 0, Math.PI * 2);
    context.stroke();
  }

  context.globalAlpha = 1;
  context.beginPath();
  context.arc(cx, cy, r, 0, Math.PI * 2);
  context.stroke();

  if (type === "radar" && radar.on) {
    context.save();
    context.translate(cx, cy);
    context.rotate(radar.sweepAngle);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(r, 0);
    context.stroke();
    context.restore();

    if (target.alive) drawScopeDot(context, cx, cy, target, range, r, color);
    for (const plane of aircraft) drawScopeCross(context, cx, cy, plane, range, r, color);
  }

  if (type === "sonar" && sonar.on) {
    for (const sub of subs) drawScopeDot(context, cx, cy, sub, range, r, color);
  }

  context.fillStyle = color;
  context.font = "12px Courier New";
  context.fillText(`${range} m`, 8, h - 10);
  context.restore();
}

function drawScopeDot(context, cx, cy, object, range, radius, color) {
  const dx = object.x - ship.x;
  const dy = object.y - ship.y;
  const d = Math.hypot(dx, dy);
  if (d <= range) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(cx + dx / range * radius, cy + dy / range * radius, 4, 0, Math.PI * 2);
    context.fill();
  }
}

function drawScopeCross(context, cx, cy, object, range, radius, color) {
  const dx = object.x - ship.x;
  const dy = object.y - ship.y;
  const d = Math.hypot(dx, dy);
  if (d <= range) {
    const x = cx + dx / range * radius;
    const y = cy + dy / range * radius;
    context.strokeStyle = color;
    context.beginPath();
    context.moveTo(x - 4, y);
    context.lineTo(x + 4, y);
    context.moveTo(x, y - 4);
    context.lineTo(x, y + 4);
    context.stroke();
  }
}

function drawShipPanel() {
  const w = shipView.width;
  const h = shipView.height;
  shipCtx.clearRect(0, 0, w, h);
  shipCtx.fillStyle = "#030706";
  shipCtx.fillRect(0, 0, w, h);
  drawFletcher(shipCtx, w / 2, h / 2 - 2, ship.heading, Math.min(w, h) / 210);
  shipCtx.fillStyle = "#95a18f";
  shipCtx.font = "12px Courier New";
  shipCtx.fillText(`WIATR ${radToCourse(weather.windDir).toFixed(0)}° / ${weather.windSpeed.toFixed(1)} m/s`, 8, h - 10);
}

function updateUI() {
  const order = speedOrders[ship.targetSpeedIndex];
  const course = radToCourse(ship.heading);
  const rudderSide = ship.rudder < -0.5 ? "L" : ship.rudder > 0.5 ? "P" : "";

  sonarStatus.textContent = sonar.on ? "WŁ." : "WYŁ.";
  sonarStatus.className = sonar.on ? "statusOn" : "statusOff";
  sonarButton.textContent = sonar.on ? "WYŁĄCZ" : "WŁĄCZ";
  radarStatus.textContent = radar.on ? "WŁ." : "WYŁ.";
  radarStatus.className = radar.on ? "statusOn" : "statusOff";

  speedRead.textContent = order.name;
  rudderRead.textContent = `${Math.abs(ship.rudder).toFixed(0)}° ${rudderSide}`;
  courseRead.textContent = `${course.toFixed(0).padStart(3, "0")}°`;
  windShort.textContent = `${radToCourse(weather.windDir).toFixed(0)}° ${weather.windSpeed.toFixed(0)}m/s`;

  weaponRead.innerHTML =
    `TRYB: <span style="color:var(--guns)">${guns.mode}</span><br>` +
    `KĄT: <span style="color:var(--guns)">${radToCourse(guns.bearing).toFixed(0).padStart(3, "0")}°</span><br>` +
    `ZASIĘG: <span style="color:var(--guns)">${Math.round(guns.range)} m</span><br>` +
    `CEL HP: <span style="color:var(--guns)">${target.alive ? Math.round(target.hp) : "---"}</span><br>` +
    `5”/38: zwykle 2–3 trafienia`;

  consolePanel.textContent =
    `Fletcher: max 37 w. | Condor: ${Math.round(aircraft[0].speed * MS_TO_KNOT)} w. | Radar: obrotowa kreska | Morze: Atlantyk\n` +
    `Sterowanie: W/S/+/- prędkość, A/D ster, G wpis kurs/kąt, F auto/manual, R reset dział, < > obrót, O/L zasięg, [ ] sonar, Spacja strzał\n` +
    `${lastMessage}`;
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  weather.t += dt;

  updateOrders(dt);
  updatePhysics(dt);
  updateWakeSmoke(dt);
  updateTargets(dt);
  updateSonar(dt);
  updateRadar(dt);
  updateProjectiles(dt);

  draw();
  updateUI();
  requestAnimationFrame(loop);
}

})();