// The city of Solmar Bay, generated once from a seed: a grid of streets and blocks in four
// districts (downtown, old town, suburbs, parks), a beach and the sea down the east side, and
// the named landmarks the missions travel between. Everything solid lives in `buildings`;
// every other module asks this file where things are and what a moving circle may touch.
import {
  BEACH_W, BLOCK, COLS, GRID_H, GRID_W, PITCH, ROAD, ROWS, SHOP_NAMES, SIDEWALK, WORLD_H, WORLD_W,
  ROOFS_DOWNTOWN, ROOFS_OLD_TOWN, ROOFS_SUBURB,
} from './config.js';

export const ZONE_DOWNTOWN = 'downtown';
export const ZONE_OLD_TOWN = 'oldtown';
export const ZONE_SUBURB = 'suburb';
export const ZONE_PARK = 'park';

/** Which district a block belongs to: parks fixed, downtown in the middle, old town south-west. */
function zoneOf(col, row) {
  if ((col === 1 && row === 5) || (col === 5 && row === 1)) return ZONE_PARK;
  if (col >= 2 && col <= 4 && row >= 2 && row <= 4) return ZONE_DOWNTOWN;
  if (row >= 5 && col <= 2) return ZONE_OLD_TOWN;
  return ZONE_SUBURB;
}

/** The centre line of vertical street i (0..COLS) and horizontal street j (0..ROWS). */
export function streetX(i) { return i * PITCH + ROAD / 2; }
export function streetY(j) { return j * PITCH + ROAD / 2; }

/** Split a block's buildable square into 1, 2 or 4 building plots with alleys between them. */
function plotsFor(rng, x, y, size) {
  const gap = 14;
  const layout = rng.int(0, 3);
  if (layout === 0) return [{ x, y, w: size, h: size }];
  if (layout === 1) {
    const cut = size / 2 - gap / 2;
    return [
      { x, y, w: size, h: cut },
      { x, y: y + cut + gap, w: size, h: cut },
    ];
  }
  if (layout === 2) {
    const cut = size / 2 - gap / 2;
    return [
      { x, y, w: cut, h: size },
      { x: x + cut + gap, y, w: cut, h: size },
    ];
  }
  const cut = size / 2 - gap / 2;
  return [
    { x, y, w: cut, h: cut },
    { x: x + cut + gap, y, w: cut, h: cut },
    { x, y: y + cut + gap, w: cut, h: cut },
    { x: x + cut + gap, y: y + cut + gap, w: cut, h: cut },
  ];
}

/** Build the whole city. Returns plain data; rendering and collision read it, nothing mutates it. */
export function createCity(rng) {
  const buildings = [];
  const blocks = [];
  const trees = [];
  const lamps = [];
  let shopIndex = 0;

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const x = col * PITCH + ROAD;
      const y = row * PITCH + ROAD;
      const zone = zoneOf(col, row);
      blocks.push({ col, row, x, y, size: BLOCK, zone });
      if (zone === ZONE_PARK) {
        for (let t = 0; t < 14; t += 1) {
          trees.push({ x: x + rng.range(24, BLOCK - 24), y: y + rng.range(24, BLOCK - 24), kind: 'tree', size: rng.range(9, 14) });
        }
        continue;
      }
      const inner = BLOCK - SIDEWALK * 2;
      const palette = zone === ZONE_DOWNTOWN ? ROOFS_DOWNTOWN : zone === ZONE_OLD_TOWN ? ROOFS_OLD_TOWN : ROOFS_SUBURB;
      for (const plot of plotsFor(rng, x + SIDEWALK, y + SIDEWALK, inner)) {
        const inset = rng.range(0, 5);
        const building = {
          x: plot.x + inset, y: plot.y + inset,
          w: plot.w - inset * 2, h: plot.h - inset * 2,
          roof: rng.pick(palette),
          height: zone === ZONE_DOWNTOWN ? rng.range(26, 54) : rng.range(8, 20),
          sign: null,
        };
        if (zone !== ZONE_SUBURB || rng.chance(0.5)) {
          building.sign = SHOP_NAMES[shopIndex % SHOP_NAMES.length];
          shopIndex += 1;
        }
        buildings.push(building);
      }
      // A shade tree or two on the sidewalk corners.
      if (rng.chance(0.7)) trees.push({ x: x + 12, y: y + 12, kind: 'tree', size: rng.range(7, 10) });
      if (rng.chance(0.7)) trees.push({ x: x + BLOCK - 12, y: y + BLOCK - 12, kind: 'tree', size: rng.range(7, 10) });
    }
  }

  // The landmark blocks carry their own names over the door, so the city agrees with
  // Marisol's directions: her cafe, the mall, the cannery, the disco, the gym, the cinema
  // and the hospital each sign the largest building on their block.
  const landmarkSigns = [
    [0, 6, 'CAFE MARISOL'], [3, 2, 'PALMS MALL'], [6, 0, 'OLD CANNERY'], [4, 4, 'DISCO FARO'],
    [1, 3, 'GYM OLE'], [2, 5, 'CINEMA REY'], [5, 3, 'SOLMAR GENERAL'],
  ];
  for (const [col, row, sign] of landmarkSigns) {
    const bx = col * PITCH + ROAD;
    const by = row * PITCH + ROAD;
    let largest = null;
    for (const b of buildings) {
      if (b.x >= bx && b.x < bx + BLOCK && b.y >= by && b.y < by + BLOCK) {
        if (!largest || b.w * b.h > largest.w * largest.h) largest = b;
      }
    }
    if (largest) largest.sign = sign;
  }

  // Palms lean over the beach, and street lamps stud every kerb.
  for (let y = 60; y < WORLD_H - 40; y += 118) {
    trees.push({ x: GRID_W + rng.range(26, 60), y: y + rng.range(-14, 14), kind: 'palm', size: rng.range(11, 15) });
    trees.push({ x: GRID_W + BEACH_W - rng.range(24, 52), y: y + 54 + rng.range(-12, 12), kind: 'palm', size: rng.range(11, 15) });
  }
  for (let i = 0; i <= COLS; i += 1) {
    for (let y = 70; y < GRID_H; y += 172) lamps.push({ x: streetX(i) - ROAD / 2 + 6, y });
  }
  for (let j = 0; j <= ROWS; j += 1) {
    for (let x = 70; x < GRID_W; x += 172) lamps.push({ x, y: streetY(j) - ROAD / 2 + 6 });
  }

  const intersections = [];
  for (let j = 0; j <= ROWS; j += 1) {
    for (let i = 0; i <= COLS; i += 1) intersections.push({ x: streetX(i), y: streetY(j), i, j });
  }

  /** A point on the street just west of a block: where its visitors stop. */
  function beside(col, row) {
    return { x: streetX(col), y: row * PITCH + ROAD + BLOCK / 2 };
  }

  const landmarks = {
    cafe: { name: 'Cafe Marisol', ...beside(0, 6) },
    mall: { name: 'Palms Mall', ...beside(3, 2) },
    warehouse: { name: 'Old Cannery', ...beside(6, 0) },
    disco: { name: 'Disco Faro', ...beside(4, 4) },
    gym: { name: 'Gym Ole', ...beside(1, 3) },
    cinema: { name: 'Cinema Rey', ...beside(2, 5) },
    clinic: { name: 'Solmar General', ...beside(5, 3) },
    marina: { name: 'Solmar Marina', x: GRID_W + BEACH_W / 2, y: WORLD_H - 210 },
    hotel: { name: 'Hotel Azul', x: GRID_W + BEACH_W / 2, y: 190 },
  };

  return { buildings, blocks, trees, lamps, intersections, landmarks };
}

