import Phaser from 'phaser';
import { ArcadeScene, VW, VH, sfx, drawGlow, shade, startSession, submitScore, SessionCtx, isDailyMode, todayDateSeed, mulberry32 } from './kit';

// ── KODOK NYABRANG — Frogger-style crossing ──
// Hop across five lanes of traffic and a log-filled river into one of five
// nests before the timer runs out. Tap = hop forward, swipe = hop any way.
const HUD_H = 32, TS = 32;
const ROWS = 12; // r0 goals, r1-4 river, r5 median, r6-10 road, r11 start
const GOAL_XS = [48, 144, 240, 336, 432];
const RY = (r: number) => HUD_H + r * TS;

interface Car { x: number; w: number; lane: number; color: number }
interface Log { x: number; w: number; lane: number }
interface LaneDef { dir: number; speed: number; gap: number; carW: number; color: number }

export class HopperScene extends ArcadeScene {
  private gs = 'TITLE';
  private score = 0; private lives = 3; private level = 1;
  private frog = { x: VW / 2, row: 11 };
  private cars: Car[] = []; private logs: Log[] = [];
  private roadLanes: LaneDef[] = []; private riverLanes: { dir: number; speed: number; gap: number; logW: number }[] = [];
  private spawnT: number[] = [];
  private goals: boolean[] = [false, false, false, false, false];
  private timeLeft = 30; private maxRow = 11;
  private goalsDone = 0; private hops = 0;
  private deathT = 0; private stateT = 0;
  private startTime = 0; private sess: SessionCtx = null;
  private daily = false; private dailyDate = '';

  constructor() { super({ key: 'HopperScene' }); }

  private buildLanes() {
    // Daily challenge: seed the lane setup so every player gets the same
    // starting board for a given level today (the only structural randomness
    // in this game — everything else is deterministic movement/timers).
    const rng = this.daily ? mulberry32(todayDateSeed().seed * 37 + this.level) : Math.random;
    const sp = 1 + (this.level - 1) * 0.12;
    const CAR_COLORS = [0xff5c5c, 0xffd23f, 0x7ce3ff, 0xb45cff, 0xff9d42];
    this.roadLanes = [];
    for (let i = 0; i < 5; i++) {
      this.roadLanes.push({
        dir: i % 2 === 0 ? 1 : -1,
        speed: (62 + i * 16 + rng() * 20) * sp,
        gap: Math.max(120, 230 - this.level * 12 - i * 8),
        carW: i === 2 ? 64 : 40,
        color: CAR_COLORS[i % CAR_COLORS.length],
      });
    }
    this.riverLanes = [];
    for (let i = 0; i < 4; i++) {
      this.riverLanes.push({
        dir: i % 2 === 0 ? -1 : 1,
        speed: (42 + i * 14) * sp,
        gap: 96 + i * 14 + this.level * 6,
        logW: Math.max(64, 118 - this.level * 6 - i * 6),
      });
    }
    // pre-fill lanes so the board never starts empty
    this.cars = []; this.logs = [];
    for (let li = 0; li < 5; li++) {
      const L = this.roadLanes[li];
      for (let x = -40; x < VW + 40; x += L.carW + L.gap) this.cars.push({ x: x + rng() * 40, w: L.carW, lane: li, color: L.color });
    }
    for (let li = 0; li < 4; li++) {
      const L = this.riverLanes[li];
      for (let x = -80; x < VW + 80; x += L.logW + L.gap) this.logs.push({ x: x + rng() * 30, w: L.logW, lane: li });
    }
    this.spawnT = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  }

  private resetFrog() {
    this.frog = { x: VW / 2, row: 11 };
    // Time budget scales down with level, matching the traffic/speed scaling
    // in buildLanes() — previously the timer stayed fixed at 30s forever.
    this.timeLeft = Math.max(14, 30 - (this.level - 1) * 1.5); this.maxRow = 11;
  }

  private startGame() {
    this.score = 0; this.lives = 3; this.level = 1;
    this.goals = [false, false, false, false, false];
    this.goalsDone = 0; this.hops = 0; this.deathT = 0;
    this.daily = isDailyMode(); this.dailyDate = todayDateSeed().date;
    this.startTime = Date.now();
    startSession('road-hopper').then(s => { this.sess = s; });
    sfx.start();
    this.buildLanes();
    this.resetFrog();
    this.gs = 'PLAYING';
  }

  private gameOver() {
    this.gs = 'GAME_OVER'; this.stateT = 0;
    sfx.death();
    submitScore('road-hopper', this.score, {
      goals: this.goalsDone, level: this.level, hops: this.hops,
      durationSec: Math.floor((Date.now() - this.startTime) / 1000),
      daily: this.daily, dailyDate: this.daily ? this.dailyDate : undefined,
    }, this.sess);
  }

