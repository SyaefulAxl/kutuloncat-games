import Phaser from 'phaser';

/* ── Shared state for React UI ── */
export interface SnakeGameState {
  score: number;
  highScore: number;
  gameOver: boolean;
  started: boolean;
  elapsed: number;
  level: SnakeDifficulty;
  length: number;
  foodEaten: number;
  combo: number;
  maxCombo: number;
  comboTimeLeft: number; // ms remaining in combo window
  comboTimerMax: number; // total combo window ms
  lastScoreGain: number; // last score gained from food (for HUD flash)
  deathReason: string; // 'wall' | 'self' | 'obstacle' | ''
}

export type SnakeDifficulty = 'gampang' | 'sedang' | 'susah' | 'gak-ngotak';

interface DifficultyConfig {
  speed: number; // ms per tick (lower = faster)
  scorePerFood: number;
  scoreMin: number; // random base score min
  scoreMax: number; // random base score max
  comboWindowMs: number; // ms to keep combo alive
  walls: boolean; // if false, snake wraps around
  obstacles: number; // extra wall blocks
  label: string;
  color: number; // accent color for trail/particles (NOT snake body)
  foodTimerMs: number; // special food disappear time
}

const SNAKE_COLOR = 0x22c55e; // always green snake
const OBSTACLE_COLOR = 0x3b82f6; // always blue obstacles

const DIFFICULTY: Record<SnakeDifficulty, DifficultyConfig> = {
  gampang: {
    speed: 160,
    scorePerFood: 5,
    scoreMin: 3,
    scoreMax: 8,
    comboWindowMs: 3500,
    walls: false,
    obstacles: 0,
    label: 'Gampang',
    color: 0x22c55e,
    foodTimerMs: 0,
  },
  sedang: {
    speed: 120,
    scorePerFood: 10,
    scoreMin: 7,
    scoreMax: 15,
    comboWindowMs: 3000,
    walls: true,
    obstacles: 4,
    label: 'Sedang',
    color: 0xeab308,
    foodTimerMs: 8000,
  },
  susah: {
    speed: 85,
    scorePerFood: 20,
    scoreMin: 15,
    scoreMax: 30,
    comboWindowMs: 2500,
    walls: true,
    obstacles: 10,
    label: 'Susah',
    color: 0xef4444,
    foodTimerMs: 6000,
  },
  'gak-ngotak': {
    speed: 55,
    scorePerFood: 50,
    scoreMin: 30,
    scoreMax: 70,
    comboWindowMs: 2000,
    walls: true,
    obstacles: 20,
    label: 'Gak Ngotak',
    color: 0xa855f7,
    foodTimerMs: 4000,
  },
};

function emitState(s: SnakeGameState) {
  (window as any).__snakeState = s;
  window.dispatchEvent(new Event('snake-update'));
}

/* ── Grid constants ── */
const CELL = 20;
const GRID_W = 20;
const GRID_H = 20;

type Dir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
interface Pt {
  x: number;
  y: number;
}

export class SnakeScene extends Phaser.Scene {
  /* Grid */
  private cellSize = CELL;
  private gridW = GRID_W;
  private gridH = GRID_H;
  private offsetX = 0;
  private offsetY = 0;

  /* Snake */
  private snake: Pt[] = [];
  private direction: Dir = 'RIGHT';
  private nextDirection: Dir = 'RIGHT';
  private inputQueue: Dir[] = [];

  /* Food */
  private food: Pt = { x: 10, y: 10 };
  private specialFood: Pt | null = null;
  private specialFoodTimer: Phaser.Time.TimerEvent | null = null;
  private foodPulse = 0;

  /* Obstacles */
  private obstacles: Pt[] = [];

  /* State */
  private score = 0;
  private highScore = 0;
  private gameOver = false;
  private started = false;
  private elapsed = 0;
  private foodEaten = 0;
  private combo = 0;
  private maxCombo = 0;
  private lastFoodTime = 0;
  private moveTimer = 0;
  private startTime = 0;
  private comboTimeLeft = 0; // ms remaining in combo window
  private lastScoreGain = 0; // last score from single food
  private deathReason = ''; // 'wall' | 'self' | 'obstacle'

  /* Tongue animation */
  private tongueTimer = 0; // cycles for tongue flicker

  /* Config */
  private difficulty: SnakeDifficulty = 'sedang';
  private cfg!: DifficultyConfig;

