import Phaser from 'phaser';
import { sfx } from '../arcade/kit';

/* ── Emoji pools ── */
const FRUITS = [
  '🍎',
  '🍊',
  '🍋',
  '🍉',
  '🍇',
  '🍓',
  '🍑',
  '🍍',
  '🥝',
  '🫐',
  '🍒',
  '🥭',
];
const WEIRD = ['🌶️', '🍆', '🧅', '🥦', '🌽', '🧄', '🥕', '🥑'];
const BOMB = '💣';
const STAR = '⭐';
const STAR_CHANCE = 0.025; // rare — at most one on screen at a time
const STAR_DURATION_MS = 6000;

/* ── Golden Rush — a timed event (not combo-gated like Frenzy) that turns
   the next few seconds of spawns into high-value golden fruit worth 3x,
   giving the run a periodic "big moment" beyond the per-stage speed ramp. ── */
const GOLDEN_RUSH_EVERY_MS = 28000;
const GOLDEN_RUSH_DURATION_MS = 5000;
const GOLDEN_RUSH_MULT = 3;

/* ── Fruit variety — heavy fruit is bigger/slower/worth more; splitting
   fruit shatters into two small bonus shards on slice, rewarding a fast
   follow-up hit instead of every fruit behaving identically. ── */
const HEAVY_CHANCE_BY_STAGE = [0, 0.05, 0.08, 0.1, 0.12, 0.14, 0.16];
const SPLIT_CHANCE_BY_STAGE = [0, 0.04, 0.07, 0.1, 0.13, 0.16, 0.19];
const SHARD_LIFE_S = 0.9;
const SHARD_POINTS = 6;

/* ── Types ── */
interface FruitObj {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  r: number;
  type: 'fruit' | 'bomb' | 'star' | 'heavy' | 'split' | 'shard';
  emoji: string;
  hit: boolean;
  rot: number;
  rotSpeed: number;
  text: Phaser.GameObjects.Text | null;
  golden?: boolean;
  glow?: Phaser.GameObjects.Arc | null;
  life?: number; // shards only — despawn after SHARD_LIFE_S regardless of position
}
interface HalfObj {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  emoji: string;
  alpha: number;
  rot: number;
  rotSpeed: number;
  text: Phaser.GameObjects.Text | null;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
  gfx: Phaser.GameObjects.Arc | null;
}
interface SlashPoint {
  x: number;
  y: number;
  t: number;
}

interface Config {
  stageSeconds: number[];
  maxByStage: number[];
  gapByStage: number[];
  burstMin: number[];
  burstMax: number[];
  weirdChance: number[];
  bombBase: number[];
  safeBombDistance: number;
  fruitSize: number;
  fruitHitRadius: number;
  gravityBase: number;
  launchSpeedMin: number;
  launchSpeedMax: number;
  lives: number;
}

const DEFAULT_CFG: Config = {
  stageSeconds: [60, 120, 180, 240, 330, 420],
  maxByStage: [5, 6, 8, 10, 12, 14, 16],
  gapByStage: [1000, 880, 750, 620, 500, 400, 320],
  burstMin: [1, 1, 1, 1, 2, 2, 2],
  burstMax: [2, 2, 3, 4, 5, 6, 7],
  weirdChance: [0.06, 0.08, 0.12, 0.15, 0.18, 0.22, 0.25],
  bombBase: [0.06, 0.08, 0.1, 0.13, 0.16, 0.2, 0.24],
  safeBombDistance: 90,
  fruitSize: 56,
  fruitHitRadius: 44,
  gravityBase: 220,
  launchSpeedMin: 280,
  launchSpeedMax: 420,
  lives: 3,
};

/* ── Shared state for React UI ── */
export interface FNGameState {
  skor: number;
  nyawa: number;
  kombo: number;
  maxKombo: number;
  gameOver: boolean;
  stage: number;
  elapsed: number;
  slices: number;
  missed: number;
  lastEvent: string;
  lastEventTime: number;
  doubleActive: boolean;
  doubleTimeLeft: number;
}

function emitState(s: FNGameState) {
  (window as any).__fnState = s;
  window.dispatchEvent(new Event('fn-update'));
}

