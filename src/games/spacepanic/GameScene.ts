import Phaser from 'phaser';
import { genLevel, FLOOR_ROWS, LevelData } from './levels';
import { SP, ENEMY_DEFS, hexColor, SpriteGrid, PLAYER_COLOR, PLAYER_ACCENT } from './sprites';

const COLS = 16, ROWS = 12, PX = 2;
const TAIR=0, TPLAT=1, TLADR=2, TPIPEL=3, TPIPER=4, THOLE=5;
const HSPD = 100, VSPD = 68, GRAV = 480, MXF = 320;
const HUD_H = 64;

// Original 4 tiers only — level-up-on-miss escalates a trapped-and-unhit
// enemy through this chain, it never promotes higher-tier enemies further.
const LEVEL_UP_CHAIN = ['red', 'orange', 'green', 'blue'];

// ── VISUAL PALETTE ──
// A shared deep-space / neon-arcade language used across every screen.
const BG_TOP = 0x040311, BG_MID = 0x0c0a26, BG_BOT = 0x150c32;
const NEBULA_COLORS = [0x3a1e6d, 0x123a5e, 0x5c1e4a, 0x1e5c4a, 0x2a1a55];
const STAR_COLORS = [0xffffff, 0xcfe8ff, 0xffe9c2, 0x9fd9ff];

const TXT_BRIGHT = '#f4f8ff';
const TXT_ACCENT = '#7ce3ff';
const TXT_DIM = '#93a8d9';
const TXT_FAINT = '#5f6f9c';
const TXT_GOLD = '#ffd23f';
const TXT_DANGER = '#ff6b6b';
const TXT_GOOD = '#4bdba0';

const PLATFORM_C = 0x4a63b0, PLATFORM_HI = 0x93b3f5, PLATFORM_LO = 0x293458, PLATFORM_RIVET = 0x9fd0ff;
const LADDER_C = 0xffb400, LADDER_HI = 0xffe08a, LADDER_LO = 0xa66900;
const PIPE_C = 0x22d6c8, PIPE_LO = 0x0d6b62, PIPE_HI = 0x9df5ec;
const HOLE_RIM = 0xff8c42, HOLE_RIM_WARN = 0xff4d4d;

const ITEM_COLORS: Record<string, number> = { star: 0xffd23f, tank: 0x44e0ff, shovel: 0xffe066, shield: 0x35d6a9, life: 0xff5cc8 };
const ITEM_SPRITES: Record<string, string> = { star: 'star', tank: 'tank', shovel: 'shovelIcon', shield: 'shield', life: 'li' };

// Reserved text-pool slot shared by every screen's blinking "PRESS ANY KEY"
// style prompt — avoids index collisions between screens with variable-length
// lists (e.g. the high-score table) and the trailing prompt line.
const PROMPT_TXT = 29;
const TXT_POOL_SIZE = 30;

export interface SPGameState {
  score: number; level: number; lives: number;
  oxygen: number; oxygenMax: number;
  gameOver: boolean; started: boolean;
  enemiesAlive: number;
  state: string; hiScore: number;
  menuCursor: number;
  initialsEntry: boolean; initials: string[];
}

function emitState(s: SPGameState) {
  (window as any).__spState = s;
  window.dispatchEvent(new Event('sp-update'));
}

// ── Color helpers ──
function shade(color: number, amt: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  let r = c.red, g = c.green, b = c.blue;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { const f = 1 + amt; r *= f; g *= f; b *= f; }
  return Phaser.Display.Color.GetColor(
    Phaser.Math.Clamp(Math.round(r), 0, 255),
    Phaser.Math.Clamp(Math.round(g), 0, 255),
    Phaser.Math.Clamp(Math.round(b), 0, 255),
  );
}

// Renders a SpriteGrid with a soft dark outline (so it reads against any
// backdrop) plus a cheap per-pixel bevel: pixels on the sprite's top/left
// silhouette edge get a highlight tint, pixels on the bottom/right edge get
// a shadow tint, giving every entity real shading instead of one flat tone.
function drawSprite(g: Phaser.GameObjects.Graphics, name: string, x: number, y: number, color: number, flipX: boolean, scale: number, alpha = 1) {
  const data: SpriteGrid = (SP as any)[name];
  if (!data) return;
  const rows = data.length, cols = data[0].length, px = PX * scale;
  const hi = shade(color, 0.5), sh = shade(color, -0.4);
  g.fillStyle(0x030308, alpha * 0.85);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (data[r][c]) {
        const dc = flipX ? cols - 1 - c : c;
        g.fillRect(Math.round(x + dc * px) - 1, Math.round(y + r * px) - 1, Math.ceil(px) + 2, Math.ceil(px) + 2);
      }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!data[r][c]) continue;
      const dc = flipX ? cols - 1 - c : c;
      const top = r > 0 && data[r - 1][c], left = c > 0 && data[r][c - 1];
      const bot = r < rows - 1 && data[r + 1][c], right = c < cols - 1 && data[r][c + 1];
      const fill = (!top || !left) ? hi : (!bot || !right) ? sh : color;
      g.fillStyle(fill, alpha);
      g.fillRect(Math.round(x + dc * px), Math.round(y + r * px), Math.ceil(px), Math.ceil(px));
    }
  }
}

// Soft radial glow made of stacked translucent circles (Graphics has no
// native blur), used behind the player/enemies/items/panels for "juice".
function drawGlow(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, alpha: number) {
  g.fillStyle(color, Math.max(0, alpha) * 0.16); g.fillCircle(cx, cy, r);
  g.fillStyle(color, Math.max(0, alpha) * 0.28); g.fillCircle(cx, cy, r * 0.62);
  g.fillStyle(color, Math.max(0, alpha) * 0.4); g.fillCircle(cx, cy, r * 0.32);
}

// Stunned-enemy indicator: an 8-point sparkle/star-burst hovering above the
// trapped enemy's head. Replaces three 3x3px blinking squares (easy to miss
// against the glow behind them) with a bigger glyph that has a dark outline
// for contrast plus a continuous pulse (never fully disappears) so it reads
// clearly at a glance.
function drawStunBurst(g: Phaser.GameObjects.Graphics, cx: number, cy: number, color: number, t: number, scale = 1) {
  const pulse = 0.72 + Math.sin(t * 9) * 0.28;
  const r = 7.5 * scale * pulse;
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 4) * i + Math.PI / 8;
    const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
    g.lineStyle(3 * scale, 0x03030a, 0.85);
    g.beginPath(); g.moveTo(cx - dx, cy - dy); g.lineTo(cx + dx, cy + dy); g.strokePath();
    g.lineStyle(1.4 * scale, color, 1);
    g.beginPath(); g.moveTo(cx - dx, cy - dy); g.lineTo(cx + dx, cy + dy); g.strokePath();
  }
  g.fillStyle(0xffffff, 0.95);
  g.fillCircle(cx, cy, 1.8 * scale * pulse);
}

interface Player { x: number; y: number; w: number; h: number; vx: number; vy: number; dir: number; onG: boolean; onL: boolean; ldrEntryRow: number; st: string; af: number; at: number; dead: boolean; deadT: number; inv: boolean; invT: number; shield: number; rapidT: number; walkDustT: number; }
interface Enemy { x: number; y: number; w: number; h: number; vx: number; vy: number; dir: number; type: string; st: string; af: number; at: number; stT: number; recT: number; hn: number; hc: number; onG: boolean; teleT: number; dashT: number; dashing: boolean; dashUntil: number; isBoss: boolean; mSpawned: boolean; }
interface Hole { col: number; row: number; timer: number; max: number; }
interface Item { x: number; y: number; w: number; h: number; vy: number; life: number; type: string; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: number; size: number; grav: number; }

export class SpacePanicScene extends Phaser.Scene {
  private bgGfx!: Phaser.GameObjects.Graphics;
  private gfx!: Phaser.GameObjects.Graphics;
  private uiGfx!: Phaser.GameObjects.Graphics;
  private txts: Phaser.GameObjects.Text[] = [];
  private popupTxts: Phaser.GameObjects.Text[] = [];
  private tileMap: number[][] = [];
  private levelData: LevelData | null = null; private mapLevel = -1;
  private P!: Player;
  private EN: Enemy[] = [];
  private HOLES: Hole[] = [];
  private ITEMS: Item[] = [];
  private POPUPS: { text: string; x: number; y: number; vy: number; life: number; color: string }[] = [];
  private particles: Particle[] = [];
  private stars: { x: number; y: number; s: number; spd: number; ph: number; col: number }[] = [];
  private nebula: { x: number; y: number; r: number; color: number; alpha: number }[] = [];
  private shakeT = 0; private shakeMag = 0;
  private gs = 'TITLE';
  private score = 0; private hiScore = 99900; private lives = 3; private level = 1;
  private oxygen = 100; private oxyDrain = 100 / 60;
  private enemiesKilled = 0; private enemiesToKill = 5; private nextComboLife = 5;
  private spawnTimer = 2; private spawnInterval = 5; private maxEnemies = 3;
  private blink = 0; private titleAnim = 0; private stateTimer = 0;
  private menuCursor = 0; private lcBonus = 0;
  private initials = ['A', 'A', 'A']; private initialsPos = 0;
  private HS: { n: string; s: number; l: number }[] = [];
  private bossLevel = false; private bossSpawned = false; private bossPending = 0;
  private gameTime = 0;
  private keys: Record<string, boolean> = {};
  private pkeys: Record<string, boolean> = {};
  private touch: Record<string, number> = {};
  private prevTouch: Record<string, number> = {};

