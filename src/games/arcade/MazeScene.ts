import { ArcadeScene, VW, VH, sfx, drawGlow, startSession, submitScore, SessionCtx, isDailyMode, todayDateSeed, mulberry32 } from './kit';

// ── LAHAP LABIRIN — maze-chase ──
// Eat every dot, dodge three ghosts; power pellets turn the tables and
// chained ghost meals pay 200→400→800→1600. Swipe (or arrows) to steer.
const HUD_H = 32, TS = 32;
const MAZE = [
  '################',
  '#o....#..#....o#',
  '#.##.##..##.##.#',
  '#..............#',
  '##.#.##..##.#.##',
  '...#.#....#.#...',
  '##.#.######.#.##',
  '#..............#',
  '#.##.##..##.##.#',
  '#o...#....#...o#',
  '#.##.#.##.#.##.#',
  '#..............#',
  '################',
];
const COLS = 16, ROWS = 13;
// pen interior + door: walkable but never carries dots
const NO_DOT = new Set(['6,5', '7,5', '8,5', '9,5', '7,4', '8,4']);
const DIRS: Record<string, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const GHOST_COLORS = [0xff4444, 0xff5cc8, 0x44e0ff];
type Personality = 'chase' | 'ambush' | 'flee' | 'random';
const GHOST_PERSONALITIES: Personality[] = ['chase', 'ambush', 'flee'];

// Alternate layouts — row 3 and row 7 are fully open "spine" corridors that
// guarantee the whole board stays connected no matter what the outer bands
// (rows 1-2, 8-9) look like, so these variants are built by safely
// transforming MAZE (mirror / band-swap) rather than hand-authoring new
// grids that could accidentally wall off a dot. The pen (rows 4-6) and
// border are left untouched so ghost spawn/release logic keeps working.
function mirrorH(rows: string[]): string[] {
  return rows.map(r => r.split('').reverse().join(''));
}
function swapBands(rows: string[]): string[] {
  const out = [...rows];
  [out[1], out[9]] = [out[9], out[1]];
  [out[2], out[10]] = [out[10], out[2]];
  return out;
}
interface MazeDef { grid: string[]; tunnels: [[number, number], [number, number]] }
const MAZES: MazeDef[] = [
  { grid: MAZE, tunnels: [[1, 3], [14, 3]] },
  { grid: mirrorH(MAZE), tunnels: [[1, 7], [14, 7]] },
  { grid: swapBands(MAZE), tunnels: [[1, 3], [14, 7]] },
];

// A 4th "super ghost" joins the pack from this level onward — bigger,
// faster, ignores the frightened power-pellet state on the first hit
// (needs two chain hits while frightened to actually go down).
const SUPER_GHOST_FROM_LEVEL = 10;

interface Ent {
  fc: number; fr: number; dc: number; dr: number; t: number;
  want: [number, number];
  fright?: boolean; deadT?: number; color?: number; releaseT?: number;
  personality?: Personality; super?: boolean; superHp?: number;
}

export class MazeScene extends ArcadeScene {
  private gs = 'TITLE';
  private score = 0; private lives = 3; private level = 1;
  private dots = new Set<string>(); private pellets = new Set<string>();
  private pl!: Ent; private ghosts: Ent[] = [];
  private frightT = 0; private chain = 0; private maxChain = 0;
  private dotsEaten = 0; private ghostsEaten = 0;
  // Classic Pac-Man bonus fruit — appears once per level after half the
  // dots are cleared, worth a flat bonus, gone if not collected in time.
  private bonusFruit: { c: number; r: number } | null = null;
  private bonusFruitT = 0;
  private bonusFruitSpawned = false;
  private totalDotsThisLevel = 0;
  private readyT = 0; private stateT = 0;
  private maze: string[] = MAZE;
  private tunnels: [[number, number], [number, number]] = MAZES[0].tunnels;
  private tunnelFlash: { x: number; y: number; t: number }[] = [];
  private startTime = 0; private sess: SessionCtx = null;
  private daily = false; private dailyDate = '';
  // Daily challenge: the maze layout itself is a single fixed grid (no
  // per-run variety), so the only thing worth seeding for a fair "same
  // board today" comparison is ghost movement randomness (chooseGhost()).
  private rng: () => number = Math.random;

  constructor() { super({ key: 'MazeScene' }); }

