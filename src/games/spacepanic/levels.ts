export type LevelData = { grid: number[][]; playerStart: [number, number] };

const COLS = 16, ROWS = 12;
const TAIR = 0, TPLAT = 1, TLADR = 2, TPIPEL = 3, TPIPER = 4;

// Every floor is a full-width platform (fully walkable end to end) with pipe
// caps on both sides as enemy entry points. Ladder columns are randomized
// per level via genLevel() below, so the "stairs" vary between playthroughs
// while every ladder always has solid floor directly above AND below it.
//
// The old hardcoded levels used fixed ladder columns (5 & 10) together with
// gapped platform segments that didn't always line up with those columns —
// e.g. level 2/4's row 7 had a gap at columns 10-11 exactly where a ladder
// needed to land, so climbing that ladder never found solid ground to step
// onto (looked "cut off" at the top), and some platform segments had no
// ladder touching them at all (permanently unreachable floor). Full-width
// floors make every ladder column valid by construction.
export const FLOOR_ROWS = [3, 5, 7, 9, 11];
const LADDER_ROWS = [4, 6, 8, 10];

// Pick 2 distinct ladder columns, away from the pipe end-caps and spaced
// apart so climbing routes actually zig-zag between floors.
function pickLadderCols(): number[] {
  const pool: number[] = [];
  for (let c = 2; c <= COLS - 3; c++) pool.push(c);
  const first = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  const far = pool.filter(c => Math.abs(c - first) >= 3);
  const src = far.length ? far : pool;
  const second = src[Math.floor(Math.random() * src.length)];
  return [first, second].sort((a, b) => a - b);
}

export function genLevel(): LevelData {
  const grid: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(TAIR));
  for (const r of FLOOR_ROWS) {
    grid[r][0] = TPIPEL;
    for (let c = 1; c < COLS - 1; c++) grid[r][c] = TPLAT;
    grid[r][COLS - 1] = TPIPER;
  }
  for (const r of LADDER_ROWS) {
    for (const c of pickLadderCols()) grid[r][c] = TLADR;
  }
  return { grid, playerStart: [0, 11] };
}
