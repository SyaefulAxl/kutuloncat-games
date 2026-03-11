import Phaser from 'phaser';

/* ── Shared state for React UI ── */
export interface ArcheryGameState {
  score: number;
  round: number;
  totalRounds: number;
  arrowsLeft: number; /* ammo remaining */
  wind: { direction: 'left' | 'right'; strength: number };
  lastHit: { ring: string; points: number } | null;
  combo: number;
  maxCombo: number;
  gameOver: boolean;
  started: boolean;
  difficulty: ArcheryDifficulty;
  power: number; /* reload progress 0-100 */
  aiming: boolean;
  bullseyes: number; /* headshots */
  totalHits: number;
  misses: number;
}

export type ArcheryDifficulty = 'gampang' | 'sedang' | 'susah' | 'gak-ngotak';

/* ── Difficulty configs ── */
interface DiffConfig {
  ammoPerRound: number;
  reloadMs: number;
  targetShowMs: number; /* base time targets are visible */
  maxTargetsAtOnce: number;
  spawnIntervalMs: number; /* time between spawns */
  targetsPerRound: number;
  hasCivilians: boolean;
  civilianChance: number;
  hasBonusTargets: boolean;
  bonusChance: number;
  targetMoving: boolean;
  moveSpeed: number;
  scoreMultiplier: number; /* difficulty-based score multiplier */
  label: string;
}

const DIFFICULTY: Record<ArcheryDifficulty, DiffConfig> = {
  gampang: {
    ammoPerRound: 18,
    reloadMs: 250,
    targetShowMs: 2800,
    maxTargetsAtOnce: 2,
    spawnIntervalMs: 1400,
    targetsPerRound: 8,
    hasCivilians: false,
    civilianChance: 0,
    hasBonusTargets: true,
    bonusChance: 0.15,
    targetMoving: false,
    moveSpeed: 0,
    scoreMultiplier: 0.5,
    label: 'Gampang',
  },
  sedang: {
    ammoPerRound: 15,
    reloadMs: 300,
    targetShowMs: 2200,
    maxTargetsAtOnce: 3,
    spawnIntervalMs: 1100,
    targetsPerRound: 10,
    hasCivilians: true,
    civilianChance: 0.12,
    hasBonusTargets: true,
    bonusChance: 0.12,
    targetMoving: true,
    moveSpeed: 0.6,
    scoreMultiplier: 0.8,
    label: 'Sedang',
  },
  susah: {
    ammoPerRound: 12,
    reloadMs: 350,
    targetShowMs: 1600,
    maxTargetsAtOnce: 3,
    spawnIntervalMs: 900,
    targetsPerRound: 12,
    hasCivilians: true,
    civilianChance: 0.22,
    hasBonusTargets: true,
    bonusChance: 0.08,
    targetMoving: true,
    moveSpeed: 1.0,
    scoreMultiplier: 1.3,
    label: 'Susah',
  },
  'gak-ngotak': {
    ammoPerRound: 10,
    reloadMs: 400,
    targetShowMs: 1200,
    maxTargetsAtOnce: 4,
    spawnIntervalMs: 700,
    targetsPerRound: 14,
    hasCivilians: true,
    civilianChance: 0.3,
    hasBonusTargets: true,
    bonusChance: 0.06,
    targetMoving: true,
    moveSpeed: 1.8,
    scoreMultiplier: 1.8,
    label: 'Gak Ngotak',
  },
};

const TOTAL_ROUNDS = 10;

/* ── Lane definitions (near / mid / far) ── */
interface LaneDef {
  y: number; /* fraction of canvas height for feet */
  scale: number; /* size multiplier (far = smaller) */
  points: number; /* base points */
  name: string;
}

const LANES: LaneDef[] = [
  { y: 0.82, scale: 1.0, points: 15, name: 'Dekat' },
  { y: 0.62, scale: 0.7, points: 30, name: 'Sedang' },
  { y: 0.44, scale: 0.48, points: 60, name: 'Jauh' },
];

/* ── Target ── */
type TargetType = 'enemy' | 'bonus' | 'civilian' | 'armored' | 'tiny';

interface Target {
  id: number;
  lane: number; /* 0=near, 1=mid, 2=far */
  x: number; /* center x */
  type: TargetType;
  timer: number; /* ms remaining visible */
  maxTimer: number;
  popupAnim: number; /* 0→1 pop up from below */
  hit: boolean;
  hitTimer: number; /* fall animation after hit */
  fallDir: number; /* -1 or 1 for fall direction */
  movingDir: number; /* horizontal movement */
  headshot: boolean;
  hp: number; /* armored targets need 2+ hits */
  sizeScale: number; /* 1.0 normal, 0.55 tiny */
}

function emitState(s: ArcheryGameState) {
  (window as any).__archeryState = s;
  window.dispatchEvent(new Event('archery-update'));
}

/* ── The Scene ── */
export class ArcheryScene extends Phaser.Scene {
  private canW = 0;
  private canH = 0;

  /* Crosshair follows pointer */
  private crosshairX = 0;
  private crosshairY = 0;

  /* Targets */
  private targets: Target[] = [];
  private nextTargetId = 0;
  private spawnTimer = 0;
  private targetsSpawned = 0;

  /* Ammo & reload */
  private ammo = 0;
  private reloading = false;
  private reloadTimer = 0;

  /* Muzzle flash */
  private muzzleFlashTimer = 0;
  private muzzleX = 0;
  private muzzleY = 0;

  /* Game state */
  private score = 0;
  private round = 1;
  private combo = 0;
  private maxCombo = 0;
  private headshots = 0;
  private totalHits = 0;
  private misses = 0;
  private civilianHits = 0;
  private gameOverFlag = false;
  private started = false;
  private startTime = 0;
  private lastHit: { ring: string; points: number } | null = null;

  /* Difficulty */
  private difficulty: ArcheryDifficulty = 'sedang';
  private cfg!: DiffConfig;

