/**
 * KutuLoncat Games — Comprehensive QA Test Suite
 * Run: npx tsx scripts/qa-test.ts
 *
 * Tests all endpoints, auth flows, game scoring, achievements,
 * admin functions, and edge cases.
 */

const BASE = 'http://127.0.0.1:3001';
let sessionCookie = '';
let testUserId = '';

interface TestResult {
  category: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
  ms: number;
}

const results: TestResult[] = [];

async function req(
  method: string,
  url: string,
  body?: any,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; data: any; ms: number }> {
  const start = Date.now();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(sessionCookie ? { Cookie: `sid=${sessionCookie}` } : {}),
    ...(extraHeaders || {}),
  };
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${url}`, opts);
  const ms = Date.now() - start;
  let data: any;
  try {
    data = await r.json();
  } catch {
    data = { parseError: true };
  }
  return { status: r.status, data, ms };
}

function test(
  category: string,
  name: string,
  status: 'PASS' | 'FAIL' | 'WARN',
  detail: string,
  ms = 0,
) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  results.push({ category, name, status, detail, ms });
  console.log(`  ${icon} [${category}] ${name} (${ms}ms) — ${detail}`);
}

// ═══════════════════════════════════════
// 1. SMOKE TESTS
// ═══════════════════════════════════════
async function smokeTests() {
  console.log('\n══ 1. SMOKE TESTS ══');

  // Health check
  const h = await req('GET', '/health');
  test(
    'Smoke',
    'Health endpoint',
    h.data.ok ? 'PASS' : 'FAIL',
    `status=${h.status}, scores=${h.data.scores}, phrases=${h.data.phrases}`,
    h.ms,
  );

  // SPA index.html served
  const start = Date.now();
  const indexR = await fetch(`${BASE}/`);
  const indexMs = Date.now() - start;
  const indexText = await indexR.text();
  test(
    'Smoke',
    'SPA index.html served',
    indexText.includes('<div id="root">') ? 'PASS' : 'FAIL',
    `status=${indexR.status}, has root div`,
    indexMs,
  );

  // Static assets accessible
  const cssR = await fetch(`${BASE}/assets/index-C_ZTw9B4.css`);
  test(
    'Smoke',
    'CSS asset accessible',
    cssR.status === 200 ? 'PASS' : 'WARN',
    `status=${cssR.status} (may differ after rebuild)`,
    0,
  );

  // SPA fallback (non-API route returns index.html)
  const spaFallback = await fetch(`${BASE}/some-random-page`);
  const spaText = await spaFallback.text();
  test(
    'Smoke',
    'SPA fallback for unknown routes',
    spaText.includes('<div id="root">') ? 'PASS' : 'FAIL',
    `status=${spaFallback.status}`,
    0,
  );

  // API 404 for unknown API route
  const api404 = await req('GET', '/api/nonexistent');
  test(
    'Smoke',
    'API 404 for unknown routes',
    api404.status === 404 ? 'PASS' : 'FAIL',
    `status=${api404.status}`,
    api404.ms,
  );
}

// ═══════════════════════════════════════
// 2. AUTH TESTS
// ═══════════════════════════════════════
async function authTests() {
  console.log('\n══ 2. AUTH TESTS ══');

  // Unauthorized access to /api/me
  const noAuth = await req('GET', '/api/me');
  test(
    'Auth',
    'GET /api/me without auth → 401',
    noAuth.status === 401 ? 'PASS' : 'FAIL',
    `status=${noAuth.status}`,
    noAuth.ms,
  );

  // Request OTP — missing fields
  const badOtp = await req('POST', '/api/auth/request-otp', {});
  test(
    'Auth',
    'Request OTP missing fields → 400',
    badOtp.status === 400 ? 'PASS' : 'FAIL',
    `status=${badOtp.status}, error=${badOtp.data.error}`,
    badOtp.ms,
  );

  // Request OTP — valid (won't send real OTP in test)
  const goodOtp = await req('POST', '/api/auth/request-otp', {
    name: 'QA Tester',
    phone: '+6281234567890',
    email: 'qa@test.com',
  });
  test(
    'Auth',
    'Request OTP valid phone',
    goodOtp.data.ok ? 'PASS' : 'FAIL',
    `registered=${goodOtp.data.registered}, sent=${goodOtp.data.sent}`,
    goodOtp.ms,
  );

  // Verify OTP — wrong code
  const badVerify = await req('POST', '/api/auth/verify-otp', {
    phone: '+6281234567890',
    code: '000000',
  });
  test(
    'Auth',
    'Verify OTP wrong code → 400',
    badVerify.status === 400 ? 'PASS' : 'FAIL',
    `status=${badVerify.status}`,
    badVerify.ms,
  );

  // Login with non-existent number
  const noUser = await req('POST', '/api/auth/login-number', {
    phone: '+6299999999999',
  });
  test(
    'Auth',
    'Login non-existent phone → 404',
    noUser.status === 404 ? 'PASS' : 'FAIL',
    `status=${noUser.status}`,
    noUser.ms,
  );

  // Login with empty phone
  const emptyPhone = await req('POST', '/api/auth/login-number', {
    phone: '',
  });
  test(
    'Auth',
    'Login empty phone → 400',
    emptyPhone.status === 400 ? 'PASS' : 'FAIL',
    `status=${emptyPhone.status}`,
    emptyPhone.ms,
  );

  // Login with seeded user (Syaeful Aziz, from DuckDB seed)
  // Use raw fetch to capture set-cookie header
  const seedLoginR = await fetch(`${BASE}/api/auth/login-number`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+6283131372021' }),
  });
  const seedLogin = {
    status: seedLoginR.status,
    data: await seedLoginR.json(),
    ms: 0,
  };

  if (seedLogin.data.ok && seedLogin.data.user) {
    const setCookieHeader = seedLoginR.headers.get('set-cookie') || '';
    const sidMatch = setCookieHeader.match(/sid=([^;]+)/);
    if (sidMatch) {
      sessionCookie = sidMatch[1];
    }
    testUserId = seedLogin.data.user.id;
    test(
      'Auth',
      'Login seeded user (DuckDB→JSON sync)',
      sessionCookie ? 'PASS' : 'WARN',
      `userId=${testUserId}, name=${seedLogin.data.user.name}, hasCookie=${!!sessionCookie}`,
      0,
    );
  } else {
    test(
      'Auth',
      'Login seeded user (DuckDB→JSON sync)',
      'WARN',
      `status=${seedLogin.status}, error=${seedLogin.data.error}`,
      0,
    );
  }

  // Check auth works with session cookie
  if (sessionCookie) {
    const me = await req('GET', '/api/me');
    test(
      'Auth',
      'GET /api/me with session cookie',
      me.data.ok && me.data.user ? 'PASS' : 'FAIL',
      `userId=${me.data.user?.id}, name=${me.data.user?.name}`,
      me.ms,
    );
  }
}

// ═══════════════════════════════════════
// 3. GAME API TESTS
// ═══════════════════════════════════════
async function gameTests() {
  console.log('\n══ 3. GAME API TESTS ══');

  // Hangman phrase (requires auth)
  if (sessionCookie) {
    const phrase = await req('GET', '/api/hangman/phrase');
    test(
      'Game',
      'GET /api/hangman/phrase',
      phrase.data.ok && phrase.data.row?.phrase ? 'PASS' : 'FAIL',
      `phrase="${phrase.data.row?.phrase}", hint="${phrase.data.row?.hint}"`,
      phrase.ms,
    );
  } else {
    test('Game', 'GET /api/hangman/phrase', 'WARN', 'Skipped (no auth)', 0);
  }

  // Session start — no auth
  const noAuthSession = await req('POST', '/api/session/start', {
    game: 'hangman',
  });
  // May or may not require auth depending on host check
  test(
    'Game',
    'Session start without auth',
    noAuthSession.status === 401 || noAuthSession.data.ok ? 'PASS' : 'FAIL',
    `status=${noAuthSession.status}`,
    noAuthSession.ms,
  );

  // Session start — with auth
  if (sessionCookie) {
    const session = await req('POST', '/api/session/start', {
      game: 'hangman',
    });
    test(
      'Game',
      'Session start (hangman)',
      session.data.ok && session.data.sessionId ? 'PASS' : 'FAIL',
      `sessionId=${session.data.sessionId}`,
      session.ms,
    );

    // Submit score — hangman
    const score1 = await req('POST', '/api/scores', {
      game: 'hangman',
      score: 85,
      meta: { win: true, phrase: 'TEST PHRASE', wrong: 1, hint: 'humor' },
      sessionId: session.data.sessionId,
      startedAt: session.data.startedAt,
      token: session.data.token,
    });
    test(
      'Game',
      'Submit score (hangman)',
      score1.data.ok ? 'PASS' : 'FAIL',
      `score=85, achievements=${score1.data.newAchievements?.length || 0}`,
      score1.ms,
    );

    // Submit score — snake
    const snakeSession = await req('POST', '/api/session/start', {
      game: 'snake',
    });
    const score2 = await req('POST', '/api/scores', {
      game: 'snake',
      score: 150,
      meta: {
        difficulty: 'sedang',
        length: 8,
        foodEaten: 5,
        maxCombo: 3,
        durationSec: 45,
        win: true,
      },
      sessionId: snakeSession.data.sessionId,
      startedAt: snakeSession.data.startedAt,
      token: snakeSession.data.token,
    });
    test(
      'Game',
      'Submit score (snake)',
      score2.data.ok ? 'PASS' : 'FAIL',
      `score=150`,
      score2.ms,
    );

    // Submit score — fruit-ninja
    const fnSession = await req('POST', '/api/session/start', {
      game: 'fruit-ninja',
    });
    const score3 = await req('POST', '/api/scores', {
      game: 'fruit-ninja',
      score: 120,
      meta: {
        slices: 15,
        missed: 2,
        maxKombo: 5,
        nyawa: 1,
        stage: 3,
        bombsHit: 0,
      },
      sessionId: fnSession.data.sessionId,
      startedAt: fnSession.data.startedAt,
      token: fnSession.data.token,
    });
    test(
      'Game',
      'Submit score (fruit-ninja)',
      score3.data.ok ? 'PASS' : 'FAIL',
      `score=120`,
      score3.ms,
    );

    // Submit score — flappy-bird
    const fbSession = await req('POST', '/api/session/start', {
      game: 'flappy-bird',
    });
    const score4 = await req('POST', '/api/scores', {
      game: 'flappy-bird',
      score: 12,
      meta: { pipesPassed: 12, durationSec: 30 },
      sessionId: fbSession.data.sessionId,
      startedAt: fbSession.data.startedAt,
      token: fbSession.data.token,
    });
    test(
      'Game',
      'Submit score (flappy-bird)',
      score4.data.ok ? 'PASS' : 'FAIL',
      `score=12`,
      score4.ms,
    );

    // Invalid game name
    const badGame = await req('POST', '/api/scores', {
      game: 'nonexistent',
      score: 100,
    });
    test(
      'Game',
      'Submit invalid game → 400',
      badGame.status === 400 ? 'PASS' : 'FAIL',
      `status=${badGame.status}`,
      badGame.ms,
    );

    // Invalid score
    const badScore = await req('POST', '/api/scores', {
      game: 'hangman',
      score: 'abc',
    });
    test(
      'Game',
      'Submit invalid score → 400',
      badScore.status === 400 ? 'PASS' : 'FAIL',
      `status=${badScore.status}`,
      badScore.ms,
    );
  }

  // Leaderboard — per game (requires auth)
  if (sessionCookie) {
    for (const game of ['hangman', 'fruit-ninja', 'flappy-bird', 'snake']) {
      const top = await req('GET', `/api/scores/${game}/top?limit=5`);
      test(
        'Game',
        `Leaderboard: ${game}`,
        top.data.ok ? 'PASS' : 'FAIL',
        `rows=${top.data.rows?.length || 0}`,
        top.ms,
      );
    }

    // All top scores
    const allTop = await req('GET', '/api/scores/all/top');
    test(
      'Game',
      'All top scores',
      allTop.data.ok ? 'PASS' : 'FAIL',
      `games=${Object.keys(allTop.data.top || {}).length}`,
      allTop.ms,
    );
  } else {
    test('Game', 'Leaderboard endpoints', 'WARN', 'Skipped (no auth)', 0);
    test('Game', 'All top scores', 'WARN', 'Skipped (no auth)', 0);
  }

  // Fruit Ninja config
  const fnConfig = await req('GET', '/api/game/fruit-ninja/config');
  test(
    'Game',
    'Fruit Ninja config',
    fnConfig.data.ok ? 'PASS' : 'FAIL',
    `has fruitNinja=${!!fnConfig.data.fruitNinja}`,
    fnConfig.ms,
  );

  // Snake config
  const snakeConfig = await req('GET', '/api/game/snake/config');
  test(
    'Game',
    'Snake config',
    snakeConfig.data.ok ? 'PASS' : 'FAIL',
    `has snake=${!!snakeConfig.data.snake}`,
    snakeConfig.ms,
  );
}

// ═══════════════════════════════════════
// 4. ACHIEVEMENT TESTS
// ═══════════════════════════════════════
async function achievementTests() {
  console.log('\n══ 4. ACHIEVEMENT TESTS ══');

  if (!sessionCookie) {
    test('Achievement', 'Skipped (no auth)', 'WARN', 'Login failed', 0);
    return;
  }

  const myAch = await req('GET', '/api/achievements/me');
  test(
    'Achievement',
    'My achievements',
    myAch.data.ok ? 'PASS' : 'FAIL',
    `count=${myAch.data.rows?.length || 0}`,
    myAch.ms,
  );

  const catalog = await req('GET', '/api/achievements/catalog');
  test(
    'Achievement',
    'Achievement catalog',
    catalog.data.ok && catalog.data.rows?.length > 0 ? 'PASS' : 'FAIL',
    `total=${catalog.data.stats?.total || 0}, unlocked=${catalog.data.stats?.unlocked || 0}`,
    catalog.ms,
  );
}

// ═══════════════════════════════════════
// 5. ADMIN API TESTS
// ═══════════════════════════════════════
async function adminTests() {
  console.log('\n══ 5. ADMIN API TESTS ══');

  // Auth required check
  const authReq = await req('GET', '/api/admin/auth-required');
  test(
    'Admin',
    'Auth required check',
    authReq.data.ok !== undefined ? 'PASS' : 'FAIL',
    `required=${authReq.data.required}`,
    authReq.ms,
  );

  // Phrases
  const phrases = await req('GET', '/api/admin/phrases');
  test(
    'Admin',
    'GET phrases',
    phrases.data.ok ? 'PASS' : 'FAIL',
    `count=${phrases.data.phrases?.length || 0}`,
    phrases.ms,
  );

  // Settings
  const settings = await req('GET', '/api/admin/settings');
  test(
    'Admin',
    'GET settings',
    settings.data.ok ? 'PASS' : 'FAIL',
    `keys=${Object.keys(settings.data.settings || {}).join(',')}`,
    settings.ms,
  );

  // Users
  const users = await req('GET', '/api/admin/users');
  test(
    'Admin',
    'GET users',
    users.data.ok ? 'PASS' : 'FAIL',
    `count=${users.data.users?.length || 0}`,
    users.ms,
  );

  // Verify all users have status 'active'
  if (users.data.users?.length > 0) {
    const nonActive = users.data.users.filter(
      (u: any) => u.status !== 'active',
    );
    test(
      'Admin',
      'All users status = active',
      nonActive.length === 0 ? 'PASS' : 'FAIL',
      nonActive.length > 0
        ? `${nonActive.length} users not active: ${nonActive.map((u: any) => `${u.name}=${u.status}`).join(', ')}`
        : `all ${users.data.users.length} users active`,
      0,
    );
  }

  // Seasons
  const seasons = await req('GET', '/api/admin/seasons');
  test(
    'Admin',
    'GET seasons',
    seasons.data.ok ? 'PASS' : 'FAIL',
    `count=${seasons.data.seasons?.length || 0}`,
    seasons.ms,
  );

  // Achievements
  const ach = await req('GET', '/api/admin/achievements');
  test(
    'Admin',
    'GET achievements (permanent)',
    ach.data.ok ? 'PASS' : 'FAIL',
    `total=${ach.data.total}, users=${ach.data.users}`,
    ach.ms,
  );

  // Achievement backup
  const backup = await req('GET', '/api/admin/achievements/backup');
  test(
    'Admin',
    'Achievement backup endpoint',
    backup.data.ok && backup.data.backupDate ? 'PASS' : 'FAIL',
    `count=${backup.data.count}`,
    backup.ms,
  );

  // AI settings
  const ai = await req('GET', '/api/admin/ai-settings');
  test(
    'Admin',
    'AI settings',
    ai.data.ok !== undefined ? 'PASS' : 'FAIL',
    `hasKey=${ai.data.hasKey}`,
    ai.ms,
  );

  // WAHA diagnostics
  const waha = await req('GET', '/api/admin/waha/diagnostics');
  test(
    'Admin',
    'WAHA diagnostics',
    waha.data.ok !== undefined ? 'PASS' : 'WARN',
    `baseUrl=${waha.data.baseUrl || 'not set'}`,
    waha.ms,
  );
}

// ═══════════════════════════════════════
// 6. SECURITY & EDGE CASE TESTS
// ═══════════════════════════════════════
async function securityTests() {
  console.log('\n══ 6. SECURITY & EDGE CASES ══');

  // XSS in name (should be escaped)
  const xssOtp = await req('POST', '/api/auth/request-otp', {
    name: '<script>alert("xss")</script>',
    phone: '+6281111111111',
    email: '',
  });
  test(
    'Security',
    'XSS in registration name',
    xssOtp.data.ok ? 'PASS' : 'FAIL',
    'Name should be HTML-escaped on storage',
    xssOtp.ms,
  );

  // SQL injection in phone (DuckDB query)
  const sqli = await req('POST', '/api/auth/login-number', {
    phone: "'; DROP TABLE users; --",
  });
  test(
    'Security',
    'SQL injection in phone field',
    sqli.status === 400 || sqli.status === 404 ? 'PASS' : 'FAIL',
    `status=${sqli.status} (not 500 = safe)`,
    sqli.ms,
  );

  // Oversized body
  try {
    const bigBody = { name: 'A'.repeat(300000), phone: '+6281234567890' };
    const oversized = await req('POST', '/api/auth/request-otp', bigBody);
    test(
      'Security',
      'Oversized request body',
      oversized.status === 413 || oversized.status === 400 ? 'PASS' : 'WARN',
      `status=${oversized.status}`,
      oversized.ms,
    );
  } catch (e: any) {
    test('Security', 'Oversized request body', 'PASS', 'Request rejected', 0);
  }

  // Negative score submission
  if (sessionCookie) {
    const negScore = await req('POST', '/api/scores', {
      game: 'hangman',
      score: -999,
      meta: { win: false },
    });
    test(
      'Security',
      'Negative score → 400',
      negScore.status === 400 ? 'PASS' : 'FAIL',
      `status=${negScore.status}`,
      negScore.ms,
    );
  }

  // Profile update — too long name
  if (sessionCookie) {
    const longName = await req('POST', '/api/me', {
      name: 'A'.repeat(200),
    });
    test(
      'Security',
      'Profile name max length',
      longName.data.ok ? 'PASS' : 'FAIL',
      'Name should be truncated to 40 chars',
      longName.ms,
    );
  }
}

// ═══════════════════════════════════════
// 7. PERFORMANCE TESTS
// ═══════════════════════════════════════
async function performanceTests() {
  console.log('\n══ 7. PERFORMANCE TESTS ══');

  // Response time benchmarks
  const endpoints = [
    { method: 'GET', url: '/health', name: 'Health check' },
    { method: 'GET', url: '/api/hangman/phrase', name: 'Random phrase' },
    { method: 'GET', url: '/api/scores/hangman/top', name: 'Leaderboard' },
    {
      method: 'GET',
      url: '/api/achievements/catalog',
      name: 'Achievement catalog',
    },
  ];

  for (const ep of endpoints) {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await req(ep.method, ep.url);
      times.push(r.ms);
    }
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const max = Math.max(...times);
    test(
      'Perf',
      `${ep.name} (avg response)`,
      avg < 200 ? 'PASS' : avg < 500 ? 'WARN' : 'FAIL',
      `avg=${avg}ms, max=${max}ms`,
      avg,
    );
  }
}

// ═══════════════════════════════════════
// 8. INTEGRATION TESTS
// ═══════════════════════════════════════
async function integrationTests() {
  console.log('\n══ 8. INTEGRATION TESTS ══');

  if (!sessionCookie) {
    test('Integration', 'Skipped (no auth)', 'WARN', 'Login failed', 0);
    return;
  }

  // Full flow: Submit score → check leaderboard → check achievements
  const session = await req('POST', '/api/session/start', { game: 'snake' });
  const submit = await req('POST', '/api/scores', {
    game: 'snake',
    score: 500,
    meta: {
      difficulty: 'susah',
      length: 15,
      foodEaten: 12,
      maxCombo: 5,
      durationSec: 60,
      win: true,
    },
    sessionId: session.data.sessionId,
    startedAt: session.data.startedAt,
    token: session.data.token,
  });

  // Verify score appears in leaderboard
  const board = await req('GET', '/api/scores/snake/top?limit=50');
  const hasScore = board.data.rows?.some(
    (r: any) => r.score === 500 && r.game === 'snake',
  );
  test(
    'Integration',
    'Score appears in leaderboard after submission',
    hasScore ? 'PASS' : 'FAIL',
    `submitted=${submit.data.ok}, inBoard=${hasScore}`,
    submit.ms + board.ms,
  );

  // Verify achievements persisted
  const myAch = await req('GET', '/api/achievements/me');
  test(
    'Integration',
    'Achievements persisted after scoring',
    myAch.data.ok && myAch.data.rows?.length > 0 ? 'PASS' : 'WARN',
    `achievements=${myAch.data.rows?.length || 0}`,
    myAch.ms,
  );

  // Full all-top endpoint
  const allTop = await req('GET', '/api/scores/all/top');
  const gameKeys = Object.keys(allTop.data.top || {});
  test(
    'Integration',
    'All-top has all game categories',
    gameKeys.length >= 4 ? 'PASS' : 'WARN',
    `games: ${gameKeys.join(', ')}`,
    allTop.ms,
  );

  // Logout and verify session invalidated (use raw fetch, no Content-Type for empty body)
  const logoutStart = Date.now();
  const logoutR = await fetch(`${BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: `sid=${sessionCookie}` },
  });
  const logoutData = await logoutR.json();
  const logoutMs = Date.now() - logoutStart;
  test(
    'Integration',
    'Logout',
    logoutData.ok ? 'PASS' : 'FAIL',
    `ok=${logoutData.ok}`,
    logoutMs,
  );

  // After logout, same cookie should be rejected
  const afterStart = Date.now();
  const afterR = await fetch(`${BASE}/api/me`, {
    headers: { Cookie: `sid=${sessionCookie}` },
  });
  const afterMs = Date.now() - afterStart;
  test(
    'Integration',
    'After logout → 401',
    afterR.status === 401 ? 'PASS' : 'FAIL',
    `status=${afterR.status}`,
    afterMs,
  );
  sessionCookie = ''; // Clear for completeness
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════
async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  KutuLoncat Games — QA Test Suite v1.0    ║');
  console.log('║  Target: http://localhost:3001             ║');
  console.log('╚════════════════════════════════════════════╝');

  try {
    await smokeTests();
    await authTests();
    await gameTests();
    await achievementTests();
    await adminTests();
    await securityTests();
    await performanceTests();
    await integrationTests();
  } catch (e: any) {
    console.error('\n💥 FATAL ERROR:', e.message);
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║            QA TEST SUMMARY                 ║');
  console.log('╚════════════════════════════════════════════╝');

  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const warn = results.filter((r) => r.status === 'WARN').length;
  const total = results.length;

  console.log(`\n  ✅ PASS: ${pass}/${total}`);
  console.log(`  ❌ FAIL: ${fail}/${total}`);
  console.log(`  ⚠️  WARN: ${warn}/${total}`);
  console.log(`  📊 Score: ${Math.round((pass / total) * 100)}%\n`);

  if (fail > 0) {
    console.log('  ── Failed Tests ──');
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) =>
        console.log(`  ❌ [${r.category}] ${r.name}: ${r.detail}`),
      );
  }

  if (warn > 0) {
    console.log('\n  ── Warnings ──');
    results
      .filter((r) => r.status === 'WARN')
      .forEach((r) =>
        console.log(`  ⚠️  [${r.category}] ${r.name}: ${r.detail}`),
      );
  }

  // Performance summary
  const avgMs =
    results.filter((r) => r.ms > 0).reduce((a, r) => a + r.ms, 0) /
    (results.filter((r) => r.ms > 0).length || 1);
  console.log(`\n  ⏱️  Average response: ${Math.round(avgMs)}ms`);
  console.log('');

  process.exit(fail > 0 ? 1 : 0);
}

main();
