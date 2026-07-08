import Phaser from 'phaser';

// ── Shared arcade kit for the Season 2 mini-games ──
// Same rendering recipe that keeps Space Panic sharp: all game logic lives in
// a fixed 512×448 design space, drawn inside a root container scaled ×RES
// onto a 1024×896 canvas, with text resolution matched.
export const VW = 512, VH = 448, RES = 2;

export type SpriteGrid = number[][];

// Deterministic PRNG (same as Space Panic's daily seed helper).
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shade(color: number, amt: number): number {
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

export function drawGlow(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, alpha: number) {
  g.fillStyle(color, Math.max(0, alpha) * 0.16); g.fillCircle(cx, cy, r);
  g.fillStyle(color, Math.max(0, alpha) * 0.28); g.fillCircle(cx, cy, r * 0.62);
  g.fillStyle(color, Math.max(0, alpha) * 0.4); g.fillCircle(cx, cy, r * 0.32);
}

// Pixel-grid sprite with dark outline + cheap bevel (Space Panic's look).
export function drawSpriteGrid(g: Phaser.GameObjects.Graphics, data: SpriteGrid, x: number, y: number, color: number, flipX: boolean, scale: number, alpha = 1) {
  if (!data) return;
  const rows = data.length, cols = data[0].length, px = 2 * scale;
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

// ── SFX (synthesized, no assets; one mute flag shared by all arcade games) ──
class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;
  constructor() { try { this.muted = localStorage.getItem('arcade_mute') === '1'; } catch { /* private mode */ } }
  toggle(): boolean {
    this.muted = !this.muted;
    try { localStorage.setItem('arcade_mute', this.muted ? '1' : '0'); } catch { /* ignore */ }
    return !this.muted;
  }
  tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
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
    } catch { /* audio unavailable */ }
  }
  menu()  { this.tone(520, 520, 0.05, 'square', 0.04); }
  start() { this.tone(440, 660, 0.09, 'square', 0.05); this.tone(660, 990, 0.12, 'square', 0.05, 0.09); }
  pop()   { this.tone(700, 1000, 0.06, 'square', 0.05); }
  bounce(){ this.tone(300, 240, 0.05, 'square', 0.04); }
  shoot() { this.tone(900, 300, 0.08, 'square', 0.035); }
  boom()  { this.tone(220, 40, 0.3, 'sawtooth', 0.06); }
  hit()   { this.tone(140, 60, 0.1, 'square', 0.07); }
  coin()  { this.tone(880, 1320, 0.09, 'triangle', 0.06); }
  power() { this.tone(440, 880, 0.18, 'triangle', 0.06); }
  life()  { this.tone(660, 660, 0.08, 'triangle', 0.06); this.tone(990, 990, 0.12, 'triangle', 0.06, 0.08); }
  death() { this.tone(440, 55, 0.5, 'sawtooth', 0.07); }
  clear() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.12, 'square', 0.05, i * 0.11)); }
  warn()  { this.tone(880, 880, 0.07, 'square', 0.05); this.tone(880, 880, 0.07, 'square', 0.05, 0.12); }
}
export const sfx = new Sfx();
export function toggleArcadeMute(): boolean { return sfx.toggle(); }
export function isArcadeMuted(): boolean { return sfx.muted; }

// ── Session / score submission (same anti-cheat flow as the other games) ──
export type SessionCtx = { sessionId: string; startedAt: number; token: string } | null;

