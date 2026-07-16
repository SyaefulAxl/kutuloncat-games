import Phaser from 'phaser';
import { ArcadeScene, VW, VH, sfx, drawGlow, shade, drawSpriteGrid, startSession, submitScore, SessionCtx, isDailyMode, todayDateSeed, mulberry32, SpriteGrid } from './kit';

// ═══════════════════════════════════════════════════════════════
// WARAN INGKANG KAPUNDUT — Frogger-style crossing game
// A pig crosses road + river to woo 5 lovely ladies.
// Full pixel-sprite architecture matching Space Panic patterns.
// ═══════════════════════════════════════════════════════════════

const PX = 2;
const HUD_H = 32;
const TS = 32; // tile size
const ROWS = 12;
const GOAL_XS = [56, 152, 248, 344, 440];
const RY = (r: number) => HUD_H + r * TS;
const PROMPT_TXT = 29;

// ── VISUAL PALETTE (same as Space Panic) ──
const TXT_BRIGHT = '#f4f8ff';
const TXT_ACCENT = '#7ce3ff';
const TXT_DIM = '#93a8d9';
const TXT_FAINT = '#5f6f9c';
const TXT_GOLD = '#ffd23f';
const TXT_DANGER = '#ff6b6b';
const TXT_GOOD = '#4bdba0';

// Pig palette
const PIG_BODY = 0xffb3c6;
const PIG_BLUSH = 0xff7eb3;
const PIG_BELLY = 0xffe5ec;
const PIG_DARK = 0xcc6b8a;
const PIG_SNOUT = 0xffc9d9;
const PIG_NOSTRIL = 0x9a4d6b;

// Lane / terrain colors
const ROAD_C = 0x1a1a24, ROAD_LINE = 0xd9d9a0;
const WATER_C = 0x0d2440, WATER_HI = 0x3a7aaa;
const GRASS_C = 0x1c2a18, GOAL_C = 0x2a0a28;
const LOG_C = 0x6a4a26, LOG_HI = 0x8a6236, LOG_LO = 0x503618;

// ── GAME CONFIG ──
const STORM_FROM_LEVEL = 2;
const STORM_EVERY_S = 22;
const STORM_DURATION_S = 5;
const STORM_WARN_S = 2;

// ═══════════════════════════════════════════════════════════════
// SPRITE DATA — SpriteGrid pixel art (1=filled, 0=transparent)
// All sprites designed for drawSpriteGrid() with PX=2
// ═══════════════════════════════════════════════════════════════

// ── PIG SPRITES (10 cols × 14 rows, PX=2 → 20×28px) ──
// Pink body, belly highlight, snout with nostrils, ears, big anime eyes
// pw1/pw2 = walk frames (legs alternate), pc = climb/jump, pd = duck/dead
const PIG_SPRITES: Record<string, SpriteGrid> = {
  pw1: [
    [0,0,1,1,1,1,1,1,0,0], // ears top
    [0,1,1,1,1,1,1,1,1,0], // head top
    [0,1,1,2,2,2,2,1,1,0], // eye area (2=eye white placeholder)
    [0,1,2,3,2,3,2,2,1,0], // eyes (3=pupil)
    [0,1,1,1,4,4,1,1,1,0], // snout (4=snout color)
    [0,1,1,4,5,5,4,1,1,0], // nostrils (5=nostril)
    [0,1,1,1,1,1,1,1,1,0], // chin
    [0,1,6,6,6,6,6,6,1,0], // body start (6=belly)
    [1,1,6,6,6,6,6,6,1,1], // body wide
    [1,1,1,6,6,6,6,1,1,1], // body mid
    [0,1,1,1,1,1,1,1,1,0], // body bottom
    [0,1,1,0,0,0,0,1,1,0], // legs (walk frame 1: left forward)
    [0,7,1,0,0,0,0,1,7,0], // hooves (7=hoof)
    [0,0,0,0,0,0,0,0,0,0],
  ],
  pw2: [
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,0],
    [0,1,1,2,2,2,2,1,1,0],
    [0,1,2,3,2,3,2,2,1,0],
    [0,1,1,1,4,4,1,1,1,0],
    [0,1,1,4,5,5,4,1,1,0],
    [0,1,1,1,1,1,1,1,1,0],
    [0,1,6,6,6,6,6,6,1,0],
    [1,1,6,6,6,6,6,6,1,1],
    [1,1,1,6,6,6,6,1,1,1],
    [0,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,0,0,1,1,0,0], // legs (walk frame 2: right forward)
    [0,7,7,0,0,0,0,7,7,0],
    [0,0,0,0,0,0,0,0,0,0],
  ],
  pc: [
    [0,0,1,1,1,1,1,1,0,0], // climb/jump pose — arms up
    [0,1,1,1,1,1,1,1,1,0],
    [1,1,1,2,2,2,2,1,1,1], // arms raised
    [1,1,2,3,2,3,2,2,1,1],
    [0,1,1,1,4,4,1,1,1,0],
    [0,1,1,4,5,5,4,1,1,0],
    [0,1,1,1,1,1,1,1,1,0],
    [0,0,1,6,6,6,6,1,0,0],
    [0,0,1,6,6,6,6,1,0,0],
    [0,0,1,1,6,6,1,1,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,0,1,0,0,1,0,0,0], // legs tucked
    [0,0,0,7,0,0,7,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ],
  pd: [
    [0,0,0,0,0,0,0,0,0,0], // dead/flattened — squashed
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,1,2,2,2,2,1,1,0],
    [1,1,1,2,3,3,2,1,1,1],
    [1,1,1,4,4,4,4,1,1,1],
    [1,6,6,4,5,5,4,6,6,1],
    [1,6,6,6,6,6,6,6,6,1],
    [1,1,6,6,6,6,6,6,1,1],
    [0,1,1,1,1,1,1,1,1,0],
    [0,7,7,7,0,0,7,7,7,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ],
};

// ── Multi-color drawSprite for pig (handles 7 color indices) ──
const PIG_COLORS = [0, PIG_BODY, 0xffffff, 0x1a1420, PIG_SNOUT, PIG_NOSTRIL, PIG_BELLY, PIG_DARK];

// ── FEMALE SPRITES (10×14, PX=2) — 5 unique designs ──
// fp1: Cowgirl, fp2: Nurse, fp3: Cheerleader, fp4: Lady in red, fp5: Maid
const FEMALE_SPRITES: Record<string, SpriteGrid> = {
  fp1: [ // Cowgirl — hat, dress, rosy cheeks
    [0,0,1,1,1,1,1,0,0,0], // hat brim
    [0,1,1,2,2,1,1,1,0,0], // hat crown (2=hat band)
    [0,0,1,1,1,1,1,0,0,0],
    [0,0,3,3,3,3,3,0,0,0], // hair (3=hair)
    [0,0,4,5,4,4,5,0,0,0], // face (4=skin, 5=eye)
    [0,0,4,5,4,4,5,0,0,0],
    [0,0,4,4,6,6,4,0,0,0], // cheeks (6=blush)
    [0,1,4,4,4,4,4,1,0,0], // shoulders
    [0,1,7,7,7,7,7,1,0,0], // dress top (7=dress)
    [1,7,7,8,8,8,8,7,7,1], // dress with pattern (8=accent)
    [1,7,7,7,8,8,7,7,7,1],
    [1,1,7,7,7,7,7,7,1,1], // dress bottom
    [0,0,1,1,0,0,1,1,0,0], // boots
    [0,0,9,9,0,0,9,9,0,0], // feet (9=boots)
  ],
  fp2: [ // Nurse — white cap, cross symbol
    [0,0,1,1,1,1,1,0,0,0], // cap
    [0,0,1,2,2,2,1,0,0,0], // cap with cross (2=red cross)
    [0,0,1,0,2,0,1,0,0,0],
    [0,0,3,3,3,3,3,0,0,0], // hair
    [0,0,4,5,4,4,5,0,0,0], // face
    [0,0,4,5,4,4,5,0,0,0],
    [0,0,4,4,6,6,4,0,0,0], // blush
    [0,0,1,4,4,4,4,1,0,0], // collar
    [0,1,1,1,1,1,1,1,1,0], // uniform top (white)
    [1,1,1,2,2,2,2,1,1,1], // uniform with red trim
    [1,1,1,1,2,2,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1], // uniform bottom
    [0,0,1,1,0,0,1,1,0,0], // shoes
    [0,0,9,9,0,0,9,9,0,0],
  ],
  fp3: [ // Cheerleader — ponytail, pom-poms
    [0,0,0,1,1,1,0,0,0,0], // ponytail top
    [3,0,0,1,1,1,0,0,0,0], // ponytail side (3=hair)
    [3,3,0,4,4,4,0,0,0,0], // hair + face
    [3,3,3,4,5,4,5,0,0,0],
    [0,3,3,4,5,4,5,0,0,0],
    [0,0,3,4,4,6,4,0,0,0], // blush
    [0,2,3,3,4,4,3,2,0,0], // shoulders + pom-poms (2=pom-pom)
    [0,2,2,7,7,7,7,2,2,0], // pom-poms + dress
    [0,0,2,7,7,8,7,2,0,0], // dress with letter (8=letter)
    [0,0,7,7,7,7,7,7,0,0],
    [0,7,7,7,8,8,7,7,7,0],
    [0,7,7,7,7,7,7,7,7,0],
    [0,0,7,7,0,0,7,7,0,0], // legs
    [0,0,9,9,0,0,9,9,0,0], // shoes
  ],
  fp4: [ // Lady in red — elegant dress, pearl necklace
    [0,0,1,1,1,1,1,0,0,0], // hair top
    [0,3,3,1,1,1,3,3,0,0], // hair sides
    [0,3,3,3,3,3,3,3,0,0],
    [0,0,3,4,4,4,3,0,0,0], // face
    [0,0,4,5,4,4,5,0,0,0],
    [0,0,4,5,4,4,5,0,0,0],
    [0,0,4,6,6,6,4,0,0,0], // blush
    [0,0,2,2,2,2,2,0,0,0], // pearl necklace (2=pearls)
    [0,7,7,7,7,7,7,7,0,0], // dress top (red)
    [7,7,7,8,7,7,8,7,7,7], // dress with sparkle (8=sparkle)
    [7,7,7,7,7,7,7,7,7,7],
    [7,7,7,7,7,7,7,7,7,7], // dress flare
    [0,7,7,7,0,0,7,7,7,0],
    [0,0,9,9,0,0,9,9,0,0], // heels
  ],
  fp5: [ // Maid — apron, frilly headband
    [0,1,1,1,1,1,1,1,0,0], // headband
    [0,3,1,1,1,1,1,3,0,0], // hair + headband
    [0,3,3,3,3,3,3,3,0,0],
    [0,0,3,4,4,4,3,0,0,0], // face
    [0,0,4,5,4,4,5,0,0,0],
    [0,0,4,5,4,4,5,0,0,0],
    [0,0,4,6,6,6,4,0,0,0], // blush
    [0,1,1,1,1,1,1,1,0,0], // collar
    [0,1,2,2,2,2,2,1,0,0], // apron top (2=apron white)
    [1,1,1,2,2,2,2,1,1,1], // dress with apron (1=dress)
    [1,1,1,1,2,2,1,1,1,1],
    [1,1,1,1,2,2,1,1,1,1], // apron bottom
    [0,1,1,1,0,0,1,1,1,0],
    [0,0,9,9,0,0,9,9,0,0], // shoes
  ],
};

