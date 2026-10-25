// Small state gate and SceneManager adapter. Scene RESUME is the authoritative
// point after Phaser has transitioned Arena out of PAUSED state.
export function createPauseGate() {
  let state = 'playing';
  return {
    get state() { return state; },
    open() { if (state !== 'playing') return false; state = 'paused'; return true; },
    resume() { if (state !== 'paused') return false; state = 'playing'; return true; },
    exit() { if (state !== 'paused') return false; state = 'exiting'; return true; },
  };
}

export function requestArenaResume({ gate, canResume, resumeScene, isPaused }) {
  if (gate.state !== 'paused' || !canResume() || !isPaused()) return false;
  // Do not mark the user pause as cleared until SceneManager emits RESUME.
  resumeScene();
  return true;
}

export function synchronizeArenaResume({ gate, canResume, resumePhysics, pausePhysics }) {
  if (!gate.resume()) return false;
  if (canResume()) resumePhysics();
  else pausePhysics();
  return true;
}
