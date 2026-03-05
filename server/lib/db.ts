/**
 * DuckDB wrapper — hardened for production use.
 * • Lazy singleton connection with auto-recovery
 * • All BigInts normalised to Number before returning
 * • Transactions for multi-statement writes
 * • Graceful close on SIGTERM / SIGINT
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const duckdb = require('duckdb');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/* Use TEMP dir for DuckDB when inside OneDrive to avoid file-lock conflicts */
const _isOneDrive = DATA_DIR.toLowerCase().includes('onedrive');
const DB_DIR = _isOneDrive
  ? path.join(process.env.TEMP || DATA_DIR, 'kutuloncat-duckdb')
  : DATA_DIR;
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, 'kutuloncat.duckdb');

/* Ensure data dir exists */
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let _db: any = null;
let _conn: any = null;
let _ready: Promise<void> | null = null;
let _closed = false;
let _usingMemory = false;

/* ── Connection management ── */

function _tryOpen(dbPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const db = new duckdb.Database(dbPath, {}, (err: any) => {
        if (err) {
          /* Try to close the failed handle to release file locks */
          try {
            db.close(() => {});
          } catch {}
          return reject(err);
        }
        try {
          _db = db;
          _conn = db.connect();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

function openDb(): Promise<void> {
  if (_closed) return Promise.reject(new Error('DB closed'));
  if (_ready) return _ready;
  _ready = (async () => {
    /* Try persistent file first (with retry) */
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        /* Clean up stale WAL / lock / tmp files before every attempt.
         * On process crash (kill -9, power loss) these files remain and
         * block the next open.  Safe to remove before opening. */
        for (const ext of ['.wal', '.tmp']) {
          try {
            fs.unlinkSync(DB_PATH + ext);
          } catch {}
        }
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
        await _tryOpen(DB_PATH);
        console.log(`[DuckDB] Connected to ${DB_PATH}`);
        return;
      } catch (err: any) {
        console.error(
          `[DuckDB] Attempt ${attempt + 1} failed: ${err.message?.split('\n')[0]}`,
        );
      }
    }
    /* Fallback: in-memory mode */
    console.warn(
      '[DuckDB] File locked — using in-memory database (data not persisted to DuckDB)',
    );
    _usingMemory = true;
    await _tryOpen(':memory:');
  })().catch((e) => {
    _ready = null;
    throw e;
  });
  return _ready;
}

function resetConnection() {
  _conn = null;
  _db = null;
  _ready = null;
}

export function closeDb(): Promise<void> {
  _closed = true;
  return new Promise((resolve) => {
    if (_db) {
      try {
        _db.close(() => resolve());
      } catch {
        resolve();
      }
    } else {
      resolve();
    }
    _conn = null;
    _db = null;
    _ready = null;
  });
}

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    closeDb().finally(() => process.exit(0));
  });
}

/* ── Low-level helpers ── */

function normRow(row: any): any {
  if (!row || typeof row !== 'object') return row;
  const out: any = {};
  for (const k of Object.keys(row)) {
    const v = row[k];
    out[k] = typeof v === 'bigint' ? Number(v) : v;
  }
  return out;
}

function isConnErr(err: any): boolean {
  const m = String(err?.message || '');
  /* Only reset on actual connection/IO failures, not catalog/SQL errors */
  if (
    err?.errorType === 'Catalog' ||
    err?.errorType === 'Parser' ||
    err?.errorType === 'Binder'
  ) {
    return false;
  }
  return (
    m.includes('Connection') ||
    m.includes('closed') ||
    m.includes('IO Error') ||
    (err?.code === 'DUCKDB_NODEJS_ERROR' && err?.errorType === 'IO')
  );
}

export async function dbRun(sql: string): Promise<void> {
  try {
    await openDb();
  } catch (e) {
    resetConnection();
    throw e;
  }
  return new Promise((resolve, reject) => {
    try {
      _conn.run(sql, (err: any) => {
        if (err) {
          if (isConnErr(err)) resetConnection();
          reject(err);
        } else resolve();
      });
    } catch (e) {
      resetConnection();
      reject(e);
    }
  });
}

export async function dbAll<T = any>(sql: string): Promise<T[]> {
  try {
    await openDb();
  } catch (e) {
    resetConnection();
    throw e;
  }
  return new Promise((resolve, reject) => {
    try {
      _conn.all(sql, (err: any, rows: any[]) => {
        if (err) {
          if (isConnErr(err)) resetConnection();
          reject(err);
        } else resolve((rows || []).map(normRow) as T[]);
      });
    } catch (e) {
      resetConnection();
      reject(e);
    }
  });
}

