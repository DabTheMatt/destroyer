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
const windLayerButton = document.getElementById("windLayerButton");
const aimInfoButton = document.getElementById("aimInfoButton");
const speedRead = document.getElementById("speedRead");
const rudderRead = document.getElementById("rudderRead");
const courseRead = document.getElementById("courseRead");
const weaponRead = document.getElementById("weaponRead");
const windShort = document.getElementById("windShort");

const WORLD_W = 30000;
const WORLD_H = 30000;
const KNOT_TO_MS = 0.514444;
const MS_TO_KNOT = 1 / KNOT_TO_MS;
const SIM_SPEED_MULTIPLIER = 14;
const AA_RANGE_M = 3810;

let baseMetersPerPixel = 42;
let METERS_PER_PIXEL = 42;
let zoom = 1.0;
const MIN_ZOOM = 0.38;
const MAX_ZOOM = 80.0;

const keysPressed = new Set();
const keysHandled = new Set();

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

const sonar = {
  on: false,
  minRange: 300,
  range: 2500,
  bearing: degToRad(0),
  beamWidth: degToRad(14),
  pingCooldown: 0
};

const radar = { range: 9500, sweepCooldown: 0 };
const guns = {
  mode: "MANUAL",
  bearing: degToRad(0),
  relativeBearing: 0,
  range: 4500,
  minRange: 1200,
  maxRange: 16460,
  muzzleVelocity: 792,
  reload: 0,
  reloadTime: 1.0
};

const weather = {
  t: 0,
  rain: 0.28,
  wave: 0.34,
  windDir: degToRad(305),
  windSpeed: 14.5,
  visibility: 5200,
  targetRain: 0.28,
  targetWave: 0.34,
  targetWindDir: degToRad(305),
  targetWindSpeed: 14.5,
  changeTimer: 0
};

const forecast = {
  rain: 0.32,
  wave: 0.38,
  windDir: degToRad(292),
  windSpeed: 12.0,
  visibility: 5600
};

let target = randomTarget();
let targetRespawnTimer = null;
let courseInput = "";
let angleInput = "";
let inputMode = "COURSE";
let lastMessage = "Gotowy. Sonar wyłączony.";
let lastRadarContact = null;
let lastRadarAirContact = null;
let audioCtx = null;
let lastTime = performance.now();

let windLayerOn = true;
let aimInfoOn = true;
let windAnimOffset = 0;
let wakeBuild = 0;

const shells = [];
const splashes = [];
const muzzleFlashes = [];
const wake = [];
const smokePuffs = [];
const sonarPulses = [];
const radarPings = [];
const radarEchoes = [];
const wrecks = [];
const underwaterTargets = Array.from({ length: 3 }, () => randomSubmergedTarget());
const aaBursts = [];
const aaTracers = [];
const aircraft = Array.from({ length: 3 }, (_, i) => makeCondor(i));
const rainDrops = Array.from({ length: 130 }, () => ({ x: Math.random(), y: Math.random(), s: 0.55 + Math.random() * 1.25 }));
const drag = { active: false, lastX: 0, lastY: 0 };

resizeAll();
bindEvents();
requestAnimationFrame(loop);

