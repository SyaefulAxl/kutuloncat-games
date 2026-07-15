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

// ── Per-game background-music themes ──
// Each game gets its own bass line + lead melody + lead timbre so the shared
// tone engine below (bass/lead/hi-hat, swung steps) stops sounding identical
// across every game. Keyed by the string each scene passes into musicTick().
type MusicTheme = { bass: number[]; lead: number[]; leadType: OscillatorType; hatEvery: number };
const THEMES: Record<string, MusicTheme> = {
  // original shared tune, kept as fallback for any untagged caller
  default:    { bass: [110, 110, 131, 110, 147, 110, 165, 147], lead: [523, 659, 784, 659, 523, 659, 784, 1047, 987, 784, 659, 587, 523, 587, 659, 784], leadType: 'triangle', hatEvery: 4 },
  // Hangman — playful call-and-response, minor-tinged (guessing-game suspense)
  hangman:    { bass: [147, 147, 175, 147, 196, 147, 220, 196], lead: [587, 698, 880, 698, 587, 494, 587, 698, 784, 698, 587, 494, 440, 494, 587, 698], leadType: 'square', hatEvery: 0 },
  // Tetris — driving sawtooth arpeggio, faster contour
  tetris:     { bass: [220, 220, 196, 220, 175, 220, 196, 165], lead: [880, 784, 698, 784, 880, 988, 1175, 988, 880, 784, 698, 659, 698, 784, 880, 784], leadType: 'sawtooth', hatEvery: 3 },
  // Snake — low, slithering, chromatic creep
  snake:      { bass: [98, 98, 110, 98, 123, 98, 110, 98], lead: [392, 440, 494, 440, 392, 330, 294, 330, 392, 440, 494, 523, 494, 440, 392, 330], leadType: 'triangle', hatEvery: 4 },
  // Fruit Ninja — bright, fast, slashing triads
  fruitninja: { bass: [131, 131, 165, 131, 196, 131, 165, 147], lead: [659, 784, 988, 784, 659, 784, 988, 1175, 988, 784, 659, 587, 659, 784, 988, 784], leadType: 'square', hatEvery: 2 },
  // Flappy Bird — bouncy up-down flapping contour
  flappybird: { bass: [147, 147, 165, 147, 196, 147, 165, 147], lead: [523, 587, 659, 784, 659, 587, 523, 440, 523, 587, 659, 784, 880, 784, 659, 587], leadType: 'triangle', hatEvery: 4 },
  // Archery — stately, wider intervals, no hi-hat (calm focus)
  archery:    { bass: [110, 110, 123, 110, 138, 110, 123, 98], lead: [440, 523, 587, 523, 440, 392, 349, 392, 440, 523, 587, 659, 587, 523, 440, 392], leadType: 'sawtooth', hatEvery: 0 },
  // Pecah Bhata (brick-breaker) — punchy, high bounce
  brick:      { bass: [165, 165, 185, 165, 208, 165, 185, 147], lead: [659, 880, 784, 988, 880, 659, 784, 988, 1175, 988, 880, 784, 659, 784, 880, 988], leadType: 'square', hatEvery: 4 },
  // Serbu Balik Alien (Galaga-style) — urgent low sawtooth, march feel
  raid:       { bass: [98, 98, 116, 98, 131, 98, 116, 87], lead: [392, 466, 523, 466, 392, 349, 311, 349, 392, 466, 523, 587, 523, 466, 392, 349], leadType: 'sawtooth', hatEvery: 2 },
  // Lahap Labirin (Pac-Man style) — tense, sparse, no hi-hat
  maze:       { bass: [123, 123, 147, 123, 165, 123, 147, 110], lead: [494, 587, 659, 587, 494, 440, 392, 440, 494, 587, 659, 740, 659, 587, 494, 440], leadType: 'square', hatEvery: 4 },
  // Kodok Nyabrang (Frogger-style) — chipper, quick hi-hat groove
  hopper:     { bass: [147, 147, 165, 196, 147, 165, 175, 131], lead: [587, 659, 784, 880, 784, 659, 587, 494, 587, 659, 784, 880, 988, 880, 784, 659], leadType: 'triangle', hatEvery: 3 },
  // Jaga Kotha (Missile Command) — low, cautious, no hi-hat
  sky:        { bass: [87, 87, 104, 87, 116, 87, 104, 78], lead: [349, 415, 466, 415, 349, 311, 277, 311, 349, 415, 466, 523, 466, 415, 349, 311], leadType: 'sawtooth', hatEvery: 0 },
};

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

  // Filtered white-noise burst — a broadband "crack" transient that a pure
  // oscillator sweep (see shoot()) can't produce, since a real gunshot is
  // mostly noise, not a clean pitch. Used for Archery's pistol shot.
  private noiseBurst(dur: number, startFreq: number, endFreq: number, vol: number, delay = 0) {
    if (this.muted) return;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const c = this.ctx;
      if (c.state === 'suspended') c.resume();
      const t = c.currentTime + delay;
      const bufLen = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, bufLen, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      const filt = c.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(startFreq, t);
      filt.frequency.exponentialRampToValueAtTime(Math.max(60, endFreq), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filt); filt.connect(g); g.connect(c.destination);
      src.start(t); src.stop(t + dur + 0.02);
    } catch { /* audio unavailable */ }
  }

  // Pistol shot — a sharp filtered-noise "crack" layered with a short low
  // "thump" tone underneath for body, distinct from the clean square-wave
  // "shoot" blip used by the other games' lasers/interceptors.
  gunshot() {
    this.noiseBurst(0.09, 5200, 700, 0.16);
    this.tone(140, 65, 0.07, 'square', 0.09);
  }

  // Sky Defense interceptor launch — a rising sweep with a bit of noise
  // trailing it (rocket exhaust), distinct from Archery's percussive crack
  // and from the other games' clean-tone laser blips.
  missileLaunch() {
    this.tone(260, 720, 0.14, 'sawtooth', 0.045);
    this.noiseBurst(0.1, 2200, 400, 0.05);
  }

  // A fuller "kaboom" than boom()'s thin sawtooth sweep — layered noise at
  // two cutoff bands plus a low thump, for interceptor/missile detonations
  // that need to feel like a real explosion rather than a blip.
  explosion() {
    this.noiseBurst(0.22, 3000, 200, 0.13);
    this.noiseBurst(0.35, 900, 90, 0.09, 0.02);
    this.tone(110, 40, 0.3, 'sawtooth', 0.08);
  }
  hit()   { this.tone(140, 60, 0.1, 'square', 0.07); }
  coin()  { this.tone(880, 1320, 0.09, 'triangle', 0.06); }
  power() { this.tone(440, 880, 0.18, 'triangle', 0.06); }
  life()  { this.tone(660, 660, 0.08, 'triangle', 0.06); this.tone(990, 990, 0.12, 'triangle', 0.06, 0.08); }
  death() { this.tone(440, 55, 0.5, 'sawtooth', 0.07); }
  clear() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.12, 'square', 0.05, i * 0.11)); }
  warn()  { this.tone(880, 880, 0.07, 'square', 0.05); this.tone(880, 880, 0.07, 'square', 0.05, 0.12); }

  // Background loop shared by every Season 2 mini-game (plus Hangman) — bass
  // + a bouncy lead melody with swung (long-short) step durations plus a
  // soft hi-hat tick, giving the same Mario-Bros-style arcade feel across
  // all of them, but with a distinct THEMES[game] tune/timbre per game so
  // they no longer sound identical. `intensity` (0 or 1) speeds it up and
  // jumps an octave — pass 1 for "danger" moments (low lives, final wave,
  // boss, etc). `game` selects the theme; unrecognized keys fall back to
  // the original shared tune.
  private mNext = 0; private mStep = 0; private mGame = '';
  musicTick(active: boolean, intensity = 0, game = 'default') {
    if (this.muted || !active || !this.ctx || this.ctx.state !== 'running') { this.mNext = 0; return; }
    if (game !== this.mGame) { this.mGame = game; this.mStep = 0; }
    const theme = THEMES[game] || THEMES.default;
    const c = this.ctx;
    const spb = intensity > 0 ? 0.155 : 0.195;
    if (this.mNext < c.currentTime) { this.mNext = c.currentTime + 0.06; }
    while (this.mNext < c.currentTime + 0.22) {
      const dly = this.mNext - c.currentTime;
      const mul = intensity > 0 ? 2 : 1;
      const bass = theme.bass[this.mStep % theme.bass.length] * mul;
      this.tone(bass, bass, 0.11, 'square', 0.02, dly);
      const lead = theme.lead[this.mStep % theme.lead.length] * mul;
      this.tone(lead, lead, 0.09, theme.leadType, this.mStep % 2 === 0 ? 0.02 : 0.012, dly);
      if (theme.hatEvery > 0 && this.mStep % theme.hatEvery === 2) { this.tone(2200, 2200, 0.015, 'square', 0.008, dly); }
      this.mStep++; this.mNext += (this.mStep % 2 === 1) ? spb * 1.3 : spb * 0.7;
    }
  }
}
export const sfx = new Sfx();
export function toggleArcadeMute(): boolean { return sfx.toggle(); }
export function isArcadeMuted(): boolean { return sfx.muted; }