export function esc(v: string = ''): string {
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Initialize tables */
export async function initDb(): Promise<void> {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS phrases (
      id VARCHAR PRIMARY KEY,
      phrase VARCHAR NOT NULL,
      hint VARCHAR DEFAULT 'umum',
      source VARCHAR DEFAULT 'admin',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS score_seasons (
      id INTEGER PRIMARY KEY,
      name VARCHAR NOT NULL,
      scores_json TEXT NOT NULL,
      achievements_json TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE SEQUENCE IF NOT EXISTS season_id_seq START 1
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name VARCHAR NOT NULL,
      phone VARCHAR UNIQUE,
      email VARCHAR,
      language VARCHAR DEFAULT 'ID',
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR DEFAULT 'active',
      login_count INTEGER DEFAULT 0,
      referral_code VARCHAR,
      referred_by VARCHAR
    )
  `);

  await dbRun(`
    CREATE SEQUENCE IF NOT EXISTS user_id_seq START 1
  `);

  // Migrate: add referral_code column if missing
  try {
    await dbRun(`ALTER TABLE users ADD COLUMN referral_code VARCHAR`);
  } catch {
    /* column already exists */
  }
  try {
    await dbRun(`ALTER TABLE users ADD COLUMN referred_by VARCHAR`);
  } catch {
    /* column already exists */
  }

  // Migrate: standardize all user statuses to 'active'
  await dbRun(`UPDATE users SET status = 'active' WHERE status != 'active'`);
}

/* ── Phrase operations ── */

export async function dbGetAllPhrases(): Promise<
  { id: string; phrase: string; hint: string; source: string }[]
> {
  return dbAll(
    `SELECT id, phrase, hint, source FROM phrases ORDER BY created_at DESC`,
  );
}

export async function dbUpsertPhrases(
  phrases: { id: string; phrase: string; hint: string; source: string }[],
): Promise<number> {
  if (phrases.length === 0) return 0;

  // Wrap in transaction for atomicity
  await dbRun(`BEGIN TRANSACTION`);
  try {
    await dbRun(`DELETE FROM phrases`);
    for (let i = 0; i < phrases.length; i += 50) {
      const batch = phrases.slice(i, i + 50);
      const values = batch
        .map(
          (p) =>
            `(${esc(p.id)}, ${esc(p.phrase)}, ${esc(p.hint)}, ${esc(p.source)})`,
        )
        .join(',\n');
      await dbRun(
        `INSERT INTO phrases (id, phrase, hint, source) VALUES ${values}`,
      );
    }
    await dbRun(`COMMIT`);
  } catch (e) {
    try {
      await dbRun(`ROLLBACK`);
    } catch {
      /* ignore */
    }
    throw e;
  }
  return phrases.length;
}

export async function dbAddPhrase(p: {
  id: string;
  phrase: string;
  hint: string;
  source: string;
}): Promise<void> {
  await dbRun(
    `INSERT INTO phrases (id, phrase, hint, source) VALUES (${esc(p.id)}, ${esc(p.phrase)}, ${esc(p.hint)}, ${esc(p.source)})
     ON CONFLICT (id) DO UPDATE SET phrase = ${esc(p.phrase)}, hint = ${esc(p.hint)}, source = ${esc(p.source)}`,
  );
}

export async function dbDeletePhrase(id: string): Promise<void> {
  await dbRun(`DELETE FROM phrases WHERE id = ${esc(id)}`);
}

export async function dbGetPhraseCount(): Promise<number> {
  const rows = await dbAll<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM phrases`,
  );
  return Number(rows[0]?.cnt || 0);
}

export async function dbGetRandomPhrase(): Promise<{
  id: string;
  phrase: string;
  hint: string;
} | null> {
  const rows = await dbAll<{ id: string; phrase: string; hint: string }>(
    `SELECT id, phrase, hint FROM phrases ORDER BY RANDOM() LIMIT 1`,
  );
  return rows[0] || null;
}

/* ── Season operations ── */

export async function dbSaveScoreSeason(
  name: string,
  scoresJson: string,
  achievementsJson: string,
): Promise<number> {
  const rows = await dbAll<{ id: number }>(
    `SELECT nextval('season_id_seq') as id`,
  );
  const seasonId = rows[0]?.id ?? Date.now();
  await dbRun(
    `INSERT INTO score_seasons (id, name, scores_json, achievements_json) VALUES (${seasonId}, ${esc(name)}, ${esc(scoresJson)}, ${esc(achievementsJson)})`,
  );
  return seasonId;
}

export async function dbGetSeasons(): Promise<
  { id: number; name: string; created_at: string; scoreCount: number }[]
> {
  const rows = await dbAll<{
    id: number;
    name: string;
    created_at: string;
    scoreCount: number;
  }>(`
    SELECT id, name, created_at,
           json_array_length(scores_json::JSON) as "scoreCount"
    FROM score_seasons
    ORDER BY id DESC
  `);
  return rows.map((r) => ({ ...r, created_at: String(r.created_at) }));
}

export async function dbGetSeasonDetail(id: number): Promise<{
  name: string;
  created_at: string;
  scores_json: string;
  achievements_json: string;
} | null> {
  const rows = await dbAll<{
    name: string;
    created_at: string;
    scores_json: string;
    achievements_json: string;
  }>(
    `SELECT name, created_at, scores_json, achievements_json FROM score_seasons WHERE id = ${id}`,
  );
  if (!rows[0]) return null;
  return { ...rows[0], created_at: String(rows[0].created_at) };
}

export async function dbDeleteSeason(id: number): Promise<boolean> {
  const before = await dbAll<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM score_seasons WHERE id = ${id}`,
  );
  if (!before[0]?.cnt) return false;
  await dbRun(`DELETE FROM score_seasons WHERE id = ${id}`);
  return true;
}

/* ── User operations ── */

export interface DbUser {
  id: number;
  name: string;
  phone: string;
  email: string;
  language: string;
  joined_at: string;
  status: string;
  login_count: number;
  referral_code: string;
  referred_by: string;
}

export async function dbGetAllUsers(): Promise<DbUser[]> {
  return dbAll<DbUser>(
    `SELECT id, name, phone, email, language, joined_at, status, login_count, referral_code, referred_by FROM users ORDER BY id`,
  );
}

/** Find a user by phone number */
export async function dbGetUserByPhone(phone: string): Promise<DbUser | null> {
  if (!phone) return null;
  const rows = await dbAll<DbUser>(
    `SELECT id, name, phone, email, language, joined_at, status, login_count, referral_code, referred_by FROM users WHERE phone = ${esc(phone)}`,
  );
  return rows[0] || null;
}

export async function dbGetUser(id: number): Promise<DbUser | null> {
  const rows = await dbAll<DbUser>(
    `SELECT id, name, phone, email, language, joined_at, status, login_count, referral_code, referred_by FROM users WHERE id = ${id}`,
  );
  return rows[0] || null;
}

export async function dbAddUser(user: {
  name: string;
  phone: string;
  email?: string;
  language?: string;
  joined_at?: string;
  status?: string;
}): Promise<number> {
  const rows = await dbAll<{ id: number }>(
    `SELECT nextval('user_id_seq') as id`,
  );
  const userId = rows[0]?.id ?? Date.now();
  await dbRun(
    `INSERT INTO users (id, name, phone, email, language, joined_at, status)
     VALUES (${userId}, ${esc(user.name)}, ${esc(user.phone)}, ${esc(user.email || '')}, ${esc(user.language || 'ID')}, ${esc(user.joined_at || new Date().toISOString())}, ${esc(user.status || 'active')})`,
  );
  return userId;
}

export async function dbUpdateUser(
  id: number,
  data: Partial<{
    name: string;
    phone: string;
    email: string;
    language: string;
    status: string;
  }>,
): Promise<boolean> {
  const sets: string[] = [];
  if (data.name !== undefined) sets.push(`name = ${esc(data.name)}`);
  if (data.phone !== undefined) sets.push(`phone = ${esc(data.phone)}`);
  if (data.email !== undefined) sets.push(`email = ${esc(data.email)}`);
  if (data.language !== undefined)
    sets.push(`language = ${esc(data.language)}`);
  if (data.status !== undefined) sets.push(`status = ${esc(data.status)}`);
  if (sets.length === 0) return false;
  await dbRun(`UPDATE users SET ${sets.join(', ')} WHERE id = ${id}`);
  return true;
}

export async function dbDeleteUser(id: number): Promise<boolean> {
  const before = await dbAll<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM users WHERE id = ${id}`,
  );
  if (!before[0]?.cnt) return false;
  await dbRun(`DELETE FROM users WHERE id = ${id}`);
  return true;
}

