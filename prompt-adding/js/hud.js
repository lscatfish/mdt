// 2D canvas HUD: crosshair, hotbar, sun/moon disc, debug overlay. Browser-only.
import { HOTBAR_BLOCKS, FACE_TILE, TILE_PX, ATLAS_COLS } from "./config.js";

export class HUD {
  constructor(canvas, atlasCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.atlas = atlasCanvas;
    this.message = null;
    this.messageUntil = 0;
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  showMessage(text, ms = 1600) {
    this.message = text;
    this.messageUntil = performance.now() + ms;
  }

  draw(state) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    this._crosshair(ctx, w, h);
    this._hotbar(ctx, w, h, state.hotbarIndex);
    this._sunMoon(ctx, state.sunScreen, state.moonScreen, state.daylight);
    this._debug(ctx, state);
    if (this.message && performance.now() < this.messageUntil) {
      ctx.font = "bold 15px 'Segoe UI', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillText(this.message, w / 2 + 1, h - 140 + 1);
      ctx.fillStyle = "#ffe98a";
      ctx.fillText(this.message, w / 2, h - 140);
    }
  }

  _crosshair(ctx, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - 2, cy);
    ctx.moveTo(cx + 2, cy); ctx.lineTo(cx + 9, cy);
    ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy - 2);
    ctx.moveTo(cx, cy + 2); ctx.lineTo(cx, cy + 9);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.stroke();
  }

  _hotbar(ctx, w, h, index) {
    const n = HOTBAR_BLOCKS.length;
    const slot = 44;
    const gap = 4;
    const total = n * slot + (n - 1) * gap;
    const x0 = (w - total) / 2;
    const y0 = h - slot - 66;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (slot + gap);
      ctx.fillStyle = i === index ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.38)";
      ctx.fillRect(x, y0, slot, slot);
      ctx.strokeStyle = i === index ? "#ffe27a" : "rgba(255,255,255,0.35)";
      ctx.lineWidth = i === index ? 3 : 1.5;
      ctx.strokeRect(x + 1, y0 + 1, slot - 2, slot - 2);
      const block = HOTBAR_BLOCKS[i];
      const tile = FACE_TILE[block][2];
      const col = tile % ATLAS_COLS;
      const row = Math.floor(tile / ATLAS_COLS);
      ctx.globalAlpha = i === index ? 1 : 0.72;
      ctx.drawImage(this.atlas, col * TILE_PX, row * TILE_PX, TILE_PX, TILE_PX, x + 6, y0 + 6, slot - 12, slot - 12);
      ctx.globalAlpha = 1;
    }
  }

  _sunMoon(ctx, sun, moon, daylight) {
    if (daylight > 0.45) {
      if (!sun || !sun.visible) return;
      const s = sun;
      const g = ctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, 26);
      g.addColorStop(0, "rgba(255,240,170,1)");
      g.addColorStop(0.55, "rgba(255,214,110,0.9)");
      g.addColorStop(1, "rgba(255,200,90,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 26, 0, Math.PI * 2);
      ctx.fill();
    } else {
      if (!moon || !moon.visible) return;
      const m = moon;
      ctx.fillStyle = "#dfe6ee";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c3ccd8";
      ctx.beginPath();
      ctx.arc(m.x - 4, m.y - 3, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _debug(ctx, state) {
    ctx.font = "12px Consolas, 'Courier New', monospace";
    ctx.textAlign = "left";
    const lines = [
      `FPS ${state.fps.toFixed(0)}   XYZ ${state.x.toFixed(1)} ${state.y.toFixed(1)} ${state.z.toFixed(1)}`,
      `朝向 ${(state.yawDeg).toFixed(0)}° / ${(state.pitchDeg).toFixed(0)}°   区块 ${state.chunk}`,
      `目标 ${state.target}   时间 ${state.clock}`,
      `种子 ${state.seed}   ${state.flying ? "飞行模式" : state.onGround ? "地面" : "空中"}   ${state.muted ? "🔇" : "🔊"}`,
    ];
    let y = 22;
    for (const line of lines) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillText(line, 11, y + 1);
      ctx.fillStyle = "#eef2ff";
      ctx.fillText(line, 10, y);
      y += 17;
    }
  }
}
