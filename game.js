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
const radarButton = document.getElementById("radarButton");
const menuBtn = document.getElementById("menuBtn");
const startMenu = document.getElementById("startMenu");
const resumeGameBtn = document.getElementById("resumeGameBtn");
const newGameBtn = document.getElementById("newGameBtn");
const optionsBtn = document.getElementById("optionsBtn");
const exitBtn = document.getElementById("exitBtn");
const optionsPanel = document.getElementById("optionsPanel");
const fontScaleSlider = document.getElementById("fontScaleSlider");
const fontScaleValue = document.getElementById("fontScaleValue");
const weatherToggle = document.getElementById("weatherToggle");
const aircraftToggle = document.getElementById("aircraftToggle");
const tutorialBtn = document.getElementById("tutorialBtn");
const tutorialPanel = document.getElementById("tutorialPanel");
const trainingMission1Btn = document.getElementById("trainingMission1Btn");
const captainNameInput = document.getElementById("captainNameInput");
const tutorialPrompt = document.getElementById("tutorialPrompt");
const tutorialText = document.getElementById("tutorialText");
const tutorialPrevBtn = document.getElementById("tutorialPrevBtn");
const tutorialNextBtn = document.getElementById("tutorialNextBtn");
const tutorialCloseBtn = document.getElementById("tutorialCloseBtn");
const shipResourceBtn = document.getElementById("shipResourceBtn");
const resourcePanel = document.getElementById("resourcePanel");
const closeResourceBtn = document.getElementById("closeResourceBtn");
const resourceRead = document.getElementById("resourceRead");
const dayNightRead = document.getElementById("dayNightRead");
const pauseTimeBtn = document.getElementById("pauseTimeBtn");
const timeHalfBtn = document.getElementById("timeHalfBtn");
const time1Btn = document.getElementById("time1Btn");
const time2Btn = document.getElementById("time2Btn");
const time4Btn = document.getElementById("time4Btn");
const time10Btn = document.getElementById("time10Btn");
const dcLeftBtn = document.getElementById("dcLeftBtn");
const dcRightBtn = document.getElementById("dcRightBtn");
const dcSternBtn = document.getElementById("dcSternBtn");
const dcShallowBtn = document.getElementById("dcShallowBtn");
const dcMediumBtn = document.getElementById("dcMediumBtn");
const dcDeepBtn = document.getElementById("dcDeepBtn");
const dcRead = document.getElementById("dcRead");
const windBtn = document.getElementById("windBtn");
const infoBtn = document.getElementById("infoBtn");
const seaBtn = document.getElementById("seaBtn");
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
const AA_RANGE = 3810;

let baseMetersPerPixel = 42;
let metersPerPixel = 42;
let zoom = 1.0;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 420.0;

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
const HORIZON_RANGE = 20000;

const weather = {
  t: 0,
  rain: 0.28,
  wave: 0.34,
  windDir: degToRad(305),
  windSpeed: 14.5,
  visibility: 5200,
  changeTimer: 0,
  targetWindDir: degToRad(305),
  targetWindSpeed: 14.5,
  targetRain: 0.28,
  targetWave: 0.34
};

