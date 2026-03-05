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
  return udb.users.find((u: any) => u.id === row.userId) || null;
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
    if (Number(meta.wrong) > 6)
      return { ok: false, reason: 'invalid wrong count' };
    if (Number(score) > 400)
      return { ok: false, reason: 'score too high hangman' };
    if (durSec < 6 && Number(score) > 180)
      return { ok: false, reason: 'too quick high score hangman' };
  }

  if (game === 'fruit-ninja') {
    const slices = Number(meta.slices || 0);
    if (slices < 0) return { ok: false, reason: 'invalid slices' };
    if (Number(score) > slices * 38 + 420)
      return { ok: false, reason: 'score not plausible vs slices' };
    if (durSec < 15 && Number(score) > 320)
      return { ok: false, reason: 'too fast high score fruit' };
    if (Number(meta.nyawa) > 3) return { ok: false, reason: 'invalid nyawa' };
  }

  return { ok: true };
}
