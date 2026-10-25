import Phaser from 'phaser';
import { ARENA, PLAYER_SPEED, normalizeInput } from './movement.js';
import { createPlayer } from './player.js';
import { createJoystick } from './joystick.js';
import { createPauseGate, requestArenaResume, synchronizeArenaResume } from './pause.js';
import { menuLayout, arenaHudLayout, pauseLayout } from './ui-layout.js';
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
    const initial = menuLayout(this.scale.width, this.scale.height);
    const title = label(this, initial.centerX, initial.titleY, 'KŁUSOCZŁEK', initial.titleSize).setColor(COLORS.accent);
    const subtitle = label(this, initial.centerX, initial.subtitleY, 'RETRO SURVIVAL // PROTOTYP', initial.subtitleSize);
    const start = button(this, initial.centerX, initial.startY, initial.startWidth, initial.startHeight, 'START', () => this.scene.start('Arena'));
    const resize = () => {
      const layout = menuLayout(this.scale.width, this.scale.height);
      title.setPosition(layout.centerX, layout.titleY).setFontSize(layout.titleSize);
      subtitle.setPosition(layout.centerX, layout.subtitleY).setFontSize(layout.subtitleSize);
      start.background.setPosition(layout.centerX, layout.startY).setSize(layout.startWidth, layout.startHeight);
      start.caption.setPosition(layout.centerX, layout.startY);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, resize));
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
    this.physics.world.setBounds(0, 0, ARENA.width, ARENA.height);
    this.add.rectangle(ARENA.width / 2, ARENA.height / 2,
      ARENA.width, ARENA.height, 0x283c32).setStrokeStyle(6, COLORS.border);
    this.add.grid(ARENA.width / 2, ARENA.height / 2,
      ARENA.width - 8, ARENA.height - 8, 50, 50,
      0x283c32, 1, 0x415746, 0.36);
    this.player = createPlayer(this, ARENA.width / 2, ARENA.height / 2);
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.pauseGate = createPauseGate();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.joystick = createJoystick(this);
    const hud = arenaHudLayout(this.scale.height, this.scale.width);
    const menuButton = this.add.rectangle(hud.menuX, hud.menuY, 185, 58, COLORS.panel)
      .setStrokeStyle(3, COLORS.border).setScrollFactor(0).setDepth(60)
      .setInteractive({ useHandCursor: true });
    const menuLabel = this.add.text(hud.menuX, hud.menuY, 'MENU', {
      fontFamily: 'monospace', fontSize: '25px', color: COLORS.white,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(61);
    menuButton.on('pointerdown', () => this.openPause());
    const resizeHud = () => {
      const pos = arenaHudLayout(this.scale.height, this.scale.width);
      menuButton.setPosition(pos.menuX, pos.menuY);
      menuLabel.setPosition(pos.menuX, pos.menuY);
      this.joystick.reposition(pos.joystickX, pos.joystickY);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, resizeHud);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scale.Events.RESIZE, resizeHud));

    this.resetMovement = () => {
      this.player.body.setVelocity(0, 0);
      this.joystick.reset();
      this.input.keyboard.resetKeys();
    };
    this.onBlur = () => { this.resetMovement(); this.physics.world.pause(); };
    this.canResume = () => !document.hidden && document.hasFocus() && window.innerWidth >= window.innerHeight;
    this.onFocus = () => {
      if (this.canResume() && !this.scene.isPaused('Arena') && this.pauseGate.state === 'playing') {
        this.physics.world.resume();
      }
    };
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      synchronizeArenaResume({
        gate: this.pauseGate,
        canResume: this.canResume,
        resumePhysics: () => this.physics.world.resume(),
        pausePhysics: () => this.physics.world.pause(),
      });
    });
    this.onVisibility = () => {
      if (document.hidden) this.onBlur();
      else this.onFocus();
    };
    this.onResize = () => {
      if (window.innerHeight > window.innerWidth) this.onBlur();
      else this.onFocus();
    };
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.resetMovement();
      this.physics.world.resume();
      window.removeEventListener('blur', this.onBlur);
      window.removeEventListener('focus', this.onFocus);
      window.removeEventListener('resize', this.onResize);
      document.removeEventListener('visibilitychange', this.onVisibility);
    });
    enforceOrientationOnSceneStart(this);
    this.onResize();
  }

  openPause() {
    if (!this.pauseGate.open()) return;
    this.resetMovement();
    this.scene.launch('Pause');
    this.scene.pause();
  }

  update() {
    if (document.hidden || window.innerHeight > window.innerWidth) {
      this.player.body.setVelocity(0, 0);
      return;
    }
    const keys = this.keys;
    const x = Number(keys.D.isDown || keys.RIGHT.isDown) -
      Number(keys.A.isDown || keys.LEFT.isDown);
    const y = Number(keys.S.isDown || keys.DOWN.isDown) -
      Number(keys.W.isDown || keys.UP.isDown);
    const direction = normalizeInput(
      x || this.joystick.direction.x,
      y || this.joystick.direction.y,
    );
    this.player.body.setVelocity(direction.x * PLAYER_SPEED, direction.y * PLAYER_SPEED);
  }
}

export class PauseScene extends Phaser.Scene {
  constructor() { super('Pause'); }

  create() {
    const initial = pauseLayout(this.scale.width, this.scale.height);
    this.cameras.main.setBackgroundColor('rgba(14,16,26,0.92)');
    const heading = label(this, initial.centerX, initial.titleY, 'PAUZA', initial.titleSize).setColor(COLORS.accent);
    const resumeButton = button(this, initial.centerX, initial.resumeY, initial.resumeWidth, initial.buttonHeight, 'WZNÓW', () => {
      const arena = this.scene.get('Arena');
      if (!requestArenaResume({
        gate: arena.pauseGate,
        canResume: arena.canResume,
        isPaused: () => this.scene.isPaused('Arena'),
        resumeScene: () => this.scene.resume('Arena'),
      })) return;
      arena.resetMovement();
      this.scene.stop();
    });
    const exitButton = button(this, initial.centerX, initial.exitY, initial.exitWidth, initial.buttonHeight, 'MENU GŁÓWNE', () => {
      const arena = this.scene.get('Arena');
      if (!arena.pauseGate.exit()) return;
      arena.resetMovement();
      this.scene.stop('Arena');
      this.scene.start('Menu');
    });
    const resize = () => {
      const layout = pauseLayout(this.scale.width, this.scale.height);
      heading.setPosition(layout.centerX, layout.titleY).setFontSize(layout.titleSize);
      for (const [control, y, width] of [
        [resumeButton, layout.resumeY, layout.resumeWidth],
        [exitButton, layout.exitY, layout.exitWidth],
      ]) {
        control.background.setPosition(layout.centerX, y).setSize(width, layout.buttonHeight);
        control.caption.setPosition(layout.centerX, y);
      }
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, resize));
    enforceOrientationOnSceneStart(this);
  }
}