export class FruitNinjaScene extends Phaser.Scene {
  /* ── state ── */
  private cfg: Config = { ...DEFAULT_CFG };
  private skor = 0;
  private nyawa = 3;
  private kombo = 0;
  private maxKombo = 0;
  private slices = 0;
  private missed = 0;
  private bombsHit = 0;
  private gameOver = false;
  private startTime = 0;
  // Accumulated frame time, not wall-clock — same background-tab fix as
  // Flappy Bird's getCurrentPipeSpeed(): Date.now() keeps advancing while
  // Phaser's update() is paused on a hidden tab, causing a stage jump.
  private elapsedPlayMs = 0;
  private lastSpawn = 0;
  private lastMoveTime = 0;
  private frenzyUntil = 0;
  // Power-up: slicing a rare ⭐ doubles fruit points for STAR_DURATION_MS —
  // the only power-up in this game (previously none existed at all).
  private doublePointsUntil = 0;
  private lastEvent = '';
  private lastEventTime = 0;

  /* Golden Rush — periodic timed event, independent of the combo system */
  private nextGoldenRushAt = GOLDEN_RUSH_EVERY_MS;
  private goldenRushUntil = 0;
  private goldenBanner: Phaser.GameObjects.Text | null = null;
  private goldenVignette!: Phaser.GameObjects.Graphics;
  private sessionCtx: {
    sessionId?: string;
    startedAt?: number;
    token?: string;
  } | null = null;

  /* ── object pools ── */
  private fruits: FruitObj[] = [];
  private halves: HalfObj[] = [];
  private particles: Particle[] = [];
  private slash: SlashPoint[] = [];

  /* ── Phaser objects ── */
  private slashGfx!: Phaser.GameObjects.Graphics;

  /* ── scale helpers ── */
  private sc = 1;
  private isMobile = false;
  private restartHandler: (() => void) | null = null;
  private sceneReadyFired = false;

  constructor() {
    super({ key: 'FruitNinjaScene' });
  }

