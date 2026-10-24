import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, enforceOrientationOnSceneStart } from './viewport.js';

const COLORS = {
  background: 0x0e101a,
  panel: 0x1b2330,
  border: 0xd4aa5a,
  accent: '#f3ca76',
  white: '#f3e8d1',
};

function label(scene, x, y, value, size = 28) {
  return scene.add.text(x, y, value, {
    fontFamily: 'monospace',
    fontSize: size + 'px',
    color: COLORS.white,
    align: 'center',
  }).setOrigin(0.5);
}

function button(scene, x, y, width, height, value, onClick) {
  const background = scene.add.rectangle(x, y, width, height, COLORS.panel)
    .setStrokeStyle(3, COLORS.border).setInteractive({ useHandCursor: true });
  const caption = label(scene, x, y, value);
  background.on('pointerover', () => background.setFillStyle(0x344255));
  background.on('pointerout', () => background.setFillStyle(COLORS.panel));
  background.on('pointerdown', onClick);
  return { background, caption };
}

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.background);
    label(this, GAME_WIDTH / 2, 148, 'KŁUSOCZŁEK', 66).setColor(COLORS.accent);
    label(this, GAME_WIDTH / 2, 211, 'RETRO SURVIVAL // PROTOTYP', 21);
    button(this, GAME_WIDTH / 2, 330, 270, 82, 'START', () => this.scene.start('Arena'));
    const fullscreenButton = document.getElementById('fullscreen-button');
    fullscreenButton.hidden = false;
    this.events.once('shutdown', () => { fullscreenButton.hidden = true; });
    enforceOrientationOnSceneStart(this);
  }
}

export class ArenaScene extends Phaser.Scene {
  constructor() { super('Arena'); }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.add.rectangle(480, 270, 780, 380, 0x283c32).setStrokeStyle(5, COLORS.border);
    this.add.grid(480, 270, 776, 376, 40, 40, 0x283c32, 1, 0x415746, 0.4);
    this.add.circle(480, 270, 17, 0xf3ca76).setStrokeStyle(3, 0x111111);
    label(this, 480, 47, 'ARENA TESTOWA — BRAK ROZGRYWKI', 23);
    button(this, 116, 42, 188, 56, '← MENU', () => this.scene.start('Menu'));
    enforceOrientationOnSceneStart(this);
  }
}
