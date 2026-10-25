import test from 'node:test';
import assert from 'node:assert/strict';
import { createPauseGate, requestArenaResume, synchronizeArenaResume } from '../src/pause.js';

// SceneManager lifecycle simulation: scene.resume() changes state and emits RESUME.
// The player's position is intentionally never recreated or changed by this flow.
function harness() {
  const player = { x: 432, y: 287 };
  const gate = createPauseGate();
  let paused = false, physics = false, focused = true, visible = true, landscape = true;
  const canResume = () => focused && visible && landscape;
  const sync = () => synchronizeArenaResume({
    gate, canResume,
    resumePhysics: () => { physics = true; },
    pausePhysics: () => { physics = false; },
  });
  const open = () => { gate.open(); paused = true; physics = false; };
  const clickResume = () => requestArenaResume({
    gate, canResume, isPaused: () => paused,
    resumeScene: () => { paused = false; sync(); },
  });
  const focusChange = value => { focused = value; if (!value) physics = false; else if (!paused && gate.state === 'playing' && canResume()) physics = true; };
  return { player, gate, open, clickResume, focusChange, sync, setVisible: v => { visible = v; if (!v) physics = false; }, setLandscape: v => { landscape = v; if (!v) physics = false; }, get paused() { return paused; }, get physics() { return physics; } };
}

test('Arena session survives pause and actual SceneManager RESUME event', () => {
  const h = harness(); h.open();
  assert.equal(h.clickResume(), true);
  assert.equal(h.paused, false);
  assert.equal(h.physics, true);
  assert.deepEqual(h.player, { x: 432, y: 287 });
  assert.equal(h.gate.state, 'playing');
  h.open(); assert.equal(h.clickResume(), true);
});

test('blocked resume retains pause and remains recoverable', () => {
  const h = harness(); h.open(); h.focusChange(false);
  assert.equal(h.clickResume(), false);
  assert.equal(h.gate.state, 'paused');
  assert.equal(h.paused, true);
  h.focusChange(true);
  assert.equal(h.physics, false);
  assert.equal(h.clickResume(), true);
  assert.equal(h.physics, true);
});

test('orientation and visibility do not release intentional pause', () => {
  const h = harness(); h.open();
  h.setVisible(false); h.setLandscape(false);
  assert.equal(h.clickResume(), false);
  h.setVisible(true); h.setLandscape(true);
  h.focusChange(true);
  assert.equal(h.gate.state, 'paused');
  assert.equal(h.physics, false);
  assert.equal(h.clickResume(), true);
  assert.equal(h.physics, true);
});
