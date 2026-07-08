export type LevelData = {
  grid: number[][];
  playerStart: [number, number];
  floorRows: number[];
};

const COLS = 16, ROWS = 12;
const TAIR = 0, TPLAT = 1, TLADR = 2, TPIPEL = 3, TPIPER = 4;

// Every floor is a full-width platform (fully walkable end to end) with pipe
// caps on both sides as enemy entry points. Ladder columns are randomized
// per level via genLevel() below, so the "stairs" vary between playthroughs
// while every ladder always has solid floor directly above AND below it.
//
// Floor count scales with difficulty: 5 floors early, 6 floors later. Six is
// the geometric maximum — each floor needs a 2-row (64px) corridor for the
// 28px player and 22px enemies to move through, and the fixed 512×448 design
// space holds 12 rows. A 7th floor would require shrinking cells/characters.
const FLOORS_5 = [3, 5, 7, 9, 11];
const FLOORS_6 = [1, 3, 5, 7, 9, 11];

// Pick 2 distinct ladder columns, away from the pipe end-caps and spaced
// apart so climbing routes actually zig-zag between floors. `rand` defaults
// to Math.random; daily-challenge mode passes a date-seeded PRNG so every
// player gets the same stairs that day.
function pickLadderCols(rand: () => number): number[] {
  const pool: number[] = [];
  for (let c = 2; c <= COLS - 3; c++) pool.push(c);
  const first = pool.splice(Math.floor(rand() * pool.length), 1)[0];
  const far = pool.filter(c => Math.abs(c - first) >= 3);
  const src = far.length ? far : pool;
  const second = src[Math.floor(rand() * src.length)];
  return [first, second].sort((a, b) => a - b);
}

export function genLevel(rand: () => number = Math.random, floors = 5): LevelData {
  const floorRows = floors >= 6 ? FLOORS_6 : FLOORS_5;
  // one ladder row in the gap between each pair of adjacent floors
  const ladderRows = floorRows.slice(1).map((r) => r - 1);
  const grid: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(TAIR));
  for (const r of floorRows) {
    grid[r][0] = TPIPEL;
    for (let c = 1; c < COLS - 1; c++) grid[r][c] = TPLAT;
    grid[r][COLS - 1] = TPIPER;
  }
  for (const r of ladderRows) {
    for (const c of pickLadderCols(rand)) grid[r][c] = TLADR;
  }
  return { grid, playerStart: [0, 11], floorRows };
}
