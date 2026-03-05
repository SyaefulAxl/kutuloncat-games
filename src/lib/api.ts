const BASE = '';

async function request<T = unknown>(
  url: string,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  return res.json() as Promise<T>;
}

export const api = {
  get: <T = unknown>(url: string) => request<T>(url),
  post: <T = unknown>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: JSON.stringify(body) }),
};

// ---- Auth ----
export async function checkAuth() {
  return api.get<{ ok: boolean; user?: User }>('/api/me');
}
export async function requestOtp(name: string, phone: string, email = '') {
  return api.post<{ ok: boolean; sent?: boolean; registered?: boolean }>(
    '/api/auth/request-otp',
    { name, phone, email },
  );
}
export async function verifyOtp(phone: string, code: string) {
  return api.post<{ ok: boolean; user?: User }>('/api/auth/verify-otp', {
    phone,
    code,
  });
}
export async function loginNumber(phone: string) {
  return api.post<{ ok: boolean; user?: User; error?: string }>(
    '/api/auth/login-number',
    { phone },
  );
}
export async function logout() {
  return api.post('/api/auth/logout');
}

// ---- Profile ----
export async function updateProfile(data: {
  name?: string;
  photoUrl?: string;
}) {
  return api.post<{ ok: boolean; user?: User }>('/api/me', data);
}
export async function uploadPhoto(photoData: string) {
  return api.post<{ ok: boolean; photoUrl?: string }>('/api/me/photo', {
    photoData,
  });
}

// ---- Game ----
export async function startSession(game: string) {
  return api.post<{
    ok: boolean;
    sessionId?: string;
    startedAt?: number;
    token?: string;
  }>('/api/session/start', { game });
}
export async function submitScore(data: {
  game: string;
  score: number;
  meta?: Record<string, unknown>;
  sessionId?: string;
  startedAt?: number;
  token?: string;
}) {
  return api.post('/api/scores', data);
}
export async function getTopScores(game: string, limit = 10) {
  return api.get<{ ok: boolean; rows: ScoreRow[] }>(
    `/api/scores/${game}/top?limit=${limit}`,
  );
}
export async function getAllTopScores() {
  return api.get<{ ok: boolean; top: Record<string, ScoreRow[]> }>(
    '/api/scores/all/top',
  );
}

// ---- Hangman ----
export async function getHangmanPhrase() {
  return api.get<{ ok: boolean; row: { phrase: string; hint: string } }>(
    '/api/hangman/phrase',
  );
}

// ---- Achievements ----
export async function getMyAchievements() {
  return api.get<{ ok: boolean; rows: Achievement[] }>('/api/achievements/me');
}
export async function getAchievementCatalog() {
  return api.get<{
    ok: boolean;
    rows: AchievementCatalogItem[];
    stats: {
      unlocked: number;
      total: number;
      totalPoints: number;
      progress: number;
    };
  }>('/api/achievements/catalog');
}

// ---- Fruit Ninja Config ----
export async function getFruitNinjaConfig() {
  return api.get<{ ok: boolean; fruitNinja: FruitNinjaConfig }>(
    '/api/game/fruit-ninja/config',
  );
}

// ---- Types ----
export interface User {
  id: string;
  name: string;
  phone: string;
  email: string;
  photoUrl: string;
  loginCount: number;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface ScoreRow {
  id: string;
  game: string;
  playerName: string;
  displayName?: string;
  userId: string;
  score: number;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface Achievement {
  id: string;
  userId: string;
  code: string;
  title: string;
  rarity: string;
  game: string;
  createdAt: string;
}

export interface AchievementCatalogItem {
  code: string;
  title: string;
  rarity: string;
  points: number;
  game: string;
  unlocked: boolean;
}

export interface FruitNinjaConfig {
  stageSeconds: number[];
  maxByStage: number[];
  gapByStage: number[];
  burstMin: number[];
  burstMax: number[];
  weirdChance: number[];
  bombBase: number[];
  safeBombDistance: number;
}
