// A tiny seeded random number generator (mulberry32): the same seed always grows the same
// city and the same traffic, which is what makes the staged screenshot scenes repeatable.

/** Create a generator from a 32-bit seed. */
export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** A float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** An integer in [min, max]. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** One item of the list. */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** True with the given probability. */
    chance(probability) {
      return next() < probability;
    },
  };
}
