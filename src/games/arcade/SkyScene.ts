import { ArcadeScene, VW, VH, sfx, drawGlow, shade, startSession, submitScore, SessionCtx, isDailyMode, todayDateSeed } from './kit';

// ── JAGA KOTHA — Missile Command style defense ──
// Missiles rain toward the six cities; tap anywhere to detonate an
// interceptor there. Explosions destroy missile heads — and destroyed
// missiles explode too, so smart shots chain. Score scales with the wave.
const GROUND = VH - 22;
const CITY_XS = [58, 128, 198, 314, 384, 454];
const BATTERY_X = VW / 2;

interface Missile { x: number; y: number; ox: number; oy: number; vx: number; vy: number; split: boolean }
interface Interceptor { x: number; y: number; tx: number; ty: number }
interface Boom { x: number; y: number; t: number; small: boolean }

export class SkyScene extends ArcadeScene {
  private gs = 'TITLE';
  private score = 0; private wave = 1;
  private cities: boolean[] = [true, true, true, true, true, true];
  private missiles: Missile[] = [];
  private inters: Interceptor[] = [];
  private booms: Boom[] = [];
  private toSpawn = 0; private spawnT = 0; private coolT = 0;
  private intercepted = 0; private stateT = 0; private waveBonus = 0;
  private prevDown = false;
  private startTime = 0; private sess: SessionCtx = null;
  private daily = false; private dailyDate = '';

  constructor() { super({ key: 'SkyScene' }); }

  // Previously capped at wave 6 while spawn count/speed keep scaling
  // unbounded — late-wave difficulty outpaced the reward per kill.
  private mult() { return this.wave; }

  private buildWave() {
    this.missiles = []; this.inters = []; this.booms = [];
    this.toSpawn = 6 + this.wave * 2;
    this.spawnT = 0.5;
    this.coolT = 0;
  }

  private spawnMissile(fromX?: number, fromY?: number) {
    const targets = CITY_XS.filter((_, i) => this.cities[i]);
    const tx = targets.length ? targets[Math.floor(Math.random() * targets.length)] : BATTERY_X;
    const ox = fromX ?? Math.random() * (VW - 40) + 20;
    const oy = fromY ?? -6;
    const dx = tx - ox, dy = GROUND - oy;
    const len = Math.hypot(dx, dy);
    const spd = 26 + this.wave * 5;
    this.missiles.push({ x: ox, y: oy, ox, oy, vx: (dx / len) * spd, vy: (dy / len) * spd, split: fromY !== undefined });
  }

  private startGame() {
    this.score = 0; this.wave = 1;
    this.cities = [true, true, true, true, true, true];
    this.intercepted = 0;
    this.daily = isDailyMode(); this.dailyDate = todayDateSeed().date;
    this.startTime = Date.now();
    startSession('sky-defense').then(s => { this.sess = s; });
    sfx.start();
    this.buildWave();
    this.gs = 'PLAYING';
  }

  private gameOver() {
    this.gs = 'GAME_OVER'; this.stateT = 0;
    sfx.death();
    submitScore('sky-defense', this.score, {
      intercepted: this.intercepted, wave: this.wave,
      cities: this.cities.filter(Boolean).length,
      durationSec: Math.floor((Date.now() - this.startTime) / 1000),
      daily: this.daily, dailyDate: this.daily ? this.dailyDate : undefined,
    }, this.sess);
  }

  protected tick(dt: number) {
    sfx.musicTick(this.gs === 'PLAYING', this.cities.filter(Boolean).length <= 1 ? 1 : 0);
    this.drawSpaceBg(0x040311, 0x0b1030, 0x1a1040);
    this.g.clear(); this.ui.clear();
    for (const t of this.txts) t.setVisible(false);
    if (this.gs === 'TITLE') this.uTitle();
    else if (this.gs === 'PLAYING') this.uPlay(dt);
    else if (this.gs === 'WAVE_CLEAR') { this.stateT += dt; this.rGame(); this.rBanner('WAVE ' + this.wave + ' AMAN!', '+' + this.waveBonus + ' PTS'); if (this.stateT > 1.6) { this.wave++; this.buildWave(); this.gs = 'PLAYING'; } }
    else if (this.gs === 'GAME_OVER') this.uGO(dt);
    this.prevDown = this.ptr.down;
  }