export async function startSession(game: string): Promise<SessionCtx> {
  try {
    const r = await fetch('/api/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ game }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return { sessionId: j.sessionId, startedAt: j.startedAt, token: j.token };
  } catch { return null; }
}

export async function submitScore(game: string, score: number, meta: Record<string, unknown>, ctx: SessionCtx) {
  try {
    const payload: any = { game, score, meta };
    if (ctx) { payload.sessionId = ctx.sessionId; payload.startedAt = ctx.startedAt; payload.token = ctx.token; }
    await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
  } catch { /* offline play still works */ }
}

// ── Base scene: container scaling, text pool, keyboard + tap/swipe plumbing ──
export abstract class ArcadeScene extends Phaser.Scene {
  protected bg!: Phaser.GameObjects.Graphics;
  protected g!: Phaser.GameObjects.Graphics;
  protected ui!: Phaser.GameObjects.Graphics;
  protected txts: Phaser.GameObjects.Text[] = [];
  protected keys: Record<string, boolean> = {};
  protected pkeys: Record<string, boolean> = {};
  // pointer state in design space; ptr.x/y track hover AND drag
  protected ptr = { x: VW / 2, y: VH / 2, down: false };
  protected tapped = false; protected tapX = 0; protected tapY = 0;
  protected swipeDir: 'left' | 'right' | 'up' | 'down' | null = null;
  protected isTouch = false;
  protected blink = 0;
  private swipeStart: { x: number; y: number; t: number } | null = null;
  private _kd!: (e: KeyboardEvent) => void;
  private _ku!: (e: KeyboardEvent) => void;
  private _clear!: () => void;
  private _dead = false;

  create() {
    this.bg = this.add.graphics();
    this.g = this.add.graphics();
    this.ui = this.add.graphics();
    for (let i = 0; i < 20; i++) {
      this.txts.push(this.add.text(0, 0, '', { fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: '#ffffff', stroke: '#020208', strokeThickness: 2 }).setResolution(RES * 2).setVisible(false));
    }
    this.add.container(0, 0, [this.bg, this.g, this.ui, ...this.txts]).setScale(RES);
    this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.ptr.down = true; this.ptr.x = p.x / RES; this.ptr.y = p.y / RES;
      this.swipeStart = { x: this.ptr.x, y: this.ptr.y, t: performance.now() };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.ptr.x = p.x / RES; this.ptr.y = p.y / RES;
    });
    const up = (p: Phaser.Input.Pointer) => {
      this.ptr.down = false;
      const s = this.swipeStart; this.swipeStart = null;
      if (!s) return;
      const dx = p.x / RES - s.x, dy = p.y / RES - s.y;
      const dist = Math.hypot(dx, dy), dt = performance.now() - s.t;
      if (dist < 14 && dt < 450) { this.tapped = true; this.tapX = s.x; this.tapY = s.y; }
      else if (dist >= 24) {
        this.swipeDir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      }
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);

    this._kd = (e: KeyboardEvent) => { if (!this.keys[e.code]) this.pkeys[e.code] = true; this.keys[e.code] = true; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault(); };
    this._ku = (e: KeyboardEvent) => { this.keys[e.code] = false; };
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    // release everything on focus/visibility loss (stuck-input safety net)
    this._clear = () => { this.keys = {}; this.ptr.down = false; };
    window.addEventListener('blur', this._clear);
    document.addEventListener('visibilitychange', this._clear);
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      this._dead = true;
      window.removeEventListener('keydown', this._kd);
      window.removeEventListener('keyup', this._ku);
      window.removeEventListener('blur', this._clear);
      document.removeEventListener('visibilitychange', this._clear);
    });
    document.fonts?.ready.then(() => {
      if (this._dead) return;
      for (const t of this.txts) t.updateText();
    });
    this.onCreate();
  }

  /** subclass init hook (runs after base plumbing is ready) */
  protected onCreate(): void { /* override */ }

  update(_t: number, delta: number) {
    const dt = Math.min(delta / 1000, 0.05);
    this.blink += dt;
    this.tick(dt);
    this.pkeys = {}; this.tapped = false; this.swipeDir = null;
  }

  protected abstract tick(dt: number): void;

  /** edge-triggered key press */
  protected kp(code: string) { return !!this.pkeys[code]; }
  /** any key/tap — for "press any key" screens */
  protected anyPress() { return this.tapped || Object.values(this.pkeys).some(v => v); }
  protected txt(i: number) { return this.txts[i]; }

  /** deep-space gradient + star backdrop shared by the season-2 games */
  protected stars: { x: number; y: number; s: number; ph: number }[] = [];
  protected drawSpaceBg(top = 0x040311, mid = 0x0c0a26, bot = 0x150c32) {
    if (this.stars.length === 0) {
      for (let i = 0; i < 26; i++) this.stars.push({ x: Math.random() * VW, y: Math.random() * VH, s: 0.8 + Math.random() * 1.4, ph: Math.random() * 6 });
    }
    this.bg.clear();
    this.bg.fillGradientStyle(top, top, mid, bot, 1);
    this.bg.fillRect(0, 0, VW, VH);
    for (const s of this.stars) {
      const t = (this.blink + s.ph) % 2.4;
      const a = t < 1.2 ? t / 1.2 : (2.4 - t) / 1.2;
      this.bg.fillStyle(0xffffff, Math.max(0.06, a * 0.7));
      this.bg.fillCircle(s.x, s.y, s.s);
    }
  }
}
