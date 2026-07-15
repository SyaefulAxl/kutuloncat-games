import Phaser from 'phaser';
import { sfx } from '../arcade/kit';

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
  magnetActive: boolean;
  magnetTimeLeft: number;
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
    scorePerFood: 3,
    scoreMin: 2,
    scoreMax: 5,
    comboWindowMs: 3500,
    walls: false,
    obstacles: 0,
    label: 'Gampang',
    color: 0x22c55e,
    foodTimerMs: 0,
  },
  sedang: {
    speed: 120,
    scorePerFood: 7,
    scoreMin: 5,
    scoreMax: 10,
    comboWindowMs: 3000,
    walls: true,
    obstacles: 4,
    label: 'Sedang',
    color: 0xeab308,
    foodTimerMs: 8000,
  },
  susah: {
    speed: 85,
    scorePerFood: 25,
    scoreMin: 18,
    scoreMax: 40,
    comboWindowMs: 2500,
    walls: true,
    obstacles: 10,
    label: 'Susah',
    color: 0xef4444,
    foodTimerMs: 6000,
  },
  'gak-ngotak': {
    speed: 55,
    scorePerFood: 65,
    scoreMin: 45,
    scoreMax: 90,
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

/* ── Moving obstacles — a fraction of the obstacle set patrols back and
   forth along one axis instead of sitting static forever, so a memorized
   board stops being safe to autopilot through at high difficulty. ── */
interface Obstacle extends Pt {
  moving?: boolean;
  axis?: 'h' | 'v';
  min?: number;
  max?: number;
  dir?: 1 | -1;
  moveTimer?: number;
}
const MOVING_OBSTACLE_FRACTION = 0.4;
const OBSTACLE_MOVE_MS = 850;

/* ── Obstacle regeneration — every REGEN_EVERY_FOOD foods, the whole
   obstacle layout is redrawn (with a warning beat first) so a long run
   doesn't stay on the exact same static board the whole time. ── */
const REGEN_EVERY_FOOD = 15;

/* ── Extra food variety, each on its own spawn schedule (distinct from the
   golden special-food-every-5 and magnet-every-9 schedules) ── */
const SPEEDBERRY_EVERY_FOOD = 7;
const SHRINKER_EVERY_FOOD = 13;
const SPEEDBERRY_DURATION_MS = 4000;

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

  /* Magnet power-up — a rare item that, once eaten, pulls food one cell
     closer to the head on every subsequent move for a few seconds. Snake
     previously had zero power-up variety beyond the golden special food. */
  private magnetItem: Pt | null = null;
  private magnetItemTimer: Phaser.Time.TimerEvent | null = null;
  private magnetActiveUntil = 0;

  /* Obstacles */
  private obstacles: Obstacle[] = [];

  /* Extra food variety */
  private speedberry: Pt | null = null;
  private speedberryTimer: Phaser.Time.TimerEvent | null = null;
  private shrinker: Pt | null = null;
  private shrinkerTimer: Phaser.Time.TimerEvent | null = null;
  private speedBoostUntil = 0;
  private regenFlashUntil = 0;

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
  // ms shaved off cfg.speed as the run goes on — kept separate from cfg.speed
  // itself since cfg is a shared reference into the DIFFICULTY table, not a
  // per-run copy; mutating it directly would corrupt the preset permanently.
  private speedBonus = 0;
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

    // Phaser never calls a plain instance shutdown() method — cleanup must
    // be wired through the scene's own event emitter to actually run.
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.shutdown());

    this.emitCurrentState();
  }

  private handleKeyInput(code: string) {
    if (code === 'KeyM') { sfx.toggle(); window.dispatchEvent(new Event('arcade-mute')); return; }
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
    sfx.start();
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
    this.speedBonus = 0;
    this.deathReason = '';
    this.particles = [];
    this.trail = [];
    this.specialFood = null;
    this.shakeAmount = 0;
    this.comboTimeLeft = 0;
    this.lastScoreGain = 0;
    this.tongueTimer = 0;
    this.magnetItem = null;
    this.magnetActiveUntil = 0;
    this.speedberry = null;
    this.shrinker = null;
    this.speedBoostUntil = 0;
    this.regenFlashUntil = 0;

    if (this.specialFoodTimer) {
      this.specialFoodTimer.remove();
      this.specialFoodTimer = null;
    }
    if (this.magnetItemTimer) {
      this.magnetItemTimer.remove();
      this.magnetItemTimer = null;
    }
    if (this.speedberryTimer) {
      this.speedberryTimer.remove();
      this.speedberryTimer = null;
    }
    if (this.shrinkerTimer) {
      this.shrinkerTimer.remove();
      this.shrinkerTimer = null;
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

    // Tag a fraction as moving patrollers — only when walls are on, since
    // wrap-around boards (gampang) don't spawn obstacles at all anyway.
    const moverCount = Math.round(this.obstacles.length * MOVING_OBSTACLE_FRACTION);
    const shuffled = [...this.obstacles].sort(() => Math.random() - 0.5);
    for (let i = 0; i < moverCount; i++) {
      const o = shuffled[i];
      const axis: 'h' | 'v' = Math.random() < 0.5 ? 'h' : 'v';
      const range = 2 + Math.floor(Math.random() * 3); // patrol 2-4 cells
      o.moving = true;
      o.axis = axis;
      o.dir = Math.random() < 0.5 ? 1 : -1;
      o.moveTimer = Math.random() * OBSTACLE_MOVE_MS; // desync patrol phase
      if (axis === 'h') {
        o.min = Math.max(1, o.x - range);
        o.max = Math.min(GRID_W - 2, o.x + range);
      } else {
        o.min = Math.max(1, o.y - range);
        o.max = Math.min(GRID_H - 2, o.y + range);
      }
    }
  }

  /* Regenerate the whole obstacle layout mid-run (called at length
     milestones) — keeps clear of the snake's current body so it never
     insta-kills on regen. */
  private regenerateObstacles() {
    if (this.cfg.obstacles <= 0) return;
    this.obstacles = [];
    this.generateObstacles();
    this.regenFlashUntil = Date.now() + 900;
    this.cameras.main.flash(200, 96, 165, 250);
    sfx.warn();
  }

  /* Advances each patrolling obstacle's back-and-forth position on its own
     timer; skips a step if the destination cell is occupied so movers
     never overlap the snake, food, or each other. */
  private updateObstacles(delta: number) {
    if (!this.started || this.gameOver) return;
    const occupied = new Set<string>();
    for (const s of this.snake) occupied.add(`${s.x},${s.y}`);
    occupied.add(`${this.food.x},${this.food.y}`);
    for (const o of this.obstacles) occupied.add(`${o.x},${o.y}`);

    for (const o of this.obstacles) {
      if (!o.moving) continue;
      o.moveTimer = (o.moveTimer ?? 0) + delta;
      if (o.moveTimer < OBSTACLE_MOVE_MS) continue;
      o.moveTimer = 0;

      const key = `${o.x},${o.y}`;
      occupied.delete(key);
      let nx = o.x;
      let ny = o.y;
      if (o.axis === 'h') {
        nx = o.x + (o.dir ?? 1);
        if (nx < (o.min ?? 1) || nx > (o.max ?? GRID_W - 2)) {
          o.dir = ((o.dir ?? 1) * -1) as 1 | -1;
          nx = o.x + o.dir;
        }
      } else {
        ny = o.y + (o.dir ?? 1);
        if (ny < (o.min ?? 1) || ny > (o.max ?? GRID_H - 2)) {
          o.dir = ((o.dir ?? 1) * -1) as 1 | -1;
          ny = o.y + o.dir;
        }
      }
      const nextKey = `${nx},${ny}`;
      if (!occupied.has(nextKey)) {
        o.x = nx;
        o.y = ny;
        occupied.add(nextKey);
      } else {
        occupied.add(key);
      }
    }
  }

  // Per-run difficulty ramp: every 8 food, shave a bit more off the move
  // interval (see effSpeed in the update loop), so a long run gets harder
  // without changing the fixed per-difficulty baseline other games compare
  // scores against.
  private bumpSpeedIfMilestone() {
    if (this.foodEaten > 0 && this.foodEaten % 8 === 0) {
      this.speedBonus = Math.min(this.speedBonus + 4, this.cfg.speed * 0.35);
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

  private placeMagnetItem() {
    if (this.magnetItem) return;
    const taken = new Set<string>();
    for (const s of this.snake) taken.add(`${s.x},${s.y}`);
    for (const o of this.obstacles) taken.add(`${o.x},${o.y}`);
    taken.add(`${this.food.x},${this.food.y}`);
    if (this.specialFood) taken.add(`${this.specialFood.x},${this.specialFood.y}`);

    let attempts = 0;
    while (attempts < 500) {
      attempts++;
      const x = Phaser.Math.Between(0, GRID_W - 1);
      const y = Phaser.Math.Between(0, GRID_H - 1);
      if (!taken.has(`${x},${y}`)) {
        this.magnetItem = { x, y };
        this.magnetItemTimer = this.time.delayedCall(10000, () => {
          this.magnetItem = null;
          this.magnetItemTimer = null;
        });
        return;
      }
    }
  }

  private placeSpeedberry() {
    if (this.speedberry) return;
    const taken = new Set<string>();
    for (const s of this.snake) taken.add(`${s.x},${s.y}`);
    for (const o of this.obstacles) taken.add(`${o.x},${o.y}`);
    taken.add(`${this.food.x},${this.food.y}`);
    if (this.specialFood) taken.add(`${this.specialFood.x},${this.specialFood.y}`);
    if (this.magnetItem) taken.add(`${this.magnetItem.x},${this.magnetItem.y}`);

    let attempts = 0;
    while (attempts < 500) {
      attempts++;
      const x = Phaser.Math.Between(0, GRID_W - 1);
      const y = Phaser.Math.Between(0, GRID_H - 1);
      if (!taken.has(`${x},${y}`)) {
        this.speedberry = { x, y };
        this.speedberryTimer = this.time.delayedCall(9000, () => {
          this.speedberry = null;
          this.speedberryTimer = null;
        });
        return;
      }
    }
  }

  private placeShrinker() {
    if (this.shrinker) return;
    const taken = new Set<string>();
    for (const s of this.snake) taken.add(`${s.x},${s.y}`);
    for (const o of this.obstacles) taken.add(`${o.x},${o.y}`);
    taken.add(`${this.food.x},${this.food.y}`);
    if (this.specialFood) taken.add(`${this.specialFood.x},${this.specialFood.y}`);
    if (this.magnetItem) taken.add(`${this.magnetItem.x},${this.magnetItem.y}`);
    if (this.speedberry) taken.add(`${this.speedberry.x},${this.speedberry.y}`);

    let attempts = 0;
    while (attempts < 500) {
      attempts++;
      const x = Phaser.Math.Between(0, GRID_W - 1);
      const y = Phaser.Math.Between(0, GRID_H - 1);
      if (!taken.has(`${x},${y}`)) {
        this.shrinker = { x, y };
        this.shrinkerTimer = this.time.delayedCall(9000, () => {
          this.shrinker = null;
          this.shrinkerTimer = null;
        });
        return;
      }
    }
  }

  // While magnet is active, food creeps one cell closer to the head on every
  // move step (not every render frame) so it stays a gradual pull, not a
  // teleport — skips the step if the destination cell is occupied.
  private pullTowardHead(pt: Pt, head: Pt) {
    const occupied = new Set<string>();
    for (const s of this.snake) occupied.add(`${s.x},${s.y}`);
    for (const o of this.obstacles) occupied.add(`${o.x},${o.y}`);
    const nx = pt.x + Math.sign(head.x - pt.x);
    const ny = pt.y + Math.sign(head.y - pt.y);
    if (!occupied.has(`${nx},${ny}`)) { pt.x = nx; pt.y = ny; }
  }

  update(_time: number, delta: number) {
    sfx.musicTick(this.started && !this.gameOver, this.snake.length > 20 ? 1 : 0, 'snake');
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

    /* Move timer — ramps up gradually as the run continues (see foodEaten++
       sites for where speedBonus increments), floored at 65% of the
       difficulty's base speed so it never becomes unreadable. Speedberry
       adds a further temporary multiplier on top. */
    const speedBoostActive = Date.now() < this.speedBoostUntil;
    const boostMult = speedBoostActive ? 0.6 : 1;
    const effSpeed = Math.max(this.cfg.speed * 0.65, this.cfg.speed - this.speedBonus) * boostMult;
    this.moveTimer += delta;
    if (this.moveTimer >= effSpeed) {
      this.moveTimer -= effSpeed;
      this.moveSnake();
    }

    /* Patrolling obstacles advance on their own clock, independent of the
       snake's move tick, so they feel alive even while the snake is still. */
    this.updateObstacles(delta);

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

    /* Self collision — exclude the tail cell that's about to be vacated
       (popped below) unless this move eats food and keeps the tail, since
       moving into a cell your own tail is leaving is legal in Snake. */
    const willEat =
      (head.x === this.food.x && head.y === this.food.y) ||
      !!(this.specialFood && head.x === this.specialFood.x && head.y === this.specialFood.y) ||
      !!(this.speedberry && head.x === this.speedberry.x && head.y === this.speedberry.y);
    const bodyToCheck = willEat ? this.snake : this.snake.slice(0, -1);
    for (const s of bodyToCheck) {
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
    let shrinkAmount = 0;
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

      // Random base score + combo multiplier (capped at 10x below)
      const baseScore = Phaser.Math.Between(
        this.cfg.scoreMin,
        this.cfg.scoreMax,
      );
      const comboMultiplier = Math.min(this.combo, 10);
      const gained = baseScore * comboMultiplier;
      this.score += gained;
      this.lastScoreGain = gained;
      this.foodEaten++;
      this.bumpSpeedIfMilestone();

      // Particles
      this.spawnFoodParticles(head.x, head.y, SNAKE_COLOR);
      if (this.combo >= 3) { sfx.power(); } else { sfx.coin(); }

      this.placeFood();

      // Maybe spawn special food every 5 foods
      if (this.foodEaten % 5 === 0) {
        this.placeSpecialFood();
      }

      // Regenerate the obstacle layout at length milestones
      if (this.foodEaten % REGEN_EVERY_FOOD === 0) {
        this.regenerateObstacles();
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
      this.bumpSpeedIfMilestone();
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.comboTimeLeft = this.cfg.comboWindowMs;
      this.lastFoodTime = Date.now();

      this.spawnFoodParticles(head.x, head.y, 0xffd700); // Gold particles
      sfx.power();
      this.specialFood = null;
      if (this.specialFoodTimer) {
        this.specialFoodTimer.remove();
        this.specialFoodTimer = null;
      }
    } else if (this.magnetItem && head.x === this.magnetItem.x && head.y === this.magnetItem.y) {
      this.magnetActiveUntil = Date.now() + 6000;
      this.spawnFoodParticles(head.x, head.y, 0xec4899, 10);
      this.cameras.main.flash(150, 236, 72, 153);
      sfx.power();
      this.magnetItem = null;
      if (this.magnetItemTimer) {
        this.magnetItemTimer.remove();
        this.magnetItemTimer = null;
      }
    } else if (this.speedberry && head.x === this.speedberry.x && head.y === this.speedberry.y) {
      ate = true;
      this.speedBoostUntil = Date.now() + SPEEDBERRY_DURATION_MS;
      const baseScore = Phaser.Math.Between(this.cfg.scoreMin, this.cfg.scoreMax);
      this.score += baseScore * 2;
      this.lastScoreGain = baseScore * 2;
      this.foodEaten++;
      this.spawnFoodParticles(head.x, head.y, 0x22d3ee, 10);
      this.cameras.main.flash(150, 34, 211, 238);
      sfx.power();
      this.speedberry = null;
      if (this.speedberryTimer) {
        this.speedberryTimer.remove();
        this.speedberryTimer = null;
      }
    } else if (this.shrinker && head.x === this.shrinker.x && head.y === this.shrinker.y) {
      const baseScore = Phaser.Math.Between(this.cfg.scoreMin, this.cfg.scoreMax);
      this.score += baseScore * 2;
      this.lastScoreGain = baseScore * 2;
      shrinkAmount = Math.max(2, Math.floor(this.snake.length * 0.15));
      this.spawnFoodParticles(head.x, head.y, 0x60a5fa, 8);
      this.cameras.main.flash(150, 96, 165, 250);
      sfx.pop();
      this.shrinker = null;
      if (this.shrinkerTimer) {
        this.shrinkerTimer.remove();
        this.shrinkerTimer = null;
      }
    }

    if (!ate) {
      this.snake.pop();
    }
    // Shrinker removes extra tail segments on top of the normal pop, but
    // never below length 3 (the minimum a legal snake needs).
    for (let i = 0; i < shrinkAmount && this.snake.length > 3; i++) {
      this.snake.pop();
    }

    if (Date.now() < this.magnetActiveUntil) {
      this.pullTowardHead(this.food, head);
      if (this.specialFood) this.pullTowardHead(this.specialFood, head);
    }

    // Occasional magnet item, on a schedule distinct from the special-food
    // spawn (every 5th) so the two don't always coincide.
    if (this.foodEaten > 0 && this.foodEaten % 9 === 0) {
      this.placeMagnetItem();
    }
    if (this.foodEaten > 0 && this.foodEaten % SPEEDBERRY_EVERY_FOOD === 0) {
      this.placeSpeedberry();
    }
    if (this.foodEaten > 0 && this.foodEaten % SHRINKER_EVERY_FOOD === 0) {
      this.placeShrinker();
    }
  }

  private die() {
    this.gameOver = true;
    this.shakeAmount = 8;
    sfx.death();

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

    /* Obstacles — BLUE (patrolling ones get an orange tint + motion streak
       so they read as "moving" at a glance, not just static blue blocks) */
    for (const o of this.obstacles) {
      const bodyColor = o.moving ? 0xf59e0b : OBSTACLE_COLOR;
      const shadeColor = o.moving ? 0xb45309 : 0x2563eb;
      const shineColor = o.moving ? 0xfbbf24 : 0x60a5fa;
      this.gfx.fillStyle(bodyColor, 1);
      this.gfx.fillRect(ox + o.x * cs + 1, oy + o.y * cs + 1, cs - 2, cs - 2);
      this.gfx.fillStyle(shadeColor, 1);
      this.gfx.fillRect(ox + o.x * cs + 2, oy + o.y * cs + 2, cs - 4, cs - 4);
      // Highlight shine on obstacle
      this.gfx.fillStyle(shineColor, 0.3);
      this.gfx.fillRect(ox + o.x * cs + 2, oy + o.y * cs + 2, cs - 4, 2);
      if (o.moving) {
        // Small directional arrow hinting the patrol axis
        this.gfx.fillStyle(0xfff7ed, 0.7);
        const cx = ox + o.x * cs + cs / 2;
        const cy = oy + o.y * cs + cs / 2;
        const r = cs * 0.12;
        this.gfx.fillCircle(cx, cy, r);
      }
    }

    /* Obstacle regen warning flash */
    if (this.regenFlashUntil > Date.now()) {
      const t = (this.regenFlashUntil - Date.now()) / 900;
      this.gfx.fillStyle(0x60a5fa, 0.15 * t);
      this.gfx.fillRect(this.offsetX, this.offsetY, cs * GRID_W, cs * GRID_H);
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

    /* Magnet item (pink diamond) */
    if (this.magnetItem) {
      const mi = this.magnetItem;
      const miPulse = 1 + Math.sin(this.foodPulse * 2) * 0.2;
      const miSize = cs * 0.42 * miPulse;
      this.gfx.fillStyle(0xec4899, 0.25);
      this.gfx.fillCircle(ox + mi.x * cs + cs / 2, oy + mi.y * cs + cs / 2, miSize * 1.8);
      this.gfx.fillStyle(0xec4899, 1);
      this.drawDiamond(ox + mi.x * cs + cs / 2, oy + mi.y * cs + cs / 2, miSize);
      this.gfx.fillStyle(0xffffff, 0.7);
      this.gfx.fillCircle(ox + mi.x * cs + cs / 2 - miSize * 0.2, oy + mi.y * cs + cs / 2 - miSize * 0.2, miSize * 0.2);
    }

    /* Speedberry (cyan bolt) */
    if (this.speedberry) {
      const sb = this.speedberry;
      const sbPulse = 1 + Math.sin(this.foodPulse * 2.5) * 0.2;
      const sbSize = cs * 0.42 * sbPulse;
      const cx = ox + sb.x * cs + cs / 2;
      const cy = oy + sb.y * cs + cs / 2;
      this.gfx.fillStyle(0x22d3ee, 0.25);
      this.gfx.fillCircle(cx, cy, sbSize * 1.8);
      this.gfx.fillStyle(0x22d3ee, 1);
      // Lightning-bolt-ish zigzag
      this.gfx.beginPath();
      this.gfx.moveTo(cx + sbSize * 0.15, cy - sbSize);
      this.gfx.lineTo(cx - sbSize * 0.35, cy + sbSize * 0.1);
      this.gfx.lineTo(cx + sbSize * 0.05, cy + sbSize * 0.1);
      this.gfx.lineTo(cx - sbSize * 0.15, cy + sbSize);
      this.gfx.lineTo(cx + sbSize * 0.4, cy - sbSize * 0.15);
      this.gfx.lineTo(cx, cy - sbSize * 0.15);
      this.gfx.closePath();
      this.gfx.fillPath();
    }

    /* Shrinker (icy blue diamond, smaller & duller than the magnet item) */
    if (this.shrinker) {
      const sh = this.shrinker;
      const shPulse = 1 + Math.sin(this.foodPulse * 1.8) * 0.15;
      const shSize = cs * 0.36 * shPulse;
      this.gfx.fillStyle(0x60a5fa, 0.22);
      this.gfx.fillCircle(ox + sh.x * cs + cs / 2, oy + sh.y * cs + cs / 2, shSize * 1.7);
      this.gfx.fillStyle(0x93c5fd, 1);
      this.drawDiamond(ox + sh.x * cs + cs / 2, oy + sh.y * cs + cs / 2, shSize);
      this.gfx.fillStyle(0xffffff, 0.6);
      this.gfx.fillCircle(ox + sh.x * cs + cs / 2 - shSize * 0.2, oy + sh.y * cs + cs / 2 - shSize * 0.2, shSize * 0.18);
    }

    /* Speed boost active — cyan trail glow behind the head */
    if (Date.now() < this.speedBoostUntil && this.snake.length > 0) {
      const head = this.snake[0];
      this.gfx.fillStyle(0x22d3ee, 0.25);
      this.gfx.fillCircle(ox + head.x * cs + cs / 2, oy + head.y * cs + cs / 2, cs * 0.9);
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
      magnetActive: Date.now() < this.magnetActiveUntil,
      magnetTimeLeft: Math.max(0, this.magnetActiveUntil - Date.now()),
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
