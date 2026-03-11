import Phaser from 'phaser';

/* ── Shared state for React UI ── */
export interface TetrisGameState {
  score: number;
  level: number;
  lines: number;
  combo: number;
  maxCombo: number;
  nextPiece: string;
  holdPiece: string;
  gameOver: boolean;
  started: boolean;
  difficulty: TetrisDifficulty;
  singles: number;
  doubles: number;
  triples: number;
  tetrises: number;
  tSpins: number;
}

export type TetrisDifficulty = 'gampang' | 'sedang' | 'susah' | 'gak-ngotak';

interface DiffConfig {
  startSpeed: number;
  speedUp: number;
  minSpeed: number;
  preview: boolean;
  garbageRows: number;
  label: string;
}

const DIFFICULTY: Record<TetrisDifficulty, DiffConfig> = {
  gampang: {
    startSpeed: 1200,
    speedUp: 70,
    minSpeed: 150,
    preview: true,
    garbageRows: 0,
    label: 'Gampang',
  },
  sedang: {
    startSpeed: 900,
    speedUp: 55,
    minSpeed: 120,
    preview: true,
    garbageRows: 0,
    label: 'Sedang',
  },
  susah: {
    startSpeed: 650,
    speedUp: 40,
    minSpeed: 80,
    preview: true,
    garbageRows: 1,
    label: 'Susah',
  },
  'gak-ngotak': {
    startSpeed: 450,
    speedUp: 30,
    minSpeed: 60,
    preview: false,
    garbageRows: 3,
    label: 'Gak Ngotak',
  },
};

/* ── Tetromino definitions ── */
type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

const PIECES: Record<PieceType, number[][][]> = {
  I: [
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
    [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
    [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
  ],
  O: [
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
  ],
  T: [
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [1, 1],
    ],
    [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
    ],
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
      [0, 1],
    ],
  ],
  S: [
    [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
    [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  ],
  Z: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ],
  ],
  J: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [0, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [0, 2],
      [1, 2],
    ],
  ],
  L: [
    [
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  ],
};

const PIECE_COLORS: Record<PieceType, number> = {
  I: 0x00d4d4,
  O: 0xffc107,
  T: 0xb040d0,
  S: 0x50c878,
  Z: 0xf05050,
  J: 0x4488ff,
  L: 0xff9020,
};

const ALL_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

const COLS = 10;
const ROWS = 20;

function emitState(s: TetrisGameState) {
  (window as any).__tetrisState = s;
  window.dispatchEvent(new Event('tetris-update'));
}

/* ── Helper: Lighter / darker shade ── */
function lighten(c: number, f: number): number {
  const r = Math.min(255, ((c >> 16) & 0xff) + Math.floor(255 * f));
  const g = Math.min(255, ((c >> 8) & 0xff) + Math.floor(255 * f));
  const b = Math.min(255, (c & 0xff) + Math.floor(255 * f));
  return (r << 16) | (g << 8) | b;
}
function darken(c: number, f: number): number {
  const r = Math.max(0, ((c >> 16) & 0xff) - Math.floor(255 * f));
  const g = Math.max(0, ((c >> 8) & 0xff) - Math.floor(255 * f));
  const b = Math.max(0, (c & 0xff) - Math.floor(255 * f));
  return (r << 16) | (g << 8) | b;
}

export class TetrisScene extends Phaser.Scene {
  /* Grid: 0 = empty, else color */
  private grid: number[][] = [];
  private cellSize = 0;
  private offsetX = 0;
  private offsetY = 0;

  /* Current piece */
  private curType: PieceType = 'T';
  private curRot = 0;
  private curX = 0;
  private curY = 0;

  /* Next piece (bag) */
  private bag: PieceType[] = [];
  private nextType: PieceType = 'T';

  /* Hold piece */
  private holdType: PieceType | null = null;
  private holdUsed = false; /* prevents infinite swapping */

  /* Preview labels */
  private _nextLabel: Phaser.GameObjects.Text | null = null;
  private _holdLabel: Phaser.GameObjects.Text | null = null;

  /* Timing */
  private dropTimer = 0;
  private dropInterval = 800;
  private lockDelay = 0;
  private lockDelayMax = 500;
  private softDropping = false;
  private softDropSpeed = 45; /* ms between rows when soft-dropping */
  private lastMoveWasRotate = false; /* for T-spin detection */

