import test from 'node:test';
import assert from 'node:assert/strict';
import { createPauseGate } from '../src/pause.js';

test('pause resumes the same session and can pause again', () => {
  const gate = createPauseGate();
  assert.equal(gate.open(), true);
  assert.equal(gate.open(), false);
  assert.equal(gate.resume(), true);
  assert.equal(gate.resume(), false);
  assert.equal(gate.open(), true);
});

test('exit is terminal for this session and cannot transition twice', () => {
  const gate = createPauseGate();
  assert.equal(gate.exit(), false);
  assert.equal(gate.open(), true);
  assert.equal(gate.exit(), true);
  assert.equal(gate.exit(), false);
  assert.equal(gate.resume(), false);
  assert.equal(gate.open(), false);
});
