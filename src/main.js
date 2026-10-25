import Phaser from 'phaser';
import { ArenaScene, MenuScene } from './scenes.js';
import { GAME_WIDTH, GAME_HEIGHT, setupViewport } from './viewport.js';
import './style.css';
import { toggleFullscreen } from './fullscreen.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0e101a',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  render: { pixelArt: true, antialias: false },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [MenuScene, ArenaScene],
});

setupViewport(game);

document.getElementById('fullscreen-button').addEventListener('click', () => toggleFullscreen(document.getElementById('game-shell'), () => game.scale.refresh()));