  private uTitle() {
    this.txt(0).setOrigin(0.5, 0).setFontSize(26).setColor('#4bdba0').setText('JAGA KOTHA').setPosition(VW / 2, VH * 0.18).setVisible(true);
    this.txt(1).setOrigin(0.5, 0).setFontSize(8).setColor('#93a8d9').setText('RUDAL MENGHUJANI 6 KOTA-MU\nTAP DI LANGIT UNTUK MELEDAKKAN PENCEGAT\nLEDAKAN BISA BERANTAI!').setAlign('center').setLineSpacing(6).setPosition(VW / 2, VH * 0.38).setVisible(true);
    this.txt(2).setOrigin(0.5, 0).setFontSize(7).setColor('#5f6f9c').setText(this.isTouch ? 'TAP = TEMBAK PENCEGAT' : 'KLIK = TEMBAK PENCEGAT').setPosition(VW / 2, VH * 0.58).setVisible(true);
    if (this.blink % 1 < 0.62) this.txt(3).setOrigin(0.5, 0).setFontSize(12).setColor('#7ce3ff').setText(this.isTouch ? 'TAP TO START' : 'PRESS ANY KEY').setPosition(VW / 2, VH * 0.76).setVisible(true);
    drawGlow(this.g, VW / 2, VH * 0.22, 90, 0x4bdba0, 0.3);
    if (this.anyPress()) this.startGame();
  }

  private uGO(dt: number) {
    this.stateT += dt;
    this.rGame();
    this.ui.fillStyle(0x03040c, 0.75); this.ui.fillRect(0, 0, VW, VH);
    this.txt(10).setOrigin(0.5, 0).setFontSize(24).setColor('#ff6b6b').setText('KOTA HANCUR').setPosition(VW / 2, VH * 0.3).setVisible(true);
    this.txt(11).setOrigin(0.5, 0).setFontSize(10).setColor('#f4f8ff').setText('SCORE: ' + this.score).setPosition(VW / 2, VH * 0.46).setVisible(true);
    this.txt(12).setOrigin(0.5, 0).setFontSize(7).setColor('#93a8d9').setText('WAVE ' + this.wave + '  -  ' + this.intercepted + ' RUDAL DICEGAT').setPosition(VW / 2, VH * 0.55).setVisible(true);
    if (this.stateT > 1.2 && this.blink % 1 < 0.62) this.txt(13).setOrigin(0.5, 0).setFontSize(9).setColor('#7ce3ff').setText(this.isTouch ? 'TAP TO CONTINUE' : 'PRESS ANY KEY').setPosition(VW / 2, VH * 0.7).setVisible(true);
    if (this.stateT > 1.2 && this.anyPress()) this.gs = 'TITLE';
  }

