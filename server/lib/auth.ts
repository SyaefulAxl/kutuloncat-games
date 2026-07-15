import crypto from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  readJson,
  writeJson,
  nowIso,
  SESSIONS_FILE,
  USERS_FILE,
  SETTINGS_FILE,
} from './storage.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

/* ── Session management ── */
export function createSession(userId: string): {
  sid: string;
  expiresAt: number;
} {
  const db = readJson(SESSIONS_FILE, { sessions: [] as any[] });
  const sid = crypto.randomBytes(18).toString('hex');
  const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
  db.sessions.push({ sid, userId, expiresAt, createdAt: nowIso() });
  db.sessions = db.sessions
    .filter((s: any) => s.expiresAt > Date.now())
    .slice(-5000);
  writeJson(SESSIONS_FILE, db);
  return { sid, expiresAt };
}

export function getUserBySession(request: FastifyRequest): any | null {
  const sid = (request as any).cookies?.sid;
  if (!sid) return null;
  const sdb = readJson(SESSIONS_FILE, { sessions: [] as any[] });
  const row = sdb.sessions.find(
    (x: any) => x.sid === sid && x.expiresAt > Date.now(),
  );
  if (!row) return null;
  const udb = readJson(USERS_FILE, { users: [] as any[] });
  const user = udb.users.find((u: any) => u.id === row.userId) || null;
  if (!user) return null;
  // Ensure status field is always present (default 'active' for legacy entries)
  if (!user.status) user.status = 'active';
  return user;
}

function isPublicTestHost(request: FastifyRequest): boolean {
  const host = String(request.headers.host || '').toLowerCase();
  return host.includes('test.kutuloncat.my.id');
}

export function getEffectiveUser(request: FastifyRequest): any | null {
  const u = getUserBySession(request);
  if (u) return u;
  if (isPublicTestHost(request)) {
    return {
      id: 'guest-public',
      name: 'Guest',
      phone: '',
      email: '',
      loginCount: 0,
    };
  }
  return null;
}

export function setSessionCookie(reply: FastifyReply, sid: string): void {
  const secure = process.env.NODE_ENV === 'production';
  reply.setCookie('sid', sid, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60,
    secure,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.setCookie('sid', '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
  });
}

/* ── Auth guards (return user or send error) ── */
export function requireAuthApi(
  request: FastifyRequest,
  reply: FastifyReply,
): any | null {
  const user = getEffectiveUser(request);
  if (!user) {
    reply.code(401).send({ ok: false, error: 'unauthorized' });
    return null;
  }
  if (user.status === 'blocked') {
    reply.code(403).send({
      ok: false,
      error: 'blocked',
      message:
        'Akun kamu diblokir. Hubungi admin KutuLoncat via WhatsApp untuk info lebih lanjut.',
      whatsappLink: 'https://wa.me/919629784300',
    });
    return null;
  }
  return user;
}

export function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  if (!ADMIN_PASSWORD) return true;
  const provided = String(request.headers['x-admin-password'] || '');
  if (provided !== ADMIN_PASSWORD) {
    reply.code(403).send({ ok: false, error: 'admin password required' });
    return false;
  }
  return true;
}

/* ── WAHA helper ── */
export function getWahaConfig() {
  const st = readJson(SETTINGS_FILE, {} as any);
  const w = st.waha || {};
  return {
    baseUrl: String(w.baseUrl || process.env.WAHA_BASE_URL || '').replace(
      /\/$/,
      '',
    ),
    apiKey: w.apiKey || process.env.WAHA_API_KEY || '',
    session: w.session || process.env.WAHA_SESSION || 'KutuLoncat',
  };
}

