import { ArcadeScene, VW, VH, sfx, drawGlow, shade, startSession, submitScore, SessionCtx, isDailyMode, todayDateSeed, mulberry32 } from './kit';

// ── PECAH BHATA — brick breaker ──
// One-finger control: the paddle follows the pointer. Bricks score by row,
// multiplied by the current flight combo (bricks broken since the last
// paddle touch). Endless levels, +1 row and faster ball as they climb.
const HUD_H = 34;
const COLS = 12, BW = 40, BH = 16, BOX = 16, BOY = HUD_H + 14;
const ROW_COLORS = [0xff5c5c, 0xff9d42, 0xffd23f, 0x4bdba0, 0x44e0ff, 0xb45cff, 0xff5cc8, 0xcfd8e3];

interface Ball { x: number; y: number; vx: number; vy: number; stuck: boolean }
interface Drop { x: number; y: number; type: 'wide' | 'multi' | 'slow' }
interface Brick {
  x: number; y: number; pts: number; color: number;
  hp: number; maxHp: number;
  type: 'normal' | 'armored' | 'explosive' | 'boss';
  w?: number; h?: number; // boss bricks override the fixed BW/BH cell size
}

// Boss brick every 5th level — a single large multi-hit block replaces the
// grid, giving levels 5/10/15/... a real set-piece instead of just "one more
// row, ball a bit faster" like every other level.
const BOSS_EVERY = 5;
const BOSS_COLS = 6, BOSS_ROWS = 3;

export class BrickScene extends ArcadeScene {
  private gs = 'TITLE';
  private score = 0; private lives = 3; private level = 1;
  private bricks: Brick[] = [];
  private bossMaxHp = 0;
  private balls: Ball[] = [];
  private drops: Drop[] = [];
  private padX = VW / 2; private padW = 72;
  private wideT = 0; private slowT = 0;
  private flight = 0; private maxCombo = 0; private bricksBroken = 0;
  private stateT = 0; private serveT = 0; private lcBonus = 0;
  private startTime = 0; private sess: SessionCtx = null;
  private daily = false; private dailyDate = '';
  // Daily challenge: seeds the two sources of runtime randomness (serve
  // angle, drop rolls) so every player sees the same ball trajectories and
  // power-up drops for a given level today. Brick layout itself is already
  // deterministic (fixed grid per level), so this is the only randomness
  // that needed seeding.
  private rng: () => number = Math.random;

  constructor() { super({ key: 'BrickScene' }); }

  private speed() { return Math.min(230 + (this.level - 1) * 12, 400) * (this.slowT > 0 ? 0.72 : 1); }

  // Non-grid layouts — cycles through a few hole/shape patterns by level
  // tier instead of always filling the full COLS x rows rectangle.
  private brickAt(col: number, row: number, rows: number, patternIdx: number): boolean {
    switch (patternIdx) {
      case 1: { // pyramid: each row narrower, centered
        const half = Math.floor(((rows - row) * COLS) / (rows * 2));
        const mid = COLS / 2;
        return col >= mid - half && col < mid + half;
      }
      case 2: // checkerboard gaps
        return (col + row) % 3 !== 0;
      case 3: { // diamond
        const mid = (rows - 1) / 2;
        const distRow = Math.abs(row - mid) / Math.max(mid, 1);
        const half = Math.round((COLS / 2) * (1 - distRow));
        const midCol = COLS / 2;
        return col >= midCol - half && col < midCol + half;
      }
      default:
        return true;
    }
  }