const forecast = {
  rain: 0.35,
  wave: 0.38,
  windDir: degToRad(292),
  windSpeed: 12.5,
  visibility: 5400
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

let nextSurfaceContactId = 1;
let nextSubContactId = 1;
let target = randomTarget();
let lastRadarContact = null;
let lastRadarAirContact = null;
let lastSonarContact = null;
let inputMode = "COURSE";
let courseInput = "";
let angleInput = "";
let lastMessage = "Gotowy.";
let windLayerOn = true;
let infoOn = true;
let seaLayerOn = true;
let gameStarted = false;
let autoFire = false;
let uiFontScale = 1.0;
let weatherEnabled = true;
let aircraftEnabled = true;
let gameClock = 12 * 3600;
let timeCompression = 1;
let lastWatchName = null;
let tutorialMode = false;
let tutorialStep = 0;
let tutorialStep1Complete = false;
let captainName = "Kapitanie";
let resources = { fuel:100, ammo5:520, ammoAA:2400, depthCharges:42, crewFatigue:8, engineWear:6, morale:86 };
let activeWeapon = "guns";
let dcLauncher = "stern";
let dcDepth = 90;
let engineOsc = null;
let engineGain = null;
let contactTrackSeq = 1;
let navPlanningMode = false;
let navFollowEnabled = true;
let navHardTurn = false;
const navWaypoints = [];
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
uiFontScale = 1.5;
fontScaleSlider.value = "150";
fontScaleValue.textContent = "150%";
document.documentElement.style.setProperty("--ui-scale", "1.5");
document.body.classList.add("menuOpen");
bindEvents();
requestAnimationFrame(loop);

function bindEvents() {
  window.addEventListener("resize", resizeAll);

  sonarButton.addEventListener("click", () => {
    ensureAudio();
    sonar.on = !sonar.on;
    sonar.ping = 0;
  });

  radarButton.addEventListener("click", () => {
    radar.on = !radar.on;
    radarButton.textContent = radar.on ? "WYŁĄCZ" : "WŁĄCZ";
  });

  newGameBtn.addEventListener("click", () => {
    resetGameState();
    startMenu.classList.add("hidden");
    document.body.classList.remove("menuOpen");
    resumeGameBtn.classList.remove("hidden");
    gameStarted = true;
    lastMessage = "Nowa gra rozpoczęta.";
  });

  resumeGameBtn.addEventListener("click", () => {
    startMenu.classList.add("hidden");
    document.body.classList.remove("menuOpen");
    gameStarted = true;
    lastMessage = "Powrót do gry.";
  });

  menuBtn.addEventListener("click", () => toggleGameMenu());

  radarButton.addEventListener("click", () => {
    radar.on = !radar.on;
    radarButton.textContent = radar.on ? "WYŁĄCZ" : "WŁĄCZ";
  });

  newGameBtn.addEventListener("click", () => {
    startMenu.classList.add("hidden");
    gameStarted = true;
    lastMessage = "Nowa gra rozpoczęta.";
  });

  
  tutorialBtn.addEventListener("click", () => {
    tutorialPanel.classList.toggle("hidden");
    optionsPanel.classList.add("hidden");
  });

  trainingMission1Btn.addEventListener("click", () => {
    startTutorialMission1();
  });

  tutorialNextBtn.addEventListener("click", () => {
    if (tutorialStep >= tutorialSteps.length - 1) {
      tutorialPrompt.classList.add("hidden");
      tutorialMode = false;
      return;
    }
    tutorialStep += 1;
    showTutorialStep();
  });

  tutorialPrevBtn.addEventListener("click", () => {
    tutorialStep -= 1;
    showTutorialStep();
  });

  tutorialCloseBtn.addEventListener("click", () => {
    tutorialPrompt.classList.add("hidden");
    tutorialMode = false;
  });

  optionsBtn.addEventListener("click", () => {
    optionsPanel.classList.toggle("hidden");
    tutorialPanel.classList.add("hidden");
  });

  menuBtn.addEventListener("click", () => {
    gameStarted = false;
    startMenu.classList.remove("hidden");
    lastMessage = "Powrót do menu.";
  });

  exitBtn.addEventListener("click", () => {
    lastMessage = "Wyjście z gry: zamknij kartę przeglądarki.";
    try { window.close(); } catch (error) {}
  });

  fontScaleSlider.addEventListener("input", () => {
    const value = Number(fontScaleSlider.value);
    uiFontScale = value / 100;
    document.documentElement.style.setProperty("--ui-scale", String(uiFontScale));
    fontScaleValue.textContent = `${value}%`;
  });

  weatherToggle.addEventListener("change", () => {
    weatherEnabled = weatherToggle.checked;
    lastMessage = weatherEnabled ? "Pogoda włączona." : "Pogoda wyłączona.";
  });

  aircraftToggle.addEventListener("change", () => {
    aircraftEnabled = aircraftToggle.checked;
    lastMessage = aircraftEnabled ? "Samoloty włączone." : "Samoloty wyłączone.";
  });
  shipResourceBtn.addEventListener("click", () => resourcePanel.classList.toggle("hidden"));
  closeResourceBtn.addEventListener("click", () => resourcePanel.classList.add("hidden"));
  pauseTimeBtn.addEventListener("click", () => setTimeCompression(0));
  timeHalfBtn.addEventListener("click", () => setTimeCompression(0.5));
  time1Btn.addEventListener("click", () => setTimeCompression(1));
  time2Btn.addEventListener("click", () => setTimeCompression(2));
  time4Btn.addEventListener("click", () => setTimeCompression(4));
  time10Btn.addEventListener("click", () => setTimeCompression(10));
  setTimeCompression(1);

  dcLeftBtn.addEventListener("click", () => { dcLauncher = "left"; activeWeapon = "depth"; updateDepthChargeButtons(); });
  dcRightBtn.addEventListener("click", () => { dcLauncher = "right"; activeWeapon = "depth"; updateDepthChargeButtons(); });
  dcSternBtn.addEventListener("click", () => { dcLauncher = "stern"; activeWeapon = "depth"; updateDepthChargeButtons(); });
  dcShallowBtn.addEventListener("click", () => { dcDepth = 30; activeWeapon = "depth"; updateDepthChargeButtons(); });
  dcMediumBtn.addEventListener("click", () => { dcDepth = 90; activeWeapon = "depth"; updateDepthChargeButtons(); });
  dcDeepBtn.addEventListener("click", () => { dcDepth = 180; activeWeapon = "depth"; updateDepthChargeButtons(); });
  updateDepthChargeButtons();


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

  seaBtn.addEventListener("click", () => {
    seaLayerOn = !seaLayerOn;
    seaBtn.textContent = seaLayerOn ? "FALE: WŁ." : "FALE: WYŁ.";
    seaBtn.classList.toggle("on", seaLayerOn);
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

  game.addEventListener("click", (event) => {
    const rect = game.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const sx = (event.clientX - rect.left) * dpr;
    const sy = (event.clientY - rect.top) * dpr;
    const world = { x: camera.x + sx * metersPerPixel, y: camera.y + sy * metersPerPixel };
    if (!navPlanningMode && gameStarted) {
      const clicked = nearestClickableContact(world);
      if (clicked) {
        centerCameraOn(clicked);
        lastMessage = `Widok wycentrowany na kontakcie ${contactDisplayName(clicked, clicked.trackKind || "surface", true)}.`;
      }
      return;
    }
    if (!navPlanningMode || !gameStarted) return;
    if (navWaypoints.length >= 5) {
      lastMessage = "Plan może mieć maksymalnie 5 punktów. Naciśnij B, aby skasować.";
      return;
    }
    navWaypoints.push({
      x: world.x,
      y: world.y
    });
    lastMessage = `Dodano punkt kursu ${navWaypoints.length}/5.`;
  });

  weaponRead.addEventListener("click", (event) => {
    if (event.target && event.target.id === "autoFireButton") {
      autoFire = !autoFire;
      guns.mode = autoFire ? "AUTO" : "MANUAL";
      lastMessage = autoFire ? "Automatyczne prowadzenie ognia włączone." : "Automatyczne prowadzenie ognia wyłączone.";
    }
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    keys.delete(key);
    handled.delete(key);
  });
}



function captainAddress() {
  const raw = (captainNameInput && captainNameInput.value ? captainNameInput.value.trim() : "") || captainName || "";
  return raw ? `kapitanie ${raw}` : "kapitanie";
}

function getTutorialSteps() {
  const cap = captainAddress();
  return [
    `Witaj, ${cap}, na pokładzie niszczyciela klasy Fletcher. Fletcher był jednym z najważniejszych amerykańskich niszczycieli II wojny światowej: szybki, zwrotny, z silnym uzbrojeniem artyleryjskim i przeciwlotniczym. Okręty tej klasy służyły na Atlantyku i Pacyfiku, eskortowały konwoje, osłaniały lotniskowce i polowały na okręty podwodne. Marynarze cenili je za szybkość, dzielność morską i solidność, choć służba na nich była ciasna, mokra i wyczerpująca. Dziś poznasz podstawy dowodzenia takim okrętem.`,
    `Zaczniemy od najprostszych rzeczy, ${cap}. Klawisze W i S sterują maszynami i ustalają prędkość okrętu, a klawisze A i D wychylenie steru. Maksymalne wychylenie steru w tej symulacji to ${ship.maxRudder}°. Spróbuj zwiększyć prędkość i wychylić ster.`,
    `Na mapie widzisz dwa podstawowe wektory. AKTUALNY pokazuje kierunek, w którym ustawiony jest okręt. ZADANY pokazuje kurs, do którego zmierza autopilot lub kurs wpisany z klawiatury.`,
    `Kurs zadany możesz wpisać cyframi. Na przykład wpisz 2 4 8, a potem Enter, aby zadać kurs 248°. Okręt nie obróci się natychmiast — będzie skręcał zgodnie z prędkością, sterem i bezwładnością.`,
    `Zakrzywiona linia na mapie pokazuje przewidywany tor okrętu. Strzałka na końcu oznacza miejsce, w którym okręt znajdzie się za około 30 sekund, jeśli utrzyma obecny ruch.`,
    `Przetestuj teraz, ${cap}: zwiększ prędkość, wychyl ster, wpisz kurs i obserwuj wektory. Kiedy skończysz, możesz zamknąć tutorial albo przejść do kolejnych misji w menu.`
  ];
}

function showTutorialStep() {
  tutorialPrompt.classList.remove("hidden");
  const tutorialSteps = getTutorialSteps();
  tutorialStep = clamp(tutorialStep, 0, tutorialSteps.length - 1);
  tutorialText.textContent = tutorialSteps[tutorialStep];
  tutorialPrevBtn.disabled = tutorialStep === 0;
  tutorialNextBtn.textContent = tutorialStep === tutorialSteps.length - 1 ? "KONIEC" : "DALEJ";
  tutorialNextBtn.disabled = tutorialStep === 1 && !tutorialStep1Complete;
}

function startTutorialMission1() {
  captainName = (captainNameInput && captainNameInput.value ? captainNameInput.value.trim() : "") || "";
  resetGameState();
  tutorialMode = true;
  tutorialStep = 0;
  tutorialStep1Complete = false;
  // Misja 1: tylko okręt, brak kontaktów.
  if (target) target.alive = false;
  aircraft.splice(0, aircraft.length);
  subs.splice(0, subs.length);
  radarEchoes.length = 0;
  sonarPulses.length = 0;
  lastRadarContact = null;
  lastRadarAirContact = null;
  lastSonarContact = null;
  gameClock = 14 * 3600;
  startMenu.classList.add("hidden");
  document.body.classList.remove("menuOpen");
  resumeGameBtn.classList.remove("hidden");
  gameStarted = true;
  showTutorialStep();
  lastMessage = "Misja treningowa 1: sterowanie okrętem.";
}

function resetGameState() {
  ship.x = WORLD_W / 2;
  ship.y = WORLD_H * 0.62;
  ship.heading = degToRad(0);
  ship.speed = 0;
  ship.targetSpeedIndex = STOP_INDEX;
  ship.rudder = 0;
  ship.orderedCourse = null;
  ship.autopilot = false;

  camera.manualOffsetX = 0;
  camera.manualOffsetY = 0;
  zoom = 1;

  nextSurfaceContactId = 1;
  nextSubContactId = 1;
  contactTrackSeq = 1;
  target = randomTarget();
  aircraft.splice(0, aircraft.length, ...Array.from({ length: 3 }, (_, i) => makeCondor(i)));
  subs.splice(0, subs.length, ...Array.from({ length: 4 }, () => makeSub()));

  lastRadarContact = null;
  lastRadarAirContact = null;
  lastSonarContact = null;

  shells.length = 0;
  splashes.length = 0;
  muzzleFlashes.length = 0;
  wake.length = 0;
  radarEchoes.length = 0;
  sonarPulses.length = 0;
  smoke.length = 0;
  aaTracers.length = 0;
  aaBursts.length = 0;
  wrecks.length = 0;
  navWaypoints.length = 0;

  gameClock = 12 * 3600;
  timeCompression = 1;
  resources = { fuel:100, ammo5:520, ammoAA:2400, depthCharges:42, crewFatigue:8, engineWear:6, morale:86 };
  activeWeapon = "guns"; dcLauncher = "stern"; dcDepth = 90; updateDepthChargeButtons();
  setTimeCompression(1);
  lastMessage = "Nowa gra rozpoczęta.";
}

function toggleGameMenu() {
  if (startMenu.classList.contains("hidden")) {
    gameStarted = false; startMenu.classList.remove("hidden"); document.body.classList.add("menuOpen"); resumeGameBtn.classList.remove("hidden"); lastMessage = "Gra zatrzymana — menu.";
  } else {
    startMenu.classList.add("hidden"); document.body.classList.remove("menuOpen"); gameStarted = true; lastMessage = "Powrót do gry.";
  }
}

function updateAudioMuteState() {
  if (!audioCtx) return;
  if (timeCompression === 0 || !gameStarted) {
    if (engineGain) engineGain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.05);
  }
}

function bellWatchChange() {
  ensureAudio();
  const t = audioCtx.currentTime;
  const freqs = [880, 1175, 880, 1175];
  freqs.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.16, t + i * 0.18 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.13);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t + i * 0.18);
    osc.stop(t + i * 0.18 + 0.16);
  });
}