export async function dbSeedUsers(
  users: {
    name: string;
    phone: string;
    email: string;
    language: string;
    joined_at: string;
    status: string;
  }[],
): Promise<number> {
  let inserted = 0;
  for (const u of users) {
    const exists = await dbAll<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM users WHERE phone = ${esc(u.phone)}`,
    );
    if (exists[0]?.cnt) continue;
    await dbAddUser(u);
    inserted++;
  }
  return inserted;
}

/**
 * Sync a single user from JSON auth to DuckDB.
 * Upserts by phone — inserts if new, updates name/email/login_count/status if existing.
 */
export async function dbSyncUserFromJson(user: {
  name: string;
  phone: string;
  email?: string;
  loginCount?: number;
  lastLoginAt?: string;
  createdAt?: string;
}): Promise<void> {
  const phone = user.phone;
  if (!phone) return;
  const existing = await dbAll<{ id: number }>(
    `SELECT id FROM users WHERE phone = ${esc(phone)}`,
  );
  if (existing.length > 0) {
    // Update existing record
    const sets: string[] = [];
    if (user.name) sets.push(`name = ${esc(user.name)}`);
    if (user.email !== undefined) sets.push(`email = ${esc(user.email)}`);
    if (typeof user.loginCount === 'number')
      sets.push(`login_count = ${user.loginCount}`);
    if (sets.length > 0) {
      await dbRun(
        `UPDATE users SET ${sets.join(', ')} WHERE id = ${existing[0].id}`,
      );
    }
  } else {
    // Insert new user
    await dbAddUser({
      name: user.name,
      phone,
      email: user.email || '',
      joined_at: user.createdAt || new Date().toISOString(),
      status: 'active',
    });
  }
}
