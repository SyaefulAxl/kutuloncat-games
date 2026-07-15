import Phaser from 'phaser';
import { ArcadeScene, VW, VH, sfx, drawGlow, shade, startSession, submitScore, SessionCtx, isDailyMode, todayDateSeed, mulberry32 } from './kit';

// ── WARAN INGKANG KAPUNDUT — Frogger-style crossing ──
// Hop across five lanes of traffic and a log-filled river into one of five
// pens before the timer runs out. Tap = hop forward, swipe = hop any way.
const HUD_H = 32, TS = 32;
const ROWS = 12; // r0 goals, r1-4 river, r5 median, r6-10 road, r11 start
const GOAL_XS = [48, 144, 240, 336, 432];
const RY = (r: number) => HUD_H + r * TS;

interface Car { x: number; w: number; lane: number; color: number }
interface Log { x: number; w: number; lane: number }
// One river lane rides on diving turtles instead of logs — they periodically
// submerge on a shared cycle, so standing there needs real timing instead of
// always being a safe ride (previously every river lane was equally safe).
const TURTLE_LANE = 1;
interface LaneDef { dir: number; speed: number; gap: number; carW: number; color: number }

// Predator gator — a hazard that hunts the pig through the river from
// level 3 onward, grabbing it even while it's safely riding a log.
const GATOR_FROM_LEVEL = 3;
interface Gator { x: number; lane: number; dir: number; nextAt: number }

// Storm — a timed event that speeds up all traffic/current for a stretch,
// starting level 2, with a telegraph before it hits.
const STORM_FROM_LEVEL = 2;
const STORM_EVERY_S = 22;
const STORM_DURATION_S = 5;
const STORM_WARN_S = 2;

// Collectible bonus bug — appears on the median strip periodically, worth
// points + a little time back if the pig reaches it.
interface BonusBug { x: number; t: number }

// Silly generic chatter — never directed at anyone, just farm/food humor,
// pops up in a speech bubble every so often to keep the pig feeling alive.
const PIG_LINES = ['LAPER NIH!', 'KUBIS ENAK!', 'NGUPIL DULU AH', 'AWAS KLAKSON!', 'BECEK BANGET', 'KANDANG MANA YA?', 'HAMPIR NYAMPE!', 'ADUH KAGET!'];
const PIG_NEST_LINES = ['ASIK SAMPE!', 'ENAK NIH KANDANG!', 'HORE!', 'PULANG DULU AH'];