  private buildLevel() {
    this.rng = this.daily ? mulberry32(todayDateSeed().seed * 37 + this.level) : Math.random;
    this.bricks = [];
    this.bossMaxHp = 0;

    if (this.level % BOSS_EVERY === 0) {
      // Boss level — one big multi-hit block, no regular grid.
      const w = BOSS_COLS * BW, h = BOSS_ROWS * BH;
      const x = BOX + ((COLS - BOSS_COLS) / 2) * BW;
      const y = BOY;
      const hp = 16 + this.level * 3;
      this.bossMaxHp = hp;
      this.bricks.push({ x, y, w, h, pts: 80 * this.level, color: 0xff5cc8, hp, maxHp: hp, type: 'boss' });
    } else {
      const rows = Math.min(4 + (this.level - 1), 8);
      const patternIdx = Math.floor((this.level - 1) / 2) % 4;
      const armoredChance = Math.min(0.05 + this.level * 0.015, 0.3);
      const explosiveChance = Math.min(0.03 + this.level * 0.01, 0.15);
      const armoredHp = this.level >= 7 ? 3 : 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!this.brickAt(c, r, rows, patternIdx)) continue;
          const roll = this.rng();
          const isExplosive = roll < explosiveChance;
          const isArmored = !isExplosive && roll < explosiveChance + armoredChance;
          const type: Brick['type'] = isExplosive ? 'explosive' : isArmored ? 'armored' : 'normal';
          const hp = isArmored ? armoredHp : 1;
          const basePts = (rows - r) * 10;
          this.bricks.push({
            x: BOX + c * BW, y: BOY + r * BH,
            pts: isExplosive ? basePts * 2 : basePts * hp,
            color: isExplosive ? 0xff3b3b : ROW_COLORS[r % ROW_COLORS.length],
            hp, maxHp: hp, type,
          });
        }
      }
    }
    this.drops = [];
    this.wideT = 0; this.slowT = 0; this.padW = 72;
    this.serve();
  }

  private serve() {
    this.balls = [{ x: this.padX, y: VH - 34, vx: 0, vy: 0, stuck: true }];
    this.flight = 0; this.serveT = 1.2;
  }

  private launch(b: Ball) {
    const a = -Math.PI / 2 + (this.rng() * 0.8 - 0.4);
    const s = this.speed();
    b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s; b.stuck = false;
  }

  private startGame() {
    this.score = 0; this.lives = 3; this.level = 1;
    this.maxCombo = 0; this.bricksBroken = 0;
    this.daily = isDailyMode(); this.dailyDate = todayDateSeed().date;
    this.startTime = Date.now();
    startSession('brick-breaker').then(s => { this.sess = s; });
    sfx.start();
    this.buildLevel();
    this.gs = 'PLAYING';
  }

  private gameOver() {
    this.gs = 'GAME_OVER'; this.stateT = 0;
    sfx.death();
    submitScore('brick-breaker', this.score, {
      bricks: this.bricksBroken, level: this.level, maxCombo: this.maxCombo,
      durationSec: Math.floor((Date.now() - this.startTime) / 1000),
      daily: this.daily, dailyDate: this.daily ? this.dailyDate : undefined,
    }, this.sess);
  }

  protected tick(dt: number) {
    sfx.musicTick(this.gs === 'PLAYING', this.lives <= 1 ? 1 : 0, 'brick');
    this.drawSpaceBg();
    this.g.clear(); this.ui.clear();
    for (const t of this.txts) t.setVisible(false);
    if (this.gs === 'TITLE') this.uTitle();
    else if (this.gs === 'PLAYING') this.uPlay(dt);
    else if (this.gs === 'LEVEL_CLEAR') { this.stateT += dt; this.rGame(); this.rBanner('LEVEL ' + this.level + ' CLEAR!', '+' + this.lcBonus + ' PTS'); if (this.stateT > 1.4) { this.level++; this.buildLevel(); this.gs = 'PLAYING'; } }
    else if (this.gs === 'GAME_OVER') this.uGO(dt);
  }

  private uTitle() {
    this.txt(0).setOrigin(0.5, 0).setFontSize(30).setColor('#ffd23f').setText('PECAH BHATA').setPosition(VW / 2, VH * 0.2).setVisible(true);
    this.txt(1).setOrigin(0.5, 0).setFontSize(8).setColor('#93a8d9').setText('PANTULKAN BOLA - HANCURKAN SEMUA BATA\nCOMBO TANPA MENYENTUH PADDLE = SKOR x5').setAlign('center').setLineSpacing(6).setPosition(VW / 2, VH * 0.42).setVisible(true);
    this.txt(2).setOrigin(0.5, 0).setFontSize(7).setColor('#5f6f9c').setText(this.isTouch ? 'GESER JARI = GERAKKAN PADDLE' : 'MOUSE / PANAH = GERAKKAN PADDLE').setPosition(VW / 2, VH * 0.58).setVisible(true);
    if (this.blink % 1 < 0.62) this.txt(3).setOrigin(0.5, 0).setFontSize(12).setColor('#7ce3ff').setText(this.isTouch ? 'TAP TO START' : 'PRESS ANY KEY').setPosition(VW / 2, VH * 0.76).setVisible(true);
    drawGlow(this.g, VW / 2, VH * 0.25, 90, 0xffd23f, 0.3);
    if (this.anyPress()) this.startGame();
  }

  private uGO(dt: number) {
    this.stateT += dt;
    this.rGame();
    this.ui.fillStyle(0x03040c, 0.75); this.ui.fillRect(0, 0, VW, VH);
    this.txt(10).setOrigin(0.5, 0).setFontSize(24).setColor('#ff6b6b').setText('GAME OVER').setPosition(VW / 2, VH * 0.3).setVisible(true);
    this.txt(11).setOrigin(0.5, 0).setFontSize(10).setColor('#f4f8ff').setText('SCORE: ' + this.score).setPosition(VW / 2, VH * 0.46).setVisible(true);
    this.txt(12).setOrigin(0.5, 0).setFontSize(7).setColor('#93a8d9').setText('LEVEL ' + this.level + '  -  ' + this.bricksBroken + ' BATA  -  COMBO x' + Math.min(this.maxCombo, 5)).setPosition(VW / 2, VH * 0.55).setVisible(true);
    if (this.stateT > 1.2 && this.blink % 1 < 0.62) this.txt(13).setOrigin(0.5, 0).setFontSize(9).setColor('#7ce3ff').setText(this.isTouch ? 'TAP TO CONTINUE' : 'PRESS ANY KEY').setPosition(VW / 2, VH * 0.7).setVisible(true);
    if (this.stateT > 1.2 && this.anyPress()) this.gs = 'TITLE';
  }

  private uPlay(dt: number) {
    // paddle follows pointer; arrows as fallback
    if (this.keys['ArrowLeft']) this.padX -= 320 * dt;
    else if (this.keys['ArrowRight']) this.padX += 320 * dt;
    else this.padX += (this.ptr.x - this.padX) * Math.min(1, dt * 18);
    this.padX = Math.max(this.padW / 2, Math.min(VW - this.padW / 2, this.padX));
    if (this.wideT > 0) { this.wideT -= dt; this.padW = this.wideT > 0 ? 110 : 72; }
    if (this.slowT > 0) this.slowT -= dt;

    // serve
    const stuckBall = this.balls.find(b => b.stuck);
    if (stuckBall) {
      stuckBall.x = this.padX; stuckBall.y = VH - 34;
      this.serveT -= dt;
      if (this.tapped || this.kp('Space') || this.serveT <= 0) this.launch(stuckBall);
    }

    // balls
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      if (b.stuck) continue;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 5) { b.x = 5; b.vx = Math.abs(b.vx); sfx.bounce(); }
      if (b.x > VW - 5) { b.x = VW - 5; b.vx = -Math.abs(b.vx); sfx.bounce(); }
      if (b.y < HUD_H + 5) { b.y = HUD_H + 5; b.vy = Math.abs(b.vy); sfx.bounce(); }
      // paddle
      const py = VH - 24;
      if (b.vy > 0 && b.y + 5 >= py && b.y + 5 <= py + 14 && b.x >= this.padX - this.padW / 2 - 4 && b.x <= this.padX + this.padW / 2 + 4) {
        const off = (b.x - this.padX) / (this.padW / 2);
        const ang = -Math.PI / 2 + off * 1.1;
        const s = this.speed();
        b.vx = Math.cos(ang) * s; b.vy = Math.sin(ang) * s;
        b.y = py - 5;
        this.flight = 0;
        sfx.bounce();
      }
      // bricks
      for (let j = this.bricks.length - 1; j >= 0; j--) {
        const br = this.bricks[j];
        const bw = br.w ?? BW, bh = br.h ?? BH;
        if (b.x + 5 < br.x + 1 || b.x - 5 > br.x + bw - 1 || b.y + 5 < br.y + 1 || b.y - 5 > br.y + bh - 1) continue;
        const oxl = b.x + 5 - br.x, oxr = br.x + bw - (b.x - 5);
        const oyt = b.y + 5 - br.y, oyb = br.y + bh - (b.y - 5);
        if (Math.min(oxl, oxr) < Math.min(oyt, oyb)) b.vx = -b.vx; else b.vy = -b.vy;
        this.flight++;
        this.maxCombo = Math.max(this.maxCombo, this.flight);
        const mult = Math.min(this.flight, 5);
        sfx.bounce();
        this.spawnParticles(b.x, b.y, br.color, 3, 30);

        // Armored/boss bricks absorb a hit before breaking; only the final
        // hit awards points and destroys it (chip hits still bounce+shake).
        br.hp--;
        if (br.hp > 0) {
          this.shake(0.05, 1);
          break;
        }

        this.score += br.pts * mult;
        this.bricksBroken++;
        sfx.pop();
        this.shake(br.type === 'boss' ? 0.18 : 0.08, br.type === 'boss' ? 4 : 1.6);
        this.spawnParticles(br.x + bw / 2, br.y + bh / 2, br.color, br.type === 'boss' ? 24 : 8, 65);
        this.bricks.splice(j, 1);

        // Explosive brick chain-clears any brick (except another boss) whose
        // center falls within one cell of this one — full destroy + points,
        // regardless of remaining hp, since it's caught in the blast.
        if (br.type === 'explosive') {
          const cx = br.x + bw / 2, cy = br.y + bh / 2;
          const blastR = Math.max(BW, BH) * 1.6;
          for (let k = this.bricks.length - 1; k >= 0; k--) {
            const nb = this.bricks[k];
            if (nb.type === 'boss') continue;
            const nw = nb.w ?? BW, nh = nb.h ?? BH;
            const ncx = nb.x + nw / 2, ncy = nb.y + nh / 2;
            if (Math.hypot(ncx - cx, ncy - cy) > blastR) continue;
            this.score += nb.pts * mult;
            this.bricksBroken++;
            this.spawnParticles(ncx, ncy, 0xff8a3b, 6, 55);
            this.bricks.splice(k, 1);
          }
          this.shake(0.15, 3.5);
          sfx.boom();
        }

        if (this.rng() < 0.12) {
          const r = this.rng();
          this.drops.push({ x: br.x + bw / 2, y: br.y + bh / 2, type: r < 0.4 ? 'wide' : r < 0.75 ? 'slow' : 'multi' });
        }
        break;
      }
      if (b.y > VH + 12) this.balls.splice(i, 1);
    }

    // drops
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.y += 95 * dt;
      if (d.y > VH - 30 && d.y < VH - 8 && Math.abs(d.x - this.padX) < this.padW / 2 + 10) {
        sfx.power();
        if (d.type === 'wide') this.wideT = 12;
        else if (d.type === 'slow') this.slowT = 8;
        else {
          const src = this.balls.find(b => !b.stuck) || this.balls[0];
          if (src) for (const a of [-0.5, 0.5]) {
            const s = this.speed();
            this.balls.push({ x: src.x, y: src.y, vx: Math.cos(-Math.PI / 2 + a) * s, vy: Math.sin(-Math.PI / 2 + a) * s, stuck: false });
          }
        }
        this.drops.splice(i, 1);
      } else if (d.y > VH + 10) this.drops.splice(i, 1);
    }

    // life lost
    if (this.balls.length === 0) {
      this.lives--;
      sfx.hit();
      this.shake(0.2, 5);
      if (this.lives <= 0) { this.gameOver(); return; }
      this.serve();
    }
    // level clear
    if (this.bricks.length === 0) {
      this.lcBonus = 300 * this.level;
      this.score += this.lcBonus;
      sfx.clear();
      this.gs = 'LEVEL_CLEAR'; this.stateT = 0;
    }
    this.rGame();
  }

  private rBanner(a: string, b: string) {
    this.ui.fillStyle(0x03040c, 0.7); this.ui.fillRect(0, VH * 0.34, VW, 90);
    this.txt(10).setOrigin(0.5, 0).setFontSize(14).setColor('#4bdba0').setText(a).setPosition(VW / 2, VH * 0.38).setVisible(true);
    this.txt(11).setOrigin(0.5, 0).setFontSize(10).setColor('#ffd23f').setText(b).setPosition(VW / 2, VH * 0.47).setVisible(true);
  }

  private rGame() {
    const g = this.g;
    // HUD
    this.ui.fillStyle(0x070716, 0.9); this.ui.fillRect(0, 0, VW, HUD_H);
    this.ui.fillStyle(0x7ce3ff, 0.4); this.ui.fillRect(0, HUD_H - 2, VW, 2);
    this.txt(0).setOrigin(0, 0).setFontSize(9).setColor('#f4f8ff').setText(String(this.score).padStart(6, '0')).setPosition(10, 12).setVisible(true);
    this.txt(1).setOrigin(0.5, 0).setFontSize(7).setColor('#93a8d9').setText('LV ' + this.level).setPosition(VW / 2, 13).setVisible(true);
    if (this.flight >= 2) this.txt(3).setOrigin(0.5, 0).setFontSize(7).setColor('#ffd23f').setText('COMBO x' + Math.min(this.flight, 5)).setPosition(VW / 2, 23).setVisible(true);
    if (this.daily) this.txt(19).setOrigin(0, 0).setFontSize(6).setColor('#ffd23f').setText('HARIAN').setPosition(10, 24).setVisible(true);
    for (let i = 0; i < this.lives; i++) { this.ui.fillStyle(0xff5cc8, 0.9); this.ui.fillCircle(VW - 16 - i * 16, 17, 5); }
    // shake applies only to the play area, not the HUD above
    g.save(); g.translateCanvas(this.shakeX, this.shakeY);
    // bricks
    for (const br of this.bricks) {
      const bw = br.w ?? BW, bh = br.h ?? BH;
      const pulse = br.type === 'explosive' ? 0.75 + Math.sin(this.blink * 8) * 0.25 : 1;
      const col = br.type === 'explosive' ? shade(br.color, (pulse - 1) * 0.6) : br.color;
      g.fillStyle(shade(col, -0.35)); g.fillRect(br.x + 1, br.y + 1, bw - 2, bh - 2);
      g.fillStyle(col); g.fillRect(br.x + 1, br.y + 1, bw - 2, bh - 4);
      g.fillStyle(shade(col, 0.4), 0.9); g.fillRect(br.x + 1, br.y + 1, bw - 2, 2);
      // Armored — crack lines that increase as hp drops
      if (br.type === 'armored') {
        const hits = br.maxHp - br.hp;
        g.lineStyle(1, 0x0a0a12, 0.6);
        if (hits >= 1) { g.beginPath(); g.moveTo(br.x + 6, br.y + 2); g.lineTo(br.x + bw - 8, br.y + bh - 3); g.strokePath(); }
        if (hits >= 2) { g.beginPath(); g.moveTo(br.x + bw - 6, br.y + 2); g.lineTo(br.x + 8, br.y + bh - 3); g.strokePath(); }
      }
      // Explosive — bomb glyph
      if (br.type === 'explosive') {
        g.fillStyle(0x1a0a0a, 0.85);
        g.fillCircle(br.x + bw / 2, br.y + bh / 2 - 1, 3);
      }
      // Boss — HP bar above the block + pink glow
      if (br.type === 'boss') {
        drawGlow(g, br.x + bw / 2, br.y + bh / 2, bw * 0.7, 0xff5cc8, 0.25 + Math.sin(this.blink * 4) * 0.08);
        const barW = bw, barY = br.y - 8;
        g.fillStyle(0x1a0a12, 0.8); g.fillRect(br.x, barY, barW, 5);
        g.fillStyle(0xff5cc8); g.fillRect(br.x, barY, barW * Math.max(0, br.hp / br.maxHp), 5);
      }
    }
    // drops
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      const c = d.type === 'wide' ? 0x4bdba0 : d.type === 'slow' ? 0x44e0ff : 0xffd23f;
      drawGlow(g, d.x, d.y, 10, c, 0.5);
      g.fillStyle(c); g.fillRect(d.x - 7, d.y - 5, 14, 10);
      // Label glyph so players can tell drop types apart at a glance
      // (indices 6-8: slots 0/1/3/5 are already used elsewhere in rGame()).
      if (i < 3) {
        const label = d.type === 'wide' ? 'W' : d.type === 'slow' ? 'S' : 'M';
        this.txt(6 + i).setOrigin(0.5, 0.5).setFontSize(6).setColor('#0a0a12').setText(label).setPosition(d.x, d.y).setVisible(true);
      }
    }
    // paddle
    const py = VH - 24;
    drawGlow(g, this.padX, py + 5, 26, this.wideT > 0 ? 0x4bdba0 : 0x7ce3ff, 0.4);
    g.fillStyle(0x2b3f74); g.fillRect(this.padX - this.padW / 2, py, this.padW, 10);
    g.fillStyle(this.wideT > 0 ? 0x4bdba0 : 0x7ce3ff); g.fillRect(this.padX - this.padW / 2, py, this.padW, 4);
    // balls
    for (const b of this.balls) {
      drawGlow(g, b.x, b.y, 10, 0xffffff, 0.5);
      g.fillStyle(0xffffff); g.fillCircle(b.x, b.y, 5);
      g.fillStyle(0x9fd9ff, 0.8); g.fillCircle(b.x - 1.5, b.y - 1.5, 1.8);
    }
    this.drawParticles(g);
    g.restore();
    if (this.balls.some(b => b.stuck) && this.blink % 0.8 < 0.5) {
      this.txt(5).setOrigin(0.5, 0).setFontSize(7).setColor('#7ce3ff').setText(this.isTouch ? 'TAP UNTUK LUNCURKAN' : 'SPACE / TAP UNTUK LUNCURKAN').setPosition(VW / 2, VH - 60).setVisible(true);
    }
  }
}