function setTimeCompression(value) {
  timeCompression = value;
  for (const btn of [pauseTimeBtn,timeHalfBtn,time1Btn,time2Btn,time4Btn,time10Btn]) btn.classList.remove("active");
  ({0:pauseTimeBtn,0.5:timeHalfBtn,1:time1Btn,2:time2Btn,4:time4Btn,10:time10Btn}[value] || time1Btn).classList.add("active");
  updateAudioMuteState();
}

function nearestClickableContact(worldPoint) {
  const all = [];
  if (target && target.alive) all.push(target);
  if (aircraftEnabled) all.push(...aircraft);
  all.push(...subs);
  let best = null;
  let bd = Infinity;
  for (const c of all) {
    const d = dist(worldPoint, c);
    if (d < bd) { bd = d; best = c; }
  }
  return bd < 650 ? best : null;
}

function centerCameraOn(point) {
  camera.manualOffsetX = point.x - ship.x;
  camera.manualOffsetY = point.y - ship.y;
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (key === "escape") { event.preventDefault(); toggleGameMenu(); return; }
  if (key === "1") { setActiveWeapon("guns"); updateDepthChargeButtons(); return; }
  if (key === "2" && event.code !== "Numpad2") { setActiveWeapon("depth"); updateDepthChargeButtons(); return; }
  keys.add(key);
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "+", "-", "add", "subtract"].includes(key)) {
    event.preventDefault();
  }

  if (/^[0-9]$/.test(event.key)) {
    if (inputMode === "AIM") angleInput = (angleInput + event.key).slice(-3);
    else courseInput = (courseInput + event.key).slice(-3);
  }

  if (key === "n") {
    navPlanningMode = !navPlanningMode;
    game.classList.toggle("plotting", navPlanningMode);
    lastMessage = navPlanningMode ? "Tryb wytyczania kursu: kliknij do 5 punktów." : "Tryb wytyczania kursu wyłączony.";
  }

  if (key === "b") {
    navWaypoints.length = 0;
    ship.autopilot = false;
    ship.orderedCourse = null;
    navHardTurn = false;
    lastMessage = "Plan kursu skasowany.";
  }

  if (key === "v") {
    navFollowEnabled = !navFollowEnabled;
    if (!navFollowEnabled) {
      ship.autopilot = false;
      ship.orderedCourse = null;
      navHardTurn = false;
    }
    lastMessage = navFollowEnabled ? "Automatyczne podążanie za trasą włączone." : "Automatyczne podążanie za trasą wyłączone.";
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


function uiFont(px, weight = "bold", family = "Courier New") {
  return `${weight} ${Math.round(px * uiFontScale)}px ${family}`;
}

function uiPx(px) {
  return px * uiFontScale;
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
    contactId: nextSurfaceContactId++,
    contactName: "Frachtowiec",
    trackKind: "surface",
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
    contactId: index + 1,
    identified: false,
    trackKind: "air",
    x: ship.x - 7000 - index * 3500 + Math.random() * 2500,
    y: ship.y - 5000 + Math.random() * 10000,
    heading: angleToPoint({ x: ship.x - 7000, y: ship.y - 2500 + Math.random() * 5000 }, ship) + (Math.random() - 0.5) * 0.55,
    speed: 86 + Math.random() * 12,
    hp: 24,
    maxHp: 24,
    aaCooldown: 0,
    damaged: false,
    lastSeenX: null,
    lastSeenY: null,
    lastSeenAge: 999
  };
}

function makeSub() {
  const d = 1800 + Math.random() * 3800;
  const a = Math.random() * Math.PI * 2;
  return {
    contactId: nextSubContactId++,
    contactName: "U-Boot",
    trackKind: "sub",
    x: (ship.x + Math.cos(a) * d + WORLD_W) % WORLD_W,
    y: (ship.y + Math.sin(a) * d + WORLD_H) % WORLD_H,
    heading: Math.random() * Math.PI * 2,
    speed: 1.2 + Math.random() * 1.5,
    alive: true
  };
}



function ensureTrack(object, kind) {
  if (!object.trackId) object.trackId = contactTrackSeq++;
  if (!object.trackKind) object.trackKind = kind;
  if (!object.trackHistory) object.trackHistory = [];
  return object.trackId;
}

function recordContactDetection(object, kind, sensor) {
  ensureTrack(object, kind);
  if (!object.trackHistory) object.trackHistory = [];
  const t = gameClock || weather.t || 0;
  object.trackHistory.push({ x: object.x, y: object.y, t, sensor });
  if (object.trackHistory.length > 8) object.trackHistory.shift();

  if (object.trackHistory.length >= 2) {
    const a = object.trackHistory[object.trackHistory.length - 2];
    const b = object.trackHistory[object.trackHistory.length - 1];
    const dt = Math.max(0.001, b.t - a.t);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    object.predictedCourse = radToCourse(Math.atan2(dy, dx));
    object.predictedSpeed = Math.hypot(dx, dy) / dt;
  }
}

function contactDisplayName(object, kind, visible = true) {
  const id = object.trackId || object.contactId || "?";
  if (kind === "air") return visible && object.identified ? `Condor ${id}` : `Samolot ${id}`;
  if (kind === "sub") return `U-Boot ${id}`;
  return `${object.contactName || "Frachtowiec"} ${id}`;
}

function predictedCourseLine(object) {
  if (!object.trackHistory || object.trackHistory.length < 2 || object.predictedCourse === undefined) return "KURS ? ---";
  return `KURS ${String(Math.round(object.predictedCourse)).padStart(3, "0")}°`;
}

