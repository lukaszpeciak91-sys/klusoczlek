import test from 'node:test';
import assert from 'node:assert/strict';
import { menuLayout, arenaHudLayout, pauseLayout } from '../src/ui-layout.js';

for (const height of [320, 360, 375, 420, 540]) {
  test('menu and pause fit short landscape height ' + height, () => {
    const width = Math.round(height * 20 / 9);
    const menu = menuLayout(width, height);
    const pause = pauseLayout(width, height);
    assert.equal(menu.centerX, width / 2);
    assert.equal(pause.centerX, width / 2);
    assert.ok(menu.titleY - menu.titleSize / 2 >= 0);
    assert.ok(menu.startY + menu.startHeight / 2 < height);
    assert.ok(pause.titleY - pause.titleSize / 2 >= 0);
    assert.ok(pause.resumeY - pause.buttonHeight / 2 >= 0);
    assert.ok(pause.exitY + pause.buttonHeight / 2 < height);
    assert.ok(pause.exitY - pause.resumeY > pause.buttonHeight);
    assert.ok(pause.resumeWidth <= width);
    assert.ok(pause.exitWidth <= width);
  });
  test('joystick is circular, reachable and clear of safe-area boundaries at ' + height, () => {
    const layout = arenaHudLayout(height, Math.round(height * 16 / 9));
    assert.equal(layout.joystickRadius * 2, 92);
    assert.ok(layout.joystickX - layout.joystickRadius >= 0);
    assert.ok(layout.joystickY + layout.joystickRadius <= height);
    assert.ok(layout.menuY > 0);
  });
}
