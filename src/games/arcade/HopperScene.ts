import Phaser from 'phaser';
import { ArcadeScene, VW, VH, sfx, drawGlow, shade, startSession, submitScore, SessionCtx, isDailyMode, todayDateSeed, mulberry32 } from './kit';

// ── WARAN INGKANG KAPUNDUT — Frogger-style crossing ──
// The Esteemed Piglet crosses lanes of traffic and a river to woo 5 lovely
// ladies. Full-body pig with walk animation, pickup lines, and power-ups.
const HUD_H = 32, TS = 32;
const ROWS = 12;
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

type PowerType = 'shield' | 'freeze' | 'double' | 'time';
interface PowerUp { x: number; t: number; type: PowerType }
const POWER_COLORS: Record<PowerType, number> = { shield: 0xff6b9d, freeze: 0x6bd4ff, double: 0xffd700, time: 0x6bff8c };
const POWER_SYMBOLS: Record<PowerType, string> = { shield: 'H', freeze: 'I', double: 'D', time: 'T' };

// ── Rayuan (pickup lines) ──
const RAYUAN_LINES = [
  'HI CANTIK!', 'AKU PUNYA KEBON CABE LO', 'MINTA NOMOR WA DONG',
  'SENYUM DONG SAYANG', 'KAMU CANTIK BANGET', 'JOMBLO NIH?',
  'PINJEM DUIT?', 'BIDADARI DARI SURGA?',
  'AKU SUKA SAMA KAMU', 'MAU JADI PACARKU?', 'CINTA ITU BUTA NIH',
  'KAMU TUH KAYAK BENSIN', 'BIKIN HATI IRIT MELAJU',
  'KAMU KAYAK TV', 'SINYALNYA SAMPE HATI',
  'APA KAMU KOPI?', 'SOALNYA BIKIN GAK TIDUR',
  'KAMU MATAHARI?', 'KALO GAK ADA KAMU GELAP GINI',
  'INI DOMPET HILANG', 'SOALNYA HATI UDAH JATUH',
  'POSESIF BOLEH?', 'SOALNYA AKU CEMAS KAMU DIREBUT',
  'KAMU BENSIN?', 'SOALNYA BIKIN HATI BERKOBAR',
  'AKU LELAH', 'SOALNYA BERJUTA JAUH DARI KAMU',
  'KAMU KUNCI?', 'SOALNYA BIKIN HATI TERKUNCI',
  'AKU BURUNG', 'PANTES SUARANYA MERDU DI TELINGA',
  'KAMU TUH BAHAYA', 'SOALNYA BIKIN KECANDUAN',
  'KAMU ES KRIM?', 'SOALNYA BIKIN HATI DINGIN TERUS LEMBUT',
  'KAMU INTERNET?', 'SOALNYA GAK BISA JAUH DARI KAMU',
  'KAMU TUH PAHIT', 'TAPI OBAT BUAT AKU',
];
const RAYUAN_WIN_LINES = [
  'AKU DIAM-DIAM CINTA SAMA KAMU', 'MAU NIKAH SAMA AKU?',
  'KAMU TUH CINTA SEJATI', 'BAWA KE ORANG TUA YUK!',
  'HARTANYA HATI, MAHARKAN CINTA', 'CINTA SEJATI DI KANDANG INI',
  'KAU BIDADARI TERSEMBUNYI', 'HANYA KAMU YANG AKU CARI',
  'DARI SEMUA SUNGAI DAN JALAN', 'AKU NYEBRANG CUMA BUAT KAMU',
];

// Helper: wrap text into lines up to maxChars
function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; }
    else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

// ── Color palette for the cute pig ──
const PIG_BODY = 0xffb3c6;   // soft pink body
const PIG_BLUSH = 0xff7eb3;  // blush/ears
const PIG_BELLY = 0xffe5ec;  // belly highlight
const PIG_DARK = 0xcc6b8a;   // hooves/snout details
const PIG_SNOUT = 0xffc9d9;  // snout color
const PIG_NOSTRIL = 0x9a4d6b;

export class HopperScene extends ArcadeScene {
  private gs = 'TITLE';
  private score = 0; private lives = 3; private level = 1;
  private pig = { x: VW / 2, row: 11, heartEyes: false, blush: 0, walkCycle: 0 };
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
  private powerUps: PowerUp[] = [];
  private activePowers: Partial<Record<PowerType, { t: number }>> = {};
  private nextPowerAt = 10;
  private comboCount = 0;
  private scorePopups: { x: number; y: number; text: string; t: number }[] = [];
  private pigBounce = 0;
  private _backHandler: (() => void) | null = null;

  constructor() { super({ key: 'HopperScene' }); }