  constructor() { super({ key: 'SpacePanicScene' }); }

  create() {
    for (let i = 0; i < 28; i++)
      this.stars.push({ x: Phaser.Math.Between(10, this.scale.width - 10), y: Phaser.Math.Between(10, this.scale.height - 10), s: Phaser.Math.FloatBetween(0.8, 2.2), spd: Phaser.Math.FloatBetween(0.5, 2), ph: Math.random() * 6, col: STAR_COLORS[Phaser.Math.Between(0, STAR_COLORS.length - 1)] });
    for (let i = 0; i < 5; i++)
      this.nebula.push({ x: Phaser.Math.Between(0, this.scale.width), y: Phaser.Math.Between(0, this.scale.height), r: Phaser.Math.Between(70, 150), color: NEBULA_COLORS[i % NEBULA_COLORS.length], alpha: Phaser.Math.FloatBetween(0.08, 0.16) });
    this.bgGfx = this.add.graphics().setDepth(4);
    this.gfx = this.add.graphics().setDepth(5);
    this.uiGfx = this.add.graphics().setDepth(10);
    for (let i = 0; i < TXT_POOL_SIZE; i++) {
      this.txts.push(this.add.text(0, 0, '', { fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#ffffff', stroke: '#020208', strokeThickness: 2 }).setDepth(20).setVisible(false));
    }
    for (let i = 0; i < 8; i++) {
      this.popupTxts.push(this.add.text(0, 0, '', { fontFamily: '"Press Start 2P", monospace', fontSize: '9px', color: '#ffffff', stroke: '#020208', strokeThickness: 2 }).setOrigin(0.5).setDepth(12).setVisible(false));
    }
    (window as any).__spScene = this;
    window.dispatchEvent(new Event('sp-scene-ready'));
    this.loadHS();
    this._kd = (e: KeyboardEvent) => { if (!this.keys[e.code]) this.pkeys[e.code] = true; this.keys[e.code] = true; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault(); };
    this._ku = (e: KeyboardEvent) => { this.keys[e.code] = false; };
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    // Phaser never calls a plain instance destroy() method — cleanup must be
    // wired through the scene's own event emitter to actually run.
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      window.removeEventListener('keydown', this._kd);
      window.removeEventListener('keyup', this._ku);
    });
  }
  private _kd!: (e: KeyboardEvent) => void;
  private _ku!: (e: KeyboardEvent) => void;

  // Input
  iL(){return this.keys['ArrowLeft']||!!this.touch.left;}
  iR(){return this.keys['ArrowRight']||!!this.touch.right;}
  iU(){return this.keys['ArrowUp']||!!this.touch.up;}
  iD2(){return this.keys['ArrowDown']||!!this.touch.down;}
  pDig(){return!!(this.pkeys['KeyZ']||this.pkeys['KeyA']||(this.touch.dig&&!this.prevTouch.dig));}
  pHit(){return!!(this.pkeys['KeyX']||this.pkeys['KeyS']||(this.touch.hit&&!this.prevTouch.hit));}
  pStart(){return!!(this.pkeys['Enter']||this.pkeys['Space']||(this.touch.start&&!this.prevTouch.start));}
  pAny(){return Object.values(this.pkeys).some(v=>v)||(this.touch.start&&!this.prevTouch.start)||(this.touch.dig&&!this.prevTouch.dig)||(this.touch.hit&&!this.prevTouch.hit);}
  pUp(){return!!(this.pkeys['ArrowUp']||(this.touch.up&&!this.prevTouch.up));}
  pDn(){return!!(this.pkeys['ArrowDown']||(this.touch.down&&!this.prevTouch.down));}

  // High scores
  loadHS(){try{const d=JSON.parse(localStorage.getItem('sp80_hs')||'null');this.HS=Array.isArray(d)?d:this.defHS();}catch{this.HS=this.defHS();}this.hiScore=this.HS[0]?.s||99900;}
  saveHS(){try{localStorage.setItem('sp80_hs',JSON.stringify(this.HS));}catch{}}
  defHS(){return[{n:'AAA',s:99900,l:24},{n:'BBB',s:76500,l:18},{n:'CCC',s:54200,l:14},{n:'DDD',s:38100,l:10},{n:'EEE',s:24700,l:7},{n:'FFF',s:15400,l:5},{n:'GGG',s:9800,l:3},{n:'HHH',s:5300,l:2},{n:'III',s:2100,l:1},{n:'JJJ',s:800,l:1}];}
  isHS(){return this.score>0&&(this.HS.length<10||this.score>=this.HS[this.HS.length-1].s);}
  submitHS(){this.HS.push({n:this.initials.join(''),s:this.score,l:this.level});this.HS.sort((a,b)=>b.s-a.s);this.HS=this.HS.slice(0,10);this.hiScore=this.HS[0].s;this.saveHS();}

  getTile(c:number,r:number):number{if(c<0||c>=COLS||r<0||r>=ROWS)return TAIR;return this.tileMap[r]?.[c]??TAIR;}
  isSolid(c:number,r:number):boolean{const t=this.getTile(c,r);return t===TPLAT||t===TPIPEL||t===TPIPER;}
  getStandRow(en:{x:number;y:number;h:number}):number{for(let r=0;r<ROWS;r++)if(Math.abs((en.y+en.h)-(HUD_H+r*this.cellSize))<16)return r;return -1;}
  get cellSize(){const{width:w,height:h}=this.scale;return Math.min(Math.floor(w/COLS),Math.floor((h-HUD_H)/ROWS));}

  // ══════════════ STATE MACHINE ══════════════
  update(_t: number, delta: number) {
    const dt = Math.min(delta / 1000, 0.05);
    this.gameTime += dt; this.blink += dt; this.titleAnim += dt;
    if (this.shakeT > 0) { this.shakeT -= dt; this.shakeMag *= 0.9; if (this.shakeT <= 0) { this.shakeT = 0; this.shakeMag = 0; } }
    this.updateParticles(dt);
    if (this.gs === 'TITLE') this.uTitle(dt);
    else if (this.gs === 'MENU') this.uMenu(dt);
    else if (this.gs === 'HOWTO') this.uHowTo(dt);
    else if (this.gs === 'PLAYING') this.uPlay(dt);
    else if (this.gs === 'PAUSED') this.uPaused(dt);
    else if (this.gs === 'LEVEL_CLEAR') this.uLC(dt);
    else if (this.gs === 'GAME_OVER') this.uGO(dt);
    else if (this.gs === 'HIGH_SCORE') this.uHS(dt);
    this.render();
    this.stateChanged();
    this.pkeys = {}; this.prevTouch = { ...this.touch };
  }

  uTitle(_dt: number) { this.stateTimer += _dt; if (this.pAny()) { this.gs = 'MENU'; this.stateTimer = 0; this.menuCursor = 0; } }
  uMenu(_dt: number) {
    if (this.pUp()) { this.menuCursor = (this.menuCursor + 3) % 4; }
    if (this.pDn()) { this.menuCursor = (this.menuCursor + 1) % 4; }
    if (this.pStart()) {
      if (this.menuCursor === 0) { this.startGame(); }
      else if (this.menuCursor === 1) { this.gs = 'HOWTO'; this.stateTimer = 0; }
      else if (this.menuCursor === 2) { this.gs = 'HIGH_SCORE'; this.stateTimer = 0; }
      else { this.gs = 'TITLE'; this.stateTimer = 0; }
    }
  }
  uHowTo(_dt: number) { this.stateTimer += _dt; if (this.stateTimer > 0.3 && this.pAny()) { this.gs = 'MENU'; this.stateTimer = 0; } }
  uPaused(_dt: number) { if (this.pkeys['KeyP'] || this.pkeys['Escape'] || this.pStart()) { this.gs = 'PLAYING'; } }
  uLC(_dt: number) {
    this.stateTimer += _dt;
    if (this.stateTimer >= 3.5) {
      this.score += this.lcBonus; this.hiScore = Math.max(this.hiScore, this.score);
      this.level++; this.enemiesKilled = 0; this.enemiesToKill = 5 + this.level * 2; this.nextComboLife = 5 + Math.floor(Math.random() * 4);
      this.initLevel(); this.gs = 'PLAYING'; this.stateTimer = 0;
    }
  }
  uGO(_dt: number) {
    this.stateTimer += _dt;
    if (this.isHS() && this.stateTimer > 1) {
      const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      if (this.pUp()) { this.initials[this.initialsPos] = L[(L.indexOf(this.initials[this.initialsPos]) + 1) % 26]; }
      if (this.pDn()) { this.initials[this.initialsPos] = L[(L.indexOf(this.initials[this.initialsPos]) + 25) % 26]; }
      if (this.pStart()) {
        if (this.initialsPos < 2) { this.initialsPos++; }
        else { this.submitHS(); this.gs = 'HIGH_SCORE'; this.stateTimer = 0; }
      }
    } else if (!this.isHS() && this.stateTimer > 3 && this.pAny()) {
      this.gs = 'HIGH_SCORE'; this.stateTimer = 0;
    }
  }
  uHS(_dt: number) { this.stateTimer += _dt; if (this.stateTimer > 2 && this.pAny()) { this.gs = 'TITLE'; this.stateTimer = 0; } }

  startGame() {
    this.score = 0; this.lives = 3; this.level = 1;
    this.enemiesKilled = 0; this.enemiesToKill = 5; this.nextComboLife = 5 + Math.floor(Math.random() * 4);
    this.gs = 'PLAYING'; this.stateTimer = 0; this.initLevel();
  }

  initLevel() {
    // Regenerate the random layout only when advancing to a new level number
    // — dying and retrying the same level keeps that level's stairs so a
    // death doesn't feel like the ground shifted under you.
    if (this.mapLevel !== this.level) { this.levelData = genLevel(); this.mapLevel = this.level; }
    const data = this.levelData!;
    this.tileMap = data.grid.map(r => [...r]);
    this.HOLES = []; this.ITEMS = []; this.EN = []; this.POPUPS = []; this.particles = [];
    this.shakeT = 0; this.shakeMag = 0;
    this.spawnTimer = 1.5; this.spawnInterval = Math.max(2, 5 - (this.level - 1) * 0.3);
    this.maxEnemies = Math.min(8, 2 + Math.floor((this.level - 1) * 0.8));
    this.oxyDrain = 100 / Math.max(25, 60 - (this.level - 1) * 3);
    this.oxygen = 100;
    const gd = ENEMY_DEFS.gold;
    this.bossLevel = this.level >= gd.minLv && this.level % (gd.every || 5) === 0;
    this.bossSpawned = false; this.bossPending = 3;
    if (this.bossLevel) { this.maxEnemies = Math.max(this.maxEnemies, 3); }
    const T = this.cellSize;
    const [pc, pr] = data.playerStart;
    this.P = { x: pc * T + (T - 20) / 2, y: HUD_H + pr * T - 28, w: 20, h: 28, vx: 0, vy: 0, dir: 1, onG: true, onL: false, ldrEntryRow: -1, st: 'IDLE', af: 0, at: 0, dead: false, deadT: 0, inv: false, invT: 0, shield: 0, rapidT: 0, walkDustT: 0 };
  }

  // ══════════════ GAMEPLAY UPDATE ══════════════
  uPlay(dt: number) {
    if (this.pkeys['KeyP'] || this.pkeys['Escape']) { this.gs = 'PAUSED'; return; }
    this.oxygen -= this.oxyDrain * dt;
    if (this.oxygen <= 0) { this.oxygen = 0; this.killP(); }
    if (this.P.dead) {
      this.P.deadT -= dt;
      if (this.P.deadT <= 0) {
        this.lives--;
        if (this.lives <= 0) { this.gs = 'GAME_OVER'; this.stateTimer = 0; this.initials = ['A','A','A']; this.initialsPos = 0; }
        else { this.initLevel(); }
        return;
      }
    } else { this.updateP(dt); }
    this.updateEN(dt); this.updateHoles(dt); this.updateItems(dt); this.updatePopups(dt);
    if (this.bossLevel && !this.bossSpawned) { this.bossPending -= dt; if (this.bossPending <= 0) { this.spawnBoss(); this.bossSpawned = true; } }
    if (this.EN.length < this.maxEnemies) { this.spawnTimer -= dt; if (this.spawnTimer <= 0) { this.spawnEnemy(); this.spawnTimer = this.spawnInterval; } }
    if (!this.P.dead && !this.P.inv) {
      for (const en of this.EN) {
        if (en.st === 'TRAPPED' || en.st === 'RECOVERING') { continue; }
        if (this.aabb(this.P, en)) {
          if (this.P.shield > 0) { this.P.shield--; this.P.inv = true; this.P.invT = 1.1; this.addPopup('SHIELD!', this.P.x, this.P.y - 16, '#35d6a9'); }
          else { this.killP(); }
          return;
        }
      }
    }
    if (this.enemiesKilled >= this.enemiesToKill && !this.bossLevel) {
      this.lcBonus = Math.floor(this.oxygen) * 10 * this.level + this.enemiesKilled * 50;
      this.stateTimer = 0; this.gs = 'LEVEL_CLEAR';
    }
    if (this.bossLevel && this.bossSpawned && this.EN.length === 0) {
      this.lcBonus = Math.floor(this.oxygen) * 10 * this.level + this.enemiesKilled * 50;
      this.stateTimer = 0; this.gs = 'LEVEL_CLEAR';
    }
  }

  updateP(dt: number) {
    const P = this.P, T = this.cellSize;
    if (P.rapidT > 0) { P.rapidT = Math.max(0, P.rapidT - dt); }
    P.at += dt; if (P.at > 0.13) { P.af ^= 1; P.at = 0; }
    if (P.inv) { P.invT -= dt; if (P.invT <= 0) { P.inv = false; } }

    if (P.onL) {
      // ── LADDER MODE ──
      P.vx = 0; P.vy = 0;
      if (this.iU()) { P.vy = -VSPD; }
      else if (this.iD2()) { P.vy = VSPD; }
      P.st = P.vy !== 0 ? 'CLIMB' : 'IDLE';

      P.y += P.vy * dt;
      P.y = Math.max(HUD_H, P.y);

      // Exit ladder: land on a solid platform
      const col = Math.floor((P.x + P.w / 2) / T);
      for (let r = 0; r < ROWS; r++) {
        if (r === P.ldrEntryRow) { continue; } // skip the row we entered from
        const top = HUD_H + r * T;
        if (this.isSolid(col, r)) {
          if (P.vy < 0 && P.y + P.h <= top + 8 && P.y + P.h >= top - 16) {
            P.y = top - P.h; P.vy = 0; P.onG = true; P.onL = false; P.ldrEntryRow = -1; break;
          }
          if (P.vy > 0 && P.y + P.h >= top - 8 && P.y + P.h <= top + 24) {
            P.y = top - P.h; P.vy = 0; P.onG = true; P.onL = false; P.ldrEntryRow = -1; break;
          }
        }
      }
    } else {
      // ── GROUND / FALL MODE ──
      P.vx = 0;
      if (this.iL()) { P.vx = -HSPD; P.dir = -1; }
      if (this.iR()) { P.vx = HSPD; P.dir = 1; }
      P.st = P.vx !== 0 ? 'WALK' : 'IDLE';
      if (this.pDig()) { this.doDig(); }
      if (this.pHit()) { this.doHit(); }

      // Enter ladder from ground
      if (P.onG) {
        const col = Math.floor((P.x + P.w / 2) / T);
        const fr = this.getStandRow(P);
        if (fr >= 0) {
          if (this.iU() && this.getTile(col, fr - 1) === TLADR) {
            P.x = col * T + (T - P.w) / 2;
            P.onL = true; P.onG = false; P.vy = -VSPD; P.st = 'CLIMB'; P.vx = 0; P.ldrEntryRow = fr;
          } else if (this.iD2() && this.getTile(col, fr + 1) === TLADR) {
            P.x = col * T + (T - P.w) / 2;
            P.onL = true; P.onG = false; P.vy = VSPD; P.st = 'CLIMB'; P.vx = 0; P.ldrEntryRow = fr;
          }
        }
      }

      if (!P.onL) {
        // Apply gravity and move
        const wasOnG = P.onG;
        P.vy = Math.min(P.vy + GRAV * dt, MXF);
        P.y += P.vy * dt;
        P.y = Math.max(HUD_H, P.y);
        P.x += P.vx * dt;
        P.x = Math.max(0, Math.min(this.scale.width - P.w, P.x));
        P.onG = false;

        // Ground collision
        for (let r = 0; r < ROWS; r++) {
          const top = HUD_H + r * T;
          if (P.vy >= 0 && P.y + P.h >= top - 2 && P.y + P.h <= top + 24) {
            const col2 = Math.floor((P.x + P.w / 2) / T);
            if (this.isSolid(col2, r)) { P.y = top - P.h; P.vy = 0; P.onG = true; break; }
          }
        }
        if (!wasOnG && P.onG) { this.spawnDust(P.x + P.w / 2, P.y + P.h, 0xcfd8ff, 7); }
      }
    }

    // Cosmetic footstep dust while walking on solid ground (does not affect physics)
    if (P.onG && !P.onL && P.st === 'WALK') {
      P.walkDustT -= dt;
      if (P.walkDustT <= 0) { this.spawnDust(P.x + (P.dir > 0 ? 3 : P.w - 3), P.y + P.h - 2, 0x8fa3c8, 2, true); P.walkDustT = 0.16; }
    } else { P.walkDustT = Math.min(P.walkDustT, 0.05); }

    if (P.y + P.h > this.scale.height + 48) { this.killP(); }
  }

  doDig() {
    const P = this.P, T = this.cellSize;
    const fr = this.getStandRow(P);
    if (fr < 0 || fr >= ROWS) { return; }
    const col = Math.floor((P.x + P.w / 2) / T) + P.dir;
    if (col < 0 || col >= COLS) { return; }
    if (this.getTile(col, fr) !== TPLAT || this.HOLES.some(h => h.col === col && h.row === fr)) { return; }
    const dur = Math.max(2.5, 5 - (this.level - 1) * 0.2);
    this.HOLES.push({ col, row: fr, timer: dur, max: dur });
    this.tileMap[fr][col] = THOLE;
    P.st = 'DIG';
    this.spawnSparks(col * T + T / 2, HUD_H + fr * T + 3, LADDER_C, 10);
  }

  doHit() {
    for (let i = this.EN.length - 1; i >= 0; i--) {
      const en = this.EN[i];
      if (en.st !== 'TRAPPED') { continue; }
      const dx = (en.x + en.w / 2) - (this.P.x + this.P.w / 2);
      const dy = (en.y + en.h / 2) - (this.P.y + this.P.h / 2);
      if (Math.abs(dx) < 64 && Math.abs(dy) < 58) {
        en.hc++;
        const def = ENEMY_DEFS[en.type] || ENEMY_DEFS.red;
        this.spawnSparks(en.x + en.w / 2, en.y + en.h / 2, hexColor(def.accent), 6);
        if (en.hc >= en.hn) { this.killEN(i); }
        else { en.st = 'FALLING'; en.vy = 40; }
        this.P.st = 'HIT'; return;
      }
    }
  }

  killEN(i: number) {
    const en = this.EN[i], def = ENEMY_DEFS[en.type] || ENEMY_DEFS.red, pts = def.score;
    this.score += pts; this.hiScore = Math.max(this.hiScore, this.score);
    this.enemiesKilled++;
    if (this.enemiesKilled >= this.nextComboLife) {
      this.lives = Math.min(5, this.lives + 1);
      this.addPopup('+1 LIFE', en.x - 4, en.y - 28, '#ff5cc8');
      this.nextComboLife += 5 + Math.floor(Math.random() * 4);
    }
    this.addPopup('+' + pts, en.x - 4, en.y - 12, '#fff');
    this.spawnExplosion(en.x + en.w / 2, en.y + en.h / 2, hexColor(def.accent), en.isBoss ? 26 : 14);
    if (Math.random() < 0.4) {
      const r = Math.random();
      const type = r < 0.45 ? 'star' : r < 0.65 ? 'tank' : r < 0.80 ? 'shovel' : r < 0.92 ? 'shield' : 'life';
      this.ITEMS.push({ x: en.x + en.w / 2 - 6, y: en.y - 14, vy: -75, life: 3.5, type, w: 12, h: 14 });
    }
    this.EN.splice(i, 1);
  }

  killP() {
    if (this.P.dead) { return; }
    this.P.dead = true; this.P.deadT = 2; this.P.vx = 0; this.P.vy = 0;
    this.P.inv = true; this.P.invT = 2;
    this.shakeT = 0.4; this.shakeMag = 9;
    this.spawnExplosion(this.P.x + this.P.w / 2, this.P.y + this.P.h / 2, 0xff5c5c, 18);
  }

  // ══════════════ ENEMY AI ══════════════
  updateEN(dt: number) {
    const sm = 1 + (this.level - 1) * 0.06;
    for (let i = this.EN.length - 1; i >= 0; i--) {
      const en = this.EN[i];
      en.at += dt; if (en.at > 0.2) { en.af ^= 1; en.at = 0; }
      if (en.st === 'PATROL') { this.enPatrol(en, dt, sm); }
      else if (en.st === 'FALLING') { this.enFall(en, dt); }
      else if (en.st === 'CLIMB') { this.enClimb(en, dt); }
      else if (en.st === 'TRAPPED') { en.stT -= dt; if (en.stT <= 0) { en.st = 'RECOVERING'; en.recT = 0.75; } }
      else if (en.st === 'RECOVERING') {
        en.recT -= dt;
        if (en.recT <= 0) {
          en.st = 'PATROL'; en.hc = 0; en.dir *= -1;
          if (!en.isBoss) {
            const chainIdx = LEVEL_UP_CHAIN.indexOf(en.type);
            if (chainIdx >= 0 && chainIdx < LEVEL_UP_CHAIN.length - 1) {
              const oldDef = ENEMY_DEFS[en.type];
              const credit = Math.floor(oldDef.score * 0.25);
              this.score += credit; this.hiScore = Math.max(this.hiScore, this.score);
              this.addPopup('+' + credit, en.x - 4, en.y - 12, '#ffd23f');
              en.type = LEVEL_UP_CHAIN[chainIdx + 1];
              en.hn = ENEMY_DEFS[en.type].hn;
            }
          }
          en.vx = en.dir * this.spdOf(en.type) * sm;
        }
      }
    }
  }

  enClimb(en: Enemy, dt: number) {
    const T = this.cellSize;
    en.y += en.vy * dt;
    en.y = Math.max(HUD_H, en.y);
    const col = Math.floor((en.x + en.w / 2) / T);
    for (let r = 0; r < ROWS; r++) {
      const top = HUD_H + r * T;
      if (!this.isSolid(col, r)) { continue; }
      if (en.vy < 0 && en.y + en.h <= top + 8 && en.y + en.h >= top - 16) {
        en.y = top - en.h; en.vy = 0; en.onG = true; en.st = 'PATROL'; break;
      }
      if (en.vy > 0 && en.y + en.h >= top - 8 && en.y + en.h <= top + 24) {
        en.y = top - en.h; en.vy = 0; en.onG = true; en.st = 'PATROL'; break;
      }
    }
    if (en.y > this.scale.height + 120) { const idx = this.EN.indexOf(en); if (idx >= 0) this.EN.splice(idx, 1); }
  }

  spdOf(type: string) { return (ENEMY_DEFS[type] || {}).spd || 44; }

  enPatrol(en: Enemy, dt: number, sm: number) {
    const def = ENEMY_DEFS[en.type], T = this.cellSize;
    // Ladder climb
    if (def && def.climb && en.onG && Math.random() < dt * 0.35) {
      const col = Math.floor((en.x + en.w / 2) / T), fr = this.getStandRow(en);
      if (fr >= 0) {
        if (this.getTile(col, fr - 1) === TLADR) { en.x = col * T + (T - en.w) / 2; en.st = 'CLIMB'; en.vx = 0; en.vy = -VSPD * 0.8; en.onG = false; return; }
        if (this.getTile(col, fr + 1) === TLADR) { en.x = col * T + (T - en.w) / 2; en.st = 'CLIMB'; en.vx = 0; en.vy = VSPD * 0.8; en.onG = false; return; }
      }
    }
    // Teleport
    if (def && def.tele) { en.teleT -= dt; if (en.teleT <= 0) { en.x = Math.max(0, Math.min(this.scale.width - en.w, en.x + (56 + Math.random() * 40) * (Math.random() < 0.5 ? 1 : -1))); en.teleT = 1.8 + Math.random() * 1.6; } }
    // Dash
    let dashMul = 1;
    if (def && def.dash) {
      if (en.dashing) { dashMul = 2; en.dashUntil -= dt; if (en.dashUntil <= 0) { en.dashing = false; } }
      else { en.dashT -= dt; if (en.dashT <= 0) { en.dashing = true; en.dashUntil = 0.4; en.dashT = 2.5 + Math.random() * 2.5; } }
    }
    en.vy = Math.min(en.vy + GRAV * dt, MXF);
    en.x += en.dir * this.spdOf(en.type) * sm * dashMul * dt;
    en.y += en.vy * dt;
    en.x = Math.max(0, Math.min(this.scale.width - en.w, en.x));
    en.onG = false; this.resolveEn(en);
    // Turn around at screen edges — without this, an enemy that reaches x=0
    // or the right edge just sits position-clamped there forever (dir never
    // flips), which reads as the enemy being permanently stuck.
    if (en.onG) {
      if (en.x <= 0) { en.dir = 1; en.x = 2; }
      else if (en.x + en.w >= this.scale.width) { en.dir = -1; en.x = this.scale.width - en.w - 2; }
    }
    if (!en.onG && en.st !== 'TRAPPED') { en.st = 'FALLING'; }
    if (!this.P.dead && !this.P.inv && en.st !== 'TRAPPED' && en.st !== 'RECOVERING' && this.aabb(this.P, en)) {
      if (this.P.shield > 0) { this.P.shield--; this.P.inv = true; this.P.invT = 1.1; } else { this.killP(); }
    }
  }

  enFall(en: Enemy, dt: number) {
    en.vy = Math.min(en.vy + GRAV * dt, MXF);
    en.y += en.vy * dt;
    en.x = Math.max(0, Math.min(this.scale.width - en.w, en.x));
    en.onG = false; this.resolveEn(en);
    if (en.onG) { en.st = 'PATROL'; en.vy = 0; en.vx = en.dir * this.spdOf(en.type) * (1 + (this.level - 1) * 0.06); }
    if (en.y > this.scale.height + 120) { const idx = this.EN.indexOf(en); if (idx >= 0) this.EN.splice(idx, 1); }
  }

  pickEnemyType(): string {
    const defs = ENEMY_DEFS;
    const avail = Object.keys(defs).filter(k => !defs[k].boss && this.level >= defs[k].minLv);
    const weights = avail.map(k => Math.max(0.35, 260 / defs[k].score));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < avail.length; i++) { r -= weights[i]; if (r <= 0) { return avail[i]; } }
    return avail[0] || 'red';
  }