  /* Graphics */
  private gfx!: Phaser.GameObjects.Graphics;

  /* Text popups */
  private popups: { text: Phaser.GameObjects.Text; life: number }[] = [];

  /* Round transition */
  private roundTransition = 0;
  private waitingForNextRound = false;
  private roundCleared = false;
  private roundText: Phaser.GameObjects.Text | null = null;

  /* Screen shake */
  private shakeTimer = 0;
  private shakeIntensity = 0;

  /* Screen flash (red for civilian, white for headshot) */
  private screenFlashTimer = 0;
  private screenFlashColor = 0xffffff;
  private screenFlashMaxTime = 200;

  /* Session */
  private sessionCtx: {
    sessionId?: string;
    startedAt?: number;
    token?: string;
  } | null = null;

  /* Event cleanup */
  private eventHandlers: { event: string; fn: EventListener }[] = [];

  /* Animated background */
  private clouds: {
    x: number;
    y: number;
    w: number;
    h: number;
    speed: number;
    opacity: number;
  }[] = [];
  private bgTimeOfDay = 0; /* 0→1 cycles through day/night */
  private bgTimeDir = 1;

  /* Particles (sparks, shell casings, bullet trails) */
  private particles: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: number;
    size: number;
    type: 'spark' | 'shell' | 'trail';
  }[] = [];

  constructor() {
    super({ key: 'ArcheryScene' });
  }

  create() {
    this.canW = this.scale.width;
    this.canH = this.scale.height;

    this.difficulty =
      ((window as any).__archeryDifficulty as ArcheryDifficulty) || 'sedang';
    this.cfg = DIFFICULTY[this.difficulty] || DIFFICULTY.sedang;

    this.gfx = this.add.graphics();

    this.crosshairX = this.canW / 2;
    this.crosshairY = this.canH / 2;

    this.setupRound();
    this.started = false;
    this.gameOverFlag = false;

    /* Initialize clouds */
    this.clouds = [];
    for (let i = 0; i < 6; i++) {
      this.clouds.push({
        x: Math.random() * this.canW * 1.5 - this.canW * 0.25,
        y: this.canH * 0.05 + Math.random() * this.canH * 0.25,
        w: 40 + Math.random() * 80,
        h: 12 + Math.random() * 20,
        speed: 0.15 + Math.random() * 0.3,
        opacity: 0.15 + Math.random() * 0.25,
      });
    }

    /* ── Input ── */
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.crosshairX = p.x;
      this.crosshairY = p.y;
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.crosshairX = p.x;
      this.crosshairY = p.y;

      if (!this.started && !this.gameOverFlag) {
        this.startGame();
        return;
      }
      if (this.gameOverFlag || this.waitingForNextRound) return;
      if (this.reloading || this.ammo <= 0) return;

      this.fireShot(p.x, p.y);
    });

    /* React events */
    const on = (evt: string, fn: EventListener) => {
      window.addEventListener(evt, fn);
      this.eventHandlers.push({ event: evt, fn });
    };

    on('archery-restart', () => this.resetGame());

    on('archery-set-difficulty', ((e: CustomEvent) => {
      const d = e.detail as ArcheryDifficulty;
      if (DIFFICULTY[d] && !this.started) {
        this.difficulty = d;
        this.cfg = DIFFICULTY[d];
        (window as any).__archeryDifficulty = d;
        this.resetGame();
      }
    }) as EventListener);

    this.emitCurrentState();
  }

  /* ── Round setup ── */
  private setupRound() {
    this.targets = [];
    this.targetsSpawned = 0;
    this.spawnTimer = 600; /* small delay before first target */
    this.ammo = this.cfg.ammoPerRound;
    this.reloading = false;
    this.reloadTimer = 0;
    this.waitingForNextRound = false;
    this.roundCleared = false;
    this.lastHit = null;
  }

  /* ── Spawn target ── */
  private spawnTarget() {
    if (this.targetsSpawned >= this.cfg.targetsPerRound) return;

    /* Count active (non-hit) targets */
    const active = this.targets.filter(
      (t) => !t.hit && t.popupAnim >= 0.5,
    ).length;
    if (active >= this.cfg.maxTargetsAtOnce) return;

    /* Pick lane — prefer lanes without active targets */
    const usedLanes = new Set(
      this.targets.filter((t) => !t.hit && t.timer > 0).map((t) => t.lane),
    );
    let lane: number;
    const availLanes = [0, 1, 2].filter((l) => !usedLanes.has(l));
    if (availLanes.length > 0) {
      lane = availLanes[Math.floor(Math.random() * availLanes.length)];
    } else {
      lane = Math.floor(Math.random() * 3);
    }

    /* Determine type */
    let type: TargetType = 'enemy';
    const roll = Math.random();
    if (this.cfg.hasCivilians && roll < this.cfg.civilianChance) {
      type = 'civilian';
    } else if (
      this.cfg.hasBonusTargets &&
      roll < this.cfg.civilianChance + this.cfg.bonusChance
    ) {
      type = 'bonus';
    } else if (this.round >= 3 && roll > 0.85) {
      /* Armored enemies from round 3+ */
      type = 'armored';
    } else if (this.round >= 4 && roll > 0.78 && roll <= 0.85) {
      /* Tiny targets from round 4+ = high risk/reward */
      type = 'tiny';
    }

    /* Position: random x within lane bounds */
    const laneScale = LANES[lane].scale;
    const silhouetteW = 30 * laneScale;
    const margin = silhouetteW + 15;
    const x = margin + Math.random() * (this.canW - margin * 2);

    /* Visible time scales with round (gets harder fast) */
    const roundScaler = 1 - (this.round - 1) * 0.06;
    const showMs = this.cfg.targetShowMs * Math.max(0.35, roundScaler);

    const movDir = this.cfg.targetMoving
      ? (Math.random() < 0.5 ? -1 : 1) * this.cfg.moveSpeed
      : 0;

    this.targets.push({
      id: this.nextTargetId++,
      lane,
      x,
      type,
      timer: showMs,
      maxTimer: showMs,
      popupAnim: 0,
      hit: false,
      hitTimer: 0,
      fallDir: Math.random() < 0.5 ? -1 : 1,
      movingDir: movDir,
      headshot: false,
      hp: type === 'armored' ? 2 : 1,
      sizeScale: type === 'tiny' ? 0.55 : 1.0,
    });

    this.targetsSpawned++;
  }

  /* ── Shooting ── */
  private fireShot(px: number, py: number) {
    this.ammo--;
    this.reloading = true;
    this.reloadTimer = this.cfg.reloadMs;

    /* Muzzle flash */
    this.muzzleFlashTimer = 80;
    this.muzzleX = this.canW / 2;
    this.muzzleY = this.canH - 10;

    /* Shell casing particle */
    this.particles.push({
      x: this.canW / 2 + 12,
      y: this.canH - 20,
      vx: 2 + Math.random() * 3,
      vy: -3 - Math.random() * 2,
      life: 500,
      maxLife: 500,
      color: 0xddaa44,
      size: 3,
      type: 'shell',
    });

    /* Bullet trail */
    this.particles.push({
      x: this.canW / 2,
      y: this.canH - 15,
      vx: (px - this.canW / 2) * 0.04,
      vy: (py - this.canH + 15) * 0.04,
      life: 150,
      maxLife: 150,
      color: 0xffffaa,
      size: 1.5,
      type: 'trail',
    });

    /* Check hit — iterate targets from front (near) to back (far) */
    /* Sort by lane ascending (near first) so near targets block far ones */
    const sortedTargets = [...this.targets]
      .filter((t) => !t.hit && t.popupAnim > 0.3)
      .sort((a, b) => a.lane - b.lane);

    let hitTarget: Target | null = null;
    for (const t of sortedTargets) {
      if (this.isHitOnTarget(px, py, t)) {
        hitTarget = t;
        break;
      }
    }

    if (hitTarget) {
      hitTarget.hp--;

      const laneDef = LANES[hitTarget.lane];

      /* Check headshot */
      const headY = this.getTargetHeadY(hitTarget);
      const headR = 10 * laneDef.scale * hitTarget.sizeScale;
      const dHead = Math.sqrt((px - hitTarget.x) ** 2 + (py - headY) ** 2);
      hitTarget.headshot = dHead <= headR * 1.3;

      /* Headshot on armored = instant kill */
      if (hitTarget.headshot && hitTarget.hp > 0) hitTarget.hp = 0;

      /* Mark hit only when hp depleted */
      if (hitTarget.hp <= 0) {
        hitTarget.hit = true;
        hitTarget.hitTimer = 400;
        /* Hit sparks */
        for (let i = 0; i < 6; i++) {
          this.particles.push({
            x: px,
            y: py,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5 - 1,
            life: 300 + Math.random() * 200,
            maxLife: 500,
            color: hitTarget.headshot ? 0xffd700 : 0xff8844,
            size: 2 + Math.random() * 2,
            type: 'spark',
          });
        }
      }

      if (hitTarget.type === 'civilian') {
        /* Penalty! */
        const penalty = 50;
        this.score = Math.max(0, this.score - penalty);
        this.civilianHits++;
        this.combo = 0;
        this.lastHit = { ring: 'Civilian!', points: -penalty };
        this.showPopup(`-${penalty} Civilian!`, px, py - 20, '#FF2222');

        this.screenFlashTimer = 300;
        this.screenFlashColor = 0xff0000;
        this.screenFlashMaxTime = 300;

        this.shakeTimer = 200;
        this.shakeIntensity = 5;
      } else if (hitTarget.hp > 0) {
        /* Armored: damaged but not dead */
        this.showPopup('Armor!', px, py - 20, '#AAAACC');
        this.shakeTimer = 40;
        this.shakeIntensity = 2;
        this.lastHit = { ring: 'Armor hit', points: 0 };
      } else {
        /* Enemy / bonus / armored(killed) / tiny hit */
        let pts = laneDef.points;
        let label = laneDef.name;

        if (hitTarget.headshot) {
          pts = Math.round(pts * 2.5);
          label = 'Headshot!';
          this.headshots++;

          this.screenFlashTimer = 150;
          this.screenFlashColor = 0xffd700;
          this.screenFlashMaxTime = 150;
          this.shakeTimer = 120;
          this.shakeIntensity = 4;
        }

        if (hitTarget.type === 'bonus') {
          pts = Math.round(pts * 2);
          label = hitTarget.headshot ? 'BONUS Headshot!' : 'Bonus!';
        } else if (hitTarget.type === 'armored') {
          pts = Math.round(pts * 1.8);
          label = hitTarget.headshot ? 'Armor Headshot!' : 'Armor Kill!';
        } else if (hitTarget.type === 'tiny') {
          pts = Math.round(pts * 3);
          label = hitTarget.headshot ? 'SNIPER Headshot!' : 'Sniper!';
        }

        /* Combo */
        this.combo++;
        if (this.combo >= 3) {
          pts = Math.round(pts * (1 + (this.combo - 2) * 0.2));
        }
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;

        /* Round bonus */
        pts = Math.round(pts * (1 + (this.round - 1) * 0.08));

        /* Speed bonus: faster reaction = more points */
        const timeFrac = hitTarget.timer / hitTarget.maxTimer;
        if (timeFrac > 0.6) {
          pts += Math.round(laneDef.points * 0.4);
        }

        /* Difficulty multiplier */
        pts = Math.round(pts * this.cfg.scoreMultiplier);

        this.score += pts;
        this.totalHits++;
        this.lastHit = { ring: label, points: pts };

        const color = hitTarget.headshot
          ? '#FFD700'
          : hitTarget.type === 'bonus'
            ? '#FF8800'
            : hitTarget.type === 'tiny'
              ? '#00FFAA'
              : hitTarget.type === 'armored'
                ? '#AADDFF'
                : '#FFFFFF';
        const comboStr = this.combo >= 3 ? ` 🔥x${this.combo}` : '';
        this.showPopup(`+${pts} ${label}${comboStr}`, px, py - 25, color);

        if (!hitTarget.headshot) {
          this.shakeTimer = 50;
          this.shakeIntensity = 2;
        }
      }
    } else {
      /* Missed */
      this.misses++;
      this.combo = 0;
      this.lastHit = { ring: 'Miss', points: 0 };
    }

    this.emitCurrentState();
  }

  /* ── Hit detection ── */
  private isHitOnTarget(px: number, py: number, t: Target): boolean {
    const laneDef = LANES[t.lane];
    const s = laneDef.scale * t.sizeScale;
    const baseY = this.canH * laneDef.y;

    /* Silhouette bounding box (approximate) */
    const bodyW = 26 * s;
    const bodyH = 50 * s;

    /* Anim offset (popping up from below) */
    const animOffset = (1 - t.popupAnim) * bodyH * 1.5;
    const feetY = baseY + animOffset;
    const topY = feetY - bodyH;

    return px >= t.x - bodyW && px <= t.x + bodyW && py >= topY && py <= feetY;
  }

  private getTargetHeadY(t: Target): number {
    const laneDef = LANES[t.lane];
    const s = laneDef.scale * t.sizeScale;
    const baseY = this.canH * laneDef.y;
    const bodyH = 50 * s;
    const animOffset = (1 - t.popupAnim) * bodyH * 1.5;
    const feetY = baseY + animOffset;
    return feetY - bodyH + 6 * s;
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
    this.round = 1;
    this.combo = 0;
    this.maxCombo = 0;
    this.headshots = 0;
    this.totalHits = 0;
    this.misses = 0;
    this.civilianHits = 0;
    this.gameOverFlag = false;
    this.started = false;
    this.reloading = false;
    this.reloadTimer = 0;
    this.muzzleFlashTimer = 0;
    this.lastHit = null;
    this.sessionCtx = null;
    this.roundTransition = 0;
    this.waitingForNextRound = false;
    this.roundCleared = false;
    this.screenFlashTimer = 0;
    this.shakeTimer = 0;
    this.nextTargetId = 0;
    this.particles = [];
    this.cfg = DIFFICULTY[this.difficulty] || DIFFICULTY.sedang;
    for (const p of this.popups) p.text.destroy();
    this.popups = [];
    if (this.roundText) {
      this.roundText.destroy();
      this.roundText = null;
    }
    this.setupRound();
    this.emitCurrentState();
  }

  private endGame() {
    this.gameOverFlag = true;
    this.submitScore();
    this.emitCurrentState();
  }

  private nextRound() {
    if (this.round >= TOTAL_ROUNDS) {
      this.endGame();
      return;
    }
    this.round++;
    this.setupRound();
    this.showRoundText();
  }

  private showRoundText() {
    if (this.roundText) this.roundText.destroy();
    const warning =
      this.round === 3
        ? '\n⚠️ Target Lapis Baja!'
        : this.round === 4
          ? '\n🎯 Target Mini muncul!'
          : this.round >= 8
            ? '\n💀 Ronde terakhir...'
            : '';
    this.roundText = this.add
      .text(
        this.canW / 2,
        this.canH / 2,
        `Ronde ${this.round}/${TOTAL_ROUNDS}${warning}`,
        {
          fontFamily: '"Segoe UI", Arial, sans-serif',
          fontSize: `${Math.min(32, this.canW / 11)}px`,
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 5,
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(20)
      .setAlpha(1);

    this.tweens.add({
      targets: this.roundText,
      alpha: 0,
      y: this.canH / 2 - 40,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => {
        if (this.roundText) {
          this.roundText.destroy();
          this.roundText = null;
        }
      },
    });
  }

  private showPopup(text: string, x: number, y: number, color: string) {
    const fontSize = Math.min(22, this.canW / 15);
    const txt = this.add
      .text(x, y, text, {
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontSize: `${fontSize}px`,
        color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(15);
    this.popups.push({ text: txt, life: 1400 });
  }

  /* ── Main update ── */
  private sceneReadyFired = false;

  update(_time: number, delta: number) {
    if (!this.sceneReadyFired) {
      this.sceneReadyFired = true;
      window.dispatchEvent(new Event('archery-scene-ready'));
    }
    const dt = delta / 16.67;

    if (!this.started || this.gameOverFlag) {
      this.draw();
      return;
    }

    /* Reload timer */
    if (this.reloading) {
      this.reloadTimer -= delta;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.reloadTimer = 0;
      }
    }

    /* Muzzle flash */
    if (this.muzzleFlashTimer > 0) this.muzzleFlashTimer -= delta;

    /* Screen flash */
    if (this.screenFlashTimer > 0) this.screenFlashTimer -= delta;

    /* Spawn targets */
    if (this.targetsSpawned < this.cfg.targetsPerRound) {
      this.spawnTimer -= delta;
      if (this.spawnTimer <= 0) {
        this.spawnTarget();
        /* Vary spawn interval slightly */
        const jitter = 0.7 + Math.random() * 0.6;
        this.spawnTimer = this.cfg.spawnIntervalMs * jitter;
      }
    }

    /* Update targets */
    for (const t of this.targets) {
      if (t.hit) {
        t.hitTimer -= delta;
        continue;
      }

      /* Pop up animation */
      if (t.popupAnim < 1) {
        t.popupAnim = Math.min(1, t.popupAnim + delta * 0.004);
      }

      /* Countdown */
      t.timer -= delta;

      /* Horizontal movement */
      if (t.movingDir !== 0) {
        const laneDef = LANES[t.lane];
        const bodyW = 26 * laneDef.scale;
        t.x += t.movingDir * dt;
        /* Bounce off edges */
        if (t.x < bodyW + 10) {
          t.x = bodyW + 10;
          t.movingDir *= -1;
        }
        if (t.x > this.canW - bodyW - 10) {
          t.x = this.canW - bodyW - 10;
          t.movingDir *= -1;
        }
      }

      /* Timer expired — target escaped */
      if (t.timer <= 0 && !t.hit) {
        t.hit = true;
        t.hitTimer = 0; /* Disappear instantly (not shot) */
        if (t.type !== 'civilian') {
          /* Missed an enemy = penalty */
          this.misses++;
          this.combo = 0;
        }
      }
    }

    /* Clean up expired targets */
    this.targets = this.targets.filter(
      (t) => !(t.hit && t.hitTimer <= 0) || t.popupAnim < 1,
    );
    /* Also remove targets that have completed their hit animation */
    this.targets = this.targets.filter((t) => {
      if (t.hit && t.hitTimer <= -200) return false;
      if (t.hit && t.hitTimer <= 0 && t.timer <= 0) return false;
      return true;
    });

    /* Check round end */
    if (
      !this.roundCleared &&
      this.targetsSpawned >= this.cfg.targetsPerRound &&
      this.targets.every((t) => t.hit)
    ) {
      this.roundCleared = true;
      this.waitingForNextRound = true;
      this.roundTransition = 1200;
    }

    /* Also end round if out of ammo and no active targets to wait for */
    if (
      !this.roundCleared &&
      this.ammo <= 0 &&
      !this.reloading &&
      this.targets.every((t) => t.hit || t.timer <= 0)
    ) {
      this.roundCleared = true;
      this.waitingForNextRound = true;
      this.roundTransition = 1200;
    }

    /* Round transition */
    if (this.waitingForNextRound) {
      this.roundTransition -= delta;
      if (this.roundTransition <= 0) {
        this.waitingForNextRound = false;
        this.nextRound();
      }
    }

    /* Popups */
    for (const p of this.popups) {
      p.life -= delta;
      p.text.y -= 0.5 * dt;
      p.text.setScale(Math.min(1, 0.4 + (p.life / 1400) * 0.6));
      p.text.alpha = Math.max(0, p.life / 1400);
      if (p.life <= 0) p.text.destroy();
    }
    this.popups = this.popups.filter((p) => p.life > 0);

    /* Screen shake */
    if (this.shakeTimer > 0) this.shakeTimer -= delta;

    /* Particles */
    for (const pt of this.particles) {
      pt.life -= delta;
      pt.x += pt.vx * (delta / 16);
      pt.y += pt.vy * (delta / 16);
      if (pt.type === 'shell') pt.vy += 0.2 * (delta / 16);
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);

    this.emitCurrentState();
    this.draw();
  }

  /* ── Drawing ── */
  private draw() {
    this.gfx.clear();

    let sx = 0,
      sy = 0;
    if (this.shakeTimer > 0) {
      const i = this.shakeIntensity * (this.shakeTimer / 200);
      sx = Math.round((Math.random() - 0.5) * i * 2);
      sy = Math.round((Math.random() - 0.5) * i * 2);
    }

    this.drawBackground(sx, sy);
    this.drawTargets(sx, sy);
    this.drawHUD(sx, sy);
    this.drawCrosshair(sx, sy);
    this.drawEffects(sx, sy);
    this.drawOverlays();
  }

  private drawBackground(sx: number, sy: number) {
    const w = this.canW;
    const h = this.canH;

    /* Day/night cycle: 0=night, 0.5=day, 1=night */
    if (this.started) {
      this.bgTimeOfDay += 0.0002 * this.bgTimeDir;
      if (this.bgTimeOfDay >= 1) {
        this.bgTimeOfDay = 1;
        this.bgTimeDir = -1;
      }
      if (this.bgTimeOfDay <= 0) {
        this.bgTimeOfDay = 0;
        this.bgTimeDir = 1;
      }
    }
    const dayFrac = Math.sin(this.bgTimeOfDay * Math.PI); /* 0=dark, 1=bright */

    /* Sky — interpolate between night and day colors */
    const skyR = Math.round(0x1a + (0x55 - 0x1a) * dayFrac);
    const skyG = Math.round(0x1a + (0x7a - 0x1a) * dayFrac);
    const skyB = Math.round(0x2e + (0xaa - 0x2e) * dayFrac);
    const skyColor = (skyR << 16) | (skyG << 8) | skyB;
    this.gfx.fillStyle(skyColor, 1);
    this.gfx.fillRect(0, 0, w, h);

    /* Horizon glow */
    const glowAlpha = 0.15 + dayFrac * 0.2;
    const glowColor = dayFrac > 0.3 ? 0xffcc66 : 0xff6633;
    this.gfx.fillStyle(glowColor, glowAlpha);
    this.gfx.fillRect(sx, h * 0.3 + sy, w, h * 0.12);

    /* Far wall */
    const wallR = Math.round(0x25 + (0x45 - 0x25) * dayFrac * 0.5);
    const wallG = Math.round(0x25 + (0x40 - 0x25) * dayFrac * 0.5);
    const wallB = Math.round(0x40 + (0x55 - 0x40) * dayFrac * 0.5);
    const wallColor = (wallR << 16) | (wallG << 8) | wallB;
    this.gfx.fillStyle(wallColor, 1);
    this.gfx.fillRect(sx, sy, w, h * 0.38);

    /* Mid section */
    this.gfx.fillStyle(wallColor + 0x050505, 1);
    this.gfx.fillRect(sx, h * 0.38 + sy, w, h * 0.18);

    /* Animated clouds */
    for (const cloud of this.clouds) {
      cloud.x += cloud.speed;
      if (cloud.x > w + cloud.w) cloud.x = -cloud.w;
      const cAlpha = cloud.opacity * (0.5 + dayFrac * 0.5);
      const cColor = dayFrac > 0.3 ? 0xffffff : 0x8888bb;
      this.gfx.fillStyle(cColor, cAlpha);
      /* Draw cloud as overlapping ellipses */
      const cx = cloud.x + sx;
      const cy = cloud.y + sy;
      this.gfx.fillEllipse(cx, cy, cloud.w, cloud.h);
      this.gfx.fillEllipse(
        cx - cloud.w * 0.3,
        cy + cloud.h * 0.15,
        cloud.w * 0.6,
        cloud.h * 0.8,
      );
      this.gfx.fillEllipse(
        cx + cloud.w * 0.25,
        cy - cloud.h * 0.1,
        cloud.w * 0.5,
        cloud.h * 0.7,
      );
    }

    /* Floor — perspective grid */
    const floorTop = h * 0.56;
    const floorR = Math.round(0x1e + (0x2e - 0x1e) * dayFrac * 0.3);
    const floorG = Math.round(0x2e + (0x4e - 0x2e) * dayFrac * 0.3);
    const floorB = Math.round(0x1e + (0x2e - 0x1e) * dayFrac * 0.3);
    const floorColor = (floorR << 16) | (floorG << 8) | floorB;
    this.gfx.fillStyle(floorColor, 1);
    this.gfx.fillRect(sx, floorTop + sy, w, h - floorTop);

    /* Perspective floor lines */
    const vanishY = h * 0.3 + sy;
    const vanishX = w / 2 + sx;
    for (let i = 0; i < 8; i++) {
      const frac = i / 7;
      const startX = frac * w + sx;
      this.gfx.lineStyle(1, 0x2a4a2a, 0.2);
      this.gfx.lineBetween(startX, h + sy, vanishX, vanishY);
    }
    /* Horizontal floor lines */
    for (let i = 0; i < 5; i++) {
      const y = floorTop + (h - floorTop) * (i / 5) * (i / 5) + sy;
      this.gfx.lineStyle(1, 0x2a4a2a, 0.15);
      this.gfx.lineBetween(sx, y, w + sx, y);
    }
  }

  private drawTargets(sx: number, sy: number) {
    /* Sort targets by lane (far first = drawn behind) */
    const sorted = [...this.targets].sort((a, b) => b.lane - a.lane);

    for (const t of sorted) {
      this.drawSilhouette(t, sx, sy);
    }
  }

  private drawSilhouette(t: Target, sx: number, sy: number) {
    const laneDef = LANES[t.lane];
    const s = laneDef.scale * t.sizeScale;
    const baseY = this.canH * laneDef.y;

    /* Size */
    const headR = 8 * s;
    const bodyW = 22 * s;
    const bodyH = 36 * s;
    const totalH = headR * 2 + bodyH;

    /* Animation offset */
    let animOffset = (1 - Math.min(1, t.popupAnim * 1.2)) * totalH * 1.3;

    /* Fall animation when hit */
    let fallAngle = 0;
    if (t.hit && t.hitTimer > 0) {
      const fallFrac = 1 - t.hitTimer / 400;
      fallAngle = fallFrac * t.fallDir * 1.2;
      animOffset += fallFrac * totalH * 0.3;
    } else if (t.hit) {
      return; /* Fully fallen, don't draw */
    }

    const feetY = baseY + animOffset + sy;
    const centerX = t.x + sx;

    /* Timer urgency flash (blinks when about to disappear) */
    let urgencyAlpha = 0;
    if (!t.hit && t.timer < 600 && t.timer > 0) {
      urgencyAlpha = Math.sin(t.timer * 0.02) > 0 ? 0.4 : 0;
    }

    /* Color based on type */
    let bodyColor: number;
    let headColor: number;
    let outlineColor: number;
    switch (t.type) {
      case 'enemy':
        bodyColor = 0xcc3333;
        headColor = 0xdd4444;
        outlineColor = 0x881111;
        break;
      case 'bonus':
        bodyColor = 0xdd8800;
        headColor = 0xeeaa22;
        outlineColor = 0x886600;
        break;
      case 'civilian':
        bodyColor = 0x3388dd;
        headColor = 0x44aaee;
        outlineColor = 0x225588;
        break;
      case 'armored':
        bodyColor =
          t.hp > 1 ? 0x556677 : 0x884444; /* changes color when damaged */
        headColor = t.hp > 1 ? 0x667788 : 0x995555;
        outlineColor = t.hp > 1 ? 0x445566 : 0x663333;
        break;
      case 'tiny':
        bodyColor = 0x22cc88;
        headColor = 0x33ddaa;
        outlineColor = 0x118855;
        break;
    }

    /* Apply fall rotation via manual transform */
    const g = this.gfx;

    /* Simple body (no actual rotation since Phaser Graphics doesn't support transform) */
    /* We'll simulate fall by shifting x based on angle */
    const fallShiftX = Math.sin(fallAngle) * totalH * 0.5;
    const fallShiftY = (1 - Math.cos(fallAngle)) * totalH * 0.2;
    const cx = centerX + fallShiftX;
    const cy = feetY + fallShiftY;

    /* Shadow on ground */
    if (!t.hit) {
      g.fillStyle(0x000000, 0.15 * s);
      g.fillEllipse(cx, baseY + sy + 2, bodyW * 1.6, 4 * s);
    }

    /* ── Body (torso) ── */
    const torsoTop = cy - bodyH - headR;
    const torsoBot = cy;

    /* Torso shape — trapezoid (wider at shoulders) */
    const shoulderW = bodyW;
    const waistW = bodyW * 0.65;

    g.fillStyle(bodyColor, 1);
    g.beginPath();
    g.moveTo(cx - shoulderW, torsoTop + headR * 0.5);
    g.lineTo(cx + shoulderW, torsoTop + headR * 0.5);
    g.lineTo(cx + waistW, torsoBot);
    g.lineTo(cx - waistW, torsoBot);
    g.closePath();
    g.fillPath();

    /* Arms */
    const armW = 6 * s;
    g.fillStyle(bodyColor, 0.9);
    g.fillRect(
      cx - shoulderW - armW,
      torsoTop + headR * 0.5,
      armW,
      bodyH * 0.6,
    );
    g.fillRect(cx + shoulderW, torsoTop + headR * 0.5, armW, bodyH * 0.6);

    /* Legs */
    const legW = 8 * s;
    const legH = bodyH * 0.15;
    g.fillStyle(bodyColor, 0.85);
    g.fillRect(cx - legW - 2 * s, torsoBot, legW, legH);
    g.fillRect(cx + 2 * s, torsoBot, legW, legH);

    /* Outline */
    g.lineStyle(1.5 * s, outlineColor, 0.6);
    g.beginPath();
    g.moveTo(cx - shoulderW, torsoTop + headR * 0.5);
    g.lineTo(cx + shoulderW, torsoTop + headR * 0.5);
    g.lineTo(cx + waistW, torsoBot);
    g.lineTo(cx - waistW, torsoBot);
    g.closePath();
    g.strokePath();

    /* ── Head ── */
    const headY = torsoTop;

    g.fillStyle(headColor, 1);
    g.fillCircle(cx, headY, headR);
    g.lineStyle(1.5 * s, outlineColor, 0.5);
    g.strokeCircle(cx, headY, headR);

    /* Eyes (small dots for face) */
    const eyeSize = Math.max(1, 1.5 * s);
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(cx - headR * 0.35, headY - headR * 0.15, eyeSize);
    g.fillCircle(cx + headR * 0.35, headY - headR * 0.15, eyeSize);

    /* Headshot indicator — small target on head for enemies */
    if (t.type === 'enemy' && !t.hit && t.popupAnim >= 1) {
      g.lineStyle(1, 0xffffff, 0.15);
      g.strokeCircle(cx, headY, headR * 1.2);
    }

    /* Type indicator — icon on body */
    if (t.type === 'civilian' && !t.hit) {
      /* X pattern on civilian body */
      const iconS = 6 * s;
      const iconY = torsoTop + bodyH * 0.35;
      g.lineStyle(2 * s, 0xffffff, 0.5);
      g.lineBetween(cx - iconS, iconY - iconS, cx + iconS, iconY + iconS);
      g.lineBetween(cx + iconS, iconY - iconS, cx - iconS, iconY + iconS);
    } else if (t.type === 'bonus' && !t.hit) {
      /* Star-ish mark on bonus */
      const starY = torsoTop + bodyH * 0.35;
      const starR = 5 * s;
      g.fillStyle(0xffdd00, 0.6);
      g.fillCircle(cx, starY, starR);
    } else if (t.type === 'armored' && !t.hit) {
      /* Shield mark on armored */
      const shieldY = torsoTop + bodyH * 0.35;
      const shieldR = 6 * s;
      g.lineStyle(2 * s, 0xffffff, 0.4);
      g.strokeCircle(cx, shieldY, shieldR);
      if (t.hp > 1) {
        g.strokeCircle(cx, shieldY, shieldR * 0.5);
      }
    } else if (t.type === 'tiny' && !t.hit) {
      /* Diamond mark on tiny */
      const diaY = torsoTop + bodyH * 0.35;
      const diaR = 4 * s;
      g.fillStyle(0x00ffaa, 0.5);
      g.beginPath();
      g.moveTo(cx, diaY - diaR);
      g.lineTo(cx + diaR, diaY);
      g.lineTo(cx, diaY + diaR);
      g.lineTo(cx - diaR, diaY);
      g.closePath();
      g.fillPath();
    }

    /* Hit X mark */
    if (t.hit && t.hitTimer > 0) {
      const alpha = t.hitTimer / 400;
      const markSize = 12 * s;
      const markY = torsoTop + bodyH * 0.3;
      if (t.headshot) {
        g.lineStyle(3 * s, 0xffd700, alpha);
        g.strokeCircle(cx, headY, headR * 1.5);
      } else {
        g.lineStyle(3 * s, 0xff4444, alpha);
        g.lineBetween(
          cx - markSize,
          markY - markSize,
          cx + markSize,
          markY + markSize,
        );
        g.lineBetween(
          cx + markSize,
          markY - markSize,
          cx - markSize,
          markY + markSize,
        );
      }
    }

    /* Timer bar below target */
    if (!t.hit && t.popupAnim >= 0.8) {
      const barW = bodyW * 2;
      const barH = 3 * s;
      const barX = cx - barW / 2;
      const barY = cy + 4;
      const frac = Math.max(0, t.timer / t.maxTimer);

      g.fillStyle(0x000000, 0.3);
      g.fillRect(barX, barY, barW, barH);

      const barColor = frac > 0.4 ? 0x44ff44 : frac > 0.2 ? 0xffaa00 : 0xff3333;
      g.fillStyle(barColor, 0.7);
      g.fillRect(barX, barY, barW * frac, barH);
    }

    /* Urgency flash overlay */
    if (urgencyAlpha > 0) {
      g.fillStyle(0xff0000, urgencyAlpha);
      g.fillCircle(cx, torsoTop + bodyH * 0.4, bodyW);
    }
  }

  private drawHUD(_sx: number, _sy: number) {
    const g = this.gfx;

    /* Ammo display - bottom center */
    if (this.started && !this.gameOverFlag) {
      const ammoY = this.canH - 28;
      const dotR = 3;
      const dotGap = 9;
      const totalW = Math.min(this.cfg.ammoPerRound, 20) * dotGap;
      const startX = this.canW / 2 - totalW / 2;

      for (let i = 0; i < Math.min(this.cfg.ammoPerRound, 20); i++) {
        const x = startX + i * dotGap;
        if (i < this.ammo) {
          g.fillStyle(0xffdd44, 0.8);
          g.fillCircle(x, ammoY, dotR);
        } else {
          g.fillStyle(0x333344, 0.4);
          g.fillCircle(x, ammoY, dotR * 0.6);
        }
      }

      /* Accuracy bar - top right corner */
      const totalShots = this.totalHits + this.misses;
      if (totalShots > 0) {
        const acc = Math.round((this.totalHits / totalShots) * 100);
        const barW = 40;
        const barH = 4;
        const barX = this.canW - barW - 8;
        const barY = 8;
        const frac = acc / 100;

        g.fillStyle(0x000000, 0.3);
        g.fillRoundedRect(barX, barY, barW, barH, 2);
        const accColor = acc >= 70 ? 0x44ff44 : acc >= 40 ? 0xffaa00 : 0xff3333;
        g.fillStyle(accColor, 0.7);
        g.fillRoundedRect(barX, barY, barW * frac, barH, 2);
      }

      /* Reload bar */
      if (this.reloading) {
        const barW = 40;
        const barH = 3;
        const barX = this.canW / 2 - barW / 2;
        const barY = ammoY - 10;
        const frac = 1 - this.reloadTimer / this.cfg.reloadMs;

        g.fillStyle(0x000000, 0.4);
        g.fillRect(barX, barY, barW, barH);
        g.fillStyle(0x88aaff, 0.7);
        g.fillRect(barX, barY, barW * frac, barH);
      }
    }
  }

  private drawCrosshair(sx: number, sy: number) {
    if (!this.started || this.gameOverFlag) return;

    const chx = this.crosshairX + sx;
    const chy = this.crosshairY + sy;
    const size = 18;
    const gap = 5;
    const isReloading = this.reloading;

    const color = isReloading ? 0x666688 : 0xff3333;
    const alpha = isReloading ? 0.4 : 0.85;

    /* Outer circle */
    this.gfx.lineStyle(1.5, color, alpha * 0.4);
    this.gfx.strokeCircle(chx, chy, size + 5);

    /* Cross */
    this.gfx.lineStyle(2, color, alpha);
    this.gfx.lineBetween(chx, chy - size, chx, chy - gap);
    this.gfx.lineBetween(chx, chy + gap, chx, chy + size);
    this.gfx.lineBetween(chx - size, chy, chx - gap, chy);
    this.gfx.lineBetween(chx + gap, chy, chx + size, chy);

    /* Center dot */
    this.gfx.fillStyle(color, alpha);
    this.gfx.fillCircle(chx, chy, 2);
  }

  private drawEffects(sx: number, sy: number) {
    /* Muzzle flash */
    if (this.muzzleFlashTimer > 0) {
      const alpha = (this.muzzleFlashTimer / 80) * 0.8;
      const flashY = this.canH - 5 + sy;
      const flashX = this.canW / 2 + sx;

      /* Bright center */
      this.gfx.fillStyle(0xffff88, alpha);
      this.gfx.fillCircle(flashX, flashY, 12);
      this.gfx.fillStyle(0xffffff, alpha * 0.6);
      this.gfx.fillCircle(flashX, flashY, 6);

      /* Shot line from muzzle to crosshair */
      this.gfx.lineStyle(1.5, 0xffffff, alpha * 0.3);
      this.gfx.lineBetween(
        flashX,
        flashY,
        this.crosshairX + sx,
        this.crosshairY + sy,
      );
    }

    /* Screen flash */
    if (this.screenFlashTimer > 0) {
      const frac = this.screenFlashTimer / this.screenFlashMaxTime;
      this.gfx.fillStyle(this.screenFlashColor, frac * 0.2);
      this.gfx.fillRect(0, 0, this.canW, this.canH);
    }

    /* Particles (sparks, shells, trails) */
    for (const pt of this.particles) {
      const alpha = Math.max(0, pt.life / pt.maxLife);
      this.gfx.fillStyle(pt.color, alpha);
      if (pt.type === 'trail') {
        this.gfx.fillRect(pt.x + sx - 1, pt.y + sy - 1, 2, 6);
      } else {
        this.gfx.fillCircle(pt.x + sx, pt.y + sy, pt.size * alpha);
      }
    }
  }

  private drawOverlays() {
    if (this.gameOverFlag) {
      this.gfx.fillStyle(0x000000, 0.5);
      this.gfx.fillRect(0, 0, this.canW, this.canH);
    }
    if (!this.started && !this.gameOverFlag) {
      this.gfx.fillStyle(0x000000, 0.15);
      this.gfx.fillRect(0, 0, this.canW, this.canH);
    }
  }

  private emitCurrentState() {
    const reloadProg = this.reloading
      ? Math.round(
          ((this.cfg.reloadMs - this.reloadTimer) / this.cfg.reloadMs) * 100,
        )
      : 100;

    emitState({
      score: this.score,
      round: this.round,
      totalRounds: TOTAL_ROUNDS,
      arrowsLeft: this.ammo,
      wind: { direction: 'right', strength: 0 },
      lastHit: this.lastHit,
      combo: this.combo,
      maxCombo: this.maxCombo,
      gameOver: this.gameOverFlag,
      started: this.started,
      difficulty: this.difficulty,
      power: reloadProg,
      aiming: this.started && !this.gameOverFlag && !this.reloading,
      bullseyes: this.headshots,
      totalHits: this.totalHits,
      misses: this.misses,
    });
  }

  /* ── Session / Score submission ── */
  private async startSession() {
    try {
      const r = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ game: 'archery' }),
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
      const totalShots = this.totalHits + this.misses;
      const avgAccuracy =
        totalShots > 0
          ? Math.round((this.totalHits / totalShots) * 1000) / 10
          : 0;
      const payload: Record<string, unknown> = {
        game: 'archery',
        score: this.score,
        meta: {
          difficulty: this.difficulty,
          rounds: TOTAL_ROUNDS,
          headshots: this.headshots,
          totalHits: this.totalHits,
          misses: this.misses,
          civilianHits: this.civilianHits,
          maxCombo: this.maxCombo,
          avgAccuracy,
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
    for (const p of this.popups) p.text.destroy();
    this.popups = [];
    if (this.roundText) {
      this.roundText.destroy();
      this.roundText = null;
    }
  }
}