  private uPlay(dt: number) {
    // fire on press (down edge — snappier than waiting for the tap on release)
    this.coolT -= dt;
    if (this.ptr.down && !this.prevDown && this.coolT <= 0 && this.ptr.y < GROUND - 20) {
      this.inters.push({ x: BATTERY_X, y: GROUND - 14, tx: this.ptr.x, ty: this.ptr.y });
      this.coolT = 0.32;
      sfx.shoot();
    }
    // spawns
    if (this.toSpawn > 0) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnMissile();
        this.toSpawn--;
        this.spawnT = Math.max(0.35, 1.4 - this.wave * 0.07) * (0.6 + Math.random() * 0.8);
      }
    }
    // interceptors
    for (let i = this.inters.length - 1; i >= 0; i--) {
      const it = this.inters[i];
      const dx = it.tx - it.x, dy = it.ty - it.y;
      const len = Math.hypot(dx, dy);
      const step = 340 * dt;
      if (len <= step) {
        this.booms.push({ x: it.tx, y: it.ty, t: 0, small: false });
        this.inters.splice(i, 1);
        sfx.boom();
      } else { it.x += (dx / len) * step; it.y += (dy / len) * step; }
    }
    // booms lifecycle
    for (let i = this.booms.length - 1; i >= 0; i--) {
      this.booms[i].t += dt;
      if (this.booms[i].t > 1.1) this.booms.splice(i, 1);
    }
    // missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.x += m.vx * dt; m.y += m.vy * dt;
      // split at mid altitude on later waves
      if (!m.split && this.wave >= 3 && m.y > VH * 0.35 && m.y < VH * 0.5 && Math.random() < dt * 0.5) {
        m.split = true;
        this.spawnMissile(m.x, m.y);
      }
      // caught by an explosion?
      let dead = false;
      for (const b of this.booms) {
        const r = this.boomR(b);
        if (r > 0 && Math.hypot(m.x - b.x, m.y - b.y) < r) { dead = true; break; }
      }
      if (dead) {
        this.score += 25 * this.mult();
        this.intercepted++;
        this.booms.push({ x: m.x, y: m.y, t: 0, small: true });
        // Interception is the most common success event in this game but
        // previously had no juice at all, unlike every other scene's kills.
        this.shake(0.06, 2);
        this.spawnParticles(m.x, m.y, 0x7ce3ff, 8, 60);
        this.missiles.splice(i, 1);
        sfx.pop();
        continue;
      }
      // impact
      if (m.y >= GROUND) {
        this.booms.push({ x: m.x, y: GROUND, t: 0, small: false });
        let closest = -1, cd = 26;
        for (let c = 0; c < CITY_XS.length; c++) {
          if (!this.cities[c]) continue;
          const d = Math.abs(CITY_XS[c] - m.x);
          if (d < cd) { cd = d; closest = c; }
        }
        if (closest >= 0) {
          this.cities[closest] = false; sfx.hit();
          this.shake(0.3, 6);
          this.spawnParticles(CITY_XS[closest], GROUND, 0xff5c5c, 16, 85);
        } else { sfx.boom(); this.shake(0.12, 2); }
        this.missiles.splice(i, 1);
        if (!this.cities.some(Boolean)) { this.gameOver(); return; }
      }
    }
    // wave clear
    if (this.toSpawn === 0 && this.missiles.length === 0 && this.inters.length === 0 && this.booms.length === 0) {
      const alive = this.cities.filter(Boolean).length;
      this.waveBonus = alive * 100 * this.wave;
      this.score += this.waveBonus;
      sfx.clear();
      this.gs = 'WAVE_CLEAR'; this.stateT = 0;
    }
    this.rGame();
  }

  private boomR(b: Boom): number {
    const max = b.small ? 22 : 34;
    if (b.t < 0.45) return (b.t / 0.45) * max;
    if (b.t < 0.8) return max;
    return Math.max(0, max * (1 - (b.t - 0.8) / 0.3));
  }

  private rBanner(a: string, b: string) {
    this.ui.fillStyle(0x03040c, 0.7); this.ui.fillRect(0, VH * 0.3, VW, 90);
    this.txt(10).setOrigin(0.5, 0).setFontSize(14).setColor('#4bdba0').setText(a).setPosition(VW / 2, VH * 0.34).setVisible(true);
    this.txt(11).setOrigin(0.5, 0).setFontSize(10).setColor('#ffd23f').setText(b).setPosition(VW / 2, VH * 0.43).setVisible(true);
  }

  private rGame() {
    const g = this.g;
    // HUD
    this.txt(0).setOrigin(0, 0).setFontSize(9).setColor('#f4f8ff').setText(String(this.score).padStart(6, '0')).setPosition(10, 8).setVisible(true);
    this.txt(1).setOrigin(1, 0).setFontSize(7).setColor('#93a8d9').setText('WAVE ' + this.wave).setPosition(VW - 10, 10).setVisible(true);
    if (this.daily) this.txt(19).setOrigin(0.5, 0).setFontSize(6).setColor('#ffd23f').setText('HARIAN').setPosition(VW / 2, 21).setVisible(true);
    g.save(); g.translateCanvas(this.shakeX, this.shakeY);
    // ground
    g.fillStyle(0x1c2a20); g.fillRect(0, GROUND, VW, VH - GROUND);
    g.fillStyle(0x4bdba0, 0.5); g.fillRect(0, GROUND, VW, 2);
    // cities
    for (let c = 0; c < CITY_XS.length; c++) {
      const x = CITY_XS[c];
      if (this.cities[c]) {
        g.fillStyle(0x2b3f74); g.fillRect(x - 16, GROUND - 14, 32, 14);
        g.fillStyle(0x4a63b0); g.fillRect(x - 10, GROUND - 20, 8, 20);
        g.fillStyle(0x7ce3ff, 0.8);
        for (let wy = 0; wy < 3; wy++) for (let wx = 0; wx < 3; wx++) {
          if ((wx + wy + c) % 2 === 0) g.fillRect(x - 14 + wx * 10, GROUND - 12 + wy * 4, 3, 2);
        }
      } else {
        g.fillStyle(0x3a2020); g.fillRect(x - 16, GROUND - 5, 32, 5);
        g.fillStyle(0xff5c2b, 0.3 + Math.sin(this.blink * 6 + c) * 0.15);
        g.fillRect(x - 8, GROUND - 9, 4, 4); g.fillRect(x + 4, GROUND - 8, 3, 3);
      }
    }
    // battery
    drawGlow(g, BATTERY_X, GROUND - 10, 18, this.coolT <= 0 ? 0x4bdba0 : 0x5f6f9c, 0.35);
    g.fillStyle(0x35554a); g.fillRect(BATTERY_X - 18, GROUND - 10, 36, 10);
    g.fillStyle(this.coolT <= 0 ? 0x4bdba0 : 0x5f6f9c);
    g.fillRect(BATTERY_X - 3, GROUND - 22, 6, 14);
    // missiles + trails
    for (const m of this.missiles) {
      g.lineStyle(1.5, 0xff5c5c, 0.35);
      g.beginPath(); g.moveTo(m.ox, m.oy); g.lineTo(m.x, m.y); g.strokePath();
      drawGlow(g, m.x, m.y, 7, 0xff8a5c, 0.6);
      g.fillStyle(0xffd2a0); g.fillCircle(m.x, m.y, 2.2);
    }
    // interceptors
    for (const it of this.inters) {
      g.lineStyle(1.5, 0x7ce3ff, 0.5);
      g.beginPath(); g.moveTo(BATTERY_X, GROUND - 14); g.lineTo(it.x, it.y); g.strokePath();
      g.fillStyle(0xffffff); g.fillCircle(it.x, it.y, 2.5);
      // target marker
      g.lineStyle(1, 0x7ce3ff, 0.8);
      g.beginPath(); g.moveTo(it.tx - 5, it.ty); g.lineTo(it.tx + 5, it.ty); g.strokePath();
      g.beginPath(); g.moveTo(it.tx, it.ty - 5); g.lineTo(it.tx, it.ty + 5); g.strokePath();
    }
    // explosions
    for (const b of this.booms) {
      const r = this.boomR(b);
      if (r <= 0) continue;
      const flick = 0.75 + Math.sin(this.blink * 30) * 0.25;
      g.fillStyle(0xffd23f, 0.35 * flick); g.fillCircle(b.x, b.y, r);
      g.fillStyle(0xff8a3c, 0.5 * flick); g.fillCircle(b.x, b.y, r * 0.66);
      g.fillStyle(0xffffff, 0.7 * flick); g.fillCircle(b.x, b.y, r * 0.3);
    }
    this.drawParticles(g);
    g.restore();
    // crosshair at pointer while playing (desktop aiming aid) — drawn
    // outside the shake block so aiming stays precise during a shake.
    if (this.gs === 'PLAYING' && !this.isTouch && this.ptr.y < GROUND - 20) {
      g.lineStyle(1, 0x4bdba0, 0.6);
      g.strokeCircle(this.ptr.x, this.ptr.y, 7);
    }
  }
}
