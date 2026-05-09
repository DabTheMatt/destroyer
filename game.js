// U-Booty i Niszczyciele — modularny prototyp
// Plik celowo podzielony z index.html i style.css, żeby łatwiej wprowadzać zmiany.

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
const speedRead = document.getElementById("speedRead");
const rudderRead = document.getElementById("rudderRead");
const courseRead = document.getElementById("courseRead");
const weaponRead = document.getElementById("weaponRead");
const windShort = document.getElementById("windShort");

const WORLD_W = 30000;
const WORLD_H = 30000;

let baseMetersPerPixel = 42;
let METERS_PER_PIXEL = 42;
let zoom = 1.0;

const MIN_ZOOM = 0.42;
const MAX_ZOOM = 9.0;

const keysPressed = new Set();
const keysHandled = new Set();

const speedOrders = [
  { name: "STOP", value: 0 },
  { name: "1/3", value: 4.8 },
  { name: "2/3", value: 8.9 },
  { name: "CAŁA", value: 13.5 },
  { name: "FLANKA", value: 18.5 }
];

const ship = {
  x: WORLD_W / 2,
  y: WORLD_H * 0.62,
  heading: degToRad(0),
  speed: 0,
  targetSpeedIndex: 0,
  rudder: 0,
  maxRudder: 30,
  orderedCourse: null,
  autopilot: false,
  lengthM: 114.8
};

const camera = {
  x: 0,
  y: 0,
  anchorX: 0.5,
  anchorY: 0.5,
  manualOffsetX: 0,
  manualOffsetY: 0
};

const sonar = {
  on: false,
  minRange: 300,
  range: 2500,
  bearing: degToRad(0),
  beamWidth: degToRad(32),
  pingCooldown: 0,
  contactToneCooldown: 0
};

const radar = {
  range: 9500,
  sweepCooldown: 0
};

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
  rain: 0.30,
  wave: 0.28,
  windDir: degToRad(305),
  windSpeed: 14.5
};

let target = randomTarget();
let targetRespawnTimer = null;
let courseInput = "";
let angleInput = "";
let inputMode = "COURSE";
let lastMessage = "Gotowy. Tryb wpisywania: KURS. Sonar wyłączony.";
let audioCtx = null;
let lastTime = performance.now();

const shells = [];
const splashes = [];
const muzzleFlashes = [];
const wake = [];
const sonarPulses = [];
const radarPings = [];
const radarEchoes = [];
const rainDrops = Array.from({ length: 160 }, () => ({
  x: Math.random(),
  y: Math.random(),
  s: 0.55 + Math.random() * 1.25
}));

const aircraft = {
  active: true,
  x: -4000,
  y: 4000,
  heading: degToRad(28),
  speed: 62,
  altitude: 1800
};

const drag = {
  active: false,
  lastX: 0,
  lastY: 0
};

// ---------- START ----------

resizeAll();
bindEvents();
requestAnimationFrame(loop);

// ---------- EVENTS ----------

function bindEvents() {
  window.addEventListener("resize", resizeAll);
  sonarButton.addEventListener("click", toggleSonar);

  game.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoom = clamp(zoom * Math.exp(-event.deltaY * 0.0012), MIN_ZOOM, MAX_ZOOM);
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
    lastMessage = "Kamera wycentrowana na niszczycielu.";
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

  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
    event.preventDefault();
  }

  if (/^[0-9]$/.test(event.key)) {
    if (inputMode === "AIM") angleInput = (angleInput + event.key).slice(-3);
    else courseInput = (courseInput + event.key).slice(-3);
  }

  if (event.key === "Enter") {
    if (inputMode === "AIM" && angleInput.length > 0) {
      const angle = Number(angleInput);
      if (Number.isFinite(angle)) {
        guns.bearing = degToRad(((angle % 360) + 360) % 360);
        guns.relativeBearing = angleDiffRad(guns.bearing, ship.heading);
        lastMessage = `Kąt celowania ustawiony na ${String(Math.round(radToCourse(guns.bearing))).padStart(3, "0")}°.`;
      }
      angleInput = "";
    } else if (inputMode === "COURSE" && courseInput.length > 0) {
      const course = Number(courseInput);
      if (Number.isFinite(course)) {
        ship.orderedCourse = ((course % 360) + 360) % 360;
        ship.autopilot = true;
        lastMessage = `Rozkaz zmiany kursu na ${String(ship.orderedCourse).padStart(3, "0")}°.`;
      }
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

// ---------- UTILS ----------

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

function worldToScreen(point) {
  return {
    x: (point.x - camera.x) / METERS_PER_PIXEL,
    y: (point.y - camera.y) / METERS_PER_PIXEL
  };
}

function updateCamera() {
  updateMapScale();
  camera.x = ship.x - game.width * METERS_PER_PIXEL * camera.anchorX + camera.manualOffsetX;
  camera.y = ship.y - game.height * METERS_PER_PIXEL * camera.anchorY + camera.manualOffsetY;
}

// ---------- AUDIO ----------

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function tone(freq, duration, type = "sine", volume = 0.08, endFreq = null) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  if (endFreq) {
    osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration * 0.85);
  }

  filter.type = "bandpass";
  filter.frequency.value = 1200;
  filter.Q.value = 8;

  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, audioCtx.currentTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

  osc.connect(filter).connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration + 0.03);
}

