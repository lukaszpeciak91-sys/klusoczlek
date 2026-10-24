import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput, clampPlayer, ARENA, PLAYER_RADIUS } from '../src/movement.js';

test('eight-direction keyboard diagonals have no speed advantage', () => {
  const straight = normalizeInput(1, 0);
  const diagonal = normalizeInput(1, 1);
  assert.equal(Math.hypot(straight.x, straight.y), 1);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-12);
  assert.ok(Math.abs(diagonal.x - Math.SQRT1_2) < 1e-12);
});

test('zero and analog movement are preserved', () => {
  assert.deepEqual(normalizeInput(0, 0), { x: 0, y: 0 });
  assert.deepEqual(normalizeInput(0.3, -0.4), { x: 0.3, y: -0.4 });
});

test('player bounds include radius on every edge', () => {
  assert.deepEqual(clampPlayer(-200, 99999), {
    x: PLAYER_RADIUS, y: ARENA.height - PLAYER_RADIUS,
  });
  assert.deepEqual(clampPlayer(99999, -200), {
    x: ARENA.width - PLAYER_RADIUS, y: PLAYER_RADIUS,
  });
});
