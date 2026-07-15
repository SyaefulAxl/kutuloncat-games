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
  'HI CANTIK!', 'AKU PUNYA KEBON CABE LO', 'MINTA NOMOR WA DONG',
  'SENYUM DONG SAYANG', 'KAMU CANTIK BANGET', 'JOMBLO NIH?',
  'PINJEM DUIT?', 'BIDADARI DARI SURGA?',
  'AKU SUKA SAMA KAMU', 'MAU JADI PACARKU?', 'CINTA ITU BUTA NIH',
  'KAMU TUH KAYAK BENSIN', 'BIKIN HATI IRIT MELAJU',
  'KAMU KAYAK TV', 'SINYALNYA SAMPE HATI',
  'APA KAMU KOPI?', 'SOALNYA BIKIN GAK TIDUR',
  'KAMU MATAHARI?', 'KALO GAK ADA KAMU GELAP GINI',
  'INI DOMPET HILANG', 'SOALNYA HATI UDAH JATUH',
  'POSESIF BOLEH?', 'SOALNYA AKU CEMAS KAMU DIREBUT',
  'KAMU BENSIN?', 'SOALNYA BIKIN HATI BERKOBAR',
  'AKU LELAH', 'SOALNYA BERJUTA JAUH DARI KAMU',
  'KAMU KUNCI?', 'SOALNYA BIKIN HATI TERKUNCI',
  'AKU BURUNG', 'PANTES SUARANYA MERDU DI TELINGA',
  'KAMU TUH BAHAYA', 'SOALNYA BIKIN KECANDUAN',
  'KAMU ES KRIM?', 'SOALNYA BIKIN HATI DINGIN TERUS LEMBUT',
  'KAMU INTERNET?', 'SOALNYA GAK BISA JAUH DARI KAMU',
  'KAMU TUH PAHIT', 'TAPI OBAT BUAT AKU',
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
interface Car { x: number; w: number; lane: number; sprite: string; dir: number }
interface Log { x: number; w: number; lane: number; sprite: string; dir: number }
interface Gator { x: number; lane: number; dir: number }
interface PowerUp { x: number; t: number; type: PowerType; sprite: string }
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
export class HopperScene extends ArcadeScene {
  private gs = 'TITLE';
  private score = 0; private lives = 3; private level = 1;
  private pig = { x: VW / 2, row: 11, heartEyes: false, blush: 0, walkCycle: 0, dir: 1 };
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
  private dialogueText = ''; private dialogueT = 0; private nextDialogueAt = 5;
  private powerUps: PowerUp[] = [];
  private activePowers: Partial<Record<PowerType, { t: number }>> = {};
  private nextPowerAt = 10;
  private comboCount = 0;
  private scorePopups: ScorePopup[] = [];
  private pigBounce = 0;
  private lastStateKey = '';
  private _backHandler: (() => void) | null = null;

  constructor() { super({ key: 'HopperScene' }); }

