import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.join(__dirname, '..', '..', 'data');
export const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
export const SCORE_FILE = path.join(DATA_DIR, 'scores.json');
export const PHRASE_FILE = path.join(DATA_DIR, 'phrases.json');
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
export const USERS_FILE = path.join(DATA_DIR, 'users.json');
export const OTP_FILE = path.join(DATA_DIR, 'otp.json');
export const ACH_FILE = path.join(DATA_DIR, 'achievements.json');
export const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
export const REFERRAL_FILE = path.join(DATA_DIR, 'referrals.json');

export const HINTS = ['roast', 'galau', 'romantis', 'humor', 'dark'] as const;
export const ALLOWED_GAMES = [
  'hangman',
  'fruit-ninja',
  'flappy-bird',
  'snake',
] as const;

/* ── auto-create directories ── */
for (const dir of [DATA_DIR, UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/* ── seed data files ── */
for (const [f, seed] of [
  [SCORE_FILE, { scores: [] }],
  [USERS_FILE, { users: [] }],
  [OTP_FILE, { otps: [] }],
  [ACH_FILE, { achievements: [] }],
  [SESSIONS_FILE, { sessions: [] }],
  [REFERRAL_FILE, { referrals: [] }],
] as const) {
  if (!fs.existsSync(f as string))
    fs.writeFileSync(f as string, JSON.stringify(seed, null, 2));
}

/* ── settings seed ── */
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
          openaiModel: process.env.OPENAI_MODEL || 'o4-mini',
        },
        waha: {
          baseUrl: process.env.WAHA_BASE_URL || '',
          apiKey: process.env.WAHA_API_KEY || '',
          session: process.env.WAHA_SESSION || 'KutuLoncat',
        },
        fruitNinja: {
          lives: 3,
          fruitSize: 56,
          fruitHitRadius: 44,
          gravityBase: 220,
          launchSpeedMin: 280,
          launchSpeedMax: 420,
          safeBombDistance: 90,
          stageSeconds: [60, 150, 240],
          maxByStage: [5, 7, 9, 11],
          gapByStage: [1000, 850, 700, 580],
          burstMin: [1, 1, 1, 1],
          burstMax: [2, 2, 3, 4],
          weirdChance: [0.06, 0.1, 0.14, 0.18],
          bombBase: [0.08, 0.1, 0.12, 0.15],
        },
      },
      null,
      2,
    ),
  );
}

/* ── JSON helpers ── */
export function readJson<T = any>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, data: any): void {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/**
 * Update playerName in all score records + achievements for a given userId.
 * Call this whenever a user's name changes (profile or admin edit).
 */
export function syncPlayerName(userId: string | number, newName: string): void {
  const safeName = escapeHtml(String(newName).slice(0, 40));
  // Update scores
  const scoreDb = readJson(SCORE_FILE, { scores: [] as any[] });
  let changed = false;
  for (const s of scoreDb.scores) {
    if (s.userId === userId && s.playerName !== safeName) {
      s.playerName = safeName;
      changed = true;
    }
  }
  if (changed) writeJson(SCORE_FILE, scoreDb);

  // Update achievements
  const achDb = readJson(ACH_FILE, { achievements: [] as any[] });
  let achChanged = false;
  for (const a of achDb.achievements) {
    if (a.userId === userId && a.playerName !== safeName) {
      a.playerName = safeName;
      achChanged = true;
    }
  }
  if (achChanged) writeJson(ACH_FILE, achDb);
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizePhone(v: string = ''): string {
  const d = String(v).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('62')) return `+${d}`;
  if (d.startsWith('0')) return `+62${d.slice(1)}`;
  if (d.startsWith('8')) return `+62${d}`;
  return `+${d}`;
}

export function maskName(name: string = ''): string {
  const n = String(name || '').trim();
  if (!n) return 'Anonim';
  // Take only first word, show max 3 chars + ****
  const first = n.split(/\s+/)[0];
  if (first.length <= 2) return first[0] + '**';
  return first.slice(0, 3) + '****';
}

/** Generate a unique 4-digit referral code, checking against existing codes */
export function generateReferralCode(): string {
  const udb = readJson(USERS_FILE, { users: [] as any[] });
  const existingCodes = new Set(
    udb.users.map((u: any) => u.referralCode).filter(Boolean),
  );
  let attempts = 0;
  while (attempts < 500) {
    const code = String(Math.floor(1000 + Math.random() * 9000)); // 1000-9999
    if (!existingCodes.has(code)) return code;
    attempts++;
  }
  // Fallback: 5-digit code
  return String(Math.floor(10000 + Math.random() * 90000));
}

/** Welcome message template */
export function getWelcomeMessage(name: string): string {
  return `Hi! 👋 *Selamat Datang* dan *Terima Kasih* sudah *bergabung* di Kutuloncat Games! 🎉

⚠️ _Penting banget nih:_
Di-save ya nomor ini dengan nama:
*Kutuloncat* 🐜
(Supaya kamu terhindar dari pesan aneh atau nomor _anomali_ lainnya! 😉)

Sekarang, kamu bebas nikmatin semua game 🎮 dan berhak mendapatkan rewards!

_Selamat bermain di *kutuloncat games*!_ 🕹️

> Salam hangat,
> *Kutuloncat* 🐜`;
}

/** Login notification message */
export function getLoginMessage(name: string): string {
  return `Hi! 👋 *Login Berhasil, Selamat Datang Kembali di Kutuloncat Games!* 🎉

Halo ${name}
_Selamat bermain kembali!_ 🕹️

> Salam hangat,
> *Kutuloncat* 🐜


⚠️ _Penting banget nih:_
Di-save ya nomor ini dengan nama:
*Kutuloncat* 🐜
(Supaya kamu terhindar dari pesan aneh atau nomor _anomali_ lainnya! 😉)`;
}

/* ── Phrases seed ── */
export function ensurePhrasesSeed(): void {
  const today = new Date().toISOString().slice(0, 10);
  const version = 'v3-roast-real';
  const data = readJson(PHRASE_FILE, {
    date: '',
    version: '',
    phrases: [] as any[],
  });
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
  const out: any[] = [];
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