function bindEvents() {
  window.addEventListener("resize", resizeAll);
  sonarButton.addEventListener("click", toggleSonar);
  windLayerButton.addEventListener("click", toggleWindLayer);
  aimInfoButton.addEventListener("click", toggleAimInfo);

  game.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = game.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const mouse = { x: (event.clientX - rect.left) * dpr, y: (event.clientY - rect.top) * dpr };

    updateMapScale();
    const worldBefore = { x: camera.x + mouse.x * METERS_PER_PIXEL, y: camera.y + mouse.y * METERS_PER_PIXEL };

    zoom = clamp(zoom * Math.exp(-event.deltaY * 0.0012), MIN_ZOOM, MAX_ZOOM);
    updateMapScale();

    camera.x = worldBefore.x - mouse.x * METERS_PER_PIXEL;
    camera.y = worldBefore.y - mouse.y * METERS_PER_PIXEL;
    camera.manualOffsetX = camera.x - (ship.x - game.width * METERS_PER_PIXEL * camera.anchorX);
    camera.manualOffsetY = camera.y - (ship.y - game.height * METERS_PER_PIXEL * camera.anchorY);
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
    camera.manualOffsetX -= dx * METERS_PER_PIXEL;
    camera.manualOffsetY -= dy * METERS_PER_PIXEL;
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
    keysPressed.delete(key);
    keysHandled.delete(key);
  });
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  keysPressed.add(key);
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();

  if (/^[0-9]$/.test(event.key)) {
    if (inputMode === "AIM") angleInput = (angleInput + event.key).slice(-3);
    else courseInput = (courseInput + event.key).slice(-3);
  }

  if (event.key === "Enter") {
    if (inputMode === "AIM" && angleInput.length > 0) {
      const angle = Number(angleInput);
      guns.bearing = degToRad(((angle % 360) + 360) % 360);
      guns.relativeBearing = angleDiffRad(guns.bearing, ship.heading);
      angleInput = "";
    } else if (inputMode === "COURSE" && courseInput.length > 0) {
      const course = Number(courseInput);
      ship.orderedCourse = ((course % 360) + 360) % 360;
      ship.autopilot = true;
      courseInput = "";
    }
  }

  if (event.key === "Escape") {
    courseInput = "";
    angleInput = "";
    ship.autopilot = false;
    ship.orderedCourse = null;
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

function wasPressedOnce(key) {
  if (keysPressed.has(key) && !keysHandled.has(key)) {
    keysHandled.add(key);
    return true;
  }
  return false;
}

function degToRad(deg) { return (deg - 90) * Math.PI / 180; }
function radToCourse(rad) { return (((rad * 180 / Math.PI) + 90) % 360 + 360) % 360; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleDiffRad(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
function angleDiffDeg(target, current) { return ((target - current + 540) % 360) - 180; }
function angleToPoint(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }

function updateMapScale() {
  const minVisibleRadiusPx = Math.min(game.width, game.height) * 0.43;
  baseMetersPerPixel = radar.range / Math.max(120, minVisibleRadiusPx);
  METERS_PER_PIXEL = baseMetersPerPixel / zoom;
}

function updateCamera() {
  updateMapScale();
  camera.x = ship.x - game.width * METERS_PER_PIXEL * camera.anchorX + camera.manualOffsetX;
  camera.y = ship.y - game.height * METERS_PER_PIXEL * camera.anchorY + camera.manualOffsetY;
}

function worldToScreen(point) {
  return { x: (point.x - camera.x) / METERS_PER_PIXEL, y: (point.y - camera.y) / METERS_PER_PIXEL };
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

function toggleSonar() {
  ensureAudio();
  sonar.on = !sonar.on;
  sonar.pingCooldown = 0;
}

function toggleWindLayer() {
  windLayerOn = !windLayerOn;
  windLayerButton.textContent = windLayerOn ? "WIATR: WŁ." : "WIATR: WYŁ.";
  windLayerButton.classList.toggle("on", windLayerOn);
}

function toggleAimInfo() {
  aimInfoOn = !aimInfoOn;
  aimInfoButton.textContent = aimInfoOn ? "INFO: WŁ." : "INFO: WYŁ.";
  aimInfoButton.classList.toggle("on", aimInfoOn);
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
    radius: 70,
    speed: 2.2 + Math.random() * 2.2,
    turnTimer: 3 + Math.random() * 8,
    alive: true
  };
}

function randomSubmergedTarget() {
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

function makeCondor(i = 0) {
  return {
    active: true,
    x: -3500 - i * 4200,
    y: 2500 + Math.random() * (WORLD_H * 0.50),
    heading: degToRad(24 + Math.random() * 16),
    speed: 55 + Math.random() * 12,
    damaged: false,
    aaCooldown: 0
  };
}


function updateWeather(dt) {
  weather.changeTimer -= dt;

  if (weather.changeTimer <= 0) {
    // Losowe, powolne zmiany pogody: wiatr może przybrać, osłabnąć albo prawie ustać.
    weather.targetWindDir += (Math.random() - 0.5) * degToRad(42);
    weather.targetWindSpeed = clamp(weather.targetWindSpeed + (Math.random() - 0.48) * 5.5, 0.4, 22);
    if (Math.random() < 0.16) weather.targetWindSpeed = Math.random() * 2.2; // cisza / prawie cisza

    weather.targetRain = clamp(weather.targetRain + (Math.random() - 0.5) * 0.34, 0, 1);
    weather.targetWave = clamp(0.12 + weather.targetWindSpeed / 28 + weather.targetRain * 0.18 + (Math.random() - 0.5) * 0.10, 0.05, 1);

    updateForecast();
    weather.changeTimer = 18 + Math.random() * 28;
  }

  const blend = 0.018 * dt;
  weather.windDir += angleDiffRad(weather.targetWindDir, weather.windDir) * blend;
  weather.windSpeed += (weather.targetWindSpeed - weather.windSpeed) * blend;
  weather.rain += (weather.targetRain - weather.rain) * blend;
  weather.wave += (weather.targetWave - weather.wave) * blend;

  // Widoczność zależy od deszczu i fali; zmienia się łagodnie.
  const desiredVisibility = clamp(8500 - weather.rain * 4700 - weather.wave * 1700 - Math.max(0, weather.windSpeed - 12) * 70, 1600, 9000);
  weather.visibility += (desiredVisibility - weather.visibility) * 0.010 * dt;
}

function updateForecast() {
  forecast.windDir = weather.targetWindDir + (Math.random() - 0.5) * degToRad(18);
  forecast.windSpeed = clamp(weather.targetWindSpeed + (Math.random() - 0.5) * 3.0, 0.2, 24);
  forecast.rain = clamp(weather.targetRain + (Math.random() - 0.5) * 0.22, 0, 1);
  forecast.wave = clamp(0.12 + forecast.windSpeed / 28 + forecast.rain * 0.16, 0.05, 1);
  forecast.visibility = clamp(8500 - forecast.rain * 4700 - forecast.wave * 1700 - Math.max(0, forecast.windSpeed - 12) * 70, 1600, 9000);
}

function weatherName(rain) {
  if (rain > 0.66) return "DESZCZ";
  if (rain > 0.25) return "MŻAWKA";
  return "SUCHO";
}

function updateOrders(dt) {
  if (wasPressedOnce("arrowup") || wasPressedOnce("w")) ship.targetSpeedIndex = clamp(ship.targetSpeedIndex + 1, 0, speedOrders.length - 1);
  if (wasPressedOnce("arrowdown") || wasPressedOnce("s")) ship.targetSpeedIndex = clamp(ship.targetSpeedIndex - 1, 0, speedOrders.length - 1);

  if (wasPressedOnce("arrowleft") || wasPressedOnce("a")) {
    ship.rudder = clamp(ship.rudder - 5, -ship.maxRudder, ship.maxRudder);
    ship.autopilot = false;
    ship.orderedCourse = null;
  }
  if (wasPressedOnce("arrowright") || wasPressedOnce("d")) {
    ship.rudder = clamp(ship.rudder + 5, -ship.maxRudder, ship.maxRudder);
    ship.autopilot = false;
    ship.orderedCourse = null;
  }

  if (wasPressedOnce("x")) ship.targetSpeedIndex = STOP_INDEX;
  if (wasPressedOnce("z")) ship.rudder = 0;
  if (wasPressedOnce("p")) toggleSonar();

  if (keysPressed.has("[") || keysPressed.has("{")) sonar.bearing -= 0.9 * dt;
  if (keysPressed.has("]") || keysPressed.has("}")) sonar.bearing += 0.9 * dt;

  if (wasPressedOnce("g")) {
    guns.mode = "MANUAL";
    inputMode = inputMode === "AIM" ? "COURSE" : "AIM";
    angleInput = "";
    courseInput = "";
  }

  if (wasPressedOnce("f")) {
    guns.mode = guns.mode === "AUTO" ? "MANUAL" : "AUTO";
    inputMode = "COURSE";
  }

  let turn = 0;
  const gunTurnRate = 10 * Math.PI / 180;
  if (keysPressed.has(",") || keysPressed.has("<")) turn -= gunTurnRate * dt;
  if (keysPressed.has(".") || keysPressed.has(">")) turn += gunTurnRate * dt;
  if (turn !== 0) {
    guns.mode = "MANUAL";
    guns.bearing += turn;
  }

  if (keysPressed.has("o")) guns.range = clamp(guns.range + 520 * dt, guns.minRange, guns.maxRange);
  if (keysPressed.has("l")) guns.range = clamp(guns.range - 520 * dt, guns.minRange, guns.maxRange);
  if (wasPressedOnce(" ")) fireGun();

  if (guns.mode === "AUTO" && target.alive) {
    const desired = angleToPoint(ship, target);
    guns.bearing += clamp(angleDiffRad(desired, guns.bearing), -0.7 * dt, 0.7 * dt);
  }
}

function updateAutopilot() {
  if (!ship.autopilot || ship.orderedCourse === null) return;
  const diff = angleDiffDeg(ship.orderedCourse, radToCourse(ship.heading));
  ship.rudder = clamp(diff * 0.16, -15, 15);
  if (Math.abs(diff) < 1.2) {
    ship.rudder = 0;
    ship.heading = degToRad(ship.orderedCourse);
    ship.autopilot = false;
  }
}

function updatePhysics(dt) {
  const previousHeading = ship.heading;
  const targetSpeed = speedOrders[ship.targetSpeedIndex].value;
  const accel = Math.abs(targetSpeed) > Math.abs(ship.speed) ? 0.55 : 0.82;
  ship.speed += clamp(targetSpeed - ship.speed, -accel * dt, accel * dt);

  updateAutopilot();

  const maxForward = speedOrders[speedOrders.length - 1].value;
  ship.heading += (ship.rudder / ship.maxRudder) * (Math.abs(ship.speed) / maxForward) * 0.105 * dt * Math.sign(ship.speed || 1);

  const windAngle = angleDiffRad(weather.windDir, ship.heading);
  const headWind = Math.cos(windAngle) * weather.windSpeed;
  const crossWind = Math.sin(windAngle) * weather.windSpeed;
  const windSpeedEffect = -headWind * 0.010 - weather.wave * 0.10;
  const leeway = crossWind * (0.010 + weather.wave * 0.004);

  if (guns.mode === "MANUAL") guns.bearing += ship.heading - previousHeading;
  guns.relativeBearing = angleDiffRad(guns.bearing, ship.heading);

  const actualSpeed = (ship.speed + windSpeedEffect * Math.sign(ship.speed || 1)) * SIM_SPEED_MULTIPLIER;
  ship.x += Math.cos(ship.heading) * actualSpeed * dt + Math.cos(weather.windDir) * leeway * SIM_SPEED_MULTIPLIER * dt;
  ship.y += Math.sin(ship.heading) * actualSpeed * dt + Math.sin(weather.windDir) * leeway * SIM_SPEED_MULTIPLIER * dt;

  ship.x = (ship.x + WORLD_W) % WORLD_W;
  ship.y = (ship.y + WORLD_H) % WORLD_H;

  wakeBuild = clamp(wakeBuild + (Math.abs(ship.speed) > 0.5 ? 0.7 : -1.4) * dt, 0, 1);
  if (wakeBuild > 0.05) addWakeSample();
  addSmokeSample(dt);
}

function addWakeSample() {
  const sternX = ship.x - Math.cos(ship.heading) * 68;
  const sternY = ship.y - Math.sin(ship.heading) * 68;
  wake.push({ x: sternX, y: sternY, t: 0, heading: ship.heading, intensity: clamp(Math.abs(ship.speed) / speedOrders.at(-1).value, 0.10, 0.75) * wakeBuild });
  while (wake.length > 420) wake.shift();
}

function addSmokeSample(dt) {
  if (Math.abs(ship.speed) < 0.4 || Math.random() > dt * 4) return;
  const stackOffset = -22;
  smokePuffs.push({
    x: ship.x + Math.cos(ship.heading) * stackOffset,
    y: ship.y + Math.sin(ship.heading) * stackOffset,
    t: 0,
    r: 4 + Math.random() * 3
  });
  while (smokePuffs.length > 90) smokePuffs.shift();
}

function updateWakeAndSmoke(dt) {
  for (const mark of wake) mark.t += dt;
  while (wake.length && wake[0].t > 65) wake.shift();

  for (const puff of smokePuffs) {
    puff.t += dt;
    puff.x += Math.cos(weather.windDir) * weather.windSpeed * 0.9 * dt;
    puff.y += Math.sin(weather.windDir) * weather.windSpeed * 0.9 * dt;
    puff.r += 0.8 * dt;
  }
  while (smokePuffs.length && smokePuffs[0].t > 18) smokePuffs.shift();
}


function updateSurfaceTarget(dt) {
  if (!target.alive) return;
  target.turnTimer -= dt;
  if (target.turnTimer <= 0) {
    target.heading += (Math.random() - 0.5) * degToRad(34);
    target.speed = clamp(target.speed + (Math.random() - 0.5) * 1.2, 1.0, 5.4);
    target.turnTimer = 5 + Math.random() * 12;
  }
  target.x += Math.cos(target.heading) * target.speed * dt * 4;
  target.y += Math.sin(target.heading) * target.speed * dt * 4;
  target.x = (target.x + WORLD_W) % WORLD_W;
  target.y = (target.y + WORLD_H) % WORLD_H;
}

function updateSubmergedTargets(dt) {
  for (const sub of underwaterTargets) {
    if (!sub.alive) continue;
    sub.x += Math.cos(sub.heading) * sub.speed * dt * 5;
    sub.y += Math.sin(sub.heading) * sub.speed * dt * 5;
    sub.x = (sub.x + WORLD_W) % WORLD_W;
    sub.y = (sub.y + WORLD_H) % WORLD_H;
    if (Math.random() < dt * 0.035) sub.heading += (Math.random() - 0.5) * 0.5;
  }
}

function nearestSonarContact() {
  let best = null;
  let bestD = Infinity;
  for (const sub of underwaterTargets) {
    if (!sub.alive) continue;
    const d = dist(ship, sub);
    if (d < sonar.minRange || d > sonar.range) continue;
    const bearingToSub = angleToPoint(ship, sub);
    const sonarWorldBearing = sonar.bearing + ship.heading;
    const diff = Math.abs(angleDiffRad(bearingToSub, sonarWorldBearing));
    if (diff <= sonar.beamWidth / 2 && d < bestD) {
      best = sub;
      bestD = d;
    }
  }
  return best;
}

function updateSonar(dt) {
  sonar.pingCooldown -= dt;
  if (!sonar.on) return;
  const contact = nearestSonarContact();
  if (sonar.pingCooldown <= 0) {
    sonarPulses.push({ x: ship.x, y: ship.y, angle: sonar.bearing + ship.heading, t: 0 });
    sonarPing(!!contact);
    sonar.pingCooldown = 2.4;
  }
}

function sonarPing(contact) {
  blip(1560, 0.16, 0.18, "square");
  if (contact) setTimeout(() => blip(520, 0.16, 0.18, "triangle"), 390);
}

function updateRadar(dt) {
  if (lastRadarContact) lastRadarContact.age += dt;
  if (lastRadarAirContact) lastRadarAirContact.age += dt;
  radar.sweepCooldown -= dt;
  if (radar.sweepCooldown <= 0) {
    radarPings.push({ x: ship.x, y: ship.y, t: 0, echoPlayed: false });
    for (const plane of (Array.isArray(aircraft) ? aircraft : [aircraft])) if (plane) plane.radarEchoThisSweep = false;
    radar.sweepCooldown = 6.0;
  }

  for (let i = radarPings.length - 1; i >= 0; i--) {
    const ping = radarPings[i];
    ping.t += dt;
    const radius = ping.t * 2900;
    const targetDistance = target.alive ? dist(ping, target) : Infinity;
    if (!ping.echoPlayed && target.alive && targetDistance <= radar.range && radius >= targetDistance) {
      ping.echoPlayed = true;
      radarEchoes.push({ x: target.x, y: target.y, t: 0 });
      lastRadarContact = { bearing: radToCourse(angleToPoint(ship, target)), range: Math.round(dist(ship, target)), age: 0 };
      ensureAudio();
      blip(1320, 0.06, 0.10, "square");
    }
    
    for (const plane of (Array.isArray(aircraft) ? aircraft : [aircraft])) {
      if (!plane || plane.active === false) continue;
      const planeDistance = dist(ping, plane);
      if (planeDistance <= radar.range && radius >= planeDistance && !plane.radarEchoThisSweep) {
        plane.radarEchoThisSweep = true;
        radarEchoes.push({ x: plane.x, y: plane.y, t: 0, air: true });
        lastRadarAirContact = {
          bearing: radToCourse(angleToPoint(ship, plane)),
          range: Math.round(dist(ship, plane)),
          age: 0
        };
        ensureAudio();
        blip(1760, 0.045, 0.075, "square");
      }
    }

    if (radius > radar.range) radarPings.splice(i, 1);
  }

  for (let i = radarEchoes.length - 1; i >= 0; i--) {
    radarEchoes[i].t += dt;
    if (radarEchoes[i].t > 1.1) radarEchoes.splice(i, 1);
  }
}

function updateAircraft(dt) {
  for (let i = 0; i < aircraft.length; i++) {
    const plane = aircraft[i];
    plane.x += Math.cos(plane.heading) * plane.speed * dt * SIM_SPEED_MULTIPLIER;
    plane.y += Math.sin(plane.heading) * plane.speed * dt * SIM_SPEED_MULTIPLIER;
    if (plane.x > WORLD_W + 3500 || plane.y > WORLD_H + 2500) Object.assign(plane, makeCondor(i));
    updateAAGunsForPlane(plane, dt);
  }
  updateAATracers(dt);
}

function updateAAGunsForPlane(plane, dt) {
  plane.aaCooldown -= dt;
  const d = dist(ship, plane);
  if (d > AA_RANGE_M || plane.aaCooldown > 0) return;
  plane.aaCooldown = 0.12;
  const muzzle = { x: ship.x + Math.cos(ship.heading) * (12 - Math.random() * 45), y: ship.y + Math.sin(ship.heading) * (12 - Math.random() * 45) };
  const spread = 80 + d * 0.035;
  const targetPoint = { x: plane.x + (Math.random() - 0.5) * spread, y: plane.y + (Math.random() - 0.5) * spread };
  aaTracers.push({ x1: muzzle.x, y1: muzzle.y, x2: targetPoint.x, y2: targetPoint.y, t: 0, maxT: 0.22 });
  if (Math.random() < (d < AA_RANGE_M * 0.55 ? 0.10 : 0.035)) {
    aaBursts.push({ x: plane.x, y: plane.y, t: 0, maxT: 0.55 });
    plane.damaged = true;
  } else {
    aaBursts.push({ x: targetPoint.x, y: targetPoint.y, t: 0, maxT: 0.36 });
  }
}

function updateAATracers(dt) {
  for (let i = aaTracers.length - 1; i >= 0; i--) {
    aaTracers[i].t += dt;
    if (aaTracers[i].t > aaTracers[i].maxT) aaTracers.splice(i, 1);
  }
  for (let i = aaBursts.length - 1; i >= 0; i--) {
    aaBursts[i].t += dt;
    if (aaBursts[i].t > aaBursts[i].maxT) aaBursts.splice(i, 1);
  }
}

function ballisticFlightTime(rangeM) {
  const v = guns.muzzleVelocity;
  const g = 9.81;
  const safeRange = clamp(rangeM, 100, guns.maxRange);
  const ratio = clamp((safeRange * g) / (v * v), 0.01, 0.95);
  const angle = Math.asin(ratio) / 2;
  return (2 * v * Math.sin(angle)) / g;
}

function updateProjectiles(dt) {
  guns.reload = Math.max(0, guns.reload - dt);
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
        wrecks.push({ x: target.x, y: target.y, heading: target.heading, length: target.length, beam: target.beam, t: 0 });
        target.alive = false;
        targetRespawnTimer = 10;
      }
      ensureAudio();
      burst(hit ? 0.40 : 0.32, hit ? 0.28 : 0.18, hit ? 230 : 680);
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
}

function respawnTarget(dt) {
  if (target.alive) return;
  targetRespawnTimer -= dt;
  if (targetRespawnTimer <= 0) {
    target = randomTarget();
    targetRespawnTimer = null;
  }
}

function getAimPoint() {
  return { x: ship.x + Math.cos(guns.bearing) * guns.range, y: ship.y + Math.sin(guns.bearing) * guns.range };
}

function getGunMuzzle() {
  return { x: ship.x + Math.cos(ship.heading) * 28, y: ship.y + Math.sin(ship.heading) * 28 };
}

function fireGun() {
  if (guns.reload > 0) return;
  const aim = getAimPoint();
  const start = getGunMuzzle();
  const flightTime = ballisticFlightTime(guns.range);
  shells.push({ startX: start.x, startY: start.y, endX: aim.x, endY: aim.y, x: start.x, y: start.y, z: 0, t: 0, flightTime });
  muzzleFlashes.push({ x: start.x, y: start.y, angle: guns.bearing, t: 0 });
  guns.reload = guns.reloadTime;
  ensureAudio();
  blip(92, 0.20, 0.32, "square");
  burst(0.28, 0.30, 260);
}

function drawMain() {
  resizeAll();
  updateCamera();
  game.classList.toggle("aiming", inputMode === "AIM" && !drag.active);

  drawOcean();
  drawTacticalOverlays();
  drawAimInfo();
  drawWrecks();
  drawTarget();
  drawSubmergedTargetsDebug();
  drawSonarBearingCone();
  drawSensorEffects();
  drawEffects();
  drawAircraft();
  drawAAFire();
  drawSmoke();

  const shipScreen = worldToScreen(ship);
  drawFletcher(ctx, shipScreen.x, shipScreen.y, ship.heading, 0.18 * Math.sqrt(zoom), true);

  drawMapInfoBoxes();
  drawMapHud();
  drawCircularScope(sonarCtx, "sonar");
  drawCircularScope(radarCtx, "radar");
  drawShipPanel();
}

function drawOcean() {
  const w = game.width;
  const h = game.height;
  const grd = ctx.createRadialGradient(w * 0.52, h * 0.44, 40, w * 0.52, h * 0.44, Math.max(w, h));
  grd.addColorStop(0, "#263b36");
  grd.addColorStop(0.55, "#1b2c28");
  grd.addColorStop(1, "#111b18");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  drawWorldGrid();
  drawWorldWaves();
  drawVisibilityCircle();
  drawVisibilityLabel();
  drawCloudMaskOutsideVisibility();
  drawWake();
  drawRain();
  drawWindLayer();
}

function drawWorldGrid() {
  const w = game.width;
  const h = game.height;
  const gridStepM = 10000;
  ctx.save();
  ctx.strokeStyle = "rgba(220,230,215,.22)";
  ctx.lineWidth = 1;

  const startX = Math.floor(camera.x / gridStepM) * gridStepM;
  const endX = camera.x + w * METERS_PER_PIXEL + gridStepM;
  const startY = Math.floor(camera.y / gridStepM) * gridStepM;
  const endY = camera.y + h * METERS_PER_PIXEL + gridStepM;

  for (let wx = startX; wx <= endX; wx += gridStepM) {
    const sx = (wx - camera.x) / METERS_PER_PIXEL;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
    ctx.stroke();
  }

  for (let wy = startY; wy <= endY; wy += gridStepM) {
    const sy = (wy - camera.y) / METERS_PER_PIXEL;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWorldWaves() {
  const w = game.width;
  const h = game.height;
  ctx.save();
  ctx.strokeStyle = `rgba(205,220,205,${0.050 + weather.wave * 0.050})`;
  ctx.lineWidth = 1;

  const waveSpacingM = 62; // około 10x gęściej niż poprzednio
  const waveLengthM = 210;
  const ampPx = 0.55 + weather.wave * 2.4;

  const startY = Math.floor(camera.y / waveSpacingM) * waveSpacingM;
  const endY = camera.y + h * METERS_PER_PIXEL + waveSpacingM;
  const startX = Math.floor(camera.x / waveLengthM) * waveLengthM;
  const endX = camera.x + w * METERS_PER_PIXEL + waveLengthM;

  for (let wy = startY; wy <= endY; wy += waveSpacingM) {
    ctx.beginPath();
    let first = true;
    for (let wx = startX; wx <= endX; wx += 42) {
      const sx = (wx - camera.x) / METERS_PER_PIXEL;
      const sy = (wy - camera.y) / METERS_PER_PIXEL;
      const yy = sy
        + Math.sin(wx / waveLengthM * Math.PI * 2 + wy * 0.003) * ampPx
        + Math.sin(wx / 95 + wy * 0.004) * ampPx * 0.35;
      if (first) { ctx.moveTo(sx, yy); first = false; }
      else ctx.lineTo(sx, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawVisibilityCircle() {
  const s = worldToScreen(ship);
  ctx.save();
  ctx.strokeStyle = "rgba(207,215,178,.70)";
  ctx.lineWidth = 2.0;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.arc(s.x, s.y, weather.visibility / METERS_PER_PIXEL, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCloudMaskOutsideVisibility() {
  const s = worldToScreen(ship);
  const r = weather.visibility / METERS_PER_PIXEL;
  const outer = Math.max(game.width, game.height) * 1.05;

  ctx.save();

  // Ostrzejsze przejście: prawie czysto do linii widoczności,
  // potem szybko wchodzi zasłona chmur.
  const g = ctx.createRadialGradient(s.x, s.y, r * 0.96, s.x, s.y, Math.max(r * 1.18, outer));
  g.addColorStop(0.00, "rgba(190,196,182,0.00)");
  g.addColorStop(0.10, "rgba(190,196,182,0.16)");
  g.addColorStop(0.30, "rgba(190,196,182,0.30)");
  g.addColorStop(1.00, "rgba(190,196,182,0.42)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, game.width, game.height);
  ctx.restore();
}


function drawVisibilityLabel() {
  if (!aimInfoOn) return;
  const center = worldToScreen(ship);
  const angle = degToRad(315);
  const range = weather.visibility || 5200;
  const x = center.x + Math.cos(angle) * (range / METERS_PER_PIXEL);
  const y = center.y + Math.sin(angle) * (range / METERS_PER_PIXEL);
  const text = `WIDOCZNOŚĆ ${Math.round(range)}m`;
  ctx.save();
  ctx.font = "bold 13px Courier New";
  ctx.fillStyle = "rgba(5,8,6,.72)";
  ctx.strokeStyle = "rgba(207,215,178,.80)";
  const w = ctx.measureText(text).width + 12;
  roundedRect(ctx, x + 8, y - 18, w, 22, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#cfd7b2";
  ctx.fillText(text, x + 14, y - 3);
  ctx.restore();
}

function drawWindLayer() {
  if (!windLayerOn) return;
  const color = "#c0cab8";
  const w = game.width;
  const h = game.height;
  const spacing = 280; // jeszcze rzadziej
  const speedPx = Math.max(0.15, weather.windSpeed * 0.012);
  windAnimOffset = (windAnimOffset + speedPx) % spacing;

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.0;

  const dx = Math.cos(weather.windDir);
  const dy = Math.sin(weather.windDir);
  const px = -dy;
  const py = dx;

  for (let row = -2; row < h / spacing + 3; row++) {
    for (let col = -2; col < w / spacing + 3; col++) {
      const baseX = col * spacing + px * row * 22 + dx * windAnimOffset;
      const baseY = row * spacing + py * col * 12 + dy * windAnimOffset;
      const x = ((baseX % (w + spacing)) + (w + spacing)) % (w + spacing) - spacing / 2;
      const y = ((baseY % (h + spacing)) + (h + spacing)) % (h + spacing) - spacing / 2;
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
    const p = worldToScreen(mark);
    const life = clamp(1 - mark.t / 65, 0, 1);
    const len = (90 + mark.t * 18) / METERS_PER_PIXEL;
    const spread = (15 + mark.t * 4) / METERS_PER_PIXEL;
    ctx.globalAlpha = 0.20 * life * mark.intensity;
    ctx.strokeStyle = "rgba(220,235,225,.70)";
    ctx.lineWidth = Math.max(0.8, 1.8 * life);
    ctx.save();
    ctx.translate(p.x, p.y);
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

function drawSmoke() {
  ctx.save();
  for (const puff of smokePuffs) {
    const p = worldToScreen(puff);
    const life = clamp(1 - puff.t / 18, 0, 1);
    ctx.globalAlpha = 0.09 * life;
    ctx.fillStyle = "#c7c7bd";
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.2, puff.r / METERS_PER_PIXEL), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawRain() {
  if (weather.rain <= 0) return;
  ctx.save();
  ctx.strokeStyle = `rgba(210,225,220,${0.018 + weather.rain * 0.030})`;
  ctx.lineWidth = 1;
  const slantX = Math.cos(weather.windDir) * 10;
  const slantY = Math.sin(weather.windDir) * 10 + 7;
  for (let i = 0; i < rainDrops.length; i += 2) {
    const r = rainDrops[i];
    const x = ((r.x * game.width + weather.t * weather.windSpeed * 8 * r.s) % (game.width + 80)) - 40;
    const y = ((r.y * game.height + weather.t * 90 * r.s) % (game.height + 80)) - 40;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + slantX * r.s, y + slantY * r.s);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTacticalOverlays() {
  drawRangeCircles();
  drawPredictedTrack();
  if (ship.orderedCourse !== null) drawArrowWorld(ship, degToRad(ship.orderedCourse), 1300, `kurs ${String(Math.round(ship.orderedCourse)).padStart(3, "0")}`, "rgba(225,235,225,.75)", true);
  drawArrowWorld(ship, ship.heading, 900, "kurs", "rgba(225,235,225,.85)");
  drawGunneryOverlay();
}

function drawPredictedTrack() {
  if (Math.abs(ship.speed) < 0.3) return;
  let x = ship.x, y = ship.y, heading = ship.heading;
  const secondsAhead = 30;
  const step = 2;
  const pts = [];
  for (let t = 0; t <= secondsAhead; t += step) {
    const speedFactor = Math.abs(ship.speed) / speedOrders.at(-1).value;
    heading += (ship.rudder / ship.maxRudder) * speedFactor * 0.105 * step * Math.sign(ship.speed || 1);
    x += Math.cos(heading) * ship.speed * SIM_SPEED_MULTIPLIER * step;
    y += Math.sin(heading) * ship.speed * SIM_SPEED_MULTIPLIER * step;
    pts.push({ ...worldToScreen({ x, y }), t });
  }
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = "rgba(255,196,80,.42)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 8]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const end = pts.at(-1);
  const prev = pts.at(-2);
  const a = Math.atan2(end.y - prev.y, end.x - prev.x);
  ctx.translate(end.x, end.y);
  ctx.rotate(a);
  ctx.fillStyle = "rgba(255,196,80,.65)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-13, -6);
  ctx.lineTo(-13, 6);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-a);
  ctx.font = "bold 14px Courier New";
  ctx.fillText(`${secondsAhead}s`, 10, -8);
  ctx.restore();
}


function drawRangeLabel(text, range, angle, color) {
  if (!aimInfoOn) return;
  const center = worldToScreen(ship);
  const x = center.x + Math.cos(angle) * (range / METERS_PER_PIXEL);
  const y = center.y + Math.sin(angle) * (range / METERS_PER_PIXEL);
  ctx.save();
  ctx.font = "bold 13px Courier New";
  ctx.fillStyle = "rgba(5,8,6,.72)";
  ctx.strokeStyle = color;
  const w = ctx.measureText(text).width + 12;
  roundedRect(ctx, x + 8, y - 18, w, 22, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(text, x + 14, y - 3);
  ctx.restore();
}

function drawRangeCircles() {
  const s = worldToScreen(ship);
  const circle = (range, color, dash = [], width = 1.6) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.arc(s.x, s.y, range / METERS_PER_PIXEL, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };
  circle(sonar.minRange, "rgba(111,226,93,.55)", [6, 4], 1.4);
  circle(sonar.range, "rgba(111,226,93,.82)", [9, 5], 1.7);
  circle(radar.range, "rgba(74,182,255,.95)", [9, 5], 2.2);
  circle(guns.minRange, "rgba(217,170,42,.72)", [8, 5], 1.4);
  circle(guns.maxRange, "rgba(217,170,42,.92)", [10, 5], 1.7);

  drawRangeLabel(`RADAR ${radar.range}m`, radar.range, degToRad(40), "#4ab6ff");
  drawRangeLabel(`SONAR ${sonar.range}m`, sonar.range, degToRad(140), "#6fe25d");
  drawRangeLabel(`DZIAŁA ${guns.maxRange}m`, guns.maxRange, degToRad(220), "#d9aa2a");
  drawRangeLabel(`MIN DZ. ${guns.minRange}m`, guns.minRange, degToRad(300), "#d9aa2a");
}

function drawArrowWorld(origin, angle, lengthM, label, color, dashed = false) {
  const s = worldToScreen(origin);
  const length = lengthM / METERS_PER_PIXEL;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  if (dashed) ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(length, 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(length, 0);
  ctx.lineTo(length - 10, -5);
  ctx.lineTo(length - 10, 5);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-angle);
  ctx.font = "14px system-ui";
  ctx.fillText(label, Math.cos(angle) * (length + 8), Math.sin(angle) * (length + 8));
  ctx.restore();
}

function drawGunneryOverlay() {
  const aim = getAimPoint();
  const ss = worldToScreen(ship);
  const aa = worldToScreen(aim);
  ctx.save();
  ctx.strokeStyle = "rgba(217,170,42,.85)";
  ctx.lineWidth = 1.8;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  ctx.moveTo(ss.x, ss.y);
  ctx.lineTo(aa.x, aa.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(aa.x, aa.y, 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(aa.x - 20, aa.y);
  ctx.lineTo(aa.x + 20, aa.y);
  ctx.moveTo(aa.x, aa.y - 20);
  ctx.lineTo(aa.x, aa.y + 20);
  ctx.stroke();
  ctx.restore();
}

function drawAimInfo() {
  if (!aimInfoOn) return;
  const aim = getAimPoint();
  const aa = worldToScreen(aim);
  const d = target.alive ? Math.round(Math.hypot(aim.x - target.x, aim.y - target.y)) : "---";
  const flight = ballisticFlightTime(guns.range).toFixed(1);
  ctx.save();
  ctx.font = "bold 14px Courier New";
  ctx.fillStyle = "rgba(5,8,6,.76)";
  ctx.strokeStyle = "rgba(217,170,42,.70)";
  const text1 = `POCISK: ${flight}s`;
  const text2 = `ODL. DO CELU: ${d}m`;
  const w = Math.max(ctx.measureText(text1).width, ctx.measureText(text2).width) + 18;
  roundedRect(ctx, aa.x + 18, aa.y + 12, w, 48, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#d9aa2a";
  ctx.fillText(text1, aa.x + 27, aa.y + 31);
  ctx.fillText(text2, aa.x + 27, aa.y + 49);
  ctx.restore();
}


function drawSonarBearingCone() {
  if (!sonar.on) return;
  const s = worldToScreen(ship);
  const angle = sonar.bearing + ship.heading;
  const rangePx = sonar.range / METERS_PER_PIXEL;
  const half = sonar.beamWidth / 2;

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(111,226,93,0.045)";
  ctx.strokeStyle = "rgba(111,226,93,0.36)";
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let a = -half; a <= half + 0.0001; a += sonar.beamWidth / 24) {
    ctx.lineTo(Math.cos(a) * rangePx, Math.sin(a) * rangePx);
  }
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(-half) * rangePx, Math.sin(-half) * rangePx);
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(half) * rangePx, Math.sin(half) * rangePx);
  ctx.stroke();
  ctx.restore();
}

function drawSensorEffects() {
  for (let i = sonarPulses.length - 1; i >= 0; i--) {
    const pulse = sonarPulses[i];
    pulse.t += 0.016;
    const radius = pulse.t * 900;
    if (radius > sonar.range) {
      sonarPulses.splice(i, 1);
      continue;
    }
    const sp = worldToScreen(pulse);
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(pulse.angle);
    ctx.strokeStyle = `rgba(111,226,93,${0.95 - radius / sonar.range * 0.75})`;
    ctx.lineWidth = 2.2;
    const r = radius / METERS_PER_PIXEL;
    const half = sonar.beamWidth / 2;
    ctx.beginPath();
    for (let a = -half; a <= half + 0.0001; a += sonar.beamWidth / 18) {
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (a === -half) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  for (const ping of radarPings) {
    const radius = ping.t * 2900;
    const sp = worldToScreen(ping);
    ctx.save();
    ctx.strokeStyle = `rgba(74,182,255,${0.50 - radius / radar.range * 0.40})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, radius / METERS_PER_PIXEL, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const echo of radarEchoes) {
    const sp = worldToScreen(echo);
    ctx.save();
    ctx.strokeStyle = `rgba(74,182,255,${1 - echo.t / 1.1})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 8 + echo.t * 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawWrecks() {
  for (const wr of wrecks) {
    const p = worldToScreen(wr);
    const scale = 1 / METERS_PER_PIXEL;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(wr.heading);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 0.62;
    ctx.strokeStyle = "#cfc3a2";
    ctx.fillStyle = "rgba(90,75,55,.45)";
    ctx.lineWidth = METERS_PER_PIXEL * 1.1;
    ctx.beginPath();
    ctx.moveTo(wr.length / 2, 0);
    ctx.lineTo(wr.length / 2 - 18, -wr.beam / 2);
    ctx.lineTo(-wr.length / 2, -wr.beam / 2);
    ctx.lineTo(-wr.length / 2, wr.beam / 2);
    ctx.lineTo(wr.length / 2 - 18, wr.beam / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-wr.length / 2, -wr.beam / 2);
    ctx.lineTo(wr.length / 2, wr.beam / 2);
    ctx.moveTo(-wr.length / 2, wr.beam / 2);
    ctx.lineTo(wr.length / 2, -wr.beam / 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawTarget() {
  if (!target.alive) return;
  const p = worldToScreen(target);
  const scale = 1 / METERS_PER_PIXEL;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(target.heading);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#aeb8aa";
  ctx.strokeStyle = "#0b100d";
  ctx.lineWidth = METERS_PER_PIXEL * 1.2;
  ctx.beginPath();
  ctx.moveTo(target.length / 2, 0);
  ctx.lineTo(target.length / 2 - 18, -target.beam / 2);
  ctx.lineTo(-target.length / 2, -target.beam / 2);
  ctx.lineTo(-target.length / 2, target.beam / 2);
  ctx.lineTo(target.length / 2 - 18, target.beam / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#d9e3d3";
  ctx.fillRect(-20, -4, 28, 8);
  ctx.restore();
}

function drawSubmergedTargetsDebug() {
  for (const sub of underwaterTargets) {
    if (!sub.alive) continue;
    const p = worldToScreen(sub);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(sub.heading);
    ctx.globalAlpha = 0.20;
    ctx.strokeStyle = "#6fe25d";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawAircraft() {
  for (const plane of aircraft) drawCondor(plane);
}

function drawCondor(plane) {
  const p = worldToScreen(plane);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(plane.heading);
  ctx.scale(0.7, 0.7);
  ctx.strokeStyle = plane.damaged ? "rgba(255,210,150,.82)" : "rgba(230,230,230,.75)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(18, 0); ctx.lineTo(-16, 0);
  ctx.moveTo(0, -2); ctx.lineTo(0, 2);
  ctx.moveTo(-3, 0); ctx.lineTo(-12, -12);
  ctx.moveTo(-3, 0); ctx.lineTo(-12, 12);
  ctx.moveTo(8, 0); ctx.lineTo(18, -18);
  ctx.moveTo(8, 0); ctx.lineTo(18, 18);
  ctx.stroke();
  ctx.restore();
}

function drawAAFire() {
  for (const tr of aaTracers) {
    const a = 1 - tr.t / tr.maxT;
    const p1 = worldToScreen({ x: tr.x1, y: tr.y1 });
    const p2 = worldToScreen({ x: tr.x2, y: tr.y2 });
    ctx.save();
    ctx.strokeStyle = `rgba(255,222,125,${0.85 * a})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  for (const b of aaBursts) {
    const a = 1 - b.t / b.maxT;
    const p = worldToScreen(b);
    ctx.save();
    ctx.strokeStyle = `rgba(255,230,160,${0.8 * a})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4 + b.t * 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFletcher(context, x, y, heading, scale = 1, wakeOn = true) {
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
  context.lineTo(-60, -6);
  context.lineTo(-67, -3);
  context.lineTo(-69, 0);
  context.lineTo(-67, 3);
  context.lineTo(-60, 6);
  context.lineTo(-45, 9);
  context.lineTo(42, 8);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = "#aab3a7";
  context.fillRect(-42, -4.8, 82, 9.6);
  context.fillStyle = "#c0c7bd";
  context.fillRect(11, -6.5, 19, 13);
  context.fillStyle = "#a3ada1";
  context.fillRect(-12, -5.5, 17, 11);
  context.fillStyle = "#747f76";
  context.fillRect(-28, -4.5, 9, 9);
  context.fillRect(-38, -4.2, 7, 8.4);
  context.strokeStyle = "#d9e3d3";
  context.lineWidth = 1 / Math.max(scale, 0.1);
  context.beginPath();
  context.moveTo(20, 0);
  context.lineTo(20, -23);
  context.moveTo(20, -12);
  context.lineTo(9, -18);
  context.moveTo(20, -12);
  context.lineTo(31, -18);
  context.stroke();
  drawTurret(context, 46, 0, guns.bearing - heading, scale);
  drawTurret(context, 30, 0, guns.bearing - heading, scale);
  drawTurret(context, -18, 0, guns.bearing - heading, scale);
  drawTurret(context, -39, 0, guns.bearing - heading, scale);
  drawTurret(context, -55, 0, guns.bearing - heading, scale);
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

function drawEffects() {
  for (const flash of muzzleFlashes) {
    const p = 1 - flash.t / 0.18;
    const pos = worldToScreen(flash);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(flash.angle);
    ctx.fillStyle = `rgba(245,230,165,${p})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(20 * p, -6 * p);
    ctx.lineTo(29 * p, 0);
    ctx.lineTo(20 * p, 6 * p);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  for (const shell of shells) {
    const p = worldToScreen(shell);
    ctx.save();
    ctx.fillStyle = "#f5e6a5";
    ctx.beginPath();
    ctx.arc(p.x, p.y - shell.z / METERS_PER_PIXEL * 0.75, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const splash of splashes) {
    const pp = worldToScreen(splash);
    const t = splash.t / splash.maxT;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = splash.hit ? "#f3e8bd" : "#d8e8d5";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, 6 + t * 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawCircularScope(context, type) {
  const w = context.canvas.width;
  const h = context.canvas.height;
  const size = Math.min(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const r = size * 0.42;
  const color = type === "sonar" ? "rgba(111,226,93,.85)" : "rgba(74,182,255,.85)";
  const range = type === "sonar" ? sonar.range : radar.range;
  context.clearRect(0, 0, w, h);
  context.save();
  context.fillStyle = "#050806";
  context.fillRect(0, 0, w, h);
  context.strokeStyle = color;
  context.lineWidth = 1;
  for (let rr = r / 4; rr <= r; rr += r / 4) {
    context.globalAlpha = 0.45;
    context.beginPath();
    context.arc(cx, cy, rr, 0, Math.PI * 2);
    context.stroke();
  }
  context.globalAlpha = 0.75;
  context.beginPath();
  context.moveTo(cx - r, cy); context.lineTo(cx + r, cy);
  context.moveTo(cx, cy - r); context.lineTo(cx, cy + r);
  context.stroke();
  context.globalAlpha = 1;
  context.beginPath();
  context.arc(cx, cy, r, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "#d9e3d3";
  context.beginPath();
  context.arc(cx, cy, 4, 0, Math.PI * 2);
  context.fill();
  if (type === "radar" && target.alive) {
    const dx = target.x - ship.x, dy = target.y - ship.y, d = Math.hypot(dx, dy);
    if (d <= range) {
      context.fillStyle = "#4ab6ff";
      context.beginPath();
      context.arc(cx + dx / range * r, cy + dy / range * r, 4, 0, Math.PI * 2);
      context.fill();
    }
  }
  if (type === "sonar" && sonar.on) {
    for (const sub of underwaterTargets) {
      if (!sub.alive) continue;
      const dx = sub.x - ship.x, dy = sub.y - ship.y, d = Math.hypot(dx, dy);
      if (d <= range && d >= sonar.minRange) {
        context.fillStyle = "#6fe25d";
        context.beginPath();
        context.arc(cx + dx / range * r, cy + dy / range * r, 3, 0, Math.PI * 2);
        context.fill();
      }
    }
  }
  
  if (type === "radar") {
    for (const plane of (Array.isArray(aircraft) ? aircraft : [aircraft])) {
      if (!plane || plane.active === false) continue;
      const dx = plane.x - ship.x;
      const dy = plane.y - ship.y;
      const d = Math.hypot(dx, dy);
      if (d <= range) {
        context.fillStyle = "#d9e3d3";
        context.beginPath();
        context.arc(cx + dx / range * r, cy + dy / range * r, 3, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  context.fillStyle = type === "sonar" ? "#6fe25d" : "#4ab6ff";
  context.font = "12px Courier New";
  context.fillText(`${range} m`, 8, h - 10);
  context.restore();
}

function drawShipPanel() {
  const w = shipView.width, h = shipView.height;
  shipCtx.clearRect(0, 0, w, h);
  shipCtx.fillStyle = "#050806";
  shipCtx.fillRect(0, 0, w, h);
  shipCtx.strokeStyle = "rgba(217,227,211,.16)";
  shipCtx.beginPath();
  shipCtx.moveTo(w / 2, 0); shipCtx.lineTo(w / 2, h);
  shipCtx.moveTo(0, h / 2); shipCtx.lineTo(w, h / 2);
  shipCtx.stroke();
  drawFletcher(shipCtx, w / 2, h / 2 - 2, ship.heading, Math.min(w, h) / 210, false);
  shipCtx.fillStyle = "#95a18f";
  shipCtx.font = "12px Courier New";
  shipCtx.fillText(`WIATR ${radToCourse(weather.windDir).toFixed(0)}° / ${weather.windSpeed.toFixed(1)} m/s`, 8, h - 10);
}

function drawMapHud() {
  const order = speedOrders[ship.targetSpeedIndex];
  const course = radToCourse(ship.heading).toFixed(0).padStart(3, "0");
  const rudderSide = ship.rudder < -0.5 ? "L" : ship.rudder > 0.5 ? "P" : "ZERO";
  const text = `PRĘDKOŚĆ ${order.name} / ${(ship.speed * MS_TO_KNOT).toFixed(1)} w.   STER ${Math.abs(ship.rudder).toFixed(0)}° ${rudderSide}   KURS ${course}°`;
  ctx.save();
  ctx.font = "bold 18px Courier New";
  const metrics = ctx.measureText(text);
  const padX = 16;
  const boxW = metrics.width + padX * 2;
  const boxH = 38;
  const x = (game.width - boxW) / 2;
  const y = game.height - boxH - 14;
  ctx.fillStyle = "rgba(5,8,6,.76)";
  ctx.strokeStyle = "rgba(217,227,211,.48)";
  roundedRect(ctx, x, y, boxW, boxH, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#d9e3d3";
  ctx.fillText(text, x + padX, y + 25);
  ctx.restore();
}

function drawMapInfoBoxes() {
  drawInfoBox(14, 12, [
    `POZYCJA`,
    `X ${Math.round(ship.x)} m`,
    `Y ${Math.round(ship.y)} m`,
    `SEKTOR ${Math.floor(ship.x / 10000)}-${Math.floor(ship.y / 10000)}`
  ]);

  const newestContact = [lastRadarContact, lastRadarAirContact].filter(Boolean).sort((a,b)=>a.age-b.age)[0];
  const contactLines = newestContact && newestContact.age < 12
    ? [`RADAR KONTAKT`, `NAMIAR ${newestContact.bearing.toFixed(0).padStart(3, "0")}°`, `ODL. ${newestContact.range} m`, `OSTATNI ECHO ${newestContact.age.toFixed(1)} s`]
    : [`RADAR KONTAKT`, `BRAK`, `---`, `---`];
  drawInfoBox(14, 124, contactLines);

  drawInfoBox(game.width - 190 - 14, 12, [
    `POGODA ${weatherName(weather.rain)}`,
    `WIATR ${radToCourse(weather.windDir).toFixed(0)}°`,
    `${weather.windSpeed.toFixed(1)} m/s`,
    `FALA ${weather.wave.toFixed(2)}`,
    `WIDZ. ${Math.round(weather.visibility)} m`
  ], 190);

  drawInfoBox(game.width - 190 - 14, 154, [
    `PROG. +5 MIN`,
    `${weatherName(forecast.rain)}`,
    `WIATR ${radToCourse(forecast.windDir).toFixed(0)}°`,
    `${forecast.windSpeed.toFixed(1)} m/s`,
    `WIDZ. ${Math.round(forecast.visibility)} m`
  ], 190);
}

function drawInfoBox(x, y, lines, width = 190) {
  ctx.save();
  ctx.font = "bold 17px Courier New";
  const h = 26 + lines.length * 22;
  ctx.fillStyle = "rgba(5,8,6,.72)";
  ctx.strokeStyle = "rgba(217,227,211,.42)";
  roundedRect(ctx, x, y, width, h, 8);
  ctx.fill();
  ctx.stroke();
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? "#d9e3d3" : "#c0cab8";
    ctx.fillText(line, x + 10, y + 22 + i * 22);
  });
  ctx.restore();
}

function roundedRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function updateUI() {
  const order = speedOrders[ship.targetSpeedIndex];
  const course = radToCourse(ship.heading);
  const rudderSide = ship.rudder < -0.5 ? "L" : ship.rudder > 0.5 ? "P" : "";
  const aim = getAimPoint();
  const miss = target.alive ? Math.round(Math.hypot(aim.x - target.x, aim.y - target.y)) : "---";
  const flightTime = ballisticFlightTime(guns.range);
  const respawn = target.alive ? "---" : `${Math.max(0, targetRespawnTimer || 0).toFixed(1)} s`;

  sonarStatus.textContent = sonar.on ? "WŁ." : "WYŁ.";
  sonarStatus.className = sonar.on ? "statusOn" : "statusOff";
  sonarButton.textContent = sonar.on ? "WYŁĄCZ" : "WŁĄCZ";
  speedRead.textContent = order.name;
  rudderRead.textContent = `${Math.abs(ship.rudder).toFixed(0)}° ${rudderSide}`;
  courseRead.textContent = `${course.toFixed(0).padStart(3, "0")}°`;
  windShort.textContent = `${radToCourse(weather.windDir).toFixed(0)}° ${weather.windSpeed.toFixed(0)}m/s`;

  weaponRead.innerHTML =
    `UZBROJENIE<br>` +
    `TRYB: <span style="color:var(--guns)">${guns.mode}</span><br>` +
    `WPIS: <span style="color:${inputMode === "AIM" ? "var(--guns)" : "var(--sonar)"}">${inputMode === "AIM" ? "KĄT" : "KURS"}</span><br>` +
    `KĄT: <span style="color:var(--guns)">${radToCourse(guns.bearing).toFixed(0).padStart(3, "0")}°</span><br>` +
    `ZASIĘG: <span style="color:var(--guns)">${Math.round(guns.range)} m</span><br>` +
    `CZAS LOTU: <span style="color:var(--guns)">${flightTime.toFixed(1)} s</span>`;

  consolePanel.textContent =
    `TRYB WPISYWANIA: ${inputMode === "AIM" ? "KĄT CELOWANIA" : "KURS OKRĘTU"} | SONAR ${sonar.on ? "WŁ." : "WYŁ."} | WIĄZKA 14° | RADAR ${radar.range} m | DZIAŁA ${guns.minRange}-${guns.maxRange} m\n` +
    `PRĘDKOŚĆ: ${(ship.speed * MS_TO_KNOT).toFixed(1)} w. | BŁĄD CEL.: ${miss} m | NOWY CEL: ${respawn} | ZOOM: ${zoom.toFixed(2)}x | ${lastMessage}\n` +
    `W/S prędkość, A/D ster, Z zero, X stop, G wpis KURS/KĄT, F AUTO/MANUAL, < > obrót, O/L zasięg, [ ] sonar, Spacja strzał`;
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  weather.t += dt;
  updateWeather(dt);

  updateOrders(dt);
  updatePhysics(dt);
  updateWakeAndSmoke(dt);
  updateSurfaceTarget(dt);
  updateSubmergedTargets(dt);
  updateAircraft(dt);
  updateSonar(dt);
  updateRadar(dt);
  updateProjectiles(dt);
  respawnTarget(dt);

  drawMain();
  updateUI();
  requestAnimationFrame(loop);
}
