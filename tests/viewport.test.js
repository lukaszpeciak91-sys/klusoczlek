import test from 'node:test';
import assert from 'node:assert/strict';
import { isPortrait, fitWithin } from '../src/viewport.js';

test('portrait requires a taller than wide viewport', () => {
  assert.equal(isPortrait(390, 844), true);
  assert.equal(isPortrait(844, 390), false);
  assert.equal(isPortrait(800, 800), false);
});
test('fit retains 16:9 geometry without cropping', () => {
  assert.deepEqual(fitWithin(800, 400), { width: 711.1111111111111, height: 400 });
  assert.deepEqual(fitWithin(1920, 1080), { width: 1920, height: 1080 });
  assert.deepEqual(fitWithin(0, 100), { width: 0, height: 0 });
});
