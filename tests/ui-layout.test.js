import test from 'node:test';
import assert from 'node:assert/strict';
import { menuLayout, arenaHudLayout, pauseLayout } from '../src/ui-layout.js';

test('main menu and pause controls always use current viewport center', () => {
  for (const width of [960, 1169, 1440, 800, 250]) {
    assert.equal(menuLayout(width).centerX, width / 2);
    assert.equal(pauseLayout(width).centerX, width / 2);
  }
});
test('HUD and joystick track safe-area-adjusted logical viewport height', () => {
  for (const height of [540, 600, 420]) {
    const layout = arenaHudLayout(height);
    assert.equal(layout.menuX, 105);
    assert.equal(layout.menuY, 40);
    assert.equal(layout.joystickX, 110);
    assert.equal(height - layout.joystickY, 115);
  }
});