function noise(duration, volume, filterFreq = 280) {
  if (!audioCtx) return;
  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * duration, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

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
  src.stop(audioCtx.currentTime + duration);
}

function sonarPing(contact) {
  tone(1700, 0.24, "sine", 0.16, 850);
  setTimeout(() => tone(980, 0.10, "sine", 0.06, 720), 250);

  if (contact) {
    setTimeout(() => tone(620, 0.18, "triangle", 0.14, 520), 430);
    setTimeout(() => tone(740, 0.13, "triangle", 0.09, 560), 660);
  }
}

function toggleSonar() {
  ensureAudio();
  sonar.on = !sonar.on;
  sonar.pingCooldown = 0;
  lastMessage = sonar.on ? "Sonar aktywny. Ping i nasłuch uruchomione." : "Sonar wyłączony.";
}

// ---------- GAME STATE ----------

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
    alive: true
  };
}

function updateOrders(dt) {
  if (wasPressedOnce("arrowup") || wasPressedOnce("w")) {
    ship.targetSpeedIndex = clamp(ship.targetSpeedIndex + 1, 0, speedOrders.length - 1);
  }
  if (wasPressedOnce("arrowdown") || wasPressedOnce("s")) {
    ship.targetSpeedIndex = clamp(ship.targetSpeedIndex - 1, 0, speedOrders.length - 1);
  }

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

  if (wasPressedOnce("x")) ship.targetSpeedIndex = 0;
  if (wasPressedOnce("z")) ship.rudder = 0;
  if (wasPressedOnce("p")) toggleSonar();

  if (keysPressed.has("[") || keysPressed.has("{")) sonar.bearing -= 0.9 * dt;
  if (keysPressed.has("]") || keysPressed.has("}")) sonar.bearing += 0.9 * dt;

  if (wasPressedOnce("g")) {
    if (guns.mode !== "MANUAL") {
      guns.mode = "MANUAL";
      lastMessage = "Tryb manualny artylerii.";
    } else {
      inputMode = inputMode === "AIM" ? "COURSE" : "AIM";
      angleInput = "";
      courseInput = "";
      lastMessage = inputMode === "AIM" ? "Tryb wpisywania: KĄT CELOWANIA." : "Tryb wpisywania: KURS OKRĘTU.";
    }
  }

  if (wasPressedOnce("f")) {
    guns.mode = "AUTO";
    inputMode = "COURSE";
    lastMessage = "Tryb automatyczny: działa śledzą kierunek celu, zasięg nadal ręczny.";
  }

  const gunTurnRate = 10 * Math.PI / 180;
  let turn = 0;
  if (keysPressed.has(",") || keysPressed.has("<")) turn -= gunTurnRate * dt;
  if (keysPressed.has(".") || keysPressed.has(">")) turn += gunTurnRate * dt;
  if (turn !== 0) {
    guns.mode = "MANUAL";
    guns.bearing += turn;
    guns.relativeBearing = angleDiffRad(guns.bearing, ship.heading);
  }

  const rangeRate = 520;
  if (keysPressed.has("o")) guns.range = clamp(guns.range + rangeRate * dt, guns.minRange, guns.maxRange);
  if (keysPressed.has("l")) guns.range = clamp(guns.range - rangeRate * dt, guns.minRange, guns.maxRange);

  if (wasPressedOnce(" ")) fireGun();

  if (guns.mode === "AUTO" && target.alive) {
    const desired = angleToPoint(ship, target);
    guns.bearing += clamp(angleDiffRad(desired, guns.bearing), -0.7 * dt, 0.7 * dt);
    guns.relativeBearing = angleDiffRad(guns.bearing, ship.heading);
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
  const accel = targetSpeed > ship.speed ? 0.55 : 0.82;

  ship.speed += clamp(targetSpeed - ship.speed, -accel * dt, accel * dt);

  updateAutopilot();

  ship.heading += (ship.rudder / ship.maxRudder) * (ship.speed / 18.5) * 0.105 * dt;

  const windAngleToShip = angleDiffRad(weather.windDir, ship.heading);
  const headWind = Math.cos(windAngleToShip) * weather.windSpeed;
  const crossWind = Math.sin(windAngleToShip) * weather.windSpeed;
  const windSpeedEffect = -headWind * 0.010 - weather.wave * 0.10;
  const leeway = crossWind * (0.010 + weather.wave * 0.004);
  const yawDrift = crossWind * (0.000055 + weather.wave * 0.000025);
  const waveYaw = Math.sin(weather.t * 0.9 + ship.x * 0.00018) * weather.wave * 0.00045;

  ship.heading += (yawDrift + waveYaw) * dt;

  if (guns.mode === "MANUAL") guns.bearing += ship.heading - previousHeading;
  guns.relativeBearing = angleDiffRad(guns.bearing, ship.heading);

  const actualSpeed = Math.max(0, ship.speed + windSpeedEffect);
  ship.x += Math.cos(ship.heading) * actualSpeed * dt + Math.cos(weather.windDir) * leeway * dt;
  ship.y += Math.sin(ship.heading) * actualSpeed * dt + Math.sin(weather.windDir) * leeway * dt;

  ship.x = (ship.x + WORLD_W) % WORLD_W;
  ship.y = (ship.y + WORLD_H) % WORLD_H;

  addWakeSample();
}

function addWakeSample() {
  if (ship.speed < 0.5) return;

  const sternX = ship.x - Math.cos(ship.heading) * 65;
  const sternY = ship.y - Math.sin(ship.heading) * 65;

  wake.push({
    x: sternX,
    y: sternY,
    t: 0,
    heading: ship.heading,
    intensity: clamp(ship.speed / 18.5, 0.18, 1)
  });

  while (wake.length > 420) wake.shift();
}

function updateWake(dt) {
  for (const mark of wake) mark.t += dt;
  while (wake.length && wake[0].t > 55) wake.shift();
}

function updateAircraft(dt) {
  aircraft.x += Math.cos(aircraft.heading) * aircraft.speed * dt;
  aircraft.y += Math.sin(aircraft.heading) * aircraft.speed * dt;

  if (aircraft.x > WORLD_W + 3000) {
    aircraft.x = -3000;
    aircraft.y = 2000 + Math.random() * (WORLD_H * 0.4);
  }
}

function updateSonar(dt) {
  sonar.pingCooldown -= dt;
  sonar.contactToneCooldown -= dt;

  if (!sonar.on) return;

  const contact = target.alive && dist(ship, target) <= sonar.range && dist(ship, target) >= sonar.minRange;

  if (sonar.pingCooldown <= 0) {
    sonarPulses.push({
      x: ship.x,
      y: ship.y,
      angle: sonar.bearing + ship.heading,
      t: 0
    });
    sonarPing(contact);
    sonar.pingCooldown = 2.4;
  }

  if (contact && sonar.contactToneCooldown <= 0) {
    tone(520, 0.07, "square", 0.04, 480);
    sonar.contactToneCooldown = 0.55;
  }
}

function updateRadar(dt) {
  radar.sweepCooldown -= dt;

  if (radar.sweepCooldown <= 0) {
    radarPings.push({ t: 0 });
    radar.sweepCooldown = 3.0;

    if (target.alive && dist(ship, target) <= radar.range) {
      radarEchoes.push({ x: target.x, y: target.y, t: 0 });
      ensureAudio();
      tone(1240, 0.06, "sine", 0.035, 900);
    }
  }

  for (let i = radarPings.length - 1; i >= 0; i--) {
    radarPings[i].t += dt;
    if (radarPings[i].t * 1650 > radar.range) radarPings.splice(i, 1);
  }

  for (let i = radarEchoes.length - 1; i >= 0; i--) {
    radarEchoes[i].t += dt;
    if (radarEchoes[i].t > 1) radarEchoes.splice(i, 1);
  }
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
      const hit = target.alive && Math.hypot(shell.endX - target.x, shell.endY - target.y) < target.radius + 90;
      splashes.push({ x: shell.endX, y: shell.endY, t: 0, maxT: hit ? 1.4 : 1.0, hit });

      if (hit) {
        target.alive = false;
        targetRespawnTimer = 10;
        lastMessage = "Trafienie! Nowy cel za 10 sekund.";
        ensureAudio();
        noise(0.35, 0.12, 190);
        tone(85, 0.24, "sawtooth", 0.08, 55);
      } else {
        lastMessage = "Plusk. Pocisk spadł do wody.";
        ensureAudio();
        noise(0.28, 0.07, 520);
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
}

function respawnTarget(dt) {
  if (target.alive) return;

  targetRespawnTimer -= dt;
  if (targetRespawnTimer <= 0) {
    target = randomTarget();
    targetRespawnTimer = null;
    lastMessage = "Nowy cel testowy na mapie.";
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

function getAimPoint() {
  return {
    x: ship.x + Math.cos(guns.bearing) * guns.range,
    y: ship.y + Math.sin(guns.bearing) * guns.range
  };
}

function getGunMuzzle() {
  return {
    x: ship.x + Math.cos(ship.heading) * 24,
    y: ship.y + Math.sin(ship.heading) * 24
  };
}

function fireGun() {
  if (guns.reload > 0) {
    lastMessage = "Działa przeładowują.";
    return;
  }

  const aim = getAimPoint();
  const start = getGunMuzzle();
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
    flightTime
  });

  muzzleFlashes.push({ x: start.x, y: start.y, angle: guns.bearing, t: 0 });

  guns.reload = guns.reloadTime;
  lastMessage = `Ogień. Czas lotu: ${flightTime.toFixed(1)} s.`;

  ensureAudio();
  tone(58, 0.22, "sawtooth", 0.32, 34);
  setTimeout(() => tone(92, 0.11, "square", 0.18, 52), 25);
  noise(0.34, 0.20, 240);
}

// ---------- DRAW: WORLD ----------

function drawMain() {
  resizeAll();
  updateCamera();
  updateCursorMode();

  drawOcean();
  drawTacticalOverlays();
  drawTarget();
  drawSensorEffects();
  drawEffects();
  drawAircraft();

  const shipScreen = worldToScreen(ship);
  // Ten sam model co w prawym oknie. Na mapie jest tylko przeskalowany.
  drawFletcher(ctx, shipScreen.x, shipScreen.y, ship.heading, 0.15, true);

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
  drawWake();
  drawRain();
}

function drawWorldGrid() {
  const w = game.width;
  const h = game.height;
  const gridStepM = 1000;

  ctx.save();
  ctx.strokeStyle = "rgba(220,230,215,.18)";
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
  ctx.strokeStyle = `rgba(205,220,205,${0.035 + weather.wave * 0.04})`;
  ctx.lineWidth = 1;

  const waveSpacingM = 550;
  const waveLengthM = 460;
  const ampPx = 2.2 + weather.wave * 1.5;

  const startY = Math.floor(camera.y / waveSpacingM) * waveSpacingM;
  const endY = camera.y + h * METERS_PER_PIXEL + waveSpacingM;
  const startX = Math.floor(camera.x / waveLengthM) * waveLengthM;
  const endX = camera.x + w * METERS_PER_PIXEL + waveLengthM;

  for (let wy = startY; wy <= endY; wy += waveSpacingM) {
    ctx.beginPath();
    let first = true;

    for (let wx = startX; wx <= endX; wx += 110) {
      const sx = (wx - camera.x) / METERS_PER_PIXEL;
      const sy = (wy - camera.y) / METERS_PER_PIXEL;
      const yy = sy + Math.sin(wx / waveLengthM * Math.PI * 2 + wy * 0.0007) * ampPx;

      if (first) {
        ctx.moveTo(sx, yy);
        first = false;
      } else {
        ctx.lineTo(sx, yy);
      }
    }

    ctx.stroke();
  }

  ctx.restore();
}

function drawWake() {
  ctx.save();

  for (const mark of wake) {
    const p = worldToScreen(mark);
    const life = clamp(1 - mark.t / 55, 0, 1);
    const width = (16 + mark.t * 8) / METERS_PER_PIXEL;
    const length = (80 + mark.t * 22) / METERS_PER_PIXEL;

    ctx.globalAlpha = 0.55 * life * mark.intensity;
    ctx.strokeStyle = "rgba(230,240,230,.85)";
    ctx.fillStyle = "rgba(230,240,230,.045)";
    ctx.lineWidth = Math.max(1, 4.2 * life);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(mark.heading);

    ctx.beginPath();
    ctx.ellipse(-length * 0.18, 0, Math.max(4, length), Math.max(2, width), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawRain() {
  if (weather.rain <= 0) return;

  const w = game.width;
  const h = game.height;

  ctx.save();
  ctx.strokeStyle = `rgba(210,225,220,${0.025 + weather.rain * 0.045})`;
  ctx.lineWidth = 1;

  const slantX = Math.cos(weather.windDir) * 10;
  const slantY = Math.sin(weather.windDir) * 10 + 7;

  for (let i = 0; i < rainDrops.length; i += 2) {
    const r = rainDrops[i];
    const x = ((r.x * w + weather.t * weather.windSpeed * 8 * r.s) % (w + 80)) - 40;
    const y = ((r.y * h + weather.t * 90 * r.s) % (h + 80)) - 40;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + slantX * r.s, y + slantY * r.s);
    ctx.stroke();
  }

  ctx.restore();
}

// ---------- DRAW: OVERLAYS ----------

function drawTacticalOverlays() {
  drawRangeCircles();
  drawCourseDeviationArc();

  if (Math.abs(ship.rudder) > 1 && ship.speed > 1) {
    const predicted = ship.heading + (ship.rudder / ship.maxRudder) * (ship.speed / 18.5) * 0.42;
    drawArrowWorld(ship, predicted, 1050, "przewidywany", "rgba(225,235,225,.75)", true);
  }

  if (ship.orderedCourse !== null) {
    drawArrowWorld(ship, degToRad(ship.orderedCourse), 1300, `kurs ${String(Math.round(ship.orderedCourse)).padStart(3, "0")}`, "rgba(225,235,225,.75)", true);
  }

  drawArrowWorld(ship, ship.heading, 900, "kurs", "rgba(225,235,225,.85)");
  drawGunneryOverlay();
}

function drawRangeCircles() {
  const s = worldToScreen(ship);

  const circle = (range, color, dash = []) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.arc(s.x, s.y, range / METERS_PER_PIXEL, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  circle(sonar.minRange, "rgba(111,226,93,.55)", [6, 4]);
  circle(sonar.range, "rgba(111,226,93,.82)", [9, 5]);
  circle(radar.range, "rgba(74,182,255,.82)", [9, 5]);
  circle(guns.minRange, "rgba(217,170,42,.72)", [8, 5]);
  circle(guns.maxRange, "rgba(217,170,42,.92)", [10, 5]);
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

function drawCourseDeviationArc() {
  if (ship.orderedCourse === null && Math.abs(ship.rudder) < 1) return;

  const s = worldToScreen(ship);
  const base = ship.heading;
  const targetAngle = ship.orderedCourse !== null
    ? degToRad(ship.orderedCourse)
    : ship.heading + (ship.rudder / ship.maxRudder) * 0.72;

  const diff = angleDiffRad(targetAngle, base);
  if (Math.abs(diff) < 0.02) return;

  const radius = 72;
  const end = base + diff;

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.strokeStyle = "rgba(225,235,225,.88)";
  ctx.fillStyle = "rgba(225,235,225,.92)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.arc(0, 0, radius, base, end, diff < 0);
  ctx.stroke();

  const arrowA = end;
  ctx.beginPath();
  ctx.moveTo(Math.cos(arrowA) * radius, Math.sin(arrowA) * radius);
  ctx.lineTo(Math.cos(arrowA - Math.sign(diff) * 0.15) * (radius - 10), Math.sin(arrowA - Math.sign(diff) * 0.15) * (radius - 10));
  ctx.lineTo(Math.cos(arrowA + Math.sign(diff) * 0.15) * (radius - 10), Math.sin(arrowA + Math.sign(diff) * 0.15) * (radius - 10));
  ctx.closePath();
  ctx.fill();

  ctx.font = "14px system-ui";
  const deg = Math.abs(diff * 180 / Math.PI).toFixed(0);
  const mid = base + diff / 2;
  ctx.fillText(`${deg}°`, Math.cos(mid) * (radius + 16), Math.sin(mid) * (radius + 16));

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
    ctx.strokeStyle = `rgba(111,226,93,${1 - radius / sonar.range})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius / METERS_PER_PIXEL, pulse.angle - sonar.beamWidth / 2, pulse.angle + sonar.beamWidth / 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const ping of radarPings) {
    const radius = ping.t * 1650;
    const sp = worldToScreen(ship);

    ctx.save();
    ctx.strokeStyle = `rgba(74,182,255,${0.22 - radius / radar.range * 0.2})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, radius / METERS_PER_PIXEL, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const echo of radarEchoes) {
    const sp = worldToScreen(echo);

    ctx.save();
    ctx.strokeStyle = `rgba(74,182,255,${1 - echo.t})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 8 + echo.t * 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------- DRAW: OBJECTS ----------

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

function drawAircraft() {
  const p = worldToScreen(aircraft);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(aircraft.heading);
  ctx.scale(0.7, 0.7);
  ctx.strokeStyle = "rgba(230,230,230,.75)";
  ctx.lineWidth = 1.5;

  // Fw 200 Condor — uproszczona sylwetka.
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-16, 0);
  ctx.moveTo(0, -2);
  ctx.lineTo(0, 2);
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

function drawFletcher(context, x, y, heading, scale = 1, wakeOn = true) {
  context.save();
  context.translate(x, y);
  context.rotate(heading);
  context.scale(scale, scale);

  // Ważne: model rysujemy w lokalnych jednostkach, a nie przez skalowanie canvasu
  // zależne od METERS_PER_PIXEL. Dzięki temu wygląda identycznie na mapie i w oknie.
  context.lineWidth = 1.4 / Math.max(scale, 0.1);
  context.strokeStyle = "#0b100d";

  // Kadłub Fletchera: długi, wąski, ostry dziób, płaska rufa.
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

  // Pokład.
  context.fillStyle = "#aab3a7";
  context.fillRect(-42, -4.8, 82, 9.6);

  // Nadbudówki, kominy, mostek.
  context.fillStyle = "#c0c7bd";
  context.fillRect(11, -6.5, 19, 13);
  context.fillStyle = "#a3ada1";
  context.fillRect(-12, -5.5, 17, 11);
  context.fillStyle = "#747f76";
  context.fillRect(-28, -4.5, 9, 9);
  context.fillRect(-38, -4.2, 7, 8.4);

  // Maszt.
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

  // Pięć stanowisk dział.
  drawTurret(context, 46, 0, guns.bearing - heading, scale);
  drawTurret(context, 30, 0, guns.bearing - heading, scale);
  drawTurret(context, -18, 0, guns.bearing - heading, scale);
  drawTurret(context, -39, 0, guns.bearing - heading, scale);
  drawTurret(context, -55, 0, guns.bearing - heading, scale);

  // Wyrzutnie torped.
  context.strokeStyle = "#202820";
  context.lineWidth = 1.1 / Math.max(scale, 0.1);
  for (let i = -2; i <= 2; i++) {
    context.beginPath();
    context.moveTo(-4, i * 2.2);
    context.lineTo(7, i * 2.2);
    context.stroke();
  }

  if (wakeOn) {
    context.strokeStyle = "rgba(220,230,215,.32)";
    context.lineWidth = 1 / Math.max(scale, 0.1);
    context.beginPath();
    context.moveTo(-68, -3);
    context.lineTo(-100, -14);
    context.moveTo(-68, 3);
    context.lineTo(-100, 14);
    context.stroke();
  }

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

// ---------- DRAW: PANELS ----------

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
  context.moveTo(cx - r, cy);
  context.lineTo(cx + r, cy);
  context.moveTo(cx, cy - r);
  context.lineTo(cx, cy + r);
  context.stroke();

  context.globalAlpha = 1;
  context.beginPath();
  context.arc(cx, cy, r, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = "#d9e3d3";
  context.beginPath();
  context.arc(cx, cy, 4, 0, Math.PI * 2);
  context.fill();

  if (target.alive && (type !== "sonar" || sonar.on)) {
    const dx = target.x - ship.x;
    const dy = target.y - ship.y;
    const d = Math.hypot(dx, dy);

    if (d <= range && (type !== "sonar" || d >= sonar.minRange)) {
      context.fillStyle = type === "sonar" ? "#6fe25d" : "#4ab6ff";
      context.beginPath();
      context.arc(cx + dx / range * r, cy + dy / range * r, type === "sonar" ? 3 : 4, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.fillStyle = type === "sonar" ? "#6fe25d" : "#4ab6ff";
  context.font = "12px Courier New";
  context.fillText(`${range} m`, 8, h - 10);

  context.restore();
}

function drawShipPanel() {
  const w = shipView.width;
  const h = shipView.height;

  shipCtx.clearRect(0, 0, w, h);
  shipCtx.fillStyle = "#050806";
  shipCtx.fillRect(0, 0, w, h);

  shipCtx.strokeStyle = "rgba(217,227,211,.16)";
  shipCtx.beginPath();
  shipCtx.moveTo(w / 2, 0);
  shipCtx.lineTo(w / 2, h);
  shipCtx.moveTo(0, h / 2);
  shipCtx.lineTo(w, h / 2);
  shipCtx.stroke();

  // Ten sam rysunek co na mapie. Skala tylko większa.
  const previewScale = Math.min(w, h) / 210;
  drawFletcher(shipCtx, w / 2, h / 2 - 2, ship.heading, previewScale, false);

  shipCtx.fillStyle = "#95a18f";
  shipCtx.font = "12px Courier New";
  shipCtx.fillText(`WIATR ${radToCourse(weather.windDir).toFixed(0)}° / ${weather.windSpeed.toFixed(1)} m/s`, 8, h - 10);
}

function drawMapHud() {
  const order = speedOrders[ship.targetSpeedIndex];
  const course = radToCourse(ship.heading).toFixed(0).padStart(3, "0");
  const rudderSide = ship.rudder < -0.5 ? "L" : ship.rudder > 0.5 ? "P" : "ZERO";
  const text = `PRĘDKOŚĆ ${order.name} / ${ship.speed.toFixed(1)} m/s   STER ${Math.abs(ship.rudder).toFixed(0)}° ${rudderSide}   KURS ${course}°`;

  ctx.save();
  ctx.font = "bold 15px Courier New";

  const metrics = ctx.measureText(text);
  const padX = 14;
  const boxW = metrics.width + padX * 2;
  const boxH = 32;
  const x = (game.width - boxW) / 2;
  const y = game.height - boxH - 14;

  ctx.fillStyle = "rgba(5,8,6,.72)";
  ctx.strokeStyle = "rgba(217,227,211,.45)";
  ctx.lineWidth = 1;

  roundedRect(ctx, x, y, boxW, boxH, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#d9e3d3";
  ctx.fillText(text, x + padX, y + 21);

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

function updateCursorMode() {
  game.classList.toggle("aiming", inputMode === "AIM" && !drag.active);
}

function updateUI() {
  const course = radToCourse(ship.heading);
  const order = speedOrders[ship.targetSpeedIndex];
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
    `TRYB WPISYWANIA: ${inputMode === "AIM" ? "KĄT CELOWANIA" : "KURS OKRĘTU"}  |  WPIS: ${inputMode === "AIM" ? (angleInput || "---") : (courseInput || "---")}  |  SONAR ${sonar.on ? "WŁ." : "WYŁ."}  |  RADAR ${radar.range} m  |  DZIAŁA ${guns.minRange}-${guns.maxRange} m\n` +
    `BŁĄD CEL.: ${miss} m  |  NOWY CEL: ${respawn}  |  ZOOM: ${zoom.toFixed(2)}x  |  SKALA: 1px=${METERS_PER_PIXEL.toFixed(1)}m  |  ${lastMessage}\n` +
    `Mysz: kółko=zoom, LPM=przesuń mapę, 2x klik=centruj. W/S prędkość, A/D ster, Z zero, G przełącza wpis KURS/KĄT, F auto, < > obrót, O/L zasięg, [ ] sonar, Spacja strzał`;
}

// ---------- LOOP ----------

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  weather.t += dt;

  updateOrders(dt);
  updatePhysics(dt);
  updateWake(dt);
  updateAircraft(dt);
  updateSonar(dt);
  updateRadar(dt);
  updateProjectiles(dt);
  respawnTarget(dt);

  drawMain();
  updateUI();

  requestAnimationFrame(loop);
}