/** The block a point falls in, or null when the point is on a street, the beach or the sea. */
export function blockAt(city, x, y) {
  if (x < ROAD || y < ROAD || x >= GRID_W || y >= GRID_H) return null;
  const col = Math.floor((x - ROAD) / PITCH);
  const row = Math.floor((y - ROAD) / PITCH);
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return null;
  const localX = (x - ROAD) - col * PITCH;
  const localY = (y - ROAD) - row * PITCH;
  if (localX > BLOCK || localY > BLOCK) return null;
  return city.blocks[row * COLS + col];
}

/** True when the point is on asphalt (a street square, not a block, beach or sea). */
export function isOnStreet(x, y) {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
  const inVertical = (x % PITCH) < ROAD;
  const inHorizontal = (y % PITCH) < ROAD;
  return inVertical || inHorizontal;
}

/**
 * Push a circle out of every building it overlaps and keep it inside the world (the sea is
 * out of bounds; the beach is walkable). Returns the corrected point and whether it hit.
 */
export function collideCircle(city, x, y, radius) {
  let hit = false;
  const minX = radius + 2;
  const minY = radius + 2;
  const maxX = GRID_W + BEACH_W - radius - 4;
  const maxY = WORLD_H - radius - 2;
  if (x < minX) { x = minX; hit = true; }
  if (y < minY) { y = minY; hit = true; }
  if (x > maxX) { x = maxX; hit = true; }
  if (y > maxY) { y = maxY; hit = true; }
  for (const b of city.buildings) {
    if (x + radius < b.x || x - radius > b.x + b.w || y + radius < b.y || y - radius > b.y + b.h) continue;
    const nearX = Math.max(b.x, Math.min(x, b.x + b.w));
    const nearY = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - nearX;
    const dy = y - nearY;
    const distSq = dx * dx + dy * dy;
    if (distSq >= radius * radius) continue;
    hit = true;
    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      x = nearX + (dx / dist) * radius;
      y = nearY + (dy / dist) * radius;
    } else {
      // Centre inside the rect: leave by the shallowest side.
      const left = x - b.x;
      const right = b.x + b.w - x;
      const top = y - b.y;
      const bottom = b.y + b.h - y;
      const shallowest = Math.min(left, right, top, bottom);
      if (shallowest === left) x = b.x - radius;
      else if (shallowest === right) x = b.x + b.w + radius;
      else if (shallowest === top) y = b.y - radius;
      else y = b.y + b.h + radius;
    }
  }
  return { x, y, hit };
}

/** The intersection nearest a point: where lost drivers and fresh police aim first. */
export function nearestIntersection(city, x, y) {
  let best = city.intersections[0];
  let bestDist = Infinity;
  for (const point of city.intersections) {
    const d = (point.x - x) * (point.x - x) + (point.y - y) * (point.y - y);
    if (d < bestDist) { bestDist = d; best = point; }
  }
  return best;
}