  private wrapC(c: number) { return ((c % COLS) + COLS) % COLS; }
  private pass(c: number, r: number) {
    if (r < 0 || r >= ROWS) return false;
    return this.maze[r][this.wrapC(c)] !== '#';
  }
  private px(e: Ent) { return (e.fc + e.dc * e.t) * TS + TS / 2; }
  private py(e: Ent) { return HUD_H + (e.fr + e.dr * e.t) * TS + TS / 2; }

  // Teleports an entity that just landed on a tunnel-entry tile to the
  // paired exit, for both the player and ghosts.
  private applyTunnel(e: Ent) {
    for (const [a, b] of [this.tunnels, [this.tunnels[1], this.tunnels[0]] as [[number, number], [number, number]]]) {
      if (e.fc === a[0] && e.fr === a[1]) {
        e.fc = b[0]; e.fr = b[1];
        this.tunnelFlash.push({ x: this.px(e), y: this.py(e), t: 0 });
        sfx.power();
        return;
      }
    }
  }

  private buildBoard() {
    this.rng = this.daily ? mulberry32(todayDateSeed().seed * 37 + this.level) : Math.random;
    const def = MAZES[Math.floor((this.level - 1) / 2) % MAZES.length];
    this.maze = def.grid;
    this.tunnels = def.tunnels;
    this.dots.clear(); this.pellets.clear();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = this.maze[r][c];
      if (ch === 'o') this.pellets.add(c + ',' + r);
      else if (ch === '.' && !NO_DOT.has(c + ',' + r)) this.dots.add(c + ',' + r);
    }
    this.totalDotsThisLevel = this.dots.size;
    this.bonusFruit = null;
    this.bonusFruitT = 0;
    this.bonusFruitSpawned = false;
    this.resetPositions();
  }

  private resetPositions() {
    this.pl = { fc: 7, fr: 11, dc: 0, dr: 0, t: 0, want: [1, 0] };
    // Staggered pen-exit: all 3 ghosts used to release simultaneously.
    // First is free immediately, the others wait their turn in the pen.
    this.ghosts = [6, 7, 9].map((c, i) => ({
      fc: c, fr: 5, dc: 0, dr: 0, t: 0, want: [0, -1], fright: false, deadT: 0,
      color: GHOST_COLORS[i], releaseT: i * 2.5, personality: GHOST_PERSONALITIES[i],
    }));
    if (this.level >= SUPER_GHOST_FROM_LEVEL) {
      this.ghosts.push({
        fc: 8, fr: 5, dc: 0, dr: 0, t: 0, want: [0, -1], fright: false, deadT: 0,
        color: 0x2a1030, releaseT: 4, personality: 'chase', super: true, superHp: 2,
      });
    }
    this.frightT = 0; this.chain = 0;
    this.readyT = 1.2;
  }

  private startGame() {
    this.score = 0; this.lives = 3; this.level = 1;
    this.dotsEaten = 0; this.ghostsEaten = 0; this.maxChain = 0;
    this.daily = isDailyMode(); this.dailyDate = todayDateSeed().date;
    this.startTime = Date.now();
    startSession('maze-chase').then(s => { this.sess = s; });
    sfx.start();
    this.buildBoard();
    this.gs = 'PLAYING';
  }

  private gameOver() {
    this.gs = 'GAME_OVER'; this.stateT = 0;
    sfx.death();
    submitScore('maze-chase', this.score, {
      dots: this.dotsEaten, ghosts: this.ghostsEaten, level: this.level,
      maxGhostChain: this.maxChain, durationSec: Math.floor((Date.now() - this.startTime) / 1000),
      daily: this.daily, dailyDate: this.daily ? this.dailyDate : undefined,
    }, this.sess);
  }

  // advance an entity along the grid; chooser runs at each tile arrival
  private step(e: Ent, tilesPerSec: number, dt: number, choose: (e: Ent) => void) {
    if (e.dc === 0 && e.dr === 0) { choose(e); return; }
    e.t += tilesPerSec * dt;
    if (e.t >= 1) {
      e.t = 0;
      e.fc = this.wrapC(e.fc + e.dc); e.fr += e.dr;
      this.applyTunnel(e);
      choose(e);
    }
  }

  private choosePlayer = (e: Ent) => {
    const [wc, wr] = e.want;
    if (this.pass(e.fc + wc, e.fr + wr)) { e.dc = wc; e.dr = wr; }
    else if (!this.pass(e.fc + e.dc, e.fr + e.dr)) { e.dc = 0; e.dr = 0; }
    this.eatAt(e.fc, e.fr);
  };

  private chooseGhost = (e: Ent) => {
    const opts: [number, number][] = [];
    for (const k of Object.keys(DIRS)) {
      const [dc, dr] = DIRS[k];
      if (dc === -e.dc && dr === -e.dr) continue; // no reversing
      if (this.pass(e.fc + dc, e.fr + dr)) opts.push([dc, dr]);
    }
    if (opts.length === 0) { e.dc = -e.dc; e.dr = -e.dr; return; }
    let pick: [number, number];
    if (e.fright || this.rng() < 0.25) { pick = opts[Math.floor(this.rng() * opts.length)]; e.dc = pick[0]; e.dr = pick[1]; return; }

    // Personalities give each ghost a distinct target tile instead of every
    // ghost minimizing distance to the exact same spot:
    //  - chase: player's current tile (classic Blinky)
    //  - ambush: 4 tiles ahead of the player's current heading (Pinky)
    //  - flee: keeps distance while player is close, chases once far away
    //  - random (fallback/pen-releasing ghosts without a personality): pure chase
    let targetC = this.pl.fc, targetR = this.pl.fr;
    if (e.personality === 'ambush') {
      targetC = this.wrapC(this.pl.fc + this.pl.dc * 4);
      targetR = this.pl.fr + this.pl.dr * 4;
    } else if (e.personality === 'flee') {
      const dPlayer = Math.hypot(e.fc - this.pl.fc, e.fr - this.pl.fr);
      if (dPlayer < 6) {
        // Run to the farthest available option instead of the nearest.
        let worst = -Infinity; pick = opts[0];
        for (const [dc, dr] of opts) {
          const d = Math.hypot(this.wrapC(e.fc + dc) - this.pl.fc, e.fr + dr - this.pl.fr);
          if (d > worst) { worst = d; pick = [dc, dr]; }
        }
        e.dc = pick[0]; e.dr = pick[1]; return;
      }
    }
    let best = Infinity; pick = opts[0];
    for (const [dc, dr] of opts) {
      const d = Math.hypot(this.wrapC(e.fc + dc) - targetC, e.fr + dr - targetR);
      if (d < best) { best = d; pick = [dc, dr]; }
    }
    e.dc = pick[0]; e.dr = pick[1];
  };

  private eatAt(c: number, r: number) {
    const k = c + ',' + r;
    if (this.dots.delete(k)) { this.score += 10; this.dotsEaten++; if (this.dotsEaten % 4 === 0) sfx.pop(); }
    if (this.pellets.delete(k)) {
      this.score += 50; this.frightT = Math.max(3.5, 6 - this.level * 0.3); this.chain = 0;
      for (const gh of this.ghosts) if (!gh.deadT) gh.fright = true;
      sfx.power();
    }
    if (!this.bonusFruitSpawned && this.totalDotsThisLevel > 0 && this.dots.size <= this.totalDotsThisLevel / 2) {
      this.bonusFruitSpawned = true;
      this.bonusFruit = { c: 7, r: 7 };
      this.bonusFruitT = 10;
    }
    if (this.bonusFruit && c === this.bonusFruit.c && r === this.bonusFruit.r) {
      const pts = 200 * this.level;
      this.score += pts;
      this.bonusFruit = null;
      sfx.coin();
      this.spawnParticles(c * TS + TS / 2, HUD_H + r * TS + TS / 2, 0xff5c5c, 12, 80);
    }
    if (this.dots.size === 0 && this.pellets.size === 0) {
      this.score += 500 * this.level;
      this.level++;
      sfx.clear();
      this.buildBoard();
    }
  }

  protected tick(dt: number) {
    sfx.musicTick(this.gs === 'PLAYING', this.lives <= 1 ? 1 : 0, 'maze');
    this.drawSpaceBg(0x03020c, 0x090820, 0x120a28);
    this.g.clear(); this.ui.clear();
    for (const t of this.txts) t.setVisible(false);
    if (this.gs === 'TITLE') this.uTitle();
    else if (this.gs === 'PLAYING') this.uPlay(dt);
    else if (this.gs === 'GAME_OVER') this.uGO(dt);
  }

  private uTitle() {
    this.txt(0).setOrigin(0.5, 0).setFontSize(24).setColor('#ffd23f').setText('LAHAP LABIRIN').setPosition(VW / 2, VH * 0.16).setVisible(true);
    // demo art
    this.g.fillStyle(0xffd23f); this.g.slice(VW / 2 - 60, VH * 0.36 + 10, 12, 0.6, Math.PI * 2 - 0.6); this.g.fillPath();
    this.rGhost(VW / 2, VH * 0.36, 0xff4444, false, 12);
    this.rGhost(VW / 2 + 40, VH * 0.36, 0x44e0ff, false, 12);
    this.txt(1).setOrigin(0.5, 0).setFontSize(8).setColor('#93a8d9').setText('MAKAN SEMUA TITIK - HINDARI HANTU\nPELET BESAR = HANTU BISA DIMAKAN\nRANTAI: 200-400-800-1600!').setAlign('center').setLineSpacing(6).setPosition(VW / 2, VH * 0.48).setVisible(true);
    this.txt(2).setOrigin(0.5, 0).setFontSize(7).setColor('#5f6f9c').setText(this.isTouch ? 'SWIPE = BELOK' : 'PANAH = BELOK').setPosition(VW / 2, VH * 0.66).setVisible(true);
    if (this.blink % 1 < 0.62) this.txt(3).setOrigin(0.5, 0).setFontSize(12).setColor('#7ce3ff').setText(this.isTouch ? 'TAP TO START' : 'PRESS ANY KEY').setPosition(VW / 2, VH * 0.8).setVisible(true);
    if (this.anyPress()) this.startGame();
  }

  private uGO(dt: number) {
    this.stateT += dt;
    this.rBoard();
    this.ui.fillStyle(0x03040c, 0.78); this.ui.fillRect(0, 0, VW, VH);
    this.txt(10).setOrigin(0.5, 0).setFontSize(24).setColor('#ff6b6b').setText('GAME OVER').setPosition(VW / 2, VH * 0.3).setVisible(true);
    this.txt(11).setOrigin(0.5, 0).setFontSize(10).setColor('#f4f8ff').setText('SCORE: ' + this.score).setPosition(VW / 2, VH * 0.46).setVisible(true);
    this.txt(12).setOrigin(0.5, 0).setFontSize(7).setColor('#93a8d9').setText('LEVEL ' + this.level + '  -  ' + this.dotsEaten + ' TITIK  -  ' + this.ghostsEaten + ' HANTU').setPosition(VW / 2, VH * 0.55).setVisible(true);
    if (this.stateT > 1.2 && this.blink % 1 < 0.62) this.txt(13).setOrigin(0.5, 0).setFontSize(9).setColor('#7ce3ff').setText(this.isTouch ? 'TAP TO CONTINUE' : 'PRESS ANY KEY').setPosition(VW / 2, VH * 0.7).setVisible(true);
    if (this.stateT > 1.2 && this.anyPress()) this.gs = 'TITLE';
  }

  private uPlay(dt: number) {
    // input → queued turn
    if (this.kp('ArrowLeft') || this.swipeDir === 'left') this.pl.want = [-1, 0];
    if (this.kp('ArrowRight') || this.swipeDir === 'right') this.pl.want = [1, 0];
    if (this.kp('ArrowUp') || this.swipeDir === 'up') this.pl.want = [0, -1];
    if (this.kp('ArrowDown') || this.swipeDir === 'down') this.pl.want = [0, 1];

    if (this.readyT > 0) { this.readyT -= dt; this.rBoard(); this.rReady(); return; }

    if (this.frightT > 0) {
      this.frightT -= dt;
      if (this.frightT <= 0) { for (const gh of this.ghosts) gh.fright = false; this.chain = 0; }
    }

    if (this.bonusFruit && this.bonusFruitT > 0) {
      this.bonusFruitT -= dt;
      if (this.bonusFruitT <= 0) this.bonusFruit = null;
    }

    this.step(this.pl, 4.2, dt, this.choosePlayer);
    const gspd = Math.min(3.3 + (this.level - 1) * 0.2, 4.4);
    for (const gh of this.ghosts) {
      if (gh.releaseT && gh.releaseT > 0) { gh.releaseT -= dt; continue; }
      if (gh.deadT && gh.deadT > 0) {
        gh.deadT -= dt;
        if (gh.deadT <= 0) { gh.deadT = 0; gh.fc = 7; gh.fr = 5; gh.dc = 0; gh.dr = 0; gh.t = 0; gh.fright = false; if (gh.super) gh.superHp = 2; }
        continue;
      }
      const spd = gh.fright ? 2.4 : gspd * (gh.super ? 1.15 : 1);
      this.step(gh, spd, dt, this.chooseGhost);
    }

    // collisions (pixel distance) — the super ghost has a larger hit radius
    // to match its bigger sprite, and shrugs off the first fright-hit.
    for (const gh of this.ghosts) {
      if (gh.releaseT && gh.releaseT > 0) continue;
      if (gh.deadT && gh.deadT > 0) continue;
      const d = Math.hypot(this.px(gh) - this.px(this.pl), this.py(gh) - this.py(this.pl));
      if (d < (gh.super ? 20 : 16)) {
        if (gh.fright) {
          if (gh.super && (gh.superHp ?? 2) > 1) {
            gh.superHp = (gh.superHp ?? 2) - 1;
            this.shake(0.08, 1.5);
            this.spawnParticles(this.px(gh), this.py(gh), 0xb45cff, 6, 60);
            sfx.hit();
            continue;
          }
          this.chain++;
          this.maxChain = Math.max(this.maxChain, this.chain);
          const pts = (gh.super ? 800 : 200) * Math.pow(2, Math.min(this.chain, 4) - 1);
          this.score += pts; this.ghostsEaten++;
          gh.deadT = 3;
          sfx.coin();
          this.shake(gh.super ? 0.25 : 0.1, gh.super ? 5 : 2);
          this.spawnParticles(this.px(gh), this.py(gh), gh.super ? 0xb45cff : 0x88ccff, gh.super ? 22 : 10, gh.super ? 100 : 70);
        } else {
          this.lives--;
          sfx.hit();
          this.shake(0.3, 6);
          this.spawnParticles(this.px(this.pl), this.py(this.pl), 0xffd23f, 16, 90);
          if (this.lives <= 0) { this.gameOver(); return; }
          this.resetPositions();
          return;
        }
      }
    }
    this.rBoard();
  }

  private rReady() {
    this.txt(5).setOrigin(0.5, 0).setFontSize(12).setColor('#ffd23f').setText('READY!').setPosition(VW / 2, HUD_H + 5 * TS + 10).setVisible(true);
  }

  private rBoard() {
    const g = this.g;
    // HUD
    this.ui.fillStyle(0x070716, 0.9); this.ui.fillRect(0, 0, VW, HUD_H);
    this.ui.fillStyle(0xffd23f, 0.4); this.ui.fillRect(0, HUD_H - 2, VW, 2);
    this.txt(0).setOrigin(0, 0).setFontSize(9).setColor('#f4f8ff').setText(String(this.score).padStart(6, '0')).setPosition(10, 10).setVisible(true);
    this.txt(1).setOrigin(0.5, 0).setFontSize(7).setColor('#93a8d9').setText('LV ' + this.level).setPosition(VW / 2, 12).setVisible(true);
    if (this.daily) this.txt(19).setOrigin(0, 0).setFontSize(6).setColor('#ffd23f').setText('HARIAN').setPosition(10, 22).setVisible(true);
    for (let i = 0; i < this.lives; i++) {
      this.ui.fillStyle(0xffd23f);
      this.ui.slice(VW - 18 - i * 20, 16, 7, 0.6, Math.PI * 2 - 0.6); this.ui.fillPath();
    }
    g.save(); g.translateCanvas(this.shakeX, this.shakeY);
    // walls
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (this.maze[r][c] !== '#') continue;
      const x = c * TS, y = HUD_H + r * TS;
      g.fillStyle(0x141c4e); g.fillRect(x + 1, y + 1, TS - 2, TS - 2);
      g.lineStyle(2, 0x3a55c8, 0.8); g.strokeRect(x + 3, y + 3, TS - 6, TS - 6);
    }
    // tunnel entries — pulsing portals
    for (const [tc, tr] of this.tunnels) {
      const tx = tc * TS + TS / 2, ty = HUD_H + tr * TS + TS / 2;
      const pulse = 0.5 + Math.sin(this.blink * 5) * 0.25;
      drawGlow(g, tx, ty, 16, 0x44e0ff, pulse * 0.5);
      g.lineStyle(2, 0x44e0ff, pulse); g.strokeCircle(tx, ty, 10);
    }
    for (let i = this.tunnelFlash.length - 1; i >= 0; i--) {
      const f = this.tunnelFlash[i]; f.t += 0.06;
      if (f.t > 1) { this.tunnelFlash.splice(i, 1); continue; }
      g.fillStyle(0x44e0ff, 1 - f.t); g.fillCircle(f.x, f.y, 4 + f.t * 20);
    }
    // dots
    g.fillStyle(0xffd9a0);
    for (const k of this.dots) {
      const [c, r] = k.split(',').map(Number);
      g.fillCircle(c * TS + TS / 2, HUD_H + r * TS + TS / 2, 2.6);
    }
    for (const k of this.pellets) {
      const [c, r] = k.split(',').map(Number);
      const pulse = 4.5 + Math.sin(this.blink * 6) * 1.5;
      drawGlow(g, c * TS + TS / 2, HUD_H + r * TS + TS / 2, 12, 0xffd23f, 0.4);
      g.fillStyle(0xffd23f); g.fillCircle(c * TS + TS / 2, HUD_H + r * TS + TS / 2, pulse);
    }
    // bonus fruit — flashes when about to expire
    if (this.bonusFruit) {
      const bf = this.bonusFruit;
      const fx = bf.c * TS + TS / 2, fy = HUD_H + bf.r * TS + TS / 2;
      const flashing = this.bonusFruitT < 3 && this.blink % 0.4 < 0.2;
      if (!flashing) {
        drawGlow(g, fx, fy, 13, 0xff5c5c, 0.5);
        g.fillStyle(0xff5c5c); g.fillCircle(fx, fy, 7);
        g.fillStyle(0x2fae4a); g.fillRect(fx - 1.5, fy - 10, 3, 5);
      }
    }
    // ghosts — the super ghost is drawn larger with a menacing outline and
    // an hp pip while frightened (it takes 2 hits, not 1)
    for (const gh of this.ghosts) {
      if (gh.deadT && gh.deadT > 0) continue;
      const flash = gh.fright && this.frightT < 2 && this.blink % 0.3 < 0.15;
      const col = gh.fright ? (flash ? 0xffffff : gh.super ? 0x7a3bb0 : 0x4466ff) : gh.color!;
      const r = gh.super ? 15 : 11;
      if (gh.super) drawGlow(g, this.px(gh), this.py(gh), 22, 0xb45cff, 0.3);
      this.rGhost(this.px(gh), this.py(gh), col, gh.fright === true, r, gh.dc, gh.dr);
      if (gh.super && gh.fright && (gh.superHp ?? 2) > 1) {
        g.fillStyle(0xffffff, 0.9);
        g.fillRect(this.px(gh) - 8, this.py(gh) - r - 6, 16, 3);
        g.fillStyle(0xb45cff);
        g.fillRect(this.px(gh) - 8, this.py(gh) - r - 6, 16 * ((gh.superHp ?? 2) / 2), 3);
      }
    }
    // player
    const pa = Math.atan2(this.pl.dr, this.pl.dc || (this.pl.dr ? 0 : 1));
    const mouth = 0.28 + Math.abs(Math.sin(this.blink * 10)) * 0.32;
    drawGlow(g, this.px(this.pl), this.py(this.pl), 14, 0xffd23f, 0.35);
    g.fillStyle(0xffd23f);
    g.slice(this.px(this.pl), this.py(this.pl), 11, pa + mouth, pa - mouth);
    g.fillPath();
    this.drawParticles(g);
    g.restore();
    // fright timer bar
    if (this.frightT > 0) {
      this.ui.fillStyle(0x4466ff, 0.9);
      this.ui.fillRect(VW / 2 - 40, 24, 80 * (this.frightT / 6), 3);
    }
  }

  private rGhost(x: number, y: number, color: number, fright: boolean, r = 11, dc = 0, dr = 0) {
    const g = this.g;
    g.fillStyle(color);
    g.fillCircle(x, y - 2, r);
    g.fillRect(x - r, y - 2, r * 2, r * 0.9);
    for (let i = 0; i < 3; i++) {
      const bx = x - r + (i * 2 + 0.5) * (r / 3);
      g.fillTriangle(bx, y + r * 0.7, bx + r / 3, y + r * 0.2, bx + r / 1.5, y + r * 0.7);
    }
    if (fright) {
      g.fillStyle(0xffffff);
      g.fillRect(x - 5, y - 5, 3, 3); g.fillRect(x + 2, y - 5, 3, 3);
    } else {
      g.fillStyle(0xffffff);
      g.fillCircle(x - 4, y - 4, 3.2); g.fillCircle(x + 4, y - 4, 3.2);
      g.fillStyle(0x202060);
      g.fillCircle(x - 4 + dc * 1.6, y - 4 + dr * 1.6, 1.7); g.fillCircle(x + 4 + dc * 1.6, y - 4 + dr * 1.6, 1.7);
    }
  }
}