  // Pick a random floor row — every floor is a full-width valid entry point.
  randFloorTop(T: number) { return HUD_H + FLOOR_ROWS[Math.floor(Math.random() * FLOOR_ROWS.length)] * T; }

  spawnEnemy() {
    const left = Math.random() < 0.5, T = this.cellSize, type = this.pickEnemyType();
    const def = ENEMY_DEFS[type];
    this.EN.push({ x: left ? 4 : this.scale.width - 26, y: this.randFloorTop(T) - 22, w: 18, h: 22, vx: (left ? 1 : -1) * def.spd, vy: 0, dir: left ? 1 : -1, type, st: 'PATROL', af: 0, at: 0, stT: 0, recT: 0, hn: def.hn, hc: 0, onG: true, teleT: def.tele ? 1.5 + Math.random() * 1.5 : 0, dashT: def.dash ? 2.5 + Math.random() * 2 : 0, dashing: false, dashUntil: 0, isBoss: false, mSpawned: false });
  }

  spawnBoss() {
    const left = Math.random() < 0.5, T = this.cellSize, def = ENEMY_DEFS.gold;
    this.EN.push({ x: left ? 4 : this.scale.width - 52, y: this.randFloorTop(T) - 46, w: 40, h: 46, vx: (left ? 1 : -1) * def.spd, vy: 0, dir: left ? 1 : -1, type: 'gold', st: 'PATROL', af: 0, at: 0, stT: 0, recT: 0, hn: def.hn, hc: 0, onG: true, teleT: 0, dashT: 0, dashing: false, dashUntil: 0, isBoss: true, mSpawned: false });
  }