function updateClockAndResources(dt) {
  const factor = gameStarted ? timeCompression : 0;
  gameClock = (gameClock + dt * factor * 60) % (24 * 3600);
  resources.fuel = clamp(resources.fuel - Math.abs(ship.speed) * 0.0000045 * dt * factor, 0, 100);
  resources.crewFatigue = clamp(resources.crewFatigue + 0.0009 * dt * factor * (weatherEnabled ? 1 + weather.wave * 0.8 : 1), 0, 100);
  resources.engineWear = clamp(resources.engineWear + Math.abs(ship.speed) * 0.000002 * dt * factor, 0, 100);
  const currentWatch = watchName((gameClock % (24*3600)) / 3600);
  if (lastWatchName === null) lastWatchName = currentWatch;
  if (currentWatch !== lastWatchName) {
    lastWatchName = currentWatch;
    bellWatchChange();
  }
}
function sunMoonState() {
  const hour = (gameClock % (24*3600)) / 3600;
  const daylight = clamp(Math.sin(((hour - 6) / 12) * Math.PI), 0, 1);
  const moonlight = clamp(Math.sin(((hour - 18) / 12) * Math.PI), 0, 1) * 0.28;
  return { hour, daylight, moonlight, light: clamp(0.18 + daylight * 0.82 + moonlight, 0.12, 1.08) };
}

function watchName(hour) {
  if (hour >= 0 && hour < 4) return "WACHTA ŚRODKOWA";
  if (hour >= 4 && hour < 8) return "WACHTA PORANNA";
  if (hour >= 8 && hour < 12) return "WACHTA PRZEDPOŁUDNIOWA";
  if (hour >= 12 && hour < 16) return "WACHTA POPOŁUDNIOWA";
  if (hour >= 16 && hour < 18) return "PIERWSZA PSIA WACHTA";
  if (hour >= 18 && hour < 20) return "OSTATNIA PSIA WACHTA";
  return "PIERWSZA WACHTA";
}

function formatClock() {
  const total = Math.floor(gameClock % (24*3600));
  const hour = total / 3600;
  const h = String(Math.floor(total/3600)).padStart(2,"0");
  const m = String(Math.floor((total%3600)/60)).padStart(2,"0");
  const dayPart = sunMoonState().daylight > .15 ? "DZIEŃ" : "NOC";
  return `${dayPart} ${h}:${m} — ${watchName(hour)}`;
}
function updateWeather(dt) {
  if (!weatherEnabled) {
    weather.rain += (0 - weather.rain) * 0.08 * dt;
    weather.wave += (0.12 - weather.wave) * 0.08 * dt;
    weather.visibility += (9000 - weather.visibility) * 0.08 * dt;
    return;
  }

  weather.changeTimer -= dt;
  if (weather.changeTimer <= 0) {
    weather.targetWindDir += (Math.random() - 0.5) * degToRad(38);
    weather.targetWindSpeed = clamp(weather.targetWindSpeed + (Math.random() - 0.48) * 5, 0.5, 22);
    weather.targetRain = clamp(weather.targetRain + (Math.random() - 0.5) * 0.30, 0, 1);
    weather.targetWave = clamp(0.10 + weather.targetWindSpeed / 30 + weather.targetRain * 0.20, 0.05, 1);
    updateForecast();
    weather.changeTimer = 20 + Math.random() * 30;
  }

  weather.windDir += angleDiffRad(weather.targetWindDir, weather.windDir) * 0.018 * dt;
  weather.windSpeed += (weather.targetWindSpeed - weather.windSpeed) * 0.018 * dt;
  weather.rain += (weather.targetRain - weather.rain) * 0.018 * dt;
  weather.wave += (weather.targetWave - weather.wave) * 0.018 * dt;
  const desiredVisibility = clamp(8500 - weather.rain * 4700 - weather.wave * 1700 - Math.max(0, weather.windSpeed - 12) * 70, 1600, 9000);
  weather.visibility += (desiredVisibility - weather.visibility) * 0.010 * dt;
}

function updateForecast() {
  forecast.windDir = weather.targetWindDir + (Math.random() - 0.5) * degToRad(18);
  forecast.windSpeed = clamp(weather.targetWindSpeed + (Math.random() - 0.5) * 3, 0.2, 24);
  forecast.rain = clamp(weather.targetRain + (Math.random() - 0.5) * 0.22, 0, 1);
  forecast.wave = clamp(0.12 + forecast.windSpeed / 28 + forecast.rain * 0.16, 0.05, 1);
  forecast.visibility = clamp(8500 - forecast.rain * 4700 - forecast.wave * 1700 - Math.max(0, forecast.windSpeed - 12) * 70, 1600, 9000);
}

function weatherName(rain) {
  if (rain > 0.66) return "DESZCZ";
  if (rain > 0.25) return "MŻAWKA";
  return "SUCHO";
}


function updateNavigationPlan() {
  navHardTurn = false;
  if (!navFollowEnabled || navWaypoints.length === 0) return;

  let next = navWaypoints[0];
  let range = dist(ship, next);

  if (range < 500) {
    navWaypoints.shift();
    if (navWaypoints.length === 0) {
      ship.autopilot = false;
      ship.orderedCourse = null;
      lastMessage = "Osiągnięto ostatni punkt kursu.";
      return;
    }
    next = navWaypoints[0];
    range = dist(ship, next);
  }

  const desiredCourse = radToCourse(angleToPoint(ship, next));
  const currentCourse = radToCourse(ship.heading);
  const turn = Math.abs(angleDiffDeg(desiredCourse, currentCourse));

  let nextTurn = 0;
  if (navWaypoints.length > 1) {
    const nextLegCourse = radToCourse(angleToPoint(navWaypoints[0], navWaypoints[1]));
    nextTurn = Math.abs(angleDiffDeg(nextLegCourse, desiredCourse));
  }

  ship.orderedCourse = desiredCourse;
  ship.autopilot = true;

  const closingSpeed = Math.max(Math.abs(ship.speed) * SIM_SPEED, 1);
  const eta = range / closingSpeed;
  navHardTurn = turn > 28 || (nextTurn > 35 && range < 1500) || (turn > 18 && eta < 28);

  if (navHardTurn && ship.targetSpeedIndex > 4) ship.targetSpeedIndex = 4;
  if ((turn > 65 || (nextTurn > 75 && range < 1200)) && ship.targetSpeedIndex > 3) ship.targetSpeedIndex = 3;
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

  if (once(" ")) { activeWeapon === "depth" ? dropDepthCharge() : fireGuns(); }

  if (guns.mode === "AUTO" && target.alive) {
    guns.bearing += clamp(angleDiffRad(angleToPoint(ship, target), guns.bearing), -guns.turnRate * dt, guns.turnRate * dt);
  }
}


function updateAutoFire(dt) {
  if (!autoFire || !target.alive) return;
  guns.mode = "AUTO";

  const desired = angleToPoint(ship, target);
  const range = dist(ship, target);
  guns.bearing += clamp(angleDiffRad(desired, guns.bearing), -guns.turnRate * dt, guns.turnRate * dt);
  guns.range += clamp(range - guns.range, -1500 * dt, 1500 * dt);

  const aimError = Math.abs(angleDiffRad(desired, guns.bearing));
  const rangeError = Math.abs(guns.range - range);
  const rangeReady = range >= guns.minRange && range <= guns.maxRange;

  if (aimError < degToRad(4.5) && rangeReady && rangeError < 220) {
    fireGuns(true);
  }
}

