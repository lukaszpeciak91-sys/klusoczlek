import test from 'node:test';
import assert from 'node:assert/strict';
import { logicalViewport, viewportMapping, GAME_WIDTH, GAME_HEIGHT } from '../src/viewport.js';

test('landscape 16:9, 20:9, 21:9 and ultrawide use actual safe parent geometry', () => {
  for (const [width, height] of [[960, 540], [800, 360], [840, 360], [1000, 360], [812, 375]]) {
    const viewport = logicalViewport(width, height);
    assert.deepEqual(viewport, { width, height });
    const mapping = viewportMapping(viewport.width, viewport.height, width, height);
    assert.equal(mapping.scaleX, 1);
    assert.equal(mapping.scaleY, 1);
    assert.equal(mapping.x, width / 2);
    assert.equal(mapping.y, height / 2);
  }
});

test('safe-area and fullscreen changes use measured parent dimensions, not window dimensions', () => {
  assert.deepEqual(logicalViewport(820, 360), { width: 820, height: 360 });
  assert.deepEqual(logicalViewport(910, 390), { width: 910, height: 390 });
});

test('zero dimensions at rotation yield a safe initial fallback', () => {
  assert.deepEqual(logicalViewport(0, 0), { width: GAME_WIDTH, height: GAME_HEIGHT });
});

test('nonuniform display mapping is detectable as a regression', () => {
  const mapping = viewportMapping(960, 540, 960, 400);
  assert.notEqual(mapping.scaleX, mapping.scaleY);
});
