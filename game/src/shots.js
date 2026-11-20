// The screenshot scenes behind ?shot=title|street|chase|mission. Each one arranges the
// real world — Rico, the traffic, the police, Marisol's current job — and then plays the
// simulation forward a few seconds, so the frame is honest gameplay and the same seed
// always stages the same frame.
import { STEP, WORLD_H, WORLD_W } from './config.js';
import { streetX, streetY } from './city.js';
import { CAR_POLICE, createCar, driveCar, separateCars, steerToward, angleTo } from './entities.js';
import { updatePed, updateTrafficCar } from './traffic.js';
import { updatePolice } from './police.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** Run the background city (traffic and pedestrians, no player input) for `seconds`. */
function stepAmbient(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let s = 0; s < steps; s += 1) {
    world.time += STEP;
    for (const car of world.cars) {
      if (car.driver === 'traffic') updateTrafficCar(car, STEP, world, world.rng);
    }
    separateCars(world.cars);
    for (const ped of world.peds) updatePed(ped, STEP, world.city, world.rng);
  }
}

/** Snap the camera onto a point, clamped to the world, as the live camera would settle. */
function focusCamera(world, x, y) {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  world.camera.x = Math.max(0, Math.min(WORLD_W - viewW, x - viewW / 2));
  world.camera.y = Math.max(0, Math.min(WORLD_H - viewH, y - viewH / 2));
}

/** Drive a car at a far point for `seconds`, with the police live when they are present. */
function stepDrive(world, car, targetX, targetY, seconds, withPolice) {
  const steps = Math.round(seconds / STEP);
  for (let s = 0; s < steps; s += 1) {
    world.time += STEP;
    const steer = steerToward(car.angle, angleTo(car, targetX, targetY), 2.2);
    driveCar(car, STEP, 0.88, steer, world.city);
    world.player.x = car.x;
    world.player.y = car.y;
    for (const other of world.cars) {
      if (other.driver === 'traffic') updateTrafficCar(other, STEP, world, world.rng);
    }
    if (withPolice) updatePolice(world, STEP);
    separateCars(world.cars);
    for (const ped of world.peds) updatePed(ped, STEP, world.city, world.rng);
    focusCamera(world, car.x + Math.cos(car.angle) * 90, car.y + Math.sin(car.angle) * 90);
  }
}

/** Put Rico in the driver's seat of the car nearest a point, and hand the car to him. */
function putPlayerInCar(world, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const car of world.cars) {
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestDist) { bestDist = d; best = car; }
  }
  best.driver = 'player';
  world.player.car = best;
  world.player.x = best.x;
  world.player.y = best.y;
  return best;
}

/** Title: the living downtown under the game's name. */
function stageTitle(world) {
  stepAmbient(world, 6);
  focusCamera(world, streetX(3) + 190, streetY(3) + 170);
  return { screen: SCREEN_TITLE };
}

/** Street: Rico on foot in the downtown lunch crowd, a pickup waiting across the road. */
function stageStreet(world) {
  const mall = world.city.landmarks.mall;
  world.missions.storyIndex = 3;
  world.missions.current = {
    title: 'Courier Run 1', intro: '', pickup: 'mall', dropoff: 'marina', time: 120, pay: 300, heat: 0,
  };
  world.missions.phase = 'pickup';
  world.missions.message = {
    title: 'Courier Run 1', sub: 'Marisol: "Palms Mall to the marina. The clock is the boss now."', ttl: 999,
  };
  world.player.x = mall.x + 34;
  world.player.y = mall.y + 6;
  world.player.angle = 0;
  // A crowd on the mall sidewalk: the first pedestrians gather along its west rim.
  const mallBlock = world.city.blocks[2 * 7 + 3];
  world.peds.forEach((ped, index) => {
    if (index < 8) {
      ped.x = mallBlock.x + 10 + (index % 3) * 9;
      ped.y = mallBlock.y + 34 + index * 27;
      ped.corner = index % ped.corners.length;
    }
  });
  world.cash = 1240;
  stepAmbient(world, 3.5);
  focusCamera(world, world.player.x + 60, world.player.y);
  return { screen: SCREEN_PLAY };
}

/** Chase: three stars, three cruisers, and a hot package counting down on the dash. */
function stageChase(world) {
  const startX = streetX(1) + 60;
  const startY = streetY(3) + 15;
  const car = putPlayerInCar(world, startX, startY);
  car.x = startX;
  car.y = startY;
  car.angle = 0;
  car.speed = 250;
  car.color = '#d94f3d';
  world.player.x = car.x;
  world.player.y = car.y;
  world.wanted.heat = 78;
  world.wanted.crimeTimer = 999;
  for (let n = 0; n < 3; n += 1) {
    const cop = createCar(startX - 110 - n * 95, startY + (n % 2 === 0 ? -13 : 14), 0, '#e8e8ec', CAR_POLICE);
    cop.driver = 'police';
    cop.speed = 258;
    world.police.push(cop);
    world.cars.push(cop);
  }
  world.missions.storyIndex = 1;
  world.missions.current = {
    title: 'Hot Merchandise', intro: '', pickup: 'warehouse', dropoff: 'disco', time: 95, pay: 320, heat: 40,
  };
  world.missions.phase = 'deliver';
  world.missions.timer = 47;
  world.missions.message = {
    title: 'Hot Merchandise', sub: 'Marisol: "The Old Cannery box. It is warm — do not let them stop you."', ttl: 999,
  };
  world.cash = 860;
  stepDrive(world, car, startX + 4000, startY, 2.1, true);
  return { screen: SCREEN_PLAY };
}

/** Mission: the coast road run — beach and sea to the right, the marina beacon ahead. */
function stageMission(world) {
  const startX = streetX(7) - 15;
  const startY = streetY(4) + 160;
  const car = putPlayerInCar(world, startX, startY);
  car.x = startX;
  car.y = startY;
  car.angle = Math.PI / 2;
  car.speed = 215;
  car.color = '#3d7bd9';
  world.player.x = car.x;
  world.player.y = car.y;
  world.missions.current = {
    title: 'First Run', intro: '', pickup: 'cafe', dropoff: 'marina', time: 80, pay: 180, heat: 0,
  };
  world.missions.phase = 'deliver';
  world.missions.timer = 38;
  world.cash = 180;
  // Straight down the coast road: the marina beacon stays ahead of the bonnet.
  stepDrive(world, car, startX, world.city.landmarks.marina.y, 2.2, false);
  return { screen: SCREEN_PLAY };
}

/** Stage the named scene in `world` and return the screen to draw over it. */
export function stageShot(name, world) {
  if (name === 'street') return stageStreet(world);
  if (name === 'chase') return stageChase(world);
  if (name === 'mission') return stageMission(world);
  return stageTitle(world);
}
