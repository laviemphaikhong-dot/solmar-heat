// Rendering: the city is painted once into a static layer (streets, blocks, roofs, beach),
// then every frame draws the visible slice of it, the traffic, pedestrians, police and
// player above it, and the HUD — health, cash, wanted stars, objective and minimap — in
// screen space. Title, pause, BUSTED and WASTED washes close over the top.
import {
  BEACH_W, BLOCK, CAR_LENGTH, CAR_WIDTH, COLORS, GRID_W, ROAD, SEA_W, WORLD_H, WORLD_W,
} from './config.js';
import { ZONE_PARK, streetX, streetY } from './city.js';
import { COLS, ROWS } from './config.js';
import { starsOf } from './police.js';
import { currentTarget, objectiveText } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const FONT = 'system-ui, "Segoe UI", sans-serif';

/** Paint the unmoving city into an offscreen canvas, once. */
function paintStaticLayer(city) {
  const layer = document.createElement('canvas');
  layer.width = WORLD_W;
  layer.height = WORLD_H;
  const g = layer.getContext('2d');

  // Sea and beach down the east side, city ground everywhere else.
  g.fillStyle = COLORS.sea;
  g.fillRect(GRID_W + BEACH_W, 0, SEA_W, WORLD_H);
  g.fillStyle = COLORS.seaDeep;
  for (let y = 30; y < WORLD_H; y += 90) g.fillRect(GRID_W + BEACH_W + 30 + ((y * 7) % 120), y, 90, 7);
  g.fillStyle = COLORS.sand;
  g.fillRect(GRID_W, 0, BEACH_W, WORLD_H);
  g.fillStyle = COLORS.plaza;
  g.fillRect(0, 0, GRID_W, WORLD_H);

  // Streets: asphalt bands with dashed centre lines, plain at the crossings.
  g.fillStyle = COLORS.asphalt;
  for (let i = 0; i <= COLS; i += 1) g.fillRect(i * (ROAD + BLOCK), 0, ROAD, WORLD_H);
  for (let j = 0; j <= ROWS; j += 1) g.fillRect(0, j * (ROAD + BLOCK), GRID_W, ROAD);
  g.strokeStyle = COLORS.laneMark;
  g.lineWidth = 3;
  g.setLineDash([26, 22]);
  for (let i = 0; i <= COLS; i += 1) {
    g.beginPath();
    g.moveTo(streetX(i), 0);
    g.lineTo(streetX(i), WORLD_H);
    g.stroke();
  }
  for (let j = 0; j <= ROWS; j += 1) {
    g.beginPath();
    g.moveTo(0, streetY(j));
    g.lineTo(GRID_W, streetY(j));
    g.stroke();
  }
  g.setLineDash([]);

  // Blocks: a sidewalk rim each, grass and paths for the parks.
  for (const block of city.blocks) {
    g.fillStyle = COLORS.sidewalk;
    g.fillRect(block.x - 6, block.y - 6, block.size + 12, block.size + 12);
    if (block.zone === ZONE_PARK) {
      g.fillStyle = COLORS.grass;
      g.fillRect(block.x, block.y, block.size, block.size);
      g.fillStyle = COLORS.grassDark;
      g.fillRect(block.x, block.y + block.size / 2 - 9, block.size, 18);
      g.fillRect(block.x + block.size / 2 - 9, block.y, 18, block.size);
    }
  }

  // Buildings: a sun shadow thrown north-east, the roof, a rim of detail, a shop sign.
  for (const b of city.buildings) {
    g.fillStyle = COLORS.shadow;
    g.fillRect(b.x + b.height * 0.45, b.y + b.height * 0.3, b.w, b.h);
    g.fillStyle = b.roof;
    g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 2;
    g.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    g.fillStyle = 'rgba(255,255,255,0.20)';
    g.fillRect(b.x + b.w * 0.18, b.y + b.h * 0.18, b.w * 0.22, b.h * 0.16);
    g.fillRect(b.x + b.w * 0.6, b.y + b.h * 0.62, b.w * 0.18, b.h * 0.14);
    if (b.sign && b.w > 84) {
      g.fillStyle = '#2b2b33';
      g.fillRect(b.x + 6, b.y + b.h - 17, Math.min(b.w - 12, 12 + b.sign.length * 7.4), 13);
      g.fillStyle = '#ffd873';
      g.font = `bold 9px ${FONT}`;
      g.textAlign = 'left';
      g.fillText(b.sign, b.x + 10, b.y + b.h - 7);
    }
  }

  // Street lamps: a post and a pale pool of light.
  for (const lamp of city.lamps) {
    g.fillStyle = 'rgba(255, 240, 190, 0.10)';
    g.beginPath();
    g.arc(lamp.x, lamp.y, 15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3c3c44';
    g.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
  }

  // The marina pier reaching into the sea.
  const marina = city.landmarks.marina;
  g.fillStyle = '#8a6b46';
  g.fillRect(marina.x + 20, marina.y - 8, 190, 16);
  g.fillRect(marina.x + 60, marina.y - 44, 16, 90);
  return layer;
}

/** A five-pointed star path centred at (x, y). */
function starPath(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

/** One car, nose along its angle: body, glass, wheels, and for police a flashing light bar. */
function drawCar(g, car, time) {
  g.save();
  g.translate(car.x, car.y);
  g.rotate(car.angle);
  g.fillStyle = COLORS.shadow;
  roundRect(g, -CAR_LENGTH / 2 + 3, -CAR_WIDTH / 2 + 4, CAR_LENGTH, CAR_WIDTH, 6);
  g.fill();
  g.fillStyle = car.kind === 'police' ? '#ececf2' : car.color;
  roundRect(g, -CAR_LENGTH / 2, -CAR_WIDTH / 2, CAR_LENGTH, CAR_WIDTH, 6);
  g.fill();
  if (car.kind === 'police') {
    g.fillStyle = '#22335e';
    g.fillRect(-6, -CAR_WIDTH / 2, 13, CAR_WIDTH);
    const flash = Math.sin(time * 14 + car.flashPhase) > 0;
    g.fillStyle = flash ? COLORS.policeRed : '#7a1622';
    g.fillRect(-4, -6, 8, 5);
    g.fillStyle = flash ? '#5b76e8' : COLORS.policeBlue;
    g.fillRect(-4, 1, 8, 5);
  }
  // Cabin glass and a lighter roof panel.
  g.fillStyle = 'rgba(24, 34, 48, 0.85)';
  roundRect(g, -9, -CAR_WIDTH / 2 + 3, 17, CAR_WIDTH - 6, 3);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(g, -2, -CAR_WIDTH / 2 + 4, 6, CAR_WIDTH - 8, 2);
  g.fill();
  // Wheels.
  g.fillStyle = '#17171c';
  for (const [wx, wy] of [[-15, -CAR_WIDTH / 2], [13, -CAR_WIDTH / 2], [-15, CAR_WIDTH / 2 - 3], [13, CAR_WIDTH / 2 - 3]]) {
    g.fillRect(wx, wy, 9, 3);
  }
  g.restore();
  // A hurt car breathes smoke.
  if (car.health < 38) {
    g.fillStyle = 'rgba(60,60,66,0.35)';
    const wobble = Math.sin(time * 6 + car.flashPhase) * 3;
    g.beginPath();
    g.arc(car.x + wobble, car.y - 14, 7 + (time * 9 + car.flashPhase) % 5, 0, Math.PI * 2);
    g.fill();
  }
  // Police lights wash the street around the cruiser.
  if (car.kind === 'police') {
    const flash = Math.sin(time * 14 + car.flashPhase) > 0;
    g.fillStyle = flash ? 'rgba(227,63,78,0.13)' : 'rgba(39,75,219,0.13)';
    g.beginPath();
    g.arc(car.x, car.y, 52, 0, Math.PI * 2);
    g.fill();
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** One pedestrian: shadow, shirt, head, and a stride that swings with the walk cycle. */
function drawPed(g, ped) {
  g.fillStyle = COLORS.shadow;
  g.beginPath();
  g.ellipse(ped.x + 2, ped.y + 3, 8, 6, 0, 0, Math.PI * 2);
  g.fill();
  if (ped.state === 'fallen') {
    g.save();
    g.translate(ped.x, ped.y);
    g.rotate(ped.angle);
    g.fillStyle = ped.shirt;
    roundRect(g, -11, -5, 22, 10, 5);
    g.fill();
    g.fillStyle = ped.skin;
    g.beginPath();
    g.arc(13, 0, 4.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
    return;
  }
  const stride = Math.sin(ped.walkCycle) * 4;
  g.strokeStyle = '#33333c';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(ped.x, ped.y);
  g.lineTo(ped.x - Math.cos(ped.angle) * 2 + Math.cos(ped.angle + Math.PI / 2) * stride * 0.4, ped.y + 6);
  g.moveTo(ped.x, ped.y);
  g.lineTo(ped.x - Math.cos(ped.angle) * 2 - Math.cos(ped.angle + Math.PI / 2) * stride * 0.4, ped.y + 6);
  g.stroke();
  g.fillStyle = ped.shirt;
  g.beginPath();
  g.arc(ped.x, ped.y, 7.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = ped.skin;
  g.beginPath();
  g.arc(ped.x + Math.cos(ped.angle) * 2.5, ped.y + Math.sin(ped.angle) * 2.5, 4.2, 0, Math.PI * 2);
  g.fill();
}

/** Rico himself: a teal shirt, a white ring so the eye finds him, a nose for direction. */
function drawPlayer(g, player, time) {
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(player.x, player.y, 13 + Math.sin(time * 3) * 1.2, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = COLORS.shadow;
  g.beginPath();
  g.ellipse(player.x + 2, player.y + 3, 8, 6, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#128a7d';
  g.beginPath();
  g.arc(player.x, player.y, 8.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f2c79b';
  g.beginPath();
  g.arc(player.x + Math.cos(player.angle) * 3, player.y + Math.sin(player.angle) * 3, 4.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0b5a52';
  g.beginPath();
  g.arc(player.x + Math.cos(player.angle) * 9.5, player.y + Math.sin(player.angle) * 9.5, 2.4, 0, Math.PI * 2);
  g.fill();
}

/** Trees over the actors: palms with fronds on the beach, round canopies in town. */
function drawTrees(g, city, camX, camY, viewW, viewH) {
  for (const tree of city.trees) {
    if (tree.x < camX - 40 || tree.y < camY - 40 || tree.x > camX + viewW + 40 || tree.y > camY + viewH + 40) continue;
    g.fillStyle = COLORS.shadow;
    g.beginPath();
    g.ellipse(tree.x + 4, tree.y + 5, tree.size, tree.size * 0.6, 0, 0, Math.PI * 2);
    g.fill();
    if (tree.kind === 'palm') {
      g.strokeStyle = '#2e7d46';
      g.lineWidth = 3;
      for (let f = 0; f < 6; f += 1) {
        const a = (f / 6) * Math.PI * 2 + tree.x * 0.01;
        g.beginPath();
        g.moveTo(tree.x, tree.y);
        g.quadraticCurveTo(
          tree.x + Math.cos(a) * tree.size * 0.8, tree.y + Math.sin(a) * tree.size * 0.8 - 4,
          tree.x + Math.cos(a) * tree.size * 1.25, tree.y + Math.sin(a) * tree.size * 1.25 + 3,
        );
        g.stroke();
      }
      g.fillStyle = '#8a6b46';
      g.beginPath();
      g.arc(tree.x, tree.y, 3.4, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = '#3f9142';
      g.beginPath();
      g.arc(tree.x, tree.y, tree.size, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#4fa855';
      g.beginPath();
      g.arc(tree.x - tree.size * 0.25, tree.y - tree.size * 0.25, tree.size * 0.62, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** The beacon over the current objective: a pillar of light no driver can miss. */
function drawBeacon(g, target, time) {
  const pulse = 0.75 + Math.sin(time * 4) * 0.25;
  const grad = g.createLinearGradient(0, target.y - 300, 0, target.y);
  grad.addColorStop(0, 'rgba(255,196,64,0)');
  grad.addColorStop(1, COLORS.beacon);
  g.fillStyle = grad;
  g.fillRect(target.x - 13, target.y - 300, 26, 300);
  g.strokeStyle = COLORS.objective;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(target.x, target.y, 20 + Math.sin(time * 4) * 4, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = COLORS.objective;
  g.save();
  g.translate(target.x, target.y - 34 - Math.sin(time * 4) * 4);
  g.rotate(Math.PI / 4);
  g.fillRect(-7 * pulse, -7 * pulse, 14 * pulse, 14 * pulse);
  g.restore();
}

/** Create the renderer bound to the page's canvas. */
export function createRenderer(canvas) {
  const g = canvas.getContext('2d');
  let staticLayer = null;
  let cityRef = null;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function ensureLayer(city) {
    if (cityRef !== city) {
      cityRef = city;
      staticLayer = paintStaticLayer(city);
    }
  }

  /** Paint one frame: the world through the camera, then the HUD in screen space. */
  function draw(world, screen, saveInfo) {
    ensureLayer(world.city);
    const viewW = canvas.width;
    const viewH = canvas.height;
    const cam = world.camera;
    const shakeX = world.shake ? (Math.random() - 0.5) * world.shake : 0;
    const shakeY = world.shake ? (Math.random() - 0.5) * world.shake : 0;

    g.fillStyle = COLORS.seaDeep;
    g.fillRect(0, 0, viewW, viewH);
    g.save();
    g.translate(-cam.x + shakeX, -cam.y + shakeY);
    g.drawImage(staticLayer, 0, 0);
    const target = currentTarget(world.missions);
    drawBeacon(g, target, world.time);
    for (const ped of world.peds) drawPed(g, ped);
    for (const car of world.cars) drawCar(g, car, world.time);
    if (!world.player.car) drawPlayer(g, world.player, world.time);
    drawTrees(g, world.city, cam.x, cam.y, viewW, viewH);
    g.restore();

    if (screen !== SCREEN_TITLE) drawHud(g, world, viewW, viewH);
    if (screen === SCREEN_TITLE) drawTitle(g, world, viewW, viewH, saveInfo);
    if (screen === SCREEN_PAUSED) drawWash(g, viewW, viewH, 'PAUSED', 'Press P or Enter to keep driving');
    if (screen === SCREEN_BUSTED) drawWash(g, viewW, viewH, 'BUSTED', 'The Solmar Bay police take Rico in. Cash fined, job reset — press Enter.');
    if (screen === SCREEN_WASTED) drawWash(g, viewW, viewH, 'WASTED', 'Rico wakes at Solmar General. The bill stings — press Enter.');
  }

  /** Everything the player reads at a glance, drawn over the world. */
  function drawHud(g2, world, viewW, viewH) {
    const player = world.player;
    // Health and cash, top left.
    g2.fillStyle = 'rgba(16,18,26,0.62)';
    roundRect(g2, 14, 12, 218, 64, 8);
    g2.fill();
    g2.fillStyle = '#ffffff';
    g2.font = `bold 13px ${FONT}`;
    g2.textAlign = 'left';
    g2.fillText(player.car ? 'RICO — DRIVING' : 'RICO — ON FOOT', 24, 31);
    g2.fillStyle = '#3a3f4d';
    g2.fillRect(24, 38, 150, 10);
    g2.fillStyle = player.health > 30 ? COLORS.health : COLORS.healthLow;
    g2.fillRect(24, 38, 150 * Math.max(0, player.health) / 100, 10);
    if (player.car) {
      g2.fillStyle = '#3a3f4d';
      g2.fillRect(24, 52, 150, 7);
      g2.fillStyle = '#e8b93e';
      g2.fillRect(24, 52, 150 * Math.max(0, player.car.health) / 100, 7);
    }
    g2.fillStyle = COLORS.cash;
    g2.font = `bold 21px ${FONT}`;
    g2.textAlign = 'right';
    g2.fillText(`$${world.cash.toLocaleString('en-US')}`, 222, 66);

    // Wanted stars and the bust meter, top right.
    const stars = starsOf(world.wanted);
    for (let i = 0; i < 5; i += 1) {
      const x = viewW - 30 - i * 34;
      starPath(g2, x, 30, 13);
      g2.fillStyle = i < stars ? '#ffc440' : 'rgba(255,255,255,0.22)';
      g2.fill();
    }
    if (world.wanted.bust > 0.02) {
      g2.fillStyle = 'rgba(16,18,26,0.62)';
      roundRect(g2, viewW - 196, 48, 182, 26, 6);
      g2.fill();
      g2.fillStyle = COLORS.policeRed;
      g2.fillRect(viewW - 190, 57, 170 * world.wanted.bust, 8);
      g2.fillStyle = '#ffffff';
      g2.font = `bold 11px ${FONT}`;
      g2.textAlign = 'center';
      g2.fillText('BUSTED', viewW - 105, 54);
    }

    // Mission clock, top centre, while a delivery runs.
    if (world.missions.phase !== 'pickup') {
      const job = world.missions.current;
      const frac = Math.max(0, world.missions.timer / job.time);
      g2.fillStyle = 'rgba(16,18,26,0.62)';
      roundRect(g2, viewW / 2 - 130, 12, 260, 30, 8);
      g2.fill();
      g2.fillStyle = frac > 0.3 ? COLORS.objective : COLORS.policeRed;
      g2.fillRect(viewW / 2 - 122, 30, 244 * Math.min(1, frac), 5);
      g2.fillStyle = '#ffffff';
      g2.font = `bold 14px ${FONT}`;
      g2.textAlign = 'center';
      g2.fillText(`${Math.max(0, Math.ceil(world.missions.timer))}s — ${job.title}`, viewW / 2, 28);
    }

    // The dispatcher's headline, when there is one.
    const message = world.missions.message;
    if (message) {
      g2.fillStyle = 'rgba(16,18,26,0.72)';
      roundRect(g2, viewW / 2 - 300, 52, 600, 54, 8);
      g2.fill();
      g2.fillStyle = COLORS.objective;
      g2.font = `bold 17px ${FONT}`;
      g2.textAlign = 'center';
      g2.fillText(message.title, viewW / 2, 76);
      g2.fillStyle = '#f2ead8';
      g2.font = `13px ${FONT}`;
      g2.fillText(message.sub, viewW / 2, 95);
    }

    // Objective pill, bottom centre.
    g2.fillStyle = 'rgba(16,18,26,0.66)';
    const objective = objectiveText(world.missions);
    g2.font = `bold 14px ${FONT}`;
    const width = Math.min(viewW - 420, g2.measureText(objective).width + 34);
    roundRect(g2, viewW / 2 - width / 2, viewH - 40, width, 27, 13);
    g2.fill();
    g2.fillStyle = '#ffe9b0';
    g2.textAlign = 'center';
    g2.fillText(objective, viewW / 2, viewH - 22);

    // Controls hint, bottom right; speed while driving.
    g2.fillStyle = 'rgba(255,255,255,0.75)';
    g2.font = `12px ${FONT}`;
    g2.textAlign = 'right';
    const hint = player.car ? 'WASD drive · Space brake · E get out' : 'WASD walk · Shift run · E enter car · Space shove';
    g2.fillText(hint, viewW - 16, viewH - 18);
    if (player.car) {
      g2.fillStyle = '#ffffff';
      g2.font = `bold 22px ${FONT}`;
      g2.fillText(`${Math.round(Math.abs(player.car.speed) * 0.24)} km/h`, viewW - 16, viewH - 44);
    }

    drawMinimap(g2, world, viewH);
    drawEdgeArrow(g2, world, viewW, viewH);

    // Low health throbs red at the edges.
    if (player.health < 30 && !player.car) {
      g2.fillStyle = `rgba(200,30,40,${0.10 + 0.06 * Math.sin(world.time * 6)})`;
      g2.fillRect(0, 0, viewW, 10);
      g2.fillRect(0, viewH - 10, viewW, 10);
      g2.fillRect(0, 0, 10, viewH);
      g2.fillRect(viewW - 10, 0, 10, viewH);
    }
  }

  /** The minimap: the whole city in a corner, with every actor that matters dotted in. */
  function drawMinimap(g2, world, viewH) {
    const w = 188;
    const h = Math.round(w * (WORLD_H / WORLD_W));
    const x = 14;
    const y = viewH - h - 14;
    g2.fillStyle = 'rgba(16,18,26,0.66)';
    roundRect(g2, x - 4, y - 4, w + 8, h + 8, 8);
    g2.fill();
    g2.drawImage(staticLayer, 0, 0, WORLD_W, WORLD_H, x, y, w, h);
    const sx = w / WORLD_W;
    const sy = h / WORLD_H;
    const target = currentTarget(world.missions);
    g2.fillStyle = COLORS.objective;
    g2.beginPath();
    g2.arc(x + target.x * sx, y + target.y * sy, 4.5 + Math.sin(world.time * 4) * 1.2, 0, Math.PI * 2);
    g2.fill();
    for (const car of world.cars) {
      if (car.kind === 'police') continue;
      g2.fillStyle = 'rgba(230,230,230,0.75)';
      g2.fillRect(x + car.x * sx - 1.5, y + car.y * sy - 1.5, 3, 3);
    }
    for (const cop of world.police) {
      g2.fillStyle = Math.sin(world.time * 10) > 0 ? COLORS.policeRed : COLORS.policeBlue;
      g2.beginPath();
      g2.arc(x + cop.x * sx, y + cop.y * sy, 3.4, 0, Math.PI * 2);
      g2.fill();
    }
    const px = world.player.car ? world.player.car.x : world.player.x;
    const py = world.player.car ? world.player.car.y : world.player.y;
    g2.fillStyle = '#ffffff';
    g2.beginPath();
    g2.arc(x + px * sx, y + py * sy, 3.6, 0, Math.PI * 2);
    g2.fill();
    g2.strokeStyle = '#128a7d';
    g2.lineWidth = 1.6;
    g2.stroke();
  }

  /** An arrow at the screen edge points the way to the objective when it is off-screen. */
  function drawEdgeArrow(g2, world, viewW, viewH) {
    const target = currentTarget(world.missions);
    const cam = world.camera;
    const sx = target.x - cam.x;
    const sy = target.y - cam.y;
    if (sx > 30 && sx < viewW - 30 && sy > 30 && sy < viewH - 30) return;
    const angle = Math.atan2(sy - viewH / 2, sx - viewW / 2);
    const ex = Math.max(34, Math.min(viewW - 34, sx));
    const ey = Math.max(90, Math.min(viewH - 60, sy));
    g2.save();
    g2.translate(ex, ey);
    g2.rotate(angle);
    g2.fillStyle = COLORS.objective;
    g2.beginPath();
    g2.moveTo(13, 0);
    g2.lineTo(-8, -8);
    g2.lineTo(-8, 8);
    g2.closePath();
    g2.fill();
    g2.restore();
  }

  /** The title screen over the living city: name, story, controls, the way in. */
  function drawTitle(g2, world, viewW, viewH, saveInfo) {
    const grad = g2.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, 'rgba(24,16,40,0.55)');
    grad.addColorStop(0.55, 'rgba(24,16,40,0.28)');
    grad.addColorStop(1, 'rgba(24,16,40,0.66)');
    g2.fillStyle = grad;
    g2.fillRect(0, 0, viewW, viewH);
    g2.textAlign = 'center';
    g2.fillStyle = '#ffc440';
    g2.font = `bold 21px ${FONT}`;
    g2.fillText('W E L C O M E   T O   S O L M A R   B A Y', viewW / 2, viewH * 0.24);
    g2.fillStyle = '#ffffff';
    g2.font = `900 84px ${FONT}`;
    g2.fillText('SOLMAR HEAT', viewW / 2, viewH * 0.24 + 78);
    g2.fillStyle = '#ffe9b0';
    g2.font = `17px ${FONT}`;
    g2.fillText('Rico Vega owes the wrong people. Marisol pays cash for fast wheels and a cool head.', viewW / 2, viewH * 0.24 + 116);
    g2.fillText('Run her packages across the bay — and try not to interest the police.', viewW / 2, viewH * 0.24 + 140);
    g2.fillStyle = 'rgba(16,18,26,0.72)';
    roundRect(g2, viewW / 2 - 330, viewH * 0.62, 660, 108, 10);
    g2.fill();
    g2.fillStyle = '#f2ead8';
    g2.font = `14px ${FONT}`;
    g2.fillText('WASD / arrows — walk and drive        E — enter or leave a car', viewW / 2, viewH * 0.62 + 30);
    g2.fillText('Shift — run        Space — shove / handbrake        P — pause        M — mute', viewW / 2, viewH * 0.62 + 54);
    g2.fillText('Follow the gold beacon. Stars bring cruisers. Get pinned and you are BUSTED.', viewW / 2, viewH * 0.62 + 78);
    g2.fillStyle = '#ffc440';
    g2.font = `bold 24px ${FONT}`;
    const prompt = saveInfo && saveInfo.hasSave ? 'Press ENTER — continue Rico\'s story' : 'Press ENTER — start Rico\'s story';
    g2.fillText(prompt, viewW / 2, viewH * 0.62 + 142);
    if (saveInfo && saveInfo.hasSave) {
      g2.fillStyle = '#ffffff';
      g2.font = `13px ${FONT}`;
      g2.fillText(`Saved: $${saveInfo.cash.toLocaleString('en-US')} earned · ${saveInfo.completed} jobs done · N — new game`, viewW / 2, viewH * 0.62 + 166);
    }
  }

  /** A full-screen wash with one big word: pause, BUSTED and WASTED share the shape. */
  function drawWash(g2, viewW, viewH, word, sub) {
    g2.fillStyle = word === 'BUSTED' ? 'rgba(20,26,70,0.55)' : word === 'WASTED' ? 'rgba(70,14,18,0.55)' : 'rgba(12,12,18,0.55)';
    g2.fillRect(0, 0, viewW, viewH);
    g2.textAlign = 'center';
    g2.fillStyle = '#ffffff';
    g2.font = `900 72px ${FONT}`;
    g2.fillText(word, viewW / 2, viewH / 2);
    g2.fillStyle = '#ffe9b0';
    g2.font = `16px ${FONT}`;
    g2.fillText(sub, viewW / 2, viewH / 2 + 40);
  }

  return { draw, resize };
}
