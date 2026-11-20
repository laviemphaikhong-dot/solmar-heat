// Solmar Heat — boot and the one loop. The world advances in fixed steps; the state
// machine moves between title, play, pause, BUSTED and WASTED; every system (traffic,
// police, missions, sound) is updated from here so the modules stay single-purpose.
//
// ?seed=N fixes the city's random seed. ?shot=title|street|chase|mission stages a
// deterministic scene instead of the live loop, for the maker's screenshots.
import { STEP, WORLD_H, WORLD_W } from './config.js';
import { createRandom } from './random.js';
import { blockAt, createCity, streetX } from './city.js';
import { ACTION_CONFIRM, ACTION_ENTER_CAR, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  CAR_PARKED, angleTo, createCar, createPed, createPlayer, driveCar, separateCars, walkPlayer,
} from './entities.js';
import { knockPedDown, makePedFlee, spawnPeds, spawnTraffic, updatePed, updateTrafficCar } from './traffic.js';
import { addHeat, managePolice, starsOf, updateBust, updatePolice, updateWanted } from './police.js';
import { HEAT_HIT_CAR, HEAT_HIT_PED, HEAT_PUNCH, HEAT_STEAL, PED_COUNT, PARKED_COUNT, TRAFFIC_COUNT } from './config.js';
import { createMissions, resetCurrentJob, updateMissions } from './missions.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'solmar-heat-save-v1';
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : (Date.now() % 2147483647);

/** Parked cars along the kerbs: Rico's toolbox, waiting to be borrowed. */
function spawnParked(city, rng) {
  const cars = [];
  const colors = ['#d94f3d', '#3d7bd9', '#e8b93e', '#57a773', '#e8e4da', '#8a5fc0', '#e07b39', '#3fb8af'];
  for (let n = 0; n < PARKED_COUNT; n += 1) {
    const block = city.blocks[rng.int(0, city.blocks.length - 1)];
    const side = rng.int(0, 3);
    const along = rng.range(30, block.size - 30);
    let x; let y; let angle;
    if (side === 0) { x = block.x - 17; y = block.y + along; angle = -Math.PI / 2; }
    else if (side === 1) { x = block.x + block.size + 17; y = block.y + along; angle = Math.PI / 2; }
    else if (side === 2) { x = block.x + along; y = block.y - 17; angle = 0; }
    else { x = block.x + along; y = block.y + block.size + 17; angle = Math.PI; }
    cars.push(createCar(x, y, angle, colors[n % colors.length], CAR_PARKED));
  }
  return cars;
}

/** Assemble a fresh world: city, people, vehicles, police desk and Marisol's job board. */
export function createWorldState(worldSeed) {
  const rng = createRandom(worldSeed);
  const city = createCity(rng);
  const cafe = city.landmarks.cafe;
  // Rico starts on Marisol's street, a short walk south of her cafe and its gold beacon.
  const player = createPlayer(streetX(0) + 6, cafe.y + 130);
  const traffic = spawnTraffic(city, rng, TRAFFIC_COUNT);
  const parked = spawnParked(city, rng);
  const world = {
    city,
    rng,
    player,
    cars: [...traffic, ...parked],
    peds: spawnPeds(city, rng, PED_COUNT),
    police: [],
    wanted: { heat: 0, bust: 0, crimeTimer: 0, spawnTimer: 0 },
    missions: null,
    cash: 0,
    time: 0,
    camera: { x: 0, y: 0 },
    shake: 0,
    heatCooldown: 0,
    hurtTimer: 0,
  };
  world.missions = createMissions(city, rng);
  return world;
}

/** Read the saved story (cash, progress) if one exists. */
function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/** Persist the story so far. Storage may be unavailable; the game shrugs and continues. */
function writeSave(world) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: world.cash,
      storyIndex: world.missions.storyIndex,
      completed: world.missions.completed,
    }));
  } catch {
    // Private windows and file sandboxes refuse storage: the save then lasts the visit.
  }
}

/** The nearest car to a point, and how far it is. */
function nearestCar(world, x, y, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const car of world.cars) {
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestDist) { bestDist = d; best = car; }
  }
  return best;
}

/** E pressed: climb into the nearest car (stealing it if someone is driving), or climb out. */
function toggleCar(world, audio) {
  const player = world.player;
  if (player.car) {
    const car = player.car;
    car.driver = null;
    player.car = null;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 26;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 26;
    return;
  }
  const car = nearestCar(world, player.x, player.y, 54);
  if (!car) return;
  if (car.driver === 'traffic') {
    // The driver bails out and runs; the theft is noticed.
    const block = blockAt(world.city, car.x, car.y) ?? world.city.blocks[0];
    const driver = createPed(world.rng, block);
    driver.x = car.x + 20;
    driver.y = car.y + 10;
    makePedFlee(driver, player.x, player.y);
    world.peds.push(driver);
    addHeat(world.wanted, HEAT_STEAL);
    audio.thud();
  }
  car.driver = 'player';
  player.car = car;
  player.x = car.x;
  player.y = car.y;
}

