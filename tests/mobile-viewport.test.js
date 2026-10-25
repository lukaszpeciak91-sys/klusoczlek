import test from 'node:test';
import assert from 'node:assert/strict';
import { logicalViewport, GAME_HEIGHT } from '../src/viewport.js';

test('viewport fills wide phones without changing vertical world scale', () => {
  assert.deepEqual(logicalViewport(960, 540), { width: 960, height: GAME_HEIGHT });
  assert.deepEqual(logicalViewport(896, 414), { width: 1169, height: GAME_HEIGHT });
  assert.deepEqual(logicalViewport(812, 375), { width: 1169, height: GAME_HEIGHT });
});

test('viewport handles invalid sizes during orientation', () => {
  assert.deepEqual(logicalViewport(0, 0), { width: 960, height: 540 });
  assert.deepEqual(logicalViewport(390, 844), { width: 250, height: 540 });
});