function updatePhysics(dt) {
  const targetSpeed = speedOrders[ship.targetSpeedIndex].value;
  const accel = Math.abs(targetSpeed) > Math.abs(ship.speed) ? 0.55 : 0.82;
  ship.speed += clamp(targetSpeed - ship.speed, -accel * dt, accel * dt);

  if (ship.autopilot && ship.orderedCourse !== null) {
    const diff = angleDiffDeg(ship.orderedCourse, radToCourse(ship.heading));
    if (navHardTurn) {
      ship.rudder = diff >= 0 ? ship.maxRudder : -ship.maxRudder;
    } else {
      ship.rudder = clamp(diff * 0.28, -ship.maxRudder, ship.maxRudder);
    }
    if (Math.abs(diff) < 1.2) {
      ship.rudder = 0;
      ship.heading = degToRad(ship.orderedCourse);
      if (navWaypoints.length === 0) ship.autopilot = false;
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

  if (!aircraftEnabled) return;
  for (let index = 0; index < aircraft.length; index++) {
    const plane = aircraft[index];
    plane.x += Math.cos(plane.heading) * plane.speed * dt * 2.2;
    plane.y += Math.sin(plane.heading) * plane.speed * dt * 2.2;
    if (dist(plane, ship) > 18000 || plane.hp <= 0) Object.assign(plane, makeCondor(index));
    const visible = dist(ship, plane) <= weather.visibility;
    if (visible) {
      plane.identified = true;
      plane.lastSeenX = plane.x;
      plane.lastSeenY = plane.y;
      plane.lastSeenAge = 0;
    } else if (plane.lastSeenAge !== null) {
      plane.lastSeenAge += dt;
    }
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
  if (range > AA_RANGE || plane.aaCooldown > 0) return;

  if (resources.ammoAA <= 0) return;
  resources.ammoAA = Math.max(0, resources.ammoAA - 3);
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
    if (contact) {
      recordContactDetection(contact, "sub", "sonar");
      lastSonarContact = { x: contact.x, y: contact.y, bearing: radToCourse(angleToPoint(ship, contact)), range: Math.round(dist(ship, contact)), age: 0, name: contactDisplayName(contact, "sub", true), predicted: predictedCourseLine(contact) };
    }
    blip(contact ? 520 : 1560, 0.14, contact ? 0.16 : 0.12, contact ? "triangle" : "square");
    sonar.ping = 2.4;
  }
}

function updateRadar(dt) {
  if (!radar.on) return;
  if (lastRadarContact) lastRadarContact.age += dt;
  if (lastSonarContact) lastSonarContact.age += dt;
  if (lastRadarAirContact) lastRadarAirContact.age += dt;

  radar.sweepAngle = (radar.sweepAngle + dt * Math.PI * 2 / 5.8) % (Math.PI * 2);
  checkRadar(target, "surface");
  if (aircraftEnabled) for (const plane of aircraft) checkRadar(plane, "air");

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
    recordContactDetection(object, kind, "radar");
    if (kind === "surface") {
      lastRadarContact = { bearing: radToCourse(bearing), range: Math.round(range), age: 0, name: contactDisplayName(object, "surface", true), predicted: predictedCourseLine(object) };
    }
    if (kind === "air") {
      const visible = dist(ship, object) <= weather.visibility;
      lastRadarAirContact = { bearing: radToCourse(bearing), range: Math.round(range), age: 0, name: contactDisplayName(object, "air", visible), predicted: predictedCourseLine(object) };
    }
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

function fireGuns(isAuto = false) {
  ensureAudio();
  let fired = false;

  for (const turret of turrets) {
    if (turret.reload > 0) continue;
    if (!turretCanFire(turret, guns.bearing)) continue;

    const start = turretWorldPos(turret);
    const aim = getAimPoint();
    const flightTime = ballisticFlightTime(guns.range);

    if (resources.ammo5 <= 0) { lastMessage = "Brak amunicji 5”/38."; return; }
    resources.ammo5 -= 1;
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
    if (!isAuto) break;
  }

  if (!fired && !isAuto) lastMessage = "Żadna armata nie ma sektora ostrzału albo trwa przeładowanie.";
}

function turretCanFire(turret, bearing) {
  const relative = ((angleDiffRad(bearing, ship.heading) * 180 / Math.PI) + 360) % 360;
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
  drawContactVectors();
  drawEffects();
  drawAircraft();
  drawAA();
  drawSmoke();

  const shipScreen = worldToScreen(ship);
  drawFletcher(ctx, shipScreen.x, shipScreen.y, ship.heading, clamp(0.18 * Math.sqrt(zoom), 0.18, 40));

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
  drawCelestialLighting();

  drawGrid();
  drawWaves();
  drawVisibility();
  drawWake();
  if (weatherEnabled) drawRain();
  if (weatherEnabled) drawWind();
}

function drawCelestialLighting() {
  const state = sunMoonState();
  ctx.save();

  const darkness = clamp(1 - state.light, 0, 0.78);
  ctx.fillStyle = `rgba(0,10,18,${darkness})`;
  ctx.fillRect(0,0,game.width,game.height);

  const isDay = state.daylight >= state.moonlight;
  const t = isDay ? clamp((state.hour - 6) / 12, 0, 1) : clamp((state.hour - 18) / 12, 0, 1);
  const arc = Math.sin(t * Math.PI);

  // Słońce/księżyc bliżej krawędzi i bez szerokiej poświaty.
  const x = game.width * (0.035 + 0.93 * t);
  const y = game.height * (isDay ? (0.115 - 0.055 * arc) : (0.135 - 0.045 * arc));
  const bodyRadius = Math.max(6, Math.min(game.width, game.height) * (isDay ? 0.014 : 0.011));

  ctx.fillStyle = isDay ? "rgba(255,238,160,.88)" : "rgba(205,225,255,.78)";
  ctx.beginPath();
  ctx.arc(x, y, bodyRadius, 0, Math.PI * 2);
  ctx.fill();

  if (!isDay) {
    ctx.fillStyle = "rgba(7,19,26,.58)";
    ctx.beginPath();
    ctx.arc(x + bodyRadius * .42, y - bodyRadius * .12, bodyRadius * .88, 0, Math.PI * 2);
    ctx.fill();
  }

  const s = worldToScreen(ship);
  const shadowAngle = Math.atan2(s.y-y,s.x-x);
  const shipScale = clamp(0.18 * Math.sqrt(zoom), 0.18, 40);
  const lowAngleBoost = 0.75 + (1 - arc) * 0.45;
  const shadowLen = clamp(20 * shipScale * lowAngleBoost, 7, 80);
  const shadowWidth = clamp(3.8 * shipScale, 2.4, 20);
  const shadowAlpha = isDay ? 0.13 + (1 - state.daylight) * 0.08 : 0.10;
  ctx.translate(s.x,s.y);
  ctx.rotate(shadowAngle);
  ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
  ctx.beginPath();
  ctx.ellipse(shadowLen * .55, 0, shadowLen, shadowWidth, 0, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
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
  if (!seaLayerOn) return;
  const w = game.width;
  const h = game.height;
  ctx.save();

  const zoomFactor = clamp(Math.sqrt(Math.max(zoom, 0.1)), 0.45, 5.5);
  const waveHeight = weather.wave;
  const spacingM = clamp(135 / zoomFactor, 28, 180);
  const segmentM = clamp(210 / zoomFactor, 42, 260);
  const amp = clamp((0.45 + waveHeight * 3.2) * zoomFactor, 0.45, 14);
  const alpha = clamp(0.035 + waveHeight * 0.075, 0.025, 0.14);

  ctx.strokeStyle = `rgba(190,220,225,${alpha})`;
  ctx.lineWidth = clamp(0.8 * zoomFactor, 0.55, 2.3);

  const worldLeft = camera.x;
  const worldRight = camera.x + w * metersPerPixel;
  const worldTop = camera.y;
  const worldBottom = camera.y + h * metersPerPixel;

  for (let wy = Math.floor(worldTop / spacingM) * spacingM; wy <= worldBottom + spacingM; wy += spacingM) {
    for (let wx = Math.floor(worldLeft / segmentM) * segmentM; wx <= worldRight + segmentM; wx += segmentM) {
      const sx = (wx - camera.x) / metersPerPixel;
      const sy = (wy - camera.y) / metersPerPixel;
      const len = clamp(segmentM / metersPerPixel * 0.36, 5, 54);
      const phase = Math.sin((wx * 0.014 + wy * 0.009) + weather.t * (0.25 + waveHeight * 0.35));
      const y = sy + phase * amp * 0.22;
      ctx.beginPath();
      ctx.moveTo(sx - len * 0.5, y);
      ctx.quadraticCurveTo(sx, y - amp, sx + len * 0.5, y);
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
  const offset = (weather.t * Math.max(8, weather.windSpeed * 7.5)) % spacing;

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
  drawNavigationPlan();
  drawDesiredCourseVector();
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
  circle(AA_RANGE, "rgba(255,74,53,.72)", [6, 6], 1.5);
  circle(weather.visibility, "rgba(207,215,178,.75)", [10, 8]);
  circle(HORIZON_RANGE, "rgba(185,205,215,.55)", [14, 10], 1.4);

  if (infoOn) {
    labelRange(`RADAR ${radar.range}m`, radar.range, 40, "#4ab6ff");
    labelRange(`SONAR ${sonar.range}m`, sonar.range, 140, "#6fe25d");
    labelRange(`DZIAŁA ${guns.maxRange}m`, guns.maxRange, 220, "#d9aa2a");
    labelRange(`AA ${AA_RANGE}m`, AA_RANGE, 260, "#ff4a35");
    labelRange(`WIDZ. ${Math.round(weather.visibility)}m`, weather.visibility, 80, "#cfd7b2");
    labelRange(`HORYZONT ${HORIZON_RANGE}m`, HORIZON_RANGE, 315, "#b9cdd7");
  }
}

function labelRange(text, range, degrees, color) {
  const center = worldToScreen(ship);
  const x = center.x + Math.cos(degToRad(degrees)) * range / metersPerPixel;
  const y = center.y + Math.sin(degToRad(degrees)) * range / metersPerPixel;
  ctx.save();
  ctx.font = uiFont(13);
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
  ctx.strokeStyle = "rgba(90,220,255,.68)";
  ctx.lineWidth = Math.max(1.8, 2.4 * uiFontScale);
  ctx.fillStyle = "rgba(90,220,255,.90)";
  ctx.setLineDash([5, 8]);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points) ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const end = points[points.length - 1];
  const prev = points[points.length - 2];
  const angle = Math.atan2(end.y - prev.y, end.x - prev.x);
  ctx.translate(end.x, end.y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-14, -7);
  ctx.lineTo(-14, 7);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-angle);
  ctx.font = uiFont(14);
  ctx.fillText("30s", 10, -8);
  ctx.restore();
}


function formatDurationMS(seconds) {
  seconds = Math.max(0, Math.round(seconds));
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function drawNavigationPlan() {
  if (navWaypoints.length === 0) return;
  ctx.save();
  ctx.strokeStyle = navFollowEnabled ? "rgba(255,210,90,.72)" : "rgba(255,210,90,.32)";
  ctx.fillStyle = navFollowEnabled ? "rgba(255,210,90,.88)" : "rgba(255,210,90,.45)";
  ctx.lineWidth = Math.max(1.0, 1.35 * uiFontScale);
  ctx.setLineDash([10, 5]);

  const start = worldToScreen(ship);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (const wp of navWaypoints) {
    const p = worldToScreen(wp);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  let previous = ship;
  let cumulativeMeters = 0;
  const effectiveSpeed = Math.max(Math.abs(ship.speed) * SIM_SPEED, 1.5);

  navWaypoints.forEach((wp, index) => {
    cumulativeMeters += dist(previous, wp);
    previous = wp;
    const eta = cumulativeMeters / effectiveSpeed;
    const p = worldToScreen(wp);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8 + index * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = uiFont(13);
    ctx.fillText(String(index + 1), p.x + 11, p.y - 8);
    if (infoOn) {
      ctx.font = uiFont(12);
      ctx.fillText(formatDurationMS(eta), p.x + 11, p.y + uiPx(10));
    }
  });
  ctx.restore();
}

function drawDesiredCourseVector() {
  const speedKnots = Math.abs(ship.speed) * MS_TO_KNOT;
  const actualAngle = ship.heading;
  const desiredAngle = ship.autopilot && ship.orderedCourse !== null ? degToRad(ship.orderedCourse) : ship.heading;
  const same = Math.abs(angleDiffRad(actualAngle, desiredAngle)) < degToRad(2.0);
  const length = 210 + speedKnots * 28;

  drawCourseVectorLine(actualAngle, length, same ? "rgba(235,255,235,.90)" : "rgba(235,255,235,.72)", same ? [] : [12, 8], speedKnots, same ? "AKTUALNY=ZADANY" : "AKTUALNY");
  if (!same) {
    drawCourseVectorLine(desiredAngle, length * 1.02, "rgba(255,210,90,.82)", [6, 8], null, "ZADANY");
  }
}

function drawCourseVectorLine(angle, length, color, dash, speedKnots, label) {
  const origin = worldToScreen(ship);
  const endX = origin.x + Math.cos(angle) * (length / metersPerPixel);
  const endY = origin.y + Math.sin(angle) * (length / metersPerPixel);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.2, 1.7 * uiFontScale);
  ctx.setLineDash(dash);

  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.setLineDash([]);

  const arrowAngle = Math.atan2(endY - origin.y, endX - origin.x);
  ctx.translate(endX, endY);
  ctx.rotate(arrowAngle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-16, -8);
  ctx.lineTo(-16, 8);
  ctx.closePath();
  ctx.fill();

  ctx.rotate(-arrowAngle);
  ctx.font = uiFont(14);
  const course = String(Math.round(radToCourse(angle))).padStart(3, "0");
  const speedTxt = speedKnots === null ? "" : ` ${speedKnots.toFixed(1)} w.`;
  const text = `${label} ${course}°${speedTxt}`;
  const labelX = 24;
  const labelY = -18;
  const metrics = ctx.measureText(text);
  ctx.fillStyle = "rgba(5,8,6,.78)";
  ctx.strokeStyle = color;
  roundRect(ctx, labelX - 6, labelY - uiPx(15), metrics.width + 12, uiPx(22), uiPx(5));
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(text, labelX, labelY);
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
    ctx.font = uiFont(14);
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
  ctx.globalCompositeOperation = "screen";

  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0.00, "rgba(80,255,120,.34)");
  gradient.addColorStop(0.32, "rgba(80,255,120,.20)");
  gradient.addColorStop(0.72, "rgba(80,255,120,.10)");
  gradient.addColorStop(1.00, "rgba(80,255,120,.035)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let a = -half; a <= half + 0.001; a += sonar.beamWidth / 100) {
    ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(155,255,145,.52)";
  ctx.lineWidth = Math.max(0.7, 0.95 * uiFontScale);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(-half) * radius, Math.sin(-half) * radius);
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(half) * radius, Math.sin(half) * radius);
  ctx.stroke();

  // Wyraźna fala aktywnego sonaru: łuk wypełniający tylko zadany stożek.
  const pulseMeters = (weather.t * 1150) % sonar.range;
  for (const offset of [0, sonar.range * 0.33, sonar.range * 0.66]) {
    const rM = (pulseMeters + offset) % sonar.range;
    const r = rM / metersPerPixel;
    const alpha = 0.88 * (1 - rM / sonar.range);
    ctx.strokeStyle = `rgba(220,255,190,${alpha})`;
    ctx.lineWidth = Math.max(1.8, 2.4 * uiFontScale);
    ctx.beginPath();
    for (let a = -half; a <= half + 0.001; a += sonar.beamWidth / 140) {
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (a <= -half + 0.0001) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.restore();

  // Kontakt w stożku: krąg rozchodzący się od wykrytego kontaktu.
  if (lastSonarContact && lastSonarContact.age < 3 && lastSonarContact.x !== undefined) {
    const p = worldToScreen(lastSonarContact);
    const rr = 18 + lastSonarContact.age * 32;
    ctx.save();
    ctx.strokeStyle = `rgba(120,255,120,${0.8 * (1 - lastSonarContact.age / 3)})`;
    ctx.lineWidth = Math.max(1.5, 2.2 * uiFontScale);
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}


function drawContactVectors() {
  const contacts = [];
  if (typeof target !== "undefined" && target && target.alive) contacts.push(target);
  if (typeof aircraft !== "undefined") contacts.push(...aircraft);
  if (typeof subs !== "undefined") contacts.push(...subs);

  ctx.save();
  for (const c of contacts) {
    if (!c.trackHistory || c.trackHistory.length < 2 || c.predictedCourse === undefined) continue;

    const p = worldToScreen(c);
    const courseRad = degToRad(c.predictedCourse);
    const speed = c.predictedSpeed || 35;
    const lenMeters = clamp(speed * 180, 900, 4200);
    const len = lenMeters / metersPerPixel;

    const col = "rgba(255,76,60,.92)";
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = clamp(1.1 * uiFontScale / Math.sqrt(Math.max(zoom, 0.2)), 0.85, 2.2);
    ctx.setLineDash([10, 7]);

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(courseRad) * len, p.y + Math.sin(courseRad) * len);
    ctx.stroke();
    ctx.setLineDash([]);

    const ex = p.x + Math.cos(courseRad) * len;
    const ey = p.y + Math.sin(courseRad) * len;

    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(courseRad);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-10, -4.5);
    ctx.lineTo(-10, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (typeof uiFont === "function") ctx.font = uiFont(12);
    ctx.fillText(`${String(Math.round(c.predictedCourse)).padStart(3, "0")}°`, ex + 8, ey - 6);
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
  if (!aircraftEnabled) return;
  for (const plane of aircraft) {
    const visible = dist(ship, plane) <= weather.visibility;

    if (!visible) {
      if (plane.lastSeenX !== null && plane.lastSeenAge < 30) {
        const p = worldToScreen({ x: plane.lastSeenX, y: plane.lastSeenY });
        ctx.save();
        ctx.globalAlpha = Math.max(0.20, 0.75 * (1 - plane.lastSeenAge / 30));
        ctx.strokeStyle = "rgba(120,210,255,.90)";
        ctx.fillStyle = "rgba(120,210,255,.90)";
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = uiFont(12);
        ctx.fillText(`Samolot ${plane.contactId} OST. ${plane.lastSeenAge.toFixed(0)}s`, p.x + 16, p.y - 10);
        ctx.restore();
      }
      continue;
    }

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
    if (splash.depthCharge) {
      explodeDepthCharge(splash);
      if (splash.t > splash.delay && !splash.exploded) {
        splash.exploded = true;
        burst(0.35, 0.32, 90);
      }
      continue;
    }
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

  for (const turret of turrets) drawTurret(context, turret, guns.bearing - heading, scale);
  context.restore();
}

function drawTurret(context, turret, angle, scale) {
  context.save();
  context.translate(turret.x, turret.y);
  context.rotate(angle);
  const cool = clamp(turret.reload / turret.baseReload, 0, 1);
  const red = Math.round(80 + 175 * cool);
  const green = Math.round(220 - 150 * cool);
  context.fillStyle = `rgb(${red},${green},60)`;
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
  const leftX = 14;
  let leftY = 12;
  const gap = uiPx(10);
  const boxW = 190 * uiFontScale;

  leftY = drawBox(leftX, leftY, [`POZYCJA`, `X ${Math.round(ship.x)} m`, `Y ${Math.round(ship.y)} m`, `SEKTOR ${Math.floor(ship.x / 10000)}-${Math.floor(ship.y / 10000)}`], boxW) + gap;

  leftY = drawBox(leftX, leftY, lastRadarContact && lastRadarContact.age < 12
    ? [`${lastRadarContact.name}`, `NAMIAR ${lastRadarContact.bearing.toFixed(0).padStart(3, "0")}°`, `ODL. ${lastRadarContact.range} m`, `OD ECHA ${lastRadarContact.age.toFixed(1)} s`, lastRadarContact.predicted || "KURS ? ---"]
    : [`RADAR CEL`, `BRAK`, `---`, `---`], boxW) + gap;

  leftY = drawBox(leftX, leftY, lastRadarAirContact && lastRadarAirContact.age < 12
    ? [`${lastRadarAirContact.name}`, `NAMIAR ${lastRadarAirContact.bearing.toFixed(0).padStart(3, "0")}°`, `ODL. ${lastRadarAirContact.range} m`, `OD ECHA ${lastRadarAirContact.age.toFixed(1)} s`, lastRadarAirContact.predicted || "KURS ? ---"]
    : [`RADAR LOT`, aircraftEnabled ? `BRAK` : `WYŁ.`, `---`, `---`], boxW) + gap;

  drawBox(leftX, leftY, lastSonarContact && lastSonarContact.age < 18
    ? [`${lastSonarContact.name}`, `NAMIAR ${lastSonarContact.bearing.toFixed(0).padStart(3, "0")}°`, `ODL. ${lastSonarContact.range} m`, `OD ECHA ${lastSonarContact.age.toFixed(1)} s`, lastSonarContact.predicted || "KURS ? ---"]
    : [`SONAR KONTAKT`, sonar.on ? `BRAK` : `WYŁ.`, `---`, `---`], boxW);

  const rightW = 210 * uiFontScale;
  const rightX = game.width - rightW - 14;
  let rightY = 12;
  rightY = drawBox(rightX, rightY, [
    `POGODA ${weatherEnabled ? weatherName(weather.rain) : "WYŁ."}`,
    `WIATR ${radToCourse(weather.windDir).toFixed(0)}°`,
    `${weather.windSpeed.toFixed(1)} m/s`,
    `FALA ${weather.wave.toFixed(2)}`,
    `WIDZ. ${Math.round(weather.visibility)} m`
  ], rightW) + gap;

  drawBox(rightX, rightY, [
    `PROG. +5 MIN`,
    weatherEnabled ? weatherName(forecast.rain) : "WYŁ.",
    `WIATR ${radToCourse(forecast.windDir).toFixed(0)}°`,
    `${forecast.windSpeed.toFixed(1)} m/s`,
    `WIDZ. ${Math.round(forecast.visibility)} m`
  ], rightW);
}

function drawBox(x, y, lines, width = 190) {
  ctx.save();
  ctx.font = uiFont(17);
  const lineH = uiPx(22);
  const height = uiPx(26) + lines.length * lineH;
  ctx.fillStyle = "rgba(5,8,6,.72)";
  ctx.strokeStyle = "rgba(217,227,211,.42)";
  roundRect(ctx, x, y, width, height, uiPx(8));
  ctx.fill();
  ctx.stroke();
  lines.forEach((line, index) => {
    ctx.fillStyle = index ? "#c0cab8" : "#d9e3d3";
    ctx.fillText(line, x + uiPx(10), y + uiPx(22) + index * lineH);
  });
  ctx.restore();
  return y + height;
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
  ctx.font = uiFont(18);
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
    if (aircraftEnabled) for (const plane of aircraft) drawScopeCross(context, cx, cy, plane, range, r, color);
  }

  if (type === "sonar" && sonar.on) {
    for (const sub of subs) drawScopeDot(context, cx, cy, sub, range, r, color);
  }

  context.fillStyle = color;
  context.font = `${Math.round(12 * uiFontScale)}px Courier New`;
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
  shipCtx.font = `${Math.round(12 * uiFontScale)}px Courier New`;
  shipCtx.fillText(`WIATR ${radToCourse(weather.windDir).toFixed(0)}° / ${weather.windSpeed.toFixed(1)} m/s`, 8, h - 10);
}


function setActiveWeapon(name) {
  activeWeapon = name;
  lastMessage = name === "guns" ? "Aktywna broń: działa 5”/38." : "Aktywna broń: bomby głębinowe.";
}

function updateDepthChargeButtons() {
  for (const btn of [dcLeftBtn, dcRightBtn, dcSternBtn, dcShallowBtn, dcMediumBtn, dcDeepBtn]) btn.classList.remove("active");
  ({left: dcLeftBtn, right: dcRightBtn, stern: dcSternBtn}[dcLauncher] || dcSternBtn).classList.add("active");
  ({30: dcShallowBtn, 90: dcMediumBtn, 180: dcDeepBtn}[dcDepth] || dcMediumBtn).classList.add("active");
  dcRead.textContent = `Aktywna broń: ${activeWeapon === "guns" ? "działa 5”/38" : "bomby głębinowe"} | wyrzutnia: ${dcLauncher === "left" ? "lewa" : dcLauncher === "right" ? "prawa" : "tył"} | głębokość: ${dcDepth} m | zapas: ${resources.depthCharges}`;
}

function dropDepthCharge() {
  ensureAudio();
  if (resources.depthCharges <= 0) {
    lastMessage = "Brak bomb głębinowych.";
    return;
  }
  resources.depthCharges -= dcLauncher === "stern" ? 2 : 3;
  resources.depthCharges = Math.max(0, resources.depthCharges);

  const base = { x: ship.x - Math.cos(ship.heading) * 62, y: ship.y - Math.sin(ship.heading) * 62 };
  const side = dcLauncher === "left" ? -1 : dcLauncher === "right" ? 1 : 0;
  const count = dcLauncher === "stern" ? 2 : 3;
  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * 22;
    const lateral = side * (dcLauncher === "stern" ? 12 : 95);
    const x = base.x + Math.cos(ship.heading + Math.PI / 2) * (lateral + spread);
    const y = base.y + Math.sin(ship.heading + Math.PI / 2) * (lateral + spread);
    splashes.push({ x, y, t: 0, maxT: 2.4, hit: false, depthCharge: true, depth: dcDepth, delay: Math.max(0.7, dcDepth / 28) });
  }
  burst(0.16, 0.12, 180);
  lastMessage = `Salwa bomb głębinowych: ${dcLauncher === "left" ? "lewa" : dcLauncher === "right" ? "prawa" : "tył"}, ${dcDepth} m.`;
}

function updateEngineSound() {
  if (!audioCtx || !gameStarted || timeCompression === 0) {
    if (engineGain && audioCtx) engineGain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.08);
    return;
  }
  const desired = Math.abs(speedOrders[ship.targetSpeedIndex].value) / speedOrders.at(-1).value;
  if (!engineOsc) {
    engineOsc = audioCtx.createOscillator();
    engineGain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    engineOsc.type = "sawtooth";
    filter.type = "lowpass";
    filter.frequency.value = 140;
    engineGain.gain.value = 0.0001;
    engineOsc.connect(filter).connect(engineGain).connect(audioCtx.destination);
    engineOsc.start();
  }
  const now = audioCtx.currentTime;
  engineOsc.frequency.setTargetAtTime(34 + desired * 78, now, 0.20);
  engineGain.gain.setTargetAtTime(0.015 + desired * 0.045, now, 0.25);
}

function explodeDepthCharge(splash) {
  const p = worldToScreen(splash);
  ctx.save();
  ctx.strokeStyle = `rgba(210,240,255,${Math.max(0, 1 - splash.t / splash.maxT)})`;
  ctx.fillStyle = `rgba(210,240,255,${Math.max(0, .20 - splash.t / splash.maxT * .20)})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 18 + splash.t * 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function updateResourcePanel() {
  updateDepthChargeButtons();
  resourceRead.innerHTML = `
    <div class="resourceRow"><span>Paliwo</span><strong>${resources.fuel.toFixed(1)}%</strong></div>
    <div class="resourceBar"><span style="width:${resources.fuel}%"></span></div>
    <div class="resourceRow"><span>Amunicja 5”/38</span><strong>${resources.ammo5} szt.</strong></div>
    <div class="resourceRow"><span>Amunicja AA</span><strong>${resources.ammoAA} szt.</strong></div>
    <div class="resourceRow"><span>Bomby głębinowe</span><strong>${resources.depthCharges} szt.</strong></div>
    <div class="resourceRow"><span>Zmęczenie załogi</span><strong>${resources.crewFatigue.toFixed(1)}%</strong></div>
    <div class="resourceBar"><span style="width:${resources.crewFatigue}%"></span></div>
    <div class="resourceRow"><span>Zużycie maszyn</span><strong>${resources.engineWear.toFixed(1)}%</strong></div>
    <div class="resourceRow"><span>Morale</span><strong>${resources.morale.toFixed(0)}%</strong></div>
    <div class="resourceRow"><span>Kompresja czasu</span><strong>${timeCompression === 0 ? "PAUZA" : timeCompression + "×"}</strong></div>`;
}

function updateTutorialProgress() {
  if (!tutorialMode || tutorialStep !== 1 || tutorialStep1Complete) return;
  if (Math.abs(ship.speed) > 0.6 && Math.abs(ship.rudder) > 4) {
    tutorialStep1Complete = true;
    lastMessage = "Dobrze. Zmieniono prędkość i wychylono ster — możesz przejść dalej.";
    showTutorialStep();
  }
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
  radarButton.textContent = radar.on ? "WYŁĄCZ" : "WŁĄCZ";

  speedRead.textContent = order.name;
  rudderRead.textContent = `${Math.abs(ship.rudder).toFixed(0)}° ${rudderSide}`;
  courseRead.textContent = `${course.toFixed(0).padStart(3, "0")}°`;
  windShort.textContent = `${radToCourse(weather.windDir).toFixed(0)}° ${weather.windSpeed.toFixed(0)}m/s`;
  dayNightRead.textContent = formatClock();
  updateResourcePanel();

  weaponRead.innerHTML =
    `TRYB: <span style="color:var(--guns)">${guns.mode}</span><br>` +
    `KĄT: <span style="color:var(--guns)">${radToCourse(guns.bearing).toFixed(0).padStart(3, "0")}°</span><br>` +
    `ZASIĘG: <span style="color:var(--guns)">${Math.round(guns.range)} m</span><br>` +
    `CEL HP: <span style="color:var(--guns)">${target.alive ? Math.round(target.hp) : "---"}</span><br>` +
    `5”/38: zwykle 2–3 trafienia<br>` +
    `<button id="autoFireButton" class="tinyButton">${autoFire ? "AUTO OGNIA: WŁ." : "AUTO OGNIA: WYŁ."}</button>`;

  consolePanel.textContent =
    `Fletcher: max 37 w. | Condor: ${aircraft[0] ? Math.round(aircraft[0].speed * MS_TO_KNOT) : "---"} w. | Radar: obrotowa kreska | Morze: Atlantyk\n` +
    `Sterowanie: W/S/+/- prędkość, A/D ster, N plan kursu, V auto-trasa, B kasuj punkty, G wpis kurs/kąt, F auto/manual, R reset dział, < > obrót, O/L zasięg, [ ] sonar, Spacja strzał\n` +
    `${lastMessage} | Auto-trasa: ${navFollowEnabled ? "WŁ." : "WYŁ."}`;
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  weather.t += dt;
  updateClockAndResources(dt);
  const simDt = dt * timeCompression;
  updateWeather(dt);

  if (gameStarted) {
    updateOrders(simDt);
    updateNavigationPlan();
    updateAutoFire(simDt);
    updatePhysics(simDt);
    updateWakeSmoke(simDt);
    updateTargets(simDt);
    updateSonar(simDt);
    updateRadar(simDt);
    updateProjectiles(simDt);
  }

  draw();
  updateTutorialProgress();
  updateUI();
  updateEngineSound();
  requestAnimationFrame(loop);
}

})();
