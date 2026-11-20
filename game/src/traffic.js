// Traffic and pedestrians: the city's background life. Cars pick a direction at every
// intersection and follow the right-hand lane from crossing to crossing, braking for
// anything in front of them. Pedestrians stroll the sidewalk loop of their home block,
// pause at corners, and run when something frightens them.
import { CAR_COLORS, COLS, ROAD, ROWS } from './config.js';
import { collideCircle, streetX, streetY } from './city.js';
import { CAR_CIVILIAN, angleDelta, angleTo, createCar, createPed, driveCar, steerToward } from './entities.js';

/** How far right of the street centre a car drives, in pixels. */
const LANE = 15;
const DIRECTIONS = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
];

/** The right-hand side of a direction of travel. */
function rightOf(dir) {
  return { x: -dir.y, y: dir.x };
}

/** Place the traffic fleet on random streets, already rolling. */
export function spawnTraffic(city, rng, count) {
  const cars = [];
  for (let n = 0; n < count; n += 1) {
    const i = rng.int(0, COLS);
    const j = rng.int(0, ROWS);
    const dir = DIRECTIONS[rng.int(0, 3)];
    const right = rightOf(dir);
    const car = createCar(
      streetX(i) + right.x * LANE, streetY(j) + right.y * LANE,
      Math.atan2(dir.y, dir.x), rng.pick(CAR_COLORS), CAR_CIVILIAN,
    );
    car.driver = 'traffic';
    car.ai.i = i;
    car.ai.j = j;
    car.ai.dir = dir;
    car.ai.queue = [];
    cars.push(car);
  }
  return cars;
}

/** Choose the next direction at an intersection: mostly straight on, never a U-turn. */
function chooseDirection(rng, car) {
  const { i, j, dir } = car.ai;
  const options = DIRECTIONS.filter((d) => {
    if (d.x === -dir.x && d.y === -dir.y) return false;
    const ni = i + d.x;
    const nj = j + d.y;
    return ni >= 0 && ni <= COLS && nj >= 0 && nj <= ROWS;
  });
  if (options.length === 0) return { x: -dir.x, y: -dir.y };
  const straight = options.find((d) => d.x === dir.x && d.y === dir.y);
  if (straight && rng.chance(0.62)) return straight;
  return options[rng.int(0, options.length - 1)];
}

/** Refill a car's waypoint queue for the leg it is about to drive. */
function planLeg(rng, car) {
  const dir = chooseDirection(rng, car);
  const centre = { x: streetX(car.ai.i), y: streetY(car.ai.j) };
  const entryRight = rightOf(car.ai.dir);
  const exitRight = rightOf(dir);
  car.ai.queue = [
    { x: centre.x + entryRight.x * LANE, y: centre.y + entryRight.y * LANE },
    { x: centre.x + dir.x * (ROAD / 2 + 8) + exitRight.x * LANE, y: centre.y + dir.y * (ROAD / 2 + 8) + exitRight.y * LANE },
  ];
  car.ai.i += dir.x;
  car.ai.j += dir.y;
  car.ai.dir = dir;
}

/** Anything solid in the car's path: another car, a pedestrian, the player on foot. */
function obstacleAhead(car, world) {
  const aheadX = car.x + Math.cos(car.angle) * 40;
  const aheadY = car.y + Math.sin(car.angle) * 40;
  const bodies = [...world.cars, ...world.peds];
  if (!world.player.car) bodies.push(world.player);
  for (const body of bodies) {
    if (body === car) continue;
    const dx = body.x - aheadX;
    const dy = body.y - aheadY;
    if (dx * dx + dy * dy < 26 * 26) return true;
  }
  return false;
}

/**
 * Drive one traffic car for a step. Returns the impact speed if it crashed into a wall.
 * Traffic is law-abiding: it slows for corners and stops for obstacles.
 */
export function updateTrafficCar(car, dt, world, rng) {
  if (car.ai.queue.length === 0) planLeg(rng, car);
  const target = car.ai.queue[0];
  const dist = Math.hypot(target.x - car.x, target.y - car.y);
  if (dist < 24) {
    car.ai.queue.shift();
    return 0;
  }
  const wanted = angleTo(car, target.x, target.y);
  const steer = steerToward(car.angle, wanted);
  const turning = Math.abs(angleDelta(car.angle, wanted));
  let throttle = turning > 0.9 ? 0.25 : 0.8;
  if (car.speed > 210) throttle = 0;
  if (obstacleAhead(car, world)) throttle = car.speed > 12 ? -0.7 : 0;
  const impact = driveCar(car, dt, throttle, steer, world.city);
  // A car wedged against a wall forgets its route and re-plans from where it stands.
  if (Math.abs(car.speed) < 6 && throttle > 0) car.ai.stuck += dt;
  else car.ai.stuck = 0;
  if (car.ai.stuck > 2.6) {
    car.ai.stuck = 0;
    car.ai.queue = [];
    const near = world.city.intersections.reduce((best, p) => {
      const d = (p.x - car.x) ** 2 + (p.y - car.y) ** 2;
      return d < best.d ? { p, d } : best;
    }, { p: world.city.intersections[0], d: Infinity });
    car.ai.i = near.p.i;
    car.ai.j = near.p.j;
  }
  return impact;
}

/** Scatter pedestrians over the city's blocks. */
export function spawnPeds(city, rng, count) {
  const peds = [];
  for (let n = 0; n < count; n += 1) {
    const block = city.blocks[rng.int(0, city.blocks.length - 1)];
    peds.push(createPed(rng, block));
  }
  return peds;
}

/** Frighten a pedestrian: they run from the frightening point for a moment. */
export function makePedFlee(ped, fromX, fromY) {
  if (ped.state === 'fallen') return;
  ped.state = 'flee';
  ped.fleeFrom = { x: fromX, y: fromY };
  ped.timer = 1.4;
}

/** Knock a pedestrian down; they get back up after a few seconds. */
export function knockPedDown(ped) {
  ped.state = 'fallen';
  ped.timer = 4;
}

/** Walk, flee or lie still for one step. */
export function updatePed(ped, dt, city, rng) {
  if (ped.state === 'fallen') {
    ped.timer -= dt;
    if (ped.timer <= 0) ped.state = 'walk';
    return;
  }
  if (ped.state === 'flee' && ped.fleeFrom) {
    ped.timer -= dt;
    const away = Math.atan2(ped.y - ped.fleeFrom.y, ped.x - ped.fleeFrom.x);
    ped.angle = away;
    movePed(ped, Math.cos(away) * 178 * dt, Math.sin(away) * 178 * dt, city);
    ped.walkCycle += dt * 11;
    if (ped.timer <= 0) {
      ped.state = 'walk';
      ped.fleeFrom = null;
    }
    return;
  }
  if (ped.timer > 0) {
    ped.timer -= dt;
    return;
  }
  const target = ped.corners[ped.corner];
  const dist = Math.hypot(target.x - ped.x, target.y - ped.y);
  if (dist < 6) {
    ped.corner = (ped.corner + 1) % ped.corners.length;
    if (rng.chance(0.3)) ped.timer = rng.range(0.6, 2.2);
    return;
  }
  ped.angle = angleTo(ped, target.x, target.y);
  movePed(ped, Math.cos(ped.angle) * ped.speed * dt, Math.sin(ped.angle) * ped.speed * dt, city);
  ped.walkCycle += dt * 7;
}

function movePed(ped, dx, dy, city) {
  // Pedestrians collide through the same helper as everyone else.
  const res = collideCircle(city, ped.x + dx, ped.y + dy, 9);
  ped.x = res.x;
  ped.y = res.y;
}
