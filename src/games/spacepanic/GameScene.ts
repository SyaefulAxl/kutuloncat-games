import Phaser from 'phaser';
import { genLevel, FLOOR_ROWS, LevelData } from './levels';
import { SP, ENEMY_DEFS, hexColor, SpriteGrid, PLAYER_COLOR, PLAYER_ACCENT } from './sprites';

const COLS = 16, ROWS = 12, PX = 2;
// Design space vs backing store: all game logic/layout lives in a fixed
// 512×448 coordinate space, rendered inside a root container scaled ×RES onto
// a 1024×896 canvas. Vectors re-rasterize at the higher density and text
// objects carry a matching resolution, so nothing turns soft when the page
// scales the canvas up on laptop screens or high-DPI phones.
const VW = 512, VH = 448, RES = 2;
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

const ITEM_COLORS: Record<string, number> = { star: 0xffd23f, tank: 0x44e0ff, shovel: 0xffe066, shield: 0x35d6a9, life: 0xff5cc8, boost: 0xff9d42 };
const ITEM_SPRITES: Record<string, string> = { star: 'star', tank: 'tank', shovel: 'shovelIcon', shield: 'shield', life: 'li', boost: 'boost' };

// Display names for the ALIEN GUIDE screen (order = unlock order).
const GUIDE_NAMES: Record<string, string> = { red: 'CRAWLER', orange: 'SQUID', green: 'BUG', blue: 'ROBOT', purple: 'PHANTOM', cyan: 'CLIMBER', yellow: 'SPRINTER', magenta: 'BRUTE', teal: 'WARDEN', crimson: 'REAPER', silver: 'SENTINEL', gold: 'OVERLORD' };

// Deterministic PRNG for daily-challenge layouts (same seed → same stairs
// for every player on the same UTC date).
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

// ── RETRO SFX ──
// Synthesized square/triangle blips via Web Audio — no asset files. One
// module-level instance so remounting the scene never stacks AudioContexts.
// The context is created lazily inside a user-gesture-driven update, which
// satisfies browser autoplay policies.
class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;
  constructor() { try { this.muted = localStorage.getItem('sp80_mute') === '1'; } catch { /* private mode */ } }
  toggle(): boolean {
    this.muted = !this.muted;
    try { localStorage.setItem('sp80_mute', this.muted ? '1' : '0'); } catch { /* ignore */ }
    return !this.muted;
  }
  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    if (this.muted) return;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const c = this.ctx;
      if (c.state === 'suspended') c.resume();
      const t = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch { /* audio unavailable — play silently */ }
  }
  menu()  { this.tone(520, 520, 0.05, 'square', 0.04); }
  start() { this.tone(440, 660, 0.09, 'square', 0.05); this.tone(660, 990, 0.12, 'square', 0.05, 0.09); }
  dig()   { this.tone(180, 70, 0.12, 'square', 0.06); }
  trap()  { this.tone(320, 110, 0.18, 'square', 0.05); }
  hit()   { this.tone(140, 60, 0.1, 'square', 0.07); }
  kill()  { this.tone(330, 330, 0.06, 'square', 0.05); this.tone(440, 440, 0.06, 'square', 0.05, 0.06); this.tone(660, 660, 0.09, 'square', 0.05, 0.12); }
  item()  { this.tone(880, 1320, 0.09, 'triangle', 0.06); }
  life()  { this.tone(660, 660, 0.08, 'triangle', 0.06); this.tone(990, 990, 0.12, 'triangle', 0.06, 0.08); }
  death() { this.tone(440, 55, 0.5, 'sawtooth', 0.07); }
  clear() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.12, 'square', 0.05, i * 0.11)); }
  warn()  { this.tone(880, 880, 0.07, 'square', 0.05); this.tone(880, 880, 0.07, 'square', 0.05, 0.12); }
  door()  { this.tone(140, 260, 0.16, 'triangle', 0.035); }

  // Minimal chiptune loop: a bass square on every 8th note plus a sparse
  // triangle arp, scheduled a beat ahead against the AudioContext clock from
  // the game loop (no setInterval to leak). Speeds up and jumps an octave
  // while oxygen is critical.
  private mNext = 0; private mStep = 0;
  musicTick(active: boolean, intensity: number) {
    if (this.muted || !active || !this.ctx || this.ctx.state !== 'running') { this.mNext = 0; return; }
    const c = this.ctx;
    const spb = intensity > 0 ? 0.205 : 0.26;
    if (this.mNext < c.currentTime) { this.mNext = c.currentTime + 0.06; }
    while (this.mNext < c.currentTime + 0.22) {
      const dly = this.mNext - c.currentTime;
      const bass = [110, 110, 131, 110, 147, 110, 165, 147][this.mStep % 8] * (intensity > 0 ? 2 : 1);
      this.tone(bass, bass, 0.11, 'square', 0.02, dly);
      if (this.mStep % 2 === 0) {
        const arp = [220, 262, 330, 392][(this.mStep >> 1) % 4] * (intensity > 0 ? 2 : 1);
        this.tone(arp, arp, 0.06, 'triangle', 0.013, dly);
      }
      this.mStep++; this.mNext += spb;
    }
  }
}
const sfx = new Sfx();

// Page-level mute control (header speaker button) shares the same instance
// as the in-game M key.
export function toggleSpMute(): boolean { return sfx.toggle(); }
export function isSpMuted(): boolean { return sfx.muted; }

