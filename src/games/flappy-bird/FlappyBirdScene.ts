import Phaser from 'phaser';
import { sfx } from '../arcade/kit';

/* ── Shared state for React UI ── */
export interface FBGameState {
  score: number;
  highScore: number;
  gameOver: boolean;
  started: boolean;
  elapsed: number;
  pipesPassed: number;
  shieldActive: boolean;
}

function emitState(s: FBGameState) {
  (window as any).__fbState = s;
  window.dispatchEvent(new Event('fb-update'));
}

/* ── Constants ── */
const GRAVITY = 900;
const FLAP_VELOCITY = -320;
const PIPE_SPEED = -180;
const PIPE_GAP = 150;
const PIPE_SPACING = 260;
const PIPE_WIDTH = 60;
const GROUND_HEIGHT = 80;
const BIRD_SIZE = 40; // display size
const SHIELD_ORB_CHANCE = 0.22; // per pipe spawn, at most one orb in play
const SHIELD_ORB_R = 15;

/* ── Chapters/biomes — the environment reskins every BIOME_STEP pipes and
   cycles, each later biome layering in a new obstacle behavior on top of
   the previous ones (moving pipes, then wind gusts) rather than a flat
   speed ramp being the only thing that ever changes. ── */
const BIOME_STEP = 10; // pipes passed before the biome advances
interface Biome {
  name: string;
  sky: [number, number];
  pipe: [number, number, number]; // body, highlight, shadow
  ground: [number, number, number]; // dirt, grass, grass highlight
  moving: boolean; // pipes oscillate vertically
  wind: boolean; // periodic gust impulses on the bird
  narrowChance: number; // chance a spawned pipe uses a tighter gap
}
const BIOMES: Biome[] = [
  { name: 'Kota', sky: [0x87ceeb, 0x4ca1e0], pipe: [0x2d8b2d, 0x4caf50, 0x1b5e1b], ground: [0x8b6914, 0x5cb85c, 0x7dd87d], moving: false, wind: false, narrowChance: 0 },
  { name: 'Senja', sky: [0xff8c69, 0xff6b9d], pipe: [0xb8621b, 0xe0812e, 0x7a3d0f], ground: [0x6b4423, 0xc47a3d, 0xe0985a], moving: true, wind: false, narrowChance: 0.15 },
  { name: 'Goa', sky: [0x1a1a2e, 0x16213e], pipe: [0x555b66, 0x8b96a3, 0x2e3339], ground: [0x2b2d33, 0x4a4e57, 0x63676f], moving: true, wind: false, narrowChance: 0.25 },
  { name: 'Badai', sky: [0x2c2c54, 0x181830], pipe: [0x37474f, 0x607d8b, 0x1c2529], ground: [0x1c2529, 0x37474f, 0x546e7a], moving: true, wind: true, narrowChance: 0.35 },
];

export class FlappyBirdScene extends Phaser.Scene {
  private bird!: Phaser.GameObjects.Image;
  private birdAngle = 0;
  private birdVelocity = 0;
  private pipes: {
    top: Phaser.GameObjects.Graphics;
    bottom: Phaser.GameObjects.Graphics;
    x: number;
    baseGapY: number;
    gap: number;
    phase: number;
    biomeIdx: number;
    scored: boolean;
  }[] = [];
  private ground!: Phaser.GameObjects.TileSprite;
  private groundGfx!: Phaser.GameObjects.Graphics;
  private cloudGfx!: Phaser.GameObjects.Graphics;
  private clouds: { x: number; y: number; s: number; speed: number }[] = [];
  private skyGfx!: Phaser.GameObjects.Graphics;

  /* Biome/chapter state */
  private biomeIdx = 0;
  private biomeBanner!: Phaser.GameObjects.Text;
  private biomeBannerTimer = 0;

  /* Wind gusts (Badai biome only) */
  private nextGustAt = 0;
  private gustWarnTimer = 0;
  private gustArrow!: Phaser.GameObjects.Graphics;

  /* Shield power-up — rare orb that absorbs the next collision instead of
     dying, since previously the bird had no way to survive a single hit. */
  private shieldOrbs: { x: number; y: number; gfx: Phaser.GameObjects.Graphics }[] = [];
  private shieldActive = false;