  // ══════════════ HOLE / ITEMS / PHYSICS ══════════════
  updateHoles(dt: number) {
    for (let i = this.HOLES.length - 1; i >= 0; i--) {
      const h = this.HOLES[i]; h.timer -= dt;
      if (h.timer <= 0) {
        this.tileMap[h.row][h.col] = TPLAT;
        this.spawnDust(h.col * this.cellSize + this.cellSize / 2, HUD_H + h.row * this.cellSize + 4, PLATFORM_HI, 6);
        this.HOLES.splice(i, 1);
        for (const en of this.EN) {
          if (en.st === 'TRAPPED') { const ec = Math.floor((en.x + en.w / 2) / this.cellSize); if (ec === h.col && this.getStandRow(en) === h.row) { en.st = 'PATROL'; } }
        }
      }
    }
  }

  updateItems(dt: number) {
    for (let i = this.ITEMS.length - 1; i >= 0; i--) {
      const it = this.ITEMS[i]; it.life -= dt; it.vy += 160 * dt; it.y += it.vy * dt;
      it.y = Math.min(it.y, this.scale.height - it.h);
      if (it.life <= 0) { this.ITEMS.splice(i, 1); continue; }
      if (!this.P.dead && this.aabb(this.P, it)) {
        this.spawnSparkle(it.x + it.w / 2, it.y + it.h / 2, ITEM_COLORS[it.type] || 0xffffff, 10);
        if (it.type === 'tank') { this.oxygen = Math.min(100, this.oxygen + 30); this.addPopup('AIR +30%', it.x, it.y, '#44e0ff'); }
        else if (it.type === 'life') { this.lives = Math.min(5, this.lives + 1); this.addPopup('+1 LIFE', it.x, it.y, '#ff5cc8'); }
        else if (it.type === 'shovel') { this.P.rapidT = 10; this.addPopup('RAPID DIG!', it.x, it.y, '#ffe066'); }
        else if (it.type === 'shield') { this.P.shield = Math.min(3, (this.P.shield || 0) + 1); this.addPopup('SHIELD!', it.x, it.y, '#35d6a9'); }
        else { this.score += 250; this.addPopup('+250', it.x, it.y, '#ffd23f'); }
        this.ITEMS.splice(i, 1);
      }
    }
  }