export class HopperScene extends ArcadeScene {
  private gs = 'TITLE';
  private score = 0; private lives = 3; private level = 1;
  private pig = { x: VW / 2, row: 11 };
  private cars: Car[] = []; private logs: Log[] = [];
  private roadLanes: LaneDef[] = []; private riverLanes: { dir: number; speed: number; gap: number; logW: number }[] = [];
  private spawnT: number[] = [];
  private goals: boolean[] = [false, false, false, false, false];
  private timeLeft = 30; private maxRow = 11;
  private goalsDone = 0; private hops = 0;
  private deathT = 0; private stateT = 0;
  private startTime = 0; private sess: SessionCtx = null;
  private daily = false; private dailyDate = '';
  private gator: Gator | null = null; private gatorSpawnT = 8;
  private stormT = 0; private nextStormAt = STORM_EVERY_S;
  private bonusBug: BonusBug | null = null; private nextBugAt = 8;
  private dialogueText = ''; private dialogueT = 0; private nextDialogueAt = 6;

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
    this.gator = null; this.gatorSpawnT = 8 + Math.random() * 6;
    this.stormT = 0; this.nextStormAt = STORM_EVERY_S;
    this.bonusBug = null; this.nextBugAt = 8;
  }

  private resetPig() {
    this.pig = { x: VW / 2, row: 11 };
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
    this.resetPig();
    this.dialogueText = ''; this.dialogueT = 0; this.nextDialogueAt = 5 + Math.random() * 4;
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

  private turtlesSubmerged(): boolean {
    return Math.sin(this.blink * 1.3) > 0.2;
  }

  private die(x?: number, y?: number) {
    if (this.deathT > 0) return;
    this.deathT = 0.9;
    sfx.hit();
    this.shake(0.25, 5);
    this.spawnParticles(x ?? this.pig.x, y ?? RY(this.pig.row) + TS / 2, 0xff9ec4, 14, 80);
  }

  private hop(dx: number, dy: number) {
    if (this.deathT > 0) return;
    const nr = this.pig.row + dy;
    if (nr < 0 || nr > 11) return;
    const nx = Math.max(12, Math.min(VW - 12, this.pig.x + dx * TS));
    // hopping INTO the goal row: must land in an empty pen
    if (nr === 0) {
      let hitSlot = -1;
      for (let i = 0; i < GOAL_XS.length; i++) if (Math.abs(GOAL_XS[i] - nx) < 22) hitSlot = i;
      // Death burst must render at the pen the pig was jumping into, not
      // its pre-hop position — pig.x/row aren't updated yet at this point.
      if (hitSlot < 0 || this.goals[hitSlot]) { this.die(nx, RY(nr) + TS / 2); return; }
      this.goals[hitSlot] = true;
      this.goalsDone++;
      const bonus = 200 + Math.ceil(this.timeLeft) * 10;
      this.score += bonus;
      sfx.coin();
      this.dialogueText = PIG_NEST_LINES[Math.floor(Math.random() * PIG_NEST_LINES.length)];
      this.dialogueT = 1.4;
      if (this.goals.every(Boolean)) {
        this.score += 1000;
        this.level++;
        this.goals = [false, false, false, false, false];
        sfx.clear();
        this.buildLanes();
      }
      this.resetPig();
      return;
    }
    this.pig.row = nr; this.pig.x = nx; this.hops++;
    if (nr < this.maxRow) { this.maxRow = nr; this.score += 10; }
    sfx.pop();
  }

  protected tick(dt: number) {
    sfx.musicTick(this.gs === 'PLAYING', this.lives <= 1 ? 1 : 0, 'hopper');
    this.g.clear(); this.ui.clear(); this.bg.clear();
    for (const t of this.txts) t.setVisible(false);
    if (this.gs === 'TITLE') { this.drawSpaceBg(); this.uTitle(); }
    else if (this.gs === 'PLAYING') this.uPlay(dt);
    else if (this.gs === 'GAME_OVER') this.uGO(dt);
  }

  private uTitle() {
    this.txt(0).setOrigin(0.5, 0).setFontSize(16).setColor('#ff9ec4').setText('WARAN INGKANG\nKAPUNDUT').setAlign('center').setLineSpacing(4).setPosition(VW / 2, VH * 0.14).setVisible(true);
    this.rPig(this.g, VW / 2, VH * 0.36, 14);
    this.txt(1).setOrigin(0.5, 0).setFontSize(8).setColor('#93a8d9').setText('SEBRANGI JALAN & SUNGAI\nRAYU 5 PEREMPUAN CANTIK\nSEBELUM WAKTU HABIS!').setAlign('center').setLineSpacing(6).setPosition(VW / 2, VH * 0.50).setVisible(true);
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
    this.txt(12).setOrigin(0.5, 0).setFontSize(7).setColor('#93a8d9').setText('LEVEL ' + this.level + '  -  ' + this.goalsDone + ' KANDANG TERISI').setPosition(VW / 2, VH * 0.55).setVisible(true);
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
        this.resetPig();
      }
      this.rWorld();
      return;
    }

    // idle chatter — generic silly pig one-liners, never directed at anyone
    if (this.dialogueT > 0) this.dialogueT -= dt;
    else {
      this.nextDialogueAt -= dt;
      if (this.nextDialogueAt <= 0) {
        this.dialogueText = PIG_LINES[Math.floor(Math.random() * PIG_LINES.length)];
        this.dialogueT = 1.6;
        this.nextDialogueAt = 9 + Math.random() * 7;
      }
    }

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.die(); }

    // storm — periodic timed event that speeds everything up for a stretch
    let stormMult = 1;
    if (this.level >= STORM_FROM_LEVEL) {
      this.stormT += dt;
      const inStorm = this.stormT >= this.nextStormAt && this.stormT < this.nextStormAt + STORM_DURATION_S;
      if (inStorm) stormMult = 1.6;
      if (this.stormT >= this.nextStormAt + STORM_DURATION_S) this.nextStormAt = this.stormT + STORM_EVERY_S;
    }

    // move cars
    for (let li = 0; li < 5; li++) {
      const L = this.roadLanes[li];
      this.spawnT[li] -= dt;
      if (this.spawnT[li] <= 0) {
        const x = L.dir > 0 ? -L.carW - 10 : VW + 10;
        this.cars.push({ x, w: L.carW, lane: li, color: L.color });
        this.spawnT[li] = (L.carW + L.gap) / (L.speed * stormMult);
      }
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i], L = this.roadLanes[c.lane];
      c.x += L.dir * L.speed * stormMult * dt;
      if (c.x < -c.w - 20 || c.x > VW + c.w + 20) this.cars.splice(i, 1);
    }
    // move logs
    for (let li = 0; li < 4; li++) {
      const L = this.riverLanes[li];
      this.spawnT[5 + li] -= dt;
      if (this.spawnT[5 + li] <= 0) {
        const x = L.dir > 0 ? -L.logW - 10 : VW + 10;
        this.logs.push({ x, w: L.logW, lane: li });
        this.spawnT[5 + li] = (L.logW + L.gap) / (L.speed * stormMult);
      }
    }
    for (let i = this.logs.length - 1; i >= 0; i--) {
      const l = this.logs[i], L = this.riverLanes[l.lane];
      l.x += L.dir * L.speed * stormMult * dt;
      if (l.x < -l.w - 20 || l.x > VW + l.w + 20) this.logs.splice(i, 1);
    }

    // predator gator — hunts through the river, grabs the pig even off a log
    if (this.level >= GATOR_FROM_LEVEL) {
      if (this.gator) {
        const gt = this.gator;
        gt.x += gt.dir * (70 + this.level * 4) * stormMult * dt;
        // weak homing pull toward the pig's x while in range
        if (this.pig.row >= 1 && this.pig.row <= 4) gt.x += Math.sign(this.pig.x - gt.x) * 18 * dt;
        if (gt.x < -30 || gt.x > VW + 30) this.gator = null;
      } else {
        this.gatorSpawnT -= dt;
        if (this.gatorSpawnT <= 0) {
          const lane = Math.floor(Math.random() * 4);
          const dir = Math.random() < 0.5 ? 1 : -1;
          this.gator = { x: dir > 0 ? -30 : VW + 30, lane, dir, nextAt: 0 };
          this.gatorSpawnT = 9 + Math.random() * 7;
        }
      }
    }

    // collectible bonus bug — spawns on the median strip
    if (!this.bonusBug) {
      this.nextBugAt -= dt;
      if (this.nextBugAt <= 0) {
        this.bonusBug = { x: 24 + Math.random() * (VW - 48), t: 8 };
        this.nextBugAt = 14 + Math.random() * 8;
      }
    } else {
      this.bonusBug.t -= dt;
      if (this.bonusBug.t <= 0) this.bonusBug = null;
    }

    const fr = this.pig.row;
    // road collision
    if (fr >= 6 && fr <= 10) {
      const lane = fr - 6;
      for (const c of this.cars) {
        if (c.lane !== lane) continue;
        if (this.pig.x + 10 > c.x && this.pig.x - 10 < c.x + c.w) { this.die(); break; }
      }
    }
    // river: ride a log or drown
    if (fr >= 1 && fr <= 4) {
      const lane = fr - 1;
      let onLog: Log | null = null;
      const submerged = lane === TURTLE_LANE && this.turtlesSubmerged();
      if (!submerged) for (const l of this.logs) {
        if (l.lane !== lane) continue;
        if (this.pig.x > l.x - 4 && this.pig.x < l.x + l.w + 4) { onLog = l; break; }
      }
      if (onLog) {
        this.pig.x += this.riverLanes[lane].dir * this.riverLanes[lane].speed * stormMult * dt;
        if (this.pig.x < 8 || this.pig.x > VW - 8) this.die();
      } else this.die();
      // predator gator grabs the pig even while safely on a log
      if (this.gator && this.gator.lane === lane && Math.abs(this.gator.x - this.pig.x) < 18) {
        this.die();
      }
    }
    // collectible bonus bug — sits on the median strip
    if (fr === 5 && this.bonusBug && Math.abs(this.bonusBug.x - this.pig.x) < 16) {
      this.score += 150;
      this.timeLeft = Math.min(this.timeLeft + 4, 30);
      sfx.coin();
      this.spawnParticles(this.bonusBug.x, RY(5) + TS / 2, 0xffd23f, 10, 70);
      this.bonusBug = null;
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
    // goal pens
    for (let i = 0; i < GOAL_XS.length; i++) {
      const x = GOAL_XS[i];
      g.fillStyle(0x2a1c10); g.fillRect(x - 22, RY(0) + 3, 44, TS - 6);
      g.lineStyle(2, this.goals[i] ? 0xffb84d : 0x5a3c22, 0.9); g.strokeRect(x - 22, RY(0) + 3, 44, TS - 6);
      if (this.goals[i]) this.rPig(g, x, RY(0) + TS / 2, 9);
    }
    // logs (and diving turtles on TURTLE_LANE)
    const submerged = this.turtlesSubmerged();
    for (const l of this.logs) {
      const y = RY(1 + l.lane) + 5;
      if (l.lane === TURTLE_LANE) {
        const a = submerged ? 0.35 : 1;
        g.fillStyle(0x2e7d4f, a); g.fillRect(l.x, y + (submerged ? 6 : 0), l.w, TS - 10 - (submerged ? 6 : 0));
        g.fillStyle(0x4bb374, a);
        for (let x = l.x + 8; x < l.x + l.w - 6; x += 22) g.fillCircle(x, y + 6, 6);
        if (submerged) { g.fillStyle(0x9fd9ff, 0.4); g.fillRect(l.x, y - 1, l.w, 2); }
        continue;
      }
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
    // predator gator
    if (this.gator) {
      const gt = this.gator;
      const y = RY(1 + gt.lane) + TS / 2;
      g.fillStyle(0x1c3a1c, 0.9);
      g.fillEllipse(gt.x, y, 30, 12);
      g.fillStyle(0x0a1a0a);
      g.fillCircle(gt.x + gt.dir * 14, y - 3, 3.5); g.fillCircle(gt.x + gt.dir * 20, y - 3, 3.5);
      g.fillStyle(0xff5c2b, 0.8 + Math.sin(this.blink * 8) * 0.2);
      g.fillCircle(gt.x + gt.dir * 14, y - 3, 1.3); g.fillCircle(gt.x + gt.dir * 20, y - 3, 1.3);
    }
    // collectible bonus bug — flashes when about to expire
    if (this.bonusBug) {
      const bb = this.bonusBug;
      const y = RY(5) + TS / 2 + Math.sin(this.blink * 6) * 3;
      const flashing = bb.t < 2.5 && this.blink % 0.3 < 0.15;
      if (!flashing) {
        drawGlow(g, bb.x, y, 10, 0xffd23f, 0.5);
        g.fillStyle(0xffd23f); g.fillCircle(bb.x, y, 5);
        g.fillStyle(0x1a1a2e, 0.8);
        g.fillRect(bb.x - 5, y - 1, 3, 1.5); g.fillRect(bb.x + 2, y - 1, 3, 1.5);
      }
    }
    // pig
    if (this.deathT > 0) {
      if (this.blink % 0.2 < 0.1) {
        g.fillStyle(0xff5c5c, 0.8);
        g.fillCircle(this.pig.x, RY(this.pig.row) + TS / 2, 10);
      }
      this.txt(6).setOrigin(0.5, 0).setFontSize(10).setColor('#ff6b6b').setText('OINK!').setPosition(this.pig.x, RY(this.pig.row) - 14).setVisible(true);
    } else {
      this.rPig(g, this.pig.x, RY(this.pig.row) + TS / 2, 10);
    }
    this.drawParticles(g);
    g.restore();
    // chatter bubble — generic silly one-liner, follows the pig
    if (this.dialogueT > 0 && this.deathT <= 0) {
      const dx = this.pig.x, dy = RY(this.pig.row) - 12;
      const bw = this.dialogueText.length * 5.2 + 10;
      this.ui.fillStyle(0xffffff, 0.92);
      this.ui.fillRoundedRect(dx - bw / 2, dy - 12, bw, 14, 4);
      this.ui.fillTriangle(dx - 4, dy + 2, dx + 4, dy + 2, dx, dy + 8);
      this.txt(21).setOrigin(0.5, 0.5).setFontSize(6).setColor('#1a1420').setText(this.dialogueText).setPosition(dx, dy - 5).setVisible(true);
    }
    // storm — warning telegraph then rain overlay while active
    const sinceStorm = this.stormT - this.nextStormAt;
    const stormWarn = this.level >= STORM_FROM_LEVEL && sinceStorm >= -STORM_WARN_S && sinceStorm < 0;
    const stormActive = this.level >= STORM_FROM_LEVEL && sinceStorm >= 0 && sinceStorm < STORM_DURATION_S;
    if (stormActive) {
      this.ui.fillStyle(0x1a2a4a, 0.15); this.ui.fillRect(0, HUD_H, VW, VH - HUD_H);
      for (let i = 0; i < 18; i++) {
        const rx = (i * 53 + this.blink * 300) % VW;
        const ry = HUD_H + ((i * 71 + this.blink * 500) % (VH - HUD_H));
        this.ui.lineStyle(1, 0x9fd9ff, 0.35);
        this.ui.beginPath(); this.ui.moveTo(rx, ry); this.ui.lineTo(rx - 4, ry + 10); this.ui.strokePath();
      }
    }
    if (stormWarn && this.blink % 0.4 < 0.22) {
      this.txt(20).setOrigin(0.5, 0).setFontSize(9).setColor('#7ce3ff').setText('⚠ BADAI DATANG').setPosition(VW / 2, HUD_H + 6).setVisible(true);
    }
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
    for (let i = 0; i < this.lives; i++) this.rPig(this.ui, VW - 16 - i * 20, 16, 7);
  }

  private rPig(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number) {
    drawGlow(g, x, y, r + 4, 0xff9ec4, 0.3);
    // ears
    g.fillStyle(0xff7fb0);
    g.fillTriangle(x - r * 0.9, y - r * 0.6, x - r * 0.3, y - r * 1.15, x - r * 0.05, y - r * 0.5);
    g.fillTriangle(x + r * 0.9, y - r * 0.6, x + r * 0.3, y - r * 1.15, x + r * 0.05, y - r * 0.5);
    // body
    g.fillStyle(0xff9ec4);
    g.fillCircle(x, y, r);
    // eyes
    g.fillStyle(0x1a1420);
    g.fillCircle(x - r * 0.4, y - r * 0.15, r * 0.13);
    g.fillCircle(x + r * 0.4, y - r * 0.15, r * 0.13);
    // snout
    g.fillStyle(0xffc2dd);
    g.fillEllipse(x, y + r * 0.35, r * 0.9, r * 0.6);
    g.fillStyle(0x7a2e4d);
    g.fillCircle(x - r * 0.22, y + r * 0.35, r * 0.11);
    g.fillCircle(x + r * 0.22, y + r * 0.35, r * 0.11);
  }
}
