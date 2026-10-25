// One transition per pause interaction; scene shutdown resets the gate.
export function createPauseGate() {
  let state = 'playing';
  return {
    get state() { return state; },
    open() { if (state !== 'playing') return false; state = 'paused'; return true; },
    resume() { if (state !== 'paused') return false; state = 'playing'; return true; },
    exit() { if (state !== 'paused') return false; state = 'exiting'; return true; },
  };
}
