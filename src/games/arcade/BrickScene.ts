import { ArcadeScene, VW, VH, sfx, drawGlow, shade, startSession, submitScore, SessionCtx } from './kit';

// ── PECAH BHATA — brick breaker ──
// One-finger control: the paddle follows the pointer. Bricks score by row,
// multiplied by the current flight combo (bricks broken since the last
// paddle touch). Endless levels, +1 row and faster ball as they climb.
const HUD_H = 34;
const COLS = 12, BW = 40, BH = 16, BOX = 16, BOY = HUD_H + 14;
const ROW_COLORS = [0xff5c5c, 0xff9d42, 0xffd23f, 0x4bdba0, 0x44e0ff, 0xb45cff, 0xff5cc8, 0xcfd8e3];

interface Ball { x: number; y: number; vx: number; vy: number; stuck: boolean }
interface Drop { x: number; y: number; type: 'wide' | 'multi' | 'slow' }

export class BrickScene extends ArcadeScene {
  private gs = 'TITLE';
  private score = 0; private lives = 3; private level = 1;
  private bricks: { x: number; y: number; pts: number; color: number }[] = [];
  private balls: Ball[] = [];
  private drops: Drop[] = [];
  private padX = VW / 2; private padW = 72;
  private wideT = 0; private slowT = 0;
  private flight = 0; private maxCombo = 0; private bricksBroken = 0;
  private stateT = 0; private serveT = 0; private lcBonus = 0;
  private startTime = 0; private sess: SessionCtx = null;

  constructor() { super({ key: 'BrickScene' }); }

  private speed() { return Math.min(230 + (this.level - 1) * 12, 400) * (this.slowT > 0 ? 0.72 : 1); }

  private buildLevel() {
    this.bricks = [];
    const rows = Math.min(4 + (this.level - 1), 8);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < COLS; c++)
        this.bricks.push({ x: BOX + c * BW, y: BOY + r * BH, pts: (rows - r) * 10, color: ROW_COLORS[r % ROW_COLORS.length] });
    this.drops = [];
    this.wideT = 0; this.slowT = 0; this.padW = 72;
    this.serve();
  }

  private serve() {
    this.balls = [{ x: this.padX, y: VH - 34, vx: 0, vy: 0, stuck: true }];
    this.flight = 0; this.serveT = 1.2;
  }

  private launch(b: Ball) {
    const a = -Math.PI / 2 + (Math.random() * 0.8 - 0.4);
    const s = this.speed();
    b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s; b.stuck = false;
  }

  private startGame() {
    this.score = 0; this.lives = 3; this.level = 1;
    this.maxCombo = 0; this.bricksBroken = 0;
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
    }, this.sess);
  }

  protected tick(dt: number) {
    sfx.musicTick(this.gs === 'PLAYING', this.lives <= 1 ? 1 : 0);
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
        if (b.x + 5 < br.x + 1 || b.x - 5 > br.x + BW - 1 || b.y + 5 < br.y + 1 || b.y - 5 > br.y + BH - 1) continue;
        const oxl = b.x + 5 - br.x, oxr = br.x + BW - (b.x - 5);
        const oyt = b.y + 5 - br.y, oyb = br.y + BH - (b.y - 5);
        if (Math.min(oxl, oxr) < Math.min(oyt, oyb)) b.vx = -b.vx; else b.vy = -b.vy;
        this.flight++;
        this.maxCombo = Math.max(this.maxCombo, this.flight);
        const mult = Math.min(this.flight, 5);
        this.score += br.pts * mult;
        this.bricksBroken++;
        sfx.pop();
        this.shake(0.08, 1.6);
        this.spawnParticles(br.x + BW / 2, br.y + BH / 2, br.color, 8, 65);
        if (Math.random() < 0.12) {
          const r = Math.random();
          this.drops.push({ x: br.x + BW / 2, y: br.y + BH / 2, type: r < 0.4 ? 'wide' : r < 0.75 ? 'slow' : 'multi' });
        }
        this.bricks.splice(j, 1);
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
    for (let i = 0; i < this.lives; i++) { this.ui.fillStyle(0xff5cc8, 0.9); this.ui.fillCircle(VW - 16 - i * 16, 17, 5); }
    // shake applies only to the play area, not the HUD above
    g.save(); g.translateCanvas(this.shakeX, this.shakeY);
    // bricks
    for (const br of this.bricks) {
      g.fillStyle(shade(br.color, -0.35)); g.fillRect(br.x + 1, br.y + 1, BW - 2, BH - 2);
      g.fillStyle(br.color); g.fillRect(br.x + 1, br.y + 1, BW - 2, BH - 4);
      g.fillStyle(shade(br.color, 0.4), 0.9); g.fillRect(br.x + 1, br.y + 1, BW - 2, 2);
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
