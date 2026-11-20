// Keyboard input: held keys are polled by the simulation, one-shot actions are queued for
// the state machine. WASD and the arrow keys both drive; E enters and leaves cars; Space is
// the handbrake in a car and a shove on foot; Enter confirms; P or Esc pauses; M mutes.

export const ACTION_CONFIRM = 1;
export const ACTION_ENTER_CAR = 2;
export const ACTION_PAUSE = 4;
export const ACTION_PUNCH = 8;
export const ACTION_MUTE = 16;

const HELD_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  brake: ['Space'],
};

const ACTION_KEYS = {
  Enter: ACTION_CONFIRM,
  NumpadEnter: ACTION_CONFIRM,
  KeyE: ACTION_ENTER_CAR,
  KeyF: ACTION_ENTER_CAR,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  Space: ACTION_PUNCH,
  KeyM: ACTION_MUTE,
};

/** Create the input reader bound to the window. */
export function createInput() {
  const down = new Set();
  let queued = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    down.add(event.code);
    const action = ACTION_KEYS[event.code];
    if (action) queued |= action;
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    down.delete(event.code);
  });
  window.addEventListener('blur', () => {
    down.clear();
  });

  function held(name) {
    return HELD_KEYS[name].some((code) => down.has(code));
  }

  return {
    /** -1, 0 or 1 on each axis, from the held movement keys. */
    axisX() {
      return (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
    },
    axisY() {
      return (held('down') ? 1 : 0) - (held('up') ? 1 : 0);
    },
    sprint() {
      return held('sprint');
    },
    brake() {
      return held('brake');
    },
    /** Read and clear the one-shot actions pressed since the last call. */
    takeActions() {
      const actions = queued;
      queued = 0;
      return actions;
    },
    /** Forget queued actions (used when a staged scene takes over). */
    clearActions() {
      queued = 0;
    },
  };
}