  private score = 0;
  private highScore = 0;
  private pipesPassed = 0;
  private gameOver = false;
  private started = false;
  private startTime = 0;
  // Accumulated frame time, not wall-clock — Phaser pauses update() while
  // the tab is hidden, but Date.now() keeps advancing, so a backgrounded
  // tab used to snap pipe speed to a much higher value on refocus.
  private elapsedPlayMs = 0;

  private scoreText!: Phaser.GameObjects.Text;
  private tapText!: Phaser.GameObjects.Text;

  private sceneReadyFired = false;
  private restartHandler: (() => void) | null = null;

  private sessionCtx: {
    sessionId?: string;
    startedAt?: number;
    token?: string;
  } | null = null;

  /* Wing animation */
  private wingTimer = 0;
  private wingUp = false;
  private wingGfx!: Phaser.GameObjects.Graphics;

  /* Pixel outline effect */
  private pixelOutline!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'FlappyBirdScene' });
  }

  preload() {
    this.load.image('piyik', '/piyik.png');
  }

  create() {
    const { width: w, height: h } = this.scale;
    const hs = localStorage.getItem('fb-highscore');
    if (hs) this.highScore = Number(hs) || 0;

    /* Sky gradient — redrawn on every biome change via drawSky() */
    this.skyGfx = this.add.graphics().setDepth(0);
    this.biomeIdx = 0;
    this.drawSky(w, h);

    /* Clouds (parallax decorative) */
    this.drawClouds(w, h);

    /* Biome/chapter banner */
    this.biomeBanner = this.add
      .text(w / 2, h * 0.22, '', {
        fontSize: '22px',
        fontFamily: 'system-ui',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(21)
      .setAlpha(0);

    /* Wind-gust warning arrow (Badai biome) */
    this.gustArrow = this.add.graphics().setDepth(12);

    /* Ground */
    this.groundGfx = this.add.graphics().setDepth(8);
    this.drawGround(w, h);

    /* Bird */
    this.bird = this.add
      .image(w * 0.3, h * 0.4, 'piyik')
      .setOrigin(0.5)
      .setDepth(10);
    // Scale to BIRD_SIZE with pixel art rendering
    const birdScale = BIRD_SIZE / Math.max(this.bird.width, this.bird.height);
    this.bird.setScale(birdScale);
    // Set pixelated rendering for pixel art effect
    this.bird.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    /* Wing overlay */
    this.wingGfx = this.add.graphics().setDepth(11);

    /* Pixel outline overlay */
    this.pixelOutline = this.add.graphics().setDepth(11);

    /* Score text (in-game) */
    this.scoreText = this.add
      .text(w / 2, 50, '0', {
        fontSize: '48px',
        fontFamily: 'system-ui',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setAlpha(0);

    /* Tap to start */
    this.tapText = this.add
      .text(w / 2, h / 2 + 40, '👆 Tap untuk mulai', {
        fontSize: '20px',
        fontFamily: 'system-ui',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(20);

    /* Input */
    this.input.on('pointerdown', () => this.flap());
    this.input.keyboard?.on('keydown-SPACE', () => this.flap());
    this.input.keyboard?.on('keydown-M', () => { sfx.toggle(); window.dispatchEvent(new Event('arcade-mute')); });

    /* Restart listener */
    this.restartHandler = () => this.restartGame();
    window.addEventListener('fb-restart', this.restartHandler);

    this.events.once('destroy', () => {
      if (this.restartHandler)
        window.removeEventListener('fb-restart', this.restartHandler);
      delete (window as any).__fbState;
    });

    /* Reset state */
    this.birdVelocity = 0;
    this.birdAngle = 0;
    this.score = 0;
    this.pipesPassed = 0;
    this.gameOver = false;
    this.started = false;
    this.pipes = [];
    this.shieldOrbs.forEach((o) => o.gfx.destroy());
    this.shieldOrbs = [];
    this.shieldActive = false;
    this.nextGustAt = 0;
    this.gustWarnTimer = 0;

    this.emitCurrentState();
  }

  update(_time: number, delta: number) {
    if (!this.sceneReadyFired) {
      this.sceneReadyFired = true;
      window.dispatchEvent(new Event('fb-scene-ready'));
    }

    sfx.musicTick(this.started && !this.gameOver, this.getCurrentPipeSpeed() < -240 ? 1 : 0, 'flappybird');

    const dt = delta / 1000;
    const { width: w, height: h } = this.scale;
    const groundY = h - GROUND_HEIGHT;

    this.updateClouds(dt, w);

    /* Idle bobbing before start */
    if (!this.started && !this.gameOver) {
      this.bird.y = h * 0.4 + Math.sin(_time / 300) * 8;
      this.bird.angle = 0;
      this.drawWings(dt);
      this.drawPixelOutline();
      this.emitCurrentState();
      return;
    }

    if (this.gameOver) {
      this.emitCurrentState();
      return;
    }

    this.elapsedPlayMs += delta;

    /* Physics */
    this.birdVelocity += GRAVITY * dt;
    this.bird.y += this.birdVelocity * dt;

    /* Bird rotation based on velocity */
    const targetAngle = Phaser.Math.Clamp(this.birdVelocity / 8, -30, 90);
    this.birdAngle = Phaser.Math.Linear(this.birdAngle, targetAngle, 0.1);
    this.bird.angle = this.birdAngle;

    /* Wing animation */
    this.drawWings(dt);
    this.drawPixelOutline();

    /* Pipe movement & spawning */
    const pipeSpeed = this.getCurrentPipeSpeed();

    // Spawn new pipes
    const lastPipeX =
      this.pipes.length > 0 ? Math.max(...this.pipes.map((p) => p.x)) : 0;
    if (this.pipes.length === 0 || lastPipeX < w - PIPE_SPACING) {
      this.spawnPipe(w + 50);
    }

    // Move & check pipes
    for (let i = this.pipes.length - 1; i >= 0; i--) {
      const pipe = this.pipes[i];
      pipe.x += pipeSpeed * dt;

      // Pipes spawned during a "moving" biome bob vertically on a sine wave
      // (own phase per pipe, so a row of them undulates rather than moving
      // in lockstep) — clamped so the gap never touches the HUD or ground.
      const pipeBiome = BIOMES[pipe.biomeIdx % BIOMES.length];
      let effGapY = pipe.baseGapY;
      if (pipeBiome.moving) {
        const amp = 32;
        const minGapY = 80 + pipe.gap / 2;
        const maxGapY = groundY - 80 - pipe.gap / 2;
        effGapY = Phaser.Math.Clamp(
          pipe.baseGapY + Math.sin(_time / 900 + pipe.phase) * amp,
          minGapY,
          maxGapY,
        );
      }

      // Redraw pipe at new position
      pipe.top.clear();
      pipe.bottom.clear();
      this.drawPipe(pipe.top, pipe.x, 0, effGapY - pipe.gap / 2, pipeBiome.pipe);
      this.drawPipe(
        pipe.bottom,
        pipe.x,
        effGapY + pipe.gap / 2,
        groundY - (effGapY + pipe.gap / 2),
        pipeBiome.pipe,
      );

      // Score check
      if (!pipe.scored && pipe.x + PIPE_WIDTH / 2 < this.bird.x) {
        pipe.scored = true;
        this.score++;
        this.pipesPassed++;
        if (this.score > this.highScore) {
          this.highScore = this.score;
          localStorage.setItem('fb-highscore', String(this.highScore));
        }
        this.scoreText.setText(String(this.score));
        sfx.coin();
        // Score pop effect
        this.tweens.add({
          targets: this.scoreText,
          scaleX: 1.3,
          scaleY: 1.3,
          duration: 100,
          yoyo: true,
          ease: 'Back.easeOut',
        });

        // Chapter/biome advance every BIOME_STEP pipes
        const targetBiome = Math.floor(this.pipesPassed / BIOME_STEP);
        if (targetBiome !== this.biomeIdx) {
          this.setBiome(targetBiome, w, h, true);
        }
      }

      // Collision detection
      const birdR = BIRD_SIZE * 0.35;
      const birdX = this.bird.x;
      const birdY = this.bird.y;

      // Check pipe collision (rectangle vs circle)
      const pipeLeft = pipe.x - PIPE_WIDTH / 2;
      const pipeRight = pipe.x + PIPE_WIDTH / 2;
      if (birdX + birdR > pipeLeft && birdX - birdR < pipeRight) {
        // Top pipe
        if (birdY - birdR < effGapY - pipe.gap / 2) {
          if (this.consumeShield()) continue;
          this.die();
          return;
        }
        // Bottom pipe
        if (birdY + birdR > effGapY + pipe.gap / 2) {
          if (this.consumeShield()) continue;
          this.die();
          return;
        }
      }

      // Remove off-screen pipes
      if (pipe.x < -PIPE_WIDTH) {
        pipe.top.destroy();
        pipe.bottom.destroy();
        this.pipes.splice(i, 1);
      }
    }

    // Biome banner fade-out
    if (this.biomeBannerTimer > 0) {
      this.biomeBannerTimer -= dt;
      if (this.biomeBannerTimer <= 0) {
        this.tweens.add({ targets: this.biomeBanner, alpha: 0, duration: 400 });
      }
    }

    // Wind gusts — only in biomes flagged `wind`. Telegraphed 0.6s ahead
    // with a pulsing arrow so a gust never feels like an unfair surprise.
    const curBiome = BIOMES[this.biomeIdx % BIOMES.length];
    if (curBiome.wind) {
      if (this.nextGustAt === 0) this.nextGustAt = this.elapsedPlayMs + 3500;
      const untilGust = this.nextGustAt - this.elapsedPlayMs;
      if (untilGust <= 600 && untilGust > 0) {
        this.gustWarnTimer += dt;
        this.gustArrow.clear();
        const dir = Math.sin(this.nextGustAt) > 0 ? 1 : -1;
        const pulse = 0.5 + Math.abs(Math.sin(_time / 60)) * 0.5;
        this.gustArrow.fillStyle(0xfff176, pulse);
        const ax = this.bird.x;
        const ay = this.bird.y - dir * 40;
        this.gustArrow.fillTriangle(ax - 10, ay, ax + 10, ay, ax, ay - dir * 16);
      } else if (untilGust <= 0) {
        const dir = Math.sin(this.nextGustAt) > 0 ? 1 : -1;
        this.birdVelocity += dir * -260;
        this.cameras.main.shake(150, 0.008);
        sfx.hit();
        this.gustArrow.clear();
        this.gustWarnTimer = 0;
        this.nextGustAt = this.elapsedPlayMs + 3200 + Math.random() * 1800;
      }
    } else if (this.gustArrow) {
      this.gustArrow.clear();
    }

    // Shield orbs — move with the pipes, collect on overlap
    for (let i = this.shieldOrbs.length - 1; i >= 0; i--) {
      const orb = this.shieldOrbs[i];
      orb.x += pipeSpeed * dt;
      orb.gfx.clear();
      const pulse = SHIELD_ORB_R + Math.sin(_time / 150) * 2;
      orb.gfx.fillStyle(0x66e0ff, 0.25); orb.gfx.fillCircle(orb.x, orb.y, pulse + 6);
      orb.gfx.fillStyle(0x38bdf8, 0.95); orb.gfx.fillCircle(orb.x, orb.y, pulse);
      orb.gfx.lineStyle(2, 0xffffff, 0.8); orb.gfx.strokeCircle(orb.x, orb.y, pulse * 0.55);

      if (Math.hypot(orb.x - this.bird.x, orb.y - this.bird.y) < SHIELD_ORB_R + BIRD_SIZE * 0.35) {
        this.shieldActive = true;
        orb.gfx.destroy();
        this.shieldOrbs.splice(i, 1);
        this.cameras.main.flash(150, 100, 220, 255);
        sfx.power();
        continue;
      }
      if (orb.x < -40) {
        orb.gfx.destroy();
        this.shieldOrbs.splice(i, 1);
      }
    }

    // Ground collision
    if (this.bird.y + BIRD_SIZE / 2 >= groundY) {
      this.bird.y = groundY - BIRD_SIZE / 2;
      if (this.consumeShield()) { this.birdVelocity = FLAP_VELOCITY * 0.6; }
      else { this.die(); return; }
    }
    // Ceiling
    if (this.bird.y - BIRD_SIZE / 2 <= 0) {
      this.bird.y = BIRD_SIZE / 2;
      this.birdVelocity = 0;
    }

    this.emitCurrentState();
  }

  /* ── Helpers ── */

  private flap() {
    if (this.gameOver) return;
    if (!this.started) {
      this.started = true;
      this.startTime = Date.now();
      this.elapsedPlayMs = 0;
      this.tapText.setAlpha(0);
      this.scoreText.setAlpha(1);
      this.startSession();
    }
    this.birdVelocity = FLAP_VELOCITY;
    // Wing flap visual
    this.wingUp = true;
    this.wingTimer = 0;
    sfx.pop();
  }

  /** Consumes the shield on the first hit after collecting an orb. Returns
   *  true if a collision was absorbed (caller should not call die()). */
  private consumeShield(): boolean {
    if (!this.shieldActive) return false;
    this.shieldActive = false;
    this.cameras.main.flash(150, 255, 255, 255);
    this.spawnFeatherBurst(this.bird.x, this.bird.y);
    sfx.hit();
    return true;
  }

  private die() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.cameras.main.shake(300, 0.02);
    // Flash red
    this.cameras.main.flash(200, 255, 0, 0);
    this.spawnFeatherBurst(this.bird.x, this.bird.y);
    sfx.death();
    this.submitScore();
    this.emitCurrentState();
  }

  // One-shot feather burst on death — small circles that scatter and fade,
  // using tweens rather than a per-frame particle loop since this only ever
  // fires once per run.
  private spawnFeatherBurst(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 30;
      const feather = this.add.circle(x, y, 2 + Math.random() * 2, 0xffcc00, 0.9).setDepth(15);
      this.tweens.add({
        targets: feather,
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist + 15,
        alpha: 0,
        duration: 500 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => feather.destroy(),
      });
    }
  }

  private restartGame() {
    // Clean up pipes
    this.pipes.forEach((p) => {
      p.top.destroy();
      p.bottom.destroy();
    });
    this.pipes = [];
    this.shieldOrbs.forEach((o) => o.gfx.destroy());
    this.shieldOrbs = [];
    this.shieldActive = false;

    this.score = 0;
    this.pipesPassed = 0;
    this.gameOver = false;
    this.started = false;
    this.birdVelocity = 0;
    this.birdAngle = 0;
    this.sessionCtx = null;
    this.nextGustAt = 0;
    this.gustWarnTimer = 0;
    this.gustArrow.clear();

    const { width: w, height: h } = this.scale;
    this.bird.y = h * 0.4;
    this.bird.angle = 0;

    this.scoreText.setText('0').setAlpha(0);
    this.tapText.setAlpha(1);
    this.wingGfx.clear();
    this.pixelOutline.clear();
    this.setBiome(0, w, h, false);

    this.emitCurrentState();
  }

  /* ── Biome/chapter transitions ── */
  private setBiome(idx: number, w: number, h: number, announce: boolean) {
    this.biomeIdx = idx;
    this.drawSky(w, h);
    this.drawGround(w, h);
    if (announce) {
      const b = BIOMES[idx % BIOMES.length];
      this.biomeBanner.setText(`🚩 Chapter: ${b.name}`).setAlpha(1).setScale(0.7);
      this.biomeBannerTimer = 1.8;
      this.tweens.add({ targets: this.biomeBanner, scale: 1, duration: 250, ease: 'Back.easeOut' });
      sfx.power();
    }
  }

  private drawSky(w: number, h: number) {
    const b = BIOMES[this.biomeIdx % BIOMES.length];
    this.skyGfx.clear();
    this.skyGfx.fillGradientStyle(b.sky[0], b.sky[0], b.sky[1], b.sky[1], 1);
    this.skyGfx.fillRect(0, 0, w, h);
  }

  private spawnPipe(x: number) {
    const { height: h } = this.scale;
    const groundY = h - GROUND_HEIGHT;
    const biome = BIOMES[this.biomeIdx % BIOMES.length];
    const gap = Math.random() < biome.narrowChance ? PIPE_GAP * 0.78 : PIPE_GAP;
    const minGapY = 80 + gap / 2;
    const maxGapY = groundY - 80 - gap / 2;
    const gapY = Phaser.Math.Between(minGapY, maxGapY);

    const top = this.add.graphics().setDepth(5);
    const bottom = this.add.graphics().setDepth(5);
    const phase = Math.random() * Math.PI * 2;

    this.drawPipe(top, x, 0, gapY - gap / 2, biome.pipe);
    this.drawPipe(
      bottom,
      x,
      gapY + gap / 2,
      groundY - (gapY + gap / 2),
      biome.pipe,
    );

    this.pipes.push({ top, bottom, x, baseGapY: gapY, gap, phase, biomeIdx: this.biomeIdx, scored: false });

    // Rare shield orb, centered in this pipe's gap — at most one in play,
    // and never while the player already holds a shield.
    if (!this.shieldActive && this.shieldOrbs.length === 0 && Math.random() < SHIELD_ORB_CHANCE) {
      const gfx = this.add.graphics().setDepth(9);
      this.shieldOrbs.push({ x, y: gapY, gfx });
    }
  }

  private drawPipe(
    gfx: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    height: number,
    colors: [number, number, number] = [0x2d8b2d, 0x4caf50, 0x1b5e1b],
  ) {
    if (height <= 0) return;
    const [bodyColor, hiColor, shadowColor] = colors;
    const left = x - PIPE_WIDTH / 2;

    // Main pipe body
    gfx.fillStyle(bodyColor, 1);
    gfx.fillRect(left, y, PIPE_WIDTH, height);

    // Pipe highlights
    gfx.fillStyle(hiColor, 1);
    gfx.fillRect(left + 4, y, 8, height);

    // Pipe shadow
    gfx.fillStyle(shadowColor, 1);
    gfx.fillRect(left + PIPE_WIDTH - 8, y, 8, height);

    // Cap (wider)
    const capH = 20;
    const capW = PIPE_WIDTH + 12;
    const capX = x - capW / 2;
    if (y === 0) {
      // Top pipe — cap at bottom
      gfx.fillStyle(bodyColor, 1);
      gfx.fillRect(capX, y + height - capH, capW, capH);
      gfx.fillStyle(hiColor, 1);
      gfx.fillRect(capX + 4, y + height - capH, 8, capH);
      gfx.lineStyle(2, shadowColor, 1);
      gfx.strokeRect(capX, y + height - capH, capW, capH);
    } else {
      // Bottom pipe — cap at top
      gfx.fillStyle(bodyColor, 1);
      gfx.fillRect(capX, y, capW, capH);
      gfx.fillStyle(hiColor, 1);
      gfx.fillRect(capX + 4, y, 8, capH);
      gfx.lineStyle(2, shadowColor, 1);
      gfx.strokeRect(capX, y, capW, capH);
    }
  }

  private drawGround(_w: number, h: number) {
    const w = _w;
    const groundY = h - GROUND_HEIGHT;
    const [dirt, grass, grassHi] = BIOMES[this.biomeIdx % BIOMES.length].ground;
    this.groundGfx.clear();

    // Dirt
    this.groundGfx.fillStyle(dirt, 1);
    this.groundGfx.fillRect(0, groundY, w, GROUND_HEIGHT);

    // Grass top
    this.groundGfx.fillStyle(grass, 1);
    this.groundGfx.fillRect(0, groundY, w, 16);

    // Grass highlight
    this.groundGfx.fillStyle(grassHi, 1);
    this.groundGfx.fillRect(0, groundY, w, 6);

    // Pixel grass tufts
    for (let x = 0; x < w; x += 20) {
      const tuftH = Phaser.Math.Between(4, 12);
      this.groundGfx.fillStyle(grass, 0.8);
      this.groundGfx.fillRect(x, groundY - tuftH, 4, tuftH);
    }

    // Ground line
    this.groundGfx.lineStyle(2, dirt, 1);
    this.groundGfx.lineBetween(0, groundY, w, groundY);
  }

  private drawClouds(w: number, h: number) {
    this.cloudGfx = this.add.graphics().setDepth(1).setAlpha(0.6);
    this.clouds = [
      { x: w * 0.15, y: h * 0.12, s: 1.0, speed: 6 },
      { x: w * 0.55, y: h * 0.08, s: 0.7, speed: 4 },
      { x: w * 0.8, y: h * 0.18, s: 0.9, speed: 8 },
      { x: w * 0.35, y: h * 0.25, s: 0.5, speed: 3 },
    ];
    this.redrawClouds(w);
  }

  // Parallax scroll — each cloud drifts left at its own speed (nearer/bigger
  // clouds move a bit faster) and wraps back onto the right edge, instead of
  // sitting completely static.
  private redrawClouds(w: number) {
    const cloudGfx = this.cloudGfx;
    cloudGfx.clear();
    for (const c of this.clouds) {
      cloudGfx.fillStyle(0xffffff, 0.8);
      cloudGfx.fillCircle(c.x, c.y, 20 * c.s);
      cloudGfx.fillCircle(c.x + 18 * c.s, c.y - 6 * c.s, 16 * c.s);
      cloudGfx.fillCircle(c.x + 30 * c.s, c.y, 14 * c.s);
      cloudGfx.fillCircle(c.x - 14 * c.s, c.y + 4 * c.s, 12 * c.s);
    }
  }

  private updateClouds(dt: number, w: number) {
    for (const c of this.clouds) {
      c.x -= c.speed * dt;
      if (c.x < -40) c.x = w + 40;
    }
    this.redrawClouds(w);
  }

  private drawWings(dt: number) {
    this.wingTimer += dt;
    // Flap cycle
    if (this.wingTimer > 0.12) {
      this.wingTimer = 0;
      this.wingUp = !this.wingUp;
    }

    this.wingGfx.clear();
    const bx = this.bird.x;
    const by = this.bird.y;
    const angle = (this.bird.angle * Math.PI) / 180;
    const wingLen = BIRD_SIZE * 0.35;
    const wingW = BIRD_SIZE * 0.15;

    // Wing offset rotated with bird
    const wingOffY = this.wingUp ? -wingW * 1.2 : wingW * 0.5;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Left wing
    const lwx = bx + -wingLen * 0.6 * cos - wingOffY * sin;
    const lwy = by + -wingLen * 0.6 * sin + wingOffY * cos;
    this.wingGfx.fillStyle(0xffcc00, 0.85);
    this.wingGfx.fillEllipse(lwx, lwy, wingLen, wingW);

    // Right wing
    const rwx = bx + wingLen * 0.6 * cos - wingOffY * sin;
    const rwy = by + wingLen * 0.6 * sin + wingOffY * cos;
    this.wingGfx.fillStyle(0xffcc00, 0.85);
    this.wingGfx.fillEllipse(rwx, rwy, wingLen, wingW);
  }

  private drawPixelOutline() {
    this.pixelOutline.clear();
    const bx = this.bird.x;
    const by = this.bird.y;
    const r = BIRD_SIZE * 0.42;

    if (this.shieldActive) {
      this.pixelOutline.lineStyle(3, 0x38bdf8, 0.7 + Math.sin(Date.now() / 150) * 0.2);
      this.pixelOutline.strokeCircle(bx, by, r + 8);
    }

    // Pixelated outline effect — draw small rectangles around the bird
    this.pixelOutline.lineStyle(2, 0x000000, 0.5);
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = bx + Math.cos(a) * r;
      const py = by + Math.sin(a) * r;
      // Snap to pixel grid for retro feel
      const sx = Math.round(px / 2) * 2;
      const sy = Math.round(py / 2) * 2;
      this.pixelOutline.fillStyle(0x000000, 0.3);
      this.pixelOutline.fillRect(sx - 1, sy - 1, 2, 2);
    }
  }

  private getCurrentPipeSpeed(): number {
    // Progressive difficulty — pipes get faster over time played (accumulated
    // frame time, not wall-clock, so a backgrounded tab doesn't cause a jump)
    const elapsed = this.elapsedPlayMs / 1000;
    const speedMultiplier = 1 + Math.min(elapsed / 120, 0.5); // up to 1.5x at 2min
    return PIPE_SPEED * speedMultiplier;
  }

  private emitCurrentState() {
    emitState({
      score: this.score,
      highScore: this.highScore,
      gameOver: this.gameOver,
      started: this.started,
      elapsed: this.started
        ? Math.floor((Date.now() - this.startTime) / 1000)
        : 0,
      pipesPassed: this.pipesPassed,
      shieldActive: this.shieldActive,
    });
  }

  /* ── Session / Score submission ── */
  private async startSession() {
    try {
      const r = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ game: 'flappy-bird' }),
      });
      const j = await r.json();
      if (j.ok) {
        this.sessionCtx = {
          sessionId: j.sessionId,
          startedAt: j.startedAt,
          token: j.token,
        };
      }
    } catch {
      /* ignore */
    }
  }

  private async submitScore() {
    const durationSec = Math.floor((Date.now() - this.startTime) / 1000);
    try {
      await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          game: 'flappy-bird',
          score: this.score,
          meta: {
            pipesPassed: this.pipesPassed,
            durationSec,
            highScore: this.highScore,
          },
          sessionId: this.sessionCtx?.sessionId,
          startedAt: this.sessionCtx?.startedAt,
          token: this.sessionCtx?.token,
        }),
      });
    } catch {
      /* ignore */
    }
  }
}