// ── Daily challenge mode: a fresh per-visit choice (unlike mute, not
// persisted) — the ArcadeShell header toggle sets this before the player
// taps the title screen to start. ──
let dailyFlag = false;
export function setDailyMode(v: boolean) { dailyFlag = v; }
export function isDailyMode(): boolean { return dailyFlag; }
export function todayDateSeed(): { date: string; seed: number } {
  const date = new Date().toISOString().slice(0, 10);
  return { date, seed: Number(date.replace(/-/g, '')) };
}

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
    // 32 slots: several games now use indices past the old 20 (power-up
    // labels, combo chains, boss banners) on top of the base HUD/menu text.
    for (let i = 0; i < 32; i++) {
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

    this._kd = (e: KeyboardEvent) => {
      if (!this.keys[e.code]) this.pkeys[e.code] = true; this.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.code === 'KeyM') { sfx.toggle(); window.dispatchEvent(new Event('arcade-mute')); }
    };
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
    this.updateShake(dt);
    this.updateParticles(dt);
    this.tick(dt);
    this.pkeys = {}; this.tapped = false; this.swipeDir = null;
  }

  protected abstract tick(dt: number): void;

  // ── Screen shake — call shake(dur, mag) on impact; apply shakeX/shakeY as a
  // translate offset around whatever draw calls should rattle (usually the
  // gameplay layer, not the HUD). Decay is handled automatically every frame.
  private shakeT = 0; private shakeMag = 0;
  protected shake(dur: number, mag: number) {
    this.shakeT = Math.max(this.shakeT, dur);
    this.shakeMag = Math.max(this.shakeMag, mag);
  }
  private updateShake(dt: number) {
    if (this.shakeT <= 0) return;
    this.shakeT -= dt; this.shakeMag *= 0.9;
    if (this.shakeT <= 0) { this.shakeT = 0; this.shakeMag = 0; }
  }
  protected get shakeX() { return this.shakeMag > 0 ? (Math.random() - 0.5) * 2 * this.shakeMag : 0; }
  protected get shakeY() { return this.shakeMag > 0 ? (Math.random() - 0.5) * 2 * this.shakeMag : 0; }

  // ── Particle burst — spawnParticles() on impact/kill/death, drawParticles()
  // wherever the game wants them rendered (inside a shake save/restore block
  // so they rattle along with everything else). Update runs automatically.
  private particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: number; size: number }[] = [];
  protected spawnParticles(x: number, y: number, color: number, count = 10, speed = 70) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      const life = 0.35 + Math.random() * 0.3;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, maxLife: life, color, size: 1.5 + Math.random() * 1.8 });
    }
  }
  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 90 * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }
  protected drawParticles(layer: Phaser.GameObjects.Graphics = this.g) {
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      layer.fillStyle(p.color, a);
      layer.fillCircle(p.x, p.y, p.size * a);
    }
  }

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