const FEMALE_COLOR_MAP: Record<string, number[]> = {
  fp1: [0, 0x8B4513, 0xffd700, 0x2a1a0a, 0xffe8dd, 0x2a1a3a, 0xff6b9d, 0xcc3d7a, 0xff8db5, 0x4a2a1a],
  fp2: [0, 0xffffff, 0xff4d4d, 0x4a2a0a, 0xffe8dd, 0x2a1a3a, 0xff6b9d, 0xffffff, 0xff4d4d, 0x2a1a2a],
  fp3: [0, 0xff6b9d, 0xffd23f, 0x6a1a4a, 0xffe8dd, 0x2a1a3a, 0xff6b9d, 0xcc3d7a, 0xffffff, 0x2a1a2a],
  fp4: [0, 0x1a0a1a, 0xffffff, 0x2a1a0a, 0xffe8dd, 0x2a1a3a, 0xff6b9d, 0xcc1133, 0xffd23f, 0x1a0a1a],
  fp5: [0, 0x2a1a3a, 0xffffff, 0x8B4513, 0xffe8dd, 0x2a1a3a, 0xff6b9d, 0x2a1a3a, 0xffd23f, 0x2a1a2a],
};

// ── YAN — special random event character (the warmonger) ──
// 10 cols × 14 rows, PX=2 → 20×28px. Angry militaristic dude.
const YAN_SPRITE: SpriteGrid = [
  [0,0,1,1,1,1,1,1,0,0], // helmet top
  [0,1,1,1,1,1,1,1,1,0], // helmet brim
  [0,1,1,2,2,2,2,1,1,0], // angry eyes (2=white)
  [0,1,2,3,2,2,3,2,1,0], // pupils (3=dark)
  [0,1,1,4,1,1,4,1,1,0], // brow + nose (4=brow)
  [0,1,1,1,5,5,1,1,1,0], // mouth (5=teeth/gritted)
  [0,1,1,1,1,1,1,1,1,0], // chin
  [0,1,6,6,6,6,6,6,1,0], // body (6=uniform)
  [1,1,6,6,7,7,6,6,1,1], // chest stripe (7=accent)
  [1,1,1,6,6,6,6,1,1,1], // body mid
  [0,1,1,1,1,1,1,1,1,0], // body bottom
  [0,1,1,0,0,0,0,1,1,0], // legs
  [0,7,1,0,0,0,0,1,7,0], // boots (7=accent)
  [0,0,0,0,0,0,0,0,0,0],
];
const YAN_COLORS = [0, 0x3a5a3a, 0xffffff, 0x1a1420, 0x2a2a2a, 0xe8e8e8, 0x4a6a4a, 0xc0392b];

// Yan dialogue beats (sequential)
const YAN_LINE = 'War No No aaa No No War';
const PIG_REPLY = 'Asu kau Yan';        // prioritised line — shown most often
// Expanded gombalan pool — pig can fire a WIDER variety of lines back at Yan,
// not just 3. Weights stay tuned so "Asu kau Yan" still dominates (~50%),
// and the rest are spread across keyword favourites (kebon cabe, nomor wa,
// 18 mm) plus some new flirty lines. Whenever you want more lines, add them
// here — they will rotate automatically.
const PIG_POOL: { line: string; w: number }[] = [
  { line: 'Asu kau Yan',                         w: 50 }, // ~50% baseline
  { line: '18 mm is the best',                   w: 8  }, // favourite keyword
  { line: 'KEBUN CABEKU LHO YAN',                w: 8  }, // favourite keyword
  { line: 'AKU SIH SUKA TANAM CABE RAWIT',       w: 6  }, // variasi cabe
  { line: 'MINTA NOMOR WA-NYA DONG YAN',         w: 7  }, // favourite keyword
  { line: 'KIRIM WA KE AKU YAA YAN',             w: 6  }, // variasi nomor wa
  { line: '18 CM? NGGAK, 18 MM ITU YANG PALING PAS', w: 5 }, // variasi 18 mm
  { line: 'CABE RAWIT KAYAK KAMU, PEDAS BANGET', w: 4  },
  { line: 'WHATSAPP AKU, NO COPAS',              w: 4  },
  { line: '18 MM IMPERIAL, YANG LAIN BONCOS',    w: 4  },
];
const PIG_POOL_TOTAL = PIG_POOL.reduce((s, p) => s + p.w, 0);
function pickYanPigLine(): string {
  let r = Math.random() * PIG_POOL_TOTAL;
  for (const p of PIG_POOL) {
    r -= p.w;
    if (r <= 0) return p.line;
  }
  return PIG_POOL[0].line;
}
const YAN_CAUGHT = 'Auuww Jleb Jleeb';

