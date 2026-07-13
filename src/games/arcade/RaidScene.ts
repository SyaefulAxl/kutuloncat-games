import { ArcadeScene, VW, VH, sfx, drawGlow, drawSpriteGrid, startSession, submitScore, SessionCtx, SpriteGrid } from './kit';
import { SP } from '../spacepanic/sprites';

// ── SERBU BALIK ALIEN — Galaga-style wave shooter ──
// The aliens from Space Panic strike back. Drag to steer, the ship fires by
// itself; chained kills inside 1.5s multiply the score (×2..×5). A formation
// oscillates and dives; every 5th wave is the Gold Overlord.
const HUD_H = 30;

const SHIP: SpriteGrid = [
  [0, 0, 0, 0, 1, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 0, 0, 0],
  [1, 0, 1, 1, 1, 1, 1, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 0, 1, 1, 1, 0, 1, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 1],
];
const ROW_TYPES = [
  { grid: 'er', color: 0xff4444, pts: 30 },
  { grid: 'eo', color: 0xff8833, pts: 20 },
  { grid: 'eg', color: 0x33cc33, pts: 10 },
  { grid: 'eb', color: 0x4488ff, pts: 40 },
  { grid: 'ep', color: 0xb45cff, pts: 50 },
];

interface Alien { col: number; row: number; alive: boolean; mode: 'grid' | 'dive'; dx: number; dy: number; dt2: number; fired: boolean }
interface Shot { x: number; y: number; vy: number }

export class RaidScene extends ArcadeScene {
  private gs = 'TITLE';
  private score = 0; private lives = 3; private wave = 1;
  private shipX = VW / 2; private inv = 0; private fireT = 0;
  private shots: Shot[] = []; private eshots: Shot[] = [];
  private aliens: Alien[] = [];
  private formX = 0; private formDir = 1; private formY = 0;
  private boss: { x: number; y: number; hp: number; maxHp: number; t: number } | null = null;
  private eFireT = 1.5; private diveT = 3;
  private combo = 0; private comboT = 0; private maxCombo = 0;
  private kills = 0; private shotsFired = 0; private hits = 0;
  private stateT = 0; private waveBonus = 0;
  private startTime = 0; private sess: SessionCtx = null;
  private booms: { x: number; y: number; t: number; c: number }[] = [];

  constructor() { super({ key: 'RaidScene' }); }

  private isBossWave() { return this.wave % 5 === 0; }

