import { ArcadeScene, VW, VH, sfx, drawGlow, startSession, submitScore, SessionCtx, isDailyMode, todayDateSeed } from './kit';

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

interface Ent {
  fc: number; fr: number; dc: number; dr: number; t: number;
  want: [number, number];
  fright?: boolean; deadT?: number; color?: number; releaseT?: number;
}

export class MazeScene extends ArcadeScene {
  private gs = 'TITLE';
  private score = 0; private lives = 3; private level = 1;
  private dots = new Set<string>(); private pellets = new Set<string>();
  private pl!: Ent; private ghosts: Ent[] = [];
  private frightT = 0; private chain = 0; private maxChain = 0;
  private dotsEaten = 0; private ghostsEaten = 0;
  private readyT = 0; private stateT = 0;
  private startTime = 0; private sess: SessionCtx = null;
  private daily = false; private dailyDate = '';

  constructor() { super({ key: 'MazeScene' }); }

  private wrapC(c: number) { return ((c % COLS) + COLS) % COLS; }
  private pass(c: number, r: number) {
    if (r < 0 || r >= ROWS) return false;
    return MAZE[r][this.wrapC(c)] !== '#';
  }
  private px(e: Ent) { return (e.fc + e.dc * e.t) * TS + TS / 2; }
  private py(e: Ent) { return HUD_H + (e.fr + e.dr * e.t) * TS + TS / 2; }

  private buildBoard() {
    this.dots.clear(); this.pellets.clear();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = MAZE[r][c];
      if (ch === 'o') this.pellets.add(c + ',' + r);
      else if (ch === '.' && !NO_DOT.has(c + ',' + r)) this.dots.add(c + ',' + r);
    }
    this.resetPositions();
  }

  private resetPositions() {
    this.pl = { fc: 7, fr: 11, dc: 0, dr: 0, t: 0, want: [1, 0] };
    // Staggered pen-exit: all 3 ghosts used to release simultaneously.
    // First is free immediately, the others wait their turn in the pen.
    this.ghosts = [6, 7, 9].map((c, i) => ({ fc: c, fr: 5, dc: 0, dr: 0, t: 0, want: [0, -1], fright: false, deadT: 0, color: GHOST_COLORS[i], releaseT: i * 2.5 }));
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
    if (e.fright || Math.random() < 0.25) pick = opts[Math.floor(Math.random() * opts.length)];
    else {
      // chase: minimize distance to the player's tile
      let best = Infinity; pick = opts[0];
      for (const [dc, dr] of opts) {
        const d = Math.hypot(this.wrapC(e.fc + dc) - this.pl.fc, e.fr + dr - this.pl.fr);
        const dd = e.fright ? -d : d;
        if (dd < best) { best = dd; pick = [dc, dr]; }
      }
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
    if (this.dots.size === 0 && this.pellets.size === 0) {
      this.score += 500 * this.level;
      this.level++;
      sfx.clear();
      this.buildBoard();
    }
  }

  protected tick(dt: number) {
    sfx.musicTick(this.gs === 'PLAYING', this.lives <= 1 ? 1 : 0);
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

    this.step(this.pl, 4.2, dt, this.choosePlayer);
    const gspd = Math.min(3.3 + (this.level - 1) * 0.2, 4.4);
    for (const gh of this.ghosts) {
      if (gh.releaseT && gh.releaseT > 0) { gh.releaseT -= dt; continue; }
      if (gh.deadT && gh.deadT > 0) {
        gh.deadT -= dt;
        if (gh.deadT <= 0) { gh.deadT = 0; gh.fc = 7; gh.fr = 5; gh.dc = 0; gh.dr = 0; gh.t = 0; gh.fright = false; }
        continue;
      }
      this.step(gh, gh.fright ? 2.4 : gspd, dt, this.chooseGhost);
    }

    // collisions (pixel distance)
    for (const gh of this.ghosts) {
      if (gh.releaseT && gh.releaseT > 0) continue;
      if (gh.deadT && gh.deadT > 0) continue;
      const d = Math.hypot(this.px(gh) - this.px(this.pl), this.py(gh) - this.py(this.pl));
      if (d < 16) {
        if (gh.fright) {
          this.chain++;
          this.maxChain = Math.max(this.maxChain, this.chain);
          const pts = 200 * Math.pow(2, Math.min(this.chain, 4) - 1);
          this.score += pts; this.ghostsEaten++;
          gh.deadT = 3;
          sfx.coin();
          this.shake(0.1, 2);
          this.spawnParticles(this.px(gh), this.py(gh), 0x88ccff, 10, 70);
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
      if (MAZE[r][c] !== '#') continue;
      const x = c * TS, y = HUD_H + r * TS;
      g.fillStyle(0x141c4e); g.fillRect(x + 1, y + 1, TS - 2, TS - 2);
      g.lineStyle(2, 0x3a55c8, 0.8); g.strokeRect(x + 3, y + 3, TS - 6, TS - 6);
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
    // ghosts
    for (const gh of this.ghosts) {
      if (gh.deadT && gh.deadT > 0) continue;
      const flash = gh.fright && this.frightT < 2 && this.blink % 0.3 < 0.15;
      const col = gh.fright ? (flash ? 0xffffff : 0x4466ff) : gh.color!;
      this.rGhost(this.px(gh), this.py(gh), col, gh.fright === true, 11, gh.dc, gh.dr);
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
