import Phaser from 'phaser';

/* ── Shared state for React UI ── */
export interface FBGameState {
  score: number;
  highScore: number;
  gameOver: boolean;
  started: boolean;
  elapsed: number;
  pipesPassed: number;
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

export class FlappyBirdScene extends Phaser.Scene {
  private bird!: Phaser.GameObjects.Image;
  private birdAngle = 0;
  private birdVelocity = 0;
  private pipes: {
    top: Phaser.GameObjects.Graphics;
    bottom: Phaser.GameObjects.Graphics;
    x: number;
    gapY: number;
    scored: boolean;
  }[] = [];
  private ground!: Phaser.GameObjects.TileSprite;
  private groundGfx!: Phaser.GameObjects.Graphics;

  private score = 0;
  private highScore = 0;
  private pipesPassed = 0;
  private gameOver = false;
  private started = false;
  private startTime = 0;

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

    /* Sky gradient */
    const skyGfx = this.add.graphics();
    skyGfx.fillGradientStyle(0x87ceeb, 0x87ceeb, 0x4ca1e0, 0x4ca1e0, 1);
    skyGfx.fillRect(0, 0, w, h);

    /* Clouds (parallax decorative) */
    this.drawClouds(w, h);

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

    this.emitCurrentState();
  }

  update(_time: number, delta: number) {
    if (!this.sceneReadyFired) {
      this.sceneReadyFired = true;
      window.dispatchEvent(new Event('fb-scene-ready'));
    }

    const dt = delta / 1000;
    const { width: w, height: h } = this.scale;
    const groundY = h - GROUND_HEIGHT;

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

      // Redraw pipe at new position
      pipe.top.clear();
      pipe.bottom.clear();
      this.drawPipe(pipe.top, pipe.x, 0, pipe.gapY - PIPE_GAP / 2);
      this.drawPipe(
        pipe.bottom,
        pipe.x,
        pipe.gapY + PIPE_GAP / 2,
        groundY - (pipe.gapY + PIPE_GAP / 2),
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
        // Score pop effect
        this.tweens.add({
          targets: this.scoreText,
          scaleX: 1.3,
          scaleY: 1.3,
          duration: 100,
          yoyo: true,
          ease: 'Back.easeOut',
        });
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
        if (birdY - birdR < pipe.gapY - PIPE_GAP / 2) {
          this.die();
          return;
        }
        // Bottom pipe
        if (birdY + birdR > pipe.gapY + PIPE_GAP / 2) {
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

    // Ground collision
    if (this.bird.y + BIRD_SIZE / 2 >= groundY) {
      this.bird.y = groundY - BIRD_SIZE / 2;
      this.die();
      return;
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
      this.tapText.setAlpha(0);
      this.scoreText.setAlpha(1);
      this.startSession();
    }
    this.birdVelocity = FLAP_VELOCITY;
    // Wing flap visual
    this.wingUp = true;
    this.wingTimer = 0;
  }

  private die() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.cameras.main.shake(300, 0.02);
    // Flash red
    this.cameras.main.flash(200, 255, 0, 0);
    this.submitScore();
    this.emitCurrentState();
  }

  private restartGame() {
    // Clean up pipes
    this.pipes.forEach((p) => {
      p.top.destroy();
      p.bottom.destroy();
    });
    this.pipes = [];

    this.score = 0;
    this.pipesPassed = 0;
    this.gameOver = false;
    this.started = false;
    this.birdVelocity = 0;
    this.birdAngle = 0;
    this.sessionCtx = null;

    const { height: h } = this.scale;
    this.bird.y = h * 0.4;
    this.bird.angle = 0;

    this.scoreText.setText('0').setAlpha(0);
    this.tapText.setAlpha(1);
    this.wingGfx.clear();
    this.pixelOutline.clear();

    this.emitCurrentState();
  }

  private spawnPipe(x: number) {
    const { height: h } = this.scale;
    const groundY = h - GROUND_HEIGHT;
    const minGapY = 80 + PIPE_GAP / 2;
    const maxGapY = groundY - 80 - PIPE_GAP / 2;
    const gapY = Phaser.Math.Between(minGapY, maxGapY);

    const top = this.add.graphics().setDepth(5);
    const bottom = this.add.graphics().setDepth(5);

    this.drawPipe(top, x, 0, gapY - PIPE_GAP / 2);
    this.drawPipe(
      bottom,
      x,
      gapY + PIPE_GAP / 2,
      groundY - (gapY + PIPE_GAP / 2),
    );

    this.pipes.push({ top, bottom, x, gapY, scored: false });
  }

  private drawPipe(
    gfx: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    height: number,
  ) {
    if (height <= 0) return;
    const left = x - PIPE_WIDTH / 2;

    // Main pipe body — pixelated green style
    gfx.fillStyle(0x2d8b2d, 1);
    gfx.fillRect(left, y, PIPE_WIDTH, height);

    // Pipe highlights
    gfx.fillStyle(0x4caf50, 1);
    gfx.fillRect(left + 4, y, 8, height);

    // Pipe shadow
    gfx.fillStyle(0x1b5e1b, 1);
    gfx.fillRect(left + PIPE_WIDTH - 8, y, 8, height);

    // Cap (wider)
    const capH = 20;
    const capW = PIPE_WIDTH + 12;
    const capX = x - capW / 2;
    const capY = y + height > y ? y + height - capH : y; // bottom of top pipe or top of bottom pipe
    if (y === 0) {
      // Top pipe — cap at bottom
      gfx.fillStyle(0x2d8b2d, 1);
      gfx.fillRect(capX, y + height - capH, capW, capH);
      gfx.fillStyle(0x4caf50, 1);
      gfx.fillRect(capX + 4, y + height - capH, 8, capH);
      gfx.lineStyle(2, 0x1b5e1b, 1);
      gfx.strokeRect(capX, y + height - capH, capW, capH);
    } else {
      // Bottom pipe — cap at top
      gfx.fillStyle(0x2d8b2d, 1);
      gfx.fillRect(capX, y, capW, capH);
      gfx.fillStyle(0x4caf50, 1);
      gfx.fillRect(capX + 4, y, 8, capH);
      gfx.lineStyle(2, 0x1b5e1b, 1);
      gfx.strokeRect(capX, y, capW, capH);
    }
  }

  private drawGround(_w: number, h: number) {
    const w = _w;
    const groundY = h - GROUND_HEIGHT;
    this.groundGfx.clear();

    // Dirt
    this.groundGfx.fillStyle(0x8b6914, 1);
    this.groundGfx.fillRect(0, groundY, w, GROUND_HEIGHT);

    // Grass top
    this.groundGfx.fillStyle(0x5cb85c, 1);
    this.groundGfx.fillRect(0, groundY, w, 16);

    // Grass highlight
    this.groundGfx.fillStyle(0x7dd87d, 1);
    this.groundGfx.fillRect(0, groundY, w, 6);

    // Pixel grass tufts
    for (let x = 0; x < w; x += 20) {
      const tuftH = Phaser.Math.Between(4, 12);
      this.groundGfx.fillStyle(0x5cb85c, 0.8);
      this.groundGfx.fillRect(x, groundY - tuftH, 4, tuftH);
    }

    // Ground line
    this.groundGfx.lineStyle(2, 0x3d7a3d, 1);
    this.groundGfx.lineBetween(0, groundY, w, groundY);
  }

  private drawClouds(w: number, h: number) {
    const cloudGfx = this.add.graphics().setDepth(1).setAlpha(0.6);
    const clouds = [
      { x: w * 0.15, y: h * 0.12, s: 1.0 },
      { x: w * 0.55, y: h * 0.08, s: 0.7 },
      { x: w * 0.8, y: h * 0.18, s: 0.9 },
      { x: w * 0.35, y: h * 0.25, s: 0.5 },
    ];
    for (const c of clouds) {
      cloudGfx.fillStyle(0xffffff, 0.8);
      cloudGfx.fillCircle(c.x, c.y, 20 * c.s);
      cloudGfx.fillCircle(c.x + 18 * c.s, c.y - 6 * c.s, 16 * c.s);
      cloudGfx.fillCircle(c.x + 30 * c.s, c.y, 14 * c.s);
      cloudGfx.fillCircle(c.x - 14 * c.s, c.y + 4 * c.s, 12 * c.s);
    }
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
    // Progressive difficulty — pipes get faster over time
    const elapsed = (Date.now() - this.startTime) / 1000;
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
