import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrientationController } from '../src/viewport.js';

function fixture(initialPortrait) {
  let portrait = initialPortrait;
  const scenes = [];
  const controller = createOrientationController({
    portrait: () => portrait,
    activeScenes: () => scenes.filter(scene => scene.running),
    isPaused: scene => scene.paused,
    pause: scene => { scene.paused = true; scene.pauseCount++; },
    resume: scene => { scene.paused = false; scene.resumeCount++; },
  });
  function start() {
    const scene = { running: true, paused: false, pauseCount: 0, resumeCount: 0 };
    scenes.push(scene);
    controller.sync(scene);
    return scene;
  }
  return { controller, start, setPortrait: value => { portrait = value; controller.sync(); } };
}

test('initial portrait pauses a scene that starts after initial sync', () => {
  const x = fixture(true);
  x.controller.sync();
  const menu = x.start();
  assert.equal(menu.paused, true);
  assert.equal(menu.pauseCount, 1);
});

test('landscape recovers the paused scene exactly once', () => {
  const x = fixture(true);
  const scene = x.start();
  x.setPortrait(false);
  x.setPortrait(false);
  assert.equal(scene.paused, false);
  assert.equal(scene.resumeCount, 1);
});

test('new scenes and transitions during portrait cannot advance', () => {
  const x = fixture(false);
  const menu = x.start();
  x.setPortrait(true);
  const arena = x.start();
  assert.equal(menu.paused, true);
  assert.equal(arena.paused, true);
  x.setPortrait(false);
  assert.equal(menu.paused, false);
  assert.equal(arena.paused, false);
});

test('landscape scene is not spuriously resumed', () => {
  const x = fixture(false);
  const scene = x.start();
  x.setPortrait(false);
  assert.equal(scene.resumeCount, 0);
});