interface Player { x: number; y: number; w: number; h: number; vx: number; vy: number; dir: number; onG: boolean; onL: boolean; ldrEntryRow: number; st: string; af: number; at: number; dead: boolean; deadT: number; inv: boolean; invT: number; shield: number; rapidT: number; boostT: number; walkDustT: number; }
interface Enemy { x: number; y: number; w: number; h: number; vx: number; vy: number; dir: number; type: string; st: string; af: number; at: number; stT: number; recT: number; hn: number; hc: number; onG: boolean; teleT: number; dashT: number; dashing: boolean; dashUntil: number; isBoss: boolean; mSpawned: boolean; ldrRow: number; }
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
  private tapped = false; private tapX = 0; private tapY = 0;
  private isTouch = false;
  private lastStateKey = '';
  private totalKills = 0; private bossKills = 0; private startTime = 0;
  private sessionCtx: { sessionId: string; startedAt: number; token: string } | null = null;
  private pending: { left: boolean; rowTop: number; type: string; boss: boolean; t: number }[] = [];
  private combo = 0; private comboT = 0; private maxCombo = 0;
  private daily = false; private dailyDate = '';
  private dailyRows: { n: string; s: number }[] | null = null;

  constructor() { super({ key: 'SpacePanicScene' }); }

  create() {
    for (let i = 0; i < 28; i++)
      this.stars.push({ x: Phaser.Math.Between(10, VW - 10), y: Phaser.Math.Between(10, VH - 10), s: Phaser.Math.FloatBetween(0.8, 2.2), spd: Phaser.Math.FloatBetween(0.5, 2), ph: Math.random() * 6, col: STAR_COLORS[Phaser.Math.Between(0, STAR_COLORS.length - 1)] });
    for (let i = 0; i < 5; i++)
      this.nebula.push({ x: Phaser.Math.Between(0, VW), y: Phaser.Math.Between(0, VH), r: Phaser.Math.Between(70, 150), color: NEBULA_COLORS[i % NEBULA_COLORS.length], alpha: Phaser.Math.FloatBetween(0.08, 0.16) });
    this.bgGfx = this.add.graphics();
    this.gfx = this.add.graphics();
    this.uiGfx = this.add.graphics();
    for (let i = 0; i < TXT_POOL_SIZE; i++) {
      this.txts.push(this.add.text(0, 0, '', { fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#ffffff', stroke: '#020208', strokeThickness: 2 }).setResolution(RES * 2).setVisible(false));
    }
    for (let i = 0; i < 8; i++) {
      this.popupTxts.push(this.add.text(0, 0, '', { fontFamily: '"Press Start 2P", monospace', fontSize: '9px', color: '#ffffff', stroke: '#020208', strokeThickness: 2 }).setOrigin(0.5).setResolution(RES * 2).setVisible(false));
    }
    // Child order inside the scaled root container defines the z-order
    // (containers ignore per-object depth): backdrop → world → HUD overlay →
    // popups → labels.
    this.add.container(0, 0, [this.bgGfx, this.gfx, this.uiGfx, ...this.popupTxts, ...this.txts]).setScale(RES);
    (window as any).__spScene = this;
    window.dispatchEvent(new Event('sp-scene-ready'));
    this.loadHS();
    this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
    // Canvas taps/clicks drive every non-gameplay screen (start, menu select,
    // resume, continue) so mobile players aren't forced onto the tiny OK
    // button. Taps are deliberately ignored while PLAYING so a stray touch
    // never pauses the game or triggers an action.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // pointer coords arrive in backing-store space → map to design space
      this.tapped = true; this.tapX = p.x / RES; this.tapY = p.y / RES;
    });
    this._kd = (e: KeyboardEvent) => { if (!this.keys[e.code]) this.pkeys[e.code] = true; this.keys[e.code] = true; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault(); };
    this._ku = (e: KeyboardEvent) => { this.keys[e.code] = false; };
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    // Phaser never calls a plain instance destroy() method — cleanup must be
    // wired through the scene's own event emitter to actually run.
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      this._dead = true;
      window.removeEventListener('keydown', this._kd);
      window.removeEventListener('keyup', this._ku);
      // Drop the globals so page code can't poke a destroyed scene after
      // navigating away (a fresh mount re-registers them).
      if ((window as any).__spScene === this) {
        delete (window as any).__spScene;
        delete (window as any).__spState;
      }
    });
    // "Press Start 2P" loads async from Google Fonts; labels rasterized before
    // it arrives would keep the fallback font (Phaser only re-rasterizes when
    // text or style changes), so force a refresh once the font is ready.
    document.fonts?.ready.then(() => {
      if (this._dead) return;
      for (const t of this.txts) t.updateText();
      for (const t of this.popupTxts) t.updateText();
    });
  }
  private _kd!: (e: KeyboardEvent) => void;
  private _ku!: (e: KeyboardEvent) => void;
  private _dead = false;

  // Input
  iL(){return this.keys['ArrowLeft']||!!this.touch.left;}
  iR(){return this.keys['ArrowRight']||!!this.touch.right;}
  iU(){return this.keys['ArrowUp']||!!this.touch.up;}
  iD2(){return this.keys['ArrowDown']||!!this.touch.down;}
  pDig(){return!!(this.pkeys['KeyZ']||this.pkeys['KeyA']||(this.touch.dig&&!this.prevTouch.dig));}
  pHit(){return!!(this.pkeys['KeyX']||this.pkeys['KeyS']||(this.touch.hit&&!this.prevTouch.hit));}
  pStart(){return!!(this.pkeys['Enter']||this.pkeys['Space']||(this.touch.start&&!this.prevTouch.start));}
  pAny(){return Object.values(this.pkeys).some(v=>v)||this.tapped||(this.touch.start&&!this.prevTouch.start)||(this.touch.dig&&!this.prevTouch.dig)||(this.touch.hit&&!this.prevTouch.hit);}
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
  get cellSize(){return Math.min(Math.floor(VW/COLS),Math.floor((VH-HUD_H)/ROWS));}

  // ══════════════ STATE MACHINE ══════════════
  update(_t: number, delta: number) {
    const dt = Math.min(delta / 1000, 0.05);
    this.gameTime += dt; this.blink += dt; this.titleAnim += dt;
    if (this.shakeT > 0) { this.shakeT -= dt; this.shakeMag *= 0.9; if (this.shakeT <= 0) { this.shakeT = 0; this.shakeMag = 0; } }
    this.updateParticles(dt);
    if (this.pkeys['KeyM']) {
      const on = sfx.toggle();
      if (this.gs === 'PLAYING' && this.P) { this.addPopup(on ? 'SOUND ON' : 'SOUND OFF', this.P.x - 8, this.P.y - 22, '#7ce3ff'); }
      if (on) { sfx.menu(); }
      window.dispatchEvent(new Event('sp-mute')); // keep the header button in sync
    }
    sfx.musicTick(this.gs === 'PLAYING', this.oxygen <= 22 ? 1 : 0);
    if (this.gs === 'TITLE') this.uTitle(dt);
    else if (this.gs === 'MENU') this.uMenu(dt);
    else if (this.gs === 'HOWTO') this.uHowTo(dt);
    else if (this.gs === 'GUIDE') this.uGuide(dt);
    else if (this.gs === 'PLAYING') this.uPlay(dt);
    else if (this.gs === 'PAUSED') this.uPaused(dt);
    else if (this.gs === 'LEVEL_CLEAR') this.uLC(dt);
    else if (this.gs === 'GAME_OVER') this.uGO(dt);
    else if (this.gs === 'HIGH_SCORE') this.uHS(dt);
    else if (this.gs === 'DAILY_HS') this.uHS(dt);
    this.render();
    this.stateChanged();
    this.pkeys = {}; this.prevTouch = { ...this.touch }; this.tapped = false;
  }

  uTitle(_dt: number) { this.stateTimer += _dt; if (this.pAny()) { sfx.menu(); this.gs = 'MENU'; this.stateTimer = 0; this.menuCursor = 0; } }
  uMenu(_dt: number) {
    // Direct tap/click on a menu row selects and activates it in one gesture
    // (hit rects match rMenu's row geometry, padded for fat fingers).
    if (this.tapped) {
      const w = VW, h = VH;
      for (let i = 0; i < 6; i++) {
        const y = h * 0.26 + i * 42;
        if (this.tapX >= w / 2 - 150 && this.tapX <= w / 2 + 150 && this.tapY >= y - 12 && this.tapY <= y + 28) {
          this.menuCursor = i; this.activateMenu(i); return;
        }
      }
    }
    if (this.pUp()) { this.menuCursor = (this.menuCursor + 5) % 6; sfx.menu(); }
    if (this.pDn()) { this.menuCursor = (this.menuCursor + 1) % 6; sfx.menu(); }
    if (this.pStart()) { this.activateMenu(this.menuCursor); }
  }
  private activateMenu(i: number) {
    if (i > 1) { sfx.menu(); }
    if (i === 0) { this.startGame(); }
    else if (i === 1) { this.startGame(true); }
    else if (i === 2) { this.gs = 'HOWTO'; this.stateTimer = 0; }
    else if (i === 3) { this.gs = 'GUIDE'; this.stateTimer = 0; }
    else if (i === 4) { this.gs = 'HIGH_SCORE'; this.stateTimer = 0; }
    else { this.gs = 'TITLE'; this.stateTimer = 0; }
  }
  uHowTo(_dt: number) { this.stateTimer += _dt; if (this.stateTimer > 0.3 && this.pAny()) { this.gs = 'MENU'; this.stateTimer = 0; } }
  uGuide(_dt: number) { this.stateTimer += _dt; if (this.stateTimer > 0.3 && this.pAny()) { sfx.menu(); this.gs = 'MENU'; this.stateTimer = 0; } }
  uPaused(_dt: number) { if (this.pkeys['KeyP'] || this.pkeys['Escape'] || this.pStart() || this.tapped) { this.gs = 'PLAYING'; } }
  uLC(_dt: number) {
    this.stateTimer += _dt;
    // Auto-advance after 2s, or skip with dig/hit/start/tap — the 0.6s guard
    // keeps button-mashing from the fight from blowing past the bonus screen.
    const skip = this.stateTimer > 0.6 && (this.pDig() || this.pHit() || this.pStart() || this.tapped);
    if (this.stateTimer >= 2 || skip) {
      this.score += this.lcBonus; this.hiScore = Math.max(this.hiScore, this.score);
      this.level++; this.enemiesKilled = 0; this.enemiesToKill = 5 + this.level * 2; this.nextComboLife = 5 + Math.floor(Math.random() * 4);
      this.initLevel(); this.gs = 'PLAYING'; this.stateTimer = 0;
    }
  }
  uGO(_dt: number) {
    this.stateTimer += _dt;
    if (this.isHS() && this.stateTimer > 1) {
      const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      if (this.pUp()) { this.initials[this.initialsPos] = L[(L.indexOf(this.initials[this.initialsPos]) + 1) % 26]; sfx.menu(); }
      if (this.pDn()) { this.initials[this.initialsPos] = L[(L.indexOf(this.initials[this.initialsPos]) + 25) % 26]; sfx.menu(); }
      if (this.pStart() || this.tapped) {
        sfx.menu();
        if (this.initialsPos < 2) { this.initialsPos++; }
        else { this.submitHS(); this.gs = this.daily ? 'DAILY_HS' : 'HIGH_SCORE'; this.stateTimer = 0; }
      }
    } else if (!this.isHS() && this.stateTimer > 3 && this.pAny()) {
      this.gs = this.daily ? 'DAILY_HS' : 'HIGH_SCORE'; this.stateTimer = 0;
    }
  }
  uHS(_dt: number) { this.stateTimer += _dt; if (this.stateTimer > 2 && this.pAny()) { this.gs = 'TITLE'; this.stateTimer = 0; } }

  startGame(daily = false) {
    // Daily mode shares one UTC-dated layout seed with every player; the
    // casual mode stays fully random per run.
    this.daily = daily;
    this.dailyDate = new Date().toISOString().slice(0, 10);
    this.dailyRows = null;
    this.combo = 0; this.comboT = 0; this.maxCombo = 0;
    this.score = 0; this.lives = 3; this.level = 1;
    // Force a fresh random layout for every new run — without this, mapLevel
    // stayed at 1 from the previous game so replays reused the same stairs.
    // (Dying and retrying within a run still keeps that level's layout.)
    this.mapLevel = -1;
    this.enemiesKilled = 0; this.enemiesToKill = 5; this.nextComboLife = 5 + Math.floor(Math.random() * 4);
    this.totalKills = 0; this.bossKills = 0; this.startTime = Date.now();
    sfx.start();
    this.startSession();
    this.gs = 'PLAYING'; this.stateTimer = 0; this.initLevel();
  }

  initLevel() {
    // Regenerate the random layout only when advancing to a new level number
    // — dying and retrying the same level keeps that level's stairs so a
    // death doesn't feel like the ground shifted under you.
    if (this.mapLevel !== this.level) {
      this.levelData = this.daily
        ? genLevel(mulberry32(Number(this.dailyDate.replace(/-/g, '')) * 37 + this.level))
        : genLevel();
      this.mapLevel = this.level;
    }
    const data = this.levelData!;
    this.tileMap = data.grid.map(r => [...r]);
    this.HOLES = []; this.ITEMS = []; this.EN = []; this.POPUPS = []; this.particles = []; this.pending = [];
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
    this.P = { x: pc * T + (T - 20) / 2, y: HUD_H + pr * T - 28, w: 20, h: 28, vx: 0, vy: 0, dir: 1, onG: true, onL: false, ldrEntryRow: -1, st: 'IDLE', af: 0, at: 0, dead: false, deadT: 0, inv: false, invT: 0, shield: 0, rapidT: 0, boostT: 0, walkDustT: 0 };
    // Spawn grace: brief invulnerability so an enemy walking over the spawn
    // point can't kill the player before they get a chance to move.
    this.P.inv = true; this.P.invT = 1.0;
  }

  // ══════════════ GAMEPLAY UPDATE ══════════════
  uPlay(dt: number) {
    // The mobile OK button doubles as pause during play (it has no other
    // in-game role) — without this, touch players had no way to pause at all.
    if (this.pkeys['KeyP'] || this.pkeys['Escape'] || (this.touch.start && !this.prevTouch.start)) { this.gs = 'PAUSED'; return; }
    const prevOxy = this.oxygen;
    this.oxygen -= this.oxyDrain * dt;
    if (prevOxy > 22 && this.oxygen <= 22) { sfx.warn(); }
    if (this.oxygen <= 0) { this.oxygen = 0; this.killP(); }
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) { this.combo = 0; } }
    if (this.P.dead) {
      this.P.deadT -= dt;
      if (this.P.deadT <= 0) {
        this.lives--;
        if (this.lives <= 0) { this.gs = 'GAME_OVER'; this.stateTimer = 0; this.initials = ['A','A','A']; this.initialsPos = 0; this.submitScore(); }
        else { this.initLevel(); }
        return;
      }
    } else { this.updateP(dt); }
    this.updateEN(dt); this.updateHoles(dt); this.updateItems(dt); this.updatePopups(dt);
    if (this.bossLevel && !this.bossSpawned) { this.bossPending -= dt; if (this.bossPending <= 0) { this.queueSpawn(true); this.bossSpawned = true; } }
    if (this.EN.length + this.pending.length < this.maxEnemies) { this.spawnTimer -= dt; if (this.spawnTimer <= 0) { this.queueSpawn(false); this.spawnTimer = this.spawnInterval; } }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i]; p.t -= dt;
      if (p.t <= 0) { this.spawnFromPending(p); this.pending.splice(i, 1); }
    }
    if (!this.P.dead && !this.P.inv) {
      for (const en of this.EN) {
        if (en.st === 'TRAPPED' || en.st === 'RECOVERING') { continue; }
        if (this.aabb(this.P, en)) {
          if (this.P.shield > 0) { this.P.shield--; this.P.inv = true; this.P.invT = 1.1; this.addPopup('SHIELD!', this.P.x, this.P.y - 16, '#35d6a9'); sfx.hit(); }
          else { this.killP(); }
          return;
        }
      }
    }
    if (this.enemiesKilled >= this.enemiesToKill && !this.bossLevel) {
      this.lcBonus = Math.floor(this.oxygen) * 10 * this.level + this.enemiesKilled * 50;
      this.stateTimer = 0; this.gs = 'LEVEL_CLEAR'; sfx.clear();
    }
    if (this.bossLevel && this.bossSpawned && this.EN.length === 0 && this.pending.length === 0) {
      this.lcBonus = Math.floor(this.oxygen) * 10 * this.level + this.enemiesKilled * 50;
      this.stateTimer = 0; this.gs = 'LEVEL_CLEAR'; sfx.clear();
    }
  }

  updateP(dt: number) {
    const P = this.P, T = this.cellSize;
    if (P.rapidT > 0) { P.rapidT = Math.max(0, P.rapidT - dt); }
    if (P.boostT > 0) { P.boostT = Math.max(0, P.boostT - dt); }
    // On a ladder the anim frame is driven inside the ladder branch (it only
    // advances while actually moving); everywhere else it runs continuously.
    if (!P.onL) { P.at += dt; if (P.at > 0.13) { P.af ^= 1; P.at = 0; } }
    if (P.inv) { P.invT -= dt; if (P.invT <= 0) { P.inv = false; } }

    if (P.onL) {
      // ── LADDER MODE ──
      P.vx = 0; P.vy = 0;
      const vspd = VSPD * (P.boostT > 0 ? 1.3 : 1);
      if (this.iU()) { P.vy = -vspd; }
      else if (this.iD2()) { P.vy = vspd; }
      P.st = P.vy !== 0 ? 'CLIMB' : 'IDLE';
      // Hand-over-hand cadence: frames advance only while moving, so the
      // pose freezes mid-grip when the player stops on the ladder.
      if (P.vy !== 0) { P.at += dt; if (P.at > 0.16) { P.af ^= 1; P.at = 0; } }

      P.y += P.vy * dt;
      P.y = Math.max(HUD_H, P.y);

      // Exit ladder: land on a solid platform
      const col = Math.floor((P.x + P.w / 2) / T);
      const feet = P.y + P.h;
      // The entry-floor skip only exists so the landing checks don't re-grab
      // the floor the player just mounted from; once they've climbed clear of
      // it, it becomes a valid landing again (reversing mid-climb used to
      // tunnel straight through it).
      if (P.ldrEntryRow >= 0 && Math.abs(feet - (HUD_H + P.ldrEntryRow * T)) > 26) { P.ldrEntryRow = -1; }
      for (let r = 0; r < ROWS; r++) {
        const top = HUD_H + r * T;
        if (!this.isSolid(col, r)) { continue; }
        // Land when climbing onto a floor, OR when resting aligned with one —
        // releasing the key at floor level used to leave the player invisibly
        // glued to the ladder (left/right dead), which read as "can't walk
        // here", especially on stacked same-column ladders.
        const moving = r !== P.ldrEntryRow && (
          (P.vy < 0 && feet <= top + 8 && feet >= top - 16) ||
          (P.vy > 0 && feet >= top - 8 && feet <= top + 24));
        const resting = P.vy === 0 && Math.abs(feet - top) <= 12;
        if (moving || resting) {
          P.y = top - P.h; P.vy = 0; P.onG = true; P.onL = false; P.ldrEntryRow = -1; break;
        }
      }
    } else {
      // ── GROUND / FALL MODE ──
      P.vx = 0;
      const spd = HSPD * (P.boostT > 0 ? 1.45 : 1);
      if (this.iL()) { P.vx = -spd; P.dir = -1; }
      if (this.iR()) { P.vx = spd; P.dir = 1; }
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
        P.x = Math.max(0, Math.min(VW - P.w, P.x));
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
      // Boosted running kicks up warmer, denser dust so the speed reads visually
      if (P.walkDustT <= 0) { this.spawnDust(P.x + (P.dir > 0 ? 3 : P.w - 3), P.y + P.h - 2, P.boostT > 0 ? 0xffb066 : 0x8fa3c8, 2, true); P.walkDustT = P.boostT > 0 ? 0.08 : 0.16; }
    } else { P.walkDustT = Math.min(P.walkDustT, 0.05); }

    if (P.y + P.h > VH + 48) { this.killP(); }
  }

  doDig() {
    const P = this.P, T = this.cellSize;
    const fr = this.getStandRow(P);
    if (fr < 0 || fr >= ROWS) { return; }
    const col = Math.floor((P.x + P.w / 2) / T) + P.dir;
    if (col < 0 || col >= COLS) { return; }
    if (this.getTile(col, fr) !== TPLAT || this.HOLES.some(h => h.col === col && h.row === fr)) { return; }
    let dur = Math.max(2.5, 5 - (this.level - 1) * 0.2);
    if (P.rapidT > 0) { dur *= 1.8; } // shovel power-up: traps stay open far longer
    this.HOLES.push({ col, row: fr, timer: dur, max: dur });
    this.tileMap[fr][col] = THOLE;
    P.st = 'DIG';
    sfx.dig();
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
        sfx.hit();
        const def = ENEMY_DEFS[en.type] || ENEMY_DEFS.red;
        this.spawnSparks(en.x + en.w / 2, en.y + en.h / 2, hexColor(def.accent), 6);
        if (en.hc >= en.hn) { this.killEN(i); }
        else { en.st = 'FALLING'; en.vy = 40; }
        this.P.st = 'HIT'; return;
      }
    }
  }

  killEN(i: number) {
    const en = this.EN[i], def = ENEMY_DEFS[en.type] || ENEMY_DEFS.red;
    // Kill-streak combo: chained kills inside the 4s window multiply the
    // score (up to ×5) — the reward for multi-trap aggressive play.
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = 4; this.maxCombo = Math.max(this.maxCombo, this.combo);
    const mult = Math.min(this.combo, 5);
    const pts = def.score * mult;
    this.score += pts; this.hiScore = Math.max(this.hiScore, this.score);
    this.enemiesKilled++; this.totalKills++;
    if (en.isBoss) { this.bossKills++; }
    sfx.kill();
    if (this.enemiesKilled >= this.nextComboLife) {
      this.lives = Math.min(5, this.lives + 1);
      this.addPopup('+1 LIFE', en.x - 4, en.y - 28, '#ff5cc8');
      this.nextComboLife += 5 + Math.floor(Math.random() * 4);
      sfx.life();
    }
    this.addPopup('+' + pts + (mult > 1 ? ' x' + mult : ''), en.x - 4, en.y - 12, mult > 1 ? '#ffd23f' : '#fff');
    this.spawnExplosion(en.x + en.w / 2, en.y + en.h / 2, hexColor(def.accent), en.isBoss ? 26 : 14);
    if (Math.random() < 0.4) {
      const r = Math.random();
      const type = r < 0.40 ? 'star' : r < 0.58 ? 'tank' : r < 0.72 ? 'shovel' : r < 0.84 ? 'boost' : r < 0.94 ? 'shield' : 'life';
      this.ITEMS.push({ x: en.x + en.w / 2 - 6, y: en.y - 14, vy: -75, life: 3.5, type, w: 12, h: 14 });
    }
    this.EN.splice(i, 1);
  }

  killP() {
    if (this.P.dead) { return; }
    this.P.dead = true; this.P.deadT = 2; this.P.vx = 0; this.P.vy = 0;
    this.P.inv = true; this.P.invT = 2;
    this.combo = 0; this.comboT = 0;
    this.shakeT = 0.4; this.shakeMag = 9;
    sfx.death();
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
    const feet = en.y + en.h;
    // Same entry-floor rule as the player: without it, the landing window
    // re-grabbed the floor the enemy had just left on its very first climb
    // frame, so climber enemies (cyan/teal/crimson) never actually climbed.
    if (en.ldrRow >= 0 && Math.abs(feet - (HUD_H + en.ldrRow * T)) > 26) { en.ldrRow = -1; }
    for (let r = 0; r < ROWS; r++) {
      if (r === en.ldrRow) { continue; }
      const top = HUD_H + r * T;
      if (!this.isSolid(col, r)) { continue; }
      if (en.vy < 0 && feet <= top + 8 && feet >= top - 16) {
        en.y = top - en.h; en.vy = 0; en.onG = true; en.st = 'PATROL'; en.ldrRow = -1; break;
      }
      if (en.vy > 0 && feet >= top - 8 && feet <= top + 24) {
        en.y = top - en.h; en.vy = 0; en.onG = true; en.st = 'PATROL'; en.ldrRow = -1; break;
      }
    }
    if (en.y > VH + 120) { const idx = this.EN.indexOf(en); if (idx >= 0) this.EN.splice(idx, 1); }
  }

  spdOf(type: string) { return (ENEMY_DEFS[type] || {}).spd || 44; }

  enPatrol(en: Enemy, dt: number, sm: number) {
    const def = ENEMY_DEFS[en.type], T = this.cellSize;
    // Ladder climb
    if (def && def.climb && en.onG && Math.random() < dt * 0.35) {
      const col = Math.floor((en.x + en.w / 2) / T), fr = this.getStandRow(en);
      if (fr >= 0) {
        if (this.getTile(col, fr - 1) === TLADR) { en.x = col * T + (T - en.w) / 2; en.st = 'CLIMB'; en.vx = 0; en.vy = -VSPD * 0.8; en.onG = false; en.ldrRow = fr; return; }
        if (this.getTile(col, fr + 1) === TLADR) { en.x = col * T + (T - en.w) / 2; en.st = 'CLIMB'; en.vx = 0; en.vy = VSPD * 0.8; en.onG = false; en.ldrRow = fr; return; }
      }
    }
    // Teleport
    if (def && def.tele) { en.teleT -= dt; if (en.teleT <= 0) { en.x = Math.max(0, Math.min(VW - en.w, en.x + (56 + Math.random() * 40) * (Math.random() < 0.5 ? 1 : -1))); en.teleT = 1.8 + Math.random() * 1.6; } }
    // Dash
    let dashMul = 1;
    if (def && def.dash) {
      if (en.dashing) { dashMul = 2; en.dashUntil -= dt; if (en.dashUntil <= 0) { en.dashing = false; } }
      else { en.dashT -= dt; if (en.dashT <= 0) { en.dashing = true; en.dashUntil = 0.4; en.dashT = 2.5 + Math.random() * 2.5; } }
    }
    en.vy = Math.min(en.vy + GRAV * dt, MXF);
    en.x += en.dir * this.spdOf(en.type) * sm * dashMul * dt;
    en.y += en.vy * dt;
    en.x = Math.max(0, Math.min(VW - en.w, en.x));
    en.onG = false; this.resolveEn(en);
    // Turn around at screen edges — without this, an enemy that reaches x=0
    // or the right edge just sits position-clamped there forever (dir never
    // flips), which reads as the enemy being permanently stuck.
    if (en.onG) {
      if (en.x <= 0) { en.dir = 1; en.x = 2; }
      else if (en.x + en.w >= VW) { en.dir = -1; en.x = VW - en.w - 2; }
    }
    if (!en.onG && en.st !== 'TRAPPED') { en.st = 'FALLING'; }
    if (!this.P.dead && !this.P.inv && en.st !== 'TRAPPED' && en.st !== 'RECOVERING' && this.aabb(this.P, en)) {
      if (this.P.shield > 0) { this.P.shield--; this.P.inv = true; this.P.invT = 1.1; sfx.hit(); } else { this.killP(); }
    }
  }

  enFall(en: Enemy, dt: number) {
    en.vy = Math.min(en.vy + GRAV * dt, MXF);
    en.y += en.vy * dt;
    en.x = Math.max(0, Math.min(VW - en.w, en.x));
    en.onG = false; this.resolveEn(en);
    if (en.onG) { en.st = 'PATROL'; en.vy = 0; en.vx = en.dir * this.spdOf(en.type) * (1 + (this.level - 1) * 0.06); }
    if (en.y > VH + 120) { const idx = this.EN.indexOf(en); if (idx >= 0) this.EN.splice(idx, 1); }
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

  // Spawn telegraph: the incoming alien is queued first — its door flashes
  // red with a silhouette for a beat before it actually walks out, so spawns
  // stop feeling like ambushes.
  queueSpawn(boss: boolean) {
    const T = this.cellSize;
    this.pending.push({ left: Math.random() < 0.5, rowTop: this.randFloorTop(T), type: boss ? 'gold' : this.pickEnemyType(), boss, t: boss ? 0.9 : 0.7 });
    sfx.door();
  }

  spawnFromPending(p: { left: boolean; rowTop: number; type: string; boss: boolean }) {
    const def = ENEMY_DEFS[p.type] || ENEMY_DEFS.red;
    if (p.boss) {
      this.EN.push({ x: p.left ? 4 : VW - 52, y: p.rowTop - 46, w: 40, h: 46, vx: (p.left ? 1 : -1) * def.spd, vy: 0, dir: p.left ? 1 : -1, type: 'gold', st: 'PATROL', af: 0, at: 0, stT: 0, recT: 0, hn: def.hn, hc: 0, onG: true, teleT: 0, dashT: 0, dashing: false, dashUntil: 0, isBoss: true, mSpawned: false, ldrRow: -1 });
    } else {
      this.EN.push({ x: p.left ? 4 : VW - 26, y: p.rowTop - 22, w: 18, h: 22, vx: (p.left ? 1 : -1) * def.spd, vy: 0, dir: p.left ? 1 : -1, type: p.type, st: 'PATROL', af: 0, at: 0, stT: 0, recT: 0, hn: def.hn, hc: 0, onG: true, teleT: def.tele ? 1.5 + Math.random() * 1.5 : 0, dashT: def.dash ? 2.5 + Math.random() * 2 : 0, dashing: false, dashUntil: 0, isBoss: false, mSpawned: false, ldrRow: -1 });
    }
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
      it.y = Math.min(it.y, VH - it.h);
      if (it.life <= 0) { this.ITEMS.splice(i, 1); continue; }
      if (!this.P.dead && this.aabb(this.P, it)) {
        if (it.type === 'life') { sfx.life(); } else { sfx.item(); }
        this.spawnSparkle(it.x + it.w / 2, it.y + it.h / 2, ITEM_COLORS[it.type] || 0xffffff, 10);
        if (it.type === 'tank') { this.oxygen = Math.min(100, this.oxygen + 30); this.addPopup('AIR +30%', it.x, it.y, '#44e0ff'); }
        else if (it.type === 'life') { this.lives = Math.min(5, this.lives + 1); this.addPopup('+1 LIFE', it.x, it.y, '#ff5cc8'); }
        else if (it.type === 'shovel') { this.P.rapidT = 10; this.addPopup('POWER DIG!', it.x, it.y, '#ffe066'); }
        else if (it.type === 'shield') { this.P.shield = Math.min(3, (this.P.shield || 0) + 1); this.addPopup('SHIELD!', it.x, it.y, '#35d6a9'); }
        else if (it.type === 'boost') { this.P.boostT = 8; this.addPopup('SPEED UP!', it.x, it.y, '#ff9d42'); }
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
          sfx.trap();
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
    // Emit only when something the React shell can display actually changed —
    // unconditional emits re-rendered the page 60×/s (oxygen is rounded here
    // precisely so its per-frame drain doesn't defeat the dedup).
    const oxy = Math.ceil(this.oxygen);
    const initialsEntry = this.gs === 'GAME_OVER' && this.isHS() && this.stateTimer > 1;
    const key = [this.score, this.level, this.lives, oxy, this.gs, this.EN.length, this.hiScore, this.menuCursor, initialsEntry, this.initials.join('')].join('|');
    if (key === this.lastStateKey) return;
    this.lastStateKey = key;
    emitState({ score: this.score, level: this.level, lives: this.lives, oxygen: oxy, oxygenMax: 100, gameOver: this.gs === 'GAME_OVER', started: this.gs === 'PLAYING' || this.gs === 'PAUSED' || this.gs === 'LEVEL_CLEAR', enemiesAlive: this.EN.length, state: this.gs, hiScore: this.hiScore, menuCursor: this.menuCursor, initialsEntry, initials: [...this.initials] });
  }

  /* ── Session / score submission (leaderboard + achievements) ── */
  private async startSession() {
    this.sessionCtx = null;
    try {
      const r = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ game: 'space-panic' }),
      });
      if (r.ok) {
        const j = await r.json();
        this.sessionCtx = { sessionId: j.sessionId, startedAt: j.startedAt, token: j.token };
      }
    } catch { /* offline play still works, run just won't rank */ }
  }

  private async submitScore() {
    try {
      const payload: any = {
        game: 'space-panic',
        score: this.score,
        meta: {
          level: this.level,
          kills: this.totalKills,
          bossKills: this.bossKills,
          maxCombo: this.maxCombo,
          daily: this.daily,
          dailyDate: this.daily ? this.dailyDate : undefined,
          durationSec: Math.floor((Date.now() - this.startTime) / 1000),
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
      // Daily mode: pull today's board (server masks other players' names)
      // so the results screen can show where this run landed.
      if (this.daily) {
        const r = await fetch('/api/scores/space-panic/daily', { credentials: 'include' });
        if (r.ok) {
          const j = await r.json();
          this.dailyRows = (j.rows || []).map((x: any) => ({ n: String(x.displayName || x.playerName || '???').slice(0, 12), s: Number(x.score) || 0 }));
        }
      }
    } catch { /* ignore */ }
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
    else if (this.gs === 'GUIDE') { this.rGuide(); }
    else if (this.gs === 'PLAYING' || this.gs === 'PAUSED' || this.gs === 'LEVEL_CLEAR') {
      this.rGame();
      if (this.gs === 'PAUSED') { this.rPause(); }
      if (this.gs === 'LEVEL_CLEAR') { this.rLC(); }
    } else if (this.gs === 'GAME_OVER') { this.rGO(); }
    else if (this.gs === 'HIGH_SCORE') { this.rHSc(); }
    else if (this.gs === 'DAILY_HS') { this.rDailyHS(); }
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
    const g = this.gfx, w = VW, h = VH;
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
      this.txts[3].setOrigin(0.5, 0).setFontSize(Math.min(w / 40, 14)).setColor(TXT_ACCENT).setText(this.isTouch ? 'TAP TO START' : 'PRESS ANY KEY').setPosition(w / 2, h * 0.82).setVisible(true);
    }
  }

  rMenu() {
    const g = this.gfx, w = VW, h = VH;
    this.rSpaceBG(w, h);
    this.rStars();
    this.txts[0].setOrigin(0.5, 0).setFontSize(Math.min(w / 22, 26)).setColor(TXT_BRIGHT).setText('SPACE PANIC').setPosition(w / 2, h * 0.15).setVisible(true);
    g.fillStyle(0x7ce3ff, 0.35); g.fillRect(w / 2 - 145, h * 0.22, 290, 2);
    const items = ['START', 'DAILY RUN', 'HOW TO PLAY', 'ALIEN GUIDE', 'HIGH SCORES', 'BACK'];
    for (let i = 0; i < items.length; i++) {
      const y = h * 0.26 + i * 42, sel = i === this.menuCursor;
      if (sel) {
        g.fillStyle(0x7ce3ff, 0.14); g.fillRect(w / 2 - 142, y - 8, 284, 28);
        g.lineStyle(1, 0x7ce3ff, 0.65); g.strokeRect(w / 2 - 142, y - 8, 284, 28);
      }
      const gold = i === 1; // daily run gets the gold accent
      this.txts[i + 1].setOrigin(0, 0).setFontSize(9).setColor(sel ? (gold ? TXT_GOLD : TXT_ACCENT) : (gold ? '#b09a45' : TXT_DIM)).setText((sel && this.blink % 0.8 < 0.5 ? '> ' : '  ') + items[i]).setPosition(w / 2 - 108, y).setVisible(true);
    }
  }

  rHowTo() {
    const g = this.gfx, w = VW, h = VH;
    this.rSpaceBG(w, h);
    this.rStars();
    this.txts[0].setOrigin(0.5, 0).setFontSize(Math.min(w / 35, 16)).setColor(TXT_BRIGHT).setText('HOW TO PLAY').setPosition(w / 2, h * 0.06).setVisible(true);
    const cw = w / 4;
    const steps = [
      { n: '1', s: 'pw1', t: 'WALK', c: PLAYER_COLOR, tc: TXT_ACCENT, d: 'MOVE LEFT/RIGHT,\nCLIMB LADDERS -\nNO JUMPING' },
      { n: '2', s: 'pd', t: 'DIG', c: LADDER_C, tc: TXT_GOLD, d: this.isTouch ? 'TAP DIG TO CARVE\nA HOLE IN THE\nPLATFORM AHEAD' : 'PRESS Z TO CARVE\nA HOLE IN THE\nPLATFORM AHEAD' },
      { n: '3', s: 'hole', t: 'TRAP', c: HOLE_RIM, tc: '#ff9d5c', d: 'LURE AN ALIEN\nOVER THE HOLE -\nIT FALLS STUNNED' },
      { n: '4', s: 'ph', t: 'HIT', c: 0xff5c5c, tc: TXT_DANGER, d: this.isTouch ? 'TAP HIT WHILE\nTRAPPED - MISS IT\nIT LEVELS UP' : 'PRESS X WHILE\nTRAPPED - MISS IT\nIT LEVELS UP' },
    ];
    for (let i = 0; i < 4; i++) {
      const s = steps[i], cx = cw * i + cw / 2, base = 1 + i * 3;
      this.txts[base].setOrigin(0.5, 0).setFontSize(14).setColor(TXT_FAINT).setText(s.n).setPosition(cx, h * 0.16).setVisible(true);
      drawSprite(g, s.s, cx - 12, h * 0.22, s.c, false, 1.5);
      this.txts[base + 1].setOrigin(0.5, 0).setFontSize(7).setColor(s.tc).setText(s.t).setPosition(cx, h * 0.44).setVisible(true);
      this.txts[base + 2].setOrigin(0.5, 0).setFontSize(Math.min(w / 85, 6)).setColor(TXT_DIM).setText(s.d).setAlign('center').setLineSpacing(6).setPosition(cx, h * 0.5).setVisible(true);
    }
    this.txts[13].setOrigin(0.5, 0).setFontSize(6).setColor(TXT_FAINT).setText('ITEMS: AIR  SHIELD  LIFE  SHOVEL=LONG HOLES  BOOST=SPEED').setPosition(w / 2, h * 0.72).setVisible(true);
    if (this.blink % 1 < 0.62) { this.txts[PROMPT_TXT].setOrigin(0.5, 0).setFontSize(10).setColor(TXT_ACCENT).setText(this.isTouch ? 'TAP TO CONTINUE' : 'PRESS ANY KEY').setPosition(w / 2, h * 0.88).setVisible(true); }
  }

  // Bestiary built straight from ENEMY_DEFS + the sprite sheet — every one of
  // the 12 alien designs is showcased with its score, hits-to-kill, unlock
  // level, and special trait, so players finally get to see the late-game cast.
  rGuide() {
    const g = this.gfx, w = VW, h = VH;
    this.rSpaceBG(w, h);
    this.rStars();
    this.txts[0].setOrigin(0.5, 0).setFontSize(Math.min(w / 35, 16)).setColor(TXT_BRIGHT).setText('ALIEN GUIDE').setPosition(w / 2, h * 0.05).setVisible(true);
    const order = ['red', 'orange', 'green', 'blue', 'purple', 'cyan', 'yellow', 'magenta', 'teal', 'crimson', 'silver', 'gold'];
    const cols = 3, cw2 = w / cols, ch2 = (h * 0.81 - h * 0.12) / 4;
    const af = Math.floor(this.blink / 0.28) % 2;
    for (let i = 0; i < order.length; i++) {
      const key = order[i], def = ENEMY_DEFS[key];
      const cx = (i % cols) * cw2 + cw2 / 2, cy = h * 0.12 + Math.floor(i / cols) * ch2;
      const accent = hexColor(def.accent);
      drawGlow(g, cx, cy + 14, 17, accent, 0.32);
      const frames = def.frames || ['er', 'er2'];
      const sw = ((SP as any)[frames[af]]?.[0]?.length || 8) * PX * 1.6;
      drawSprite(g, frames[af], cx - sw / 2, cy, accent, false, 1.6);
      const traits = [def.boss ? 'BOSS' : '', def.climb ? 'CLIMB' : '', def.tele ? 'TELE' : '', def.dash ? 'DASH' : ''].filter(Boolean).join(' ');
      this.txts[i + 1].setOrigin(0.5, 0).setFontSize(6).setColor(def.accent)
        .setText(GUIDE_NAMES[key] + '\n' + def.score + ' PTS - ' + def.hn + ' HIT' + (def.hn > 1 ? 'S' : '') + '\nLV ' + def.minLv + '+' + (traits ? '  ' + traits : ''))
        .setAlign('center').setLineSpacing(4).setPosition(cx, cy + 40).setVisible(true);
    }
    if (this.blink % 1 < 0.62) { this.txts[PROMPT_TXT].setOrigin(0.5, 0).setFontSize(8).setColor(TXT_ACCENT).setText(this.isTouch ? 'TAP TO GO BACK' : 'PRESS ANY KEY').setPosition(w / 2, h * 0.93).setVisible(true); }
  }

  rGame() {
    const w = VW, h = VH;
    this.rSpaceBG(w, h);
    this.rStars();
    this.rLevel();
    this.rHoles();
    this.rItems();
    this.rEnemies();
    this.rTelegraphs();
    this.rPlayer();
    this.rParticles(this.gfx);
    this.rOxygenVignette();
    this.rHUD();
    this.rPopups();
  }

  rHUD() {
    const g = this.uiGfx, w = VW;
    g.fillGradientStyle(0x070716, 0x070716, 0x0d0f28, 0x0d0f28, 1);
    g.fillRect(0, 0, w, HUD_H);
    g.fillStyle(0x7ce3ff, 0.55); g.fillRect(0, HUD_H - 2, w, 2);
    g.fillStyle(0x7ce3ff, 0.12); g.fillRect(0, HUD_H - 6, w, 4);

    this.txts[0].setOrigin(0, 0).setFontSize(6).setColor(TXT_DIM).setText('1UP').setPosition(10, 6).setVisible(true);
    this.txts[1].setOrigin(0, 0).setFontSize(9).setColor(TXT_BRIGHT).setText(String(this.score).padStart(6, '0')).setPosition(10, 17).setVisible(true);
    this.txts[2].setOrigin(0.5, 0).setFontSize(6).setColor(TXT_GOLD).setText('HI ' + String(this.hiScore).padStart(6, '0')).setPosition(w / 2, 6).setVisible(true);
    if (this.daily) { this.txts[6].setOrigin(0, 0).setFontSize(6).setColor(TXT_GOLD).setText('DAILY').setPosition(70, 19).setVisible(true); }
    // Combo meter: multiplier readout + a draining window bar under the HI score
    if (this.comboT > 0 && this.combo >= 2) {
      this.txts[5].setOrigin(0.5, 0).setFontSize(8).setColor(this.combo >= 5 ? TXT_GOLD : TXT_ACCENT).setText('COMBO x' + Math.min(this.combo, 5)).setPosition(w / 2, 16).setVisible(true);
      const cbw = 56;
      g.fillStyle(0x03040c, 0.6); g.fillRect(w / 2 - cbw / 2, 28, cbw, 3);
      g.fillStyle(this.combo >= 5 ? 0xffd23f : 0x7ce3ff, 0.9); g.fillRect(w / 2 - cbw / 2, 28, cbw * Math.max(0, this.comboT / 4), 3);
    }

    for (let i = 0; i < Math.min(this.lives, 5); i++) { drawSprite(g, 'li', w - 108 + i * 22, 8, PLAYER_COLOR, false, 1.3); }

    this.txts[3].setOrigin(0, 0).setFontSize(6).setColor(TXT_DIM).setText('LV' + String(this.level).padStart(2, '0')).setPosition(10, 36).setVisible(true);

    // AIR bar is centered (equal margins each side); the left margin hosts
    // the LV/AIR labels, the right margin hosts the power-up icons.
    const by = 36, bh = 12, bw = w - 170, bx = Math.round((w - bw) / 2), op = Math.max(0, this.oxygen / 100);
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
    if (this.P && this.P.rapidT > 0) { drawSprite(g, 'shovelIcon', ix, 30, 0xffe066, false, 1.5); ix -= 15; }
    if (this.P && this.P.boostT > 0) { drawSprite(g, 'boost', ix, 30, 0xff9d42, false, 1.5); }
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
        // Extend the rails up through the (mostly empty) platform cell above
        // so the ladder visually meets the floor it exits onto — drawn only in
        // its own cell it stopped a near-full cell short, reading as a ladder
        // "cut off" in mid-air below the upper platform.
        const ext = this.getTile(c, r - 1) === TPLAT ? T - 7 : 0;
        const ly = ty - ext, lh = T + ext;
        g.fillStyle(LADDER_LO, 0.9); g.fillRect(tx + 8, ly, 4, lh); g.fillRect(tx + 20, ly, 4, lh);
        g.fillStyle(LADDER_C, 0.95); g.fillRect(tx + 8, ly, 2, lh); g.fillRect(tx + 20, ly, 2, lh);
        g.fillStyle(LADDER_HI, 0.85); for (let i = 2; i < lh; i += 8) { g.fillRect(tx + 10, ly + i, 10, 3); }
      } else if (tile === TPIPEL || tile === TPIPER) {
        // Airlock doorway STANDING ON the floor — a doorway aliens visibly
        // walk out of. (It used to be a translucent box hanging below the
        // floor line, which read as a mystery black crate.) The tile itself
        // stays solid ground, so a floor strip is drawn under the door.
        g.fillStyle(PLATFORM_LO); g.fillRect(tx, ty + 4, T, 3);
        g.fillStyle(PLATFORM_C); g.fillRect(tx, ty, T, 5);
        g.fillStyle(PLATFORM_HI, 0.9); g.fillRect(tx, ty, T, 1.5);
        const dh = 38, dTop = ty - dh;
        g.fillStyle(0x03040c, 0.95); g.fillRect(tx + 1, dTop, T - 2, dh);       // dark opening
        g.fillStyle(PIPE_C, 0.12); g.fillRect(tx + 3, dTop + 5, T - 6, dh - 6); // energy field haze
        const shimY = dTop + 6 + ((this.blink * 30) % (dh - 12));
        g.fillStyle(PIPE_HI, 0.22); g.fillRect(tx + 3, shimY, T - 6, 1.5);      // drifting scanline
        g.fillStyle(shade(PIPE_C, -0.45), 0.95);
        g.fillRect(tx, dTop, 3, dh); g.fillRect(tx + T - 3, dTop, 3, dh);       // door posts
        g.fillRect(tx, dTop, T, 4);                                             // lintel
        g.fillStyle(PIPE_HI, 0.85); g.fillRect(tx, dTop, T, 1.5);
        const bcnX = tile === TPIPEL ? tx + T - 8 : tx + 4;                     // beacon faces playfield
        g.fillStyle(this.blink % 1.4 < 0.7 ? 0x7ce3ff : 0x1d4a5e, 1); g.fillRect(bcnX, dTop - 3, 4, 3);
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
      // Climbing enemies mirror each anim frame (limb-over-limb motion, same
      // trick as the player) instead of the old side-to-side lean.
      const climbing = en.st === 'CLIMB';
      const flip = climbing ? en.af === 1 : en.dir === -1;
      const climbDY = climbing && en.af === 1 ? -1 : 0;
      drawSprite(g, (def.frames || ['er', 'er2'])[en.af], en.x, en.y + climbDY, accent, flip, scale);
      if (en.dashing) { g.fillStyle(accent, 0.35); g.fillRect(en.x - en.dir * 12, en.y + en.h * 0.25, 12, en.h * 0.5); }
    }
  }

  // Incoming-alien warning: the spawn door pulses red with a dark silhouette
  // of the exact enemy about to walk out.
  rTelegraphs() {
    const g = this.gfx, T = this.cellSize;
    for (const p of this.pending) {
      const doorX = p.left ? 0 : (COLS - 1) * T;
      const dTop = p.rowTop - 38;
      const flash = this.blink % 0.16 < 0.08;
      drawGlow(g, doorX + T / 2, p.rowTop - 19, 22, 0xff5c5c, flash ? 0.5 : 0.3);
      const def = ENEMY_DEFS[p.type] || ENEMY_DEFS.red;
      const frames = def.frames || ['er', 'er2'];
      const sx = p.left ? 4 : VW - (p.boss ? 52 : 26);
      drawSprite(g, frames[0], sx, p.rowTop - (p.boss ? 46 : 22), 0x1a0a10, !p.left, p.boss ? 1.9 : 1.5, flash ? 0.9 : 0.6);
      g.fillStyle(flash ? 0xff5c5c : 0x7a1f1f, 1);
      g.fillRect(p.left ? doorX + T - 8 : doorX + 4, dTop - 3, 4, 3);
    }
  }

  rPlayer() {
    if (!this.P) return;
    if (this.P.dead && this.blink % 0.16 > 0.08) return;
    // On a ladder always use the climb pose (even when holding still) —
    // previously a stationary climber flipped back to the walking sprite.
    const nm = this.P.onL ? 'pc' : this.P.st === 'DIG' ? 'pd' : this.P.st === 'HIT' ? 'ph' : this.P.af === 0 ? 'pw1' : 'pw2';
    const cx = this.P.x + this.P.w / 2, cy = this.P.y + this.P.h / 2;
    const alpha = (this.P.inv && !this.P.dead && this.blink % 0.2 < 0.1) ? 0.4 : 1;
    // Real climbing motion: the climb pose is asymmetric (one arm raised, one
    // leg extended), so mirroring it every anim frame swaps which hand is up
    // — proper hand-over-hand movement instead of the old ±1.5px lean that
    // just read as the sprite being shaken. A 1px lift on alternate frames
    // sells the "pull up" beat; the pose holds frozen when not moving.
    // The walk sprites face the opposite way from the action poses in the
    // source art: unmirrored pw1/pw2 read as facing LEFT (walking right
    // looked like moonwalking), while pd/ph extend their arm to the RIGHT
    // (and must keep pointing at the dig/hit target, which is at col+dir).
    const flip = this.P.onL ? this.P.af === 1
      : (nm === 'pw1' || nm === 'pw2') ? this.P.dir === 1
      : this.P.dir === -1;
    const climbDY = this.P.onL && this.P.af === 1 ? -1 : 0;
    drawGlow(this.gfx, cx, cy, 18, PLAYER_ACCENT, 0.4 * alpha);
    drawSprite(this.gfx, nm, this.P.x, this.P.y + climbDY, PLAYER_COLOR, flip, 1.5, alpha);
  }

  rOxygenVignette() {
    if (this.oxygen > 22) return;
    const g = this.gfx, w = VW, h = VH;
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
    const g = this.uiGfx, w = VW, h = VH;
    g.fillStyle(0x03040c, 0.72); g.fillRect(0, 0, w, h);
    drawGlow(g, w / 2, h / 2, 90, 0x7ce3ff, 0.25);
    g.fillStyle(0x0b0e24, 0.96); g.fillRect(w / 2 - 112, h / 2 - 54, 224, 108);
    g.lineStyle(2, 0x7ce3ff, 0.8); g.strokeRect(w / 2 - 112, h / 2 - 54, 224, 108);
    this.txts[10].setOrigin(0.5, 0).setFontSize(16).setColor(TXT_BRIGHT).setText('PAUSED').setPosition(w / 2, h / 2 - 30).setVisible(true);
    this.txts[11].setOrigin(0.5, 0).setFontSize(6).setColor(TXT_DIM).setText(this.isTouch ? 'TAP TO RESUME' : 'P / ESC  RESUME').setPosition(w / 2, h / 2 + 4).setVisible(true);
    this.txts[12].setOrigin(0.5, 0).setFontSize(6).setColor(TXT_FAINT).setText('SCORE: ' + String(this.score).padStart(6, '0')).setPosition(w / 2, h / 2 + 22).setVisible(true);
  }

  rLC() {
    const g = this.uiGfx, w = VW, h = VH;
    g.fillStyle(0x03040c, 0.8); g.fillRect(0, 0, w, h);
    const flashA = Math.max(0, 0.55 - this.stateTimer * 1.6);
    drawGlow(g, w / 2, h * 0.4, 140, 0x4bdba0, 0.3);
    if (flashA > 0) { g.fillStyle(0xffffff, flashA); g.fillRect(0, 0, w, h); }
    this.txts[10].setOrigin(0.5, 0).setFontSize(9).setColor(TXT_GOOD).setText('STAGE CLEAR!').setPosition(w / 2, h * 0.28).setVisible(true);
    this.txts[11].setOrigin(0.5, 0).setFontSize(Math.min(w / 20, 28)).setColor(TXT_BRIGHT).setText('LEVEL ' + String(this.level).padStart(2, '0')).setPosition(w / 2, h * 0.38).setVisible(true);
    this.txts[12].setOrigin(0.5, 0).setFontSize(7).setColor(TXT_ACCENT).setText('AIR BONUS: ' + Math.floor(this.oxygen) * 10 * this.level + ' PTS').setPosition(w / 2, h * 0.52).setVisible(true);
    this.txts[13].setOrigin(0.5, 0).setFontSize(7).setColor('#ff9d5c').setText('KILL BONUS: ' + this.enemiesKilled * 50 + ' PTS').setPosition(w / 2, h * 0.57).setVisible(true);
    this.txts[14].setOrigin(0.5, 0).setFontSize(10).setColor(TXT_GOLD).setText('TOTAL: ' + this.lcBonus + ' PTS').setPosition(w / 2, h * 0.66).setVisible(true);
    if (this.blink % 1 < 0.6) { this.txts[15].setOrigin(0.5, 0).setFontSize(14).setColor(TXT_ACCENT).setText('READY!').setPosition(w / 2, h * 0.78).setVisible(true); }
    this.txts[16].setOrigin(0.5, 0).setFontSize(6).setColor(TXT_FAINT).setText(this.isTouch ? 'TAP TO SKIP' : 'Z / X : SKIP').setPosition(w / 2, h * 0.87).setVisible(true);
  }

  rGO() {
    const w = VW, h = VH;
    this.rSpaceBG(w, h); this.rStars();
    drawGlow(this.gfx, w / 2, h * 0.28, 160, 0xff5c5c, 0.3);
    this.txts[0].setOrigin(0.5, 0).setFontSize(Math.min(w / 12, 40)).setColor(TXT_DANGER).setText('GAME OVER').setPosition(w / 2, h * 0.25).setVisible(true);
    this.txts[1].setOrigin(0.5, 0).setFontSize(9).setColor(TXT_BRIGHT).setText('SCORE: ' + String(this.score).padStart(6, '0')).setPosition(w / 2, h * 0.48).setVisible(true);
    if (this.isHS() && this.stateTimer > 1) {
      this.txts[2].setOrigin(0.5, 0).setFontSize(7).setColor(TXT_GOLD).setText('NEW HIGH SCORE!').setPosition(w / 2, h * 0.56).setVisible(true);
      this.txts[3].setOrigin(0.5, 0).setFontSize(6).setColor(TXT_DIM).setText('ENTER INITIALS:').setPosition(w / 2, h * 0.61).setVisible(true);
      this.txts[4].setOrigin(0.5, 0).setFontSize(18).setColor(TXT_ACCENT).setText(this.initials.join(' ')).setPosition(w / 2, h * 0.67).setVisible(true);
      this.txts[5].setOrigin(0.5, 0).setFontSize(5).setColor(TXT_FAINT).setText(this.isTouch ? 'UP/DOWN: CHANGE   TAP: CONFIRM' : 'UP/DOWN: CHANGE   ENTER: CONFIRM').setPosition(w / 2, h * 0.78).setVisible(true);
    } else if (!this.isHS() && this.blink % 1.2 < 0.8) {
      this.txts[PROMPT_TXT].setOrigin(0.5, 0).setFontSize(8).setColor(TXT_DIM).setText(this.isTouch ? 'TAP TO CONTINUE' : 'PRESS ANY KEY').setPosition(w / 2, h * 0.68).setVisible(true);
    }
  }

  rHSc() {
    const w = VW, h = VH;
    this.rSpaceBG(w, h); this.rStars();
    this.txts[0].setOrigin(0.5, 0).setFontSize(Math.min(w / 40, 14)).setColor(TXT_BRIGHT).setText('HIGH SCORES').setPosition(w / 2, h * 0.05).setVisible(true);
    const medal = ['#ffd23f', '#c9d3e0', '#d98a4c'];
    for (let i = 0; i < Math.min(this.HS.length, 10); i++) {
      const hs = this.HS[i], y = h * 0.12 + i * 30;
      const color = i < 3 ? medal[i] : TXT_DIM;
      if (i === 0) { drawGlow(this.gfx, w / 2 - 92, y + 4, 12, 0xffd23f, 0.5); }
      // Rank padded to 2 chars so every monospace row is the same width and
      // the centered list stays column-aligned like a table.
      this.txts[i + 1].setOrigin(0.5, 0).setFontSize(7).setColor(color).setText(String(i + 1).padStart(2, ' ') + '. ' + hs.n + '  ' + String(hs.s).padStart(6, '0') + '  LV' + String(hs.l).padStart(2, '0')).setPosition(w / 2, y).setVisible(true);
    }
    if (this.stateTimer > 2 && this.blink % 1.2 < 0.8) { this.txts[PROMPT_TXT].setOrigin(0.5, 0).setFontSize(7).setColor(TXT_ACCENT).setText(this.isTouch ? 'TAP TO CONTINUE' : 'PRESS ANY KEY').setPosition(w / 2, h - 18).setVisible(true); }
  }

  // Post-run results for the daily challenge: today's server-side top 10
  // (best clean run per player, names masked by the server).
  rDailyHS() {
    const w = VW, h = VH;
    this.rSpaceBG(w, h); this.rStars();
    drawGlow(this.gfx, w / 2, h * 0.07, 60, 0xffd23f, 0.25);
    this.txts[0].setOrigin(0.5, 0).setFontSize(Math.min(w / 40, 14)).setColor(TXT_GOLD).setText('DAILY BEST - ' + this.dailyDate).setPosition(w / 2, h * 0.05).setVisible(true);
    if (!this.dailyRows) {
      this.txts[1].setOrigin(0.5, 0).setFontSize(7).setColor(TXT_DIM).setText('OFFLINE - RUN NOT RANKED').setPosition(w / 2, h * 0.4).setVisible(true);
    } else if (this.dailyRows.length === 0) {
      this.txts[1].setOrigin(0.5, 0).setFontSize(7).setColor(TXT_DIM).setText('NO SCORES YET - BE THE FIRST!').setPosition(w / 2, h * 0.4).setVisible(true);
    } else {
      const medal = ['#ffd23f', '#c9d3e0', '#d98a4c'];
      for (let i = 0; i < Math.min(this.dailyRows.length, 10); i++) {
        const r = this.dailyRows[i], y = h * 0.14 + i * 30;
        this.txts[i + 1].setOrigin(0.5, 0).setFontSize(7).setColor(i < 3 ? medal[i] : TXT_DIM).setText(String(i + 1).padStart(2, ' ') + '. ' + r.n.padEnd(12, ' ') + '  ' + String(r.s).padStart(6, '0')).setPosition(w / 2, y).setVisible(true);
      }
    }
    if (this.stateTimer > 2 && this.blink % 1.2 < 0.8) { this.txts[PROMPT_TXT].setOrigin(0.5, 0).setFontSize(7).setColor(TXT_ACCENT).setText(this.isTouch ? 'TAP TO CONTINUE' : 'PRESS ANY KEY').setPosition(w / 2, h - 18).setVisible(true); }
  }
}
