import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3001;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// ---- Constants ----
const HINTS = ['roast', 'galau', 'romantis', 'humor', 'dark'];
const ALLOWED_GAMES = ['hangman', 'fruit-ninja'];

// ---- Data paths ----
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const SCORE_FILE = path.join(DATA_DIR, 'scores.json');
const PHRASE_FILE = path.join(DATA_DIR, 'phrases.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const OTP_FILE = path.join(DATA_DIR, 'otp.json');
const ACH_FILE = path.join(DATA_DIR, 'achievements.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// ---- Auto-create directories ----
for (const dir of [DATA_DIR, UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---- Seed data files ----
for (const [f, seed] of [
  [SCORE_FILE, { scores: [] }],
  [USERS_FILE, { users: [] }],
  [OTP_FILE, { otps: [] }],
  [ACH_FILE, { achievements: [] }],
  [SESSIONS_FILE, { sessions: [] }],
]) {
  if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(seed, null, 2));
}

// Settings seed — credentials come from env vars, not hardcoded
if (!fs.existsSync(SETTINGS_FILE)) {
  fs.writeFileSync(
    SETTINGS_FILE,
    JSON.stringify(
      {
        antiCheatSecret:
          process.env.ANTI_CHEAT_SECRET ||
          crypto.randomBytes(24).toString('hex'),
        ai: {
          openaiApiKey: process.env.OPENAI_API_KEY || '',
          openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        },
        waha: {
          baseUrl: process.env.WAHA_BASE_URL || '',
          apiKey: process.env.WAHA_API_KEY || '',
          session: process.env.WAHA_SESSION || 'KutuLoncat',
        },
        fruitNinja: {
          stageSeconds: [60, 150, 240],
          maxByStage: [6, 8, 10, 13],
          gapByStage: [780, 660, 540, 430],
          burstMin: [1, 1, 1, 1],
          burstMax: [2, 3, 4, 6],
          weirdChance: [0.06, 0.1, 0.14, 0.18],
          bombBase: [0.1, 0.12, 0.14, 0.17],
          safeBombDistance: 70,
        },
      },
      null,
      2,
    ),
  );
}

// ---- Utility functions ----
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function pick(a) {
  return a[Math.floor(Math.random() * a.length)];
}
function nowIso() {
  return new Date().toISOString();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizePhone(v = '') {
  const d = String(v).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('62')) return `+${d}`;
  if (d.startsWith('0')) return `+62${d.slice(1)}`;
  if (d.startsWith('8')) return `+62${d}`;
  return `+${d}`;
}

function maskName(name = '') {
  const n = String(name || '').trim();
  if (!n) return 'usr*';
  if (n.length <= 3) return n[0] + '*';
  return n.slice(0, 3) + '*'.repeat(Math.max(1, n.length - 3));
}

function isPublicTestHost(req) {
  const host = String(req.headers.host || '').toLowerCase();
  return host.includes('test.kutuloncat.my.id');
}

// ---- Cookie / Session helpers ----
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0)
      out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function createSession(userId) {
  const db = readJson(SESSIONS_FILE, { sessions: [] });
  const sid = crypto.randomBytes(18).toString('hex');
  const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
  db.sessions.push({ sid, userId, expiresAt, createdAt: nowIso() });
  db.sessions = db.sessions
    .filter((s) => s.expiresAt > Date.now())
    .slice(-5000);
  writeJson(SESSIONS_FILE, db);
  return { sid, expiresAt };
}

function getUserBySession(req) {
  const sid = parseCookies(req).sid;
  if (!sid) return null;
  const sdb = readJson(SESSIONS_FILE, { sessions: [] });
  const row = sdb.sessions.find(
    (x) => x.sid === sid && x.expiresAt > Date.now(),
  );
  if (!row) return null;
  const udb = readJson(USERS_FILE, { users: [] });
  return udb.users.find((u) => u.id === row.userId) || null;
}

function getEffectiveUser(req) {
  const u = getUserBySession(req);
  if (u) return u;
  if (isPublicTestHost(req))
    return {
      id: 'guest-public',
      name: 'Guest',
      phone: '',
      email: '',
      loginCount: 0,
    };
  return null;
}

function setSessionCookie(res, sid) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${365 * 24 * 60 * 60}${secure}`,
  );
}

// ---- Middleware ----
function requireAuth(req, res, next) {
  const u = getEffectiveUser(req);
  if (!u) return res.redirect('/login');
  req.user = u;
  next();
}

function requireAuthApi(req, res, next) {
  const u = getEffectiveUser(req);
  if (!u) return res.status(401).json({ ok: false, error: 'unauthorized' });
  req.user = u;
  next();
}

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return next(); // No password set = dev mode
  const provided = req.headers['x-admin-password'] || '';
  if (provided !== ADMIN_PASSWORD) {
    return res
      .status(403)
      .json({ ok: false, error: 'admin password required' });
  }
  next();
}

// ---- WAHA helper ----
function getWahaConfig() {
  const st = readJson(SETTINGS_FILE, {});
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

async function sendWaha(phone, text) {
  const { baseUrl, apiKey, session } = getWahaConfig();
  if (!baseUrl || !apiKey) return false;
  const payload = { session, chatId: `${phone.replace('+', '')}@c.us`, text };
  const tries = [
    { url: `${baseUrl}/api/sendText`, h: { 'X-Api-Key': apiKey } },
    { url: `${baseUrl}/api/messages/text`, h: { 'X-Api-Key': apiKey } },
    { url: `${baseUrl}/sendText`, h: { Authorization: `Bearer ${apiKey}` } },
  ];
  for (const t of tries) {
    try {
      const r = await fetch(t.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t.h || {}) },
        body: JSON.stringify(payload),
      });
      if (r.ok) return true;
    } catch {
      /* best-effort */
    }
  }
  return false;
}

// ---- Phrases seed ----
function ensurePhrasesSeed() {
  const today = new Date().toISOString().slice(0, 10);
  const version = 'v3-roast-real';
  const data = readJson(PHRASE_FILE, { date: '', version: '', phrases: [] });
  if (
    data.date === today &&
    data.version === version &&
    Array.isArray(data.phrases) &&
    data.phrases.length >= 100
  )
    return;
  const phrases = [
    'KAMU JOMBLO YA',
    'KAPAN NIKAH NIH',
    'JUDUL SKRIPSI AMAN',
    'DIA SIBUK SAMA YANG LAIN',
    'HIDUP LAGI UJI COBA',
    'KAMU LAGI OVERTHINKING',
    'CHATMU CUMA DIBACA',
    'BALASANNYA BESOK KALI',
    'KAMU TERLALU BAIK KATANYA',
    'HATI KAMU RETAK HALUS',
    'MANTANMU SUDAH MOVE ON',
    'KAMU MASIH NUNGGU DIA',
    'PERASAANMU AUTO ZONK',
    'SEMESTA LAGI BERCANDA',
    'KAMU LELAH YA BOS',
    'HARAPANMU KENA PHP',
    'SENYUMMU TAHAN SAKIT',
    'MALAMMU PENUH DRAMA',
    'PAGIMU KURANG TIDUR',
    'HIDUPMU MODE HEMAT',
    'DOMPETMU MENANGIS LAGI',
    'SALDOMU TIPIS BANGET',
    'KERJAMU BAGUS BONUSNYA MANA',
    'DEADLINE KAMU DULUAN DATANG',
  ];
  const out = [];
  for (let i = 0; i < 100; i++) {
    out.push({
      id: `p-${today}-${i}`,
      phrase: phrases[i % phrases.length],
      hint: HINTS[i % HINTS.length],
      source: 'daily-generated',
    });
  }
  writeJson(PHRASE_FILE, { date: today, version, phrases: out });
}
ensurePhrasesSeed();

// ---- Anti-cheat ----
function signSession(payload) {
  const st = readJson(SETTINGS_FILE, {});
  const secret =
    st.antiCheatSecret || process.env.ANTI_CHEAT_SECRET || 'fallback-secret';
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

function validateAntiCheat(body, userId) {
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

// ---- Express setup ----
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
  }),
);
app.use(express.json({ limit: '256kb' }));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/static', express.static(path.join(__dirname, 'public')));

// Rate limit auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { ok: false, error: 'terlalu banyak percobaan, coba lagi nanti' },
});
app.use('/api/auth', authLimiter);

// ---- Health ----
app.get('/health', (_req, res) => {
  const s = readJson(SCORE_FILE, { scores: [] });
  const p = readJson(PHRASE_FILE, { phrases: [] });
  res.json({
    ok: true,
    app: 'kutuloncat-games',
    storage: 'json-file',
    scores: (s.scores || []).length,
    phrases: (p.phrases || []).length,
  });
});

// ============================================================
//  AUTH ENDPOINTS
// ============================================================

app.post('/api/auth/request-otp', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const phone = normalizePhone(req.body?.phone || '');
  const email = String(req.body?.email || '').trim();
  if (!name || !phone)
    return res
      .status(400)
      .json({ ok: false, error: 'name and phone required' });

  const udb = readJson(USERS_FILE, { users: [] });
  if (udb.users.some((u) => u.phone === phone)) {
    return res.json({
      ok: true,
      registered: true,
      message: 'Nomor sudah terdaftar. Gunakan login nomor.',
    });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const odb = readJson(OTP_FILE, { otps: [] });
  odb.otps = odb.otps.filter((o) => o.phone !== phone);
  odb.otps.push({
    phone,
    name,
    email,
    code,
    expiresAt: Date.now() + 60 * 60 * 1000,
    createdAt: nowIso(),
  });
  writeJson(OTP_FILE, odb);

  const sent = await sendWaha(
    phone,
    `Kode OTP KutuLoncat: ${code} (berlaku 60 menit)`,
  );
  res.json({ ok: true, sent, registered: false, phone, otpValidMinutes: 60 });
});

app.post('/api/auth/verify-otp', (req, res) => {
  const phone = normalizePhone(req.body?.phone || '');
  const code = String(req.body?.code || '').trim();
  const odb = readJson(OTP_FILE, { otps: [] });
  const row = odb.otps.find((o) => o.phone === phone && o.code === code);
  if (!row) return res.status(400).json({ ok: false, error: 'invalid otp' });
  if (Date.now() > row.expiresAt)
    return res.status(400).json({ ok: false, error: 'otp expired' });

  const udb = readJson(USERS_FILE, { users: [] });
  let user = udb.users.find((u) => u.phone === phone);
  if (!user) {
    user = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: escapeHtml(row.name),
      phone,
      email: row.email || '',
      photoUrl: '',
      createdAt: nowIso(),
      loginCount: 0,
      lastLoginAt: null,
    };
    udb.users.push(user);
  }
  user.loginCount = Number(user.loginCount || 0) + 1;
  user.lastLoginAt = nowIso();
  writeJson(USERS_FILE, udb);

  odb.otps = odb.otps.filter((o) => !(o.phone === phone && o.code === code));
  writeJson(OTP_FILE, odb);

  const { sid } = createSession(user.id);
  setSessionCookie(res, sid);
  res.json({ ok: true, user });
});

// Phone-only login (user preference - this is a game, not a bank)
app.post('/api/auth/login-number', (req, res) => {
  const phone = normalizePhone(req.body?.phone || '');
  if (!phone)
    return res
      .status(400)
      .json({ ok: false, error: 'nomor telepon diperlukan' });
  const udb = readJson(USERS_FILE, { users: [] });
  const user = udb.users.find((u) => u.phone === phone);
  if (!user)
    return res.status(404).json({ ok: false, error: 'nomor belum terdaftar' });
  user.loginCount = Number(user.loginCount || 0) + 1;
  user.lastLoginAt = nowIso();
  writeJson(USERS_FILE, udb);
  const { sid } = createSession(user.id);
  setSessionCookie(res, sid);
  res.json({ ok: true, user });
});

app.post('/api/auth/logout', (req, res) => {
  const sid = parseCookies(req).sid;
  const sdb = readJson(SESSIONS_FILE, { sessions: [] });
  sdb.sessions = sdb.sessions.filter((s) => s.sid !== sid);
  writeJson(SESSIONS_FILE, sdb);
  res.setHeader(
    'Set-Cookie',
    'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
  );
  res.json({ ok: true });
});

// ============================================================
//  USER PROFILE ENDPOINTS
// ============================================================

app.get('/api/me', (req, res) => {
  const user = getEffectiveUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });
  res.json({ ok: true, user });
});

app.post('/api/me', requireAuthApi, (req, res) => {
  const { name, photoUrl } = req.body || {};
  const udb = readJson(USERS_FILE, { users: [] });
  const row = udb.users.find((u) => u.id === req.user.id);
  if (!row) return res.status(404).json({ ok: false });
  if (name) row.name = escapeHtml(String(name).slice(0, 40));
  if (photoUrl !== undefined) row.photoUrl = String(photoUrl).slice(0, 500);
  writeJson(USERS_FILE, udb);
  res.json({ ok: true, user: row });
});

app.post('/api/me/photo', requireAuthApi, (req, res) => {
  const dataUrl = String(req.body?.photoData || '');
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!m)
    return res.status(400).json({ ok: false, error: 'invalid image format' });
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2 * 1024 * 1024)
    return res
      .status(400)
      .json({ ok: false, error: 'image too large (max 2MB)' });
  const filename = `u-${req.user.id}-${Date.now()}.${ext}`;
  const outPath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(outPath, buf);

  const udb = readJson(USERS_FILE, { users: [] });
  const row = udb.users.find((u) => u.id === req.user.id);
  if (!row) return res.status(404).json({ ok: false });
  row.photoUrl = `/uploads/${filename}`;
  writeJson(USERS_FILE, udb);
  res.json({ ok: true, photoUrl: row.photoUrl });
});

// ============================================================
//  GAME SESSION & ANTI-CHEAT
// ============================================================

app.post('/api/session/start', requireAuthApi, (req, res) => {
  const game = String(req.body?.game || '');
  if (!ALLOWED_GAMES.includes(game))
    return res.status(400).json({ ok: false, error: 'invalid game' });
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const payload = { sessionId, userId: req.user.id, game, startedAt };
  const token = signSession(payload);
  res.json({ ok: true, sessionId, game, startedAt, token });
});

// ============================================================
//  SCORES & ACHIEVEMENTS
// ============================================================

// Determine if a score entry counts as a "win"
function isWin(scoreRow) {
  if (scoreRow.game === 'hangman') return scoreRow.meta?.win === true;
  if (scoreRow.game === 'fruit-ninja') return Number(scoreRow.score) >= 50;
  return false;
}

app.post('/api/scores', requireAuthApi, (req, res) => {
  const { game, score, meta = {} } = req.body || {};
  if (!ALLOWED_GAMES.includes(game))
    return res.status(400).json({ ok: false, error: 'invalid game' });
  const nScore = Number(score);
  if (!Number.isFinite(nScore))
    return res.status(400).json({ ok: false, error: 'invalid score' });

  const check = validateAntiCheat(req.body, req.user.id);
  const db = readJson(SCORE_FILE, { scores: [] });
  const safeScore = Math.round(nScore);
  const row = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    game,
    playerName: req.user.name,
    userId: req.user.id,
    score: safeScore,
    meta: {
      ...(meta || {}),
      suspicious: !check.ok,
      antiCheatReason: check.ok ? null : check.reason,
    },
    createdAt: nowIso(),
  };
  db.scores.push(row);
  if (db.scores.length > 10000) db.scores = db.scores.slice(-10000);
  writeJson(SCORE_FILE, db);

  // ---- Achievement logic (codes match catalog exactly) ----
  const ach = readJson(ACH_FILE, { achievements: [] });
  const userScores = db.scores.filter((s) => s.userId === req.user.id);
  const totalScore = userScores.reduce((a, b) => a + Number(b.score || 0), 0);
  const playedGames = new Set(userScores.map((s) => s.game));

  const pushAch = (code, title, rarity = 'common') => {
    const exists = ach.achievements.find(
      (a) => a.userId === req.user.id && a.code === code,
    );
    if (!exists) {
      ach.achievements.push({
        id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userId: req.user.id,
        playerName: req.user.name,
        game,
        code,
        title,
        rarity,
        createdAt: nowIso(),
      });
    }
  };

  // first-play: first game ever
  if (userScores.length >= 1)
    pushAch('first-play', 'Mainkan game pertamamu', 'common');

  // hangman-100: score 100+ in hangman
  if (game === 'hangman' && safeScore >= 100)
    pushAch('hangman-100', 'Raih skor 100+ di Tebak Kata', 'uncommon');

  // ninja-100: score 100+ in fruit-ninja
  if (game === 'fruit-ninja' && safeScore >= 100)
    pushAch('ninja-100', 'Raih skor 100+ di Fruit Ninja', 'uncommon');

  // ninja-200: score 200+ in fruit-ninja
  if (game === 'fruit-ninja' && safeScore >= 200)
    pushAch('ninja-200', 'Legenda Ninja 200+', 'rare');

  // all-games: played both games
  if (playedGames.has('hangman') && playedGames.has('fruit-ninja')) {
    pushAch('all-games', 'Mainkan semua game tersedia', 'uncommon');
  }

  // login-week: 7+ logins
  if (Number(req.user.loginCount || 0) >= 7)
    pushAch('login-week', 'Login 7 hari', 'rare');

  // score-500: total score 500+
  if (totalScore >= 500) pushAch('score-500', 'Total skor 500+', 'epic');

  // veteran-50: 50+ total games
  if (userScores.length >= 50)
    pushAch('veteran-50', 'Mainkan total 50 game', 'legendary');

  // streak-5: last 5 games are all wins
  const recentScores = userScores
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 5);
  if (recentScores.length >= 5 && recentScores.every((s) => isWin(s))) {
    pushAch('streak-5', 'Menang 5 game berturut-turut', 'epic');
  }

  writeJson(ACH_FILE, ach);
  res.json({ ok: true, row, antiCheat: check });
});

app.get('/api/scores/:game/top', requireAuthApi, (req, res) => {
  const game = String(req.params.game || '');
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
  const db = readJson(SCORE_FILE, { scores: [] });
  const rows = db.scores
    .filter((s) => s.game === game)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => ({
      ...r,
      playerName: escapeHtml(r.playerName || 'Guest'),
      displayName:
        r.userId === req.user.id
          ? escapeHtml(r.playerName)
          : escapeHtml(maskName(r.playerName)),
    }));
  res.json({ ok: true, game, rows });
});

app.get('/api/scores/all/top', requireAuthApi, (req, res) => {
  const db = readJson(SCORE_FILE, { scores: [] });
  const top = {};
  for (const g of ALLOWED_GAMES) {
    top[g] = db.scores
      .filter((s) => s.game === g)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((r) => ({
        ...r,
        playerName: escapeHtml(r.playerName || 'Guest'),
        displayName:
          r.userId === req.user.id
            ? escapeHtml(r.playerName)
            : escapeHtml(maskName(r.playerName)),
      }));
  }
  res.json({ ok: true, top });
});

app.get('/api/achievements/me', requireAuthApi, (req, res) => {
  const ach = readJson(ACH_FILE, { achievements: [] });
  const rows = ach.achievements
    .filter((a) => a.userId === req.user.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ ok: true, rows });
});

app.get('/api/achievements/catalog', requireAuthApi, (req, res) => {
  const catalog = [
    {
      code: 'first-play',
      title: 'Mainkan game pertamamu',
      rarity: 'common',
      points: 10,
      game: 'all',
    },
    {
      code: 'hangman-100',
      title: 'Raih skor 100+ di Tebak Kata',
      rarity: 'uncommon',
      points: 25,
      game: 'hangman',
    },
    {
      code: 'ninja-100',
      title: 'Raih skor 100+ di Fruit Ninja',
      rarity: 'uncommon',
      points: 25,
      game: 'fruit-ninja',
    },
    {
      code: 'ninja-200',
      title: 'Legenda Ninja 200+',
      rarity: 'rare',
      points: 60,
      game: 'fruit-ninja',
    },
    {
      code: 'all-games',
      title: 'Mainkan semua game tersedia',
      rarity: 'uncommon',
      points: 30,
      game: 'all',
    },
    {
      code: 'login-week',
      title: 'Login 7 hari',
      rarity: 'rare',
      points: 40,
      game: 'all',
    },
    {
      code: 'streak-5',
      title: 'Menang 5 game berturut-turut',
      rarity: 'epic',
      points: 90,
      game: 'all',
    },
    {
      code: 'score-500',
      title: 'Total skor 500+',
      rarity: 'epic',
      points: 100,
      game: 'all',
    },
    {
      code: 'veteran-50',
      title: 'Mainkan total 50 game',
      rarity: 'legendary',
      points: 150,
      game: 'all',
    },
  ];

  const ach = readJson(ACH_FILE, { achievements: [] }).achievements.filter(
    (a) => a.userId === req.user.id,
  );
  const scores = readJson(SCORE_FILE, { scores: [] }).scores.filter(
    (s) => s.userId === req.user.id,
  );
  const totalGames = scores.length;
  const totalScore = scores.reduce((a, b) => a + Number(b.score || 0), 0);
  const playedGames = new Set(scores.map((s) => s.game));
  const unlocked = new Set(ach.map((a) => a.code));

  // Compute unlocks from data
  if (totalGames > 0) unlocked.add('first-play');
  if (scores.some((s) => s.game === 'hangman' && Number(s.score) >= 100))
    unlocked.add('hangman-100');
  if (scores.some((s) => s.game === 'fruit-ninja' && Number(s.score) >= 100))
    unlocked.add('ninja-100');
  if (scores.some((s) => s.game === 'fruit-ninja' && Number(s.score) >= 200))
    unlocked.add('ninja-200');
  if (playedGames.has('hangman') && playedGames.has('fruit-ninja'))
    unlocked.add('all-games');
  if (Number(req.user.loginCount || 0) >= 7) unlocked.add('login-week');
  if (totalScore >= 500) unlocked.add('score-500');
  if (totalGames >= 50) unlocked.add('veteran-50');

  // streak-5: check last 5 scores for consecutive wins
  const recentScores = scores
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 5);
  if (recentScores.length >= 5 && recentScores.every((s) => isWin(s))) {
    unlocked.add('streak-5');
  }

  const rows = catalog.map((c) => ({ ...c, unlocked: unlocked.has(c.code) }));
  const stats = {
    unlocked: rows.filter((r) => r.unlocked).length,
    total: rows.length,
    totalPoints: rows
      .filter((r) => r.unlocked)
      .reduce((a, b) => a + b.points, 0),
  };
  stats.progress = Math.round((stats.unlocked / stats.total) * 100);
  res.json({ ok: true, rows, stats });
});

// ============================================================
//  ADMIN ENDPOINTS (protected)
// ============================================================

// Check if admin auth is required
app.get('/api/admin/auth-required', (_req, res) => {
  res.json({ ok: true, required: !!ADMIN_PASSWORD });
});

app.get('/api/admin/ai-settings', requireAdmin, (_req, res) => {
  const s = readJson(SETTINGS_FILE, {});
  const model = s?.ai?.openaiModel || 'gpt-4o-mini';
  const hasKey = !!(s?.ai?.openaiApiKey || process.env.OPENAI_API_KEY);
  res.json({ ok: true, hasKey, openaiModel: model });
});

app.post('/api/admin/ai-settings', requireAdmin, (req, res) => {
  const cur = readJson(SETTINGS_FILE, {});
  const ai = {
    openaiApiKey: String(req.body?.openaiApiKey || cur?.ai?.openaiApiKey || ''),
    openaiModel: String(
      req.body?.openaiModel || cur?.ai?.openaiModel || 'gpt-4o-mini',
    ),
  };
  writeJson(SETTINGS_FILE, { ...cur, ai });
  res.json({
    ok: true,
    hasKey: !!ai.openaiApiKey,
    openaiModel: ai.openaiModel,
  });
});

app.post('/api/admin/generate-phrases', requireAdmin, async (req, res) => {
  const count = Math.min(300, Math.max(1, Number(req.body?.count || 100)));
  const prompt = String(
    req.body?.prompt || 'roast user, galau, dark joke, romantis receh',
  ).trim();
  const settings = readJson(SETTINGS_FILE, {});
  const OPENAI_API_KEY =
    settings?.ai?.openaiApiKey || process.env.OPENAI_API_KEY || '';
  const OPENAI_MODEL =
    settings?.ai?.openaiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (OPENAI_API_KEY) {
    try {
      const sys =
        'Kamu penulis frase game tebak kata Indonesia. Hasilkan frase natural, lucu, roasting, galau, dark joke ringan, romantis receh. Balas JSON valid.';
      const userMsg = `Buat ${count} frase bahasa Indonesia untuk game tebak kata. Aturan: 3-8 kata, uppercase, tidak repetitif, hindari kata kasar ekstrem/SARA. Gaya: ${prompt}. Format: {"phrases":[{"phrase":"...","hint":"roast|galau|dark|humor|romantis"}]}`;
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          temperature: 1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: userMsg },
          ],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const txt = j?.choices?.[0]?.message?.content || '{}';
        let arr = [];
        try {
          const parsed = JSON.parse(txt);
          arr = Array.isArray(parsed)
            ? parsed
            : parsed.phrases || parsed.items || [];
        } catch {
          /* parse error */
        }
        const cleaned = (arr || [])
          .map((x, i) => ({
            id: 'gen-' + Date.now() + '-' + i,
            phrase: String(x.phrase || '')
              .toUpperCase()
              .replace(/[^A-Z\s]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim(),
            hint: HINTS.includes(String(x.hint || '').toLowerCase())
              ? String(x.hint).toLowerCase()
              : 'roast',
            source: 'openai',
          }))
          .filter((x) => {
            const wc = x.phrase.split(/\s+/).filter(Boolean).length;
            return wc >= 3 && wc <= 8;
          })
          .slice(0, count);
        if (cleaned.length >= Math.max(10, Math.floor(count * 0.4))) {
          return res.json({
            ok: true,
            provider: 'openai',
            prompt,
            count: cleaned.length,
            phrases: cleaned,
          });
        }
      }
    } catch {
      /* OpenAI failed, fall through to fallback */
    }
  }

  const fallback = [];
  const pool = [
    'KAMU JOMBLO YA',
    'SKRIPSIMU MASIH JUDUL DOANG',
    'DIA ONLINE BUKAN BUATMU',
    'HIDUPMU MODE UJI COBA',
    'BESOK KITA KETAWA LAGI',
  ];
  for (let i = 0; i < count; i++) {
    fallback.push({
      id: 'gen-' + Date.now() + '-' + i,
      phrase: pick(pool),
      hint: HINTS[i % HINTS.length],
      source: 'fallback',
    });
  }
  res.json({
    ok: true,
    provider: 'fallback',
    prompt,
    count: fallback.length,
    phrases: fallback,
  });
});

app.get('/api/admin/phrases', requireAdmin, (_req, res) => {
  const p = readJson(PHRASE_FILE, { phrases: [] });
  res.json({
    ok: true,
    date: p.date || '',
    version: p.version || '',
    phrases: p.phrases || [],
  });
});

app.post('/api/admin/phrases', requireAdmin, (req, res) => {
  const rows = Array.isArray(req.body?.phrases) ? req.body.phrases : [];
  const cleaned = rows
    .map((r, i) => ({
      id: String(r.id || `manual-${Date.now()}-${i}`),
      phrase: String(r.phrase || '')
        .toUpperCase()
        .replace(/[^A-Z\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
      hint:
        String(r.hint || 'umum')
          .toLowerCase()
          .trim() || 'umum',
      source: String(r.source || 'admin'),
    }))
    .filter((x) => {
      const wc = x.phrase.split(/\s+/).filter(Boolean).length;
      return wc >= 3 && wc <= 8;
    })
    .slice(0, 300);
  const now = new Date().toISOString().slice(0, 10);
  const prev = readJson(PHRASE_FILE, { version: 'admin-custom' });
  writeJson(PHRASE_FILE, {
    date: now,
    version: prev.version || 'admin-custom',
    phrases: cleaned,
  });
  res.json({ ok: true, count: cleaned.length });
});

// Public game config — only exposes fruitNinja tuning (no secrets)
app.get('/api/game/fruit-ninja/config', (_req, res) => {
  const s = readJson(SETTINGS_FILE, {});
  res.json({ ok: true, fruitNinja: s.fruitNinja || {} });
});

app.get('/api/admin/settings', requireAdmin, (_req, res) => {
  const s = readJson(SETTINGS_FILE, {});
  const safe = JSON.parse(JSON.stringify(s || {}));
  // Mask sensitive values
  if (safe?.ai?.openaiApiKey) safe.ai.openaiApiKey = '***set***';
  if (safe?.waha?.apiKey) safe.waha.apiKey = '***set***';
  // Never expose antiCheatSecret
  delete safe.antiCheatSecret;
  res.json({ ok: true, settings: safe });
});

// Secure settings update — only allow specific whitelisted keys
app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const cur = readJson(SETTINGS_FILE, {});
  const body = req.body || {};
  // Only allow updating these specific sections
  if (body.fruitNinja && typeof body.fruitNinja === 'object') {
    cur.fruitNinja = { ...cur.fruitNinja, ...body.fruitNinja };
  }
  if (body.waha && typeof body.waha === 'object') {
    cur.waha = {
      baseUrl: String(body.waha.baseUrl || cur.waha?.baseUrl || ''),
      apiKey:
        body.waha.apiKey && body.waha.apiKey !== '***set***'
          ? String(body.waha.apiKey)
          : cur.waha?.apiKey || '',
      session: String(body.waha.session || cur.waha?.session || 'KutuLoncat'),
    };
  }
  if (body.ai && typeof body.ai === 'object') {
    cur.ai = {
      openaiApiKey:
        body.ai.openaiApiKey && body.ai.openaiApiKey !== '***set***'
          ? String(body.ai.openaiApiKey)
          : cur.ai?.openaiApiKey || '',
      openaiModel: String(
        body.ai.openaiModel || cur.ai?.openaiModel || 'gpt-4o-mini',
      ),
    };
  }
  // antiCheatSecret is NEVER overwritten via API
  writeJson(SETTINGS_FILE, cur);
  res.json({ ok: true });
});

app.get('/api/admin/waha/diagnostics', requireAdmin, async (_req, res) => {
  const { baseUrl, apiKey, session } = getWahaConfig();
  const out = { ok: true, baseUrl, hasApiKey: !!apiKey, session, checks: [] };

  if (!baseUrl) {
    out.checks.push({
      name: 'config',
      status: 0,
      ok: false,
      sample: 'WAHA_BASE_URL not configured',
    });
    return res.json(out);
  }

  const checks = [
    {
      name: 'sessions-list',
      url: `${baseUrl}/api/sessions/`,
      headers: { 'X-Api-Key': apiKey },
    },
    {
      name: 'session-detail',
      url: `${baseUrl}/api/sessions/${encodeURIComponent(session)}`,
      headers: { 'X-Api-Key': apiKey },
    },
  ];

  for (const c of checks) {
    try {
      const r = await fetch(c.url, { headers: c.headers });
      const txt = await r.text();
      out.checks.push({
        name: c.name,
        status: r.status,
        ok: r.ok,
        sample: txt.slice(0, 180),
      });
    } catch (e) {
      out.checks.push({
        name: c.name,
        status: 0,
        ok: false,
        sample: String(e.message || e),
      });
    }
  }
  res.json(out);
});

app.post('/api/admin/waha/test-send', requireAdmin, async (req, res) => {
  const phone = normalizePhone(req.body?.phone || '');
  if (!phone)
    return res.status(400).json({ ok: false, error: 'phone required' });

  const { baseUrl, apiKey, session } = getWahaConfig();
  if (!baseUrl || !apiKey)
    return res.status(400).json({ ok: false, error: 'WAHA not configured' });

  const payload = {
    session,
    chatId: `${phone.replace('+', '')}@c.us`,
    text: String(req.body?.text || 'Test WAHA dari Admin'),
  };
  const tries = [
    { url: `${baseUrl}/api/sendText`, headers: { 'X-Api-Key': apiKey } },
    { url: `${baseUrl}/api/messages/text`, headers: { 'X-Api-Key': apiKey } },
    {
      url: `${baseUrl}/sendText`,
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  ];

  const results = [];
  for (const t of tries) {
    try {
      const r = await fetch(t.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t.headers || {}) },
        body: JSON.stringify(payload),
      });
      const txt = await r.text();
      results.push({
        url: t.url,
        status: r.status,
        ok: r.ok,
        sample: txt.slice(0, 180),
      });
      if (r.ok) return res.json({ ok: true, via: t.url, results });
    } catch (e) {
      results.push({
        url: t.url,
        status: 0,
        ok: false,
        sample: String(e.message || e),
      });
    }
  }
  res.status(502).json({ ok: false, error: 'all endpoints failed', results });
});

// ============================================================
//  GAME ENDPOINTS
// ============================================================

app.get('/api/hangman/phrase', requireAuth, (_req, res) => {
  ensurePhrasesSeed();
  const p = readJson(PHRASE_FILE, { phrases: [] });
  const row =
    p.phrases && p.phrases.length
      ? p.phrases[Math.floor(Math.random() * p.phrases.length)]
      : { phrase: 'CIE YANG JOMBLO', hint: 'roast' };
  res.json({ ok: true, row });
});

// ============================================================
//  PAGE ROUTES
// ============================================================

app.get('/login', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'login.html')),
);
app.get('/profile', requireAuth, (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'profile.html')),
);
app.get('/achievements', requireAuth, (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'achievements.html')),
);
app.get('/', requireAuth, (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html')),
);
app.get('/hangman', requireAuth, (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'hangman.html')),
);
app.get('/fruit-ninja', requireAuth, (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'fruit-ninja.html')),
);
app.get('/leaderboard', requireAuth, (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')),
);
app.get('/admin', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin.html')),
);
app.get('*', (_req, res) => res.redirect('/login'));

// ============================================================
//  START SERVER
// ============================================================

app.listen(PORT, '127.0.0.1', () => {
  console.log(`KutuLoncat Games aktif di http://127.0.0.1:${PORT}`);
  if (!ADMIN_PASSWORD)
    console.log('⚠️  ADMIN_PASSWORD not set — admin panel is unprotected');
});