  private buildWave() {
    this.shots = []; this.eshots = []; this.aliens = []; this.boss = null; this.booms = [];
    this.formX = 0; this.formDir = 1; this.formY = 0;
    this.eFireT = Math.max(0.5, 1.6 - this.wave * 0.08);
    this.diveT = Math.max(1.2, 3.2 - this.wave * 0.15);
    if (this.isBossWave()) {
      this.boss = { x: VW / 2, y: HUD_H + 46, hp: 12 + this.wave * 2, maxHp: 12 + this.wave * 2, t: 0 };
    } else {
      const rows = Math.min(3 + Math.floor((this.wave - 1) / 2), 5);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < 8; c++)
          this.aliens.push({ col: c, row: r, alive: true, mode: 'grid', dx: 0, dy: 0, dt2: 0, fired: false });
    }
  }

  private startGame() {
    this.score = 0; this.lives = 3; this.wave = 1;
    this.combo = 0; this.comboT = 0; this.maxCombo = 0;
    this.kills = 0; this.shotsFired = 0; this.hits = 0;
    this.shipX = VW / 2; this.inv = 0;
    this.startTime = Date.now();
    startSession('space-raid').then(s => { this.sess = s; });
    sfx.start();
    this.buildWave();
    this.gs = 'PLAYING';
  }

  private gameOver() {
    this.gs = 'GAME_OVER'; this.stateT = 0;
    sfx.death();
    submitScore('space-raid', this.score, {
      kills: this.kills, wave: this.wave, shots: this.shotsFired, hits: this.hits,
      maxCombo: this.maxCombo, durationSec: Math.floor((Date.now() - this.startTime) / 1000),
    }, this.sess);
  }

  private alienPos(a: Alien): [number, number] {
    if (a.mode === 'dive') return [a.dx, a.dy];
    return [66 + a.col * 54 + this.formX, HUD_H + 34 + a.row * 30 + this.formY];
  }

  private addKill(pts: number, x: number, y: number, c: number) {
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = 1.5; this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += pts * Math.min(this.combo, 5);
    this.kills++; this.hits++;
    this.booms.push({ x, y, t: 0, c });
    sfx.boom();
    // Boss kills (pts>=1500) get a much bigger shake+debris burst than a
    // regular alien pop.
    const isBoss = pts >= 1500;
    this.shake(isBoss ? 0.35 : 0.1, isBoss ? 7 : 2);
    this.spawnParticles(x, y, c, isBoss ? 24 : 8, isBoss ? 110 : 65);
  }

  protected tick(dt: number) {
    sfx.musicTick(this.gs === 'PLAYING', this.lives <= 1 ? 1 : 0);
    this.drawSpaceBg();
    this.g.clear(); this.ui.clear();
    for (const t of this.txts) t.setVisible(false);
    if (this.gs === 'TITLE') this.uTitle();
    else if (this.gs === 'PLAYING') this.uPlay(dt);
    else if (this.gs === 'WAVE_CLEAR') { this.stateT += dt; this.rGame(); this.rBanner('WAVE ' + this.wave + ' CLEAR!', '+' + this.waveBonus + ' PTS'); if (this.stateT > 1.4) { this.wave++; this.buildWave(); this.gs = 'PLAYING'; } }
    else if (this.gs === 'GAME_OVER') this.uGO(dt);
  }

  private uTitle() {
    this.txt(0).setOrigin(0.5, 0).setFontSize(22).setColor('#ff8833').setText('SERBU BALIK').setPosition(VW / 2, VH * 0.16).setVisible(true);
    this.txt(1).setOrigin(0.5, 0).setFontSize(22).setColor('#7ce3ff').setText('ALIEN').setPosition(VW / 2, VH * 0.25).setVisible(true);
    drawSpriteGrid(this.g, SP.er, VW / 2 - 60, VH * 0.42, 0xff4444, false, 1.6);
    drawSpriteGrid(this.g, SP.eo, VW / 2 - 8, VH * 0.42, 0xff8833, false, 1.6);
    drawSpriteGrid(this.g, SP.eg, VW / 2 + 44, VH * 0.42, 0x33cc33, false, 1.6);
    this.txt(2).setOrigin(0.5, 0).setFontSize(7).setColor('#93a8d9').setText('KAPAL MENEMBAK OTOMATIS - RANTAI KILL = SKOR x5\nWAVE 5, 10, 15... = GOLD OVERLORD').setAlign('center').setLineSpacing(6).setPosition(VW / 2, VH * 0.56).setVisible(true);
    this.txt(3).setOrigin(0.5, 0).setFontSize(7).setColor('#5f6f9c').setText(this.isTouch ? 'GESER JARI = KEMUDIKAN KAPAL' : 'MOUSE / PANAH = KEMUDIKAN KAPAL').setPosition(VW / 2, VH * 0.66).setVisible(true);
    if (this.blink % 1 < 0.62) this.txt(4).setOrigin(0.5, 0).setFontSize(12).setColor('#7ce3ff').setText(this.isTouch ? 'TAP TO START' : 'PRESS ANY KEY').setPosition(VW / 2, VH * 0.8).setVisible(true);
    if (this.anyPress()) this.startGame();
  }

  private uGO(dt: number) {
    this.stateT += dt;
    this.rGame();
    this.ui.fillStyle(0x03040c, 0.75); this.ui.fillRect(0, 0, VW, VH);
    const acc = this.shotsFired > 0 ? Math.round((this.hits / this.shotsFired) * 100) : 0;
    this.txt(10).setOrigin(0.5, 0).setFontSize(24).setColor('#ff6b6b').setText('GAME OVER').setPosition(VW / 2, VH * 0.3).setVisible(true);
    this.txt(11).setOrigin(0.5, 0).setFontSize(10).setColor('#f4f8ff').setText('SCORE: ' + this.score).setPosition(VW / 2, VH * 0.46).setVisible(true);
    this.txt(12).setOrigin(0.5, 0).setFontSize(7).setColor('#93a8d9').setText('WAVE ' + this.wave + '  -  ' + this.kills + ' KILL  -  AKURASI ' + acc + '%').setPosition(VW / 2, VH * 0.55).setVisible(true);
    if (this.stateT > 1.2 && this.blink % 1 < 0.62) this.txt(13).setOrigin(0.5, 0).setFontSize(9).setColor('#7ce3ff').setText(this.isTouch ? 'TAP TO CONTINUE' : 'PRESS ANY KEY').setPosition(VW / 2, VH * 0.7).setVisible(true);
    if (this.stateT > 1.2 && this.anyPress()) this.gs = 'TITLE';
  }

  private uPlay(dt: number) {
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    if (this.inv > 0) this.inv -= dt;
    // steer
    if (this.keys['ArrowLeft']) this.shipX -= 300 * dt;
    else if (this.keys['ArrowRight']) this.shipX += 300 * dt;
    else this.shipX += (this.ptr.x - this.shipX) * Math.min(1, dt * 14);
    this.shipX = Math.max(16, Math.min(VW - 16, this.shipX));
    // auto-fire
    this.fireT -= dt;
    if (this.fireT <= 0 && this.shots.length < 3) {
      this.shots.push({ x: this.shipX, y: VH - 44, vy: -330 });
      this.shotsFired++; this.fireT = 0.3;
      sfx.shoot();
    }
    // formation sweep
    const alive = this.aliens.filter(a => a.alive && a.mode === 'grid');
    if (alive.length) {
      this.formX += this.formDir * (26 + this.wave * 3) * dt;
      const xs = alive.map(a => 66 + a.col * 54 + this.formX);
      if (Math.max(...xs) > VW - 30) { this.formDir = -1; this.formY += 8; }
      if (Math.min(...xs) < 30) { this.formDir = 1; this.formY += 8; }
    }
    // dives
    this.diveT -= dt;
    if (this.diveT <= 0) {
      const cands = this.aliens.filter(a => a.alive && a.mode === 'grid');
      if (cands.length) {
        const a = cands[Math.floor(Math.random() * cands.length)];
        const [px, py] = this.alienPos(a);
        a.mode = 'dive'; a.dx = px; a.dy = py; a.dt2 = 0; a.fired = false;
      }
      this.diveT = Math.max(1.2, 3.2 - this.wave * 0.15);
    }
    for (const a of this.aliens) {
      if (!a.alive || a.mode !== 'dive') continue;
      a.dt2 += dt;
      a.dy += (120 + this.wave * 8) * dt;
      a.dx += Math.sin(a.dt2 * 4) * 90 * dt + (this.shipX - a.dx) * 0.4 * dt;
      if (!a.fired && a.dy > VH * 0.45) { a.fired = true; this.eshots.push({ x: a.dx, y: a.dy, vy: 190 + this.wave * 8 }); }
      if (a.dy > VH + 24) { a.mode = 'grid'; a.dt2 = 0; }
    }
    // formation fire
    this.eFireT -= dt;
    if (this.eFireT <= 0) {
      const cands = this.aliens.filter(a => a.alive);
      if (cands.length) {
        const a = cands[Math.floor(Math.random() * cands.length)];
        const [px, py] = this.alienPos(a);
        this.eshots.push({ x: px + 8, y: py + 16, vy: 170 + this.wave * 10 });
      }
      this.eFireT = Math.max(0.5, 1.6 - this.wave * 0.08);
    }
    // boss
    if (this.boss) {
      const b = this.boss;
      b.t += dt;
      b.x = VW / 2 + Math.sin(b.t * 0.9) * (VW / 2 - 70);
      if (b.t % 1.4 < dt) {
        for (const spread of [-0.35, 0, 0.35]) {
          const sh: Shot & { vx?: number } = { x: b.x, y: b.y + 20, vy: 200 };
          sh.vx = spread * 130;
          this.eshots.push(sh);
        }
      }
    }
    // player shots
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.y += s.vy * dt;
      if (s.y < HUD_H - 6) { this.shots.splice(i, 1); continue; }
      let hit = false;
      for (const a of this.aliens) {
        if (!a.alive) continue;
        const [px, py] = this.alienPos(a);
        if (Math.abs(s.x - (px + 8)) < 13 && Math.abs(s.y - (py + 10)) < 13) {
          a.alive = false; hit = true;
          const t = ROW_TYPES[a.row % ROW_TYPES.length];
          this.addKill(t.pts, px + 8, py + 10, t.color);
          break;
        }
      }
      if (!hit && this.boss) {
        const b = this.boss;
        if (Math.abs(s.x - b.x) < 22 && Math.abs(s.y - b.y) < 18) {
          b.hp--; hit = true; this.hits++;
          sfx.hit();
          if (b.hp <= 0) { this.addKill(1500, b.x, b.y, 0xffd23f); this.boss = null; }
        }
      }
      if (hit) this.shots.splice(i, 1);
    }
    // enemy shots
    for (let i = this.eshots.length - 1; i >= 0; i--) {
      const s = this.eshots[i] as Shot & { vx?: number };
      s.y += s.vy * dt;
      if (s.vx) s.x += s.vx * dt;
      if (s.y > VH + 10) { this.eshots.splice(i, 1); continue; }
      if (this.inv <= 0 && Math.abs(s.x - this.shipX) < 12 && Math.abs(s.y - (VH - 36)) < 12) {
        this.eshots.splice(i, 1);
        this.hitPlayer();
      }
    }
    // diver collision with ship
    if (this.inv <= 0) for (const a of this.aliens) {
      if (!a.alive || a.mode !== 'dive') continue;
      if (Math.abs(a.dx - this.shipX) < 16 && Math.abs(a.dy - (VH - 36)) < 16) { a.alive = false; this.hitPlayer(); }
    }
    // formation reaching the ship = game over pressure
    if (this.formY > VH - 150 - HUD_H) { this.lives = 0; this.gameOver(); return; }
    // booms
    for (let i = this.booms.length - 1; i >= 0; i--) { this.booms[i].t += dt; if (this.booms[i].t > 0.4) this.booms.splice(i, 1); }
    // wave clear
    if (!this.boss && this.aliens.every(a => !a.alive)) {
      const acc = this.shotsFired > 0 ? this.hits / this.shotsFired : 0;
      this.waveBonus = 200 * this.wave + (acc >= 0.7 ? 300 : 0);
      this.score += this.waveBonus;
      sfx.clear();
      this.gs = 'WAVE_CLEAR'; this.stateT = 0;
    }
    this.rGame();
  }

  private hitPlayer() {
    this.lives--; this.inv = 1.6; this.combo = 0; this.comboT = 0;
    this.booms.push({ x: this.shipX, y: VH - 36, t: 0, c: 0xff5c5c });
    sfx.hit();
    this.shake(0.25, 6);
    this.spawnParticles(this.shipX, VH - 36, 0xff5c5c, 14, 90);
    if (this.lives <= 0) this.gameOver();
  }

  private rBanner(a: string, b: string) {
    this.ui.fillStyle(0x03040c, 0.7); this.ui.fillRect(0, VH * 0.34, VW, 90);
    this.txt(10).setOrigin(0.5, 0).setFontSize(14).setColor('#4bdba0').setText(a).setPosition(VW / 2, VH * 0.38).setVisible(true);
    this.txt(11).setOrigin(0.5, 0).setFontSize(10).setColor('#ffd23f').setText(b).setPosition(VW / 2, VH * 0.47).setVisible(true);
  }

  private rGame() {
    const g = this.g;
    this.ui.fillStyle(0x070716, 0.9); this.ui.fillRect(0, 0, VW, HUD_H);
    this.ui.fillStyle(0x7ce3ff, 0.4); this.ui.fillRect(0, HUD_H - 2, VW, 2);
    this.txt(0).setOrigin(0, 0).setFontSize(9).setColor('#f4f8ff').setText(String(this.score).padStart(6, '0')).setPosition(10, 10).setVisible(true);
    this.txt(1).setOrigin(0.5, 0).setFontSize(7).setColor('#93a8d9').setText('WAVE ' + this.wave).setPosition(VW / 2, 11).setVisible(true);
    if (this.combo >= 2 && this.comboT > 0) this.txt(2).setOrigin(0.5, 0).setFontSize(7).setColor('#ffd23f').setText('CHAIN x' + Math.min(this.combo, 5)).setPosition(VW / 2, 21).setVisible(true);
    for (let i = 0; i < this.lives; i++) drawSpriteGrid(this.ui, SHIP, VW - 26 - i * 22, 7, 0x7ce3ff, false, 1);
    g.save(); g.translateCanvas(this.shakeX, this.shakeY);
    // aliens
    const af = Math.floor(this.blink / 0.3) % 2;
    for (const a of this.aliens) {
      if (!a.alive) continue;
      const t = ROW_TYPES[a.row % ROW_TYPES.length];
      const [px, py] = this.alienPos(a);
      const frames = [t.grid, t.grid + '2'];
      drawSpriteGrid(g, (SP as any)[frames[af]] || (SP as any)[t.grid], px, py, t.color, af === 1, 1);
    }
    // boss
    if (this.boss) {
      const b = this.boss;
      drawGlow(g, b.x, b.y, 34, 0xffd23f, 0.4);
      drawSpriteGrid(g, (SP as any)[af === 0 ? 'eGold' : 'eGold2'], b.x - 20, b.y - 14, 0xffd23f, false, 2);
      g.fillStyle(0x03040c, 0.7); g.fillRect(b.x - 26, b.y - 26, 52, 4);
      g.fillStyle(0xff5c5c); g.fillRect(b.x - 26, b.y - 26, 52 * (b.hp / b.maxHp), 4);
    }
    // shots
    g.fillStyle(0x9df5ec);
    for (const s of this.shots) g.fillRect(s.x - 1.5, s.y - 6, 3, 10);
    g.fillStyle(0xff8a8a);
    for (const s of this.eshots) g.fillRect(s.x - 1.5, s.y - 5, 3, 8);
    // booms
    for (const bm of this.booms) {
      const r = 6 + bm.t * 55, a = 1 - bm.t / 0.4;
      g.lineStyle(3, bm.c, a); g.strokeCircle(bm.x, bm.y, r);
      g.fillStyle(0xffffff, a * 0.5); g.fillCircle(bm.x, bm.y, r * 0.3);
    }
    // ship
    if (this.gs !== 'GAME_OVER' && (this.inv <= 0 || this.blink % 0.2 < 0.1)) {
      drawGlow(g, this.shipX, VH - 36, 18, 0x7ce3ff, 0.4);
      drawSpriteGrid(g, SHIP, this.shipX - 9, VH - 43, 0xcfe8ff, false, 1);
      g.fillStyle(0xff9d42, 0.7 + Math.sin(this.blink * 20) * 0.3);
      g.fillRect(this.shipX - 3, VH - 29, 2, 4 + Math.random() * 3);
      g.fillRect(this.shipX + 1, VH - 29, 2, 4 + Math.random() * 3);
    }
    this.drawParticles(g);
    g.restore();
  }
}
