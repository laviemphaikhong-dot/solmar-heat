// Missions: Marisol's three-job story for her new courier Rico, then an endless board of
// courier runs between the city's landmarks. Each job is a drive to a glowing pickup, then
// a race against the clock to the drop-off; the second story job is hot, and the police
// notice the moment the package is aboard.
import { HEAT_PER_STAR } from './config.js';
import { addHeat } from './police.js';

/** The story, in order. `stops` jobs visit each stop in turn; others are pickup then drop. */
const STORY = [
  {
    title: 'First Run',
    intro: 'Marisol: "A package for the marina, Rico. Drive clean, get paid."',
    pickup: 'cafe', dropoff: 'marina', time: 80, pay: 180, heat: 0,
  },
  {
    title: 'Hot Merchandise',
    intro: 'Marisol: "The Old Cannery box. It is... warm. Do not let them stop you."',
    pickup: 'warehouse', dropoff: 'disco', time: 95, pay: 320, heat: HEAT_PER_STAR + 10,
  },
  {
    title: 'The Grand Tour',
    intro: 'Marisol: "Three friends, three stops, one envelope. Show them the city."',
    pickup: 'cafe', stops: ['hotel', 'mall', 'marina'], time: 170, pay: 520, heat: 0,
  },
];

const LANDMARK_KEYS = ['cafe', 'mall', 'warehouse', 'disco', 'gym', 'cinema', 'marina', 'hotel'];

/** Fresh mission state, waiting at the pickup of the job at `storyIndex` (0 unless a save restores progress). */
export function createMissions(city, rng, storyIndex = 0, completed = 0) {
  const missions = {
    city,
    rng,
    storyIndex,
    jobNumber: 0,
    current: null,
    phase: 'pickup',
    stopIndex: 0,
    timer: 0,
    message: null,
    completed,
  };
  offerNext(missions);
  return missions;
}

/** Build the job now on offer: the next story job, or a random courier run after it. */
function offerNext(missions) {
  const { city, rng } = missions;
  if (missions.storyIndex < STORY.length) {
    const def = STORY[missions.storyIndex];
    missions.current = { ...def };
  } else {
    missions.jobNumber += 1;
    const pickup = LANDMARK_KEYS[rng.int(0, LANDMARK_KEYS.length - 1)];
    let dropoff = pickup;
    while (dropoff === pickup) dropoff = LANDMARK_KEYS[rng.int(0, LANDMARK_KEYS.length - 1)];
    const a = city.landmarks[pickup];
    const b = city.landmarks[dropoff];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    missions.current = {
      title: `Courier Run ${missions.jobNumber}`,
      intro: `Marisol: "${a.name} to ${b.name}. The clock is the boss now."`,
      pickup, dropoff,
      time: Math.round(distance / 11 + 30),
      pay: Math.round(110 + distance * 0.09),
      heat: 0,
    };
  }
  missions.phase = 'pickup';
  missions.stopIndex = 0;
  missions.timer = 0;
  showMessage(missions, missions.current.title, missions.current.intro, 6);
}

/** Put a headline on the HUD for a few seconds. */
export function showMessage(missions, title, sub, seconds = 4) {
  missions.message = { title, sub, ttl: seconds };
}

/** The place the player is currently sent to, and the words that send him. */
export function currentTarget(missions) {
  const { city, current } = missions;
  if (missions.phase === 'pickup') {
    const spot = city.landmarks[current.pickup];
    return { x: spot.x, y: spot.y, label: `Pick up at ${spot.name}` };
  }
  if (current.stops) {
    const key = current.stops[missions.stopIndex];
    const spot = city.landmarks[key];
    const last = missions.stopIndex === current.stops.length - 1;
    return { x: spot.x, y: spot.y, label: `${last ? 'Final stop' : 'Next stop'}: ${spot.name}` };
  }
  const spot = city.landmarks[current.dropoff];
  return { x: spot.x, y: spot.y, label: `Deliver to ${spot.name}` };
}

/** One-line objective for the HUD, with the clock when it is running. */
export function objectiveText(missions) {
  const target = currentTarget(missions);
  const job = missions.current;
  if (missions.phase === 'pickup') return `${job.title} — ${target.label}`;
  const seconds = Math.max(0, Math.ceil(missions.timer));
  return `${job.title} — ${target.label} — ${seconds}s`;
}

/**
 * Advance the job for one step: reaching the marker moves the job on, the clock runs
 * during a delivery, and running out of time fails the job back to its pickup.
 * Events are pushed into `events` ('pickup', 'stop', 'complete', 'fail') for sound and heat.
 */
export function updateMissions(missions, world, dt, events) {
  if (missions.message) {
    missions.message.ttl -= dt;
    if (missions.message.ttl <= 0) missions.message = null;
  }
  const target = currentTarget(missions);
  const px = world.player.car ? world.player.car.x : world.player.x;
  const py = world.player.car ? world.player.car.y : world.player.y;
  const reached = Math.hypot(px - target.x, py - target.y) < 52;

  if (missions.phase !== 'pickup') {
    missions.timer -= dt;
    if (missions.timer <= 0) {
      events.push('fail');
      missions.phase = 'pickup';
      missions.stopIndex = 0;
      showMessage(missions, 'Out of time', 'The job resets. Marisol is not pleased.', 4);
      return;
    }
  }
  if (!reached) return;

  const job = missions.current;
  if (missions.phase === 'pickup') {
    missions.phase = 'deliver';
    missions.timer = job.time;
    if (job.heat) {
      addHeat(world.wanted, job.heat);
      events.push('heat');
    }
    events.push('pickup');
    showMessage(missions, 'Package aboard', job.stops ? 'First stop marked. Go!' : 'Drop-off marked. Go!', 3);
    return;
  }
  if (job.stops && missions.stopIndex < job.stops.length - 1) {
    missions.stopIndex += 1;
    missions.timer += 25;
    events.push('stop');
    showMessage(missions, 'Stop reached', '+25s on the clock. Keep rolling.', 3);
    return;
  }
  // Delivered: pay out, count it, and offer the next job.
  world.cash += job.pay;
  missions.completed += 1;
  events.push('complete');
  if (missions.storyIndex < STORY.length) missions.storyIndex += 1;
  showMessage(missions, 'Job done', `+$${job.pay} — Marisol sends the next one.`, 4);
  offerNext(missions);
}

/** Send the current job back to its pickup (after a bust or a wreck) without failing it. */
export function resetCurrentJob(missions) {
  missions.phase = 'pickup';
  missions.stopIndex = 0;
  missions.timer = 0;
}