  updatePopups(dt: number) {
    for (let i = this.POPUPS.length - 1; i >= 0; i--) {
      const p = this.POPUPS[i]; p.life -= dt; p.y += p.vy * dt;
      if (p.life <= 0) { this.POPUPS.splice(i, 1); }
    }
  }

  resolveEn(en: Enemy) {
    const T = this.cellSize, fy = en.y + en.h;
    for (let r = 0; r < ROWS; r++) {
      const top = HUD_H + r * T;
      if (fy < top - 4 || fy > top + 26) { continue; }
      if (en.vy >= 0 && fy >= top - 4) {
        const tile = this.getTile(Math.floor((en.x + en.w / 2) / T), r);
        if (tile === THOLE) {
          en.st = 'TRAPPED'; en.stT = Math.max(1.5, 4 - en.hn * 0.7); en.vx = 0; en.vy = 0; en.y = top - Math.floor(en.h * 0.6); en.onG = true;
          const def = ENEMY_DEFS[en.type] || ENEMY_DEFS.red;
          this.spawnSparks(en.x + en.w / 2, en.y, hexColor(def.accent), 8);
          return;
        }
        if (this.isSolid(Math.floor((en.x + en.w / 2) / T), r)) { en.y = top - en.h; en.vy = 0; en.onG = true; return; }
      }
    }
  }

