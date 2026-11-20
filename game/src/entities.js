// The people and machines of Solmar Bay: factories for the player, cars and pedestrians,
// plus the movement physics they share — driving with acceleration and steering, walking
// with collision, and the push-out that keeps bodies out of buildings and each other.
import {
  CAR_ACCEL, CAR_BRAKE, CAR_HEALTH, CAR_MAX_REVERSE, CAR_MAX_SPEED, CAR_REVERSE, CAR_TURN,
  CAR_WIDTH, PLAYER_HEALTH, PLAYER_RADIUS, SPRINT_SPEED, WALK_SPEED,
} from './config.js';
import { collideCircle } from './city.js';

export const CAR_CIVILIAN = 'civilian';
export const CAR_PARKED = 'parked';
export const CAR_POLICE = 'police';

/** The player: Rico Vega, courier. On foot unless `car` names the car he is driving. */
export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    health: PLAYER_HEALTH,
    car: null,
    walkCycle: 0,
    punchCooldown: 0,
    dead: false,
  };
}

/** A car. `driver` is 'player', 'traffic', 'police' or null (parked and empty). */
export function createCar(x, y, angle, color, kind) {
  return {
    x, y, angle,
    speed: 0,
    color,
    kind,
    health: CAR_HEALTH,
    driver: null,
    steerVisual: 0,
    // AI scratch state (traffic waypoints, police targets) lives here, set by its driver.
    ai: { target: null, stuck: 0, lane: 0 },
    flashPhase: Math.random() * Math.PI * 2,
  };
}

const SHIRTS = ['#e2574c', '#f2b134', '#4c9be2', '#63c96b', '#e2e0d8', '#b06bd6', '#e27fb1', '#4cc9c0'];
const SKINS = ['#f2c79b', '#d9a066', '#a06a3b', '#6e4525', '#ffe0bd'];

/** A pedestrian who strolls the sidewalk loop of one home block. */
export function createPed(rng, block) {
  const inset = 10;
  const corners = [
    { x: block.x + inset, y: block.y + inset },
    { x: block.x + block.size - inset, y: block.y + inset },
    { x: block.x + block.size - inset, y: block.y + block.size - inset },
    { x: block.x + inset, y: block.y + block.size - inset },
  ];
  const start = rng.int(0, 3);
  return {
    x: corners[start].x, y: corners[start].y,
    angle: 0,
    corners,
    corner: (start + 1) % 4,
    state: 'walk',
    timer: 0,
    fleeFrom: null,
    speed: rng.range(46, 74),
    shirt: rng.pick(SHIRTS),
    skin: rng.pick(SKINS),
    walkCycle: rng.range(0, 6),
  };
}

/** Move the player on foot for one step; returns how far he actually travelled. */
export function walkPlayer(player, input, dt, city) {
  const dx = input.axisX();
  const dy = input.axisY();
  if (dx === 0 && dy === 0) return 0;
  const length = Math.hypot(dx, dy);
  const speed = input.sprint() ? SPRINT_SPEED : WALK_SPEED;
  const stepX = (dx / length) * speed * dt;
  const stepY = (dy / length) * speed * dt;
  const res = collideCircle(city, player.x + stepX, player.y + stepY, PLAYER_RADIUS);
  const travelled = Math.hypot(res.x - player.x, res.y - player.y);
  player.x = res.x;
  player.y = res.y;
  player.angle = Math.atan2(dy, dx);
  player.walkCycle += travelled * 0.09;
  return travelled;
}

/**
 * Drive a car for one step. `throttle` is -1..1 (forward positive), `steer` is -1..1.
 * Returns the impact speed lost to a wall or building this step (0 when the road was clear).
 */
export function driveCar(car, dt, throttle, steer, city) {
  const before = Math.abs(car.speed);
  if (throttle > 0) {
    car.speed += CAR_ACCEL * throttle * dt * (car.speed < 0 ? 2.2 : 1);
  } else if (throttle < 0) {
    car.speed -= (car.speed > 10 ? CAR_BRAKE : CAR_REVERSE) * -throttle * dt;
  }
  // Rolling drag and engine braking settle the car toward a stop.
  car.speed -= car.speed * 0.55 * dt;
  if (throttle === 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 60 * dt);
  car.speed = Math.max(-CAR_MAX_REVERSE, Math.min(CAR_MAX_SPEED, car.speed));

  const speedRatio = Math.max(-1, Math.min(1, car.speed / 190));
  car.angle += steer * CAR_TURN * speedRatio * dt * (car.speed < 0 ? -1 : 1);
  car.steerVisual = steer;

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // The body is two circles, nose and tail; either one can find a wall.
  let hit = false;
  for (const offset of [-13, 13]) {
    const px = car.x + Math.cos(car.angle) * offset;
    const py = car.y + Math.sin(car.angle) * offset;
    const res = collideCircle(city, px, py, CAR_WIDTH / 2 + 2);
    if (res.hit) {
      car.x += res.x - px;
      car.y += res.y - py;
      hit = true;
    }
  }
  if (!hit) return 0;
  const impact = before;
  car.speed *= 0.25;
  if (impact > 150) car.health -= (impact - 150) * 0.06;
  return impact;
}

/** Keep cars from overlapping: a gentle pairwise push, strongest nose to nose. */
export function separateCars(cars) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      const minDist = 40;
      if (distSq >= minDist * minDist || distSq < 0.01) continue;
      const dist = Math.sqrt(distSq);
      const push = ((minDist - dist) / dist) * 0.5;
      a.x -= dx * push;
      a.y -= dy * push;
      b.x += dx * push;
      b.y += dy * push;
      const closing = Math.abs(a.speed) + Math.abs(b.speed);
      a.speed *= 0.6;
      b.speed *= 0.6;
      if (closing > 170) {
        a.health -= 2;
        b.health -= 2;
      }
    }
  }
}

/** Angle helpers shared by every steering brain. */
export function angleTo(from, x, y) {
  return Math.atan2(y - from.y, x - from.x);
}

export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Steer value (-1..1) that turns `angle` toward `target` the short way. */
export function steerToward(angle, target, sharpness = 2.4) {
  return Math.max(-1, Math.min(1, angleDelta(angle, target) * sharpness));
}