  protected onCreate() {
    this._backHandler = () => {
      this.gs = 'TITLE';
      this.stateT = 0;
      this.deathT = 0;
      this.dialogueText = '';
      this.dialogueT = 0;
      this.scorePopups = [];
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
      const logW = logIdx === 0 ? 16 : logIdx === 1 ? 24 : 32;
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
    this.pig = { x: VW / 2, row: 11, heartEyes: false, blush: 0, walkCycle: 0, dir: 1 };
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
    this.dialogueText = ''; this.dialogueT = 0; this.nextDialogueAt = 4 + Math.random() * 3;
    this.gs = 'PLAYING';
  }

  private gameOver() {
    this.gs = 'GAME_OVER'; this.stateT = 0;
    sfx.death();
    submitScore('road-hopper', this.score, {
      goals: this.goalsDone, level: this.level, hops: this.hops,
      durationSec: Math.floor((Date.now() - this.startTime) / 1000),
      daily: this.daily, dailyDate: this.daily ? this.dailyDate : undefined,
    }, this.sess);
  }

  private turtlesSubmerged(): boolean { return Math.sin(this.blink * 1.3) > 0.2; }
  private hasPower(t: PowerType): boolean { return !!this.activePowers[t] && this.activePowers[t]!.t > 0; }

  private die(x?: number, y?: number) {
    if (this.deathT > 0) return;
    if (this.hasPower('shield')) {
      this.activePowers.shield = { t: 0 };
      sfx.bounce();
      this.spawnParticles(x ?? this.pig.x, y ?? RY(this.pig.row) + TS / 2, 0xff6b9d, 20, 100);
      this.dialogueText = 'PERISAI HILANG!'; this.dialogueT = 0.8;
      return;
    }
    this.deathT = 0.9; sfx.hit(); this.shake(0.25, 5);
    this.spawnParticles(x ?? this.pig.x, y ?? RY(this.pig.row) + TS / 2, 0xff9ec4, 14, 80);
  }

  private spawnScorePopup(x: number, y: number, text: string, color = TXT_GOLD) {
    this.scorePopups.push({ x, y, text, t: 1.2, color });
  }

  // ═══════════════════════════════════════════════════════════════
  // MOVEMENT — hop forward or sideways, no backward
  // ═══════════════════════════════════════════════════════════════
  private hop(dx: number, dy: number) {
    if (this.deathT > 0) return;
    const nr = this.pig.row + dy;
    if (nr < 0 || nr > 11) return;
    const nx = Math.max(12, Math.min(VW - 12, this.pig.x + dx * TS));
    this.pig.walkCycle += 1;
    this.pigBounce = 0.15;
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
      this.dialogueText = RAYUAN_WIN_LINES[Math.floor(Math.random() * RAYUAN_WIN_LINES.length)];
      this.dialogueT = 2.5;
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
    if (pu.type === 'shield') { this.activePowers.shield = { t: dur }; this.dialogueText = 'PERISAI CINTA!'; }
    else if (pu.type === 'freeze') { this.activePowers.freeze = { t: dur }; this.dialogueText = 'BEKUIN MEREKA!'; }
    else if (pu.type === 'double') { this.activePowers.double = { t: dur }; this.dialogueText = 'x2 DOUBLE SCORE!'; }
    else if (pu.type === 'time') { this.timeLeft = Math.min(this.timeLeft + 10, 40); this.dialogueText = '+10 DETIK!'; }
    this.score += 50; this.dialogueT = 1.2;
    this.pig.blush = 0.3;
    sfx.power();
    this.spawnParticles(pu.x, RY(5) + TS / 2, PU_COLORS[pu.sprite], 14, 90);
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
    // Input: up = forward, left/right = sideways, no backward
    if (this.kp('ArrowUp') || this.swipeDir === 'up' || this.tapped) this.hop(0, -1);
    else if (this.kp('ArrowLeft') || this.swipeDir === 'left') this.hop(-1, 0);
    else if (this.kp('ArrowRight') || this.swipeDir === 'right') this.hop(1, 0);

    if (this.pig.heartEyes) this.pig.heartEyes = false;
    if (this.pig.blush > 0) this.pig.blush -= dt;

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

    // Dialogue
    if (this.dialogueT > 0) this.dialogueT -= dt;
    else {
      this.nextDialogueAt -= dt;
      if (this.nextDialogueAt <= 0) {
        this.dialogueText = RAYUAN_LINES[Math.floor(Math.random() * RAYUAN_LINES.length)];
        this.dialogueT = 1.8;
        this.pig.blush = 0.4;
        this.nextDialogueAt = 7 + Math.random() * 5;
      }
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
          this.cars.push({ x: L.dir > 0 ? -L.carW - 10 : VW + 10, w: L.carW, lane: li, sprite: L.sprite, dir: L.dir });
          this.spawnT[li] = (L.carW + L.gap) / (L.speed * stormMult);
        }
      }
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const c = this.cars[i], L = this.roadLanes[c.lane];
        c.x += L.dir * L.speed * stormMult * dt;
        if (c.x < -c.w - 20 || c.x > VW + c.w + 20) this.cars.splice(i, 1);
      }
      // Spawn/update logs
      for (let li = 0; li < 5; li++) {
        const L = this.riverLanes[li]; this.spawnT[5 + li] -= dt;
        if (this.spawnT[5 + li] <= 0) {
          this.logs.push({ x: L.dir > 0 ? -L.logW - 10 : VW + 10, w: L.logW, lane: li, sprite: L.sprite, dir: L.dir });
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

    // Power-up spawning
    if (!frozen) {
      if (this.powerUps.length === 0) {
        this.nextPowerAt -= dt;
        if (this.nextPowerAt <= 0) {
          const puKey = PU_KEYS[Math.floor(Math.random() * PU_KEYS.length)];
          this.powerUps.push({ x: 24 + Math.random() * (VW - 48), t: 10, type: PU_TYPE_MAP[puKey], sprite: puKey });
          this.nextPowerAt = 12 + Math.random() * 6;
        }
      } else {
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
          this.powerUps[i].t -= dt;
          if (this.powerUps[i].t <= 0) this.powerUps.splice(i, 1);
        }
      }
    }

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
          if (l.lane === lane && this.pig.x > l.x - 4 && this.pig.x < l.x + l.w + 4) { onLog = l; break; }
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
    // Median row 5: pick up power-ups
    if (fr === 5 && this.powerUps.length > 0) {
      for (let i = this.powerUps.length - 1; i >= 0; i--) {
        if (Math.abs(this.powerUps[i].x - this.pig.x) < 16) {
          this.pickPowerUp(this.powerUps[i]);
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
    for (const l of this.logs) {
      const y = RY(1 + l.lane) + 5;
      if (l.lane === 1) {
        // Turtle shell variant
        const a = submerged ? 0.35 : 1;
        g.fillStyle(0x2e7d4f, a); g.fillRect(l.x, y + (submerged ? 6 : 0), l.w, TS - 10 - (submerged ? 6 : 0));
        g.fillStyle(0x4bb374, a);
        for (let x = l.x + 8; x < l.x + l.w - 6; x += 22) {
          g.fillCircle(x, y + 6, 6);
          g.fillStyle(0x1a5a2f, a * 0.5);
          g.fillCircle(x, y + 6, 2);
          g.fillStyle(0x4bb374, a);
        }
        if (submerged) { g.fillStyle(0x9fd9ff, 0.4); g.fillRect(l.x, y - 1, l.w, 2); }
        continue;
      }
      // Wood log with pixel sprite
      const logData = LOG_SPRITES[l.sprite];
      if (logData) {
        const scale = l.w / (logData[0].length * PX);
        drawMultiSprite(g, logData, LOG_COLOR_MAP, l.x, y, false, scale);
      }
    }
  }

  // ── Draw cars with pixel sprites ──
  private drawVehicles() {
    const g = this.g;
    for (const c of this.cars) {
      const y = RY(6 + c.lane) + 5;
      // Shadow
      g.fillStyle(0x000000, 0.3); g.fillRect(c.x + 2, y + TS - 13, c.w, 2);
      // Car sprite
      const carData = CAR_SPRITES[c.sprite];
      if (carData) {
        const colors = CAR_COLOR_MAP[c.sprite];
        const scale = c.w / (carData[0].length * PX);
        drawMultiSprite(g, carData, colors, c.x, y, c.dir < 0, scale);
      }
      // Headlight glow
      const L = this.roadLanes[c.lane];
      g.fillStyle(0xfff8a0, 0.6);
      if (L.dir > 0) g.fillCircle(c.x + c.w, y + 5, 2);
      else g.fillCircle(c.x, y + 5, 2);
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

  // ── Draw power-ups ──
  private drawPowerUps() {
    const g = this.g;
    for (const pu of this.powerUps) {
      const y = RY(5) + TS / 2 + Math.sin(this.blink * 3 + (pu.x % 10)) * 3;
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

  // ── Draw pig with walk animation ──
  private drawPig() {
    const g = this.g;
    let bounceOff = 0;
    if (this.pigBounce > 0) bounceOff = Math.sin(this.pigBounce * Math.PI * 4) * 2;
    const px = this.pig.x;
    const py = RY(this.pig.row) + TS / 2 - bounceOff;

    if (this.deathT > 0) {
      if (this.blink % 0.2 < 0.1) {
        g.fillStyle(0xff5c5c, 0.8);
        g.fillCircle(px, RY(this.pig.row) + TS / 2, 10);
      }
      // Dead sprite
      this.drawPigSprite(g, px - 10, RY(this.pig.row) + TS / 2 - 14, 1, false, 'pd');
      this.setTxt(7, 0.5, 0, 8, TXT_DANGER, 'ADUH KENA!', px, RY(this.pig.row) - 18);
    } else {
      // Walk animation: alternate pw1/pw2
      const frame = this.pig.walkCycle % 2 === 0 ? 'pw1' : 'pw2';
      this.drawPigSprite(g, px - 10, py - 14, 1, this.pig.dir < 0, frame);
    }

    // Heart eyes overlay
    if (this.pig.heartEyes) {
      g.fillStyle(0xff1a5c, 0.9);
      for (let i = 0; i < 2; i++) {
        const hx = px + (i === 0 ? -4 : 4);
        const hy = py - 18;
        g.fillCircle(hx - 2, hy, 2.5);
        g.fillCircle(hx + 2, hy, 2.5);
        g.fillTriangle(hx - 4, hy + 1, hx + 4, hy + 1, hx, hy + 5);
      }
    }
  }

  // ── Draw dialogue speech bubble ──
  private drawDialogue() {
    if (this.dialogueT <= 0 || this.deathT > 0) return;
    const dx = this.pig.x;
    const dy = RY(this.pig.row) - 20;
    const lines = wrapText(this.dialogueText, 14);
    const lineH = 8;
    const bw = Math.max(60, Math.max(...lines.map(l => l.length)) * 7 + 14);
    const bh = lines.length * lineH + 10;
    const bx = Math.max(2, Math.min(VW - bw - 2, dx - bw / 2));
    // bubble shadow
    this.ui.fillStyle(0x000000, 0.3); this.ui.fillRoundedRect(bx + 2, dy - bh + 2, bw, bh, 5);
    // bubble bg
    this.ui.fillStyle(0xffffff, 0.95); this.ui.fillRoundedRect(bx, dy - bh, bw, bh, 5);
    // bubble border
    this.ui.lineStyle(1.5, 0xff6b9d, 0.7); this.ui.strokeRoundedRect(bx, dy - bh, bw, bh, 5);
    // tail
    const tailX = Math.max(bx + 8, Math.min(bx + bw - 8, dx));
    this.ui.fillStyle(0xffffff, 0.95);
    this.ui.fillTriangle(tailX - 4, dy + 2, tailX + 4, dy + 2, tailX, dy + 8);
    this.ui.lineStyle(1.5, 0xff6b9d, 0.7);
    this.ui.beginPath();
    this.ui.moveTo(tailX - 4, dy + 2); this.ui.lineTo(tailX, dy + 8); this.ui.lineTo(tailX + 4, dy + 2);
    this.ui.strokePath();
    // text lines
    for (let li = 0; li < lines.length; li++) {
      const t = this.txt(21).setOrigin(0.5, 0).setFontSize(8).setText(lines[li]).setPosition(bx + bw / 2, dy - bh + 5 + li * lineH).setVisible(true);
      t.setStroke('#000000', 2).setColor('#1a1420');
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
  private drawPigSprite(g: Phaser.GameObjects.Graphics, x: number, y: number, scale: number, flipX: boolean, frame: string) {
    const data = PIG_SPRITES[frame];
    if (!data) return;
    drawMultiSprite(g, data, PIG_COLORS, x, y, flipX, scale);
    // Curly tail (drawn separately)
    const tx = x + 10 * scale, ty = y + 6 * scale;
    g.lineStyle(1.5 * scale, PIG_BLUSH, 0.8);
    g.beginPath(); g.moveTo(tx, ty);
    for (let ti = 0; ti < 6; ti++) {
      const tt = ti / 6;
      g.lineTo(tx + tt * 4 * scale + Math.sin(tt * Math.PI * 3 + this.blink * 3) * 2 * scale, ty - tt * 6 * scale);
    }
    g.strokePath();
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