  /* Graphics */
  private gfx!: Phaser.GameObjects.Graphics;
  private bgGfx!: Phaser.GameObjects.Graphics;
  private particleGfx!: Phaser.GameObjects.Graphics;

  /* Particles */
  private particles: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: number;
    size: number;
  }[] = [];

  /* Trail effect */
  private trail: { x: number; y: number; alpha: number }[] = [];

  /* Session */
  private sessionCtx: {
    sessionId?: string;
    startedAt?: number;
    token?: string;
  } | null = null;

  private sceneReadyFired = false;
  private restartHandler: (() => void) | null = null;
  private difficultyHandler: ((e: Event) => void) | null = null;
  private directionHandler: ((e: Event) => void) | null = null;
  private themeHandler: ((e: Event) => void) | null = null;

  /* Theme */
  private isDark = true;

  /* Screen shake */
  private shakeAmount = 0;

  constructor() {
    super({ key: 'SnakeScene' });
  }

  /* Fetch server config in preload (runs before create) */
  preload() {
    fetch('/api/game/snake/config', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.snake) {
          (window as any).__snakeServerConfig = j.snake;
        }
      })
      .catch(() => {
        /* ignore — use defaults */
      });
  }

  /** Apply admin-configured overrides to DIFFICULTY constants */
  private applyServerConfig() {
    const cfg = (window as any).__snakeServerConfig;
    if (!cfg || typeof cfg !== 'object') return;

    // cfg shape: { difficulties: { gampang: { speed, walls, obstacles, ... }, ... } }
    const diffs = cfg.difficulties;
    if (!diffs || typeof diffs !== 'object') return;

    for (const key of Object.keys(DIFFICULTY) as SnakeDifficulty[]) {
      const override = diffs[key];
      if (!override || typeof override !== 'object') continue;
      const d = DIFFICULTY[key];
      if (typeof override.speed === 'number') d.speed = override.speed;
      if (typeof override.walls === 'boolean') d.walls = override.walls;
      if (typeof override.obstacles === 'number')
        d.obstacles = override.obstacles;
      if (typeof override.scoreMin === 'number') d.scoreMin = override.scoreMin;
      if (typeof override.scoreMax === 'number') d.scoreMax = override.scoreMax;
      if (typeof override.comboWindowMs === 'number')
        d.comboWindowMs = override.comboWindowMs;
      if (typeof override.foodTimerMs === 'number')
        d.foodTimerMs = override.foodTimerMs;
    }
  }

  create() {
    const { width: w, height: h } = this.scale;

    /* Apply server config overrides if available */
    this.applyServerConfig();

    /* Compute cell size and offset to center grid */
    const maxCellW = Math.floor(w / GRID_W);
    const maxCellH = Math.floor(h / GRID_H);
    this.cellSize = Math.min(maxCellW, maxCellH);
    this.offsetX = Math.floor((w - this.cellSize * GRID_W) / 2);
    this.offsetY = Math.floor((h - this.cellSize * GRID_H) / 2);

    /* Load high score */
    const hs = localStorage.getItem(`snake-highscore-${this.difficulty}`);
    if (hs) this.highScore = Number(hs) || 0;

    /* Load difficulty from window */
    const diff = (window as any).__snakeDifficulty as
      | SnakeDifficulty
      | undefined;
    if (diff && DIFFICULTY[diff]) {
      this.difficulty = diff;
    }
    this.cfg = DIFFICULTY[this.difficulty];

    /* Graphics layers */
    this.bgGfx = this.add.graphics();
    this.particleGfx = this.add.graphics().setDepth(5);
    this.gfx = this.add.graphics().setDepth(10);

    /* Draw background */
    this.drawBackground(w, h);

    /* Init snake */
    this.resetGame();

    /* Input — keyboard */
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      this.handleKeyInput(e.code);
    });

    /* Input — touch swipe */
    let touchStartX = 0;
    let touchStartY = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      touchStartX = p.x;
      touchStartY = p.y;
      if (!this.started && !this.gameOver) {
        this.startGame();
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const dx = p.x - touchStartX;
      const dy = p.y - touchStartY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx < 30 && absDy < 30) return; // tap, not swipe
      if (absDx > absDy) {
        this.queueDirection(dx > 0 ? 'RIGHT' : 'LEFT');
      } else {
        this.queueDirection(dy > 0 ? 'DOWN' : 'UP');
      }
    });

    /* Restart listener */
    this.restartHandler = () => {
      this.resetGame();
    };
    window.addEventListener('snake-restart', this.restartHandler);

    /* Difficulty change listener */
    this.difficultyHandler = (e: Event) => {
      const d = (e as CustomEvent).detail as SnakeDifficulty;
      if (DIFFICULTY[d]) {
        this.difficulty = d;
        (window as any).__snakeDifficulty = d;
        this.cfg = DIFFICULTY[d];
        const hs2 = localStorage.getItem(`snake-highscore-${d}`);
        this.highScore = hs2 ? Number(hs2) || 0 : 0;
        this.resetGame();
      }
    };
    window.addEventListener('snake-set-difficulty', this.difficultyHandler);

    /* Direction event listener (for on-screen D-pad) */
    this.directionHandler = (e: Event) => {
      const dir = (e as CustomEvent).detail as Dir;
      if (!this.started && !this.gameOver) {
        this.startGame();
      }
      this.queueDirection(dir);
    };
    window.addEventListener('snake-direction', this.directionHandler);

    /* Theme listener */
    this.isDark =
      document.body.classList.contains('dark') ||
      localStorage.getItem('theme') !== 'light';
    this.themeHandler = () => {
      this.isDark =
        document.body.classList.contains('dark') ||
        localStorage.getItem('theme') !== 'light';
      this.drawBackground(this.scale.width, this.scale.height);
    };
    window.addEventListener('snake-theme-change', this.themeHandler);

    /* Fire ready */
    if (!this.sceneReadyFired) {
      this.sceneReadyFired = true;
      window.dispatchEvent(new Event('snake-scene-ready'));
    }

    this.emitCurrentState();
  }

  private handleKeyInput(code: string) {
    if (this.gameOver) return;
    if (!this.started) {
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'Space',
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
        ].includes(code)
      ) {
        this.startGame();
      }
      return;
    }
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        this.queueDirection('UP');
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.queueDirection('DOWN');
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.queueDirection('LEFT');
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.queueDirection('RIGHT');
        break;
    }
  }

  private queueDirection(dir: Dir) {
    if (!this.started || this.gameOver) return;
    const opposite: Record<Dir, Dir> = {
      UP: 'DOWN',
      DOWN: 'UP',
      LEFT: 'RIGHT',
      RIGHT: 'LEFT',
    };
    // Check against the last queued direction (or current)
    const lastDir =
      this.inputQueue.length > 0
        ? this.inputQueue[this.inputQueue.length - 1]
        : this.direction;
    if (dir === opposite[lastDir]) return;
    if (this.inputQueue.length < 3) {
      this.inputQueue.push(dir);
    }
  }

  private startGame() {
    if (this.started) return;
    this.started = true;
    this.startTime = Date.now();
    this.startSession();
    this.emitCurrentState();
  }

  private resetGame() {
    this.snake = [];
    const startX = Math.floor(GRID_W / 2);
    const startY = Math.floor(GRID_H / 2);
    for (let i = 0; i < 3; i++) {
      this.snake.push({ x: startX - i, y: startY });
    }
    this.direction = 'RIGHT';
    this.nextDirection = 'RIGHT';
    this.inputQueue = [];
    this.score = 0;
    this.gameOver = false;
    this.started = false;
    this.elapsed = 0;
    this.foodEaten = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastFoodTime = 0;
    this.moveTimer = 0;
    this.deathReason = '';
    this.particles = [];
    this.trail = [];
    this.specialFood = null;
    this.shakeAmount = 0;
    this.comboTimeLeft = 0;
    this.lastScoreGain = 0;
    this.tongueTimer = 0;

    if (this.specialFoodTimer) {
      this.specialFoodTimer.remove();
      this.specialFoodTimer = null;
    }

    /* Generate obstacles */
    this.obstacles = [];
    if (this.cfg.obstacles > 0) {
      this.generateObstacles();
    }

    /* Place first food */
    this.placeFood();

    this.sessionCtx = null;
    this.emitCurrentState();
  }

  private generateObstacles() {
    const taken = new Set<string>();
    // Mark snake cells
    for (const s of this.snake) taken.add(`${s.x},${s.y}`);
    // Mark area around snake head
    const head = this.snake[0];
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        taken.add(`${head.x + dx},${head.y + dy}`);
      }
    }

    let attempts = 0;
    while (this.obstacles.length < this.cfg.obstacles && attempts < 500) {
      attempts++;
      const x = Phaser.Math.Between(1, GRID_W - 2);
      const y = Phaser.Math.Between(1, GRID_H - 2);
      const key = `${x},${y}`;
      if (!taken.has(key)) {
        this.obstacles.push({ x, y });
        taken.add(key);
      }
    }
  }

  private placeFood() {
    const taken = new Set<string>();
    for (const s of this.snake) taken.add(`${s.x},${s.y}`);
    for (const o of this.obstacles) taken.add(`${o.x},${o.y}`);
    if (this.specialFood)
      taken.add(`${this.specialFood.x},${this.specialFood.y}`);

    let attempts = 0;
    while (attempts < 500) {
      attempts++;
      const x = Phaser.Math.Between(0, GRID_W - 1);
      const y = Phaser.Math.Between(0, GRID_H - 1);
      if (!taken.has(`${x},${y}`)) {
        this.food = { x, y };
        return;
      }
    }
  }

  private placeSpecialFood() {
    if (this.specialFood || this.cfg.foodTimerMs <= 0) return;
    const taken = new Set<string>();
    for (const s of this.snake) taken.add(`${s.x},${s.y}`);
    for (const o of this.obstacles) taken.add(`${o.x},${o.y}`);
    taken.add(`${this.food.x},${this.food.y}`);

    let attempts = 0;
    while (attempts < 500) {
      attempts++;
      const x = Phaser.Math.Between(0, GRID_W - 1);
      const y = Phaser.Math.Between(0, GRID_H - 1);
      if (!taken.has(`${x},${y}`)) {
        this.specialFood = { x, y };
        this.specialFoodTimer = this.time.delayedCall(
          this.cfg.foodTimerMs,
          () => {
            this.specialFood = null;
            this.specialFoodTimer = null;
          },
        );
        return;
      }
    }
  }

  update(_time: number, delta: number) {
    if (this.gameOver) {
      this.updateParticles(delta);
      this.drawAll();
      return;
    }
    if (!this.started) {
      this.foodPulse += delta * 0.004;
      this.drawAll();
      return;
    }

    /* Timer */
    this.elapsed = Math.floor((Date.now() - this.startTime) / 1000);

    /* Combo timer countdown — reset combo if window expires */
    if (this.combo > 0 && this.lastFoodTime > 0) {
      this.comboTimeLeft = Math.max(
        0,
        this.cfg.comboWindowMs - (Date.now() - this.lastFoodTime),
      );
      if (this.comboTimeLeft <= 0) {
        this.combo = 0;
        this.comboTimeLeft = 0;
      }
    }

    /* Move timer */
    this.moveTimer += delta;
    if (this.moveTimer >= this.cfg.speed) {
      this.moveTimer -= this.cfg.speed;
      this.moveSnake();
    }

    /* Shake decay */
    if (this.shakeAmount > 0) {
      this.shakeAmount *= 0.9;
      if (this.shakeAmount < 0.5) this.shakeAmount = 0;
    }

    /* Food pulse */
    this.foodPulse += delta * 0.005;

    /* Tongue animation */
    this.tongueTimer += delta * 0.006;

    /* Update particles */
    this.updateParticles(delta);

    /* Trail decay */
    this.trail = this.trail.filter((t) => {
      t.alpha -= delta * 0.003;
      return t.alpha > 0;
    });

    this.drawAll();
    this.emitCurrentState();
  }

  private moveSnake() {
    /* Process input queue */
    if (this.inputQueue.length > 0) {
      this.nextDirection = this.inputQueue.shift()!;
    }
    this.direction = this.nextDirection;

    const head = { ...this.snake[0] };

    /* Add trail */
    this.trail.push({
      x: head.x,
      y: head.y,
      alpha: 0.6,
    });

    switch (this.direction) {
      case 'UP':
        head.y--;
        break;
      case 'DOWN':
        head.y++;
        break;
      case 'LEFT':
        head.x--;
        break;
      case 'RIGHT':
        head.x++;
        break;
    }

    /* Wall collision / wrapping */
    if (this.cfg.walls) {
      if (head.x < 0 || head.x >= GRID_W || head.y < 0 || head.y >= GRID_H) {
        this.deathReason = 'wall';
        this.die();
        return;
      }
    } else {
      // Wrap around
      if (head.x < 0) head.x = GRID_W - 1;
      if (head.x >= GRID_W) head.x = 0;
      if (head.y < 0) head.y = GRID_H - 1;
      if (head.y >= GRID_H) head.y = 0;
    }

    /* Self collision */
    for (const s of this.snake) {
      if (s.x === head.x && s.y === head.y) {
        this.deathReason = 'self';
        this.die();
        return;
      }
    }

    /* Obstacle collision */
    for (const o of this.obstacles) {
      if (o.x === head.x && o.y === head.y) {
        this.deathReason = 'obstacle';
        this.die();
        return;
      }
    }

    this.snake.unshift(head);

    /* Food check */
    let ate = false;
    if (head.x === this.food.x && head.y === this.food.y) {
      ate = true;
      const timeSinceLastFood = Date.now() - this.lastFoodTime;
      this.lastFoodTime = Date.now();

      // Combo: if eaten within combo window of last food
      if (timeSinceLastFood < this.cfg.comboWindowMs && this.foodEaten > 0) {
        this.combo++;
      } else {
        this.combo = 1;
      }
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.comboTimeLeft = this.cfg.comboWindowMs;

      // Random base score + combo multiplier (no cap)
      const baseScore = Phaser.Math.Between(
        this.cfg.scoreMin,
        this.cfg.scoreMax,
      );
      const comboMultiplier = Math.min(this.combo, 10);
      const gained = baseScore * comboMultiplier;
      this.score += gained;
      this.lastScoreGain = gained;
      this.foodEaten++;

      // Particles
      this.spawnFoodParticles(head.x, head.y, SNAKE_COLOR);

      this.placeFood();

      // Maybe spawn special food every 5 foods
      if (this.foodEaten % 5 === 0) {
        this.placeSpecialFood();
      }
    } else if (
      this.specialFood &&
      head.x === this.specialFood.x &&
      head.y === this.specialFood.y
    ) {
      ate = true;
      const baseScore = Phaser.Math.Between(
        this.cfg.scoreMin,
        this.cfg.scoreMax,
      );
      this.score += baseScore * 3; // Triple score for special
      this.lastScoreGain = baseScore * 3;
      this.foodEaten++;
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.comboTimeLeft = this.cfg.comboWindowMs;
      this.lastFoodTime = Date.now();

      this.spawnFoodParticles(head.x, head.y, 0xffd700); // Gold particles
      this.specialFood = null;
      if (this.specialFoodTimer) {
        this.specialFoodTimer.remove();
        this.specialFoodTimer = null;
      }
    }

    if (!ate) {
      this.snake.pop();
    }
  }

  private die() {
    this.gameOver = true;
    this.shakeAmount = 8;

    // Explode particles from snake body
    for (const s of this.snake) {
      this.spawnFoodParticles(s.x, s.y, 0xff4444, 3);
    }

    // Update high score
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem(
        `snake-highscore-${this.difficulty}`,
        String(this.highScore),
      );
    }

    this.submitScore();
    this.emitCurrentState();
  }

  /* ── Particle system ── */
  private spawnFoodParticles(gx: number, gy: number, color: number, count = 8) {
    const cx = this.offsetX + gx * this.cellSize + this.cellSize / 2;
    const cy = this.offsetY + gy * this.cellSize + this.cellSize / 2;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 600 + Math.random() * 400,
        maxLife: 600 + Math.random() * 400,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  private updateParticles(delta: number) {
    const dt = delta / 1000;
    this.particles = this.particles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 80 * dt; // gravity
      p.life -= delta;
      return p.life > 0;
    });
  }

  /* ── Drawing ── */
  private drawBackground(w: number, h: number) {
    this.bgGfx.clear();
    // Theme-aware colors
    const bgColor = this.isDark ? 0x0f172a : 0xf1f5f9;
    const gridColor = this.isDark ? 0x1e293b : 0xe2e8f0;
    const gridAltColor = this.isDark ? 0x1a2332 : 0xcbd5e1;

    // Background
    this.bgGfx.fillStyle(bgColor, 1);
    this.bgGfx.fillRect(0, 0, w, h);

    // Grid area background
    const gw = this.cellSize * GRID_W;
    const gh = this.cellSize * GRID_H;
    this.bgGfx.fillStyle(gridColor, 1);
    this.bgGfx.fillRect(this.offsetX, this.offsetY, gw, gh);

    // Checkerboard pattern
    for (let x = 0; x < GRID_W; x++) {
      for (let y = 0; y < GRID_H; y++) {
        if ((x + y) % 2 === 0) {
          this.bgGfx.fillStyle(gridAltColor, 1);
        } else {
          this.bgGfx.fillStyle(gridColor, 1);
        }
        this.bgGfx.fillRect(
          this.offsetX + x * this.cellSize,
          this.offsetY + y * this.cellSize,
          this.cellSize,
          this.cellSize,
        );
      }
    }

    // Border
    if (this.cfg.walls) {
      this.bgGfx.lineStyle(2, SNAKE_COLOR, 0.5);
      this.bgGfx.strokeRect(this.offsetX - 1, this.offsetY - 1, gw + 2, gh + 2);
    }
  }

  private drawAll() {
    this.gfx.clear();
    this.particleGfx.clear();

    const cs = this.cellSize;
    const ox =
      this.offsetX +
      (this.shakeAmount > 0 ? (Math.random() - 0.5) * this.shakeAmount : 0);
    const oy =
      this.offsetY +
      (this.shakeAmount > 0 ? (Math.random() - 0.5) * this.shakeAmount : 0);

    /* Obstacles — BLUE */
    for (const o of this.obstacles) {
      this.gfx.fillStyle(OBSTACLE_COLOR, 1);
      this.gfx.fillRect(ox + o.x * cs + 1, oy + o.y * cs + 1, cs - 2, cs - 2);
      this.gfx.fillStyle(0x2563eb, 1);
      this.gfx.fillRect(ox + o.x * cs + 2, oy + o.y * cs + 2, cs - 4, cs - 4);
      // Highlight shine on obstacle
      this.gfx.fillStyle(0x60a5fa, 0.3);
      this.gfx.fillRect(ox + o.x * cs + 2, oy + o.y * cs + 2, cs - 4, 2);
    }

    /* Trail effect */
    for (const t of this.trail) {
      this.gfx.fillStyle(SNAKE_COLOR, t.alpha * 0.3);
      const r = cs * 0.3 * t.alpha;
      this.gfx.fillCircle(ox + t.x * cs + cs / 2, oy + t.y * cs + cs / 2, r);
    }

    /* Snake body — ALWAYS GREEN */
    for (let i = this.snake.length - 1; i >= 0; i--) {
      const s = this.snake[i];
      const t = i / this.snake.length;
      const alpha = 0.5 + 0.5 * (1 - t);
      const size = cs - 2 - Math.floor(t * 4);
      const offset = Math.floor((cs - size) / 2);

      if (i === 0) {
        // Head — bright green with glow
        this.gfx.fillStyle(SNAKE_COLOR, 0.3);
        this.gfx.fillCircle(
          ox + s.x * cs + cs / 2,
          oy + s.y * cs + cs / 2,
          cs * 0.7,
        );
        this.gfx.fillStyle(SNAKE_COLOR, 1);
        this.gfx.fillRoundedRect(
          ox + s.x * cs + 1,
          oy + s.y * cs + 1,
          cs - 2,
          cs - 2,
          4,
        );

        // Eyes — larger with directional pupils
        const eyeWhiteSize = cs * 0.2;
        const pupilSize = eyeWhiteSize * 0.5;
        let ex1 = 0,
          ey1 = 0,
          ex2 = 0,
          ey2 = 0;
        let pupilDx = 0,
          pupilDy = 0; // pupil offset toward food
        const fx = this.food.x,
          fy = this.food.y;
        const hx = s.x,
          hy = s.y;
        const foodAngle = Math.atan2(fy - hy, fx - hx);
        pupilDx = Math.cos(foodAngle) * eyeWhiteSize * 0.25;
        pupilDy = Math.sin(foodAngle) * eyeWhiteSize * 0.25;

        switch (this.direction) {
          case 'RIGHT':
            ex1 = cs * 0.65;
            ey1 = cs * 0.22;
            ex2 = cs * 0.65;
            ey2 = cs * 0.68;
            break;
          case 'LEFT':
            ex1 = cs * 0.35;
            ey1 = cs * 0.22;
            ex2 = cs * 0.35;
            ey2 = cs * 0.68;
            break;
          case 'UP':
            ex1 = cs * 0.22;
            ey1 = cs * 0.35;
            ex2 = cs * 0.68;
            ey2 = cs * 0.35;
            break;
          case 'DOWN':
            ex1 = cs * 0.22;
            ey1 = cs * 0.65;
            ex2 = cs * 0.68;
            ey2 = cs * 0.65;
            break;
        }
        // White of eyes
        this.gfx.fillStyle(0xffffff, 1);
        this.gfx.fillCircle(
          ox + s.x * cs + ex1,
          oy + s.y * cs + ey1,
          eyeWhiteSize,
        );
        this.gfx.fillCircle(
          ox + s.x * cs + ex2,
          oy + s.y * cs + ey2,
          eyeWhiteSize,
        );
        // Pupils — look toward food
        this.gfx.fillStyle(0x1a1a2e, 1);
        this.gfx.fillCircle(
          ox + s.x * cs + ex1 + pupilDx,
          oy + s.y * cs + ey1 + pupilDy,
          pupilSize,
        );
        this.gfx.fillCircle(
          ox + s.x * cs + ex2 + pupilDx,
          oy + s.y * cs + ey2 + pupilDy,
          pupilSize,
        );
        // Eye shine/highlight
        this.gfx.fillStyle(0xffffff, 0.7);
        this.gfx.fillCircle(
          ox + s.x * cs + ex1 - pupilSize * 0.4,
          oy + s.y * cs + ey1 - pupilSize * 0.4,
          pupilSize * 0.35,
        );
        this.gfx.fillCircle(
          ox + s.x * cs + ex2 - pupilSize * 0.4,
          oy + s.y * cs + ey2 - pupilSize * 0.4,
          pupilSize * 0.35,
        );

        // Animated tongue — flickering forked tongue
        const tonguePhase = Math.sin(this.tongueTimer * 3);
        const showTongue = tonguePhase > -0.3; // visible ~70% of the time, flickers
        if (showTongue && this.started && !this.gameOver) {
          const tongueLen = cs * (0.35 + Math.abs(tonguePhase) * 0.2);
          const forkLen = cs * 0.12;
          const forkSpread = cs * 0.08;
          let tx = 0,
            ty = 0,
            fdx1 = 0,
            fdy1 = 0,
            fdx2 = 0,
            fdy2 = 0;
          const headCx = ox + s.x * cs + cs / 2;
          const headCy = oy + s.y * cs + cs / 2;
          switch (this.direction) {
            case 'RIGHT':
              tx = tongueLen;
              ty = 0;
              fdx1 = forkLen;
              fdy1 = -forkSpread;
              fdx2 = forkLen;
              fdy2 = forkSpread;
              break;
            case 'LEFT':
              tx = -tongueLen;
              ty = 0;
              fdx1 = -forkLen;
              fdy1 = -forkSpread;
              fdx2 = -forkLen;
              fdy2 = forkSpread;
              break;
            case 'UP':
              tx = 0;
              ty = -tongueLen;
              fdx1 = -forkSpread;
              fdy1 = -forkLen;
              fdx2 = forkSpread;
              fdy2 = -forkLen;
              break;
            case 'DOWN':
              tx = 0;
              ty = tongueLen;
              fdx1 = -forkSpread;
              fdy1 = forkLen;
              fdx2 = forkSpread;
              fdy2 = forkLen;
              break;
          }
          this.gfx.lineStyle(1.5, 0xef4444, 0.9);
          // Main tongue
          this.gfx.beginPath();
          this.gfx.moveTo(headCx, headCy);
          this.gfx.lineTo(headCx + tx, headCy + ty);
          this.gfx.strokePath();
          // Fork 1
          this.gfx.beginPath();
          this.gfx.moveTo(headCx + tx, headCy + ty);
          this.gfx.lineTo(headCx + tx + fdx1, headCy + ty + fdy1);
          this.gfx.strokePath();
          // Fork 2
          this.gfx.beginPath();
          this.gfx.moveTo(headCx + tx, headCy + ty);
          this.gfx.lineTo(headCx + tx + fdx2, headCy + ty + fdy2);
          this.gfx.strokePath();
        }
      } else {
        // Body segments — always green with gradient
        const bodyColor = Phaser.Display.Color.IntegerToColor(SNAKE_COLOR);
        const r = Math.floor(bodyColor.red * alpha);
        const g = Math.floor(bodyColor.green * alpha);
        const b = Math.floor(bodyColor.blue * alpha);
        const c = Phaser.Display.Color.GetColor(r, g, b);
        this.gfx.fillStyle(c, 1);
        this.gfx.fillRoundedRect(
          ox + s.x * cs + offset,
          oy + s.y * cs + offset,
          size,
          size,
          3,
        );
      }
    }

    /* Food */
    const foodPulseScale = 1 + Math.sin(this.foodPulse) * 0.15;
    const foodSize = cs * 0.4 * foodPulseScale;

    // Glow
    this.gfx.fillStyle(0xff6b6b, 0.2);
    this.gfx.fillCircle(
      ox + this.food.x * cs + cs / 2,
      oy + this.food.y * cs + cs / 2,
      foodSize * 1.5,
    );
    // Core
    this.gfx.fillStyle(0xff4757, 1);
    this.gfx.fillCircle(
      ox + this.food.x * cs + cs / 2,
      oy + this.food.y * cs + cs / 2,
      foodSize,
    );
    // Shine
    this.gfx.fillStyle(0xffffff, 0.5);
    this.gfx.fillCircle(
      ox + this.food.x * cs + cs / 2 - foodSize * 0.25,
      oy + this.food.y * cs + cs / 2 - foodSize * 0.25,
      foodSize * 0.3,
    );

    /* Special food (golden star) */
    if (this.specialFood) {
      const sp = this.specialFood;
      const spPulse = 1 + Math.sin(this.foodPulse * 1.5) * 0.2;
      const spSize = cs * 0.45 * spPulse;

      // Glow
      this.gfx.fillStyle(0xffd700, 0.25);
      this.gfx.fillCircle(
        ox + sp.x * cs + cs / 2,
        oy + sp.y * cs + cs / 2,
        spSize * 1.8,
      );
      // Star shape (simplified as diamond)
      this.gfx.fillStyle(0xffd700, 1);
      this.drawDiamond(
        ox + sp.x * cs + cs / 2,
        oy + sp.y * cs + cs / 2,
        spSize,
      );
      // Sparkle
      this.gfx.fillStyle(0xffffff, 0.7);
      this.gfx.fillCircle(
        ox + sp.x * cs + cs / 2 - spSize * 0.2,
        oy + sp.y * cs + cs / 2 - spSize * 0.2,
        spSize * 0.2,
      );
    }

    /* Particles */
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      this.particleGfx.fillStyle(p.color, alpha);
      this.particleGfx.fillCircle(p.x, p.y, p.size * alpha);
    }

    /* Game-over text on canvas */
    if (this.gameOver) {
      const { width: w, height: h } = this.scale;
      this.gfx.fillStyle(0x000000, 0.6);
      this.gfx.fillRect(0, 0, w, h);
    }

    /* Not started — draw "Tap / Press to start" */
    if (!this.started && !this.gameOver) {
      const { width: w, height: h } = this.scale;
      // Overlay
      this.gfx.fillStyle(0x000000, 0.3);
      this.gfx.fillRect(0, 0, w, h);
    }
  }

  private drawDiamond(cx: number, cy: number, size: number) {
    this.gfx.beginPath();
    this.gfx.moveTo(cx, cy - size);
    this.gfx.lineTo(cx + size, cy);
    this.gfx.lineTo(cx, cy + size);
    this.gfx.lineTo(cx - size, cy);
    this.gfx.closePath();
    this.gfx.fillPath();
  }

  /* ── Session / Score submission ── */
  private async startSession() {
    try {
      const r = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ game: 'snake' }),
      });
      if (r.ok) {
        const j = await r.json();
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
    try {
      const payload: any = {
        game: 'snake',
        score: this.score,
        meta: {
          difficulty: this.difficulty,
          length: this.snake.length,
          foodEaten: this.foodEaten,
          maxCombo: this.maxCombo,
          durationSec: this.elapsed,
          deathReason: this.deathReason,
          win: this.score >= this.cfg.scorePerFood * 10, // Win = eat ≥10 foods worth
        },
      };
      if (this.sessionCtx) {
        payload.sessionId = this.sessionCtx.sessionId;
        payload.startedAt = this.sessionCtx.startedAt;
        payload.token = this.sessionCtx.token;
      }
      await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
    } catch {
      /* ignore */
    }
  }

  private emitCurrentState() {
    emitState({
      score: this.score,
      highScore: this.highScore,
      gameOver: this.gameOver,
      started: this.started,
      elapsed: this.elapsed,
      level: this.difficulty,
      length: this.snake.length,
      foodEaten: this.foodEaten,
      combo: this.combo,
      maxCombo: this.maxCombo,
      comboTimeLeft: this.comboTimeLeft,
      comboTimerMax: this.cfg.comboWindowMs,
      lastScoreGain: this.lastScoreGain,
      deathReason: this.deathReason,
    });
  }

  shutdown() {
    if (this.restartHandler) {
      window.removeEventListener('snake-restart', this.restartHandler);
    }
    if (this.difficultyHandler) {
      window.removeEventListener(
        'snake-set-difficulty',
        this.difficultyHandler,
      );
    }
    if (this.directionHandler) {
      window.removeEventListener('snake-direction', this.directionHandler);
    }
    if (this.themeHandler) {
      window.removeEventListener('snake-theme-change', this.themeHandler);
    }
  }
}
