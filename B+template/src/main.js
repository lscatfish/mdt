// 入口
import * as THREE from '../vendor/three.module.js';
import { Game } from './game.js';

window.__THREE = THREE; // 便于调试与自动化测试

const params = new URLSearchParams(location.search);
const seed = params.has('seed') ? (parseInt(params.get('seed'), 10) || 0) : undefined;

const root = document.getElementById('game-root');
const game = new Game(root, { seed });

try {
  game.init();
  game.start();
  window.__game = game; // 便于调试与自动化测试
} catch (err) {
  console.error(err);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0b1020;color:#fff;font-family:monospace;padding:40px;white-space:pre-wrap;z-index:99';
  box.textContent = '启动失败：\n' + (err && err.stack ? err.stack : String(err));
  document.body.appendChild(box);
}