/** Space on foot: a shove. Someone goes down, witnesses run, the heat rises. */
function punch(world, audio) {
  const player = world.player;
  if (player.punchCooldown > 0) return;
  player.punchCooldown = 0.35;
  for (const ped of world.peds) {
    const d = Math.hypot(ped.x - player.x, ped.y - player.y);
    if (d < 34 && ped.state !== 'fallen') {
      knockPedDown(ped);
      addHeat(world.wanted, HEAT_PUNCH);
      audio.thud();
      for (const other of world.peds) {
        if (other !== ped && Math.hypot(other.x - player.x, other.y - player.y) < 190) {
          makePedFlee(other, player.x, player.y);
        }
      }
      return;
    }
  }
}

/** Cars meet pedestrians: a fast car knocks one down, and if Rico drove it, that is on him. */
function carPedImpacts(world, audio) {
  for (const car of world.cars) {
    if (Math.abs(car.speed) < 62) continue;
    for (const ped of world.peds) {
      if (ped.state === 'fallen') continue;
      const d = Math.hypot(ped.x - car.x, ped.y - car.y);
      if (d < 23) {
        knockPedDown(ped);
        car.speed *= 0.55;
        if (car === world.player.car) {
          addHeat(world.wanted, HEAT_HIT_PED);
          world.shake = Math.max(world.shake, 7);
          audio.crash();
          for (const other of world.peds) {
            if (Math.hypot(other.x - car.x, other.y - car.y) < 220) makePedFlee(other, car.x, car.y);
          }
        }
      }
    }
  }
  // And a car can meet Rico: traffic brakes for him, but a fast one still hurts.
  const player = world.player;
  if (!player.car) {
    for (const car of world.cars) {
      if (Math.abs(car.speed) < 95) continue;
      const d = Math.hypot(player.x - car.x, player.y - car.y);
      if (d < 22 && world.hurtTimer <= 0) {
        player.health -= 13;
        world.hurtTimer = 1.2;
        world.shake = Math.max(world.shake, 9);
        const away = angleTo(car, player.x, player.y);
        player.x += Math.cos(away) * 26;
        player.y += Math.sin(away) * 26;
        audio.crash();
      }
    }
  }
}