export async function sendWaha(phone: string, text: string): Promise<boolean> {
  const { baseUrl, apiKey, session } = getWahaConfig();

  if (!baseUrl) {
    console.error('[WAHA] ❌ WAHA_BASE_URL not configured');
    return false;
  }
  if (!apiKey) {
    console.error('[WAHA] ❌ WAHA_API_KEY not configured');
    return false;
  }

  const chatId = `${phone.replace('+', '')}@c.us`;
  const url = `${baseUrl}/api/sendText`;
  const payload = { session, chatId, text };

  console.log(`[WAHA] Sending to ${chatId} via ${url} (session: ${session})`);

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      } as Record<string, string>,
      body: JSON.stringify(payload),
    });

    const body = await r.text();

    if (r.ok) {
      console.log(`[WAHA] ✅ Message sent to ${chatId}`);
      return true;
    }

    console.error(`[WAHA] ❌ HTTP ${r.status} ${r.statusText} — ${body}`);
    return false;
  } catch (err) {
    console.error(`[WAHA] ❌ Network error:`, err);
    return false;
  }
}

/* ── Anti-cheat ── */
export function signSession(payload: Record<string, any>): string {
  const st = readJson(SETTINGS_FILE, {} as any);
  const secret =
    st.antiCheatSecret || process.env.ANTI_CHEAT_SECRET || 'fallback-secret';
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

export function validateAntiCheat(
  body: any,
  userId: string,
): { ok: boolean; reason?: string } {
  const { sessionId, game, startedAt, token, score, meta = {} } = body || {};

  if (!sessionId || !game || !startedAt || !token) {
    if (!game) return { ok: false, reason: 'missing game' };
  } else {
    const expect = signSession({ sessionId, userId, game, startedAt });
    if (expect !== token) return { ok: false, reason: 'invalid token' };
  }

  const durSec = startedAt
    ? Math.max(0, (Date.now() - Number(startedAt)) / 1000)
    : 999;
  if (durSec < 1) return { ok: false, reason: 'too fast run' };

  if (game === 'hangman') {
    // Hangman is now a 5-round match (see HangmanGame.tsx) instead of a
    // single phrase — meta reports roundsPlayed/roundsWon/livesLeft for the
    // whole match, not a per-phrase wrong-guess count.
    const roundsPlayed = Number(meta.roundsPlayed || 1);
    if (roundsPlayed < 1 || roundsPlayed > 5)
      return { ok: false, reason: 'invalid rounds played hangman' };
    if (Number(meta.livesLeft) > 3)
      return { ok: false, reason: 'invalid lives hangman' };
    // Per-round ceiling ~400 (benar*10 + wrongBonus*15 + winBonus40 + combo
    // bonus up to ~50), plus a finisher bonus (roundsWon*40 + 250 all-clear).
    if (Number(score) > roundsPlayed * 400 + 300)
      return { ok: false, reason: 'score too high hangman' };
    if (durSec < roundsPlayed * 4 && Number(score) > roundsPlayed * 180)
      return { ok: false, reason: 'too quick high score hangman' };
  }

  if (game === 'fruit-ninja') {
    const slices = Number(meta.slices || 0);
    if (slices < 0) return { ok: false, reason: 'invalid slices' };
    // Per-slice cap raised 60→150: Golden Rush (3x) and heavy fruit (2x) can
    // now stack with the ⭐ 2x window and combo tier bonus, so a single slice
    // landed during an overlapping event can legitimately score well above
    // the old un-stacked ceiling.
    if (Number(score) > slices * 150 + 600)
      return { ok: false, reason: 'score not plausible vs slices' };
    if (durSec < 15 && Number(score) > 320)
      return { ok: false, reason: 'too fast high score fruit' };
    if (Number(meta.nyawa) > 3) return { ok: false, reason: 'invalid nyawa' };
  }

  if (game === 'flappy-bird') {
    const pipes = Number(meta.pipesPassed || 0);
    // Score must equal pipesPassed (1:1 mapping in client)
    if (Math.abs(Number(score) - pipes) > 1)
      return { ok: false, reason: 'score vs pipes mismatch' };
    // Max pipe rate: ~1 pipe per 1.1s at top speed (with margin)
    if (pipes > 0 && durSec > 0 && pipes / durSec > 1.0)
      return { ok: false, reason: 'pipe rate too fast' };
    // Absolute cap: 500 pipes in any session
    if (Number(score) > 500)
      return { ok: false, reason: 'score too high flappy' };
    // Quick high score
    if (durSec < 12 && Number(score) > 8)
      return { ok: false, reason: 'too quick high score flappy' };
  }

  if (game === 'snake') {
    const foodEaten = Number(meta.foodEaten || 0);
    const maxCombo = Number(meta.maxCombo || 1);
    const difficulty = String(meta.difficulty || 'gampang');

    // Max score per food by difficulty: scoreMax × comboMultiplier(10)
    // gampang: 8×10=80, sedang: 15×10=150, susah: 30×10=300, gak-ngotak: 70×10=700
    // Special food (every 5th) can give scoreMax × 3 extra
    const maxPerFood: Record<string, number> = {
      gampang: 80,
      sedang: 150,
      susah: 300,
      'gak-ngotak': 700,
    };
    const cap = maxPerFood[difficulty] || 700;
    // Upper bound: every food at max combo + special food bonus
    const maxPlausible =
      foodEaten * cap + Math.floor(foodEaten / 5) * (cap * 3);
    if (foodEaten > 0 && Number(score) > maxPlausible)
      return { ok: false, reason: 'score not plausible vs food eaten' };
    // foodEaten must be ≥ 0 and combo can't exceed foodEaten
    if (maxCombo > foodEaten + 1)
      return { ok: false, reason: 'combo exceeds food eaten' };
    // Quick high score
    if (durSec < 5 && Number(score) > 200)
      return { ok: false, reason: 'too quick high score snake' };
    // Absolute cap by difficulty
    const absoluteCap: Record<string, number> = {
      gampang: 5000,
      sedang: 15000,
      susah: 50000,
      'gak-ngotak': 200000,
    };
    if (Number(score) > (absoluteCap[difficulty] || 200000))
      return { ok: false, reason: 'score too high snake' };
  }

  if (game === 'tetris') {
    const linesCleared = Number(meta.linesCleared || 0);
    const level = Number(meta.level || 1);
    const maxCombo = Number(meta.maxCombo || 0);
    const difficulty = String(meta.difficulty || 'gampang');
    // Level can't exceed lines/10 + 1 (start at 1, +1 per 10 lines)
    if (level > linesCleared / 10 + 2)
      return { ok: false, reason: 'level exceeds lines cleared' };
    // Combo can't exceed lines
    if (maxCombo > linesCleared + 1)
      return { ok: false, reason: 'combo exceeds lines tetris' };
    // Min duration check
    if (durSec < 5 && Number(score) > 200)
      return { ok: false, reason: 'too quick high score tetris' };
    // Absolute cap by difficulty — bumped ~50% since level 8+ wild pieces
    // (see WILD_FROM_LEVEL in TetrisScene.ts) double whatever line-clear
    // score they contribute to, on top of B2B/combo multipliers.
    const absoluteCap: Record<string, number> = {
      gampang: 30000,
      sedang: 75000,
      susah: 225000,
      'gak-ngotak': 750000,
    };
    if (Number(score) > (absoluteCap[difficulty] || 750000))
      return { ok: false, reason: 'score too high tetris' };
  }

  if (game === 'archery') {
    const bullseyes = Number(meta.bullseyes || 0);
    const rounds = Number(meta.rounds || 10);
    const misses = Number(meta.misses || 0);
    const maxCombo = Number(meta.maxCombo || 0);
    // Bullseyes can't exceed total rounds
    if (bullseyes > rounds)
      return { ok: false, reason: 'bullseyes exceed rounds' };
    // Combo can't exceed bullseyes + 1
    if (maxCombo > bullseyes + 1)
      return { ok: false, reason: 'combo exceeds bullseyes' };
    // Min duration: at least 2s per round
    if (durSec < rounds * 1.5 && Number(score) > 200)
      return { ok: false, reason: 'too quick high score archery' };
    // Max score: 100 pts × 2.0 distance × 1.2 wind × combo, per round, for
    // rounds 1-9. Round 10 is the boss fight (ArcheryScene.ts spawnBoss()) —
    // a single BOSS_HP-pool target worth far more than a normal round: up to
    // 9 partial hits (40×round each) plus a kill shot that can stack
    // headshot(2.5x)/combo/round/difficulty multipliers, so it gets its own
    // generous flat allowance instead of the normal per-round figure.
    if (Number(score) > (rounds - 1) * 480 + 60000)
      return { ok: false, reason: 'score too high archery' };
  }

  if (game === 'space-panic') {
    const kills = Number(meta.kills || 0);
    const level = Number(meta.level || 1);
    const maxCombo = Number(meta.maxCombo || 0);
    if (kills < 0 || level < 1)
      return { ok: false, reason: 'invalid meta space-panic' };
    // A combo chain can never exceed the number of kills
    if (maxCombo > kills + 1)
      return { ok: false, reason: 'combo exceeds kills space-panic' };
    // Trapping + hitting a single enemy takes ~2s+ in practice
    if (kills > 0 && durSec > 0 && kills / durSec > 0.8)
      return { ok: false, reason: 'kill rate too fast space-panic' };
    // Advancing a level requires at least 5 kills per completed level
    if (level > 1 && kills < (level - 1) * 5)
      return { ok: false, reason: 'level not plausible vs kills space-panic' };
    // Upper bound per kill: Void Reaper (6500, see sprites.ts ENEMY_DEFS) at
    // full ×5 combo = 32500 — the pricier of the two alternating bosses,
    // Gold Overlord's 5000×5=25000 fits comfortably under it — plus item
    // pickups and per-level air bonuses.
    if (Number(score) > kills * 32500 + level * 3000 + 2000)
      return { ok: false, reason: 'score not plausible space-panic' };
    if (durSec < 10 && Number(score) > 1500)
      return { ok: false, reason: 'too quick high score space-panic' };
  }

  if (game === 'brick-breaker') {
    const bricks = Number(meta.bricks || 0);
    const level = Number(meta.level || 1);
    if (bricks < 0 || level < 1)
      return { ok: false, reason: 'invalid meta brick' };
    if (bricks > durSec * 6)
      return { ok: false, reason: 'brick rate too fast' };
    if (level > bricks / 25 + 2)
      return { ok: false, reason: 'level vs bricks implausible' };
    // Armored bricks (up to 3 hp from level 7+) are worth basePts×hp before
    // the combo multiplier, and every BOSS_EVERY_5th level replaces the grid
    // with one big multi-hit boss brick (80×level base, hp 16+level×3) that
    // still only counts as a single "brick" in the bricksBroken metric —
    // both need real headroom beyond the old flat single-hit-brick ceiling.
    const bossLevelAllowance = level % 5 === 0 ? level * 2500 : 0;
    if (Number(score) > bricks * 1200 + level * 1000 + 500 + bossLevelAllowance)
      return { ok: false, reason: 'score not plausible brick' };
    if (durSec < 8 && Number(score) > 1500)
      return { ok: false, reason: 'too quick high score brick' };
  }

  if (game === 'space-raid') {
    const kills = Number(meta.kills || 0);
    const wave = Number(meta.wave || 1);
    if (kills < 0 || wave < 1)
      return { ok: false, reason: 'invalid meta raid' };
    if (kills > durSec * 4)
      return { ok: false, reason: 'kill rate too fast raid' };
    if (wave > kills / 10 + 2)
      return { ok: false, reason: 'wave vs kills implausible' };
    // boss 1500 × chain 5 upper bound per kill + wave bonuses
    if (Number(score) > kills * 7500 + wave * 1500 + 500)
      return { ok: false, reason: 'score not plausible raid' };
    if (durSec < 8 && Number(score) > 1500)
      return { ok: false, reason: 'too quick high score raid' };
  }

  if (game === 'sky-defense') {
    const intercepted = Number(meta.intercepted || 0);
    const wave = Number(meta.wave || 1);
    if (intercepted < 0 || wave < 1)
      return { ok: false, reason: 'invalid meta sky' };
    if (intercepted > durSec * 3)
      return { ok: false, reason: 'intercept rate too fast' };
    if (wave > intercepted / 5 + 2)
      return { ok: false, reason: 'wave vs intercepts implausible' };
    // wave×3600 headroom widened to 6000: bomber-plane kills (400×wave each,
    // from PLANE_FROM_WAVE) aren't reflected in the `intercepted` count at
    // all, and mothership boss waves (every BOSS_EVERY_SKY-th wave) add a
    // further 500×wave clear bonus — neither has its own meta counter, so
    // the flat per-wave term has to absorb both.
    if (Number(score) > intercepted * 150 + wave * 6000 + 500)
      return { ok: false, reason: 'score not plausible sky' };
    if (durSec < 8 && Number(score) > 1200)
      return { ok: false, reason: 'too quick high score sky' };
  }

  if (game === 'maze-chase') {
    const dots = Number(meta.dots || 0);
    const ghosts = Number(meta.ghosts || 0);
    const level = Number(meta.level || 1);
    if (dots < 0 || ghosts < 0 || level < 1)
      return { ok: false, reason: 'invalid meta maze' };
    if (dots > durSec * 10)
      return { ok: false, reason: 'dot rate too fast' };
    if (ghosts > dots / 15 + 6)
      return { ok: false, reason: 'ghosts vs dots implausible' };
    if (level > dots / 80 + 2)
      return { ok: false, reason: 'level vs dots implausible' };
    // level multiplier bumped 800→1000: leaves headroom for the classic
    // bonus-fruit pickup (200×level, once per level) added alongside dots
    // and ghost-chain scoring. From SUPER_GHOST_FROM_LEVEL (10), a 4th ghost
    // joins that's worth 800×chain-mult (max 8x = 6400) instead of the
    // regular 200×chain-mult (max 1600) — a flat per-level allowance covers
    // that extra value across a long high-level run without needing its own
    // meta counter.
    const superGhostAllowance = Math.max(0, level - 9) * 5000;
    if (Number(score) > dots * 10 + ghosts * 1600 + level * 1000 + 800 + superGhostAllowance)
      return { ok: false, reason: 'score not plausible maze' };
    if (durSec < 8 && Number(score) > 1200)
      return { ok: false, reason: 'too quick high score maze' };
  }

  if (game === 'road-hopper') {
    const goals = Number(meta.goals || 0);
    const hops = Number(meta.hops || 0);
    const level = Number(meta.level || 1);
    if (goals < 0 || hops < 0 || level < 1)
      return { ok: false, reason: 'invalid meta hopper' };
    // one crossing realistically takes several seconds
    if (goals > durSec / 3 + 1)
      return { ok: false, reason: 'goal rate too fast' };
    if (level > goals / 5 + 1)
      return { ok: false, reason: 'level vs goals implausible' };
    // Collectible bonus bugs (150pts each, ~every 14-22s from GATOR_FROM_LEVEL
    // pacing — see HopperScene.ts nextBugAt) aren't tied to goals/hops/level
    // at all, so their allowance scales off session duration instead: one
    // bug roughly every 12s of play, generously rounded down on the divisor.
    const bugAllowance = Math.ceil(durSec / 12) * 150;
    if (Number(score) > goals * 800 + hops * 10 + level * 1000 + 500 + bugAllowance)
      return { ok: false, reason: 'score not plausible hopper' };
    if (durSec < 8 && Number(score) > 1000)
      return { ok: false, reason: 'too quick high score hopper' };
  }

  return { ok: true };
}
