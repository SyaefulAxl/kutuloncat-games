import Phaser from 'phaser';
import { ArcadeScene, VW, VH, sfx, drawGlow, shade, startSession, submitScore, SessionCtx, isDailyMode, todayDateSeed, mulberry32 } from './kit';

// ── BABI INGKANG KAPUNDUT — Frogger-style crossing ──
// The Esteemed Pig crosses five lanes of traffic and a river filled with
// current, dodging cars, gators, and storms to woo the spread ladies waiting
// in 5 pens. Pick up hearts for power-ups, use pickup lines, score big.
const HUD_H = 32, TS = 32;
const ROWS = 12; // r0 goals, r1-4 river, r5 median, r6-10 road, r11 start
const GOAL_XS = [48, 144, 240, 336, 432];
const RY = (r: number) => HUD_H + r * TS;

interface Car { x: number; w: number; lane: number; color: number }
interface Log { x: number; w: number; lane: number }
const TURTLE_LANE = 1;
interface LaneDef { dir: number; speed: number; gap: number; carW: number; color: number }

const GATOR_FROM_LEVEL = 3;
interface Gator { x: number; lane: number; dir: number; nextAt: number }

const STORM_FROM_LEVEL = 2;
const STORM_EVERY_S = 22;
const STORM_DURATION_S = 5;
const STORM_WARN_S = 2;

// ── Power-up types ──
type PowerType = 'shield' | 'freeze' | 'double' | 'time';
interface PowerUp { x: number; t: number; type: PowerType }
const POWER_COLORS: Record<PowerType, number> = { shield: 0xff6b9d, freeze: 0x6bd4ff, double: 0xffd700, time: 0x6bff8c };
const POWER_SYMBOLS: Record<PowerType, string> = { shield: '❤', freeze: '❄', double: '✧', time: '⏰' };

// ── Rayuan — flirtatious pickup lines ──
const RAYUAN_LINES = [
  'HI CANTIK!', 'AKU PUNYA KEBON CABE LO', 'MINTA NOMOR WA DONG',
  'SENYUM DONG SAYANG', 'KAMU CANTIK BANGET', 'JOMBLO NIH?',
  'PINJEM DUIT?', 'BIDADARI DARI SURGA?',
  'AKU SUKA SAMA KAMU', 'MAU JADI PACARKU?', 'CINTA ITU BUTA NIH',
  'KAMU TUH KAYAK BENSIN', 'BIKIN HATI IRIT MELAJU',
  'KAMU KAYAK TV', 'SINYALNYA SAMPE HATI',
  'APA KAMU KOPI?', 'SOALNYA BIKIN GAK TIDUR',
  'KAMU MATAHARI?', 'KALO GAK ADA KAMU GELAP GINI',
  'INI DOMPET HILANG', 'SOALNYA HATI AKU UDAH JATUH',
  'POSESIF BOLEH?', 'SOALNYA AKU CEMAS KAMU DIREBUT',
  'KAMU BENSIN?', 'SOALNYA BIKIN HATI BERKOBAR',
  'AKU LELAH', 'SOALNYA BERJUTA JAUH DARI KAMU',
  'KAMU KUNCI?', 'SOALNYA BIKIN HATI TERKUNCI',
  'AKU BURUNG', 'PANTES SUARANYA MERDU DI TELINGA',
  'KAMU TUH BAHAYA', 'SOALNYA BIKIN KECANDUAN',
  'KAMU ES KRIM?', 'SOALNYA BIKIN HATI DINGIN TERUS LEMBUT',
  'KAMU INTERNET?', 'SOALNYA GAK BISA JAUH DARI KAMU',
  'KAMU TUH PAHIT', 'TAPI KAMU OBAT BUAT AKU',
];
const RAYUAN_WIN_LINES = [
  'AKU DIAM-DIAM CINTA SAMA KAMU', 'MAU NIKAH SAMA AKU?',
  'KAMU TUH CINTA SEJATI', 'BAWA KE ORANG TUA YUK!',
  'HARTANYA HATI, MAHARKAN CINTA', 'CINTA SEJATI DI KANDANG INI',
  'KAU BIDADARI TERSEMBUNYI', 'HANYA KAMU YANG AKU CARI',
  'DARI SEMUA SUNGAI DAN JALAN', 'AKU NYEBRANG CUMA BUAT KAMU',
];