/** One fixed step of the living city: traffic, pedestrians, police, missions, consequences. */
function stepWorld(world, input, audio, dt, screen) {
  world.time += dt;
  if (world.shake > 0) world.shake = Math.max(0, world.shake - dt * 26);
  if (world.heatCooldown > 0) world.heatCooldown -= dt;
  if (world.hurtTimer > 0) world.hurtTimer -= dt;
  if (world.player.punchCooldown > 0) world.player.punchCooldown -= dt;

  const player = world.player;
  const playing = screen === SCREEN_PLAY;

  if (playing && player.car) {
    const car = player.car;
    let throttle = 0;
    if (input.axisY() < 0) throttle = 1;
    else if (input.axisY() > 0) throttle = -1;
    if (input.brake()) throttle = car.speed > 10 ? -1 : 0;
    const steer = input.axisX();
    const wrecked = car.health <= 0;
    const impact = driveCar(car, dt, wrecked ? 0 : throttle, steer, world.city);
    if (impact > 205) {
      audio.crash();
      world.shake = Math.max(world.shake, Math.min(13, impact / 26));
      if (impact > 265 && world.heatCooldown <= 0) {
        addHeat(world.wanted, HEAT_HIT_CAR);
        world.heatCooldown = 1.4;
      }
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
  } else if (playing) {
    walkPlayer(player, input, dt, world.city);
  }

  for (const car of world.cars) {
    if (car.driver === 'traffic') updateTrafficCar(car, dt, world, world.rng);
  }
  separateCars(world.cars);
  for (const ped of world.peds) updatePed(ped, dt, world.city, world.rng);
  carPedImpacts(world, audio);

  if (playing) {
    const events = [];
    updateMissions(world.missions, world, dt, events);
    for (const event of events) {
      if (event === 'pickup') audio.pickup();
      else if (event === 'complete') { audio.cash(); writeSave(world); }
      else if (event === 'fail') audio.thud();
    }
    const nearestCop = updateWanted(world.wanted, dt, world);
    managePolice(world, dt, world.rng);
    updatePolice(world, dt);
    updateBust(world, dt);
    audio.siren(nearestCop < 400 && starsOf(world.wanted) > 0);
    // Slow mending between scrapes.
    if (world.hurtTimer <= 0 && player.health > 0 && player.health < 100) {
      player.health = Math.min(100, player.health + dt * 1.1);
    }
  } else {
    audio.siren(false);
  }

  // The camera leans into the drive.
  const focus = player.car ?? player;
  const look = player.car ? Math.min(120, Math.abs(player.car.speed) * 0.3) : 0;
  const tx = focus.x + Math.cos(focus.angle) * look - window.innerWidth / 2;
  const ty = focus.y + Math.sin(focus.angle) * look - window.innerHeight / 2;
  world.camera.x += (clamp(tx, 0, Math.max(0, WORLD_W - window.innerWidth)) - world.camera.x) * Math.min(1, dt * 5);
  world.camera.y += (clamp(ty, 0, Math.max(0, WORLD_H - window.innerHeight)) - world.camera.y) * Math.min(1, dt * 5);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** After a bust: a fine, a clean slate, and Rico back on Marisol's corner. */
function applyBust(world) {
  const fine = Math.min(world.cash, Math.max(40, Math.round(world.cash * 0.15)));
  world.cash -= fine;
  world.wanted.heat = 0;
  world.wanted.bust = 0;
  for (const cop of [...world.police]) {
    const at = world.cars.indexOf(cop);
    if (at >= 0) world.cars.splice(at, 1);
  }
  world.police = [];
  if (world.player.car) {
    world.player.car.driver = null;
    world.player.car = null;
  }
  const cafe = world.city.landmarks.cafe;
  world.player.x = streetX(0) + 6;
  world.player.y = cafe.y + 130;
  world.player.health = Math.max(50, world.player.health);
  resetCurrentJob(world.missions);
  writeSave(world);
}

/** After a wreck of the body: the hospital keeps most of him and some of his money. */
function applyWasted(world) {
  world.cash -= Math.min(world.cash, Math.max(30, Math.round(world.cash * 0.1)));
  world.wanted.heat = 0;
  world.wanted.bust = 0;
  for (const cop of [...world.police]) {
    const at = world.cars.indexOf(cop);
    if (at >= 0) world.cars.splice(at, 1);
  }
  world.police = [];
  if (world.player.car) {
    world.player.car.driver = null;
    world.player.car = null;
  }
  const clinic = world.city.landmarks.clinic;
  world.player.x = clinic.x + 30;
  world.player.y = clinic.y + 20;
  world.player.health = 100;
  resetCurrentJob(world.missions);
  writeSave(world);
}

/** Boot: build the world, then either stage a screenshot scene or run the live loop. */
function boot() {
  const canvas = document.getElementById('game');
  const status = document.getElementById('status');
  const renderer = createRenderer(canvas);
  const audio = createAudio();
  const world = createWorldState(seed);
  window.__game = world;

  if (shot) {
    const scene = stageShot(shot, world);
    let painted = 0;
    const paint = () => {
      renderer.draw(world, scene.screen, { hasSave: false, cash: 0, completed: 0 });
      painted += 1;
      if (painted < 3) requestAnimationFrame(paint);
      else window.__shotReady = true;
    };
    requestAnimationFrame(paint);
    return;
  }

  const input = createInput();
  const save = readSave();
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  function startPlay(fresh) {
    if (fresh) {
      try { window.localStorage.removeItem(SAVE_KEY); } catch { /* nothing to clear */ }
      world.cash = 0;
      world.missions = createMissions(world.city, world.rng);
    } else if (save) {
      world.cash = save.cash;
      world.missions = createMissions(world.city, world.rng, Math.min(save.storyIndex ?? 0, 3), save.completed ?? 0);
    }
    screen = SCREEN_PLAY;
    status.textContent = 'Playing Solmar Heat.';
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) audio.toggleMute();
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        startPlay(false);
      }
      return;
    }
    if (screen === SCREEN_BUSTED && (actions & ACTION_CONFIRM)) {
      applyBust(world);
      screen = SCREEN_PLAY;
      return;
    }
    if (screen === SCREEN_WASTED && (actions & ACTION_CONFIRM)) {
      applyWasted(world);
      screen = SCREEN_PLAY;
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = screen === SCREEN_PAUSED ? SCREEN_PLAY : SCREEN_PAUSED;
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    if (actions & ACTION_ENTER_CAR) toggleCar(world, audio);
    if (actions & ACTION_PUNCH && !world.player.car) punch(world, audio);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        stepWorld(world, input, audio, STEP, screen);
        accumulator -= STEP;
        if (screen === SCREEN_PLAY && world.wanted.bust >= 1) {
          screen = SCREEN_BUSTED;
          audio.siren(false);
          audio.busted();
          break;
        }
        if (screen === SCREEN_PLAY && world.player.health <= 0) {
          screen = SCREEN_WASTED;
          audio.siren(false);
          audio.busted();
          break;
        }
      }
    } else {
      accumulator = 0;
    }
    const saveInfo = save
      ? { hasSave: true, cash: save.cash, completed: save.completed ?? 0 }
      : { hasSave: false, cash: 0, completed: 0 };
    renderer.draw(world, screen, saveInfo);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
  });
  // N starts a new game from the title when a save exists.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyN' && screen === SCREEN_TITLE && save) {
      audio.unlock();
      startPlay(true);
    }
  });

  status.textContent = 'Solmar Heat. Press Enter to play.';
  requestAnimationFrame(frame);
}

boot();