  /* State */
  private score = 0;
  private level = 1;
  private linesCleared = 0;
  private combo = -1;
  private maxCombo = 0;
  private gameOverFlag = false;
  private started = false;
  private startTime = 0;
  private singles = 0;
  private doubles = 0;
  private triples = 0;
  private tetrises = 0;
  private tSpins = 0;

  /* Difficulty */
  private difficulty: TetrisDifficulty = 'sedang';
  private cfg!: DiffConfig;

  /* Graphics */
  private gfx!: Phaser.GameObjects.Graphics;

  /* Clear animation */
  private clearingRows: number[] = [];
  private clearTimer = 0;
  private clearDuration = 350;

  /* Lock flash */
  private lockFlash = 0;
  private lockFlashDuration = 120;
  private lockedCells: { r: number; c: number }[] = [];

  /* Score popup */
  private scorePopups: { text: Phaser.GameObjects.Text; life: number }[] = [];

  /* Screen shake */
  private shakeTimer = 0;
  private shakeIntensity = 0;

  /* Particles for line clear / landing */
  private particles: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: number;
    size: number;
  }[] = [];

  /* Level-up flash */
  private levelUpFlash = 0;

  /* Session */
  private sessionCtx: {
    sessionId?: string;
    startedAt?: number;
    token?: string;
  } | null = null;

  /* Events cleanup */
  private eventHandlers: { event: string; fn: EventListener }[] = [];

  constructor() {
    super({ key: 'TetrisScene' });
  }

  create() {
    this.difficulty =
      ((window as any).__tetrisDifficulty as TetrisDifficulty) || 'sedang';
    this.cfg = DIFFICULTY[this.difficulty] || DIFFICULTY.sedang;

    const padX = 16;
    const padY = 16;
    const availW = this.scale.width - padX * 2;
    const availH = this.scale.height - padY * 2;
    this.cellSize = Math.floor(Math.min(availW / COLS, availH / ROWS));

    const gridW = this.cellSize * COLS;
    this.offsetX = Math.floor((this.scale.width - gridW) / 2);
    this.offsetY = Math.floor((this.scale.height - this.cellSize * ROWS) / 2);

    this.gfx = this.add.graphics();

    this.initGrid();
    this.fillBag();
    this.nextType = this.pullFromBag();
    this.spawnPiece();
    this.started = false;
    this.gameOverFlag = false;

    /* ── Keyboard input ── */
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-LEFT', () => this.tryMove(-1, 0));
      this.input.keyboard.on('keydown-RIGHT', () => this.tryMove(1, 0));

      /* DOWN = soft drop (hold) */
      this.input.keyboard.on('keydown-DOWN', () => {
        if (!this.started && !this.gameOverFlag) this.startGame();
        this.softDropping = true;
      });
      this.input.keyboard.on('keyup-DOWN', () => {
        this.softDropping = false;
      });

      /* SPACE = soft drop (hold) — user requested no instant drop */
      this.input.keyboard.on('keydown-SPACE', () => {
        if (!this.started && !this.gameOverFlag) this.startGame();
        this.softDropping = true;
      });
      this.input.keyboard.on('keyup-SPACE', () => {
        this.softDropping = false;
      });

      /* UP / Z = rotate */
      this.input.keyboard.on('keydown-UP', () => this.tryRotate(1));
      this.input.keyboard.on('keydown-Z', () => this.tryRotate(-1));

      /* SHIFT = hard drop (optional for advanced players) */
      this.input.keyboard.on('keydown-SHIFT', () => {
        if (!this.started || this.gameOverFlag) return;
        this.hardDrop();
      });

      /* C / H = hold piece */
      this.input.keyboard.on('keydown-C', () => this.holdPiece());
      this.input.keyboard.on('keydown-H', () => this.holdPiece());
    }

    /* ── Touch / custom events from React ── */
    const on = (evt: string, fn: EventListener) => {
      window.addEventListener(evt, fn);
      this.eventHandlers.push({ event: evt, fn });
    };

    on('tetris-direction', ((e: CustomEvent) => {
      const dir = e.detail;
      if (dir === 'soft-drop-stop') {
        this.softDropping = false;
        return;
      }
      /* If game not started, only start — don't execute the action */
      if (!this.started && !this.gameOverFlag) {
        this.startGame();
        return;
      }
      if (dir === 'left') this.tryMove(-1, 0);
      else if (dir === 'right') this.tryMove(1, 0);
      else if (dir === 'rotate') this.tryRotate(1);
      else if (dir === 'soft-drop-start') this.softDropping = true;
      else if (dir === 'hard-drop') this.hardDrop();
      else if (dir === 'hold') this.holdPiece();
    }) as EventListener);

    on('tetris-restart', () => this.resetGame());

    on('tetris-set-difficulty', ((e: CustomEvent) => {
      const d = e.detail as TetrisDifficulty;
      if (DIFFICULTY[d] && !this.started) {
        this.difficulty = d;
        this.cfg = DIFFICULTY[d];
        (window as any).__tetrisDifficulty = d;
        this.resetGame();
      }
    }) as EventListener);

    this.emitCurrentState();
  }

  /* ── Grid init ── */
  private initGrid() {
    this.grid = [];
    for (let r = 0; r < ROWS; r++) this.grid.push(new Array(COLS).fill(0));
    if (this.cfg.garbageRows > 0) {
      for (let r = ROWS - this.cfg.garbageRows; r < ROWS; r++) {
        const gap = Math.floor(Math.random() * COLS);
        for (let c = 0; c < COLS; c++) {
          this.grid[r][c] = c === gap ? 0 : 0x555566;
        }
      }
    }
  }

  /* ── 7-bag randomizer ── */
  private fillBag() {
    const t = [...ALL_TYPES];
    for (let i = t.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [t[i], t[j]] = [t[j], t[i]];
    }
    this.bag = t;
  }
  private pullFromBag(): PieceType {
    if (this.bag.length === 0) this.fillBag();
    return this.bag.pop()!;
  }

  /* ── Piece logic ── */
  private spawnPiece() {
    this.curType = this.nextType;
    this.nextType = this.pullFromBag();
    this.curRot = 0;
    this.curX = Math.floor(COLS / 2) - 1;
    this.curY = 0;
    this.lockDelay = 0;
    if (!this.isValid(this.curX, this.curY, this.curRot)) this.die();
  }

  private getCells(
    type: PieceType = this.curType,
    rot: number = this.curRot,
  ): number[][] {
    return PIECES[type][((rot % 4) + 4) % 4];
  }

  private isValid(x: number, y: number, rot: number): boolean {
    for (const [cx, cy] of this.getCells(this.curType, rot)) {
      const nx = x + cx;
      const ny = y + cy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
      if (ny >= 0 && this.grid[ny][nx] !== 0) return false;
    }
    return true;
  }

  private tryMove(dx: number, dy: number): boolean {
    if (this.gameOverFlag || !this.started) return false;
    if (this.isValid(this.curX + dx, this.curY + dy, this.curRot)) {
      this.curX += dx;
      this.curY += dy;
      if (dy > 0) this.lockDelay = 0;
      this.lastMoveWasRotate = false;
      return true;
    }
    return false;
  }

  private tryRotate(dir: number) {
    if (this.gameOverFlag || !this.started) return;
    const newRot = (((this.curRot + dir) % 4) + 4) % 4;
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      if (this.isValid(this.curX + kick, this.curY, newRot)) {
        this.curX += kick;
        this.curRot = newRot;
        this.lockDelay = 0;
        this.lastMoveWasRotate = true;
        return;
      }
    }
  }

  private hardDrop() {
    if (this.gameOverFlag || !this.started) return;
    let dropped = 0;
    while (this.isValid(this.curX, this.curY + 1, this.curRot)) {
      this.curY++;
      dropped++;
    }
    this.score += dropped * 2;
    this.shakeTimer = 80;
    this.shakeIntensity = Math.min(3, 1 + dropped * 0.1);
    this.lockPiece();
  }

  private getGhostY(): number {
    let gy = this.curY;
    while (this.isValid(this.curX, gy + 1, this.curRot)) gy++;
    return gy;
  }

  /* ── Hold piece ── */
  private holdPiece() {
    if (this.gameOverFlag || !this.started || this.holdUsed) return;
    this.holdUsed = true;
    if (this.holdType === null) {
      this.holdType = this.curType;
      this.spawnPiece();
    } else {
      const tmp = this.holdType;
      this.holdType = this.curType;
      this.curType = tmp;
      this.curRot = 0;
      this.curX = Math.floor(COLS / 2) - 1;
      this.curY = 0;
      this.lockDelay = 0;
      if (!this.isValid(this.curX, this.curY, this.curRot)) this.die();
    }
    this.lastMoveWasRotate = false;
  }

  /* ── T-spin detection ── */
  private isTSpin(): boolean {
    if (this.curType !== 'T' || !this.lastMoveWasRotate) return false;
    /* Check 4 corners of the T center; 3+ must be filled or OOB */
    const cx = this.curX + 1; /* center of T is (1,1) offset */
    const cy = this.curY + 1;
    const corners = [
      [cx - 1, cy - 1],
      [cx + 1, cy - 1],
      [cx - 1, cy + 1],
      [cx + 1, cy + 1],
    ];
    let filled = 0;
    for (const [x, y] of corners) {
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS || this.grid[y][x] !== 0) {
        filled++;
      }
    }
    return filled >= 3;
  }

  private lockPiece() {
    const color = PIECE_COLORS[this.curType];
    const wasTSpin = this.isTSpin();
    this.lockedCells = [];
    for (const [cx, cy] of this.getCells()) {
      const ny = this.curY + cy;
      const nx = this.curX + cx;
      if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
        this.grid[ny][nx] = color;
        this.lockedCells.push({ r: ny, c: nx });
      }
    }
    this.lockFlash = this.lockFlashDuration;
    this.holdUsed = false;
    this.checkLines(wasTSpin);
    /* Defer spawn until rows are actually removed if clearing */
    if (this.clearingRows.length === 0) {
      this.spawnPiece();
    }
  }

  private checkLines(wasTSpin = false) {
    const fullRows: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      if (this.grid[r].every((c) => c !== 0)) fullRows.push(r);
    }
    if (fullRows.length > 0) {
      this.clearingRows = fullRows;
      this.clearTimer = this.clearDuration;

      const n = fullRows.length;
      const lvl = this.level;
      let pts = 0;
      let label = '';

      if (wasTSpin) {
        /* T-spin scoring */
        this.tSpins++;
        if (n === 1) {
          pts = 800 * lvl;
          label = 'T-Spin Single!';
        } else if (n === 2) {
          pts = 1200 * lvl;
          label = 'T-Spin Double!';
        } else if (n >= 3) {
          pts = 1600 * lvl;
          label = 'T-Spin Triple!';
        }
      } else if (n === 1) {
        pts = 100 * lvl;
        this.singles++;
        label = 'Single';
      } else if (n === 2) {
        pts = 300 * lvl;
        this.doubles++;
        label = 'Double';
      } else if (n === 3) {
        pts = 500 * lvl;
        this.triples++;
        label = 'Triple';
      } else if (n >= 4) {
        pts = 800 * lvl;
        this.tetrises++;
        label = 'TETRIS!';
      }

      this.combo++;
      let comboBonus = 0;
      if (this.combo > 0) {
        comboBonus = 50 * this.combo * lvl;
        pts += comboBonus;
      }
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;

      this.score += pts;
      this.linesCleared += n;
      const prevLevel = this.level;
      this.level = Math.floor(this.linesCleared / 10) + 1;
      if (this.level > prevLevel) this.levelUpFlash = 400;
      this.dropInterval = Math.max(
        this.cfg.minSpeed,
        this.cfg.startSpeed - (this.level - 1) * this.cfg.speedUp,
      );

      /* Score popup */
      const centerRow = fullRows[Math.floor(fullRows.length / 2)];
      const popText =
        this.combo > 0
          ? `+${pts} ${label} 🔥x${this.combo}`
          : `+${pts} ${label}`;
      this.showScorePopup(popText, centerRow, n >= 4 ? 0xffd700 : 0xffffff);

      /* Shake on Tetris */
      if (n >= 4) {
        this.shakeTimer = 200;
        this.shakeIntensity = 4;
      } else if (n >= 2) {
        this.shakeTimer = 100;
        this.shakeIntensity = 2;
      }

      /* Spawn line-clear particles */
      this.spawnLineClearParticles(fullRows);
    } else {
      this.combo = -1;
    }
  }

  private spawnLineClearParticles(rows: number[]) {
    const cs = this.cellSize;
    const ox = this.offsetX;
    const oy = this.offsetY;
    for (const r of rows) {
      for (let c = 0; c < COLS; c++) {
        const color = this.grid[r][c] || 0xffffff;
        for (let p = 0; p < 2; p++) {
          this.particles.push({
            x: ox + c * cs + cs / 2,
            y: oy + r * cs + cs / 2,
            vx: (Math.random() - 0.5) * 4,
            vy: -1 - Math.random() * 3,
            life: 400 + Math.random() * 300,
            color,
            size: 2 + Math.random() * 3,
          });
        }
      }
    }
  }

  private actuallyRemoveRows() {
    for (const r of this.clearingRows.sort((a, b) => b - a)) {
      this.grid.splice(r, 1);
      this.grid.unshift(new Array(COLS).fill(0));
    }
    this.clearingRows = [];
    this.spawnPiece();
  }

  private showScorePopup(text: string, row: number, color: number) {
    const x = this.offsetX + (COLS * this.cellSize) / 2;
    const y = this.offsetY + row * this.cellSize;
    const hex = '#' + color.toString(16).padStart(6, '0');
    const fontSize = Math.max(14, Math.min(22, this.cellSize));
    const txt = this.add
      .text(x, y, text, {
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontSize: `${fontSize}px`,
        color: hex,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.scorePopups.push({ text: txt, life: 1200 });
  }

  /* ── Game lifecycle ── */
  private startGame() {
    if (this.started) return;
    this.started = true;
    this.startTime = Date.now();
    this.startSession();
    this.emitCurrentState();
  }

  private resetGame() {
    this.score = 0;
    this.level = 1;
    this.linesCleared = 0;
    this.combo = -1;
    this.maxCombo = 0;
    this.gameOverFlag = false;
    this.started = false;
    this.singles = 0;
    this.doubles = 0;
    this.triples = 0;
    this.tetrises = 0;
    this.tSpins = 0;
    this.dropTimer = 0;
    this.lockDelay = 0;
    this.softDropping = false;
    this.lastMoveWasRotate = false;
    this.holdType = null;
    this.holdUsed = false;
    this.clearingRows = [];
    this.clearTimer = 0;
    this.lockFlash = 0;
    this.lockedCells = [];
    this.shakeTimer = 0;
    this.sessionCtx = null;
    this.particles = [];
    this.levelUpFlash = 0;
    this.cfg = DIFFICULTY[this.difficulty] || DIFFICULTY.sedang;
    this.dropInterval = this.cfg.startSpeed;
    /* Clean up popups */
    for (const p of this.scorePopups) p.text.destroy();
    this.scorePopups = [];
    if (this._nextLabel) {
      this._nextLabel.destroy();
      this._nextLabel = null;
    }
    if (this._holdLabel) {
      this._holdLabel.destroy();
      this._holdLabel = null;
    }

    this.initGrid();
    this.bag = [];
    this.fillBag();
    this.nextType = this.pullFromBag();
    this.spawnPiece();
    this.emitCurrentState();
  }

  private die() {
    this.gameOverFlag = true;
    this.submitScore();
    this.emitCurrentState();
  }

  /* ── Main update loop ── */
  private sceneReadyFired = false;

  update(_time: number, delta: number) {
    if (!this.sceneReadyFired) {
      this.sceneReadyFired = true;
      window.dispatchEvent(new Event('tetris-scene-ready'));
    }
    if (this.gameOverFlag || !this.started) {
      this.draw();
      return;
    }

    /* Score popup animation */
    for (const p of this.scorePopups) {
      p.life -= delta;
      p.text.y -= 0.4 * (delta / 16);
      p.text.alpha = Math.max(0, p.life / 1200);
      p.text.setScale(1 + (1 - p.life / 1200) * 0.15);
      if (p.life <= 0) p.text.destroy();
    }
    this.scorePopups = this.scorePopups.filter((p) => p.life > 0);

    /* Particles */
    for (const p of this.particles) {
      p.life -= delta;
      p.x += p.vx * (delta / 16);
      p.y += p.vy * (delta / 16);
      p.vy += 0.15 * (delta / 16); /* gravity */
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    /* Level-up flash */
    if (this.levelUpFlash > 0) this.levelUpFlash -= delta;

    /* Lock flash countdown */
    if (this.lockFlash > 0) this.lockFlash -= delta;

    /* Screen shake */
    if (this.shakeTimer > 0) this.shakeTimer -= delta;

    /* Line clear animation */
    if (this.clearTimer > 0) {
      this.clearTimer -= delta;
      if (this.clearTimer <= 0) this.actuallyRemoveRows();
      this.draw();
      return;
    }

    /* Soft drop speed: 8× faster */
    const effectiveInterval = this.softDropping
      ? Math.min(this.dropInterval, this.softDropSpeed)
      : this.dropInterval;

    this.dropTimer += delta;
    if (this.dropTimer >= effectiveInterval) {
      this.dropTimer = 0;
      if (this.isValid(this.curX, this.curY + 1, this.curRot)) {
        this.curY++;
        if (this.softDropping) this.score += 1;
      } else {
        this.lockDelay += effectiveInterval;
        if (this.lockDelay >= this.lockDelayMax) this.lockPiece();
      }
    }

    this.emitCurrentState();
    this.draw();
  }

  /* ── Drawing ── */
  private draw() {
    this.gfx.clear();
    const cs = this.cellSize;

    /* Shake offset */
    let sx = 0,
      sy = 0;
    if (this.shakeTimer > 0) {
      const intensity = this.shakeIntensity * (this.shakeTimer / 200);
      sx = Math.round((Math.random() - 0.5) * intensity * 2);
      sy = Math.round((Math.random() - 0.5) * intensity * 2);
    }
    const ox = this.offsetX + sx;
    const oy = this.offsetY + sy;

    /* Grid background — dark with level-based tint */
    const levelColors = [
      0x0e1428, 0x0e1830, 0x0e1c2e, 0x12182e, 0x161430, 0x1a1232, 0x1e1028,
      0x221424, 0x261820, 0x2a1c1e,
    ];
    const lvlIdx = Math.min(this.level - 1, levelColors.length - 1);
    const bgColor = this.started ? levelColors[lvlIdx] : 0x0e1428;

    this.gfx.fillStyle(bgColor, 1);
    this.gfx.fillRoundedRect(ox - 2, oy - 2, COLS * cs + 4, ROWS * cs + 4, 4);
    this.gfx.fillStyle(bgColor, 1);
    this.gfx.fillRect(ox, oy, COLS * cs, ROWS * cs);

    /* Grid dots at intersections */
    for (let r = 1; r < ROWS; r++) {
      for (let c = 1; c < COLS; c++) {
        this.gfx.fillStyle(0x1e2d4a, 1);
        this.gfx.fillCircle(ox + c * cs, oy + r * cs, 1);
      }
    }

    /* Grid border */
    this.gfx.lineStyle(2, 0x2a3a5c, 0.8);
    this.gfx.strokeRoundedRect(ox - 2, oy - 2, COLS * cs + 4, ROWS * cs + 4, 4);

    /* Locked cells */
    for (let r = 0; r < ROWS; r++) {
      const clearing = this.clearingRows.includes(r);
      for (let c = 0; c < COLS; c++) {
        if (this.grid[r][c] !== 0) {
          const baseColor = this.grid[r][c];
          /* Lock flash overlay */
          const isFlashing =
            this.lockFlash > 0 &&
            this.lockedCells.some((lc) => lc.r === r && lc.c === c);

          if (clearing) {
            /* Clear animation: flash white then shrink */
            const progress = 1 - this.clearTimer / this.clearDuration;
            const flashPhase = Math.sin(progress * Math.PI * 2);
            const alpha = Math.max(0, 1 - progress * 0.8);
            const shrink = progress * cs * 0.3;
            this.gfx.fillStyle(flashPhase > 0 ? 0xffffff : baseColor, alpha);
            this.gfx.fillRoundedRect(
              ox + c * cs + 1 + shrink,
              oy + r * cs + 1 + shrink,
              cs - 2 - shrink * 2,
              cs - 2 - shrink * 2,
              2,
            );
          } else {
            this.drawCell(ox, oy, c, r, baseColor, isFlashing ? 0.3 : 0);
          }
        }
      }
    }

    if (!this.gameOverFlag && this.started) {
      const color = PIECE_COLORS[this.curType];

      /* Ghost piece — outline only */
      const ghostY = this.getGhostY();
      if (ghostY !== this.curY) {
        for (const [cx, cy] of this.getCells()) {
          const gx = this.curX + cx;
          const gy = ghostY + cy;
          if (gy >= 0) {
            this.gfx.lineStyle(1, color, 0.35);
            this.gfx.strokeRoundedRect(
              ox + gx * cs + 2,
              oy + gy * cs + 2,
              cs - 4,
              cs - 4,
              2,
            );
          }
        }
      }

      /* Current piece */
      const isLocking = !this.isValid(this.curX, this.curY + 1, this.curRot);
      const lockAlpha = isLocking
        ? 0.15 * Math.sin((this.lockDelay / this.lockDelayMax) * Math.PI)
        : 0;
      for (const [cx, cy] of this.getCells()) {
        const px = this.curX + cx;
        const py = this.curY + cy;
        if (py >= 0) {
          this.drawCell(ox, oy, px, py, color, lockAlpha);
        }
      }
    }

    /* Next piece preview — small overlay inside grid top-right */
    if (this.cfg.preview && !this.gameOverFlag) {
      const ps = Math.max(4, Math.floor(cs * 0.28));
      const boxPad = 4;
      const boxW = ps * 4 + boxPad * 2;
      const boxH = ps * 4 + boxPad * 2;
      const previewX = ox + COLS * cs - boxW - 2;
      const previewY = oy + 2;

      /* "N" label */
      if (!this._nextLabel) {
        this._nextLabel = this.add.text(previewX, previewY - 10, 'N', {
          fontSize: '8px',
          fontFamily: 'monospace',
          color: '#6b7fa8',
        });
      }
      this._nextLabel.setPosition(previewX, previewY - 10);

      /* Preview box */
      this.gfx.fillStyle(0x0e1428, 0.7);
      this.gfx.fillRoundedRect(
        previewX - 2,
        previewY - 2,
        boxW + 4,
        boxH + 4,
        4,
      );
      this.gfx.lineStyle(1, 0x2a3a5c, 0.4);
      this.gfx.strokeRoundedRect(
        previewX - 2,
        previewY - 2,
        boxW + 4,
        boxH + 4,
        4,
      );
      const nextCells = PIECES[this.nextType][0];
      const nc = PIECE_COLORS[this.nextType];
      for (const [cx, cy] of nextCells) {
        this.gfx.fillStyle(nc, 0.85);
        this.gfx.fillRoundedRect(
          previewX + cx * ps + boxPad,
          previewY + cy * ps + boxPad,
          ps - 1,
          ps - 1,
          1,
        );
      }

      /* Hold piece preview — below next */
      if (this.holdType) {
        const holdY = previewY + boxH + 10;

        /* "H" label */
        if (!this._holdLabel) {
          this._holdLabel = this.add.text(previewX, holdY - 10, 'H', {
            fontSize: '8px',
            fontFamily: 'monospace',
            color: '#6b7fa8',
          });
        }
        this._holdLabel.setPosition(previewX, holdY - 10);

        this.gfx.fillStyle(0x0e1428, 0.7);
        this.gfx.fillRoundedRect(
          previewX - 2,
          holdY - 2,
          boxW + 4,
          boxH + 4,
          4,
        );
        this.gfx.lineStyle(1, this.holdUsed ? 0x442222 : 0x2a3a5c, 0.4);
        this.gfx.strokeRoundedRect(
          previewX - 2,
          holdY - 2,
          boxW + 4,
          boxH + 4,
          4,
        );
        const holdCells = PIECES[this.holdType][0];
        const hc = PIECE_COLORS[this.holdType];
        const alpha = this.holdUsed ? 0.3 : 0.85;
        for (const [cx, cy] of holdCells) {
          this.gfx.fillStyle(hc, alpha);
          this.gfx.fillRoundedRect(
            previewX + cx * ps + boxPad,
            holdY + cy * ps + boxPad,
            ps - 1,
            ps - 1,
            1,
          );
        }
      }
    }

    /* Particles */
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / 700);
      this.gfx.fillStyle(p.color, alpha);
      this.gfx.fillCircle(p.x + sx, p.y + sy, p.size * alpha);
    }

    /* Level-up flash overlay */
    if (this.levelUpFlash > 0) {
      const alpha = Math.min(0.25, (this.levelUpFlash / 400) * 0.25);
      this.gfx.fillStyle(0xffd700, alpha);
      this.gfx.fillRect(ox, oy, COLS * cs, ROWS * cs);
    }

    /* Game over dark overlay */
    if (this.gameOverFlag) {
      this.gfx.fillStyle(0x000000, 0.6);
      this.gfx.fillRect(ox, oy, COLS * cs, ROWS * cs);
    }

    /* Pre-start dim */
    if (!this.started && !this.gameOverFlag) {
      this.gfx.fillStyle(0x000000, 0.25);
      this.gfx.fillRect(ox, oy, COLS * cs, ROWS * cs);
    }
  }

  /* Draw a single 3D-style cell */
  private drawCell(
    ox: number,
    oy: number,
    col: number,
    row: number,
    color: number,
    extraBright: number,
  ) {
    const cs = this.cellSize;
    const x = ox + col * cs + 1;
    const y = oy + row * cs + 1;
    const w = cs - 2;
    const h = cs - 2;
    const r = Math.min(3, cs / 6);
    const hl = Math.max(2, Math.floor(cs / 5));

    /* Main fill */
    this.gfx.fillStyle(color, 1);
    this.gfx.fillRoundedRect(x, y, w, h, r);

    /* Top highlight */
    this.gfx.fillStyle(lighten(color, 0.25 + extraBright), 0.7);
    this.gfx.fillRect(x + 1, y + 1, w - 2, hl);

    /* Left highlight */
    this.gfx.fillStyle(lighten(color, 0.15 + extraBright), 0.4);
    this.gfx.fillRect(x + 1, y + 1, Math.max(1, hl / 2), h - 2);

    /* Bottom shadow */
    this.gfx.fillStyle(darken(color, 0.2), 0.5);
    this.gfx.fillRect(x + 1, y + h - hl, w - 2, hl);

    /* Right shadow */
    this.gfx.fillStyle(darken(color, 0.15), 0.3);
    this.gfx.fillRect(
      x + w - Math.max(1, hl / 2),
      y + 1,
      Math.max(1, hl / 2),
      h - 2,
    );

    /* Inner bright dot (glossy feel) */
    this.gfx.fillStyle(0xffffff, 0.12 + extraBright * 0.5);
    this.gfx.fillCircle(x + w * 0.3, y + h * 0.3, Math.max(1, cs / 8));
  }

  private emitCurrentState() {
    emitState({
      score: this.score,
      level: this.level,
      lines: this.linesCleared,
      combo: Math.max(0, this.combo),
      maxCombo: this.maxCombo,
      nextPiece: this.nextType,
      holdPiece: this.holdType || '',
      gameOver: this.gameOverFlag,
      started: this.started,
      difficulty: this.difficulty,
      singles: this.singles,
      doubles: this.doubles,
      triples: this.triples,
      tetrises: this.tetrises,
      tSpins: this.tSpins,
    });
  }

  /* ── Session / Score submission ── */
  private async startSession() {
    try {
      const r = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ game: 'tetris' }),
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
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const payload: any = {
        game: 'tetris',
        score: this.score,
        meta: {
          difficulty: this.difficulty,
          level: this.level,
          linesCleared: this.linesCleared,
          maxCombo: this.maxCombo,
          tetrisCount: this.tetrises,
          singles: this.singles,
          doubles: this.doubles,
          triples: this.triples,
          durationSec: elapsed,
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

  shutdown() {
    for (const { event, fn } of this.eventHandlers) {
      window.removeEventListener(event, fn);
    }
    this.eventHandlers = [];
    for (const p of this.scorePopups) p.text.destroy();
    this.scorePopups = [];
  }
}