  aabb(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  addPopup(text: string, x: number, y: number, color: string) { this.POPUPS.push({ text, x, y, vy: -26, life: 0.9, color }); }

  // ══════════════ PARTICLES ("juice") ══════════════
  spawnDust(x: number, y: number, color: number, count = 6, tiny = false) {
    for (let i = 0; i < count; i++) {
      this.particles.push({ x, y, vx: (Math.random() - 0.5) * (tiny ? 22 : 42), vy: -(tiny ? 8 : 18) - Math.random() * 20, life: 0.28 + Math.random() * 0.24, maxLife: 0.52, color, size: tiny ? 0.8 + Math.random() : 1.4 + Math.random() * 1.6, grav: 70 });
    }
  }
  spawnSparks(x: number, y: number, color: number, count = 10) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2, spd = 40 + Math.random() * 90;
      this.particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd * 0.6 - 20, life: 0.22 + Math.random() * 0.28, maxLife: 0.5, color, size: 1 + Math.random() * 2, grav: 150 });
    }
  }
  spawnExplosion(x: number, y: number, color: number, count = 16) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2, spd = 30 + Math.random() * 130;
      this.particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0.35 + Math.random() * 0.4, maxLife: 0.75, color: Math.random() < 0.5 ? color : 0xffffff, size: 1.5 + Math.random() * 2.5, grav: 100 });
    }
  }
  spawnSparkle(x: number, y: number, color: number, count = 8) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2, spd = 15 + Math.random() * 35;
      this.particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 24, life: 0.4 + Math.random() * 0.3, maxLife: 0.7, color, size: 1 + Math.random() * 1.8, grav: -20 });
    }
  }
  updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); }
    }
  }
  rParticles(g: Phaser.GameObjects.Graphics) {
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      g.fillStyle(p.color, a);
      g.fillCircle(p.x, p.y, Math.max(0.4, p.size * a));
    }
  }

  stateChanged() {
    emitState({ score: this.score, level: this.level, lives: this.lives, oxygen: this.oxygen, oxygenMax: 100, gameOver: this.gs === 'GAME_OVER', started: this.gs === 'PLAYING' || this.gs === 'PAUSED' || this.gs === 'LEVEL_CLEAR', enemiesAlive: this.EN.length, state: this.gs, hiScore: this.hiScore, menuCursor: this.menuCursor, initialsEntry: this.gs === 'GAME_OVER' && this.isHS() && this.stateTimer > 1, initials: this.initials });
  }

  restart() {
    this.score = 0; this.lives = 3; this.level = 1; this.EN = []; this.HOLES = []; this.ITEMS = []; this.POPUPS = [];
    this.particles = []; this.shakeT = 0; this.shakeMag = 0;
    this.enemiesKilled = 0; this.enemiesToKill = 5; this.nextComboLife = 5 + Math.floor(Math.random() * 4);
    this.gs = 'TITLE'; this.stateTimer = 0; this.menuCursor = 0;
    this.initials = ['A','A','A']; this.initialsPos = 0; this.loadHS(); this.stateChanged();
  }

  // ══════════════ RENDERING ══════════════
  render() {
    this.bgGfx.clear(); this.gfx.clear(); this.uiGfx.clear();
    for (const o of this.txts) o.setVisible(false);
    for (const o of this.popupTxts) o.setVisible(false);

    const shakeX = this.shakeMag > 0 ? (Math.random() - 0.5) * this.shakeMag * 2 : 0;
    const shakeY = this.shakeMag > 0 ? (Math.random() - 0.5) * this.shakeMag * 2 : 0;
    this.gfx.setPosition(shakeX, shakeY);

    if (this.gs === 'TITLE') { this.rTitle(); }
    else if (this.gs === 'MENU') { this.rMenu(); }
    else if (this.gs === 'HOWTO') { this.rHowTo(); }
    else if (this.gs === 'PLAYING' || this.gs === 'PAUSED' || this.gs === 'LEVEL_CLEAR') {
      this.rGame();
      if (this.gs === 'PAUSED') { this.rPause(); }
      if (this.gs === 'LEVEL_CLEAR') { this.rLC(); }
    } else if (this.gs === 'GAME_OVER') { this.rGO(); }
    else if (this.gs === 'HIGH_SCORE') { this.rHSc(); }
  }

  rSpaceBG(w: number, h: number) {
    // Drawn on bgGfx (not the shaken gfx layer) — the starfield/nebula
    // backdrop should stay put while the game-grid layer shakes on impact.
    const g = this.bgGfx;
    g.fillGradientStyle(BG_TOP, BG_TOP, BG_MID, BG_BOT, 1);
    g.fillRect(0, 0, w, h);
    for (const n of this.nebula) { g.fillStyle(n.color, n.alpha); g.fillCircle(n.x, n.y, n.r); }
  }

  rStars() {
    for (const s of this.stars) {
      const t = (this.titleAnim + s.ph) % 2.4;
      const a = t < 1.2 ? t / 1.2 : (2.4 - t) / 1.2;
      this.bgGfx.fillStyle(s.col, Math.max(0.06, a * 0.85));
      this.bgGfx.fillCircle(s.x, s.y, s.s);
    }
  }

  rTitle() {
    const g = this.gfx, { width: w, height: h } = this.scale;
    this.rSpaceBG(w, h);
    this.rStars();
    drawGlow(g, w / 2, h * 0.26, w * 0.3, 0x5ad1ff, 0.5);
    this.txts[0].setOrigin(0.5, 0).setFontSize(Math.min(w / 14, 48)).setColor(TXT_BRIGHT).setText('SPACE').setPosition(w / 2, h * 0.18).setVisible(true);
    this.txts[1].setOrigin(0.5, 0).setFontSize(Math.min(w / 14, 48)).setColor(TXT_ACCENT).setText('PANIC').setPosition(w / 2, h * 0.33).setVisible(true);
    g.fillStyle(0x7ce3ff, 0.5); g.fillRect(w / 2 - 130, h * 0.42, 260, 2);
    this.txts[2].setOrigin(0, 0).setFontSize(6).setColor(TXT_FAINT).setText('(c) 1980 UNIVERSAL').setPosition(w / 2 - 90, h * 0.45).setVisible(true);
    const rowY = h * 0.56, rowScale = 1.5, rowGap = 20;
    const rowSprites: [string, number][] = [
      ['pw1', PLAYER_COLOR],
      ['er', hexColor(ENEMY_DEFS.red.accent)],
      ['eo', hexColor(ENEMY_DEFS.orange.accent)],
      ['eg', hexColor(ENEMY_DEFS.green.accent)],
      ['eb', hexColor(ENEMY_DEFS.blue.accent)],
    ];
    // Each sprite's true width varies (8-10 cols), so a fixed hand-tuned offset
    // per icon drifted the whole row off true center — lay it out from actual
    // sprite widths instead so it's centered regardless of sprite data changes.
    const rowWidths = rowSprites.map(([name]) => ((SP as any)[name]?.[0]?.length || 8) * PX * rowScale);
    const rowTotal = rowWidths.reduce((a, wpx) => a + wpx, 0) + rowGap * (rowSprites.length - 1);
    let rowX = w / 2 - rowTotal / 2;
    rowSprites.forEach(([name, color], i) => {
      drawSprite(g, name, rowX, rowY, color, false, rowScale);
      rowX += rowWidths[i] + rowGap;
    });
    if (this.blink % 1 < 0.62) {
      this.txts[3].setOrigin(0.5, 0).setFontSize(Math.min(w / 40, 14)).setColor(TXT_ACCENT).setText('PRESS ANY KEY').setPosition(w / 2, h * 0.82).setVisible(true);
    }
  }

  rMenu() {
    const g = this.gfx, { width: w, height: h } = this.scale;
    this.rSpaceBG(w, h);
    this.rStars();
    this.txts[0].setOrigin(0.5, 0).setFontSize(Math.min(w / 22, 26)).setColor(TXT_BRIGHT).setText('SPACE PANIC').setPosition(w / 2, h * 0.15).setVisible(true);
    g.fillStyle(0x7ce3ff, 0.35); g.fillRect(w / 2 - 145, h * 0.22, 290, 2);
    const items = ['1 PLAYER START', 'HOW TO PLAY', 'HIGH SCORES', 'BACK'];
    for (let i = 0; i < 4; i++) {
      const y = h * 0.28 + i * 46, sel = i === this.menuCursor;
      if (sel) {
        g.fillStyle(0x7ce3ff, 0.14); g.fillRect(w / 2 - 142, y - 8, 284, 28);
        g.lineStyle(1, 0x7ce3ff, 0.65); g.strokeRect(w / 2 - 142, y - 8, 284, 28);
      }
      this.txts[i + 1].setOrigin(0, 0).setFontSize(9).setColor(sel ? TXT_ACCENT : TXT_DIM).setText((sel && this.blink % 0.8 < 0.5 ? '> ' : '  ') + items[i]).setPosition(w / 2 - 108, y).setVisible(true);
    }
  }

  rHowTo() {
    const g = this.gfx, { width: w, height: h } = this.scale;
    this.rSpaceBG(w, h);
    this.rStars();
    this.txts[0].setOrigin(0.5, 0).setFontSize(Math.min(w / 35, 16)).setColor(TXT_BRIGHT).setText('HOW TO PLAY').setPosition(w / 2, h * 0.06).setVisible(true);
    const cw = w / 4;
    const steps = [
      { n: '1', s: 'pw1', t: 'WALK', c: PLAYER_COLOR, tc: TXT_ACCENT, d: 'MOVE LEFT/RIGHT,\nCLIMB LADDERS -\nNO JUMPING' },
      { n: '2', s: 'pd', t: 'DIG', c: LADDER_C, tc: TXT_GOLD, d: 'PRESS Z TO CARVE\nA HOLE IN THE\nPLATFORM AHEAD' },
      { n: '3', s: 'hole', t: 'TRAP', c: HOLE_RIM, tc: '#ff9d5c', d: 'LURE AN ALIEN\nOVER THE HOLE -\nIT FALLS STUNNED' },
      { n: '4', s: 'ph', t: 'HIT', c: 0xff5c5c, tc: TXT_DANGER, d: 'PRESS X WHILE\nTRAPPED - MISS IT\nIT LEVELS UP' },
    ];
    for (let i = 0; i < 4; i++) {
      const s = steps[i], cx = cw * i + cw / 2, base = 1 + i * 3;
      this.txts[base].setOrigin(0.5, 0).setFontSize(14).setColor(TXT_FAINT).setText(s.n).setPosition(cx, h * 0.16).setVisible(true);
      drawSprite(g, s.s, cx - 12, h * 0.22, s.c, false, 1.5);
      this.txts[base + 1].setOrigin(0.5, 0).setFontSize(7).setColor(s.tc).setText(s.t).setPosition(cx, h * 0.44).setVisible(true);
      this.txts[base + 2].setOrigin(0.5, 0).setFontSize(Math.min(w / 85, 6)).setColor(TXT_DIM).setText(s.d).setAlign('center').setLineSpacing(6).setPosition(cx, h * 0.5).setVisible(true);
    }
    if (this.blink % 1 < 0.62) { this.txts[PROMPT_TXT].setOrigin(0.5, 0).setFontSize(10).setColor(TXT_ACCENT).setText('PRESS ANY KEY').setPosition(w / 2, h * 0.88).setVisible(true); }
  }

  rGame() {
    const { width: w, height: h } = this.scale;
    this.rSpaceBG(w, h);
    this.rStars();
    this.rLevel();
    this.rHoles();
    this.rItems();
    this.rEnemies();
    this.rPlayer();
    this.rParticles(this.gfx);
    this.rOxygenVignette();
    this.rHUD();
    this.rPopups();
  }

  rHUD() {
    const g = this.uiGfx, { width: w } = this.scale;
    g.fillGradientStyle(0x070716, 0x070716, 0x0d0f28, 0x0d0f28, 1);
    g.fillRect(0, 0, w, HUD_H);
    g.fillStyle(0x7ce3ff, 0.55); g.fillRect(0, HUD_H - 2, w, 2);
    g.fillStyle(0x7ce3ff, 0.12); g.fillRect(0, HUD_H - 6, w, 4);

    this.txts[0].setOrigin(0, 0).setFontSize(6).setColor(TXT_DIM).setText('1UP').setPosition(10, 6).setVisible(true);
    this.txts[1].setOrigin(0, 0).setFontSize(9).setColor(TXT_BRIGHT).setText(String(this.score).padStart(6, '0')).setPosition(10, 17).setVisible(true);
    this.txts[2].setOrigin(0.5, 0).setFontSize(6).setColor(TXT_GOLD).setText('HI ' + String(this.hiScore).padStart(6, '0')).setPosition(w / 2, 6).setVisible(true);

    for (let i = 0; i < Math.min(this.lives, 5); i++) { drawSprite(g, 'li', w - 102 + i * 22, 8, PLAYER_COLOR, false, 1.3); }

    this.txts[3].setOrigin(0, 0).setFontSize(6).setColor(TXT_DIM).setText('LV' + String(this.level).padStart(2, '0')).setPosition(10, 36).setVisible(true);

    const bx = 60, by = 36, bw = w - 162, bh = 12, op = Math.max(0, this.oxygen / 100);
    const critical = op <= 0.25;
    const barColor = op > 0.5 ? 0x4bdba0 : op > 0.25 ? 0xffcf3f : (this.blink % 0.4 < 0.2 ? 0xff5c5c : 0x8a2222);
    if (critical) { g.fillStyle(0xff5c5c, 0.2 + Math.sin(this.blink * 10) * 0.08); g.fillRect(bx - 4, by - 4, bw + 8, bh + 8); }
    g.fillStyle(0x03040c, 0.6); g.fillRect(bx, by, bw, bh);
    g.fillGradientStyle(shade(barColor, 0.35), shade(barColor, 0.35), shade(barColor, -0.25), shade(barColor, -0.25), 1);
    g.fillRect(bx + 1, by + 1, Math.max(0, (bw - 2) * op), bh - 2);
    g.fillStyle(0xffffff, 0.35); g.fillRect(bx + 1, by + 1, Math.max(0, (bw - 2) * op), 2);
    g.lineStyle(1, shade(barColor, 0.3), 0.9); g.strokeRect(bx, by, bw, bh);

    this.txts[4].setOrigin(0, 0).setFontSize(6).setColor(TXT_DIM).setText('AIR').setPosition(bx - 20, by + 2).setVisible(true);

    let ix = w - 30;
    if (this.P && this.P.shield > 0) { for (let i = 0; i < this.P.shield; i++) { drawSprite(g, 'shield', ix, 30, 0x35d6a9, false, 1.5); ix -= 15; } }
    if (this.P && this.P.rapidT > 0) { drawSprite(g, 'shovelIcon', ix, 30, 0xffe066, false, 1.5); }
  }

  rLevel() {
    const g = this.gfx, T = this.cellSize;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const tile = this.tileMap[r][c], tx = c * T, ty = HUD_H + r * T;
      if (tile === TPLAT) {
        g.fillStyle(PLATFORM_LO); g.fillRect(tx, ty + 4, T, 3);
        g.fillStyle(PLATFORM_C); g.fillRect(tx, ty, T, 5);
        g.fillStyle(PLATFORM_HI, 0.9); g.fillRect(tx, ty, T, 1.5);
        for (let i = 5; i < T; i += 7) { g.fillStyle(PLATFORM_RIVET, 0.5); g.fillRect(tx + i, ty + 2, 2, 2); }
      } else if (tile === TLADR) {
        g.fillStyle(LADDER_LO, 0.9); g.fillRect(tx + 8, ty, 4, T); g.fillRect(tx + 20, ty, 4, T);
        g.fillStyle(LADDER_C, 0.95); g.fillRect(tx + 8, ty, 2, T); g.fillRect(tx + 20, ty, 2, T);
        g.fillStyle(LADDER_HI, 0.85); for (let i = 2; i < T; i += 8) { g.fillRect(tx + 10, ty + i, 10, 3); }
      } else if (tile === TPIPEL || tile === TPIPER) {
        g.fillStyle(PIPE_C, 0.16); g.fillRect(tx, ty, T, T);
        g.lineStyle(1.5, PIPE_LO, 0.7); g.strokeRect(tx + 1, ty + 1, T - 2, T - 2);
        g.fillStyle(PIPE_HI, 0.8); g.fillRect(tx + (tile === TPIPEL ? T - 5 : 0), ty + T / 2 - 4, 5, 8);
      }
    }
  }

  rHoles() {
    const g = this.gfx, T = this.cellSize;
    for (const h of this.HOLES) {
      const tx = h.col * T, ty = HUD_H + h.row * T;
      const closing = h.timer < 1.2;
      const rim = closing && this.blink % 0.22 < 0.11 ? HOLE_RIM_WARN : HOLE_RIM;
      g.fillStyle(0x020208); g.fillRect(tx + 2, ty, T - 4, 9);
      g.fillStyle(rim, 0.9); g.fillRect(tx, ty, 5, 3); g.fillRect(tx + T - 5, ty, 5, 3);
      g.fillStyle(rim, 0.35); g.fillRect(tx + 2, ty + 7, T - 4, 2);
      if (closing) { g.fillStyle(rim, 0.2); g.fillRect(tx, ty, T, 9); }
    }
  }

  rItems() {
    const g = this.gfx;
    for (const it of this.ITEMS) {
      const a = it.life > 1 ? 1 : Math.max(0, it.life);
      const c = ITEM_COLORS[it.type] || 0xffffff;
      drawGlow(g, it.x + it.w / 2, it.y + it.h / 2, 14, c, a);
      drawSprite(g, ITEM_SPRITES[it.type] || 'star', it.x, it.y, c, false, 1.5, a);
    }
  }

  rEnemies() {
    const g = this.gfx;
    for (const en of this.EN) {
      const def = ENEMY_DEFS[en.type] || ENEMY_DEFS.red, scale = en.isBoss ? 1.9 : 1.5;
      const accent = hexColor(def.accent);
      const cx = en.x + en.w / 2, cy = en.y + en.h / 2;
      if (en.st === 'TRAPPED') {
        drawGlow(g, cx, cy, en.isBoss ? 34 : 22, shade(accent, 0.3), 0.5);
        drawSprite(g, 'es', en.x + 1, en.y + 6, shade(accent, 0.45), false, scale);
        drawStunBurst(g, cx, en.y - (en.isBoss ? 8 : 5), accent, this.blink, en.isBoss ? 1.4 : 1);
        continue;
      }
      drawGlow(g, cx, cy, en.isBoss ? 30 : 16, accent, 0.45 + Math.sin(this.blink * 4 + en.x * 0.05) * 0.15);
      const climbDX = en.st === 'CLIMB' ? (en.af === 0 ? -1.5 : 1.5) : 0;
      const climbDY = en.st === 'CLIMB' ? (en.af === 0 ? 0.5 : -0.5) : 0;
      drawSprite(g, (def.frames || ['er', 'er2'])[en.af], en.x + climbDX, en.y + climbDY, accent, en.dir === -1, scale);
      if (en.dashing) { g.fillStyle(accent, 0.35); g.fillRect(en.x - en.dir * 12, en.y + en.h * 0.25, 12, en.h * 0.5); }
    }
  }

  rPlayer() {
    if (!this.P) return;
    if (this.P.dead && this.blink % 0.16 > 0.08) return;
    const nm = this.P.st === 'DIG' ? 'pd' : this.P.st === 'HIT' ? 'ph' : this.P.st === 'CLIMB' ? 'pc' : this.P.af === 0 ? 'pw1' : 'pw2';
    const cx = this.P.x + this.P.w / 2, cy = this.P.y + this.P.h / 2;
    const alpha = (this.P.inv && !this.P.dead && this.blink % 0.2 < 0.1) ? 0.4 : 1;
    // No dedicated climb sprite frames exist, so we fake the hand-over-hand
    // motion with a small alternating lean (reuses the same af toggle walking
    // uses) instead of the sprite just gliding up/down perfectly still.
    const climbDX = this.P.st === 'CLIMB' ? (this.P.af === 0 ? -1.5 : 1.5) : 0;
    const climbDY = this.P.st === 'CLIMB' ? (this.P.af === 0 ? 0.5 : -0.5) : 0;
    drawGlow(this.gfx, cx, cy, 18, PLAYER_ACCENT, 0.4 * alpha);
    drawSprite(this.gfx, nm, this.P.x + climbDX, this.P.y + climbDY, PLAYER_COLOR, this.P.dir === -1, 1.5, alpha);
  }

  rOxygenVignette() {
    if (this.oxygen > 22) return;
    const g = this.gfx, { width: w, height: h } = this.scale;
    const pulse = 0.18 + Math.abs(Math.sin(this.blink * 5)) * 0.16;
    g.fillStyle(0xff2b2b, pulse * 0.5);
    g.fillRect(0, HUD_H, w, 6); g.fillRect(0, h - 6, w, 6);
    g.fillRect(0, HUD_H, 6, h - HUD_H); g.fillRect(w - 6, HUD_H, 6, h - HUD_H);
    g.fillStyle(0xff2b2b, pulse * 0.18); g.fillRect(0, HUD_H, w, 26);
  }

  rPopups() {
    const n = Math.min(this.POPUPS.length, this.popupTxts.length);
    for (let i = 0; i < n; i++) {
      const p = this.POPUPS[i], t = this.popupTxts[i];
      const age = 0.9 - p.life;
      const pop = Math.min(1, Math.max(0, age) / 0.1);
      const scale = 0.65 + pop * 0.45;
      const alpha = p.life < 0.35 ? Math.max(0, p.life / 0.35) : 1;
      t.setText(p.text).setColor(p.color).setPosition(p.x, p.y).setScale(scale).setAlpha(alpha).setVisible(true);
    }
  }

  rPause() {
    const g = this.uiGfx, { width: w, height: h } = this.scale;
    g.fillStyle(0x03040c, 0.72); g.fillRect(0, 0, w, h);
    drawGlow(g, w / 2, h / 2, 90, 0x7ce3ff, 0.25);
    g.fillStyle(0x0b0e24, 0.96); g.fillRect(w / 2 - 112, h / 2 - 54, 224, 108);
    g.lineStyle(2, 0x7ce3ff, 0.8); g.strokeRect(w / 2 - 112, h / 2 - 54, 224, 108);
    this.txts[10].setOrigin(0.5, 0).setFontSize(16).setColor(TXT_BRIGHT).setText('PAUSED').setPosition(w / 2, h / 2 - 30).setVisible(true);
    this.txts[11].setOrigin(0, 0).setFontSize(6).setColor(TXT_DIM).setText('P / ESC  RESUME').setPosition(w / 2 - 94, h / 2 + 4).setVisible(true);
    this.txts[12].setOrigin(0, 0).setFontSize(6).setColor(TXT_FAINT).setText('SCORE: ' + String(this.score).padStart(6, '0')).setPosition(w / 2 - 94, h / 2 + 22).setVisible(true);
  }

  rLC() {
    const g = this.uiGfx, { width: w, height: h } = this.scale;
    g.fillStyle(0x03040c, 0.8); g.fillRect(0, 0, w, h);
    const flashA = Math.max(0, 0.55 - this.stateTimer * 1.6);
    drawGlow(g, w / 2, h * 0.4, 140, 0x4bdba0, 0.3);
    if (flashA > 0) { g.fillStyle(0xffffff, flashA); g.fillRect(0, 0, w, h); }
    this.txts[10].setOrigin(0.5, 0).setFontSize(9).setColor(TXT_GOOD).setText('STAGE CLEAR!').setPosition(w / 2, h * 0.28).setVisible(true);
    this.txts[11].setOrigin(0.5, 0).setFontSize(Math.min(w / 20, 28)).setColor(TXT_BRIGHT).setText('LEVEL ' + String(this.level).padStart(2, '0')).setPosition(w / 2, h * 0.38).setVisible(true);
    this.txts[12].setOrigin(0, 0).setFontSize(7).setColor(TXT_ACCENT).setText('AIR BONUS: ' + Math.floor(this.oxygen * 10 * this.level) + ' PTS').setPosition(w / 2 - 132, h * 0.52).setVisible(true);
    this.txts[13].setOrigin(0, 0).setFontSize(7).setColor('#ff9d5c').setText('KILL BONUS: ' + this.enemiesKilled * 50 + ' PTS').setPosition(w / 2 - 132, h * 0.57).setVisible(true);
    this.txts[14].setOrigin(0.5, 0).setFontSize(10).setColor(TXT_GOLD).setText('TOTAL: ' + this.lcBonus + ' PTS').setPosition(w / 2, h * 0.66).setVisible(true);
    if (this.blink % 1 < 0.6) { this.txts[15].setOrigin(0.5, 0).setFontSize(14).setColor(TXT_ACCENT).setText('READY!').setPosition(w / 2, h * 0.78).setVisible(true); }
  }

  rGO() {
    const { width: w, height: h } = this.scale;
    this.rSpaceBG(w, h); this.rStars();
    drawGlow(this.gfx, w / 2, h * 0.28, 160, 0xff5c5c, 0.3);
    this.txts[0].setOrigin(0.5, 0).setFontSize(Math.min(w / 12, 40)).setColor(TXT_DANGER).setText('GAME OVER').setPosition(w / 2, h * 0.25).setVisible(true);
    this.txts[1].setOrigin(0, 0).setFontSize(9).setColor(TXT_BRIGHT).setText('SCORE: ' + String(this.score).padStart(6, '0')).setPosition(w / 2 - 96, h * 0.48).setVisible(true);
    if (this.isHS() && this.stateTimer > 1) {
      this.txts[2].setOrigin(0, 0).setFontSize(7).setColor(TXT_GOLD).setText('NEW HIGH SCORE!').setPosition(w / 2 - 93, h * 0.56).setVisible(true);
      this.txts[3].setOrigin(0, 0).setFontSize(6).setColor(TXT_DIM).setText('ENTER INITIALS:').setPosition(w / 2 - 93, h * 0.61).setVisible(true);
      this.txts[4].setOrigin(0.5, 0).setFontSize(18).setColor(TXT_ACCENT).setText(this.initials.join(' ')).setPosition(w / 2, h * 0.67).setVisible(true);
      this.txts[5].setOrigin(0, 0).setFontSize(5).setColor(TXT_FAINT).setText('UP/DOWN: CHANGE   ENTER: CONFIRM').setPosition(w / 2 - 122, h * 0.78).setVisible(true);
    } else if (!this.isHS() && this.blink % 1.2 < 0.8) {
      this.txts[PROMPT_TXT].setOrigin(0.5, 0).setFontSize(8).setColor(TXT_DIM).setText('PRESS ANY KEY').setPosition(w / 2, h * 0.68).setVisible(true);
    }
  }

  rHSc() {
    const { width: w, height: h } = this.scale;
    this.rSpaceBG(w, h); this.rStars();
    this.txts[0].setOrigin(0.5, 0).setFontSize(Math.min(w / 40, 14)).setColor(TXT_BRIGHT).setText('HIGH SCORES').setPosition(w / 2, h * 0.05).setVisible(true);
    const medal = ['#ffd23f', '#c9d3e0', '#d98a4c'];
    for (let i = 0; i < Math.min(this.HS.length, 10); i++) {
      const hs = this.HS[i], y = h * 0.12 + i * 30;
      const color = i < 3 ? medal[i] : TXT_DIM;
      if (i === 0) { drawGlow(this.gfx, 14, y + 4, 12, 0xffd23f, 0.5); }
      this.txts[i + 1].setOrigin(0, 0).setFontSize(7).setColor(color).setText((i + 1) + '. ' + hs.n + '  ' + String(hs.s).padStart(6, '0') + '  LV' + String(hs.l).padStart(2, '0')).setPosition(30, y).setVisible(true);
    }
    if (this.stateTimer > 2 && this.blink % 1.2 < 0.8) { this.txts[PROMPT_TXT].setOrigin(0.5, 0).setFontSize(7).setColor(TXT_ACCENT).setText('PRESS ANY KEY').setPosition(w / 2, h - 18).setVisible(true); }
  }
}