  /* ================================================================
   *   LIFECYCLE
   * ================================================================ */
  async create() {
    const { width: w, height: h } = this.scale;
    this.isMobile = w < 600;
    this.sc = this.isMobile ? w / 380 : 1;

    // Background gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0e1a, 0x0a0e1a, 0x111a2e, 0x111a2e, 1);
    bg.fillRect(0, 0, w, h);

    // Slash trail
    this.slashGfx = this.add.graphics().setDepth(5);

    // Golden Rush screen vignette (pulsing gold border, only visible during the event)
    this.goldenVignette = this.add.graphics().setDepth(9);

    // Input handling
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.gameOver) return;
      this.slash = [{ x: p.x, y: p.y, t: Date.now() }];
      this.lastMoveTime = Date.now();
      this.checkSlashHits(p.x, p.y);
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.gameOver) return;
      // Mobile: requires touch down; Desktop: just hover!
      if (this.isMobile && !p.isDown) return;
      this.lastMoveTime = Date.now();
      this.slash.push({ x: p.x, y: p.y, t: Date.now() });
      if (this.slash.length > 40) this.slash.shift();
      this.checkSlashHits(p.x, p.y);
    });

    this.input.on('pointerup', () => {
      if (this.isMobile) this.kombo = 0;
    });

    // Listen for restart event from React
    this.restartHandler = () => this.restartGame();
    window.addEventListener('fn-restart', this.restartHandler);

    // Cleanup on destroy
    this.events.once('destroy', () => {
      if (this.restartHandler) {
        window.removeEventListener('fn-restart', this.restartHandler);
      }
      delete (window as any).__fnState;
    });

    // Load config & show countdown before starting
    await this.loadConfig();
    this.showCountdown();
  }

  /** Show a 3-2-1 countdown so canvas is fully rendered before gameplay */
  private showCountdown() {
    const { width: w, height: h } = this.scale;
    const sz = this.isMobile ? 64 : 80;
    const sub = this.isMobile ? 18 : 22;

    const label = this.add
      .text(w / 2, h / 2 - 20, '3', {
        fontSize: `${sz}px`,
        color: '#ffd700',
        fontFamily: 'system-ui',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(100);

    const hint = this.add
      .text(w / 2, h / 2 + 50, '🍉 Bersiap...', {
        fontSize: `${sub}px`,
        color: '#ffffff',
        fontFamily: 'system-ui',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(100);

    // Emit initial state so React shows lives/score immediately
    this.emitCurrentState();

    let count = 3;
    this.time.addEvent({
      delay: 700,
      repeat: 2,
      callback: () => {
        count--;
        if (count > 0) {
          label.setText(String(count));
          this.tweens.add({
            targets: label,
            scaleX: 1.3,
            scaleY: 1.3,
            duration: 150,
            yoyo: true,
            ease: 'Back.easeOut',
          });
        } else {
          label.setText('GO!');
          label.setColor('#00ff88');
          this.tweens.add({
            targets: [label, hint],
            alpha: 0,
            scaleX: 2,
            scaleY: 2,
            duration: 400,
            ease: 'Power2',
            onComplete: () => {
              label.destroy();
              hint.destroy();
              this.startGame();
            },
          });
        }
      },
    });
  }

  update(_time: number, delta: number) {
    // Signal React that scene is ready — fires AFTER the first actual render frame
    if (!this.sceneReadyFired) {
      this.sceneReadyFired = true;
      window.dispatchEvent(new Event('fn-scene-ready'));
    }

    sfx.musicTick(!this.gameOver, this.nyawa <= 1 ? 1 : 0, 'fruitninja');

    if (this.gameOver) {
      this.emitCurrentState();
      return;
    }

    const dt = delta / 1000;
    const now = Date.now();
    this.elapsedPlayMs += delta;

    // Combo resets if idle > 400ms — previously desktop-only (a held-still
    // mobile finger never timed out the combo since it only reset on lift).
    if (this.kombo > 0 && now - this.lastMoveTime > 400) {
      this.kombo = 0;
    }

    // Golden Rush — fires on its own clock (elapsed play time), independent
    // of combo state, so even a player who never chains slices still gets a
    // periodic high-value moment. Only starts once stage 1+ is reached.
    if (this.elapsedPlayMs >= this.nextGoldenRushAt && this.goldenRushUntil < now) {
      this.goldenRushUntil = now + GOLDEN_RUSH_DURATION_MS;
      this.nextGoldenRushAt = this.elapsedPlayMs + GOLDEN_RUSH_EVERY_MS;
      this.cameras.main.flash(250, 255, 200, 60);
      this.setEvent('🌟 GOLDEN RUSH! Buah emas 3x poin!');
      sfx.power();
      this.goldenBanner?.destroy();
      const { width: w } = this.scale;
      this.goldenBanner = this.add
        .text(w / 2, this.isMobile ? 90 : 70, '🌟 GOLDEN RUSH! 🌟', {
          fontSize: `${this.isMobile ? 22 : 28}px`,
          fontFamily: 'system-ui',
          fontStyle: 'bold',
          color: '#ffd700',
          stroke: '#5c3a00',
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(50)
        .setScale(0.6)
        .setAlpha(0);
      this.tweens.add({ targets: this.goldenBanner, alpha: 1, scale: 1, duration: 250, ease: 'Back.easeOut' });
    }
    const goldenActive = now < this.goldenRushUntil;
    if (this.goldenBanner) {
      if (goldenActive) {
        this.goldenVignette.clear();
        const { width: w, height: h } = this.scale;
        const pulse = 0.35 + Math.sin(now / 100) * 0.15;
        this.goldenVignette.lineStyle(10, 0xffd700, pulse);
        this.goldenVignette.strokeRect(5, 5, w - 10, h - 10);
      } else {
        this.goldenVignette.clear();
        this.tweens.add({
          targets: this.goldenBanner,
          alpha: 0,
          duration: 300,
          onComplete: () => { this.goldenBanner?.destroy(); this.goldenBanner = null; },
        });
      }
    }

    // Spawn logic — Frenzy Mode (triggered at kombo 5) spawns ~40% faster
    // for 3s as the reward for keeping a combo alive; Golden Rush also
    // speeds spawns up so the golden window doesn't just sit there empty.
    const stage = this.getStage();
    const frenzyActive = now < this.frenzyUntil;
    const gap = (this.cfg.gapByStage[stage] ?? 800) * (frenzyActive || goldenActive ? 0.6 : 1);
    if (now - this.lastSpawn > gap) {
      this.spawnBurst(stage, goldenActive);
      this.lastSpawn = now;
    }

    this.updateFruits(dt);
    this.updateHalves(dt);
    this.updateParticles(dt);
    this.drawSlash();
    this.emitCurrentState();
  }

  /* ================================================================
   *   STATE SYNC → React
   * ================================================================ */
  private emitCurrentState() {
    const now = Date.now();
    emitState({
      skor: this.skor,
      nyawa: this.nyawa,
      kombo: this.kombo,
      maxKombo: this.maxKombo,
      gameOver: this.gameOver,
      stage: this.getStage() + 1,
      elapsed: Math.floor((now - this.startTime) / 1000),
      slices: this.slices,
      missed: this.missed,
      lastEvent: this.lastEvent,
      lastEventTime: this.lastEventTime,
      doubleActive: now < this.doublePointsUntil,
      doubleTimeLeft: Math.max(0, this.doublePointsUntil - now),
    });
  }

  private setEvent(ev: string) {
    this.lastEvent = ev;
    this.lastEventTime = Date.now();
  }

  /* ================================================================
   *   CONFIG & INIT
   * ================================================================ */
  private async loadConfig() {
    try {
      const r = await fetch('/api/game/fruit-ninja/config');
      const j = await r.json();
      if (j?.ok && j?.fruitNinja) {
        Object.assign(this.cfg, j.fruitNinja);
      }
    } catch {
      /* use defaults */
    }
  }

  private startGame() {
    this.skor = 0;
    this.nyawa = this.cfg.lives || 3;
    this.kombo = 0;
    this.maxKombo = 0;
    this.slices = 0;
    this.missed = 0;
    this.bombsHit = 0;
    this.gameOver = false;
    this.startTime = Date.now();
    this.elapsedPlayMs = 0;
    this.lastSpawn = 0;
    this.lastMoveTime = 0;
    this.doublePointsUntil = 0;
    this.lastEvent = '';
    this.lastEventTime = 0;
    this.sessionCtx = null;
    this.slash = [];
    this.nextGoldenRushAt = GOLDEN_RUSH_EVERY_MS;
    this.goldenRushUntil = 0;
    this.goldenBanner?.destroy();
    this.goldenBanner = null;
    this.goldenVignette?.clear();
    this.clearObjects();
    this.startSession();
    this.emitCurrentState();
  }

  private restartGame() {
    // Reset state immediately so React removes the game-over overlay
    this.gameOver = false;
    this.skor = 0;
    this.nyawa = this.cfg.lives || 3;
    this.kombo = 0;
    this.maxKombo = 0;
    this.slices = 0;
    this.missed = 0;
    this.bombsHit = 0;
    this.doublePointsUntil = 0;
    this.lastEvent = '';
    this.lastEventTime = 0;
    this.slash = [];
    this.nextGoldenRushAt = GOLDEN_RUSH_EVERY_MS;
    this.goldenRushUntil = 0;
    this.goldenBanner?.destroy();
    this.goldenBanner = null;
    this.goldenVignette?.clear();
    this.clearObjects();
    this.slashGfx?.clear();
    this.emitCurrentState();
    this.showCountdown();
  }

  private clearObjects() {
    this.fruits.forEach((f) => { f.text?.destroy(); f.glow?.destroy(); });
    this.halves.forEach((h) => h.text?.destroy());
    this.particles.forEach((p) => p.gfx?.destroy());
    this.fruits = [];
    this.halves = [];
    this.particles = [];
  }

  /* ================================================================
   *   STAGE
   * ================================================================ */
  private getStage(): number {
    const elapsed = this.elapsedPlayMs / 1000;
    const ss = this.cfg.stageSeconds;
    for (let i = ss.length - 1; i >= 0; i--) {
      if (elapsed >= ss[i]) return i + 1;
    }
    return 0;
  }

  /* ================================================================
   *   SPAWNING
   * ================================================================ */
  private spawnBurst(stage: number, goldenActive = false) {
    const { width: w, height: h } = this.scale;
    const burstMin = this.cfg.burstMin[stage] ?? 1;
    const burstMax = this.cfg.burstMax[stage] ?? 2;
    const count =
      burstMin + Math.floor(Math.random() * (burstMax - burstMin + 1));
    const maxObj = this.cfg.maxByStage[stage] ?? 6;
    const active = this.fruits.filter((f) => !f.hit).length;
    if (active >= maxObj) return;

    const spawned: FruitObj[] = [];
    const baseFruitSize = Math.max(36, Math.round(this.cfg.fruitSize * this.sc));
    const baseHitR = Math.max(28, Math.round(this.cfg.fruitHitRadius * this.sc));

    const starOnScreen = this.fruits.some((f) => f.type === 'star' && !f.hit);
    for (let i = 0; i < count && active + spawned.length < maxObj; i++) {
      const isBomb = !goldenActive && Math.random() < (this.cfg.bombBase[stage] ?? 0.08);
      const isStar = !isBomb && !starOnScreen && Math.random() < STAR_CHANCE;
      const isHeavy = !isBomb && !isStar && Math.random() < (HEAVY_CHANCE_BY_STAGE[stage] ?? 0);
      const isSplit = !isBomb && !isStar && !isHeavy && Math.random() < (SPLIT_CHANCE_BY_STAGE[stage] ?? 0);
      const isWeird =
        !isBomb && !isStar && !isHeavy && !isSplit && Math.random() < (this.cfg.weirdChance[stage] ?? 0.06);
      const emoji = isBomb ? BOMB : isStar ? STAR : isWeird ? pick(WEIRD) : pick(FRUITS);
      const type: FruitObj['type'] = isBomb ? 'bomb' : isStar ? 'star' : isHeavy ? 'heavy' : isSplit ? 'split' : 'fruit';
      const fruitSize = isHeavy ? Math.round(baseFruitSize * 1.35) : baseFruitSize;
      const hitR = isHeavy ? Math.round(baseHitR * 1.3) : baseHitR;

      const margin = fruitSize + 20;
      const x = margin + Math.random() * (w - margin * 2);
      const vx = (Math.random() - 0.5) * 80 * this.sc;
      const launchMin = this.cfg.launchSpeedMin * this.sc;
      const launchMax = this.cfg.launchSpeedMax * this.sc;
      const speedMult = isHeavy ? 0.82 : 1;
      const vy = -(launchMin + Math.random() * (launchMax - launchMin)) * speedMult;
      const g = (this.cfg.gravityBase + Math.random() * 60) * this.sc * (isHeavy ? 0.85 : 1);

      if (isBomb && spawned.length > 0) {
        const dist = this.cfg.safeBombDistance * this.sc;
        if (spawned.some((s) => Math.hypot(s.x - x, 0) < dist)) continue;
      }

      const golden = goldenActive && type === 'fruit';
      const obj: FruitObj = {
        x,
        y: h + 30,
        vx,
        vy,
        g,
        r: hitR,
        type,
        emoji,
        hit: false,
        rot: 0,
        rotSpeed: (Math.random() - 0.5) * 4,
        text: null,
        golden,
      };
      if (golden || isHeavy) {
        const glowColor = golden ? 0xffd700 : 0xff8844;
        obj.glow = this.add.circle(x, h + 30, fruitSize * 0.62, glowColor, 0.35).setDepth(2);
      }
      obj.text = this.add
        .text(x, h + 30, emoji, {
          fontSize: `${fruitSize}px`,
          fontFamily: 'system-ui',
        })
        .setOrigin(0.5)
        .setDepth(3);
      spawned.push(obj);
      this.fruits.push(obj);
    }
  }

  /* ================================================================
   *   UPDATE LOOPS
   * ================================================================ */
  private updateFruits(dt: number) {
    const { width: w, height: h } = this.scale;
    const now = Date.now();
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      const f = this.fruits[i];
      f.vy += f.g * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.rotSpeed * dt;
      if (f.type === 'shard' && f.life !== undefined) f.life -= dt;

      // Horizontal boundary clamping
      if (f.x < 10) {
        f.x = 10;
        f.vx = Math.abs(f.vx) * 0.5;
      }
      if (f.x > w - 10) {
        f.x = w - 10;
        f.vx = -Math.abs(f.vx) * 0.5;
      }

      if (f.text) {
        f.text.setPosition(f.x, f.y);
        f.text.setRotation(f.rot);
      }
      if (f.glow) {
        f.glow.setPosition(f.x, f.y);
        f.glow.setAlpha(0.3 + Math.sin(now / 90) * 0.12);
      }

      const expired = f.type === 'shard' && (f.life ?? 0) <= 0;
      if (f.y > h + 60 || expired) {
        // Missed fruit/heavy/split costs a life; bombs/stars falling off are
        // ignored, and bonus shards from a split fruit never cost anything.
        if (!f.hit && (f.type === 'fruit' || f.type === 'heavy' || f.type === 'split')) {
          this.missed++;
          this.nyawa--;
          this.spawnParticles(f.x, h - 10, 0xff4444, 4);
          this.cameras.main.shake(250, 0.012);
          this.setEvent('❌ Missed! -1 nyawa');
          sfx.warn();
          if (this.nyawa <= 0) this.endGame();
        }
        f.text?.destroy();
        f.glow?.destroy();
        this.fruits.splice(i, 1);
      }
    }
  }

  private updateHalves(dt: number) {
    for (let i = this.halves.length - 1; i >= 0; i--) {
      const hf = this.halves[i];
      hf.vy += hf.g * dt;
      hf.x += hf.vx * dt;
      hf.y += hf.vy * dt;
      hf.alpha -= dt * 0.8;
      hf.rot += hf.rotSpeed * dt;
      if (hf.text) {
        hf.text.setPosition(hf.x, hf.y);
        hf.text.setAlpha(Math.max(0, hf.alpha));
        hf.text.setRotation(hf.rot);
      }
      if (hf.alpha <= 0 || hf.y > this.scale.height + 80) {
        hf.text?.destroy();
        this.halves.splice(i, 1);
      }
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt;
      p.life -= dt;
      if (p.gfx) {
        p.gfx.setPosition(p.x, p.y);
        p.gfx.setAlpha(Math.max(0, p.life / p.maxLife));
        p.gfx.setScale(Math.max(0.2, p.life / p.maxLife));
      }
      if (p.life <= 0) {
        p.gfx?.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  /* ================================================================
   *   SLASH / HIT DETECTION
   * ================================================================ */
  private checkSlashHits(sx: number, sy: number) {
    const fingerBonus = this.isMobile ? 16 : 6;
    const hitThisSwing: FruitObj[] = [];
    for (const f of this.fruits) {
      if (f.hit) continue;
      const dx = f.x - sx;
      const dy = f.y - sy;
      if (Math.sqrt(dx * dx + dy * dy) < f.r + fingerBonus) {
        hitThisSwing.push(f);
      }
    }
    for (const f of hitThisSwing) this.hitFruit(f);

    // Same-swing multi-kill bonus — slicing 2+ fruits at the exact same
    // slash point (distinct from the time-window combo system, which
    // already rewards consecutive sequential slices).
    const multi = hitThisSwing.filter((f) => f.type !== 'bomb');
    if (multi.length >= 2) {
      const bonus = (multi.length - 1) * 15;
      this.skor += bonus;
      const cx = multi.reduce((s, f) => s + f.x, 0) / multi.length;
      const cy = multi.reduce((s, f) => s + f.y, 0) / multi.length;
      this.showScorePopup(cx, cy, `⚡ MULTI x${multi.length}! +${bonus}`, '#ff66ff');
      this.setEvent(`⚡ Multi-slice x${multi.length}! +${bonus}`);
      sfx.power();
    }
  }

  private hitFruit(f: FruitObj) {
    f.hit = true;
    f.text?.setVisible(false);
    f.glow?.destroy();
    f.glow = null;

    if (f.type === 'shard') {
      this.skor += SHARD_POINTS;
      this.slices++;
      this.showScorePopup(f.x, f.y, `+${SHARD_POINTS}`, '#66ccff');
      this.spawnParticles(f.x, f.y, 0x66ccff, 5);
      sfx.pop();
      return;
    }

    if (f.type === 'bomb') {
      this.nyawa--;
      this.kombo = 0;
      this.bombsHit++;
      this.spawnParticles(f.x, f.y, 0xff2200, 12);
      this.cameras.main.shake(1500, 0.025);
      this.setEvent('💣 Bom! -1 nyawa');
      // Show bomb effect text
      this.showScorePopup(f.x, f.y, '💥', '#ff4444');
      sfx.boom();
      if (this.nyawa <= 0) this.endGame();
      return;
    }

    if (f.type === 'star') {
      this.doublePointsUntil = Date.now() + STAR_DURATION_MS;
      this.spawnParticles(f.x, f.y, 0xffd700, 14);
      this.cameras.main.flash(180, 255, 220, 80);
      this.setEvent('⭐ 2X Poin selama 6 detik!');
      this.showScorePopup(f.x, f.y, '⭐ 2X!', '#ffd700');
      sfx.power();
      return;
    }

    // Fruit sliced!
    this.slices++;
    this.kombo++;
    if (this.kombo > this.maxKombo) this.maxKombo = this.kombo;
    if (this.kombo >= 3) { sfx.power(); } else { sfx.pop(); }

    // Frenzy Mode — fires once per combo run, the moment kombo crosses 5:
    // a golden screen flash + faster spawns for 3s, giving the combo payoff
    // beyond just extra points.
    if (this.kombo === 5) {
      this.cameras.main.flash(220, 255, 215, 100);
      this.cameras.main.shake(150, 0.008);
      this.frenzyUntil = Date.now() + 3000;
      this.setEvent('🔥 FRENZY MODE!');
    }

    let pts = 10;
    if (this.kombo >= 5) pts += 15;
    else if (this.kombo >= 3) pts += 8;
    else if (this.kombo >= 2) pts += 3;
    if (f.type === 'heavy') pts *= 2;
    if (f.golden) pts *= GOLDEN_RUSH_MULT;
    if (Date.now() < this.doublePointsUntil) pts *= 2;
    this.skor += pts;

    const tag = f.golden ? ' 🌟' : f.type === 'heavy' ? ' 💪' : f.type === 'split' ? ' ✂️' : '';
    this.setEvent(`✅ +${pts}${this.kombo >= 2 ? ` (${this.kombo}x)` : ''}${tag}`);

    // Score popup at fruit position
    const label = this.kombo >= 3 ? `+${pts} 🔥` : `+${pts}${tag}`;
    this.showScorePopup(f.x, f.y, label, f.golden ? '#ffd700' : '#ffd700');

    // Spawn halves & particles
    this.spawnHalves(f.x, f.y, f.emoji);
    this.spawnParticles(f.x, f.y, this.fruitColor(f.emoji), f.type === 'heavy' ? 14 : 8);

    // Splitting fruit shatters into two small bonus shards on slice — a
    // fast follow-up hit within their short SHARD_LIFE_S window.
    if (f.type === 'split') {
      this.spawnShards(f.x, f.y);
    }
  }

  /* ── Bonus shards from a split fruit — small, short-lived, worth a flat
     bonus, and never cost a life if missed. ── */
  private spawnShards(x: number, y: number) {
    const shardSize = Math.max(20, Math.round(this.cfg.fruitSize * this.sc * 0.55));
    const shardR = Math.max(18, Math.round(this.cfg.fruitHitRadius * this.sc * 0.6));
    for (const side of [-1, 1]) {
      const obj: FruitObj = {
        x,
        y,
        vx: side * (90 + Math.random() * 60) * this.sc,
        vy: -(120 + Math.random() * 80) * this.sc,
        g: (this.cfg.gravityBase + 40) * this.sc,
        r: shardR,
        type: 'shard',
        emoji: '✨',
        hit: false,
        rot: 0,
        rotSpeed: side * 5,
        text: null,
        life: SHARD_LIFE_S,
      };
      obj.text = this.add
        .text(x, y, obj.emoji, { fontSize: `${shardSize}px`, fontFamily: 'system-ui' })
        .setOrigin(0.5)
        .setDepth(3);
      this.fruits.push(obj);
    }
  }

  /* ── Score popup — flies up from slice point ── */
  private showScorePopup(x: number, y: number, text: string, color: string) {
    const sz = Math.max(16, Math.round(22 * this.sc));
    const popup = this.add
      .text(x, y - 10, text, {
        fontSize: `${sz}px`,
        color,
        fontFamily: 'system-ui',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: Math.round(3 * this.sc),
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.tweens.add({
      targets: popup,
      y: y - 60 * this.sc,
      alpha: 0,
      duration: 700,
      ease: 'Power2',
      onComplete: () => popup.destroy(),
    });
  }

  private spawnHalves(x: number, y: number, emoji: string) {
    const halfSize = Math.max(26, Math.round(36 * this.sc));
    for (let side = -1; side <= 1; side += 2) {
      const hf: HalfObj = {
        x,
        y,
        vx: side * (30 + Math.random() * 50) * this.sc,
        vy: -(60 + Math.random() * 80) * this.sc,
        g: 280 * this.sc,
        emoji,
        alpha: 1,
        rot: 0,
        rotSpeed: side * (2 + Math.random() * 3),
        text: null,
      };
      hf.text = this.add
        .text(x, y, emoji, {
          fontSize: `${halfSize}px`,
          fontFamily: 'system-ui',
        })
        .setOrigin(0.5)
        .setDepth(4);
      this.halves.push(hf);
    }
  }

  private spawnParticles(x: number, y: number, color: number, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (50 + Math.random() * 120) * this.sc;
      const life = 0.4 + Math.random() * 0.4;
      const size = (3 + Math.random() * 4) * this.sc;
      const p: Particle = {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50,
        life,
        maxLife: life,
        color,
        size,
        gfx: null,
      };
      p.gfx = this.add.circle(x, y, size, color).setDepth(6);
      this.particles.push(p);
    }
  }

  private fruitColor(emoji: string): number {
    const map: Record<string, number> = {
      '🍎': 0xff3333,
      '🍊': 0xff8800,
      '🍋': 0xffee00,
      '🍉': 0x33cc33,
      '🍇': 0x9933ff,
      '🍓': 0xff4466,
      '🍑': 0xffaa77,
      '🍍': 0xffdd33,
      '🥝': 0x66cc33,
      '🫐': 0x3344ff,
      '🍒': 0xcc2222,
      '🥭': 0xffaa00,
    };
    return map[emoji] ?? 0xffcc00;
  }

  /* ================================================================
   *   SLASH TRAIL — glow on mobile
   * ================================================================ */
  private drawSlash() {
    this.slashGfx.clear();
    const now = Date.now();
    this.slash = this.slash.filter((p) => now - p.t < 150);

    const isActive = this.isMobile
      ? this.slash.length >= 2
      : this.slash.length >= 2 && now - this.lastMoveTime < 100;

    if (!isActive) return;

    for (let i = 1; i < this.slash.length; i++) {
      const a = this.slash[i - 1];
      const b = this.slash[i];
      const age = (now - b.t) / 150;
      const alpha = Math.max(0, 1 - age) * 0.85;
      const thickness = Math.max(2, (1 - age) * (this.isMobile ? 8 : 5));

      // Glow layer
      this.slashGfx.lineStyle(thickness + 4, 0xffffff, alpha * 0.15);
      this.slashGfx.strokeLineShape(new Phaser.Geom.Line(a.x, a.y, b.x, b.y));
      // Main trail
      this.slashGfx.lineStyle(thickness, 0xffffff, alpha);
      this.slashGfx.strokeLineShape(new Phaser.Geom.Line(a.x, a.y, b.x, b.y));
    }
  }

  /* ================================================================
   *   GAME OVER
   * ================================================================ */
  private endGame() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.cameras.main.shake(400, 0.02);
    this.setEvent('💥 Game Over!');
    sfx.death();
    this.emitCurrentState();
    this.submitScore();
  }

  /* ================================================================
   *   SESSIONS & SCORES
   * ================================================================ */
  private async startSession() {
    try {
      const r = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ game: 'fruit-ninja' }),
      });
      const j = await r.json();
      if (j?.ok) this.sessionCtx = j;
    } catch {
      /* best effort */
    }
  }

  private async submitScore() {
    try {
      await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          game: 'fruit-ninja',
          score: this.skor,
          meta: {
            slices: this.slices,
            missed: this.missed,
            maxKombo: this.maxKombo,
            nyawa: this.nyawa,
            stage: this.getStage() + 1,
            bombsHit: this.bombsHit,
            fruitsSliced: this.slices,
            durationSec: Math.floor((Date.now() - this.startTime) / 1000),
          },
          sessionId: this.sessionCtx?.sessionId,
          startedAt: this.sessionCtx?.startedAt,
          token: this.sessionCtx?.token,
        }),
      });
    } catch {
      /* best effort */
    }
  }
}

/* ── helpers ── */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