// ── CAR SPRITES (16 cols × 10 rows, PX=2 → 32×20px) ──
// Simplified: 1=body, 2=window, 3=accent, 4=wheel, 5=headlight
const CAR_SPRITES: Record<string, SpriteGrid> = {
  car1: [ // Red car
    [0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,2,2,1,1,1,1,1,2,2,1,1,1,0],
    [1,1,2,2,2,1,1,1,1,1,2,2,2,1,1,5],
    [1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,5],
    [1,1,1,1,3,3,3,3,3,3,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,4,4,0,0,0,0,0,0,0,0,4,4,0,0],
    [0,0,4,4,0,0,0,0,0,0,0,0,4,4,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  car2: [ // Blue truck
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,2,2,2,2,1,1,1,0],
    [1,1,1,1,1,1,1,1,2,2,2,2,1,1,1,1],
    [1,1,2,2,1,1,1,1,1,1,1,1,1,1,1,5],
    [1,1,2,2,1,1,3,3,1,1,1,1,1,1,1,5],
    [1,1,1,1,1,3,3,3,3,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [0,4,4,0,0,0,0,0,0,0,0,0,0,4,4,0],
    [0,4,4,0,0,0,0,0,0,0,0,0,0,4,4,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  car3: [ // Yellow taxi
    [0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,2,2,1,1,1,1,1,1,2,2,1,1,5],
    [1,1,2,2,2,1,1,3,3,1,2,2,2,1,1,5],
    [1,1,1,1,1,1,3,3,3,3,1,1,1,1,1,1],
    [1,1,1,1,3,3,3,3,3,3,3,3,1,1,1,1],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,4,4,0,0,0,0,0,0,0,0,0,0,4,4,0],
    [0,4,4,0,0,0,0,0,0,0,0,0,0,4,4,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  car4: [ // Green jeep
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,1,2,2,1,1,1,1,2,2,1,1,1,0],
    [1,1,1,1,2,2,1,1,1,1,2,2,1,1,1,1],
    [1,1,3,3,1,1,1,1,1,1,1,1,3,3,1,5],
    [1,3,3,3,1,1,1,1,1,1,1,1,3,3,3,5],
    [1,3,3,3,1,1,1,1,1,1,1,1,3,3,3,1],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,4,4,0,0,4,4,0,0,0,4,4,0,0,0,0],
    [0,4,4,0,0,4,4,0,0,0,4,4,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
};

const CAR_COLOR_MAP: Record<string, number[]> = {
  car1: [0, 0xff5c5c, 0xbfe8ff, 0xff2a2a, 0x1a1a1a, 0xfff8a0],
  car2: [0, 0x4488ff, 0xbfe8ff, 0x2a4aaa, 0x1a1a1a, 0xfff8a0],
  car3: [0, 0xffd23f, 0xbfe8ff, 0xff8c1a, 0x1a1a1a, 0xfff8a0],
  car4: [0, 0x4bdb6b, 0xbfe8ff, 0x2a8a3a, 0x1a1a1a, 0xfff8a0],
};

const CAR_KEYS = ['car1', 'car2', 'car3', 'car4'];

// ── POWER-UP SPRITES (8×8, PX=2 → 16×16px) ──
const PU_SPRITES: Record<string, SpriteGrid> = {
  pu_heart: [ // Shield heart
    [0,1,1,0,0,1,1,0],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,0,0,0,0,0],
  ],
  pu_snow: [ // Freeze snowflake
    [0,0,1,1,1,1,0,0],
    [0,1,0,1,1,0,1,0],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [0,1,0,1,1,0,1,0],
    [0,0,1,1,1,1,0,0],
  ],
  pu_star: [ // Double score star
    [0,0,0,1,1,0,0,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,0],
    [0,1,0,1,1,0,1,0],
    [1,0,0,1,1,0,0,1],
    [0,0,0,0,0,0,0,0],
  ],
  pu_clock: [ // +Time clock
    [0,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1],
    [1,1,0,1,1,0,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,0,1,1,0,1,1],
    [1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,0],
  ],
};

const PU_COLORS: Record<string, number> = {
  pu_heart: 0xff6b9d, pu_snow: 0x6bd4ff, pu_star: 0xffd23f, pu_clock: 0x6bff8c,
};

type PowerType = 'shield' | 'freeze' | 'double' | 'time';
const PU_TYPE_MAP: Record<string, PowerType> = {
  pu_heart: 'shield', pu_snow: 'freeze', pu_star: 'double', pu_clock: 'time',
};
const PU_KEYS = ['pu_heart', 'pu_snow', 'pu_star', 'pu_clock'];

// ── LOG SPRITES (varied width, 8 rows) ──
// Simple rounded log made of pixels — 3 sizes
const LOG_SPRITES: Record<string, SpriteGrid> = {
  log_short: [ // 8×8
    [0,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1],
    [1,1,2,2,1,1,1,1],
    [1,2,2,2,2,1,1,1],
    [1,1,2,2,1,1,1,1],
    [1,1,1,1,1,2,2,1],
    [0,1,1,1,1,1,1,0],
    [0,0,0,0,0,0,0,0],
  ],
  log_medium: [ // 12×8
    [0,1,1,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,2,2,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,1,1,2,2,1,1,1],
    [1,1,2,2,1,1,1,2,2,1,1,1],
    [1,1,1,1,1,1,1,1,1,2,2,1],
    [0,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  log_long: [ // 16×8
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,2,2,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,1,1,2,2,1,1,1,2,2,1,1],
    [1,1,2,2,1,1,1,2,2,1,1,1,2,2,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,2,2,1,1,1],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ],
};

const LOG_COLOR_MAP = [0, LOG_C, LOG_HI];

// ── PICKUP LINES (Rayuan) ──
const RAYUAN_LINES = [
  'HI CANTIK! AKU PUNYA KEBON CABE LO', 'MINTA NOMOR WA-NYA DONG',
  'SENYUM DONG SAYANG, KAMU CANTIK BANGET',
  'BIDADARI DARI SURGA? AKU SUKA SAMA KAMU',
  'KAMU KAYAK TV, SINYALNYA SAMPE HATI',
  'APA KAMU KOPI? SOALNYA BIKIN GAK TIDUR',
  'KAMU MATAHARI? KALO GAK ADA KAMU GELAP GINI',
  'POSESIF BOLEH? SOALNYA AKU CEMAS KAMU DIREBUT',
  'AKU LELAH, SOALNYA BERJUTA JAUH DARI KAMU',
  'KAMU KUNCI? SOALNYA BIKIN HATI TERKUNCI',
  'KAMU BURUNG, PANTES SUARANYA MERDU DI TELINGA',
  'KAMU TUH BAHAYA, SOALNYA BIKIN KECANDUAN',
  'KAMU INTERNET? SOALNYA GAK BISA JAUH DARI KAMU',
  'KAMU TUH PAHIT, TAPI OBAT BUAT AKU',
];
const RAYUAN_WIN_LINES = [
  'AKU DIAM-DIAM CINTA SAMA KAMU', 'MAU NIKAH SAMA AKU?',
  'KAMU TUH CINTA SEJATI', 'BAWA KE ORANG TUA YUK!',
  'HARTANYA HATI, MAHARKAN CINTA', 'CINTA SEJATI DI KANDANG INI',
  'KAU BIDADARI TERSEMBUNYI', 'HANYA KAMU YANG AKU CARI',
  'DARI SEMUA SUNGAI DAN JALAN', 'AKU NYEBRANG CUMA BUAT KAMU',
];

// ═══════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════
interface Car { x: number; w: number; lane: number; sprite: string; dir: number; cols?: number }
interface Log { x: number; w: number; lane: number; sprite: string; dir: number; cols?: number }
interface Gator { x: number; lane: number; dir: number }
interface PowerUp { x: number; y: number; t: number; type: PowerType; sprite: string }
interface ScorePopup { x: number; y: number; text: string; t: number; color: string }

interface LaneDef { dir: number; speed: number; gap: number; carW: number; sprite: string }
interface RiverLaneDef { dir: number; speed: number; gap: number; logW: number; sprite: string }

interface HopperState {
  score: number; level: number; lives: number;
  state: string; goalsDone: number; timeLeft: number;
  combo: number; started: boolean; gameOver: boolean;
}

function emitState(s: HopperState) {
  (window as any).__hopperState = s;
  window.dispatchEvent(new Event('hopper-update'));
}

// Helper: wrap text into lines up to maxChars
function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; }
    else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: draw multi-color SpriteGrid (for pig/female/car sprites with
// multiple color indices instead of single-color drawSpriteGrid)
// ═══════════════════════════════════════════════════════════════
function drawMultiSprite(
  g: Phaser.GameObjects.Graphics,
  data: SpriteGrid,
  colors: number[],
  x: number,
  y: number,
  flipX: boolean,
  scale: number,
  alpha = 1,
) {
  const rows = data.length, cols = data[0].length, px = PX * scale;
  // Dark outline pass
  g.fillStyle(0x030308, alpha * 0.7);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const idx = data[r][c];
      if (idx > 0) {
        const dc = flipX ? cols - 1 - c : c;
        g.fillRect(Math.round(x + dc * px) - 1, Math.round(y + r * px) - 1, Math.ceil(px) + 2, Math.ceil(px) + 2);
      }
    }
  // Color pixel pass
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = data[r][c];
      if (idx === 0) continue;
      const dc = flipX ? cols - 1 - c : c;
      const color = colors[idx] || colors[1] || 0xffffff;
      // Bevel: top/left = highlight, bottom/right = shadow
      const top = r > 0 && data[r - 1][c] === idx;
      const left = c > 0 && data[r][c - 1] === idx;
      const bot = r < rows - 1 && data[r + 1][c] === idx;
      const right = c < cols - 1 && data[r][c + 1] === idx;
      const fill = (!top || !left) ? shade(color, 0.4) : (!bot || !right) ? shade(color, -0.3) : color;
      g.fillStyle(fill, alpha);
      g.fillRect(Math.round(x + dc * px), Math.round(y + r * px), Math.ceil(px), Math.ceil(px));
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN SCENE
// ═══════════════════════════════════════════════════════════════
type YanState = 'idle' | 'saying' | 'caught';

export class HopperScene extends ArcadeScene {
  private gs = 'TITLE';
  private score = 0; private lives = 3; private level = 1;
  private pig = { x: VW / 2, row: 11, heartEyes: false, blush: 0, walkCycle: 0, dir: 1, face: 'up' as 'up' | 'down' | 'left' | 'right' };
  private cars: Car[] = []; private logs: Log[] = [];
  private roadLanes: LaneDef[] = []; private riverLanes: RiverLaneDef[] = [];
  private spawnT: number[] = [];
  private goals: boolean[] = [false, false, false, false, false];
  private timeLeft = 30; private maxRow = 11;
  private goalsDone = 0; private hops = 0;
  private deathT = 0; private stateT = 0;
  private startTime = 0; private sess: SessionCtx = null;
  private daily = false; private dailyDate = '';
  private gator: Gator | null = null; private gatorSpawnT = 8;
  private stormT = 0; private nextStormAt = STORM_EVERY_S;
  // ── Dialogue — strictly event-driven. NO auto-rotation rayuan (used to
  // fire a fresh pickup line every 5s with 4s visible — bubble covered
  // ~80% of the play session and made the game feel chatty). The bubble
  // now appears only for: power-up pickup, shield break, Yan spawn/reply,
  // Yan caught, goal reached, and a single welcome line on level start.
  // nextDialogueAt is the cooldown between any two event-bubbles.
  private dialogueText = ''; private dialogueT = 0; private nextDialogueAt = 5;
  private dialogueShownThisLevel = false;
  private powerUps: PowerUp[] = [];
  private activePowers: Partial<Record<PowerType, { t: number }>> = {};
  private nextPowerAt = 10;
  private comboCount = 0;
  private scorePopups: ScorePopup[] = [];
  private pigBounce = 0;
  private pigAnimT = 0;
  private lastStateKey = '';
  private _backHandler: (() => void) | null = null;
  // ── Yan special-event state ──
  private yan: { active: boolean; x: number; row: number; t: number; phase: YanState; prevDialogueText: string; prevDialogueT: number; yanT: number; replyPicked: boolean } =
    { active: false, x: 0, row: 0, t: 0, phase: 'idle', prevDialogueText: '', prevDialogueT: 0, yanT: 0, replyPicked: false };
  private nextYanAt = 18;

  constructor() { super({ key: 'HopperScene' }); }

  protected onCreate() {
    this._backHandler = () => {
      this.gs = 'TITLE';
      this.stateT = 0;
      this.deathT = 0;
      this.dialogueText = '';
      this.dialogueT = 0;
      this.dialogueShownThisLevel = false;
      this.scorePopups = [];
      this.yan = { active: false, x: 0, row: 0, t: 0, phase: 'idle', prevDialogueText: '', prevDialogueT: 0, yanT: 0, replyPicked: false };
      this.nextYanAt = 18;
    };
    window.addEventListener('game-back', this._backHandler);
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      if (this._backHandler) {
        window.removeEventListener('game-back', this._backHandler);
        this._backHandler = null;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // LEVEL SETUP
  // ═══════════════════════════════════════════════════════════════
  private buildLanes() {
    const rng = this.daily ? mulberry32(todayDateSeed().seed * 37 + this.level) : Math.random;
    const sp = 1 + (this.level - 1) * 0.15;
    const gapMult = Math.max(0.65, 1 - (this.level - 1) * 0.05);
    this.roadLanes = [];
    for (let i = 0; i < 5; i++) {
      const carKey = CAR_KEYS[Math.min(i, CAR_KEYS.length - 1)];
      const carIdx = i % 2 === 0 ? i : Math.min(i + 2, CAR_KEYS.length - 1);
      const spriteKey = CAR_KEYS[Math.min(carIdx, CAR_KEYS.length - 1)];
      this.roadLanes.push({
        dir: i % 2 === 0 ? 1 : -1,
        speed: (62 + i * 16 + rng() * 20) * sp,
        gap: Math.max(100, (230 - i * 8) * gapMult),
        carW: 32,
        sprite: spriteKey,
      });
    }
    this.riverLanes = [];
    const logSprites = ['log_short', 'log_medium', 'log_long'];
    for (let i = 0; i < 5; i++) {
      const logIdx = i % 3;
      const sprite = logSprites[logIdx];
      const logW = logIdx === 0 ? 34 : logIdx === 1 ? 52 : 70;
      this.riverLanes.push({
        dir: i % 2 === 0 ? -1 : 1,
        speed: (42 + i * 10) * sp,
        gap: (96 + i * 10) * gapMult,
        logW,
        sprite,
      });
    }
    this.cars = []; this.logs = [];
    for (let li = 0; li < 5; li++) {
      const L = this.roadLanes[li];
      for (let x = -40; x < VW + 40; x += L.carW + L.gap)
        this.cars.push({ x: x + rng() * 40, w: L.carW, lane: li, sprite: L.sprite, dir: L.dir });
    }
    for (let li = 0; li < 5; li++) {
      const L = this.riverLanes[li];
      for (let x = -80; x < VW + 80; x += L.logW + L.gap)
        this.logs.push({ x: x + rng() * 30, w: L.logW, lane: li, sprite: L.sprite, dir: L.dir });
    }
    this.spawnT = new Array(10).fill(0);
    this.gator = null; this.gatorSpawnT = 8 + Math.random() * 6;
    this.stormT = 0; this.nextStormAt = STORM_EVERY_S;
    this.powerUps = []; this.nextPowerAt = 10;
    this.activePowers = {};
  }

  private resetPig() {
    this.pig = { x: VW / 2, row: 11, heartEyes: false, blush: 0, walkCycle: 0, dir: 1, face: 'up' };
    this.timeLeft = Math.max(20, 40 - (this.level - 1) * 2);
    this.maxRow = 11;
    this.pigBounce = 0;
  }

  private startGame() {
    this.score = 0; this.lives = 3; this.level = 1;
    this.goals = [false, false, false, false, false];
    this.goalsDone = 0; this.hops = 0; this.deathT = 0;
    this.daily = isDailyMode(); this.dailyDate = todayDateSeed().date;
    this.startTime = Date.now(); this.comboCount = 0;
    startSession('road-hopper').then(s => { this.sess = s; });
    sfx.start();
    this.buildLanes(); this.resetPig();
    this.dialogueText = ''; this.dialogueT = 0; this.nextDialogueAt = 5;
    this.dialogueShownThisLevel = false;
    this.yan = { active: false, x: 0, row: 0, t: 0, phase: 'idle', prevDialogueText: '', prevDialogueT: 0, yanT: 0, replyPicked: false };
    this.nextYanAt = 18;
    this.gs = 'PLAYING';
  }

  private gameOver() {
    this.gs = 'GAME_OVER'; this.stateT = 0;
    sfx.death();
    this.submitScoreSafe();
  }

  private turtlesSubmerged(): boolean { return Math.sin(this.blink * 1.3) > 0.2; }
  private hasPower(t: PowerType): boolean { return !!this.activePowers[t] && this.activePowers[t]!.t > 0; }

  private die(x?: number, y?: number) {
    if (this.deathT > 0) return;          // already dying — ignore repeats
    if (this.hasPower('shield')) {
      this.activePowers.shield = { t: 0 };
      sfx.bounce();
      this.spawnParticles(x ?? this.pig.x, y ?? RY(this.pig.row) + TS / 2, 0xff6b9d, 20, 100);
      if (!this.yan.active) {            // Yan owns the bubble — don't override it
        this.dialogueText = 'PERISAI HILANG!'; this.dialogueT = 0.8;
      }
      return;
    }
    // ── REAL DEATH ── start the death sequence (uPlay counts deathT down,
    // decrements lives, then either resets the pig or triggers game over).
    this.deathT = 0.9;
    sfx.death();
    // kill any active Yan event so it can't keep the pig "alive" or leave a ghost bubble
    if (this.yan.active) {
      this.yan.active = false; this.yan.phase = 'idle'; this.yan.replyPicked = false;
    }
    this.dialogueText = ''; this.dialogueT = 0;
    this.spawnParticles(x ?? this.pig.x, y ?? RY(this.pig.row) + TS / 2, 0xff9ec4, 14, 80);
  }

  private spawnScorePopup(x: number, y: number, text: string, color = TXT_GOLD) {
    this.scorePopups.push({ x, y, text, t: 1.2, color });
  }

  // ═════════════════════════════════════════════════════════════
  // MOVEMENT — hop forward / backward / sideways
  // ═════════════════════════════════════════════════════════════
  private hop(dx: number, dy: number) {
    if (this.deathT > 0) return;
    const nr = this.pig.row + dy;
    if (nr < 0 || nr > 11) return;
    const nx = Math.max(12, Math.min(VW - 12, this.pig.x + dx * TS));
    this.pig.walkCycle += 1;
    if (dy < 0) { this.pig.face = 'up'; this.pigBounce = 0.15; }
    else if (dy > 0) { this.pig.face = 'down'; this.pigBounce = 0.15; }
    else { this.pig.face = dx < 0 ? 'left' : 'right'; this.pigBounce = 0.12; }
    if (dx > 0) this.pig.dir = 1;
    else if (dx < 0) this.pig.dir = -1;

    // Check goal row
    if (nr === 0) {
      let hitSlot = -1;
      for (let i = 0; i < GOAL_XS.length; i++) if (Math.abs(GOAL_XS[i] - nx) < 22) hitSlot = i;
      if (hitSlot < 0 || this.goals[hitSlot]) { this.die(nx, RY(nr) + TS / 2); return; }
      this.goals[hitSlot] = true;
      this.goalsDone++;
      this.comboCount++;
      const comboMult = Math.min(4, Math.max(1, this.comboCount));
      const hasDouble = this.hasPower('double');
      const mult = hasDouble ? comboMult * 2 : comboMult;
      const timeBonus = Math.ceil(this.timeLeft) * 5;
      const baseScore = 100 * this.level;
      const total = Math.round(baseScore * mult + timeBonus);
      this.score += total;
      sfx.coin();
      if (!this.yan.active) {            // Yan owns the bubble — don't override it
        this.dialogueText = RAYUAN_WIN_LINES[Math.floor(Math.random() * RAYUAN_WIN_LINES.length)];
        this.dialogueT = 1.4;          // shorter (was 2.5s) — keeps the action snappy
      }
      this.pig.heartEyes = true;
      this.pig.blush = 0.6;
      this.spawnScorePopup(GOAL_XS[hitSlot], RY(0) - 14, `+${total}`, TXT_GOLD);
      this.spawnParticles(GOAL_XS[hitSlot], RY(0) + TS / 2, 0xff4d8c, 20, 90);

      if (this.goals.every(Boolean)) {
        const levelBonus = 1000 + this.level * 200;
        this.score += levelBonus;
        this.level++;
        this.goals = [false, false, false, false, false];
        sfx.clear();
        this.buildLanes();
        this.spawnScorePopup(VW / 2, RY(0) - 24, `LV ${this.level}! +${levelBonus}`, TXT_ACCENT);
      }
      this.resetPig();
      return;
    }
    this.pig.row = nr; this.pig.x = nx; this.hops++;
    if (nr < this.maxRow) { this.maxRow = nr; this.score += this.hasPower('double') ? 20 : 10; }
    sfx.pop();
  }

  private pickPowerUp(pu: PowerUp) {
    const dur = pu.type === 'time' ? 0 : 8;
    if (!this.yan.active) {              // Yan owns the bubble — don't override it
      if (pu.type === 'shield') { this.activePowers.shield = { t: dur }; this.dialogueText = 'PERISAI CINTA!'; }
      else if (pu.type === 'freeze') { this.activePowers.freeze = { t: dur }; this.dialogueText = 'BEKUIN MEREKA!'; }
      else if (pu.type === 'double') { this.activePowers.double = { t: dur }; this.dialogueText = 'x2 DOUBLE SCORE!'; }
      else if (pu.type === 'time') { this.timeLeft = Math.min(this.timeLeft + 10, 40); this.dialogueText = '+10 DETIK!'; }
      this.dialogueT = 1.2;
    }
    this.pig.blush = 0.3;
    sfx.power();
    // particle at the power-up's actual Y (was hardcoded to row 5)
    this.spawnParticles(pu.x, pu.y, PU_COLORS[pu.sprite], 14, 90);
  }

  // ── YAN special event: random spawn, sequential dialogue, catch bonus ──
  private updateYan(dt: number) {
    if (this.deathT > 0) return;
    const yan = this.yan;

    if (!yan.active) {
      this.nextYanAt -= dt;
      if (this.nextYanAt <= 0) {
        // spawn ANYWHERE (any row 0..11)
        const row = Math.floor(Math.random() * 12);
        yan.active = true;
        yan.row = row;
        yan.x = 20 + Math.random() * (VW - 40);
        yan.phase = 'saying';
        yan.t = 7;                   // longer window so the pig can reach & catch Yan
        yan.yanT = 0;                // Yan's own line timer
        yan.prevDialogueText = this.dialogueText;
        yan.prevDialogueT = this.dialogueT;
        // CRITICAL FIX: pick the pig's reply line IMMEDIATELY at spawn time,
        // so the PIG's bubble never shows YAN_LINE (which is for Yan's bubble).
        // Previously the reply was chosen on the next frame, leaving 1 frame
        // (~16ms) where the pig bubble wrongly said "War No No...".
        this.dialogueText = pickYanPigLine();
        this.dialogueT = 2.0;        // shorter (was 3.5s) — bubble was covering the playfield
        yan.replyPicked = true;       // already picked — never re-roll
        this.pig.blush = 0.3;
        sfx.power();
        this.nextYanAt = 18 + Math.random() * 14; // next event 18–32s later
      }
      return;
    }

    // active
    yan.yanT += dt;
    yan.t -= dt;
    // Safety net: while Yan is on screen, ALWAYS keep the pig's reply alive
    // and visible — re-roll ONLY if it somehow becomes blank (defensive).
    if (yan.phase === 'saying') {
      if (!yan.replyPicked || !this.dialogueText) {
        this.dialogueText = pickYanPigLine();
        yan.replyPicked = true;
      }
      this.dialogueT = Math.max(this.dialogueT, 1.5);
    }
    if (yan.t <= 0 && yan.phase !== 'caught') {
      yan.active = false;
      yan.phase = 'idle';
      yan.replyPicked = false;
      this.dialogueText = '';
      this.dialogueT = 0;
      this.nextDialogueAt = 1;
    }
  }

  private catchYan() {
    const yan = this.yan;
    yan.phase = 'caught';
    yan.t = 1.4;                     // brief "caught" flash
    const bonus = 500 * this.level;
    this.score += bonus;
    this.dialogueText = YAN_CAUGHT;
    this.dialogueT = 1.0;
    this.pig.blush = 0.6;
    sfx.coin();
    this.spawnParticles(yan.x, RY(yan.row) + TS / 2, 0xff4d8c, 24, 120);
    this.spawnScorePopup(yan.x, RY(yan.row) - 14, `+${bonus}`, TXT_GOLD);
    yan.active = false;
  }

  private submitScoreSafe() {
    try {
      submitScore('road-hopper', this.score, {
        goals: this.goalsDone, level: this.level, hops: this.hops,
        durationSec: Math.floor((Date.now() - this.startTime) / 1000),
        daily: this.daily, dailyDate: this.daily ? this.dailyDate : undefined,
        yanBonus: true,
      }, this.sess);
    } catch {
      /* offline — ignore */
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIN UPDATE LOOP
  // ═══════════════════════════════════════════════════════════════
  protected tick(dt: number) {
    sfx.musicTick(this.gs === 'PLAYING', this.lives <= 1 ? 1 : 0, 'hopper');
    this.g.clear(); this.ui.clear(); this.bg.clear();
    for (const t of this.txts) t.setVisible(false);
    if (this.pigBounce > 0) this.pigBounce -= dt * 2;
    if (this.gs === 'TITLE') { this.drawSpaceBg(); this.uTitle(); }
    else if (this.gs === 'PLAYING') this.uPlay(dt);
    else if (this.gs === 'GAME_OVER') this.uGO(dt);
    this.emitStateDedup();
  }

  private emitStateDedup() {
    const tl = Math.ceil(this.timeLeft);
    const key = [this.score, this.level, this.lives, tl, this.gs, this.goalsDone].join('|');
    if (key === this.lastStateKey) return;
    this.lastStateKey = key;
    emitState({
      score: this.score, level: this.level, lives: this.lives,
      state: this.gs, goalsDone: this.goalsDone, timeLeft: tl,
      combo: this.comboCount, started: this.gs === 'PLAYING',
      gameOver: this.gs === 'GAME_OVER',
    });
  }

  // ── TITLE SCREEN ──
  private uTitle() {
    const w = VW, h = VH;
    // Title — 24px, must be multiple of 8
    this.setTxt(0, 0.5, 0, 24, TXT_ACCENT, 'WARAN INGKANG\nKAPUNDUT', w / 2, h * 0.10, 'center', 4);
    // Big pig center
    this.drawPigSprite(this.g, w / 2 - 20, h * 0.30, 2, false, 'pw1');
    // Female beside pig
    this.drawFemaleSprite(this.g, w / 2 + 30, h * 0.30, 1.5, 0);
    // Subtitle
    this.setTxt(1, 0.5, 0, 8, TXT_DIM, 'SEBRANGI JALAN & SUNGAI\nUNTUK PACARI 5\nPEREMPUAN CANTIK', w / 2, h * 0.52, 'center', 6);
    // Power-up hint
    this.setTxt(2, 0.5, 0, 8, '#ff6b9d', 'POWER: PERISAI  BEKU  x2  +WAKTU', w / 2, h * 0.66);
    // Controls
    this.setTxt(3, 0.5, 0, 8, TXT_FAINT, this.isTouch ? 'TAP = LOMPAT MAJU\nSWIPE = ARAH' : 'PANAH = LOMPAT', w / 2, h * 0.72, 'center', 4);
    // Blinking start prompt
    if (this.blink % 1 < 0.62) {
      this.setTxt(PROMPT_TXT, 0.5, 0, 16, TXT_ACCENT, this.isTouch ? 'TAP TO START' : 'PRESS ANY KEY', w / 2, h * 0.84);
    }
    if (this.anyPress()) this.startGame();
  }

  // ── GAME OVER SCREEN ──
  private uGO(dt: number) {
    this.stateT += dt;
    this.rWorld();
    this.ui.fillStyle(0x03040c, 0.78); this.ui.fillRect(0, 0, VW, VH);
    this.setTxt(10, 0.5, 0, 32, TXT_DANGER, 'GAME OVER', VW / 2, VH * 0.20);
    this.setTxt(11, 0.5, 0, 16, TXT_BRIGHT, 'SKOR: ' + this.score, VW / 2, VH * 0.36);
    this.setTxt(12, 0.5, 0, 8, TXT_DIM, 'LV ' + this.level + '  -  ' + this.goalsDone + ' PACAR DAPET', VW / 2, VH * 0.46);
    this.setTxt(13, 0.5, 0, 8, TXT_GOLD, 'LOMPATAN: ' + this.hops, VW / 2, VH * 0.52);
    if (this.stateT > 1.2 && this.blink % 1 < 0.62) {
      this.setTxt(PROMPT_TXT, 0.5, 0, 8, TXT_ACCENT, this.isTouch ? 'TAP TO CONTINUE' : 'PRESS ANY KEY', VW / 2, VH * 0.66);
    }
    if (this.stateT > 1.2 && this.anyPress()) this.gs = 'TITLE';
  }

  // ── PLAYING STATE ──
  private uPlay(dt: number) {
    // Input: up = forward, down = backward, left/right = sideways
    if (this.kp('ArrowUp') || this.swipeDir === 'up' || this.tapped) this.hop(0, -1);
    else if (this.kp('ArrowDown') || this.swipeDir === 'down') this.hop(0, 1);
    else if (this.kp('ArrowLeft') || this.swipeDir === 'left') this.hop(-1, 0);
    else if (this.kp('ArrowRight') || this.swipeDir === 'right') this.hop(1, 0);

    if (this.pig.heartEyes) this.pig.heartEyes = false;
    if (this.pig.blush > 0) this.pig.blush -= dt;
    this.pigAnimT += dt;

    // Death sequence
    if (this.deathT > 0) {
      this.deathT -= dt;
      if (this.deathT <= 0) {
        this.lives--;
        if (this.lives <= 0) { this.gameOver(); return; }
        this.resetPig();
      }
      this.rWorld();
      return;
    }

    // Power-up timers
    for (const key of Object.keys(this.activePowers) as PowerType[]) {
      const p = this.activePowers[key];
      if (p && p.t > 0) p.t -= dt;
    }

    // Dialogue — strictly event-driven, no auto-rotation. The bubble only
    // appears for the moment the player should see feedback (power-up,
    // shield break, Yan event, goal reached, first idle on a new level).
    if (this.dialogueT > 0) {
      this.dialogueT -= dt;
    } else if (!this.dialogueShownThisLevel && !this.yan.active && this.timeLeft > 1) {
      // First idle bubble of this level: one quick rayuan so the player
      // sees the comic timing once, then never auto-fires again.
      this.dialogueText = RAYUAN_LINES[Math.floor(Math.random() * RAYUAN_LINES.length)];
      this.dialogueT = 2.0;          // shorter than before (was 4s)
      this.pig.blush = 0.3;
      this.dialogueShownThisLevel = true;
    }

    // Timer
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.die(); }

    // Storm event
    let stormMult = 1;
    const frozen = this.hasPower('freeze');
    if (!frozen && this.level >= STORM_FROM_LEVEL) {
      this.stormT += dt;
      const inStorm = this.stormT >= this.nextStormAt && this.stormT < this.nextStormAt + STORM_DURATION_S;
      if (inStorm) stormMult = 1.6;
      if (this.stormT >= this.nextStormAt + STORM_DURATION_S) this.nextStormAt = this.stormT + STORM_EVERY_S;
    }

    // Spawn/update cars
    if (!frozen) {
      for (let li = 0; li < 5; li++) {
        const L = this.roadLanes[li]; this.spawnT[li] -= dt;
        if (this.spawnT[li] <= 0) {
          // Single cars only — they travel side-by-side in their lane (gandeng),
          // never stacked into one wide blob (bertumpuk).
          this.cars.push({ x: L.dir > 0 ? -L.carW - 10 : VW + 10, w: L.carW, lane: li, sprite: L.sprite, dir: L.dir, cols: 1 });
          this.spawnT[li] = (L.carW + L.gap) / (L.speed * stormMult);
        }
      }
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const c = this.cars[i], L = this.roadLanes[c.lane];
        c.x += L.dir * L.speed * stormMult * dt;
        if (c.x < -c.w - 20 || c.x > VW + c.w + 20) this.cars.splice(i, 1);
      }
      // Spawn/update logs — single logs only (gandeng in a row, never bertumpuk)
      for (let li = 0; li < 5; li++) {
        const L = this.riverLanes[li]; this.spawnT[5 + li] -= dt;
        if (this.spawnT[5 + li] <= 0) {
          this.logs.push({ x: L.dir > 0 ? -L.logW - 10 : VW + 10, w: L.logW, lane: li, sprite: L.sprite, dir: L.dir, cols: 1 });
          this.spawnT[5 + li] = (L.logW + L.gap) / (L.speed * stormMult);
        }
      }
      for (let i = this.logs.length - 1; i >= 0; i--) {
        const l = this.logs[i], L = this.riverLanes[l.lane];
        l.x += L.dir * L.speed * stormMult * dt;
        if (l.x < -l.w - 20 || l.x > VW + l.w + 20) this.logs.splice(i, 1);
      }
    }

    // Gator (level 3+)
    if (!frozen && this.level >= 3) {
      if (this.gator) {
        const gt = this.gator;
        gt.x += gt.dir * (70 + this.level * 4) * stormMult * dt;
        if (this.pig.row >= 1 && this.pig.row <= 4) gt.x += Math.sign(this.pig.x - gt.x) * 18 * dt;
        if (gt.x < -30 || gt.x > VW + 30) this.gator = null;
      } else {
        this.gatorSpawnT -= dt;
        if (this.gatorSpawnT <= 0) {
          const lane = Math.floor(Math.random() * 4);
          this.gator = { x: Math.random() < 0.5 ? -30 : VW + 30, lane, dir: Math.random() < 0.5 ? 1 : -1 };
          this.gatorSpawnT = 9 + Math.random() * 7;
        }
      }
    }

    // Power-up spawning - multi power-ups
    if (!frozen) {
      this.nextPowerAt -= dt;
      if (this.nextPowerAt <= 0) {
        const count = Math.random() < 0.3 ? 3 : (Math.random() < 0.6 ? 2 : 1);
        // Spawn across MULTIPLE rows (Y) so power-ups don't all bunch up on
        // a single horizontal line. Spread them across the middle rows where
        // the pig travels (rows 3–7 = water+sand area, where pickup makes sense).
        const ALLOWED_ROWS = [3, 4, 5, 6, 7];
        for (let i = 0; i < count; i++) {
          const puKey = PU_KEYS[Math.floor(Math.random() * PU_KEYS.length)];
          const row = ALLOWED_ROWS[Math.floor(Math.random() * ALLOWED_ROWS.length)];
          this.powerUps.push({
            x: 24 + Math.random() * (VW - 48),
            y: RY(row) + TS / 2,   // actual row Y (was fixed at row 5)
            t: 10,
            type: PU_TYPE_MAP[puKey],
            sprite: puKey,
          });
        }
        this.nextPowerAt = 10 + Math.random() * 5;
      } else {
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
          this.powerUps[i].t -= dt;
          if (this.powerUps[i].t <= 0) this.powerUps.splice(i, 1);
        }
      }
    }

    // ── YAN special event ──
    this.updateYan(dt);

    // Score popups
    for (let i = this.scorePopups.length - 1; i >= 0; i--) {
      this.scorePopups[i].t -= dt;
      if (this.scorePopups[i].t <= 0) this.scorePopups.splice(i, 1);
    }

    // Collision: road rows 6-10
    const fr = this.pig.row;
    if (fr >= 6 && fr <= 10) {
      const lane = fr - 6;
      for (const c of this.cars) {
        if (c.lane === lane && this.pig.x + 10 > c.x && this.pig.x - 10 < c.x + c.w) { this.die(); break; }
      }
    }
    // River rows 1-5: must land on log or die
    if (fr >= 1 && fr <= 5) {
      const lane = fr - 1;
      let onLog: Log | null = null;
      const submerged = lane === 1 && this.turtlesSubmerged();
      if (!submerged) {
        for (const l of this.logs) {
          if (l.lane === lane && this.pig.x > l.x - 6 && this.pig.x < l.x + l.w + 6) { onLog = l; break; }
        }
      }
      if (onLog) {
        if (!frozen) {
          const L = this.riverLanes[lane];
          this.pig.x += L.dir * L.speed * stormMult * dt;
          if (this.pig.x < 8 || this.pig.x > VW - 8) this.die();
        }
      } else {
        this.die();
      }
      if (this.gator && this.gator.lane === lane && Math.abs(this.gator.x - this.pig.x) < 18) this.die();
    }
    // Yan catch: pig reaches Yan's tile on ANY row → big score.
    // (must be checked for every row, not just the river block above)
    if (this.yan.active && this.yan.phase !== 'caught' && this.pig.row === this.yan.row && Math.abs(this.pig.x - this.yan.x) < 20) {
      this.catchYan();
    }
    // Power-up pickup: pig's row must be within ±1 row of the power-up's row,
    // and horizontally close. (Was: pig MUST be on row 5 — that made the
    // multi-row spawn useless. Now power-ups can live on rows 3–7 and the
    // pig catches them by being in the same row.)
    if (this.powerUps.length > 0) {
      for (let i = this.powerUps.length - 1; i >= 0; i--) {
        const pu = this.powerUps[i];
        if (Math.abs(pu.x - this.pig.x) < 16 && Math.abs(pu.y - (RY(this.pig.row) + TS / 2)) < TS) {
          this.pickPowerUp(pu);
          this.powerUps.splice(i, 1);
          break;
        }
      }
    }
    this.rWorld();
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDERING — WORLD
  // ═══════════════════════════════════════════════════════════════
  private rWorld() {
    const g = this.g;

    // ── Background layers ──
    // Goal row (row 0) — dark romantic gradient
    this.bg.fillGradientStyle(GOAL_C, GOAL_C, 0x1a0518, 0x1a0518, 1);
    this.bg.fillRect(0, RY(0), VW, TS);
    // River rows (1-5) — deep blue
    this.bg.fillGradientStyle(WATER_C, WATER_C, 0x0a1a30, 0x0a1a30, 1);
    this.bg.fillRect(0, RY(1), VW, TS * 5);
    // Road rows (6-10) — dark asphalt
    this.bg.fillGradientStyle(ROAD_C, ROAD_C, 0x0e0e14, 0x0e0e14, 1);
    this.bg.fillRect(0, RY(6), VW, TS * 5);
    // Start row (11) — safe zone
    this.bg.fillGradientStyle(0x1c0a18, 0x1c0a18, 0x140810, 0x140810, 1);
    this.bg.fillRect(0, RY(11), VW, TS);

    // ── Water shimmer ──
    for (let i = 0; i < 5; i++) {
      const y = RY(1 + i) + TS / 2 + Math.sin(this.blink * 2 + i) * 3;
      this.bg.fillStyle(WATER_HI, 0.2);
      this.bg.fillRect(0, y, VW, 2);
      const sx = (this.blink * 30 + i * 120) % VW;
      this.bg.fillStyle(0xbfe8ff, 0.3);
      this.bg.fillRect(sx, y - 1, 6, 1);
      this.bg.fillRect((sx + 250) % VW, y + 1, 4, 1);
    }

    // ── Road lane markings ──
    this.bg.fillStyle(ROAD_LINE, 0.4);
    for (let r = 7; r <= 10; r++)
      for (let x = 0; x < VW; x += 42)
        this.bg.fillRect(x, RY(r) - 1, 24, 2);

    // ── Floating hearts in goal zone ──
    for (let i = 0; i < 5; i++) {
      const hx = (i * 97 + 20 + Math.sin(this.blink * 0.5 + i) * 15) % VW;
      const hy = RY(0) + 4 + Math.sin(this.blink * 0.7 + i * 1.7) * 3;
      this.bg.fillStyle(0xff4d8c, 0.15 + Math.sin(this.blink + i) * 0.05);
      this.bg.fillCircle(hx, hy, 3);
      this.bg.fillTriangle(hx - 2, hy + 1, hx + 2, hy + 1, hx, hy + 5);
    }

    g.save(); g.translateCanvas(this.shakeX, this.shakeY);

    // ── Goal pens — female characters ──
    this.drawGoals();

    // ── Logs ──
    this.drawLogs();

    // ── Cars ──
    this.drawVehicles();

    // ── Gator ──
    if (this.gator) this.drawGator(this.gator);

    // ── Yan (special event) ──
    if (this.yan.active) this.drawYan();

    // ── Power-ups ──
    this.drawPowerUps();

    // ── Pig ──
    this.drawPig();

    // ── Shield ──
    if (this.hasPower('shield')) {
      const px = this.pig.x, py = RY(this.pig.row) + TS / 2;
      const pulse = 0.15 + Math.sin(this.blink * 5) * 0.08;
      g.lineStyle(2, 0xff6b9d, pulse); g.strokeCircle(px, py, 15);
      g.lineStyle(1, 0xff9ec4, pulse * 0.6); g.strokeCircle(px, py, 17);
    }

    this.drawParticles(g);
    g.restore();

    // ── Score popups ──
    for (const sp of this.scorePopups) {
      const a = Math.max(0, sp.t / 1.2);
      const yy = sp.y - (1 - a) * 25;
      const t = this.txt(23).setOrigin(0.5, 0).setFontSize(8).setText(sp.text).setPosition(sp.x, yy).setAlpha(a).setVisible(true);
      t.setStroke('#000000', 2).setColor(sp.color);
    }

    // ── Dialogue bubble ──
    this.drawDialogue();

    // ── HUD ──
    this.drawHUD();

    // ── Storm effects ──
    this.drawStorm();
  }

  // ── Draw goal pens with female sprites ──
  private drawGoals() {
    const g = this.g;
    for (let i = 0; i < GOAL_XS.length; i++) {
      const x = GOAL_XS[i];
      // Pen background
      g.fillGradientStyle(0x2a1830, 0x2a1830, 0x1a1020, 0x1a1020, 1);
      g.fillRect(x - 22, RY(0) + 3, 44, TS - 6);
      // Border
      g.lineStyle(2, this.goals[i] ? 0xff6b9d : 0x4a2a50, 0.9);
      g.strokeRect(x - 22, RY(0) + 3, 44, TS - 6);
      // Hearts between pens
      if (i < GOAL_XS.length - 1) {
        const mx = (x + GOAL_XS[i + 1]) / 2;
        this.bg.fillStyle(0xff4d8c, 0.25);
        this.bg.fillCircle(mx, RY(0) + TS / 2, 4);
        this.bg.fillTriangle(mx - 2, RY(0) + TS / 2 + 1, mx + 2, RY(0) + TS / 2 + 1, mx, RY(0) + TS / 2 + 5);
      }
      // Female sprite
      const femaleKey = `fp${i + 1}`;
      this.drawFemaleSprite(g, x - 10, RY(0) + 2, 1, i);

      if (this.goals[i]) {
        // Sparkle effect for won pens
        for (let s = 0; s < 3; s++) {
          const sx = x + Math.sin(this.blink * 2 + s * 2 + i) * 10;
          const sy = RY(0) + TS / 2 - 8 + Math.cos(this.blink * 1.5 + s * 3 + i) * 8;
          this.ui.fillStyle(0xffd700, 0.4 + Math.sin(this.blink + s + i) * 0.2);
          this.ui.fillCircle(sx, sy, 1.5);
        }
      } else {
        // Shimmer to indicate she's waiting
        const pulse = 0.2 + Math.sin(this.blink * 2 + i) * 0.1;
        this.ui.fillStyle(0xff4d8c, pulse);
        this.ui.fillCircle(x, RY(0) + TS / 2, 5);
      }
    }
  }

  // ── Draw logs with turtle variant ──
  private drawLogs() {
    const g = this.g;
    const submerged = this.turtlesSubmerged();
    // Fixed scale so every log is the SAME short height and sits at the
    // BOTTOM of its water tile — the pig then stands ON the log top.
    // LOG_SPRITES are 8 rows × N cols × PX(2). At scale 1.5 the log is
    // 8 × 2 × 1.5 = 24 px tall. We anchor the bottom of the log 2 px above
    // the tile bottom so the pig's feet (at baseY = tile-bottom - 2) land
    // exactly on the log surface.
    const LOG_SCALE = 1.5;
    const LOG_H = 8 * PX * LOG_SCALE; // 24px tall
    for (const l of this.logs) {
      const rowY = RY(1 + l.lane);
      // bottom-anchored: log bottom sits at (tile_bottom - 2), same line as pig feet
      const y = rowY + TS - LOG_H - 2; // aligned with pig's ground baseline
      if (l.lane === 1) {
        // Turtle shell variant
        const a = submerged ? 0.35 : 1;
        g.fillStyle(0x2e7d4f, a); g.fillRect(l.x, y + (submerged ? 6 : 0), l.w, LOG_H - (submerged ? 6 : 0));
        g.fillStyle(0x4bb374, a);
        for (let xx = l.x + 8; xx < l.x + l.w - 6; xx += 22) {
          g.fillCircle(xx, y + 6, 6);
          g.fillStyle(0x1a5a2f, a * 0.5);
          g.fillCircle(xx, y + 6, 2);
          g.fillStyle(0x4bb374, a);
        }
        if (submerged) { g.fillStyle(0x9fd9ff, 0.4); g.fillRect(l.x, y - 1, l.w, 2); }
        continue;
      }
      // Wood log with pixel sprite
      const logData = LOG_SPRITES[l.sprite];
      if (logData) {
        drawMultiSprite(g, logData, LOG_COLOR_MAP, l.x, y, false, LOG_SCALE);
      }
    }
  }

  // ── Draw cars with pixel sprites ──
  private drawVehicles() {
    const g = this.g;
    for (const c of this.cars) {
      // Bottom-anchored so cars sit on the road tile the same way the pig
      // stands on logs: car bottom = tile bottom - 4 (sits ON the road with
      // a small gap so the wheels don't touch the tile edge). The previous
      // top-anchored formula (`y = RY(...) + 5`) made cars float mid-tile
      // and never lined up with the pig's ground baseline.
      const carData = CAR_SPRITES[c.sprite];
      const scale = carData ? c.w / (carData[0].length * PX) : 1;
      const carH = carData ? carData.length * PX * scale : 20;
      const y = RY(6 + c.lane) + TS - carH - 4; // bottom-anchored at tile_bottom - 4
      // Shadow directly under the car on the road
      g.fillStyle(0x000000, 0.3); g.fillRect(c.x + 2, y + carH - 1, c.w, 2);
      // Car sprite
      if (carData) {
        const colors = CAR_COLOR_MAP[c.sprite];
        drawMultiSprite(g, carData, colors, c.x, y, c.dir < 0, scale);
      }
      // Headlight glow at the front
      const L = this.roadLanes[c.lane];
      g.fillStyle(0xfff8a0, 0.6);
      if (L.dir > 0) g.fillCircle(c.x + c.w, y + 6, 2);
      else g.fillCircle(c.x, y + 6, 2);
    }
  }

  // ── Draw gator ──
  private drawGator(gt: Gator) {
    const g = this.g, y = RY(1 + gt.lane) + TS / 2;
    g.fillStyle(0x1c3a1c, 0.9); g.fillEllipse(gt.x, y, 30, 12);
    g.fillStyle(0x2a5a2a);
    for (let i = -1; i <= 1; i++)
      g.fillTriangle(gt.x + i * 8 - 3, y - 4, gt.x + i * 8 + 3, y - 4, gt.x + i * 8, y - 8);
    g.fillStyle(0x0a1a0a); g.fillCircle(gt.x + gt.dir * 14, y - 3, 3.5); g.fillCircle(gt.x + gt.dir * 20, y - 3, 3.5);
    g.fillStyle(0xff5c2b, 0.8 + Math.sin(this.blink * 8) * 0.2);
    g.fillCircle(gt.x + gt.dir * 14, y - 3, 1.3); g.fillCircle(gt.x + gt.dir * 20, y - 3, 1.3);
  }

  // ── Draw Yan (special event character) + his own speech bubble (adaptive) ──
    private drawYan() {
      const g = this.g, yan = this.yan;
      const px = yan.x;
      // Same ground baseline as the pig so Yan's feet land on the tile in
      // the same place the pig's feet do. YAN_SPRITE is 14 rows × 10 cols
      // × PX(2) = 28 px tall, so spriteTop = tile_bottom - 2 - 28 = tile_bottom - 30
      const tileBottom = RY(yan.row) + TS - 2;
      const baseY = RY(yan.row) + TS - 2;
      const spriteTop = tileBottom - 28 - (yan.phase === 'caught' ? Math.abs(Math.sin(this.blink * 18)) * 4 : 0);
      drawMultiSprite(g, YAN_SPRITE, YAN_COLORS, px - 10, spriteTop, false, 1);
      // angry aura
      g.fillStyle(0xc0392b, 0.18 + Math.sin(this.blink * 4) * 0.06);
      g.fillCircle(px, baseY, 16);

      // Yan's speech bubble (adaptive: above for low row, below for high row).
      // Same adaptive rule as the pig bubble: if the character is in the LOWER
      // half (row ≥ 6), put the bubble ABOVE; if UPPER half (row < 6), put it
      // BELOW. Plus safety flips for screen edges. This keeps the bubble off
      // the character and avoids covering the playfield.
      const yb = this.txt(60).setVisible(false);
      if (yan.phase !== 'caught') {
        const line = YAN_LINE;          // Yan only ever says this
        const fs = 8;
        const charW = fs * 0.95;
        const bh = 24;
        const bw = Math.min(VW - 8, Math.max(170, line.length * charW + 28));
        let bx = Math.max(2, Math.min(VW - bw - 2, px - bw / 2));
        // ADAPTIVE: row >= 6 → bubble ABOVE; row < 6 → bubble BELOW
        const putAbove = yan.row >= 6;
        let by = putAbove ? spriteTop - bh - 8 : spriteTop + 30;
        // safety flips
        if (putAbove && by < HUD_H + 2) by = spriteTop + 30;
        if (!putAbove && by + bh > VH - 2) by = spriteTop - bh - 8;
        // box (red, matching Yan's angry theme)
        this.ui.fillStyle(0x000000, 0.3); this.ui.fillRoundedRect(bx + 2, by + 2, bw, bh, 6);
        this.ui.fillStyle(0xffffff, 0.98); this.ui.fillRoundedRect(bx, by, bw, bh, 6);
        this.ui.lineStyle(2, 0xc0392b, 0.9); this.ui.strokeRoundedRect(bx, by, bw, bh, 6);
        // tail — points TOWARD Yan (up when bubble is below, down when bubble is above)
        const tailX = Math.max(bx + 10, Math.min(bx + bw - 10, px));
        this.ui.fillStyle(0xffffff, 0.98);
        if (putAbove) {
          // bubble ABOVE Yan → tail points DOWN toward Yan's head
          this.ui.fillTriangle(tailX - 6, by + bh - 3, tailX + 6, by + bh - 3, tailX, by + bh + 8);
          this.ui.lineStyle(2, 0xc0392b, 0.9);
          this.ui.beginPath();
          this.ui.moveTo(tailX - 6, by + bh - 3); this.ui.lineTo(tailX, by + bh + 8); this.ui.lineTo(tailX + 6, by + bh - 3);
          this.ui.strokePath();
        } else {
          // bubble BELOW Yan → tail points UP toward Yan's feet
          this.ui.fillTriangle(tailX - 6, by, tailX + 6, by, tailX, by - 8);
          this.ui.lineStyle(2, 0xc0392b, 0.9);
          this.ui.beginPath();
          this.ui.moveTo(tailX - 6, by); this.ui.lineTo(tailX, by - 8); this.ui.lineTo(tailX + 6, by);
          this.ui.strokePath();
        }
        yb.setVisible(true).setOrigin(0.5, 0).setFontSize(fs).setColor('#7a1020').setStroke('#000000', 0)
          .setText(line).setPosition(bx + bw / 2, by + 7);
      } else {
        // caught flash: "Auuww Jleb Jleeb" above head
        const fs = 8;
        const charW = fs * 0.78;
        const bh = 24;
        const bw = Math.min(VW - 8, Math.max(150, YAN_CAUGHT.length * charW + 28));
        let bx = Math.max(2, Math.min(VW - bw - 2, px - bw / 2));
        const by = spriteTop - bh - 8;
        this.ui.fillStyle(0x000000, 0.3); this.ui.fillRoundedRect(bx + 2, by + 2, bw, bh, 6);
        this.ui.fillStyle(0xffffff, 0.98); this.ui.fillRoundedRect(bx, by, bw, bh, 6);
        this.ui.lineStyle(2, 0xff6b9d, 0.9); this.ui.strokeRoundedRect(bx, by, bw, bh, 6);
        yb.setVisible(true).setOrigin(0.5, 0).setFontSize(fs).setColor('#c01050').setStroke('#000000', 0)
          .setText(YAN_CAUGHT).setPosition(bx + bw / 2, by + 7);
      }
    }

  // ── Draw power-ups ──
  private drawPowerUps() {
    const g = this.g;
    for (const pu of this.powerUps) {
      // power-ups now spawn across rows 3–7, so use pu.y directly
      // (small bob animation kept for liveliness)
      const y = pu.y + Math.sin(this.blink * 3 + (pu.x % 10)) * 3;
      const flashing = pu.t < 2.5 && this.blink % 0.3 < 0.15;
      if (flashing) continue;
      const c = PU_COLORS[pu.sprite];
      drawGlow(g, pu.x, y, 12, c, 0.6);
      const puData = PU_SPRITES[pu.sprite];
      if (puData) {
        drawMultiSprite(g, puData, [0, c], pu.x - 8, y - 8, false, 1);
      }
    }
  }

  // ── Draw pig with walk animation + squash on land ──
  private drawPig() {
    const g = this.g;
    let bounceOff = 0;
    if (this.pigBounce > 0) bounceOff = Math.sin(this.pigBounce * Math.PI * 4) * 2;

    // Squash on land: when pigBounce is FRESH (>0.10s), pig is at the bottom
    // of the hop arc — wider and shorter, shadow grows. Once bounce drops
    // below 0.10, the squash eases out and the pig returns to its idle bob.
    // This is the classic Frogger/Retro-pixel "spring" feel.
    const squashAmt = this.pigBounce > 0.10 ? Math.min(1, (this.pigBounce - 0.10) / 0.06) : 0;
    const easeOut = 1 - squashAmt;                          // 0 at peak land → 1 after
    const sx = 1 + squashAmt * 0.35;                        // wider when squashed (up to 1.35×)
    const sy = 1 - squashAmt * 0.30;                        // shorter when squashed (down to 0.70×)
    const shadowExpand = 1 + squashAmt * 0.4;               // shadow grows with squash

    // Lively idle/walk bob + leg cycle (always animating, never static)
    const t = this.pigAnimT;
    const bob = Math.sin(t * 4) * 1.0;                 // gentle up/down breathing
    const legPhase = (this.pig.walkCycle % 2 === 0) ? t * 8 : t * 8 + Math.PI;
    const legSwing = Math.sin(legPhase) * 2.0;         // legs swing while "walking"

    // Ground baseline: pig sits ON the tile, not floating in the middle.
// PIG_SPRITES is 14 rows × 10 cols × PX(2) = 20×28 px (W×H). Feet are the
// bottom row (legs/hooves). So sprite top = baseY - 28 puts the feet at
// baseY (tile bottom - 2) — pig stands ON the tile with a 2px shadow gap.
const baseY = RY(this.pig.row) + TS - 2;
    const px = this.pig.x;
    const spriteTop = baseY - 28 - bounceOff + bob;   // 28px tall sprite, feet at baseY

    // Drop shadow on the tile / log so it reads as "standing on" it.
    // Darker + bigger shadow = stronger grounding read; grows during squash.
    const shadowA = this.pigBounce > 0 ? 0.32 : 0.55;       // was 0.18 / 0.32 — now darker
    const shadowW = (this.pigBounce > 0 ? 11 : 14) * shadowExpand;
    const shadowH = 3.2 * shadowExpand;
    g.fillStyle(0x000000, shadowA);
    g.fillEllipse(px, baseY - 1, shadowW, shadowH);

    if (this.deathT > 0) {
      if (this.blink % 0.2 < 0.1) {
        g.fillStyle(0xff5c5c, 0.8);
        g.fillCircle(px, baseY - 14, 10);
      }
      // Dead sprite (flattened) on the ground
      this.drawPigSprite(g, px - 10, baseY - 16, 1, false, 'pd');
      this.setTxt(7, 0.5, 0, 8, TXT_DANGER, 'ADUH KENA!', px, baseY - 30);
    } else {
      // Walk animation: alternate pw1/pw2. Apply squash (sx/sy) so the sprite
      // stretches horizontally and squashes vertically when landing. The
      // sprite is drawn from top-left, so we shift x left by half the X
      // growth and y down by the Y shrink to keep the pig visually anchored
      // on the same spot.
      const frame = this.pig.walkCycle % 2 === 0 ? 'pw1' : 'pw2';
      const extraW = (sx - 1) * 20;       // sprite is 20px wide
      const shrunkH = (1 - sy) * 28;      // sprite is 28px tall
      this.drawPigSprite(g, px - 10 - extraW / 2, spriteTop + shrunkH, sx, this.pig.dir < 0, frame, sy);
      // Animated legs (drawn under the sprite) in the facing direction
      const face = this.pig.face;
      if (face !== 'up') {
        // legs swing: one forward, one back
        const lx = px, ly = baseY - 2;
        g.fillStyle(PIG_DARK, 1);
        if (face === 'left' || face === 'right') {
          const s = face === 'left' ? -1 : 1;
          g.fillRect(lx - 3 * s + legSwing, ly - 4, 3, 4);
          g.fillRect(lx + 3 * s - legSwing, ly - 4, 3, 4);
        } else { // down
          g.fillRect(lx - 3 + legSwing, ly - 4, 3, 4);
          g.fillRect(lx + 3 - legSwing, ly - 4, 3, 4);
        }
      }
    }

    // Heart eyes overlay
    if (this.pig.heartEyes) {
      g.fillStyle(0xff1a5c, 0.9);
      for (let i = 0; i < 2; i++) {
        const hx = px + (i === 0 ? -4 : 4);
        const hy = spriteTop - 4;
        g.fillCircle(hx - 2, hy, 2.5);
        g.fillCircle(hx + 2, hy, 2.5);
        g.fillTriangle(hx - 4, hy + 1, hx + 4, hy + 1, hx, hy + 5);
      }
    }
  }

  // ── Draw dialogue speech bubble ──
  private drawDialogue() {
    const DX0 = 40, DXN = 20; // dedicated text slots for dialogue lines
    const show = this.dialogueT > 0 && this.deathT <= 0;
    if (!show) {
      // hide ALL dialogue text so no ghost/berbayang is left behind
      for (let i = 0; i < DXN; i++) this.txt(DX0 + i).setVisible(false);
      return;
    }
    const dx = this.pig.x;
    const lines = wrapText(this.dialogueText, 30); // wider wrap so long lines fit
    const FS = 8;                  // smaller text (was 10 → 8) — less overwhelming
    const lineH = 10;              // tighter line spacing to match the smaller font
    const padX = 16, padTop = 10, padBot = 10;
    // BOX keeps its OLD size (based on the 13px font) so the bubble never
    // shrinks — only the text inside gets smaller, the box stays the same.
    const BOX_CHARW = 13 * 0.62;   // box width uses the old font metrics
    const BOX_LINEH = 16;          // box height uses the old line spacing
    const maxW = Math.max(...lines.map(l => l.length * BOX_CHARW));
    const bw = Math.min(VW - 8, Math.max(110, maxW + padX * 2));
    const bh = lines.length * BOX_LINEH + padTop + padBot;
    // BUOYANT-BELOW: box sits BELOW the pig — its TOP starts below the feet,
    // so it never overlaps the character. Flip above only if it would run off
    // the bottom edge.
    const pigTop = RY(this.pig.row);
    const pigFeet = pigTop + TS;
    const gap = 12;
    // ── ADAPTIVE POSITION ── place the bubble on the side with more free space:
    //   • pig in the LOWER half (row >= 6, road area)  → bubble ABOVE the pig
    //   • pig in the UPPER half (row < 6, river/goal)  → bubble BELOW the pig
    // This keeps the bubble off the crowded side and avoids covering the pig.
    const putAbove = this.pig.row >= 6;
    let boxTop = putAbove ? pigTop - gap - bh : pigFeet + gap;
    // safety flip if it runs off-screen
    if (putAbove && boxTop < HUD_H + 2) boxTop = pigFeet + gap;
    if (!putAbove && boxTop + bh > VH - 2) boxTop = pigTop - gap - bh;
    const bx = Math.max(2, Math.min(VW - bw - 2, dx - bw / 2));
    // vertically center the smaller text block inside the unchanged box
    const textBlockH = lines.length * lineH;
    const textTop = boxTop + padTop + Math.max(0, (bh - padTop - padBot - textBlockH) / 2);
    // bubble shadow
    this.ui.fillStyle(0x000000, 0.3); this.ui.fillRoundedRect(bx + 2, boxTop + 2, bw, bh, 6);
    // bubble bg
    this.ui.fillStyle(0xffffff, 0.98); this.ui.fillRoundedRect(bx, boxTop, bw, bh, 6);
    // bubble border
    this.ui.lineStyle(2, 0xff6b9d, 0.9); this.ui.strokeRoundedRect(bx, boxTop, bw, bh, 6);
    // tail — points toward the pig (direction depends on adaptive side)
    const tailX = Math.max(bx + 10, Math.min(bx + bw - 10, dx));
    this.ui.fillStyle(0xffffff, 0.98);
    if (putAbove) {
      // box is ABOVE the pig → tail points DOWN to the pig
      this.ui.fillTriangle(tailX - 6, boxTop + bh - 3, tailX + 6, boxTop + bh - 3, tailX, boxTop + bh + 8);
      this.ui.lineStyle(2, 0xff6b9d, 0.9);
      this.ui.beginPath();
      this.ui.moveTo(tailX - 6, boxTop + bh - 3); this.ui.lineTo(tailX, boxTop + bh + 8); this.ui.lineTo(tailX + 6, boxTop + bh - 3);
      this.ui.strokePath();
    } else {
      // box is BELOW the pig → tail points UP to the pig
      this.ui.fillTriangle(tailX - 6, boxTop + 3, tailX + 6, boxTop + 3, tailX, boxTop - 5);
      this.ui.lineStyle(2, 0xff6b9d, 0.9);
      this.ui.beginPath();
      this.ui.moveTo(tailX - 6, boxTop + 3); this.ui.lineTo(tailX, boxTop - 5); this.ui.lineTo(tailX + 6, boxTop + 3);
      this.ui.strokePath();
    }
    // hide every dialogue slot first, then show ONLY the lines we have
    // (prevents leftover lines from a previous, longer sentence = berbayang)
    for (let i = 0; i < DXN; i++) this.txt(DX0 + i).setVisible(false);
    for (let li = 0; li < lines.length; li++) {
      const t = this.txt(DX0 + li)
        .setOrigin(0.5, 0)
        .setFontSize(FS)
        .setText(lines[li])
        .setPosition(bx + bw / 2, textTop + li * lineH)
        .setVisible(true);
      t.setStroke('#000000', 0).setColor('#1a1420'); // crisp, no blur
    }
  }

  // ── Draw storm effects ──
  private drawStorm() {
    const sinceStorm = this.stormT - this.nextStormAt;
    const stormWarn = this.level >= STORM_FROM_LEVEL && sinceStorm >= -STORM_WARN_S && sinceStorm < 0;
    const stormActive = this.level >= STORM_FROM_LEVEL && sinceStorm >= 0 && sinceStorm < STORM_DURATION_S;
    if (stormActive && !this.hasPower('freeze')) {
      this.ui.fillStyle(0x1a2a4a, 0.15); this.ui.fillRect(0, HUD_H, VW, VH - HUD_H);
      for (let i = 0; i < 18; i++) {
        const rx = (i * 53 + this.blink * 300) % VW;
        const ry = HUD_H + ((i * 71 + this.blink * 500) % (VH - HUD_H));
        this.ui.lineStyle(1, 0x9fd9ff, 0.35);
        this.ui.beginPath(); this.ui.moveTo(rx, ry); this.ui.lineTo(rx - 4, ry + 10); this.ui.strokePath();
      }
    }
    if (stormWarn && this.blink % 0.4 < 0.22) {
      this.setTxt(20, 0.5, 0, 8, TXT_ACCENT, 'BADA!', VW / 2, HUD_H + 6);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HUD
  // ═══════════════════════════════════════════════════════════════
  private drawHUD() {
    const w = VW;
    // HUD bar
    this.ui.fillStyle(0x0a0a18, 0.92); this.ui.fillRect(0, 0, w, HUD_H);
    this.ui.lineStyle(2, 0xff6b9d, 0.6); this.ui.lineBetween(0, HUD_H - 2, w, HUD_H - 2);
    this.ui.lineStyle(1, 0xff9ec4, 0.2); this.ui.lineBetween(0, HUD_H - 4, w, HUD_H - 4);

    // SKOR label (8px) + score value (16px)
    this.setTxt(0, 0, 0, 16, TXT_BRIGHT, String(this.score).padStart(6, '0'), 8, 2);
    this.setTxt(1, 0, 0, 8, TXT_DIM, 'SKOR', 8, 22);

    // Level indicator (8px)
    this.setTxt(2, 0, 0, 8, TXT_ACCENT, 'LV ' + this.level, 100, 2);

    // Combo (8px)
    if (this.comboCount > 1) {
      this.setTxt(5, 0, 0, 8, TXT_GOLD, 'COMBO x' + this.comboCount, 100, 22);
    }

    // Daily mode
    if (this.daily) {
      this.setTxt(19, 0, 0, 8, TXT_GOLD, 'HARIAN', 170, 22);
    }

    // Timer bar
    const tw = 120, tfrac = Math.max(0, this.timeLeft / 40);
    const tx = VW / 2 - tw / 2;
    this.ui.fillStyle(0x03040c, 0.8); this.ui.fillRoundedRect(tx - 2, 8, tw + 4, 14, 3);
    let timerColor = 0xff6b9d;
    if (tfrac > 0.5) timerColor = 0x6bff8c;
    else if (tfrac > 0.25) timerColor = 0xffd23f;
    else timerColor = 0xff5c5c;
    this.ui.fillStyle(timerColor, 0.9); this.ui.fillRoundedRect(tx, 10, tw * tfrac, 10, 2);
    this.ui.lineStyle(1, 0xff9ec4, 0.5); this.ui.strokeRoundedRect(tx - 2, 8, tw + 4, 14, 3);
    this.ui.fillStyle(0xffffff, 0.2);
    for (let ti = 1; ti < 6; ti++) this.ui.fillRect(tx + (tw * ti / 6), 10, 1, 10);
    // Timer label (8px)
    const tlColor = this.timeLeft < 10 ? TXT_DANGER : TXT_BRIGHT;
    this.setTxt(3, 0.5, 0, 8, tlColor, Math.ceil(this.timeLeft) + 's', VW / 2, 23);

    // Active power-up indicators
    let pIdx = 0;
    for (const key of Object.keys(this.activePowers) as PowerType[]) {
      const p = this.activePowers[key];
      if (p && p.t > 0) {
        const px = 130 + pIdx * 62;
        const pc = POWER_COLOR_OF(key);
        this.ui.fillStyle(0x000000, 0.5); this.ui.fillRoundedRect(px - 2, 19, 56, 12, 2);
        this.ui.fillStyle(pc, 0.2); this.ui.fillRoundedRect(px, 21, 52, 8, 2);
        this.ui.fillStyle(pc, 0.7); this.ui.fillRoundedRect(px, 21, 52 * (p.t / 8), 8, 2);
        this.ui.lineStyle(1, pc, 0.8); this.ui.strokeRoundedRect(px, 21, 52, 8, 2);
        this.setTxt(24 + pIdx, 0, 0, 8, TXT_BRIGHT, POWER_SYM_OF(key) + ' ' + Math.ceil(p.t) + 's', px + 2, 22);
        pIdx++;
      }
    }

    // Lives (mini pig head icons)
    for (let i = 0; i < this.lives; i++) this.drawPigMini(this.ui, VW - 14 - i * 18, 16);
  }

  // ═══════════════════════════════════════════════════════════════
  // SPRITE DRAWING HELPERS
  // ═══════════════════════════════════════════════════════════════
  private drawPigSprite(g: Phaser.GameObjects.Graphics, x: number, y: number, scale: number, flipX: boolean, frame: string, scaleY: number = scale) {
    const data = PIG_SPRITES[frame];
    if (!data) return;
    drawMultiSprite(g, data, PIG_COLORS, x, y, flipX, scale, scaleY);
    // No tail — clean pig rear
  }

  private drawFemaleSprite(g: Phaser.GameObjects.Graphics, x: number, y: number, scale: number, idx: number) {
    const key = `fp${idx + 1}`;
    const data = FEMALE_SPRITES[key];
    if (!data) return;
    const colors = FEMALE_COLOR_MAP[key];
    drawMultiSprite(g, data, colors, x, y, false, scale);
    // Floating hearts around her
    for (let hi = 0; hi < 2; hi++) {
      const hx = x + (idx % 2 === 0 ? -1 : 1) * (8 * scale + Math.sin(this.blink * 2 + hi + idx) * 3);
      const hy = y - 4 * scale + Math.sin(this.blink * 1.5 + hi * 2) * 2;
      g.fillStyle(0xff4d8c, 0.3 + Math.sin(this.blink + hi + idx) * 0.12);
      g.fillCircle(hx, hy, 2);
      g.fillTriangle(hx - 1.5, hy, hx + 1.5, hy, hx, hy + 3);
    }
  }

  private drawPigMini(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    // Mini pig head for HUD lives
    g.fillStyle(PIG_BODY); g.fillCircle(x, y, 5);
    g.fillStyle(PIG_BLUSH);
    g.fillTriangle(x - 4, y - 1, x - 2, y - 4, x, y - 1);
    g.fillTriangle(x + 4, y - 1, x + 2, y - 4, x, y - 1);
    g.fillStyle(0xffffff);
    g.fillCircle(x - 2, y - 0.5, 1.5);
    g.fillCircle(x + 2, y - 0.5, 1.5);
    g.fillStyle(0x1a1420);
    g.fillCircle(x - 1.5, y, 1);
    g.fillCircle(x + 2.5, y, 1);
    g.fillStyle(PIG_SNOUT);
    g.fillEllipse(x, y + 2.5, 3, 2);
    g.fillStyle(PIG_NOSTRIL);
    g.fillCircle(x - 1, y + 2.5, 0.6);
    g.fillCircle(x + 1, y + 2.5, 0.6);
  }

  // ═══════════════════════════════════════════════════════════════
  // TEXT HELPER — setStroke('#000000', 2) for ALL text
  // ═══════════════════════════════════════════════════════════════
  private setTxt(
    idx: number,
    ox: number, oy: number,
    size: 8 | 16 | 24 | 32,
    color: string,
    text: string,
    x: number, y: number,
    align?: 'left' | 'center' | 'right',
    lineSpacing?: number,
  ): void {
    const t = this.txt(idx);
    t.setOrigin(ox, oy)
      .setFontSize(size)
      .setColor(color)
      .setStroke('#000000', 2)
      .setText(text)
      .setPosition(x, y)
      .setVisible(true);
    if (align) t.setAlign(align);
    if (lineSpacing) t.setLineSpacing(lineSpacing);
  }
}

// ── Power-up helper maps (kept outside class for clarity) ──
function POWER_COLOR_OF(t: PowerType): number {
  if (t === 'shield') return 0xff6b9d;
  if (t === 'freeze') return 0x6bd4ff;
  if (t === 'double') return 0xffd700;
  return 0x6bff8c;
}
function POWER_SYM_OF(t: PowerType): string {
  if (t === 'shield') return 'H';
  if (t === 'freeze') return 'I';
  if (t === 'double') return 'D';
  return 'T';
}
