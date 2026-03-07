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
export const USER_PHRASE_HISTORY_FILE = path.join(
  DATA_DIR,
  'user-phrase-history.json',
);

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

/* ── Phrases seed (permanent, 150 unique) ── */
export function ensurePhrasesSeed(): void {
  const version = 'v4-permanent-150';
  const data = readJson(PHRASE_FILE, {
    date: '',
    version: '',
    phrases: [] as any[],
  });
  // Don't overwrite if phrases already exist (admin-saved, openai-generated, or current version)
  if (Array.isArray(data.phrases) && data.phrases.length >= 10) return;

  const PHRASE_POOL: { phrase: string; hint: (typeof HINTS)[number] }[] = [
    // ── JOMBLO & GALAU ──
    { phrase: 'JOMBLO BUKAN PILIHAN TAKDIR', hint: 'galau' },
    { phrase: 'HATIMU SUDAH KADALUARSA BELUM', hint: 'roast' },
    { phrase: 'STATUS JOMBLO PERMANEN SELAMANYA', hint: 'dark' },
    { phrase: 'MALAM MINGGU SENDIRIAN LAGI', hint: 'galau' },
    { phrase: 'GEBETANMU SUDAH PUNYA GANDENGAN', hint: 'galau' },
    { phrase: 'CINTAMU BERTEPUK SEBELAH TANGAN', hint: 'galau' },
    { phrase: 'CHATNYA DIBACA DOANG GAK DIBALES', hint: 'galau' },
    { phrase: 'PERASAANMU DITOLAK HALUS BANGET', hint: 'galau' },
    { phrase: 'NUNGGU BALESAN SAMPAI LUMUTAN', hint: 'galau' },
    { phrase: 'KAMU CUMA JADI OPSI CADANGAN', hint: 'dark' },
    { phrase: 'HATIMU RETAK SERIBU KEPING', hint: 'galau' },
    { phrase: 'MANTAN SUDAH BAHAGIA TANPAMU', hint: 'galau' },
    { phrase: 'JODOHMU MASIH NYASAR ENTAH DIMANA', hint: 'humor' },
    { phrase: 'CURHATMU CUMA DIDENGAR TEMBOK', hint: 'dark' },
    { phrase: 'DIA ONLINE BUKAN BUAT KAMU', hint: 'galau' },
    // ── PATAH HATI & MOVE ON ──
    { phrase: 'MOVE ON GAK SEMUDAH TUTORIAL', hint: 'galau' },
    { phrase: 'PATAH HATI VERSI PREMIUM', hint: 'dark' },
    { phrase: 'KENANGAN MANTAN MASIH BERHANTU', hint: 'galau' },
    { phrase: 'HATIMU BUTUH GARANSI SEUMUR HIDUP', hint: 'humor' },
    { phrase: 'SUDAH IKHLAS TAPI MASIH STALKING', hint: 'dark' },
    { phrase: 'HEALING KE MANA KALAU BOKEK', hint: 'humor' },
    { phrase: 'HEALING CUMA BUAT YANG BERDUIT', hint: 'dark' },
    { phrase: 'RINDU DIA TAPI GENGSI TINGGI', hint: 'galau' },
    { phrase: 'HATIMU PERLU DI RESTART ULANG', hint: 'humor' },
    { phrase: 'DIA PERGI KAMU OVERTHINKING', hint: 'galau' },
    // ── RED FLAG & TOXIC ──
    { phrase: 'PASANGANMU RED FLAG BERJALAN', hint: 'dark' },
    { phrase: 'RED FLAG NYA SUDAH KAYAK BENDERA', hint: 'roast' },
    { phrase: 'HUBUNGANMU TOXIC TAPI SAYANG', hint: 'galau' },
    { phrase: 'KAMU PILIH YANG SALAH LAGI', hint: 'dark' },
    { phrase: 'SAYANG TAPI SALING MENYAKITI', hint: 'galau' },
    { phrase: 'DIA MANIS TAPI PENUH RACUN', hint: 'dark' },
    { phrase: 'SITUATIONSHIP TANPA KEJELASAN STATUS', hint: 'galau' },
    { phrase: 'DI GHOSTING SETELAH DINNER MAHAL', hint: 'dark' },
    { phrase: 'BREADCRUMBING TAPI BILANG SERIUS', hint: 'dark' },
    { phrase: 'KAMU DELULU DIA GAK PEDULI', hint: 'roast' },
    // ── KERJAAN & HUSTLE CULTURE ──
    { phrase: 'KERJAMU BANYAK GAJINYA MINIM', hint: 'roast' },
    { phrase: 'DEADLINE KEJAR BONUS GAK NONGOL', hint: 'roast' },
    { phrase: 'MEETING LAGI MEETING LAGI TERUS', hint: 'humor' },
    { phrase: 'LEMBUR TIAP HARI APRESIASI MANA', hint: 'roast' },
    { phrase: 'HUSTLE CULTURE BIKIN BURNOUT PARAH', hint: 'dark' },
    { phrase: 'KERJA KERAS BUAT ORANG LAIN', hint: 'dark' },
    { phrase: 'CV BAGUS TAPI DITOLAK TERUS', hint: 'galau' },
    { phrase: 'INTERVIEW KE SEPULUH MASIH GAGAL', hint: 'galau' },
    { phrase: 'GAJI HABIS TANGGAL LIMA BELAS', hint: 'roast' },
    { phrase: 'RESIGN DALAM HATI TIAP HARI', hint: 'dark' },
    { phrase: 'BOSEN KERJA TAPI BUTUH DUIT', hint: 'humor' },
    { phrase: 'SKRIPSIMU MASIH JUDUL DOANG', hint: 'roast' },
    { phrase: 'SIDANG DITUNDA DOSEN SIBUK TERUS', hint: 'humor' },
    { phrase: 'KERJA REMOTE TAPI GAK PUNYA WIFI', hint: 'humor' },
    { phrase: 'BURNOUT LEVEL DEWA SETIAP SENIN', hint: 'dark' },
    // ── EKONOMI & HARGA NAIK ──
    { phrase: 'HARGA NAIK GAJI TETAP SEGITU', hint: 'roast' },
    { phrase: 'BERAS MAHAL LAUK CUMA TAHU', hint: 'dark' },
    { phrase: 'SAWIT NAIK MINYAK GORENG IKUTAN', hint: 'humor' },
    { phrase: 'DOMPETMU MENANGIS SETIAP BULAN', hint: 'galau' },
    { phrase: 'PROMO BANYAK SALDO KOSONG MELOMPONG', hint: 'humor' },
    { phrase: 'GAJIAN LANGSUNG HABIS BUAT CICILAN', hint: 'dark' },
    { phrase: 'NABUNG SUSAH JAJAN GAMPANG BANGET', hint: 'humor' },
    { phrase: 'TANGGAL TUA MAKAN MI INSTAN', hint: 'dark' },
    { phrase: 'INFLASI NAIK TABUNGAN MENIPIS TERUS', hint: 'galau' },
    { phrase: 'DISKON LIMA PULUH PERSEN MASIH MAHAL', hint: 'humor' },
    // ── DARK JOKES ──
    { phrase: 'HIDUPMU KAYAK TRIAL TANPA PREMIUM', hint: 'dark' },
    { phrase: 'SEMESTA SEDANG MENGUJI KESABARANMU', hint: 'dark' },
    { phrase: 'MIMPI INDAH BANGUN KENYATAAN PAHIT', hint: 'dark' },
    { phrase: 'DUIT HABIS MASALAH DATANG BERTUBI', hint: 'dark' },
    { phrase: 'HIDUP KERAS KAMU LEBIH KERAS', hint: 'dark' },
    { phrase: 'SENYUM DI LUAR NANGIS DI DALAM', hint: 'dark' },
    { phrase: 'UMUR NAMBAH PRESTASI MASIH KOSONG', hint: 'dark' },
    { phrase: 'HARAPANMU ZONK TERUS SETIAP HARI', hint: 'dark' },
    { phrase: 'USAHAMU KERAS TAPI GAGAL MULU', hint: 'dark' },
    { phrase: 'KARMA DATANG TANPA UNDANGAN RESMI', hint: 'dark' },
    // ── ROAST ──
    { phrase: 'MUKA TEBAL BAKAT TIPIS BANGET', hint: 'roast' },
    { phrase: 'NGOMONG BANYAK HASILNYA NOL BESAR', hint: 'roast' },
    { phrase: 'GAYA SULTAN DOMPET FAKIR MISKIN', hint: 'roast' },
    { phrase: 'PEDE BANGET TAPI SKILL KOSONG', hint: 'roast' },
    { phrase: 'FLEXING TERUS TAPI NGUTANG DIAM', hint: 'roast' },
    { phrase: 'FOLLOWERS BANYAK TEMAN ASLI DIKIT', hint: 'roast' },
    { phrase: 'STORY TIAP JAM KERJAANNYA APA', hint: 'roast' },
    { phrase: 'KOMENTARMU PEDES HIDUPMU HAMBAR', hint: 'roast' },
    { phrase: 'JULID TERUS TAPI GAK NGACA', hint: 'roast' },
    { phrase: 'LATAH IKUT TREN TAPI GARING', hint: 'roast' },
    // ── HUMOR ──
    { phrase: 'WIFI LEMOT SABAR MENIPIS CEPAT', hint: 'humor' },
    { phrase: 'ALARM BUNYI TAPI BADAN MENOLAK', hint: 'humor' },
    { phrase: 'DIET MULAI BESOK KATANYA TERUS', hint: 'humor' },
    { phrase: 'NIAT GYM MALAH REBAHAN SEHARIAN', hint: 'humor' },
    { phrase: 'MAKAN BANYAK TIMBANGAN NANGIS KERAS', hint: 'humor' },
    { phrase: 'TIDUR LIMA MENIT TERASA LIMA JAM', hint: 'humor' },
    { phrase: 'BELANJA ONLINE JAM DUA PAGI', hint: 'humor' },
    { phrase: 'CHECKOUT DULU MIKIR BELAKANGAN AJA', hint: 'humor' },
    { phrase: 'RENCANA PRODUKTIF BERAKHIR SCROLL MEDSOS', hint: 'humor' },
    { phrase: 'BANGUN TIDUR LANGSUNG CEK HANDPHONE', hint: 'humor' },
    // ── ROMANTIS RECEH ──
    { phrase: 'KAMU SENYUM AKU MELELEH SEKETIKA', hint: 'romantis' },
    { phrase: 'JATUH CINTA TANPA ASURANSI JIWA', hint: 'romantis' },
    { phrase: 'KAMU ALASAN AKU TERSENYUM HARI', hint: 'romantis' },
    { phrase: 'GOMBAL RECEH TAPI BIKIN BAPER', hint: 'romantis' },
    { phrase: 'KANGEN KAMU SETENGAH MATI BENERAN', hint: 'romantis' },
    { phrase: 'SATU CHAT DARIMU OBAT RINDU', hint: 'romantis' },
    { phrase: 'MATAMU BINTANG HATIKU REMBULAN PAGI', hint: 'romantis' },
    { phrase: 'CINTA PERTAMA YANG BELUM KESAMPAIAN', hint: 'romantis' },
    { phrase: 'KAMU MOODBOOSTER TERBAIK SEPANJANG MASA', hint: 'romantis' },
    { phrase: 'GENGGAM TANGANMU DUNIA TERASA INDAH', hint: 'romantis' },
    // ── AI & TEKNOLOGI ──
    { phrase: 'AI GANTIKAN KERJAMU BESOK LUSA', hint: 'dark' },
    { phrase: 'ROBOT LEBIH RAJIN DARI KAMU', hint: 'roast' },
    { phrase: 'CHATBOT LEBIH PERHATIAN DARI PACARMU', hint: 'dark' },
    { phrase: 'SCROLL TIKTOK LIMA JAM NONSTOP', hint: 'humor' },
    { phrase: 'ALGORITMA LEBIH KENAL KAMU SENDIRI', hint: 'dark' },
    { phrase: 'NOTIFIKASI BANYAK CHAT PENTING NOL', hint: 'roast' },
    { phrase: 'UPDATE APLIKASI TIAP HARI CAPEK', hint: 'humor' },
    { phrase: 'KONTEN KREATOR TAPI SEPI VIEWERS', hint: 'roast' },
    { phrase: 'VIRAL SESAAT BESOK DILUPAKAN ORANG', hint: 'dark' },
    { phrase: 'DATA BOCOR PRIVASI TINGGAL KENANGAN', hint: 'dark' },
    // ── CERAI & DRAMA RUMAH TANGGA ──
    { phrase: 'NIKAH BURU BURU CERAI KILAT', hint: 'dark' },
    { phrase: 'PERNIKAHAN INDAH PERCERAIAN VIRAL DIMANA', hint: 'dark' },
    { phrase: 'GUGAT CERAI KARENA JUDI ONLINE', hint: 'dark' },
    { phrase: 'RUMAH TANGGA KAYAK SINETRON MALAM', hint: 'humor' },
    { phrase: 'DRAMA KELUARGA LEBIH SERU DRAKOR', hint: 'humor' },
    { phrase: 'MERTUA CEREWET MENANTU SABAR TAHAN', hint: 'humor' },
    { phrase: 'RESEPSI MEWAH CERAI SETAHUN KEMUDIAN', hint: 'dark' },
    // ── OVERTHINKING & MENTAL HEALTH ──
    { phrase: 'OVERTHINKING JAM DUA PAGI SENDIRIAN', hint: 'galau' },
    { phrase: 'ANXIETY DATANG TANPA DIUNDANG SIAPA', hint: 'galau' },
    { phrase: 'PIKIRAN BERANTAKAN HATI IKUT RUWET', hint: 'galau' },
    { phrase: 'SELF LOVE CUMA BUAT DI CAPTION', hint: 'dark' },
    { phrase: 'TOXIC POSITIVITY BIKIN TAMBAH LELAH', hint: 'dark' },
    { phrase: 'INSOMNIA TEMAN SETIA SETIAP MALAM', hint: 'galau' },
    { phrase: 'HEALING KE BALI TAPI NGUTANG', hint: 'humor' },
    // ── SOSMED & LIFESTYLE ──
    { phrase: 'AESTHETIC FEED HIDUP BERANTAKAN PARAH', hint: 'roast' },
    { phrase: 'PAMER LIBURAN PADAHAL NGUTANG KEMANA', hint: 'roast' },
    { phrase: 'FOTO BAGUS ASLINYA BEDA JAUH', hint: 'roast' },
    { phrase: 'FILTER TEBAL PERCAYA DIRI TIPIS', hint: 'roast' },
    { phrase: 'ENDORSE GRATIS TAPI BANYAK MINTA', hint: 'roast' },
    { phrase: 'SUBSCRIBER SEDIKIT KONTEN BEJIBUN DONG', hint: 'humor' },
    // ── MAKANAN & KULINER ──
    { phrase: 'LAPAR TAPI BINGUNG MAU MAKAN', hint: 'humor' },
    { phrase: 'INDOMIE PENYELAMAT DI AKHIR BULAN', hint: 'humor' },
    { phrase: 'NASI PADANG OBAT SEGALA GALAU', hint: 'humor' },
    { phrase: 'GORENGAN PANAS BIKIN HARI INDAH', hint: 'humor' },
    { phrase: 'KOPI PAHIT SEMANIS SENYUM BARISTA', hint: 'romantis' },
    // ── RANDOM DAILY LIFE ──
    { phrase: 'MACET JAKARTA BIKIN TERLAMBAT TERUS', hint: 'humor' },
    { phrase: 'OJOL CANCEL HUJAN DERAS TERUS', hint: 'humor' },
    { phrase: 'KUOTA HABIS DI TANGGAL MUDA', hint: 'dark' },
    { phrase: 'TETANGGA BERISIK TIDUR GAK TENANG', hint: 'humor' },
    { phrase: 'MOTOR MOGOK PAS BURU BURU', hint: 'humor' },
    { phrase: 'KOS SEMPIT TAPI HARGA SELANGIT', hint: 'dark' },
    { phrase: 'LISTRIK MATI PAS LAGI SERU', hint: 'humor' },
    { phrase: 'BANJIR LAGI JALANAN JADI SUNGAI', hint: 'dark' },
    // ── MOTIVASI ROASTING ──
    { phrase: 'SEMANGAT YA WALAU GAGAL TERUS', hint: 'roast' },
    { phrase: 'PERCAYA DIRI ITU BAGUS REALITA', hint: 'roast' },
    { phrase: 'USAHAMU BAGUS HASILNYA BELUM TENTU', hint: 'roast' },
    { phrase: 'MIMPI BESAR LANGKAH MASIH DITEMPAT', hint: 'roast' },
    { phrase: 'REZEKI GAK KEMANA TAPI KAPAN', hint: 'humor' },
    { phrase: 'SABAR ADA BATASNYA KAMU LEWAT', hint: 'dark' },
    // ── DELULU & GEN Z CULTURE ──
    { phrase: 'DELULU JADI SOLULU KATANYA SEMUA', hint: 'humor' },
    { phrase: 'MAIN AMAN TAPI HATI NEKAT', hint: 'galau' },
    { phrase: 'NO COMMENT TAPI KEPO MAKSIMAL', hint: 'humor' },
    { phrase: 'GHOSTING TANPA PENJELASAN APAPUN SADIS', hint: 'dark' },
    { phrase: 'NETFLIX MARATHON TUGAS MENUMPUK BANYAK', hint: 'humor' },
    { phrase: 'REBAHAN PRODUKTIF ITU MITOS BELAKA', hint: 'humor' },
    { phrase: 'BUCIN LEVEL DEWA TANPA BALASAN', hint: 'galau' },
    { phrase: 'BAPER SENDIRI PADAHAL GAK DIANGGAP', hint: 'galau' },
    { phrase: 'ICK MUNCUL PAS BARU JADIAN', hint: 'dark' },
    { phrase: 'VIBES NYA BAGUS ORANGNYA KURANG', hint: 'roast' },
  ];

  const now = new Date().toISOString().slice(0, 10);
  const out = PHRASE_POOL.map((p, i) => ({
    id: `p-v4-${i}`,
    phrase: p.phrase,
    hint: p.hint,
    source: 'built-in',
  }));
  writeJson(PHRASE_FILE, { date: now, version, phrases: out });
}

/* ── Per-user phrase history helpers ── */
export function getUserPhraseHistory(userId: string | number): string[] {
  const data = readJson(
    USER_PHRASE_HISTORY_FILE,
    {} as Record<string, string[]>,
  );
  return data[String(userId)] || [];
}

export function addUserPhraseHistory(
  userId: string | number,
  phraseId: string,
): void {
  const data = readJson(
    USER_PHRASE_HISTORY_FILE,
    {} as Record<string, string[]>,
  );
  const key = String(userId);
  if (!data[key]) data[key] = [];
  if (!data[key].includes(phraseId)) data[key].push(phraseId);
  writeJson(USER_PHRASE_HISTORY_FILE, data);
}

export function resetUserPhraseHistory(userId: string | number): void {
  const data = readJson(
    USER_PHRASE_HISTORY_FILE,
    {} as Record<string, string[]>,
  );
  delete data[String(userId)];
  writeJson(USER_PHRASE_HISTORY_FILE, data);
}