  private die(x?: number, y?: number) {
    if (this.deathT > 0) return;
    this.deathT = 0.9;
    sfx.hit();
    this.shake(0.25, 5);
    this.spawnParticles(x ?? this.frog.x, y ?? RY(this.frog.row) + TS / 2, 0x4bdba0, 14, 80);
  }

  private hop(dx: number, dy: number) {
    if (this.deathT > 0) return;
    const nr = this.frog.row + dy;
    if (nr < 0 || nr > 11) return;
    const nx = Math.max(12, Math.min(VW - 12, this.frog.x + dx * TS));
    // hopping INTO the goal row: must land in an empty nest
    if (nr === 0) {
      let hitSlot = -1;
      for (let i = 0; i < GOAL_XS.length; i++) if (Math.abs(GOAL_XS[i] - nx) < 22) hitSlot = i;
      // Death burst must render at the nest the frog was jumping into, not
      // its pre-hop position — frog.x/row aren't updated yet at this point.
      if (hitSlot < 0 || this.goals[hitSlot]) { this.die(nx, RY(nr) + TS / 2); return; }
      this.goals[hitSlot] = true;
      this.goalsDone++;
      const bonus = 200 + Math.ceil(this.timeLeft) * 10;
      this.score += bonus;
      sfx.coin();
      if (this.goals.every(Boolean)) {
        this.score += 1000;
        this.level++;
        this.goals = [false, false, false, false, false];
        sfx.clear();
        this.buildLanes();
      }
      this.resetFrog();
      return;
    }
    this.frog.row = nr; this.frog.x = nx; this.hops++;
    if (nr < this.maxRow) { this.maxRow = nr; this.score += 10; }
    sfx.pop();
  }

  protected tick(dt: number) {
    sfx.musicTick(this.gs === 'PLAYING', this.lives <= 1 ? 1 : 0);
    this.g.clear(); this.ui.clear(); this.bg.clear();
    for (const t of this.txts) t.setVisible(false);
    if (this.gs === 'TITLE') { this.drawSpaceBg(); this.uTitle(); }
    else if (this.gs === 'PLAYING') this.uPlay(dt);
    else if (this.gs === 'GAME_OVER') this.uGO(dt);
  }

  private uTitle() {
    this.txt(0).setOrigin(0.5, 0).setFontSize(22).setColor('#4bdba0').setText('KODOK NYABRANG').setPosition(VW / 2, VH * 0.16).setVisible(true);
    this.rFrog(this.g, VW / 2, VH * 0.34, 14);
    this.txt(1).setOrigin(0.5, 0).setFontSize(8).setColor('#93a8d9').setText('SEBRANGI JALAN RAYA & SUNGAI\nISI 5 SARANG SEBELUM WAKTU HABIS\nBONUS WAKTU TIAP SARANG!').setAlign('center').setLineSpacing(6).setPosition(VW / 2, VH * 0.46).setVisible(true);
    this.txt(2).setOrigin(0.5, 0).setFontSize(7).setColor('#5f6f9c').setText(this.isTouch ? 'TAP = LOMPAT MAJU - SWIPE = ARAH LAIN' : 'PANAH = LOMPAT').setPosition(VW / 2, VH * 0.64).setVisible(true);
    if (this.blink % 1 < 0.62) this.txt(3).setOrigin(0.5, 0).setFontSize(12).setColor('#7ce3ff').setText(this.isTouch ? 'TAP TO START' : 'PRESS ANY KEY').setPosition(VW / 2, VH * 0.78).setVisible(true);
    if (this.anyPress()) this.startGame();
  }

  private uGO(dt: number) {
    this.stateT += dt;
    this.rWorld();
    this.ui.fillStyle(0x03040c, 0.78); this.ui.fillRect(0, 0, VW, VH);
    this.txt(10).setOrigin(0.5, 0).setFontSize(24).setColor('#ff6b6b').setText('GAME OVER').setPosition(VW / 2, VH * 0.3).setVisible(true);
    this.txt(11).setOrigin(0.5, 0).setFontSize(10).setColor('#f4f8ff').setText('SCORE: ' + this.score).setPosition(VW / 2, VH * 0.46).setVisible(true);
    this.txt(12).setOrigin(0.5, 0).setFontSize(7).setColor('#93a8d9').setText('LEVEL ' + this.level + '  -  ' + this.goalsDone + ' SARANG TERISI').setPosition(VW / 2, VH * 0.55).setVisible(true);
    if (this.stateT > 1.2 && this.blink % 1 < 0.62) this.txt(13).setOrigin(0.5, 0).setFontSize(9).setColor('#7ce3ff').setText(this.isTouch ? 'TAP TO CONTINUE' : 'PRESS ANY KEY').setPosition(VW / 2, VH * 0.7).setVisible(true);
    if (this.stateT > 1.2 && this.anyPress()) this.gs = 'TITLE';
  }

