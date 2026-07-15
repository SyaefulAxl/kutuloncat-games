import { ArcadeScene, VW, VH, sfx, drawGlow, shade, startSession, submitScore, SessionCtx, isDailyMode, todayDateSeed, mulberry32 } from './kit';

// ── JAGA KOTHA — Missile Command style defense ──
// Missiles rain toward the six cities; tap anywhere to detonate an
// interceptor there. Explosions destroy missile heads — and destroyed
// missiles explode too, so smart shots chain. Score scales with the wave.
const GROUND = VH - 22;
const CITY_XS = [58, 128, 198, 314, 384, 454];
const BATTERY_X = VW / 2;

type MissileType = 'standard' | 'fast' | 'stealth' | 'homing';
interface Missile { x: number; y: number; ox: number; oy: number; vx: number; vy: number; split: boolean; type: MissileType; tx: number }
interface Interceptor { x: number; y: number; tx: number; ty: number }
interface Boom { x: number; y: number; t: number; small: boolean }
interface Plane { x: number; y: number; dir: 1 | -1; dropT: number; alive: boolean }
interface Mothership { x: number; y: number; hp: number; maxHp: number; t: number; fireT: number }
type PowerUpType = 'blast' | 'rapid' | 'repair';
interface PowerUp { x: number; y: number; type: PowerUpType }

// A bomber plane starts appearing from wave 3, and every BOSS_EVERY_SKY-th
// wave replaces the normal missile barrage with a mothership set-piece.
const PLANE_FROM_WAVE = 3;
const BOSS_EVERY_SKY = 6;
// Power-up capsule — falls slowly from the top every POWERUP_EVERY_S
// seconds; intercept it like a missile to collect.
const POWERUP_EVERY_S = 16;

export class SkyScene extends ArcadeScene {
  private gs = 'TITLE';
  private score = 0; private wave = 1;
  private cities: boolean[] = [true, true, true, true, true, true];
  private missiles: Missile[] = [];
  private inters: Interceptor[] = [];
  private booms: Boom[] = [];
  private toSpawn = 0; private spawnT = 0; private coolT = 0;
  private intercepted = 0; private stateT = 0; private waveBonus = 0;
  private plane: Plane | null = null; private planeSpawnT = 0;
  private mothership: Mothership | null = null;
  // Combo — consecutive intercepts inside a short window multiply the
  // per-intercept score, instead of every intercept always being flat
  // 25×wave regardless of how well the player is chaining shots.
  private combo = 0; private comboT = 0; private maxCombo = 0;
  // Power-ups: wider blast radius, faster reload, or an instant city repair.
  private powerup: PowerUp | null = null; private powerupSpawnT = POWERUP_EVERY_S;
  private blastT = 0; private rapidT = 0;
  private prevDown = false;
  private startTime = 0; private sess: SessionCtx = null;
  private daily = false; private dailyDate = '';
  // Daily challenge: seeds missile spawn targeting/timing/splits so every
  // player defends against the same incoming barrage for a given wave today.
  private rng: () => number = Math.random;

  constructor() { super({ key: 'SkyScene' }); }

  // Previously capped at wave 6 while spawn count/speed keep scaling
  // unbounded — late-wave difficulty outpaced the reward per kill.
  private mult() { return this.wave; }

  private isBossWave() { return this.wave % BOSS_EVERY_SKY === 0; }

  private buildWave() {
    this.rng = this.daily ? mulberry32(todayDateSeed().seed * 37 + this.wave) : Math.random;
    this.missiles = []; this.inters = []; this.booms = [];
    this.plane = null; this.planeSpawnT = 3 + this.rng() * 3;
    if (this.isBossWave()) {
      this.toSpawn = 0; this.spawnT = 0; this.coolT = 0;
      const hp = 14 + this.wave * 3;
      this.mothership = { x: VW / 2, y: 46, hp, maxHp: hp, t: 0, fireT: 1.8 };
    } else {
      this.mothership = null;
      this.toSpawn = 6 + this.wave * 2;
      this.spawnT = 0.5;
      this.coolT = 0;
    }
  }

  // Picks a missile type gated by wave — fast/stealth/homing only start
  // appearing once the player has had time to learn the basics.
  private rollMissileType(): MissileType {
    if (this.wave >= 5 && this.rng() < 0.18) return 'homing';
    if (this.wave >= 4 && this.rng() < 0.22) return 'stealth';
    if (this.wave >= 2 && this.rng() < 0.28) return 'fast';
    return 'standard';
  }

