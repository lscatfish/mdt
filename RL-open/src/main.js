// 入口：连接 DOM 与游戏核心。
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);

const dom = {
  canvas: $('game-canvas'),
  menu: $('menu'),
  paused: $('paused'),
  hud: $('hud'),
  hotbar: $('hotbar'),
  info: $('info'),
  notice: $('notice'),
  loadingWrap: $('loading-wrap'),
  loadingFill: $('loading-fill'),
  loadingLabel: $('loading-label'),
  seedInput: $('seed-input'),
  startBtn: $('start-btn'),
  saveBtn: $('save-btn'),
  resumeBtn: $('resume-btn')
};

const game = new Game(dom.canvas, dom);

// 调试 / 测试用全局句柄
window.webcraft = game;

dom.startBtn.addEventListener('click', () => {
  game.begin(dom.seedInput.value);
});

dom.resumeBtn.addEventListener('click', () => {
  dom.paused.classList.add('hidden');
  game.requestLock();
});

dom.saveBtn.addEventListener('click', () => {
  game.saveNow();
});

dom.seedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') game.begin(dom.seedInput.value);
});