  private uPlay(dt: number) {
    // input
    if (this.kp('ArrowUp') || this.swipeDir === 'up' || this.tapped) this.hop(0, -1);
    else if (this.kp('ArrowDown') || this.swipeDir === 'down') this.hop(0, 1);
    else if (this.kp('ArrowLeft') || this.swipeDir === 'left') this.hop(-1, 0);
    else if (this.kp('ArrowRight') || this.swipeDir === 'right') this.hop(1, 0);

    // death pause
    if (this.deathT > 0) {
      this.deathT -= dt;
      if (this.deathT <= 0) {
        this.lives--;
        if (this.lives <= 0) { this.gameOver(); return; }
        this.resetFrog();
      }
      this.rWorld();
      return;
    }

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.die(); }

    // move cars
    for (let li = 0; li < 5; li++) {
      const L = this.roadLanes[li];
      this.spawnT[li] -= dt;
      if (this.spawnT[li] <= 0) {
        const x = L.dir > 0 ? -L.carW - 10 : VW + 10;
        this.cars.push({ x, w: L.carW, lane: li, color: L.color });
        this.spawnT[li] = (L.carW + L.gap) / L.speed;
      }
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i], L = this.roadLanes[c.lane];
      c.x += L.dir * L.speed * dt;
      if (c.x < -c.w - 20 || c.x > VW + c.w + 20) this.cars.splice(i, 1);
    }
    // move logs
    for (let li = 0; li < 4; li++) {
      const L = this.riverLanes[li];
      this.spawnT[5 + li] -= dt;
      if (this.spawnT[5 + li] <= 0) {
        const x = L.dir > 0 ? -L.logW - 10 : VW + 10;
        this.logs.push({ x, w: L.logW, lane: li });
        this.spawnT[5 + li] = (L.logW + L.gap) / L.speed;
      }
    }
    for (let i = this.logs.length - 1; i >= 0; i--) {
      const l = this.logs[i], L = this.riverLanes[l.lane];
      l.x += L.dir * L.speed * dt;
      if (l.x < -l.w - 20 || l.x > VW + l.w + 20) this.logs.splice(i, 1);
    }

    const fr = this.frog.row;
    // road collision
    if (fr >= 6 && fr <= 10) {
      const lane = fr - 6;
      for (const c of this.cars) {
        if (c.lane !== lane) continue;
        if (this.frog.x + 10 > c.x && this.frog.x - 10 < c.x + c.w) { this.die(); break; }
      }
    }
    // river: ride a log or drown
    if (fr >= 1 && fr <= 4) {
      const lane = fr - 1;
      let onLog: Log | null = null;
      for (const l of this.logs) {
        if (l.lane !== lane) continue;
        if (this.frog.x > l.x - 4 && this.frog.x < l.x + l.w + 4) { onLog = l; break; }
      }
      if (onLog) {
        this.frog.x += this.riverLanes[lane].dir * this.riverLanes[lane].speed * dt;
        if (this.frog.x < 8 || this.frog.x > VW - 8) this.die();
      } else this.die();
    }
    this.rWorld();
  }

  private rWorld() {
    const g = this.g;
    // zones
    this.bg.fillStyle(0x0a0a18); this.bg.fillRect(0, 0, VW, VH);
    this.bg.fillStyle(0x14301c); this.bg.fillRect(0, RY(0), VW, TS);            // goal grass
    this.bg.fillStyle(0x0d2440); this.bg.fillRect(0, RY(1), VW, TS * 4);        // river
    this.bg.fillStyle(0x1c3a24); this.bg.fillRect(0, RY(5), VW, TS);            // median
    this.bg.fillStyle(0x16161f); this.bg.fillRect(0, RY(6), VW, TS * 5);        // road
    this.bg.fillStyle(0x1c3a24); this.bg.fillRect(0, RY(11), VW, TS);           // start
    // water shimmer
    for (let i = 0; i < 4; i++) {
      const y = RY(1 + i) + TS / 2 + Math.sin(this.blink * 2 + i) * 3;
      this.bg.fillStyle(0x2a5a8a, 0.35); this.bg.fillRect(0, y, VW, 2);
    }
    // road lane dashes
    this.bg.fillStyle(0xd9d9a0, 0.35);
    for (let r = 7; r <= 10; r++) for (let x = 0; x < VW; x += 42) this.bg.fillRect(x, RY(r) - 1, 20, 2);
    g.save(); g.translateCanvas(this.shakeX, this.shakeY);
    // goal nests
    for (let i = 0; i < GOAL_XS.length; i++) {
      const x = GOAL_XS[i];
      g.fillStyle(0x0a1a10); g.fillRect(x - 22, RY(0) + 3, 44, TS - 6);
      g.lineStyle(2, this.goals[i] ? 0x4bdba0 : 0x2c5a3c, 0.9); g.strokeRect(x - 22, RY(0) + 3, 44, TS - 6);
      if (this.goals[i]) this.rFrog(g, x, RY(0) + TS / 2, 9);
    }
    // logs
    for (const l of this.logs) {
      const y = RY(1 + l.lane) + 5;
      g.fillStyle(0x6a4a26); g.fillRect(l.x, y, l.w, TS - 10);
      g.fillStyle(0x8a6236); g.fillRect(l.x, y, l.w, 5);
      g.fillStyle(0x503618, 0.8);
      for (let x = l.x + 10; x < l.x + l.w - 8; x += 26) g.fillRect(x, y + 8, 3, TS - 20);
    }
    // cars
    for (const c of this.cars) {
      const y = RY(6 + c.lane) + 5;
      g.fillStyle(shade(c.color, -0.3)); g.fillRect(c.x, y + 3, c.w, TS - 13);
      g.fillStyle(c.color); g.fillRect(c.x + 2, y, c.w - 4, TS - 16);
      g.fillStyle(0xbfe8ff, 0.8);
      const L = this.roadLanes[c.lane];
      g.fillRect(L.dir > 0 ? c.x + c.w - 12 : c.x + 4, y + 3, 8, 6);
    }
    // frog
    if (this.deathT > 0) {
      if (this.blink % 0.2 < 0.1) {
        g.fillStyle(0xff5c5c, 0.8);
        g.fillCircle(this.frog.x, RY(this.frog.row) + TS / 2, 10);
      }
      this.txt(6).setOrigin(0.5, 0).setFontSize(10).setColor('#ff6b6b').setText('AWW!').setPosition(this.frog.x, RY(this.frog.row) - 14).setVisible(true);
    } else {
      this.rFrog(g, this.frog.x, RY(this.frog.row) + TS / 2, 10);
    }
    this.drawParticles(g);
    g.restore();
    // HUD
    this.ui.fillStyle(0x070716, 0.9); this.ui.fillRect(0, 0, VW, HUD_H);
    this.ui.fillStyle(0x4bdba0, 0.4); this.ui.fillRect(0, HUD_H - 2, VW, 2);
    this.txt(0).setOrigin(0, 0).setFontSize(9).setColor('#f4f8ff').setText(String(this.score).padStart(6, '0')).setPosition(10, 10).setVisible(true);
    this.txt(1).setOrigin(0.5, 0).setFontSize(7).setColor('#93a8d9').setText('LV ' + this.level).setPosition(VW / 2 - 60, 12).setVisible(true);
    if (this.daily) this.txt(19).setOrigin(0, 0).setFontSize(6).setColor('#ffd23f').setText('HARIAN').setPosition(10, 22).setVisible(true);
    // timer bar
    const tw = 110, tfrac = Math.max(0, this.timeLeft / 30);
    this.ui.fillStyle(0x03040c, 0.7); this.ui.fillRect(VW / 2 - 20, 11, tw, 8);
    this.ui.fillStyle(tfrac > 0.35 ? 0x4bdba0 : 0xff5c5c, 0.95); this.ui.fillRect(VW / 2 - 20, 11, tw * tfrac, 8);
    for (let i = 0; i < this.lives; i++) this.rFrog(this.ui, VW - 16 - i * 20, 16, 7);
  }

  private rFrog(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number) {
    drawGlow(g, x, y, r + 4, 0x4bdba0, 0.3);
    g.fillStyle(0x2e9e5b);
    g.fillCircle(x, y, r);
    g.fillCircle(x - r * 0.75, y - r * 0.55, r * 0.42);
    g.fillCircle(x + r * 0.75, y - r * 0.55, r * 0.42);
    g.fillStyle(0xffffff);
    g.fillCircle(x - r * 0.75, y - r * 0.62, r * 0.24);
    g.fillCircle(x + r * 0.75, y - r * 0.62, r * 0.24);
    g.fillStyle(0x0a2a12);
    g.fillCircle(x - r * 0.75, y - r * 0.62, r * 0.12);
    g.fillCircle(x + r * 0.75, y - r * 0.62, r * 0.12);
    g.fillStyle(0x57c983);
    g.fillCircle(x, y + r * 0.2, r * 0.55);
  }
}