  private spawnMissile(fromX?: number, fromY?: number, forceType?: MissileType) {
    const targets = CITY_XS.filter((_, i) => this.cities[i]);
    const tx = targets.length ? targets[Math.floor(this.rng() * targets.length)] : BATTERY_X;
    const ox = fromX ?? this.rng() * (VW - 40) + 20;
    const oy = fromY ?? -6;
    const dx = tx - ox, dy = GROUND - oy;
    const len = Math.hypot(dx, dy);
    const type = forceType ?? this.rollMissileType();
    const speedMult = type === 'fast' ? 1.7 : 1;
    const spd = (26 + this.wave * 5) * speedMult;
    this.missiles.push({ x: ox, y: oy, ox, oy, vx: (dx / len) * spd, vy: (dy / len) * spd, split: fromY !== undefined, type, tx });
  }

  private startGame() {
    this.score = 0; this.wave = 1;
    this.cities = [true, true, true, true, true, true];
    this.intercepted = 0;
    this.plane = null; this.mothership = null;
    this.combo = 0; this.comboT = 0; this.maxCombo = 0;
    this.powerup = null; this.powerupSpawnT = POWERUP_EVERY_S;
    this.blastT = 0; this.rapidT = 0;
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
    sfx.musicTick(this.gs === 'PLAYING', this.cities.filter(Boolean).length <= 1 ? 1 : 0, 'sky');
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
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    if (this.blastT > 0) this.blastT -= dt;
    if (this.rapidT > 0) this.rapidT -= dt;
    // fire on press (down edge — snappier than waiting for the tap on release)
    this.coolT -= dt;
    if (this.ptr.down && !this.prevDown && this.coolT <= 0 && this.ptr.y < GROUND - 20) {
      this.inters.push({ x: BATTERY_X, y: GROUND - 14, tx: this.ptr.x, ty: this.ptr.y });
      this.coolT = this.rapidT > 0 ? 0.16 : 0.32;
      sfx.missileLaunch();
    }
    // spawns
    if (this.toSpawn > 0) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnMissile();
        this.toSpawn--;
        this.spawnT = Math.max(0.35, 1.4 - this.wave * 0.07) * (0.6 + this.rng() * 0.8);
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
        sfx.explosion();
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
      // Homing missiles re-steer toward the nearest surviving city instead
      // of flying a straight line from spawn.
      if (m.type === 'homing') {
        const alive = CITY_XS.filter((_, ci) => this.cities[ci]);
        if (alive.length) {
          const nearest = alive.reduce((a, b) => Math.abs(a - m.x) < Math.abs(b - m.x) ? a : b);
          m.tx = nearest;
        }
        const dx = m.tx - m.x, dy = GROUND - m.y;
        const len = Math.hypot(dx, dy) || 1;
        const spd = Math.hypot(m.vx, m.vy);
        const desiredVx = (dx / len) * spd, desiredVy = (dy / len) * spd;
        m.vx += (desiredVx - m.vx) * Math.min(1, dt * 1.5);
        m.vy += (desiredVy - m.vy) * Math.min(1, dt * 1.5);
      }
      m.x += m.vx * dt; m.y += m.vy * dt;
      // split at mid altitude on later waves
      if (!m.split && this.wave >= 3 && m.y > VH * 0.35 && m.y < VH * 0.5 && this.rng() < dt * 0.5) {
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
        // Combo — consecutive intercepts inside a 1.4s window build a chain
        // multiplier (capped x4), instead of every intercept scoring the
        // same flat amount regardless of how well the player is chaining.
        this.combo = this.comboT > 0 ? this.combo + 1 : 1;
        this.comboT = 1.4;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        const comboMult = Math.min(1 + (this.combo - 1) * 0.25, 4);
        this.score += Math.round(25 * this.mult() * comboMult);
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
          this.combo = 0; this.comboT = 0;
          this.shake(0.3, 6);
          this.spawnParticles(CITY_XS[closest], GROUND, 0xff5c5c, 16, 85);
        } else { sfx.explosion(); this.shake(0.12, 2); }
        this.missiles.splice(i, 1);
        if (!this.cities.some(Boolean)) { this.gameOver(); return; }
      }
    }
    // power-up capsule — spawns periodically, drifts straight down, and is
    // collected the same way a missile is destroyed (blast radius overlap)
    if (!this.powerup) {
      this.powerupSpawnT -= dt;
      if (this.powerupSpawnT <= 0) {
        const types: PowerUpType[] = ['blast', 'rapid', 'repair'];
        const avail = this.cities.some(c => !c) ? types : types.filter(t => t !== 'repair');
        this.powerup = { x: 40 + this.rng() * (VW - 80), y: -8, type: avail[Math.floor(this.rng() * avail.length)] };
        this.powerupSpawnT = POWERUP_EVERY_S + this.rng() * 6;
      }
    } else {
      const p = this.powerup;
      p.y += 22 * dt;
      let collected = false;
      for (const b of this.booms) {
        const r = this.boomR(b);
        if (r > 0 && Math.hypot(p.x - b.x, p.y - b.y) < r) { collected = true; break; }
      }
      if (collected) {
        sfx.power();
        this.cameras.main.flash(150, 124, 219, 160);
        if (p.type === 'blast') this.blastT = 12;
        else if (p.type === 'rapid') this.rapidT = 12;
        else if (p.type === 'repair') {
          const down = this.cities.map((c, i) => [c, i] as const).filter(([c]) => !c);
          if (down.length) this.cities[down[Math.floor(this.rng() * down.length)][1]] = true;
        }
        this.powerup = null;
      } else if (p.y > GROUND) {
        this.powerup = null; // missed — falls past harmlessly, no penalty
      }
    }

    // bomber plane — from PLANE_FROM_WAVE, periodically crosses the sky and
    // drops a bomblet; shooting it down (interceptor blast reaching it) is
    // worth a bonus instead of just letting it pass.
    if (!this.isBossWave() && this.wave >= PLANE_FROM_WAVE) {
      if (!this.plane) {
        this.planeSpawnT -= dt;
        if (this.planeSpawnT <= 0) {
          const dir: 1 | -1 = this.rng() < 0.5 ? 1 : -1;
          this.plane = { x: dir === 1 ? -20 : VW + 20, y: 40 + this.rng() * 24, dir, dropT: 0.8 + this.rng() * 0.6, alive: true };
        }
      } else if (this.plane.alive) {
        const p = this.plane;
        p.x += p.dir * (60 + this.wave * 4) * dt;
        p.dropT -= dt;
        if (p.dropT <= 0) {
          this.spawnMissile(p.x, p.y, 'standard');
          p.dropT = 1.1 + this.rng() * 0.9;
        }
        for (const b of this.booms) {
          const r = this.boomR(b);
          if (r > 0 && Math.hypot(p.x - b.x, p.y - b.y) < r) {
            p.alive = false;
            this.score += 400 * this.mult();
            this.shake(0.15, 3); this.spawnParticles(p.x, p.y, 0xffd23f, 14, 90);
            sfx.explosion();
            break;
          }
        }
        if (p.x < -30 || p.x > VW + 30) this.plane = null;
        else if (!p.alive) this.plane = null;
      }
    }

    // mothership boss wave
    if (this.mothership) {
      const ms = this.mothership;
      ms.t += dt;
      ms.x = VW / 2 + Math.sin(ms.t * 0.5) * (VW / 2 - 80);
      ms.fireT -= dt;
      if (ms.fireT <= 0) {
        this.spawnMissile(ms.x - 20, ms.y + 8, this.rollMissileType());
        this.spawnMissile(ms.x + 20, ms.y + 8, this.rollMissileType());
        ms.fireT = Math.max(0.6, 1.8 - this.wave * 0.05);
      }
      for (const b of this.booms) {
        const r = this.boomR(b);
        if (r > 0 && Math.hypot(ms.x - b.x, ms.y - b.y) < r + 20) {
          ms.hp--;
          this.spawnParticles(ms.x, ms.y, 0xff5c5c, 4, 50);
          if (ms.hp <= 0) {
            this.score += 500 * this.wave;
            this.shake(0.4, 8);
            this.spawnParticles(ms.x, ms.y, 0xffd23f, 30, 130);
            this.booms.push({ x: ms.x, y: ms.y, t: 0, small: false });
            sfx.clear();
            this.mothership = null;
          }
          break;
        }
      }
    }

    // wave clear
    const bossWaveClear = this.isBossWave() && !this.mothership && this.missiles.length === 0 && this.booms.length === 0;
    const normalWaveClear = !this.isBossWave() && this.toSpawn === 0 && this.missiles.length === 0 && this.inters.length === 0 && this.booms.length === 0 && !this.plane;
    if (bossWaveClear || normalWaveClear) {
      const alive = this.cities.filter(Boolean).length;
      this.waveBonus = alive * 100 * this.wave + (bossWaveClear ? 500 * this.wave : 0);
      this.score += this.waveBonus;
      sfx.clear();
      this.gs = 'WAVE_CLEAR'; this.stateT = 0;
    }
    this.rGame();
  }

  private boomR(b: Boom): number {
    const boost = this.blastT > 0 ? 1.5 : 1;
    const max = (b.small ? 22 : 34) * boost;
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
    if (this.combo >= 2 && this.comboT > 0) this.txt(20).setOrigin(0.5, 0).setFontSize(7).setColor('#ffd23f').setText('CHAIN x' + Math.min(this.combo, 5)).setPosition(VW / 2, 21).setVisible(true);
    if (this.blastT > 0 || this.rapidT > 0) {
      const label = [this.blastT > 0 ? 'BLAST' : '', this.rapidT > 0 ? 'RAPID' : ''].filter(Boolean).join(' + ');
      this.txt(21).setOrigin(0, 0).setFontSize(6).setColor('#7ce3ff').setText(label).setPosition(10, 20).setVisible(true);
    }
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
    // power-up capsule
    if (this.powerup) {
      const p = this.powerup;
      const col = p.type === 'blast' ? 0xff9d42 : p.type === 'rapid' ? 0xffe066 : 0x4bdba0;
      const label = p.type === 'blast' ? 'B' : p.type === 'rapid' ? 'R' : '+';
      drawGlow(g, p.x, p.y, 12, col, 0.5 + Math.sin(this.blink * 6) * 0.15);
      g.fillStyle(col); g.fillCircle(p.x, p.y, 7);
      g.lineStyle(1, 0xffffff, 0.6); g.strokeCircle(p.x, p.y, 7);
      this.txt(22).setOrigin(0.5, 0.5).setFontSize(7).setColor('#0a0a12').setText(label).setPosition(p.x, p.y).setVisible(true);
    }
    // battery
    drawGlow(g, BATTERY_X, GROUND - 10, 18, this.coolT <= 0 ? 0x4bdba0 : 0x5f6f9c, 0.35);
    g.fillStyle(0x35554a); g.fillRect(BATTERY_X - 18, GROUND - 10, 36, 10);
    g.fillStyle(this.coolT <= 0 ? 0x4bdba0 : 0x5f6f9c);
    g.fillRect(BATTERY_X - 3, GROUND - 22, 6, 14);
    // missiles + trails — each type reads visually distinct at a glance
    for (const m of this.missiles) {
      if (m.type === 'stealth') {
        // Mostly invisible, flickers into view briefly — the hardest type
        // to track by design.
        const flick = Math.sin(this.blink * 5 + m.ox) > 0.75;
        if (!flick) continue;
        g.lineStyle(1, 0x9d7cff, 0.2);
        g.beginPath(); g.moveTo(m.ox, m.oy); g.lineTo(m.x, m.y); g.strokePath();
        drawGlow(g, m.x, m.y, 6, 0xb45cff, 0.35);
        g.fillStyle(0xd9c8ff); g.fillCircle(m.x, m.y, 2);
        continue;
      }
      const col = m.type === 'homing' ? 0xff5cc8 : m.type === 'fast' ? 0xffe066 : 0xff5c5c;
      const headCol = m.type === 'homing' ? 0xffb3e6 : m.type === 'fast' ? 0xfff2b3 : 0xffd2a0;
      g.lineStyle(1.5, col, 0.35);
      g.beginPath(); g.moveTo(m.ox, m.oy); g.lineTo(m.x, m.y); g.strokePath();
      drawGlow(g, m.x, m.y, m.type === 'fast' ? 5 : 7, col, 0.6);
      g.fillStyle(headCol); g.fillCircle(m.x, m.y, m.type === 'fast' ? 1.8 : 2.2);
    }
    // bomber plane
    if (this.plane && this.plane.alive) {
      const p = this.plane;
      drawGlow(g, p.x, p.y, 14, 0xffd23f, 0.35);
      g.fillStyle(0x35405a); g.fillRect(p.x - 12, p.y - 3, 24, 6);
      g.fillStyle(0x5f6f9c); g.fillRect(p.x - 4, p.y - 6, 8, 3);
      g.fillStyle(0xff5c5c, 0.6 + Math.sin(this.blink * 10) * 0.3); g.fillCircle(p.x - p.dir * 12, p.y, 2);
    }
    // mothership
    if (this.mothership) {
      const ms = this.mothership;
      drawGlow(g, ms.x, ms.y, 44, 0xff5c5c, 0.3 + Math.sin(this.blink * 3) * 0.08);
      g.fillStyle(0x2b1f3f); g.fillRect(ms.x - 34, ms.y - 10, 68, 20);
      g.fillStyle(0x4a2f6f); g.fillRect(ms.x - 26, ms.y - 16, 52, 10);
      g.fillStyle(0xff5c5c, 0.7 + Math.sin(this.blink * 8) * 0.3);
      g.fillCircle(ms.x, ms.y - 2, 4);
      g.fillStyle(0x03040c, 0.7); g.fillRect(ms.x - 34, ms.y - 24, 68, 5);
      g.fillStyle(0xff5c5c); g.fillRect(ms.x - 34, ms.y - 24, 68 * Math.max(0, ms.hp / ms.maxHp), 5);
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