export class HopperScene extends ArcadeScene {
  private gs = 'TITLE';
  private score = 0; private lives = 3; private level = 1;
  private pig = { x: VW / 2, row: 11, heartEyes: false, blush: 0 };
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
  private dialogueText = ''; private dialogueT = 0; private nextDialogueAt = 5;

  // ── Power-up state ──
  private powerUps: PowerUp[] = [];
  private activePowers: Partial<Record<PowerType, { t: number }>> = {};
  private nextPowerAt = 10;
  private comboCount = 0;
  private scorePopups: { x: number; y: number; text: string; t: number }[] = [];

  constructor() { super({ key: 'HopperScene' }); }

  private buildLanes() {
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
    this.powerUps = []; this.nextPowerAt = 10;
    this.activePowers = {};
    this.comboCount = 0;
  }

  private resetPig() {
    this.pig = { x: VW / 2, row: 11, heartEyes: false, blush: 0 };
    this.timeLeft = Math.max(14, 30 - (this.level - 1) * 1.5); this.maxRow = 11;
  }

  private resetPowers() {
    this.activePowers = {};
    this.powerUps = [];
    this.nextPowerAt = 8 + Math.random() * 6;
  }

  private startGame() {
    this.score = 0; this.lives = 3; this.level = 1;
    this.goals = [false, false, false, false, false];
    this.goalsDone = 0; this.hops = 0; this.deathT = 0;
    this.daily = isDailyMode(); this.dailyDate = todayDateSeed().date;
    this.startTime = Date.now();
    this.comboCount = 0;
    startSession('road-hopper').then(s => { this.sess = s; });
    sfx.start();
    this.buildLanes();
    this.resetPig();
    this.resetPowers();
    this.dialogueText = ''; this.dialogueT = 0; this.nextDialogueAt = 4 + Math.random() * 3;
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

  private hasPower(t: PowerType): boolean {
    return !!this.activePowers[t] && this.activePowers[t]!.t > 0;
  }

  private die(x?: number, y?: number) {
    if (this.deathT > 0) return;
    if (this.hasPower('shield')) {
      this.activePowers.shield = { t: 0 };
      sfx.bounce();
      this.spawnParticles(x ?? this.pig.x, y ?? RY(this.pig.row) + TS / 2, 0xff6b9d, 20, 100);
      this.dialogueText = '❤️ PERISAI HILANG!';
      this.dialogueT = 0.8;
      return;
    }
    this.deathT = 0.9;
    sfx.hit();
    this.shake(0.25, 5);
    this.spawnParticles(x ?? this.pig.x, y ?? RY(this.pig.row) + TS / 2, 0xff9ec4, 14, 80);
  }
  private spawnScorePopup(x: number, y: number, text: string) {
    this.scorePopups.push({ x, y, text, t: 1.0 });
  }

  private hop(dx: number, dy: number) {
    if (this.deathT > 0) return;
    const nr = this.pig.row + dy;
    if (nr < 0 || nr > 11) return;
    const nx = Math.max(12, Math.min(VW - 12, this.pig.x + dx * TS));

    // hopping INTO the goal row: land in an empty pen (female character)
    if (nr === 0) {
      let hitSlot = -1;
      for (let i = 0; i < GOAL_XS.length; i++) if (Math.abs(GOAL_XS[i] - nx) < 22) hitSlot = i;
      if (hitSlot < 0 || this.goals[hitSlot]) { this.die(nx, RY(nr) + TS / 2); return; }
      this.goals[hitSlot] = true;
      this.goalsDone++;
      this.comboCount++;
      const comboMult = Math.min(3, 1 + (this.comboCount - 1) * 0.25);
      const hasDouble = this.hasPower('double');
      const mult = hasDouble ? comboMult * 2 : comboMult;
      const timeBonus = Math.ceil(this.timeLeft) * 10;
      const baseScore = 200;
      const total = Math.round(baseScore * mult + timeBonus);
      this.score += total;
      this.comboCount = Math.min(this.comboCount, 10);
      sfx.coin();
      this.dialogueText = RAYUAN_WIN_LINES[Math.floor(Math.random() * RAYUAN_WIN_LINES.length)];
      this.dialogueT = 1.6;
      this.pig.heartEyes = true;
      this.spawnScorePopup(GOAL_XS[hitSlot], RY(0) - 10, `${comboMult > 1 ? 'x' + mult.toFixed(1) + ' ' : ''}+${total}`);
      this.spawnParticles(GOAL_XS[hitSlot], RY(0) + TS / 2, 0xff4d8c, 18, 80);

      if (this.goals.every(Boolean)) {
        const levelBonus = 1000 + this.level * 200;
        this.score += levelBonus;
        this.level++;
        this.goals = [false, false, false, false, false];
        sfx.clear();
        this.buildLanes();
        this.resetPowers();
        this.spawnScorePopup(VW / 2, RY(0) - 20, `LEVEL ${this.level}! +${levelBonus}`);
      }
      this.resetPig();
      return;
    }
    this.pig.row = nr; this.pig.x = nx; this.hops++;
    if (nr < this.maxRow) {
      this.maxRow = nr;
      const hopScore = this.hasPower('double') ? 20 : 10;
      this.score += hopScore;
    }
    sfx.pop();
  }

  private pickPowerUp(pu: PowerUp) {
    const dur = pu.type === 'time' ? 0 : 8;
    if (pu.type === 'shield') {
      this.activePowers.shield = { t: dur };
      this.dialogueText = '❤️ PERISAI CINTA!';
    } else if (pu.type === 'freeze') {
      this.activePowers.freeze = { t: dur };
      this.dialogueText = '❄️ BEKUIN MEREKA!';
    } else if (pu.type === 'double') {
      this.activePowers.double = { t: dur };
      this.dialogueText = '✧x2 DOUBLE SCORE!';
    } else if (pu.type === 'time') {
      this.timeLeft = Math.min(this.timeLeft + 10, 30);
      this.dialogueText = '⏰ +10 DETIK!';
    }
    this.score += 50;
    this.dialogueT = 1.2;
    sfx.power();
    this.spawnParticles(pu.x, RY(5) + TS / 2, POWER_COLORS[pu.type], 12, 80);
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
    this.txt(0).setOrigin(0.5, 0).setFontSize(22).setColor('#ff6b9d').setText('BABI INGKANG KAPUNDUT').setPosition(VW / 2, VH * 0.14).setVisible(true);
    this.rPig(this.g, VW / 2, VH * 0.30, 14);
    this.rFemale(this.g, VW / 2 + 60, VH * 0.30, 11, 0);
    this.txt(1).setOrigin(0.5, 0).setFontSize(8).setColor('#93a8d9').setText('SEBRANGI JALAN & SUNGAI UNTUK PACARI\\n5 PEREMPUAN CANTIK DI UJUNG PERJALANAN!').setAlign('center').setLineSpacing(6).setPosition(VW / 2, VH * 0.42).setVisible(true);
    this.txt(2).setOrigin(0.5, 0).setFontSize(6).setColor('#ff6b9d').setText('❤ KUMPULKAN POWER-UP: PERISAI CINTA, BEKU, x2 SKOR, +WAKTU').setPosition(VW / 2, VH * 0.52).setVisible(true);
    this.txt(3).setOrigin(0.5, 0).setFontSize(7).setColor('#5f6f9c').setText(this.isTouch ? 'TAP = LOMPAT MAJU - SWIPE = ARAH LAIN' : 'PANAH = LOMPAT').setPosition(VW / 2, VH * 0.60).setVisible(true);
    if (this.blink % 1 < 0.62) this.txt(4).setOrigin(0.5, 0).setFontSize(12).setColor('#ff6b9d').setText(this.isTouch ? 'TAP TO START' : 'PRESS ANY KEY').setPosition(VW / 2, VH * 0.75).setVisible(true);
    if (this.anyPress()) this.startGame();
  }

  private uGO(dt: number) {
    this.stateT += dt;
    this.rWorld();
    this.ui.fillStyle(0x03040c, 0.78); this.ui.fillRect(0, 0, VW, VH);
    this.txt(10).setOrigin(0.5, 0).setFontSize(24).setColor('#ff6b6b').setText('GAME OVER').setPosition(VW / 2, VH * 0.28).setVisible(true);
    this.txt(11).setOrigin(0.5, 0).setFontSize(10).setColor('#f4f8ff').setText('SCORE: ' + this.score).setPosition(VW / 2, VH * 0.42).setVisible(true);
    this.txt(12).setOrigin(0.5, 0).setFontSize(7).setColor('#93a8d9').setText('LEVEL ' + this.level + '  -  ' + this.goalsDone + ' PACAR DAPET').setPosition(VW / 2, VH * 0.50).setVisible(true);
    this.txt(13).setOrigin(0.5, 0).setFontSize(7).setColor('#ffd23f').setText('LOMPATAN: ' + this.hops).setPosition(VW / 2, VH * 0.56).setVisible(true);
    if (this.stateT > 1.2 && this.blink % 1 < 0.62) this.txt(14).setOrigin(0.5, 0).setFontSize(9).setColor('#ff6b9d').setText(this.isTouch ? 'TAP TO CONTINUE' : 'PRESS ANY KEY').setPosition(VW / 2, VH * 0.68).setVisible(true);
    if (this.stateT > 1.2 && this.anyPress()) this.gs = 'TITLE';
  }
  private uPlay(dt: number) {
    // input
    if (this.kp('ArrowUp') || this.swipeDir === 'up' || this.tapped) this.hop(0, -1);
    else if (this.kp('ArrowDown') || this.swipeDir === 'down') this.hop(0, 1);
    else if (this.kp('ArrowLeft') || this.swipeDir === 'left') this.hop(-1, 0);
    else if (this.kp('ArrowRight') || this.swipeDir === 'right') this.hop(1, 0);

    // decay heart eyes
    if (this.pig.heartEyes) this.pig.heartEyes = false;
    if (this.pig.blush > 0) this.pig.blush -= dt;

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

    // tick active power-ups
    for (const key of Object.keys(this.activePowers) as PowerType[]) {
      const p = this.activePowers[key];
      if (p && p.t > 0) { p.t -= dt; }
    }

    // idle chatter — pickup lines
    if (this.dialogueT > 0) this.dialogueT -= dt;
    else {
      this.nextDialogueAt -= dt;
      if (this.nextDialogueAt <= 0) {
        this.dialogueText = RAYUAN_LINES[Math.floor(Math.random() * RAYUAN_LINES.length)];
        this.dialogueT = 1.8;
        this.pig.blush = 0.4;
        this.nextDialogueAt = 7 + Math.random() * 5;
      }
    }

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.die(); }

    // storm
    let stormMult = 1;
    const frozen = this.hasPower('freeze');
    if (!frozen && this.level >= STORM_FROM_LEVEL) {
      this.stormT += dt;
      const inStorm = this.stormT >= this.nextStormAt && this.stormT < this.nextStormAt + STORM_DURATION_S;
      if (inStorm) stormMult = 1.6;
      if (this.stormT >= this.nextStormAt + STORM_DURATION_S) this.nextStormAt = this.stormT + STORM_EVERY_S;
    }

    // move cars (skip if frozen)
    if (!frozen) {
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
    }

    // predator gator
    if (!frozen && this.level >= GATOR_FROM_LEVEL) {
      if (this.gator) {
        const gt = this.gator;
        gt.x += gt.dir * (70 + this.level * 4) * stormMult * dt;
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

    // power-up spawn on median
    if (!frozen) {
      if (this.powerUps.length === 0) {
        this.nextPowerAt -= dt;
        if (this.nextPowerAt <= 0) {
          const types: PowerType[] = ['shield', 'freeze', 'double', 'time'];
          const type = types[Math.floor(Math.random() * types.length)];
          this.powerUps.push({ x: 24 + Math.random() * (VW - 48), t: 10, type });
          this.nextPowerAt = 12 + Math.random() * 6;
        }
      } else {
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
          this.powerUps[i].t -= dt;
          if (this.powerUps[i].t <= 0) this.powerUps.splice(i, 1);
        }
      }
    }

    // score popups decay
    for (let i = this.scorePopups.length - 1; i >= 0; i--) {
      this.scorePopups[i].t -= dt;
      if (this.scorePopups[i].t <= 0) this.scorePopups.splice(i, 1);
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
      const logSpeed = frozen ? 0 : this.riverLanes[lane].speed * stormMult;
      const logDir = frozen ? 0 : this.riverLanes[lane].dir;
      if (!submerged) for (const l of this.logs) {
        if (l.lane !== lane) continue;
        if (this.pig.x > l.x - 4 && this.pig.x < l.x + l.w + 4) { onLog = l; break; }
      }
      if (onLog) {
        if (!frozen) {
          this.pig.x += logDir * logSpeed * dt;
          if (this.pig.x < 8 || this.pig.x > VW - 8) this.die();
        }
      } else this.die();
      if (this.gator && this.gator.lane === lane && Math.abs(this.gator.x - this.pig.x) < 18) {
        this.die();
      }
    }
    // power-up pickup
    if (fr === 5 && this.powerUps.length > 0) {
      for (let i = this.powerUps.length - 1; i >= 0; i--) {
        if (Math.abs(this.powerUps[i].x - this.pig.x) < 16) {
          this.pickPowerUp(this.powerUps[i]);
          this.powerUps.splice(i, 1);
          break;
        }
      }
    }
    this.rWorld();
  }
  private rWorld() {
    const g = this.g;
    // zones
    this.bg.fillStyle(0x0a0a18); this.bg.fillRect(0, 0, VW, VH);
    this.bg.fillStyle(0x1a0a18); this.bg.fillRect(0, RY(0), VW, TS);            // goal — romantic pinkish grass
    this.bg.fillStyle(0x0d2440); this.bg.fillRect(0, RY(1), VW, TS * 4);        // river
    this.bg.fillStyle(0x1c1428); this.bg.fillRect(0, RY(5), VW, TS);            // median — purple
    this.bg.fillStyle(0x16161f); this.bg.fillRect(0, RY(6), VW, TS * 5);        // road
    this.bg.fillStyle(0x1c0a18); this.bg.fillRect(0, RY(11), VW, TS);           // start — pinkish
    // romantic floating hearts in goal zone
    for (let i = 0; i < 5; i++) {
      const hx = (i * 97 + 20 + Math.sin(this.blink * 0.5 + i) * 15) % VW;
      const hy = RY(0) + 4 + Math.sin(this.blink * 0.7 + i * 1.7) * 3;
      this.bg.fillStyle(0xff4d8c, 0.15 + Math.sin(this.blink + i) * 0.05);
      this.bg.fillCircle(hx, hy, 3);
      this.bg.fillTriangle(hx - 2, hy + 1, hx + 2, hy + 1, hx, hy + 5);
    }
    // water shimmer
    for (let i = 0; i < 4; i++) {
      const y = RY(1 + i) + TS / 2 + Math.sin(this.blink * 2 + i) * 3;
      this.bg.fillStyle(0x2a5a8a, 0.35); this.bg.fillRect(0, y, VW, 2);
    }
    // road lane dashes
    this.bg.fillStyle(0xd9d9a0, 0.35);
    for (let r = 7; r <= 10; r++) for (let x = 0; x < VW; x += 42) this.bg.fillRect(x, RY(r) - 1, 20, 2);
    g.save(); g.translateCanvas(this.shakeX, this.shakeY);

    // goal pens — FEMALE CHARACTERS instead of baby pigs
    for (let i = 0; i < GOAL_XS.length; i++) {
      const x = GOAL_XS[i];
      // pen
      g.fillStyle(0x2a1830); g.fillRect(x - 22, RY(0) + 3, 44, TS - 6);
      g.lineStyle(2, this.goals[i] ? 0xff6b9d : 0x4a2a50, 0.9); g.strokeRect(x - 22, RY(0) + 3, 44, TS - 6);
      // heart between each pen
      if (i < GOAL_XS.length - 1) {
        const mx = (x + GOAL_XS[i + 1]) / 2;
        this.bg.fillStyle(0xff4d8c, 0.25); this.bg.fillCircle(mx, RY(0) + TS / 2, 4);
        this.bg.fillTriangle(mx - 2, RY(0) + TS / 2 + 1, mx + 2, RY(0) + TS / 2 + 1, mx, RY(0) + TS / 2 + 5);
      }
      if (!this.goals[i]) {
        // pulsing empty pen
        const pulse = 0.25 + Math.sin(this.blink * 2 + i) * 0.15;
        g.fillStyle(0xff4d8c, pulse);
        g.fillCircle(x, RY(0) + TS / 2, 5);
      } else {
        this.rFemale(g, x, RY(0) + TS / 2, 10, i);
      }
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

    // power-ups on median (pulsing heart icons)
    for (const pu of this.powerUps) {
      const y = RY(5) + TS / 2 + Math.sin(this.blink * 3 + (pu.x % 10)) * 3;
      const flashing = pu.t < 2.5 && this.blink % 0.3 < 0.15;
      if (!flashing) {
        const c = POWER_COLORS[pu.type];
        drawGlow(g, pu.x, y, 10, c, 0.6);
        // heart icon
        g.fillStyle(c); g.fillCircle(pu.x, y, 5);
        g.fillTriangle(pu.x - 4, y, pu.x + 4, y, pu.x, y + 6);
        // symbol inside
        g.fillStyle(0x1a1a2e, 0.85);
        // text label instead of tiny text
        this.txt(22).setOrigin(0.5, 0).setFontSize(5).setColor('#ffffff').setText(POWER_SYMBOLS[pu.type]).setPosition(pu.x, y - 2).setVisible(true);
      }
    }

    // pig
    if (this.deathT > 0) {
      if (this.blink % 0.2 < 0.1) {
        g.fillStyle(0xff5c5c, 0.8);
        g.fillCircle(this.pig.x, RY(this.pig.row) + TS / 2, 10);
      }
      this.txt(6).setOrigin(0.5, 0).setFontSize(9).setColor('#ff6b6b').setText('ADUH KENA!').setPosition(this.pig.x, RY(this.pig.row) - 14).setVisible(true);
    } else {
      this.rPig(g, this.pig.x, RY(this.pig.row) + TS / 2, 10);
    }

    // shield visual
    if (this.hasPower('shield')) {
      const px = this.pig.x, py = RY(this.pig.row) + TS / 2;
      const pulse = 0.15 + Math.sin(this.blink * 5) * 0.08;
      g.lineStyle(2, 0xff6b9d, pulse);
      g.strokeCircle(px, py, 13);
      g.lineStyle(1, 0xff9ec4, pulse * 0.6);
      g.strokeCircle(px, py, 15);
    }

    this.drawParticles(g);
    g.restore();

    // score popups
    for (const sp of this.scorePopups) {
      const a = Math.max(0, sp.t / 1.0);
      const yy = sp.y - (1 - a) * 20;
      this.txt(23).setOrigin(0.5, 0).setFontSize(7).setColor('#ffd700').setText(sp.text).setPosition(sp.x, yy).setAlpha(a).setVisible(true);
    }

    // dialogue bubble — rapek pickup lines
    if (this.dialogueT > 0 && this.deathT <= 0) {
      const dx = this.pig.x, dy = RY(this.pig.row) - 14;
      const bw = Math.max(40, this.dialogueText.length * 4.8 + 10);
      this.ui.fillStyle(0xffffff, 0.92);
      this.ui.fillRoundedRect(dx - bw / 2, dy - 12, bw, 14, 4);
      this.ui.fillTriangle(dx - 4, dy + 2, dx + 4, dy + 2, dx, dy + 8);
      this.txt(21).setOrigin(0.5, 0.5).setFontSize(6).setColor('#1a1420').setText(this.dialogueText).setPosition(dx, dy - 5).setVisible(true);
    }

    // active power-up indicators (HUD area)
    let pIdx = 0;
    for (const key of Object.keys(this.activePowers) as PowerType[]) {
      const p = this.activePowers[key];
      if (p && p.t > 0) {
        const px = 142 + pIdx * 58;
        const pc = POWER_COLORS[key];
        this.ui.fillStyle(pc, 0.15); this.ui.fillRect(px, 22, 52, 8);
        this.ui.fillStyle(pc, 0.6); this.ui.fillRect(px, 22, 52 * (p.t / 8), 8);
        this.txt(24 + pIdx).setOrigin(0, 0).setFontSize(5).setColor('#ffffff').setText(POWER_SYMBOLS[key] + ' ' + Math.ceil(p.t) + 's').setPosition(px + 1, 23).setVisible(true);
        pIdx++;
      }
    }

    // storm — warning telegraph then rain overlay while active
    const sinceStorm = this.stormT - this.nextStormAt;
    const stormWarn = this.level >= STORM_FROM_LEVEL && sinceStorm >= -STORM_WARN_S && sinceStorm < 0;
    const stormActive = this.level >= STORM_FROM_LEVEL && sinceStorm >= 0 && sinceStorm < STORM_DURATION_S;
    if (stormActive && !this.hasPower('freeze')) {
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
    this.ui.fillStyle(0x0a0a18, 0.92); this.ui.fillRect(0, 0, VW, HUD_H);
    this.ui.fillStyle(0xff6b9d, 0.4); this.ui.fillRect(0, HUD_H - 2, VW, 2);
    this.txt(0).setOrigin(0, 0).setFontSize(9).setColor('#f4f8ff').setText(String(this.score).padStart(6, '0')).setPosition(10, 10).setVisible(true);
    this.txt(1).setOrigin(0.5, 0).setFontSize(7).setColor('#ff6b9d').setText('LV ' + this.level).setPosition(VW / 2 - 64, 12).setVisible(true);
    // combo display
    if (this.comboCount > 1) {
      this.txt(2).setOrigin(0.5, 0).setFontSize(6).setColor('#ffd23f').setText('COMBO x' + this.comboCount).setPosition(VW / 2 - 12, 12).setVisible(true);
    }
    if (this.daily) this.txt(19).setOrigin(0, 0).setFontSize(6).setColor('#ffd23f').setText('HARIAN').setPosition(10, 22).setVisible(true);
    // timer bar
    const tw = 110, tfrac = Math.max(0, this.timeLeft / 30);
    this.ui.fillStyle(0x03040c, 0.7); this.ui.fillRect(VW / 2 - 20, 10, tw, 8);
    this.ui.fillStyle(tfrac > 0.35 ? 0xff6b9d : 0xff5c5c, 0.95); this.ui.fillRect(VW / 2 - 20, 10, tw * tfrac, 8);
    for (let i = 0; i < this.lives; i++) this.rPig(this.ui, VW - 16 - i * 20, 16, 7);
  }
  private rPig(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number) {
    drawGlow(g, x, y, r + 4, 0xff6b9d, 0.3);
    // blush
    if (this.pig.blush > 0 || this.pig.heartEyes) {
      const ba = 0.2 + Math.sin(this.blink * 3) * 0.1;
      g.fillStyle(0xff4d8c, ba);
      g.fillCircle(x - r * 0.55, y + r * 0.1, r * 0.2);
      g.fillCircle(x + r * 0.55, y + r * 0.1, r * 0.2);
    }
    // ears
    g.fillStyle(0xff6b9d);
    g.fillTriangle(x - r * 0.9, y - r * 0.6, x - r * 0.3, y - r * 1.15, x - r * 0.05, y - r * 0.5);
    g.fillTriangle(x + r * 0.9, y - r * 0.6, x + r * 0.3, y - r * 1.15, x + r * 0.05, y - r * 0.5);
    // body
    g.fillStyle(0xff9ec4);
    g.fillCircle(x, y, r);
    // eyes
    if (this.pig.heartEyes) {
      // heart eyes
      g.fillStyle(0xff1a5c);
      g.fillCircle(x - r * 0.4, y - r * 0.15, r * 0.12);
      g.fillCircle(x + r * 0.4, y - r * 0.15, r * 0.12);
      g.fillTriangle(x - r * 0.52, y - r * 0.15, x - r * 0.28, y - r * 0.15, x - r * 0.4, y - r * 0.01);
      g.fillTriangle(x + r * 0.52, y - r * 0.15, x + r * 0.28, y - r * 0.15, x + r * 0.4, y - r * 0.01);
    } else {
      // normal eyes
      g.fillStyle(0x1a1420);
      g.fillCircle(x - r * 0.4, y - r * 0.15, r * 0.13);
      g.fillCircle(x + r * 0.4, y - r * 0.15, r * 0.13);
      // eye shine
      g.fillStyle(0xffffff, 0.8);
      g.fillCircle(x - r * 0.35, y - r * 0.22, r * 0.04);
      g.fillCircle(x + r * 0.45, y - r * 0.22, r * 0.04);
    }
    // snout
    g.fillStyle(0xffc2dd);
    g.fillEllipse(x, y + r * 0.35, r * 0.9, r * 0.6);
    g.fillStyle(0x7a2e4d);
    g.fillCircle(x - r * 0.22, y + r * 0.35, r * 0.11);
    g.fillCircle(x + r * 0.22, y + r * 0.35, r * 0.11);
    // subtle smile
    g.lineStyle(1, 0x7a2e4d, 0.6);
    g.beginPath(); g.arc(x, y + r * 0.5, r * 0.35, 0.2, Math.PI - 0.2, false); g.strokePath();
  }

  // ── Female character — replaces the baby pig in pens ──
  private rFemale(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, idx: number) {
    // glow
    drawGlow(g, x, y, r + 5, 0xff4d8c, 0.4);
    // hair (long, flowing)
    const hairColor = [0x2a1a0a, 0x1a0a2a, 0x4a2a0a, 0x0a1a2a, 0x3a1a0a][idx % 5];
    const dressColor = [0xff4d8c, 0xff6b9d, 0xcc3d7a, 0xff8db5, 0xff3d6b][idx % 5];
    // hair left side
    g.fillStyle(hairColor);
    g.fillCircle(x - r * 0.5, y - r * 0.1, r * 0.3);
    g.fillCircle(x + r * 0.5, y - r * 0.1, r * 0.3);
    // hair top
    g.fillCircle(x, y - r * 0.6, r * 0.45);
    // hair flow lines
    g.lineStyle(1.5, hairColor, 0.7);
    g.beginPath(); g.moveTo(x - r * 0.5, y - r * 0.2); g.lineTo(x - r * 0.7, y + r * 0.4); g.strokePath();
    g.beginPath(); g.moveTo(x + r * 0.5, y - r * 0.2); g.lineTo(x + r * 0.7, y + r * 0.4); g.strokePath();
    // face
    g.fillStyle(0xffe8dd);
    g.fillCircle(x, y - r * 0.3, r * 0.38);
    // eyes with lashes
    g.fillStyle(0x1a1420);
    g.fillCircle(x - r * 0.15, y - r * 0.35, r * 0.07);
    g.fillCircle(x + r * 0.15, y - r * 0.35, r * 0.07);
    // lashes
    g.lineStyle(1, 0x1a1420, 0.6);
    for (let side = -1; side <= 1; side += 2) {
      const ex = x + side * r * 0.15;
      const ey = y - r * 0.35;
      g.beginPath(); g.moveTo(ex - 1.5, ey - 3); g.lineTo(ex - 3, ey - 6); g.strokePath();
      g.beginPath(); g.moveTo(ex + 1.5, ey - 3); g.lineTo(ex + 3, ey - 6); g.strokePath();
      g.beginPath(); g.moveTo(ex, ey - 3); g.lineTo(ex, ey - 7); g.strokePath();
    }
    // red lips
    g.fillStyle(0xd94d6b);
    g.fillEllipse(x, y - r * 0.15, r * 0.2, r * 0.08);
    // dress body
    g.fillStyle(dressColor);
    g.fillTriangle(x - r * 0.5, y + r * 0.1, x + r * 0.5, y + r * 0.1, x, y + r * 1.0);
    // dress detail — collar
    g.fillStyle(0xffffff, 0.3);
    g.fillCircle(x, y + r * 0.1, r * 0.12);
    // dress detail — belt
    g.fillStyle(0xffffff, 0.2);
    g.fillRect(x - r * 0.2, y + r * 0.45, r * 0.4, r * 0.04);
    // blushing cheeks
    g.fillStyle(0xff6b9d, 0.25);
    g.fillCircle(x - r * 0.3, y - r * 0.2, r * 0.1);
    g.fillCircle(x + r * 0.3, y - r * 0.2, r * 0.1);
    // floating hearts
    for (let hi = 0; hi < 2; hi++) {
      const hx = x + (idx % 2 === 0 ? -1 : 1) * (r * 0.7 + Math.sin(this.blink * 2 + hi + idx) * 3);
      const hy = y - r * 0.8 + Math.sin(this.blink * 1.5 + hi * 2) * 2;
      g.fillStyle(0xff4d8c, 0.3 + Math.sin(this.blink + hi + idx) * 0.15);
      g.fillCircle(hx, hy, 2.5);
      g.fillTriangle(hx - 1.5, hy, hx + 1.5, hy, hx, hy + 3);
    }
  }
}