  protected onCreate() {
    // Listen for 'game-back' event from ArcadeShell Back button
    this._backHandler = () => {
      this.gs = 'TITLE';
      this.stateT = 0;
      this.deathT = 0;
      this.dialogueText = '';
      this.dialogueT = 0;
      this.scorePopups = [];
    };
    window.addEventListener('game-back', this._backHandler);
    // Clean up on destroy
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      if (this._backHandler) {
        window.removeEventListener('game-back', this._backHandler);
        this._backHandler = null;
      }
    });
  }

  private buildLanes() {
    const rng = this.daily ? mulberry32(todayDateSeed().seed * 37 + this.level) : Math.random;
    const sp = 1 + (this.level - 1) * 0.12;
    const CAR_COLORS = [0xff5c5c, 0xffd23f, 0x7ce3ff, 0xb45cff, 0xff9d42];
    this.roadLanes = [];
    for (let i = 0; i < 5; i++) this.roadLanes.push({
      dir: i % 2 === 0 ? 1 : -1,
      speed: (62 + i * 16 + rng() * 20) * sp,
      gap: Math.max(120, 230 - this.level * 12 - i * 8),
      carW: i === 2 ? 64 : 40,
      color: CAR_COLORS[i % CAR_COLORS.length],
    });
    this.riverLanes = [];
    for (let i = 0; i < 4; i++) this.riverLanes.push({
      dir: i % 2 === 0 ? -1 : 1,
      speed: (42 + i * 14) * sp,
      gap: 96 + i * 14 + this.level * 6,
      logW: Math.max(64, 118 - this.level * 6 - i * 6),
    });
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
    this.activePowers = {}; this.comboCount = 0;
  }

  private resetPig() {
    this.pig = { x: VW / 2, row: 11, heartEyes: false, blush: 0, walkCycle: 0 };
    this.timeLeft = Math.max(14, 30 - (this.level - 1) * 1.5); this.maxRow = 11;
    this.pigBounce = 0;
  }

  private resetPowers() { this.activePowers = {}; this.powerUps = []; this.nextPowerAt = 8 + Math.random() * 6; }

  private startGame() {
    this.score = 0; this.lives = 3; this.level = 1;
    this.goals = [false, false, false, false, false];
    this.goalsDone = 0; this.hops = 0; this.deathT = 0;
    this.daily = isDailyMode(); this.dailyDate = todayDateSeed().date;
    this.startTime = Date.now(); this.comboCount = 0;
    startSession('road-hopper').then(s => { this.sess = s; });
    sfx.start();
    this.buildLanes(); this.resetPig(); this.resetPowers();
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

  private turtlesSubmerged(): boolean { return Math.sin(this.blink * 1.3) > 0.2; }
  private hasPower(t: PowerType): boolean { return !!this.activePowers[t] && this.activePowers[t]!.t > 0; }

  private die(x?: number, y?: number) {
    if (this.deathT > 0) return;
    if (this.hasPower('shield')) {
      this.activePowers.shield = { t: 0 };
      sfx.bounce();
      this.spawnParticles(x ?? this.pig.x, y ?? RY(this.pig.row) + TS / 2, 0xff6b9d, 20, 100);
      this.dialogueText = 'PERISAI HILANG!'; this.dialogueT = 0.8;
      return;
    }
    this.deathT = 0.9; sfx.hit(); this.shake(0.25, 5);
    this.spawnParticles(x ?? this.pig.x, y ?? RY(this.pig.row) + TS / 2, 0xff9ec4, 14, 80);
  }

  private spawnScorePopup(x: number, y: number, text: string) {
    this.scorePopups.push({ x, y, text, t: 1.2 });
  }
  private hop(dx: number, dy: number) {
    if (this.deathT > 0) return;
    const nr = this.pig.row + dy;
    if (nr < 0 || nr > 11) return;
    const nx = Math.max(12, Math.min(VW - 12, this.pig.x + dx * TS));
    this.pig.walkCycle += 1; // leg animation step
    this.pigBounce = 0.15; // landing bounce

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
      this.dialogueT = 1.8;
      this.pig.heartEyes = true;
      this.pig.blush = 0.6;
      this.spawnScorePopup(GOAL_XS[hitSlot], RY(0) - 14, `${comboMult > 1 ? 'x'+mult.toFixed(1)+' ' : ''}+${total}`);
      this.spawnParticles(GOAL_XS[hitSlot], RY(0) + TS / 2, 0xff4d8c, 20, 90);

      if (this.goals.every(Boolean)) {
        const levelBonus = 1000 + this.level * 200;
        this.score += levelBonus;
        this.level++;
        this.goals = [false, false, false, false, false];
        sfx.clear();
        this.buildLanes(); this.resetPowers();
        this.spawnScorePopup(VW / 2, RY(0) - 24, `LEVEL ${this.level}! +${levelBonus}`);
      }
      this.resetPig();
      return;
    }
    this.pig.row = nr; this.pig.x = nx; this.hops++;
    if (nr < this.maxRow) { this.maxRow = nr; this.score += this.hasPower('double') ? 20 : 10; }
    sfx.pop();
  }

  private pickPowerUp(pu: PowerUp) {
    const dur = pu.type === 'time' ? 0 : 8;
    if (pu.type === 'shield') { this.activePowers.shield = { t: dur }; this.dialogueText = 'PERISAI CINTA!'; }
    else if (pu.type === 'freeze') { this.activePowers.freeze = { t: dur }; this.dialogueText = 'BEKUIN MEREKA!'; }
    else if (pu.type === 'double') { this.activePowers.double = { t: dur }; this.dialogueText = 'x2 DOUBLE SCORE!'; }
    else if (pu.type === 'time') { this.timeLeft = Math.min(this.timeLeft + 10, 30); this.dialogueText = '+10 DETIK!'; }
    this.score += 50; this.dialogueT = 1.2;
    this.pig.blush = 0.3;
    sfx.power();
    this.spawnParticles(pu.x, RY(5) + TS / 2, POWER_COLORS[pu.type], 14, 90);
  }
  protected tick(dt: number) {
    sfx.musicTick(this.gs === 'PLAYING', this.lives <= 1 ? 1 : 0, 'hopper');
    this.g.clear(); this.ui.clear(); this.bg.clear();
    for (const t of this.txts) t.setVisible(false);
    if (this.pigBounce > 0) this.pigBounce -= dt * 2;
    if (this.gs === 'TITLE') { this.drawSpaceBg(); this.uTitle(); }
    else if (this.gs === 'PLAYING') this.uPlay(dt);
    else if (this.gs === 'GAME_OVER') this.uGO(dt);
  }

  // ── Helper: apply readable stroke to text ──
  private setReadable(t: Phaser.GameObjects.Text, color: string, thickness = 3): Phaser.GameObjects.Text {
    return t.setStroke('#000000', thickness).setColor(color).setFontFamily('system-ui');
  }

  private uTitle() {
    // Title — big, bold, readable
    const titleTxt = this.txt(0).setOrigin(0.5, 0).setFontSize(22).setPosition(VW / 2, VH * 0.11).setVisible(true);
    this.setReadable(titleTxt, '#ff6b9d', 4);
    titleTxt.setText('WARAN INGKANG\nKAPUNDUT').setAlign('center').setLineSpacing(4);

    // Big pig in center
    this.rPigFull(this.g, VW / 2, VH * 0.36, 1.8);
    // Female character beside pig
    this.rFemale(this.g, VW / 2 + 70, VH * 0.34, 12, 0);

    // Subtitle — readable size
    const subTxt = this.txt(1).setOrigin(0.5, 0).setFontSize(9).setText('SEBRANGI JALAN & SUNGAI\nUNTUK PACARI 5\nPEREMPUAN CANTIK').setAlign('center').setLineSpacing(6).setPosition(VW / 2, VH * 0.48).setVisible(true);
    this.setReadable(subTxt, '#93a8d9', 3);

    // Power-up hint
    const powTxt = this.txt(2).setOrigin(0.5, 0).setFontSize(8).setText('POWER-UP: PERISAI, BEKU, x2, +WAKTU').setPosition(VW / 2, VH * 0.62).setVisible(true);
    this.setReadable(powTxt, '#ff6b9d', 3);

    // Controls hint
    const ctrlTxt = this.txt(3).setOrigin(0.5, 0).setFontSize(9).setText(this.isTouch ? 'TAP = LOMPAT MAJU\nSWIPE = ARAH LAIN' : 'PANAH = LOMPAT').setAlign('center').setLineSpacing(4).setPosition(VW / 2, VH * 0.69).setVisible(true);
    this.setReadable(ctrlTxt, '#5f6f9c', 3);

    // Blinking start prompt
    if (this.blink % 1 < 0.62) {
      const startTxt = this.txt(4).setOrigin(0.5, 0).setFontSize(12).setText(this.isTouch ? 'TAP TO START' : 'PRESS ANY KEY').setPosition(VW / 2, VH * 0.82).setVisible(true);
      this.setReadable(startTxt, '#ff6b9d', 4);
    }
    if (this.anyPress()) this.startGame();
  }

  private uGO(dt: number) {
    this.stateT += dt;
    this.rWorld();
    this.ui.fillStyle(0x03040c, 0.78); this.ui.fillRect(0, 0, VW, VH);

    // GAME OVER — big and bold
    const goTxt = this.txt(10).setOrigin(0.5, 0).setFontSize(26).setText('GAME OVER').setPosition(VW / 2, VH * 0.22).setVisible(true);
    this.setReadable(goTxt, '#ff6b6b', 5);

    // Score
    const scoreTxt = this.txt(11).setOrigin(0.5, 0).setFontSize(12).setText('SCORE: ' + this.score).setPosition(VW / 2, VH * 0.38).setVisible(true);
    this.setReadable(scoreTxt, '#f4f8ff', 3);

    // Level + goals
    const lvTxt = this.txt(12).setOrigin(0.5, 0).setFontSize(9).setText('LEVEL ' + this.level + '  -  ' + this.goalsDone + ' PACAR DAPET').setPosition(VW / 2, VH * 0.47).setVisible(true);
    this.setReadable(lvTxt, '#93a8d9', 3);

    // Hops
    const hopsTxt = this.txt(13).setOrigin(0.5, 0).setFontSize(9).setText('LOMPATAN: ' + this.hops).setPosition(VW / 2, VH * 0.53).setVisible(true);
    this.setReadable(hopsTxt, '#ffd23f', 3);

    if (this.stateT > 1.2 && this.blink % 1 < 0.62) {
      const contTxt = this.txt(14).setOrigin(0.5, 0).setFontSize(10).setText(this.isTouch ? 'TAP TO CONTINUE' : 'PRESS ANY KEY').setPosition(VW / 2, VH * 0.66).setVisible(true);
      this.setReadable(contTxt, '#ff6b9d', 3);
    }
    if (this.stateT > 1.2 && this.anyPress()) this.gs = 'TITLE';
  }
  private uPlay(dt: number) {
    // input
    if (this.kp('ArrowUp') || this.swipeDir === 'up' || this.tapped) this.hop(0, -1);
    else if (this.kp('ArrowDown') || this.swipeDir === 'down') this.hop(0, 1);
    else if (this.kp('ArrowLeft') || this.swipeDir === 'left') this.hop(-1, 0);
    else if (this.kp('ArrowRight') || this.swipeDir === 'right') this.hop(1, 0);

    if (this.pig.heartEyes) this.pig.heartEyes = false;
    if (this.pig.blush > 0) this.pig.blush -= dt;

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

    for (const key of Object.keys(this.activePowers) as PowerType[]) {
      const p = this.activePowers[key];
      if (p && p.t > 0) p.t -= dt;
    }

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

    let stormMult = 1;
    const frozen = this.hasPower('freeze');
    if (!frozen && this.level >= STORM_FROM_LEVEL) {
      this.stormT += dt;
      const inStorm = this.stormT >= this.nextStormAt && this.stormT < this.nextStormAt + STORM_DURATION_S;
      if (inStorm) stormMult = 1.6;
      if (this.stormT >= this.nextStormAt + STORM_DURATION_S) this.nextStormAt = this.stormT + STORM_EVERY_S;
    }

    if (!frozen) {
      for (let li = 0; li < 5; li++) {
        const L = this.roadLanes[li]; this.spawnT[li] -= dt;
        if (this.spawnT[li] <= 0) { this.cars.push({ x: L.dir > 0 ? -L.carW - 10 : VW + 10, w: L.carW, lane: li, color: L.color }); this.spawnT[li] = (L.carW + L.gap) / (L.speed * stormMult); }
      }
      for (let i = this.cars.length - 1; i >= 0; i--) { const c = this.cars[i], L = this.roadLanes[c.lane]; c.x += L.dir * L.speed * stormMult * dt; if (c.x < -c.w - 20 || c.x > VW + c.w + 20) this.cars.splice(i, 1); }
      for (let li = 0; li < 4; li++) {
        const L = this.riverLanes[li]; this.spawnT[5 + li] -= dt;
        if (this.spawnT[5 + li] <= 0) { this.logs.push({ x: L.dir > 0 ? -L.logW - 10 : VW + 10, w: L.logW, lane: li }); this.spawnT[5 + li] = (L.logW + L.gap) / (L.speed * stormMult); }
      }
      for (let i = this.logs.length - 1; i >= 0; i--) { const l = this.logs[i], L = this.riverLanes[l.lane]; l.x += L.dir * L.speed * stormMult * dt; if (l.x < -l.w - 20 || l.x > VW + l.w + 20) this.logs.splice(i, 1); }
    }

    if (!frozen && this.level >= GATOR_FROM_LEVEL) {
      if (this.gator) {
        const gt = this.gator; gt.x += gt.dir * (70 + this.level * 4) * stormMult * dt;
        if (this.pig.row >= 1 && this.pig.row <= 4) gt.x += Math.sign(this.pig.x - gt.x) * 18 * dt;
        if (gt.x < -30 || gt.x > VW + 30) this.gator = null;
      } else { this.gatorSpawnT -= dt; if (this.gatorSpawnT <= 0) { const lane = Math.floor(Math.random() * 4); this.gator = { x: Math.random() < 0.5 ? -30 : VW + 30, lane, dir: Math.random() < 0.5 ? 1 : -1, nextAt: 0 }; this.gatorSpawnT = 9 + Math.random() * 7; } }
    }

    if (!frozen) {
      if (this.powerUps.length === 0) {
        this.nextPowerAt -= dt;
        if (this.nextPowerAt <= 0) { const types: PowerType[] = ['shield', 'freeze', 'double', 'time']; this.powerUps.push({ x: 24 + Math.random() * (VW - 48), t: 10, type: types[Math.floor(Math.random() * types.length)] }); this.nextPowerAt = 12 + Math.random() * 6; }
      } else { for (let i = this.powerUps.length - 1; i >= 0; i--) { this.powerUps[i].t -= dt; if (this.powerUps[i].t <= 0) this.powerUps.splice(i, 1); } }
    }

    for (let i = this.scorePopups.length - 1; i >= 0; i--) { this.scorePopups[i].t -= dt; if (this.scorePopups[i].t <= 0) this.scorePopups.splice(i, 1); }

    const fr = this.pig.row;
    if (fr >= 6 && fr <= 10) {
      const lane = fr - 6;
      for (const c of this.cars) { if (c.lane === lane && this.pig.x + 10 > c.x && this.pig.x - 10 < c.x + c.w) { this.die(); break; } }
    }
    if (fr >= 1 && fr <= 4) {
      const lane = fr - 1;
      let onLog: Log | null = null;
      const submerged = lane === TURTLE_LANE && this.turtlesSubmerged();
      if (!submerged) for (const l of this.logs) { if (l.lane === lane && this.pig.x > l.x - 4 && this.pig.x < l.x + l.w + 4) { onLog = l; break; } }
      if (onLog) { if (!frozen) { const L = this.riverLanes[lane]; this.pig.x += L.dir * L.speed * stormMult * dt; if (this.pig.x < 8 || this.pig.x > VW - 8) this.die(); } } else this.die();
      if (this.gator && this.gator.lane === lane && Math.abs(this.gator.x - this.pig.x) < 18) this.die();
    }
    if (fr === 5 && this.powerUps.length > 0) {
      for (let i = this.powerUps.length - 1; i >= 0; i--) { if (Math.abs(this.powerUps[i].x - this.pig.x) < 16) { this.pickPowerUp(this.powerUps[i]); this.powerUps.splice(i, 1); break; } }
    }
    this.rWorld();
  }
  private rWorld() {
    const g = this.g;

    // ── Background: gradient fills for visual depth ──
    this.bg.clear();

    // Goal row (row 0) — dark romantic gradient
    this.bg.fillGradientStyle(0x2a0a28, 0x2a0a28, 0x1a0518, 0x1a0518, 1);
    this.bg.fillRect(0, RY(0), VW, TS);

    // River rows (1-4) — deep blue gradient with shimmer
    this.bg.fillGradientStyle(0x0d2440, 0x0d2440, 0x0a1a30, 0x0a1a30, 1);
    this.bg.fillRect(0, RY(1), VW, TS * 4);

    // Median row (5) — grassy
    this.bg.fillGradientStyle(0x1c1428, 0x1c1428, 0x14101e, 0x14101e, 1);
    this.bg.fillRect(0, RY(5), VW, TS);

    // Road rows (6-10) — dark asphalt gradient
    this.bg.fillGradientStyle(0x16161f, 0x16161f, 0x0e0e14, 0x0e0e14, 1);
    this.bg.fillRect(0, RY(6), VW, TS * 5);

    // Start row (11) — safe zone
    this.bg.fillGradientStyle(0x1c0a18, 0x1c0a18, 0x140810, 0x140810, 1);
    this.bg.fillRect(0, RY(11), VW, TS);

    // ── Water shimmer effect ──
    for (let i = 0; i < 4; i++) {
      const y = RY(1 + i) + TS / 2 + Math.sin(this.blink * 2 + i) * 3;
      this.bg.fillStyle(0x3a7aaa, 0.2);
      this.bg.fillRect(0, y, VW, 2);
      // extra sparkle
      const sx = (this.blink * 30 + i * 120) % VW;
      this.bg.fillStyle(0xbfe8ff, 0.3);
      this.bg.fillRect(sx, y - 1, 6, 1);
      this.bg.fillRect((sx + 250) % VW, y + 1, 4, 1);
    }

    // ── Road lane markings (dashed yellow) ──
    this.bg.fillStyle(0xd9d9a0, 0.4);
    for (let r = 7; r <= 10; r++)
      for (let x = 0; x < VW; x += 42)
        this.bg.fillRect(x, RY(r) - 1, 24, 2);

    // ── Lane separators (subtle white lines) ──
    this.bg.fillStyle(0xffffff, 0.05);
    for (let r = 7; r <= 10; r++) this.bg.fillRect(0, RY(r), VW, 1);

    // ── Vignette border effect ──
    this.bg.lineStyle(2, 0x000000, 0.4);
    this.bg.strokeRect(0, HUD_H, VW, VH - HUD_H);

    // ── Floating hearts in goal zone ──
    for (let i = 0; i < 5; i++) {
      const hx = (i * 97 + 20 + Math.sin(this.blink * 0.5 + i) * 15) % VW;
      const hy = RY(0) + 4 + Math.sin(this.blink * 0.7 + i * 1.7) * 3;
      this.bg.fillStyle(0xff4d8c, 0.15 + Math.sin(this.blink + i) * 0.05);
      this.bg.fillCircle(hx, hy, 3);
      this.bg.fillTriangle(hx - 2, hy + 1, hx + 2, hy + 1, hx, hy + 5);
    }

    g.save(); g.translateCanvas(this.shakeX, this.shakeY);

    // ── Goal pens — female characters ──
    for (let i = 0; i < GOAL_XS.length; i++) {
      const x = GOAL_XS[i];
      // Pen background with gradient
      g.fillGradientStyle(0x2a1830, 0x2a1830, 0x1a1020, 0x1a1020, 1);
      g.fillRect(x - 22, RY(0) + 3, 44, TS - 6);
      // Border
      g.lineStyle(2, this.goals[i] ? 0xff6b9d : 0x4a2a50, 0.9);
      g.strokeRect(x - 22, RY(0) + 3, 44, TS - 6);
      // Hearts between pens
      if (i < GOAL_XS.length - 1) {
        const mx = (x + GOAL_XS[i + 1]) / 2;
        this.bg.fillStyle(0xff4d8c, 0.25); this.bg.fillCircle(mx, RY(0) + TS / 2, 4);
        this.bg.fillTriangle(mx - 2, RY(0) + TS / 2 + 1, mx + 2, RY(0) + TS / 2 + 1, mx, RY(0) + TS / 2 + 5);
      }
      if (!this.goals[i]) {
        // Show female character dimmed/behind glass before reaching her
        this.ui.fillStyle(0x000000, 0.35);
        this.ui.fillRect(x - 21, RY(0) + 4, 42, TS - 8);
        this.rFemale(g, x, RY(0) + TS / 2, 13, i);
        // Overlay a subtle shimmer to indicate she's waiting
        const pulse = 0.2 + Math.sin(this.blink * 2 + i) * 0.1;
        this.ui.fillStyle(0xff4d8c, pulse);
        this.ui.fillCircle(x, RY(0) + TS / 2, 5);
      } else {
        this.rFemale(g, x, RY(0) + TS / 2, 13, i);
        // Sparkle effect for won pens
        for (let s = 0; s < 3; s++) {
          const sx = x + Math.sin(this.blink * 2 + s * 2 + i) * 10;
          const sy = RY(0) + TS / 2 - 8 + Math.cos(this.blink * 1.5 + s * 3 + i) * 8;
          this.ui.fillStyle(0xffd700, 0.4 + Math.sin(this.blink + s + i) * 0.2);
          this.ui.fillCircle(sx, sy, 1.5);
        }
      }
    }

    // ── Logs (with turtle variant) ──
    const submerged = this.turtlesSubmerged();
    for (const l of this.logs) {
      const y = RY(1 + l.lane) + 5;
      if (l.lane === TURTLE_LANE) {
        const a = submerged ? 0.35 : 1;
        // Turtle shell base
        g.fillStyle(0x2e7d4f, a); g.fillRect(l.x, y + (submerged ? 6 : 0), l.w, TS - 10 - (submerged ? 6 : 0));
        g.fillStyle(0x4bb374, a);
        for (let x = l.x + 8; x < l.x + l.w - 6; x += 22) {
          g.fillCircle(x, y + 6, 6);
          // shell pattern
          g.fillStyle(0x1a5a2f, a * 0.5);
          g.fillCircle(x, y + 6, 2);
          g.fillStyle(0x4bb374, a);
        }
        if (submerged) { g.fillStyle(0x9fd9ff, 0.4); g.fillRect(l.x, y - 1, l.w, 2); }
        continue;
      }
      // Wood log with gradient
      g.fillStyle(0x6a4a26); g.fillRect(l.x, y, l.w, TS - 10);
      g.fillStyle(0x8a6236); g.fillRect(l.x, y, l.w, 5);
      g.fillStyle(0x503618, 0.8);
      for (let x = l.x + 10; x < l.x + l.w - 8; x += 26) g.fillRect(x, y + 8, 3, TS - 20);
      // log end caps
      g.fillStyle(0x5a3a1e); g.fillCircle(l.x, y + (TS - 10) / 2, 5); g.fillCircle(l.x + l.w, y + (TS - 10) / 2, 5);
    }

    // ── Cars with depth ──
    for (const c of this.cars) {
      const y = RY(6 + c.lane) + 5;
      // shadow
      g.fillStyle(0x000000, 0.3); g.fillRect(c.x + 2, y + TS - 13, c.w, 2);
      // body base (darker)
      g.fillStyle(shade(c.color, -0.3)); g.fillRect(c.x, y + 3, c.w, TS - 13);
      // body top (brighter)
      g.fillStyle(c.color); g.fillRect(c.x + 2, y, c.w - 4, TS - 16);
      // windshield
      g.fillStyle(0xbfe8ff, 0.8);
      const L = this.roadLanes[c.lane];
      g.fillRect(L.dir > 0 ? c.x + c.w - 12 : c.x + 4, y + 3, 8, 6);
      // headlight glow
      g.fillStyle(0xfff8a0, 0.6);
      if (L.dir > 0) g.fillCircle(c.x + c.w, y + 5, 2);
      else g.fillCircle(c.x, y + 5, 2);
    }

    // ── Gator ──
    if (this.gator) {
      const gt = this.gator, y = RY(1 + gt.lane) + TS / 2;
      // body shadow
      g.fillStyle(0x1c3a1c, 0.9); g.fillEllipse(gt.x, y, 30, 12);
      // back ridges
      g.fillStyle(0x2a5a2a);
      for (let i = -1; i <= 1; i++) g.fillTriangle(gt.x + i * 8 - 3, y - 4, gt.x + i * 8 + 3, y - 4, gt.x + i * 8, y - 8);
      // eyes
      g.fillStyle(0x0a1a0a); g.fillCircle(gt.x + gt.dir * 14, y - 3, 3.5); g.fillCircle(gt.x + gt.dir * 20, y - 3, 3.5);
      g.fillStyle(0xff5c2b, 0.8 + Math.sin(this.blink * 8) * 0.2);
      g.fillCircle(gt.x + gt.dir * 14, y - 3, 1.3); g.fillCircle(gt.x + gt.dir * 20, y - 3, 1.3);
    }

    // ── Power-ups on median ──
    for (const pu of this.powerUps) {
      const y = RY(5) + TS / 2 + Math.sin(this.blink * 3 + (pu.x % 10)) * 3;
      const flashing = pu.t < 2.5 && this.blink % 0.3 < 0.15;
      if (!flashing) {
        const c = POWER_COLORS[pu.type];
        drawGlow(g, pu.x, y, 12, c, 0.6);
        g.fillStyle(c); g.fillCircle(pu.x, y, 6);
        g.fillTriangle(pu.x - 4, y, pu.x + 4, y, pu.x, y + 6);
        g.fillStyle(0x1a1a2e, 0.85);
        const puTxt = this.txt(22).setOrigin(0.5, 0.5).setFontSize(7).setText(POWER_SYMBOLS[pu.type]).setPosition(pu.x, y).setVisible(true);
        this.setReadable(puTxt, '#fff', 2);
      }
    }

    // ── Full-body pig (with bounce offset) ──
    let bounceOff = 0;
    if (this.pigBounce > 0) bounceOff = Math.sin(this.pigBounce * Math.PI * 4) * 2;

    if (this.deathT > 0) {
      if (this.blink % 0.2 < 0.1) { g.fillStyle(0xff5c5c, 0.8); g.fillCircle(this.pig.x, RY(this.pig.row) + TS / 2, 10); }
      const dieTxt = this.txt(7).setOrigin(0.5, 0).setFontSize(10).setText('ADUH KENA!').setPosition(this.pig.x, RY(this.pig.row) - 18).setVisible(true);
      this.setReadable(dieTxt, '#ff6b6b', 3);
    } else {
      this.rPigFull(g, this.pig.x, RY(this.pig.row) + TS / 2 - bounceOff, 1.0);
    }

    // ── Shield visual ──
    if (this.hasPower('shield')) {
      const px = this.pig.x, py = RY(this.pig.row) + TS / 2 - bounceOff;
      const pulse = 0.15 + Math.sin(this.blink * 5) * 0.08;
      g.lineStyle(2, 0xff6b9d, pulse); g.strokeCircle(px, py, 15);
      g.lineStyle(1, 0xff9ec4, pulse * 0.6); g.strokeCircle(px, py, 17);
    }

    this.drawParticles(g);
    g.restore();

    // ── Score popups (bigger, gold, with shadow) ──
    for (const sp of this.scorePopups) {
      const a = Math.max(0, sp.t / 1.2);
      const yy = sp.y - (1 - a) * 25;
      const popTxt = this.txt(23).setOrigin(0.5, 0).setFontSize(9).setText(sp.text).setPosition(sp.x, yy).setAlpha(a).setVisible(true);
      this.setReadable(popTxt, '#ffd700', 3);
    }

    // ── Dialogue bubble with wrapped text (bigger, readable) ──
    if (this.dialogueT > 0 && this.deathT <= 0) {
      const dx = this.pig.x;
      const dy = RY(this.pig.row) - 20; // above pig's head
      const lines = wrapText(this.dialogueText, 12); // maxChars 12 for bigger font
      const lineH = 11;
      const bw = Math.max(60, Math.max(...lines.map(l => l.length)) * 7.5 + 14);
      const bh = lines.length * lineH + 10;
      const bx = Math.max(2, Math.min(VW - bw - 2, dx - bw / 2));
      // bubble shadow
      this.ui.fillStyle(0x000000, 0.3); this.ui.fillRoundedRect(bx + 2, dy - bh + 2, bw, bh, 5);
      // bubble bg
      this.ui.fillStyle(0xffffff, 0.95);
      this.ui.fillRoundedRect(bx, dy - bh, bw, bh, 5);
      // bubble border
      this.ui.lineStyle(1.5, 0xff6b9d, 0.7);
      this.ui.strokeRoundedRect(bx, dy - bh, bw, bh, 5);
      // tail
      const tailX = Math.max(bx + 8, Math.min(bx + bw - 8, dx));
      this.ui.fillStyle(0xffffff, 0.95);
      this.ui.fillTriangle(tailX - 4, dy + 2, tailX + 4, dy + 2, tailX, dy + 8);
      this.ui.lineStyle(1.5, 0xff6b9d, 0.7);
      this.ui.beginPath();
      this.ui.moveTo(tailX - 4, dy + 2); this.ui.lineTo(tailX, dy + 8); this.ui.lineTo(tailX + 4, dy + 2);
      this.ui.strokePath();
      // text lines — readable font size
      for (let li = 0; li < lines.length; li++) {
        const lineTxt = this.txt(21).setOrigin(0.5, 0).setFontSize(9).setText(lines[li]).setPosition(bx + bw / 2, dy - bh + 5 + li * lineH).setVisible(true);
        this.setReadable(lineTxt, '#1a1420', 2);
      }
    }

    // ── Active power-up indicators (bigger, readable) ──
    let pIdx = 0;
    for (const key of Object.keys(this.activePowers) as PowerType[]) {
      const p = this.activePowers[key];
      if (p && p.t > 0) {
        const px = 130 + pIdx * 62;
        const pc = POWER_COLORS[key];
        // bg bar with border
        this.ui.fillStyle(0x000000, 0.5); this.ui.fillRoundedRect(px - 2, 19, 56, 12, 2);
        this.ui.fillStyle(pc, 0.2); this.ui.fillRoundedRect(px, 21, 52, 8, 2);
        this.ui.fillStyle(pc, 0.7); this.ui.fillRoundedRect(px, 21, 52 * (p.t / 8), 8, 2);
        this.ui.lineStyle(1, pc, 0.8); this.ui.strokeRoundedRect(px, 21, 52, 8, 2);
        const powIndTxt = this.txt(24 + pIdx).setOrigin(0, 0).setFontSize(7).setText(POWER_SYMBOLS[key] + ' ' + Math.ceil(p.t) + 's').setPosition(px + 2, 22).setVisible(true);
        this.setReadable(powIndTxt, '#fff', 2);
        pIdx++;
      }
    }

    // ── Storm effects ──
    const sinceStorm = this.stormT - this.nextStormAt;
    const stormWarn = this.level >= STORM_FROM_LEVEL && sinceStorm >= -STORM_WARN_S && sinceStorm < 0;
    const stormActive = this.level >= STORM_FROM_LEVEL && sinceStorm >= 0 && sinceStorm < STORM_DURATION_S;
    if (stormActive && !this.hasPower('freeze')) {
      this.ui.fillStyle(0x1a2a4a, 0.15); this.ui.fillRect(0, HUD_H, VW, VH - HUD_H);
      for (let i = 0; i < 18; i++) { const rx = (i * 53 + this.blink * 300) % VW; const ry = HUD_H + ((i * 71 + this.blink * 500) % (VH - HUD_H)); this.ui.lineStyle(1, 0x9fd9ff, 0.35); this.ui.beginPath(); this.ui.moveTo(rx, ry); this.ui.lineTo(rx - 4, ry + 10); this.ui.strokePath(); }
    }
    if (stormWarn && this.blink % 0.4 < 0.22) {
      const stormTxt = this.txt(20).setOrigin(0.5, 0).setFontSize(10).setText('BADA!').setPosition(VW / 2, HUD_H + 6).setVisible(true);
      this.setReadable(stormTxt, '#7ce3ff', 3);
    }

    // ── HUD bar (cleaner, semi-transparent with colored border) ──
    this.ui.fillStyle(0x0a0a18, 0.92); this.ui.fillRect(0, 0, VW, HUD_H);
    this.ui.lineStyle(2, 0xff6b9d, 0.6); this.ui.lineBetween(0, HUD_H - 2, VW, HUD_H - 2);
    this.ui.lineStyle(1, 0xff9ec4, 0.2); this.ui.lineBetween(0, HUD_H - 4, VW, HUD_H - 4);

    // Score (big, bold)
    const scoreHudTxt = this.txt(0).setOrigin(0, 0).setFontSize(11).setText(String(this.score).padStart(6, '0')).setPosition(8, 9).setVisible(true);
    this.setReadable(scoreHudTxt, '#f4f8ff', 3);

    // Score label
    const scoreLbl = this.txt(1).setOrigin(0, 0).setFontSize(8).setText('SKOR').setPosition(8, 22).setVisible(true);
    this.setReadable(scoreLbl, '#93a8d9', 2);

    // Level indicator
    const lvHudTxt = this.txt(2).setOrigin(0, 0).setFontSize(10).setText('LV ' + this.level).setPosition(95, 9).setVisible(true);
    this.setReadable(lvHudTxt, '#ff6b9d', 3);

    // Combo
    if (this.comboCount > 1) {
      const comboHudTxt = this.txt(5).setOrigin(0, 0).setFontSize(8).setText('COMBO x' + this.comboCount).setPosition(95, 22).setVisible(true);
      this.setReadable(comboHudTxt, '#ffd23f', 2);
    }

    // Daily mode indicator
    if (this.daily) {
      const dailyTxt = this.txt(19).setOrigin(0, 0).setFontSize(8).setText('HARIAN').setPosition(160, 22).setVisible(true);
      this.setReadable(dailyTxt, '#ffd23f', 2);
    }

    // ── Timer bar (thicker, with gradient + tick marks) ──
    const tw = 120, tfrac = Math.max(0, this.timeLeft / 30);
    const tx = VW / 2 - tw / 2;
    // bg
    this.ui.fillStyle(0x03040c, 0.8); this.ui.fillRoundedRect(tx - 2, 8, tw + 4, 14, 3);
    // timer fill (color shifts: green -> yellow -> red)
    let timerColor = 0xff6b9d;
    if (tfrac > 0.5) timerColor = 0x6bff8c;
    else if (tfrac > 0.25) timerColor = 0xffd23f;
    else timerColor = 0xff5c5c;
    this.ui.fillStyle(timerColor, 0.9); this.ui.fillRoundedRect(tx, 10, tw * tfrac, 10, 2);
    // border
    this.ui.lineStyle(1, 0xff9ec4, 0.5); this.ui.strokeRoundedRect(tx - 2, 8, tw + 4, 14, 3);
    // tick marks
    this.ui.fillStyle(0xffffff, 0.2);
    for (let ti = 1; ti < 6; ti++) this.ui.fillRect(tx + (tw * ti / 6), 10, 1, 10);

    // Timer label
    const timerLbl = this.txt(3).setOrigin(0.5, 0).setFontSize(7).setText(Math.ceil(this.timeLeft) + 's').setPosition(VW / 2, 23).setVisible(true);
    this.setReadable(timerLbl, '#f4f8ff', 2);

    // ── Lives (mini pig icons) ──
    for (let i = 0; i < this.lives; i++) this.rPigMini(this.ui, VW - 14 - i * 18, 16);
  }

  // ── Full-body pig character — REDESIGNED for cuteness ──
  // Chunky round body, big head (baby proportions), stubby legs, big cute eyes.
  // scale=1.0 for normal tile (fits ~28x28), larger for title screen.
  private rPigFull(g: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
    const s = scale;
    const headR = 6.5 * s;
    const bodyW = 14 * s;
    const bodyH = 10 * s;
    const bodyY = y + 2 * s;
    const headY = y - bodyH * 0.35;

    drawGlow(g, x, y, bodyW * 1.3, 0xff6b9d, 0.15);

    // Shadow on ground
    g.fillStyle(0x000000, 0.12);
    g.fillEllipse(x, y + bodyH * 0.75, bodyW * 0.9, 4 * s);

    // ── Small curly tail ──
    g.lineStyle(2 * s, PIG_BLUSH, 0.8);
    const tx = x + bodyW * 0.45, ty = bodyY - bodyH * 0.1;
    g.beginPath(); g.moveTo(tx, ty);
    for (let ti = 0; ti < 6; ti++) {
      const tt = ti / 6;
      g.lineTo(tx + tt * 5 * s + Math.sin(tt * Math.PI * 3 + this.blink * 3) * 2.5 * s, ty - tt * 8 * s);
    }
    g.strokePath();

    // ── Body (drawn FIRST so legs go ON TOP) ──
    g.fillStyle(PIG_BODY);
    g.fillEllipse(x, bodyY, bodyW, bodyH);
    g.fillStyle(PIG_BELLY, 0.6);
    g.fillEllipse(x, bodyY + 1 * s, bodyW * 0.6, bodyH * 0.5);

    // ── Legs (drawn AFTER body — BIG and visible) ──
    const legW = 5.5 * s, legH = 6 * s;
    const legY = bodyY + bodyH / 2 - 1 * s;
    const legBob = Math.sin(this.blink * 8 + this.pig.walkCycle * 0.5) * 0.6 * s;
    // Two BIG stubby legs — visible at any scale
    const legColor = 0xbb6880; // clearly darker than PIG_BODY
    g.fillStyle(legColor);
    // Left leg (front)
    g.fillRoundedRect(x - 4.5 * s, legY + legBob, legW, legH, 2);
    // Right leg (front)
    g.fillRoundedRect(x + 2 * s, legY - legBob, legW, legH, 2);
    // Hooves — even darker tips
    g.fillStyle(PIG_NOSTRIL);
    g.fillRoundedRect(x - 4.5 * s, legY + legBob + legH - 2 * s, legW, 2 * s, 1);
    g.fillRoundedRect(x + 2 * s, legY - legBob + legH - 2 * s, legW, 2 * s, 1);

    // ── Ears (floppy triangles at sides of head) ──
    const earWag = Math.sin(this.blink * 3) * 1 * s;
    g.fillStyle(PIG_BLUSH);
    // left ear
    g.fillTriangle(
      x - headR * 0.9, headY - headR * 0.1 + earWag,
      x - headR * 0.4, headY - headR * 0.9 + earWag,
      x - headR * 0.15, headY - headR * 0.2 + earWag
    );
    // right ear
    g.fillTriangle(
      x + headR * 0.9, headY - headR * 0.1 - earWag,
      x + headR * 0.4, headY - headR * 0.9 - earWag,
      x + headR * 0.15, headY - headR * 0.2 - earWag
    );
    // inner ears (lighter)
    g.fillStyle(PIG_BELLY, 0.6);
    g.fillTriangle(
      x - headR * 0.7, headY - headR * 0.15 + earWag,
      x - headR * 0.45, headY - headR * 0.7 + earWag,
      x - headR * 0.25, headY - headR * 0.25 + earWag
    );
    g.fillTriangle(
      x + headR * 0.7, headY - headR * 0.15 - earWag,
      x + headR * 0.45, headY - headR * 0.7 - earWag,
      x + headR * 0.25, headY - headR * 0.25 - earWag
    );

    // ── Head (big circle) ──
    g.fillStyle(PIG_BODY);
    g.fillCircle(x, headY, headR);

    // ── Blush (obvious pink circles on cheeks) ──
    const blushAlpha = this.pig.blush > 0 || this.pig.heartEyes
      ? 0.5 + Math.sin(this.blink * 3) * 0.1
      : 0.25;
    g.fillStyle(PIG_BLUSH, blushAlpha);
    g.fillCircle(x - headR * 0.55, headY + headR * 0.15, headR * 0.28);
    g.fillCircle(x + headR * 0.55, headY + headR * 0.15, headR * 0.28);

    // ── Eyes (BIG cute anime-style) ──
    if (this.pig.heartEyes) {
      // Heart eyes when in love
      g.fillStyle(0xff1a5c);
      const eyeY = headY - headR * 0.05;
      for (const ex of [x - headR * 0.35, x + headR * 0.35]) {
        g.fillCircle(ex - headR * 0.08, eyeY, headR * 0.12);
        g.fillCircle(ex + headR * 0.08, eyeY, headR * 0.12);
        g.fillTriangle(ex - headR * 0.16, eyeY + 0.5, ex + headR * 0.16, eyeY + 0.5, ex, eyeY + headR * 0.22);
      }
    } else {
      // Big white eye circles
      const eyeY = headY - headR * 0.05;
      const eyeRX = headR * 0.2; // eye radius
      // left eye white
      g.fillStyle(0xffffff);
      g.fillCircle(x - headR * 0.35, eyeY, eyeRX);
      // right eye white
      g.fillCircle(x + headR * 0.35, eyeY, eyeRX);
      // big black pupils
      g.fillStyle(0x1a1420);
      g.fillCircle(x - headR * 0.33, eyeY + 0.5 * s, eyeRX * 0.65);
      g.fillCircle(x + headR * 0.37, eyeY + 0.5 * s, eyeRX * 0.65);
      // tiny white shine (anime style)
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(x - headR * 0.3, eyeY - 0.5 * s, eyeRX * 0.25);
      g.fillCircle(x + headR * 0.4, eyeY - 0.5 * s, eyeRX * 0.25);
    }

    // ── Snout (clear oval with two nostrils) ──
    g.fillStyle(PIG_SNOUT);
    g.fillEllipse(x, headY + headR * 0.4, headR * 0.9, headR * 0.6);
    // nostrils
    g.fillStyle(PIG_NOSTRIL);
    g.fillCircle(x - headR * 0.2, headY + headR * 0.4, headR * 0.1);
    g.fillCircle(x + headR * 0.2, headY + headR * 0.4, headR * 0.1);

    // ── Smile ──
    g.lineStyle(1, PIG_NOSTRIL, 0.6);
    g.beginPath(); g.arc(x, headY + headR * 0.55, headR * 0.3, 0.2, Math.PI - 0.2, false); g.strokePath();
  }

  // ── Mini pig (for HUD lives) ──
  private rPigMini(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    const s = 0.5;
    const r = 6 * s;
    // body
    g.fillStyle(PIG_BODY);
    g.fillCircle(x, y, r);
    // ears
    g.fillStyle(PIG_BLUSH);
    g.fillTriangle(x - r * 0.7, y - r * 0.25, x - r * 0.15, y - r * 0.85, x + r * 0.05, y - r * 0.3);
    g.fillTriangle(x + r * 0.7, y - r * 0.25, x + r * 0.15, y - r * 0.85, x - r * 0.05, y - r * 0.3);
    // big eyes
    g.fillStyle(0xffffff);
    g.fillCircle(x - r * 0.3, y - r * 0.05, r * 0.2);
    g.fillCircle(x + r * 0.3, y - r * 0.05, r * 0.2);
    g.fillStyle(0x1a1420);
    g.fillCircle(x - r * 0.28, y - r * 0.02, r * 0.12);
    g.fillCircle(x + r * 0.32, y - r * 0.02, r * 0.12);
    // snout
    g.fillStyle(PIG_SNOUT);
    g.fillEllipse(x, y + r * 0.4, r * 0.7, r * 0.4);
    g.fillStyle(PIG_NOSTRIL);
    g.fillCircle(x - r * 0.15, y + r * 0.4, r * 0.08);
    g.fillCircle(x + r * 0.15, y + r * 0.4, r * 0.08);
  }

  // ── Female character — REDESIGNED for cuteness ──
  // A-line dress, big anime eyes, flowing hair, visible shape.
  private rFemale(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, idx: number) {
    const hairColors = [0x2a1a0a, 0x6a1a4a, 0x4a2a0a, 0x0a1a2a, 0x8a2a5a];
    const dressColors = [0xff4d8c, 0xff6b9d, 0xcc3d7a, 0xff8db5, 0xff3d6b];
    const hairColor = hairColors[idx % 5];
    const dressColor = dressColors[idx % 5];
    const skinColor = 0xffe8dd;

    // ── Halo/glow behind her ──
    drawGlow(g, x, y, r + 6, dressColor, 0.25);

    // ── Hair (back layer — flowing shape) ──
    const hairSway = Math.sin(this.blink * 1.5 + idx) * 1.5;
    g.fillStyle(hairColor);
    // back hair mass (bigger, more shape)
    g.fillEllipse(x + hairSway * 0.3, y - r * 0.4, r * 1.4, r * 1.1);
    // side hair strands (flowing down)
    g.fillEllipse(x - r * 0.55 + hairSway, y + r * 0.1, r * 0.4, r * 0.7);
    g.fillEllipse(x + r * 0.55 + hairSway, y + r * 0.1, r * 0.4, r * 0.7);

    // ── Dress (A-line trapezoid, wider at bottom) ──
    g.fillStyle(dressColor);
    const dressTopW = r * 0.5;
    const dressBotW = r * 0.95;
    g.beginPath();
    g.moveTo(x - dressTopW, y + r * 0.05);
    g.lineTo(x + dressTopW, y + r * 0.05);
    g.lineTo(x + dressBotW, y + r * 1.05);
    g.lineTo(x - dressBotW, y + r * 1.05);
    g.closePath();
    g.fillPath();
    // dress shading
    g.fillStyle(0xffffff, 0.15);
    g.beginPath();
    g.moveTo(x - dressTopW * 0.5, y + r * 0.05);
    g.lineTo(x, y + r * 0.05);
    g.lineTo(x + dressBotW * 0.3, y + r * 1.05);
    g.lineTo(x - dressBotW * 0.5, y + r * 1.05);
    g.closePath();
    g.fillPath();
    // belt
    g.fillStyle(0xffffff, 0.4);
    g.fillRect(x - dressTopW, y + r * 0.25, dressTopW * 2, r * 0.06);

    // ── Neck ──
    g.fillStyle(skinColor);
    g.fillRect(x - r * 0.12, y - r * 0.1, r * 0.24, r * 0.2);

    // ── Face ──
    g.fillStyle(skinColor);
    g.fillCircle(x, y - r * 0.35, r * 0.4);

    // ── Hair (front layer — bangs) ──
    g.fillStyle(hairColor);
    // bangs arc across forehead
    g.fillEllipse(x + hairSway * 0.5, y - r * 0.6, r * 0.8, r * 0.35);
    // side bangs
    g.fillEllipse(x - r * 0.35 + hairSway, y - r * 0.4, r * 0.25, r * 0.4);
    g.fillEllipse(x + r * 0.35 + hairSway, y - r * 0.4, r * 0.25, r * 0.4);

    // ── Eyes (BIG anime-style) ──
    const eyeOpen = Math.sin(this.blink * 3 + idx * 2) > -0.7;
    if (eyeOpen) {
      const eyeY = y - r * 0.32;
      // big white eye circles
      g.fillStyle(0xffffff);
      g.fillCircle(x - r * 0.16, eyeY, r * 0.12);
      g.fillCircle(x + r * 0.16, eyeY, r * 0.12);
      // big dark pupils
      g.fillStyle(0x2a1a3a);
      g.fillCircle(x - r * 0.15, eyeY + r * 0.02, r * 0.08);
      g.fillCircle(x + r * 0.17, eyeY + r * 0.02, r * 0.08);
      // eye shine (anime highlight)
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(x - r * 0.13, eyeY - r * 0.03, r * 0.03);
      g.fillCircle(x + r * 0.19, eyeY - r * 0.03, r * 0.03);
      // eyelashes
      g.lineStyle(1, 0x1a1420, 0.7);
      for (const side of [-1, 1]) {
        const ex = x + side * r * 0.16;
        g.beginPath(); g.moveTo(ex - 1.5, eyeY - r * 0.1); g.lineTo(ex - 3, eyeY - r * 0.16); g.strokePath();
        g.beginPath(); g.moveTo(ex + 1.5, eyeY - r * 0.1); g.lineTo(ex + 3, eyeY - r * 0.16); g.strokePath();
        g.beginPath(); g.moveTo(ex, eyeY - r * 0.1); g.lineTo(ex, eyeY - r * 0.18); g.strokePath();
      }
    } else {
      // closed eye lines (happy blink)
      g.lineStyle(1.5, 0x1a1420, 0.7);
      g.beginPath(); g.moveTo(x - r * 0.25, y - r * 0.32); g.lineTo(x - r * 0.07, y - r * 0.32); g.strokePath();
      g.beginPath(); g.moveTo(x + r * 0.07, y - r * 0.32); g.lineTo(x + r * 0.25, y - r * 0.32); g.strokePath();
    }

    // ── Lips (small red dot) ──
    g.fillStyle(0xd94d6b);
    g.fillCircle(x, y - r * 0.18, r * 0.05);

    // ── Blush (obvious pink circles) ──
    g.fillStyle(0xff6b9d, 0.35);
    g.fillCircle(x - r * 0.28, y - r * 0.22, r * 0.1);
    g.fillCircle(x + r * 0.28, y - r * 0.22, r * 0.1);

    // ── Dress dots (decoration) ──
    g.fillStyle(0xffffff, 0.2);
    for (let di = 0; di < 3; di++)
      g.fillCircle(x + (di - 1) * r * 0.3, y + r * 0.6 + di * r * 0.1, r * 0.04);

    // ── Floating hearts ──
    for (let hi = 0; hi < 2; hi++) {
      const hx = x + (idx % 2 === 0 ? -1 : 1) * (r * 0.7 + Math.sin(this.blink * 2 + hi + idx) * 3);
      const hy = y - r * 0.9 + Math.sin(this.blink * 1.5 + hi * 2) * 2;
      g.fillStyle(0xff4d8c, 0.3 + Math.sin(this.blink + hi + idx) * 0.12);
      g.fillCircle(hx, hy, 2.5);
      g.fillTriangle(hx - 1.5, hy, hx + 1.5, hy, hx, hy + 3);
    }
  }
}
