// The Solmar Bay police: a wanted level measured in heat and stars, cruisers that spawn
// off-screen and hunt the player, and the bust pressure that builds when a cruiser pins a
// slow player. Heat cools when no officer is near, so breaking line of sight pays.
import {
  BUST_SECONDS, HEAT_PER_STAR, MAX_STARS, POLICE_SIGHT,
} from './config.js';
import { nearestIntersection } from './city.js';
import { CAR_POLICE, angleTo, createCar, driveCar, steerToward } from './entities.js';

/** Fresh wanted state: no heat, no stars, nobody looking. */
export function createWanted() {
  return { heat: 0, bust: 0, crimeTimer: 0, spawnTimer: 0 };
}

/** Stars from heat: every HEAT_PER_STAR of heat is another star, five at most. */
export function starsOf(wanted) {
  if (wanted.heat <= 0) return 0;
  return Math.min(MAX_STARS, 1 + Math.floor(wanted.heat / HEAT_PER_STAR));
}

/** Record an offence: heat now, and a grace period before it can start cooling. */
export function addHeat(wanted, amount) {
  wanted.heat = Math.min(HEAT_PER_STAR * (MAX_STARS + 1), wanted.heat + amount);
  wanted.crimeTimer = 6;
}

/** The point the police hunt: the player's car when he drives, his feet when he walks. */
export function huntedPoint(world) {
  return world.player.car ?? world.player;
}

/** Cool the heat and count spawns for one step. Police presence slows the cooling. */
export function updateWanted(wanted, dt, world) {
  if (wanted.crimeTimer > 0) wanted.crimeTimer -= dt;
  const point = huntedPoint(world);
  let nearest = Infinity;
  for (const cop of world.police) {
    const d = Math.hypot(cop.x - point.x, cop.y - point.y);
    if (d < nearest) nearest = d;
  }
  if (wanted.crimeTimer <= 0 && wanted.heat > 0) {
    const cooling = nearest < POLICE_SIGHT ? 1.6 : 7.5;
    wanted.heat = Math.max(0, wanted.heat - cooling * dt);
  }
  if (wanted.spawnTimer > 0) wanted.spawnTimer -= dt;
  return nearest;
}

/** Bring cruisers on stage and send them home, so their count matches the stars. */
export function managePolice(world, dt, rng) {
  const wanted = world.wanted;
  const stars = starsOf(wanted);
  const point = huntedPoint(world);
  if (stars > 0 && world.police.length < stars && wanted.spawnTimer <= 0) {
    wanted.spawnTimer = 1.4;
    const spot = pickSpawnPoint(world, point, rng);
    if (spot) {
      const cop = createCar(spot.x, spot.y, Math.atan2(point.y - spot.y, point.x - spot.x), '#e8e8ec', CAR_POLICE);
      cop.driver = 'police';
      world.police.push(cop);
      world.cars.push(cop);
    }
  }
  // When the heat is gone, cruisers that have lost the trail peel off and vanish far away.
  for (let i = world.police.length - 1; i >= 0; i -= 1) {
    const cop = world.police[i];
    const d = Math.hypot(cop.x - point.x, cop.y - point.y);
    if ((stars === 0 && d > 640) || d > 1500) {
      world.police.splice(i, 1);
      const at = world.cars.indexOf(cop);
      if (at >= 0) world.cars.splice(at, 1);
    }
  }
}

/** An intersection half a kilometre away: close enough to arrive, far enough not to pop in. */
function pickSpawnPoint(world, point, rng) {
  const options = world.city.intersections.filter((p) => {
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    return d > 480 && d < 980;
  });
  if (options.length > 0) return rng.pick(options);
  let farthest = null;
  let best = -1;
  for (const p of world.city.intersections) {
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    if (d > best) { best = d; farthest = p; }
  }
  return farthest;
}

/**
 * Drive every cruiser for one step. Cruisers steer straight at the player, detouring by
 * the nearest intersection when a building wedges them, and ease off at arm's length on
 * foot so the bust can happen instead of a run-over.
 */
export function updatePolice(world, dt) {
  const point = huntedPoint(world);
  for (const cop of world.police) {
    const dist = Math.hypot(point.x - cop.x, point.y - cop.y);
    let target = point;
    if (cop.ai.detour) {
      target = cop.ai.detour;
      if (Math.hypot(target.x - cop.x, target.y - cop.y) < 70) cop.ai.detour = null;
    }
    const wanted = angleTo(cop, target.x, target.y);
    const steer = steerToward(cop.angle, wanted, 2.0);
    let throttle = 1;
    if (!world.player.car && dist < 58) throttle = 0;
    else if (world.player.car && dist < 34) throttle = 0.4;
    else if (dist > 320) throttle = 1;
    else throttle = 0.85;
    const impact = driveCar(cop, dt, throttle, steer, world.city);
    if (impact > 190) cop.health -= 3;
    if (Math.abs(cop.speed) < 7 && throttle > 0 && dist > 90) {
      cop.ai.stuck += dt;
      if (cop.ai.stuck > 1.1) {
        cop.ai.stuck = 0;
        cop.ai.detour = nearestIntersection(world.city, point.x, point.y);
      }
    } else {
      cop.ai.stuck = 0;
    }
    // Ramming a driven player at speed hurts the player's car, not just the cruiser.
    if (world.player.car && dist < 40 && Math.abs(cop.speed) > 130) {
      world.player.car.health -= 5 * dt * 10;
    }
  }
}

/**
 * How fast the bust meter fills this step: a cruiser alongside a slow or walking player
 * fills it; distance or speed drains it. Returns the new meter value.
 */
export function updateBust(world, dt) {
  const wanted = world.wanted;
  const point = huntedPoint(world);
  const playerSpeed = world.player.car ? Math.abs(world.player.car.speed) : 0;
  let pinned = false;
  for (const cop of world.police) {
    const d = Math.hypot(cop.x - point.x, cop.y - point.y);
    if (d < 96 && playerSpeed < 42) pinned = true;
  }
  if (pinned && starsOf(wanted) > 0) {
    wanted.bust = Math.min(1, wanted.bust + dt / BUST_SECONDS);
  } else {
    wanted.bust = Math.max(0, wanted.bust - dt / (BUST_SECONDS * 0.7));
  }
  return wanted.bust;
}
