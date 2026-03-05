import Phaser from 'phaser';

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

/* ── Types ── */
interface FruitObj {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  r: number;
  type: 'fruit' | 'bomb';
  emoji: string;
  hit: boolean;
  rot: number;
  rotSpeed: number;
  text: Phaser.GameObjects.Text | null;
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
  lives: number;
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
  private lastSpawn = 0;
  private lastMoveTime = 0;
  private lastEvent = '';
  private lastEventTime = 0;
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

    if (this.gameOver) {
      this.emitCurrentState();
      return;
    }

    const dt = delta / 1000;
    const now = Date.now();

    // Desktop: combo resets if cursor idle > 400ms
    if (!this.isMobile && this.kombo > 0 && now - this.lastMoveTime > 400) {
      this.kombo = 0;
    }

    // Spawn logic
    const stage = this.getStage();
    const gap = this.cfg.gapByStage[stage] ?? 800;
    if (now - this.lastSpawn > gap) {
      this.spawnBurst(stage);
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
      lives: this.cfg.lives,
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
    this.lastSpawn = 0;
    this.lastMoveTime = 0;
    this.lastEvent = '';
    this.lastEventTime = 0;
    this.sessionCtx = null;
    this.slash = [];
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
    this.lastEvent = '';
    this.lastEventTime = 0;
    this.slash = [];
    this.clearObjects();
    this.slashGfx?.clear();
    this.emitCurrentState();
    this.showCountdown();
  }

  private clearObjects() {
    this.fruits.forEach((f) => f.text?.destroy());
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
    const elapsed = (Date.now() - this.startTime) / 1000;
    const ss = this.cfg.stageSeconds;
    for (let i = ss.length - 1; i >= 0; i--) {
      if (elapsed >= ss[i]) return i + 1;
    }
    return 0;
  }

  /* ================================================================
   *   SPAWNING
   * ================================================================ */
  private spawnBurst(stage: number) {
    const { width: w, height: h } = this.scale;
    const burstMin = this.cfg.burstMin[stage] ?? 1;
    const burstMax = this.cfg.burstMax[stage] ?? 2;
    const count =
      burstMin + Math.floor(Math.random() * (burstMax - burstMin + 1));
    const maxObj = this.cfg.maxByStage[stage] ?? 6;
    const active = this.fruits.filter((f) => !f.hit).length;
    if (active >= maxObj) return;

    const spawned: FruitObj[] = [];
    const fruitSize = Math.max(36, Math.round(this.cfg.fruitSize * this.sc));
    const hitR = Math.max(28, Math.round(this.cfg.fruitHitRadius * this.sc));

    for (let i = 0; i < count && active + spawned.length < maxObj; i++) {
      const isBomb = Math.random() < (this.cfg.bombBase[stage] ?? 0.08);
      const isWeird =
        !isBomb && Math.random() < (this.cfg.weirdChance[stage] ?? 0.06);
      const emoji = isBomb ? BOMB : isWeird ? pick(WEIRD) : pick(FRUITS);
      const type: 'fruit' | 'bomb' = isBomb ? 'bomb' : 'fruit';

      const margin = fruitSize + 20;
      const x = margin + Math.random() * (w - margin * 2);
      const vx = (Math.random() - 0.5) * 80 * this.sc;
      const launchMin = this.cfg.launchSpeedMin * this.sc;
      const launchMax = this.cfg.launchSpeedMax * this.sc;
      const vy = -(launchMin + Math.random() * (launchMax - launchMin));
      const g = (this.cfg.gravityBase + Math.random() * 60) * this.sc;

      if (isBomb && spawned.length > 0) {
        const dist = this.cfg.safeBombDistance * this.sc;
        if (spawned.some((s) => Math.hypot(s.x - x, 0) < dist)) continue;
      }

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
      };
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
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      const f = this.fruits[i];
      f.vy += f.g * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.rotSpeed * dt;

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

      if (f.y > h + 60) {
        if (!f.hit && f.type === 'fruit') {
          this.missed++;
          this.nyawa--;
          this.spawnParticles(f.x, h - 10, 0xff4444, 4);
          this.setEvent('❌ Missed! -1 nyawa');
          if (this.nyawa <= 0) this.endGame();
        }
        f.text?.destroy();
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
    for (const f of this.fruits) {
      if (f.hit) continue;
      const dx = f.x - sx;
      const dy = f.y - sy;
      if (Math.sqrt(dx * dx + dy * dy) < f.r + fingerBonus) {
        this.hitFruit(f);
      }
    }
  }

  private hitFruit(f: FruitObj) {
    f.hit = true;
    f.text?.setVisible(false);

    if (f.type === 'bomb') {
      this.nyawa--;
      this.kombo = 0;
      this.bombsHit++;
      this.spawnParticles(f.x, f.y, 0xff2200, 12);
      this.cameras.main.shake(1500, 0.025);
      this.setEvent('💣 Bom! -1 nyawa');
      // Show bomb effect text
      this.showScorePopup(f.x, f.y, '💥', '#ff4444');
      if (this.nyawa <= 0) this.endGame();
      return;
    }

    // Fruit sliced!
    this.slices++;
    this.kombo++;
    if (this.kombo > this.maxKombo) this.maxKombo = this.kombo;

    let pts = 10;
    if (this.kombo >= 5) pts += 15;
    else if (this.kombo >= 3) pts += 8;
    else if (this.kombo >= 2) pts += 3;
    this.skor += pts;

    this.setEvent(`✅ +${pts}${this.kombo >= 2 ? ` (${this.kombo}x)` : ''}`);

    // Score popup at fruit position
    const label = this.kombo >= 3 ? `+${pts} 🔥` : `+${pts}`;
    this.showScorePopup(f.x, f.y, label, '#ffd700');

    // Spawn halves & particles
    this.spawnHalves(f.x, f.y, f.emoji);
    this.spawnParticles(f.x, f.y, this.fruitColor(f.emoji), 8);
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
