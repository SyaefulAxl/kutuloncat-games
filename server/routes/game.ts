import type { FastifyInstance } from 'fastify';
import {
  readJson,
  writeJson,
  nowIso,
  escapeHtml,
  maskName,
  ensurePhrasesSeed,
  pick,
  getUserPhraseHistory,
  addUserPhraseHistory,
  resetUserPhraseHistory,
  SCORE_FILE,
  PHRASE_FILE,
  SETTINGS_FILE,
  ACH_FILE,
  REFERRAL_FILE,
  USERS_FILE,
  HINTS,
  ALLOWED_GAMES,
} from '../lib/storage.js';
import { requireAuthApi, signSession, validateAntiCheat } from '../lib/auth.js';

/* ── Win check helper ── */
function isWin(scoreRow: any): boolean {
  if (scoreRow.game === 'hangman') return scoreRow.meta?.win === true;
  if (scoreRow.game === 'fruit-ninja') return Number(scoreRow.score) >= 50;
  if (scoreRow.game === 'flappy-bird') return Number(scoreRow.score) >= 10;
  if (scoreRow.game === 'snake') return scoreRow.meta?.win === true;
  return false;
}

export async function gameRoutes(fastify: FastifyInstance) {
  /* ── Start game session ── */
  fastify.post('/api/session/start', async (request, reply) => {
    const user = requireAuthApi(request, reply);
    if (!user) return;
    const body = request.body as any;
    const game = String(body?.game || '');
    if (!ALLOWED_GAMES.includes(game as any))
      return reply.code(400).send({ ok: false, error: 'invalid game' });

    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    const token = signSession({ sessionId, userId: user.id, game, startedAt });
    return { ok: true, sessionId, game, startedAt, token };
  });

  /* ── Submit score ── */
  fastify.post('/api/scores', async (request, reply) => {
    const user = requireAuthApi(request, reply);
    if (!user) return;
    const body = request.body as any;
    const { game, score, meta = {} } = body || {};
    if (!ALLOWED_GAMES.includes(game))
      return reply.code(400).send({ ok: false, error: 'invalid game' });
    const nScore = Number(score);
    if (!Number.isFinite(nScore) || nScore < 0)
      return reply.code(400).send({ ok: false, error: 'invalid score' });

    const check = validateAntiCheat(body, user.id);
    const db = readJson(SCORE_FILE, { scores: [] as any[] });
    const safeScore = Math.round(nScore);
    const row = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      game,
      playerName: user.name,
      userId: user.id,
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

    /* ── Achievement logic ── */
    const ach = readJson(ACH_FILE, { achievements: [] as any[] });
    const userScores = db.scores.filter((s: any) => s.userId === user.id);
    const totalScore = userScores.reduce(
      (a: number, b: any) => a + Number(b.score || 0),
      0,
    );
    const playedGames = new Set(userScores.map((s: any) => s.game));

    const pushAch = (code: string, title: string, rarity = 'common') => {
      if (
        !ach.achievements.find(
          (a: any) => a.userId === user.id && a.code === code,
        )
      ) {
        ach.achievements.push({
          id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          userId: user.id,
          playerName: user.name,
          game,
          code,
          title,
          rarity,
          createdAt: nowIso(),
        });
      }
    };

    if (userScores.length >= 1)
      pushAch('first-play', 'Mainkan game pertamamu', 'common');
    if (game === 'hangman' && safeScore >= 100)
      pushAch(
        'hangman-100',
        'Raih skor 100+ di Tebak Cellimat Pashang',
        'uncommon',
      );
    if (game === 'fruit-ninja' && safeScore >= 100)
      pushAch('ninja-100', 'Raih skor 100+ di Potong Bhuahaya', 'uncommon');
    if (game === 'fruit-ninja' && safeScore >= 200)
      pushAch('ninja-200', 'Legenda Ninja 200+', 'rare');
    if (
      playedGames.has('hangman') &&
      playedGames.has('fruit-ninja') &&
      playedGames.has('flappy-bird') &&
      playedGames.has('snake')
    )
      pushAch('all-games', 'Mainkan semua game tersedia', 'uncommon');
    if (Number(user.loginCount || 0) >= 7)
      pushAch('login-week', 'Login 7 hari', 'rare');
    if (totalScore >= 500) pushAch('score-500', 'Total skor 500+', 'epic');
    if (userScores.length >= 50)
      pushAch('veteran-50', 'Mainkan total 50 game', 'legendary');

    const recentScores = userScores
      .sort((a: any, b: any) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      )
      .slice(0, 5);
    if (recentScores.length >= 5 && recentScores.every((s: any) => isWin(s))) {
      pushAch('streak-5', 'Menang 5 game berturut-turut', 'epic');
    }

    /* ── Negative / quirky achievements ── */
    // Night owl — playing between 00:00 - 04:59
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 5)
      pushAch('night-owl', '🦉 Hantu Malam — Main jam 12-5 pagi', 'rare');

    // Early bird — playing between 05:00 - 06:59
    if (hour >= 5 && hour < 7)
      pushAch('early-bird', '🐤 Early Bird — Main subuh-subuh', 'uncommon');

    // Lunch gamer — playing between 12:00 - 13:00
    if (hour >= 12 && hour < 13)
      pushAch(
        'lunch-gamer',
        '🍱 Gamer Makan Siang — Main pas istirahat',
        'common',
      );

    // Loser streak — lose 5+ times in a row (recent 5 all losses)
    const recentForLoss = userScores
      .sort((a: any, b: any) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      )
      .slice(0, 5);
    if (
      recentForLoss.length >= 5 &&
      recentForLoss.every((s: any) => !isWin(s))
    ) {
      pushAch(
        'loser-streak',
        '💀 Kalah Terus — Kalah 5x berturut-turut',
        'rare',
      );
    }

    // First bomb — hit a bomb in Fruit Ninja (score includes bomb penalty or meta.bombsHit)
    if (game === 'fruit-ninja' && Number(meta?.bombsHit || 0) >= 1)
      pushAch('first-bomb', '💣 Kena Bom! — Pertama kali kena bom', 'common');

    // Bomb collector — hit 10+ bombs total
    const totalBombs = userScores
      .filter((s: any) => s.game === 'fruit-ninja')
      .reduce((a: number, b: any) => a + Number(b.meta?.bombsHit || 0), 0);
    if (totalBombs >= 10)
      pushAch(
        'bomb-collector',
        '🧨 Kolektor Bom — Kena 10 bom total',
        'uncommon',
      );

    // Speed demon — complete hangman in under 30 seconds
    if (
      game === 'hangman' &&
      meta?.win &&
      Number(meta?.durationSec || 999) < 30
    )
      pushAch(
        'speed-demon',
        '⚡ Speed Demon — Tebak Cellimat Pashang < 30 detik',
        'rare',
      );

    // Slowpoke — play a game lasting over 5 minutes
    if (Number(meta?.durationSec || 0) > 300)
      pushAch(
        'slowpoke',
        '🐌 Slowpoke — Satu game lebih dari 5 menit',
        'uncommon',
      );

    // Zero hero — score exactly 0
    if (safeScore === 0)
      pushAch('zero-hero', '🤡 Zero Hero — Skor 0, tetap hero', 'rare');

    // Marathon gamer — play 10+ games in one day
    const today = new Date().toISOString().slice(0, 10);
    const todayGames = userScores.filter(
      (s: any) => String(s.createdAt || '').slice(0, 10) === today,
    );
    if (todayGames.length >= 10)
      pushAch('marathon', '🏃 Marathon Gamer — 10 game dalam sehari', 'rare');

    // Perfectionist — hangman win with no wrong guesses
    if (
      game === 'hangman' &&
      meta?.win &&
      Number(meta?.wrongGuesses ?? meta?.wrong ?? 99) === 0
    )
      pushAch(
        'perfectionist',
        '✨ Perfectionist — Tebak Cellimat Pashang tanpa salah',
        'epic',
      );

    // Hangman combo master — maxCombo >= 5 in hangman
    if (game === 'hangman' && meta?.win && Number(meta?.maxCombo || 0) >= 5)
      pushAch(
        'hangman-combo',
        '🔥 Kombo Master — Kombo 5+ di Tebak Cellimat Pashang',
        'rare',
      );

    // Fruit frenzy — slice 50+ fruits in one Potong Bhuahaya game
    if (game === 'fruit-ninja' && Number(meta?.fruitsSliced || 0) >= 50)
      pushAch(
        'fruit-frenzy',
        '🍉 Fruit Frenzy — Iris 50+ buah dalam 1 game',
        'rare',
      );

    // Comeback king — win after losing 3 in a row
    const last4 = userScores
      .sort((a: any, b: any) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      )
      .slice(0, 4);
    if (
      last4.length >= 4 &&
      isWin(last4[0]) &&
      !isWin(last4[1]) &&
      !isWin(last4[2]) &&
      !isWin(last4[3])
    ) {
      pushAch(
        'comeback-king',
        '👑 Comeback King — Menang setelah 3x kalah',
        'epic',
      );
    }

    // Weekend warrior — play on Saturday or Sunday
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6)
      pushAch(
        'weekend-warrior',
        '🎯 Weekend Warrior — Main di hari libur',
        'common',
      );

    // Score 1000 — total score reaches 1000
    if (totalScore >= 1000)
      pushAch(
        'score-1000',
        '🏆 Grandmaster 1000 — Total skor 1000+',
        'legendary',
      );

    // Hangman master — win 10 hangman games
    const hangmanWins = userScores.filter(
      (s: any) => s.game === 'hangman' && s.meta?.win === true,
    ).length;
    if (hangmanWins >= 10)
      pushAch(
        'hangman-master',
        '🔤 Ahli Kata — Menang 10x Tebak Cellimat Pashang',
        'rare',
      );

    // Ninja addict — play 20+ Potong Bhuahaya games
    const ninjaPlays = userScores.filter(
      (s: any) => s.game === 'fruit-ninja',
    ).length;
    if (ninjaPlays >= 20)
      pushAch(
        'ninja-addict',
        '🍊 Ketagihan Potong — 20x main Potong Bhuahaya',
        'uncommon',
      );

    // ── NEW ACHIEVEMENTS (27-31) ──

    // Kombo master — achieve 10+ combo in Potong Bhuahaya
    if (game === 'fruit-ninja' && Number(meta?.maxKombo || 0) >= 10)
      pushAch(
        'kombo-master',
        '🔥 Kombo Master — Kombo 10+ di Potong Bhuahaya',
        'epic',
      );

    // No bombs — play for 3+ minutes without hitting any bomb
    if (
      game === 'fruit-ninja' &&
      Number(meta?.bombsHit || 0) === 0 &&
      Number(meta?.durationSec || 0) >= 180
    )
      pushAch('bomb-dodger', '🛡️ Bomb Dodger — 3 menit tanpa kena bom', 'rare');

    // Hangman speedrun — win hangman in under 15 seconds
    if (
      game === 'hangman' &&
      meta?.win &&
      Number(meta?.durationSec || 999) < 15
    )
      pushAch(
        'speedrun-hangman',
        '🚀 Speedrun — Tebak Cellimat Pashang < 15 detik',
        'epic',
      );

    // Centurion — play 100 total games
    if (userScores.length >= 100)
      pushAch(
        'centurion',
        '💯 Centurion — Mainkan 100 game total',
        'legendary',
      );

    // Triple threat — score 50+ in three different sessions on same day
    const todayHigh = todayGames.filter(
      (s: any) => Number(s.score || 0) >= 50,
    ).length;
    if (todayHigh >= 3)
      pushAch(
        'triple-threat',
        '🎯 Triple Threat — 3x skor 50+ dalam sehari',
        'rare',
      );

    // ── SNAKE ACHIEVEMENTS ──

    // Snake first play
    if (game === 'snake')
      pushAch(
        'snake-first',
        '🐍 Ular Pertama — Main Anomali Ulariyan pertama kali',
        'common',
      );

    // Snake score 100+
    if (game === 'snake' && safeScore >= 100)
      pushAch(
        'snake-100',
        '🐍 Ular Gesit — Skor 100+ di Anomali Ulariyan',
        'uncommon',
      );

    // Snake score 500+
    if (game === 'snake' && safeScore >= 500)
      pushAch(
        'snake-500',
        '🐍 Raja Ular — Skor 500+ di Anomali Ulariyan',
        'epic',
      );

    // Snake gak ngotak difficulty
    if (game === 'snake' && meta?.difficulty === 'gak-ngotak')
      pushAch(
        'snake-insane',
        '💀 Gak Ngotak — Main Anomali Ulariyan level tersulit',
        'rare',
      );

    // Snake gak ngotak + score 200
    if (
      game === 'snake' &&
      meta?.difficulty === 'gak-ngotak' &&
      safeScore >= 200
    )
      pushAch(
        'snake-god',
        '👑 Snake God — Skor 200+ di Gak Ngotak',
        'legendary',
      );

    // Snake long snake — length 20+
    if (game === 'snake' && Number(meta?.length || 0) >= 20)
      pushAch('long-snake', '📏 Ular Panjang — Panjang ular 20+', 'uncommon');

    // Snake combo master — max combo 5+
    if (game === 'snake' && Number(meta?.maxCombo || 0) >= 5)
      pushAch(
        'snake-combo',
        '🔥 Snake Combo — Kombo 5+ di Anomali Ulariyan',
        'rare',
      );

    // ── FLAPPY BIRD ACHIEVEMENTS ──
    if (game === 'flappy-bird')
      pushAch('flappy-first', '🐦 Burung Pertama — Main Piyik Mabur', 'common');
    if (game === 'flappy-bird' && safeScore >= 10)
      pushAch(
        'flappy-10',
        '🐦 Terbang Rendah — Skor 10+ Piyik Mabur',
        'uncommon',
      );
    if (game === 'flappy-bird' && safeScore >= 50)
      pushAch('flappy-50', '🐦 Pilot Handal — Skor 50+ Piyik Mabur', 'rare');
    if (game === 'flappy-bird' && safeScore >= 100)
      pushAch('flappy-100', '🐦 Ace Pilot — Skor 100+ Piyik Mabur', 'epic');
    if (game === 'flappy-bird' && safeScore >= 200)
      pushAch(
        'flappy-master',
        '🐦 Bird God — Skor 200+ Piyik Mabur',
        'legendary',
      );
    const flappyPlays = userScores.filter(
      (s: any) => s.game === 'flappy-bird',
    ).length;
    if (flappyPlays >= 20)
      pushAch(
        'flappy-addict',
        '🐦 Ketagihan Terbang — 20x Piyik Mabur',
        'uncommon',
      );

    // ── MORE SNAKE ACHIEVEMENTS ──
    const snakePlays = userScores.filter((s: any) => s.game === 'snake').length;
    if (snakePlays >= 20)
      pushAch(
        'snake-addict',
        '🐍 Pecandu Ular — 20x main Anomali Ulariyan',
        'uncommon',
      );
    if (
      game === 'snake' &&
      safeScore >= 50 &&
      Number(meta?.durationSec || 999) < 30
    )
      pushAch('snake-fast', '🐍 Ular Kilat — Skor 50+ dalam 30 detik', 'rare');
    if (game === 'snake' && Number(meta?.length || 0) >= 30)
      pushAch('snake-long-30', '🐍 Anaconda — Panjang ular 30+', 'rare');
    if (game === 'snake' && Number(meta?.maxCombo || 0) >= 10)
      pushAch(
        'snake-combo-10',
        '🐍 Kombo Dewa — Kombo 10+ di Anomali Ulariyan',
        'epic',
      );
    if (
      game === 'snake' &&
      meta?.difficulty === 'gak-ngotak' &&
      safeScore >= 300
    )
      pushAch(
        'snake-insane-win',
        '🐍 Ular Legendaris — 300+ di Gak Ngotak',
        'legendary',
      );
    if (game === 'snake' && Number(meta?.durationSec || 999) < 3)
      pushAch(
        'instant-death',
        '💀 Instan Mati — Mati < 3 detik di Snake',
        'uncommon',
      );

    // Snake death-reason achievements
    if (game === 'snake' && meta?.deathReason === 'wall')
      pushAch(
        'wall-smasher',
        '🧱 Penabrak Dinding — Mati nabrak dinding',
        'common',
      );
    if (game === 'snake' && meta?.deathReason === 'self')
      pushAch(
        'self-bite',
        '🐍 Gigit Sendiri — Mati gigit badan sendiri',
        'common',
      );
    if (game === 'snake' && meta?.deathReason === 'obstacle')
      pushAch(
        'obstacle-crash',
        '🪨 Nabrak Rintangan — Mati kena rintangan',
        'common',
      );

    // ── TIME-BASED QUIRKY ACHIEVEMENTS ──
    const now = new Date();
    const minute = now.getMinutes();
    if (hour === 21 && minute === 21)
      pushAch('login-2121', '🕘 21:21 — Main tepat jam 21:21', 'legendary');
    if (hour === 0 && minute === 0)
      pushAch(
        'midnight-gamer',
        '🌙 Midnight Gamer — Main tepat tengah malam',
        'epic',
      );
    if (now.getDay() === 5 && now.getDate() === 13)
      pushAch('friday-13', '🎃 Friday 13th — Main di hari sial', 'legendary');
    if (now.getMonth() === 0 && now.getDate() === 1)
      pushAch('new-year', '🎆 Tahun Baru — Main di 1 Januari', 'rare');
    if (now.getMonth() === 1 && now.getDate() === 14)
      pushAch('valentine', '💕 Valentine — Main di 14 Februari', 'rare');
    if (now.getMonth() === 3 && now.getDate() === 1)
      pushAch('april-fool', '🤪 April Mop — Main di 1 April', 'uncommon');
    if (hour === 3)
      pushAch('sahur-gamer', '🌙 Sahur Gamer — Main jam 3 pagi', 'uncommon');

    // ── CUMULATIVE / CROSS-GAME ACHIEVEMENTS ──
    if (totalScore >= 2000)
      pushAch('score-2000', '🏅 Skor 2000 — Total skor 2000+', 'legendary');
    if (totalScore >= 5000)
      pushAch('score-5000', '💎 Diamond Score — Total skor 5000+', 'legendary');
    if (userScores.length >= 200)
      pushAch('play-200', '🎮 Hardcore Gamer — 200 game total', 'legendary');

    // Diverse daily — 3+ different games in one day
    const todayGamesSet = new Set(todayGames.map((s: any) => s.game));
    if (todayGamesSet.size >= 3)
      pushAch(
        'diverse-daily',
        '🎲 Multi Gamer — 3+ game berbeda dalam sehari',
        'uncommon',
      );

    // Speedster — finish any game in < 10 seconds
    if (Number(meta?.durationSec || 999) < 10)
      pushAch('speedster', '⚡ Speedster — Game selesai < 10 detik', 'rare');

    // ── FUNNY / EXACT SCORE ACHIEVEMENTS ──
    // Rage quit — 3 consecutive games with score < 5
    const last3 = userScores
      .sort((a: any, b: any) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      )
      .slice(0, 3);
    if (last3.length >= 3 && last3.every((s: any) => Number(s.score || 0) < 5))
      pushAch('rage-quit', '😤 Rage Quit — 3 game berturut skor < 5', 'rare');

    if (safeScore === 1)
      pushAch('exact-1', '☝️ Tepat Satu — Skor tepat 1', 'epic');
    if (safeScore === 69) pushAch('nice-69', '😏 Nice — Skor tepat 69', 'rare');
    if (safeScore === 420)
      pushAch('blaze-420', '🌿 Blaze It — Skor tepat 420', 'rare');
    if (safeScore === 666)
      pushAch('devil-666', '😈 Devil Score — Skor tepat 666', 'epic');
    if (safeScore === 777)
      pushAch('lucky-777', '🎰 Jackpot! — Skor tepat 777', 'legendary');
    if (safeScore > 0 && safeScore % 100 === 0)
      pushAch('clean-100', '✅ Skor Bulat — Skor kelipatan 100', 'uncommon');

    // Night marathon — 5+ games between midnight and 5am
    const nightGames = todayGames.filter((s: any) => {
      const h = new Date(s.createdAt).getHours();
      return h >= 0 && h < 5;
    });
    if (nightGames.length >= 5)
      pushAch(
        'night-marathon',
        '🌃 Night Marathon — 5+ game jam 12-5 pagi',
        'epic',
      );

    // Loyal fan — 30+ games of a single game type
    for (const g of ALLOWED_GAMES) {
      const cnt = userScores.filter((s: any) => s.game === g).length;
      if (cnt >= 30) {
        pushAch('loyal-fan', '❤️ Loyal Fan — 30+ game di satu tipe', 'rare');
        break;
      }
    }

    writeJson(ACH_FILE, ach);

    // Check referral activation: user must play 3+ total games
    if (userScores.length >= 3) {
      const refDb = readJson(REFERRAL_FILE, { referrals: [] as any[] });
      let refChanged = false;
      for (const ref of refDb.referrals) {
        if (ref.referredUserId === user.id && ref.status !== 'active') {
          ref.status = 'active';
          ref.activatedAt = nowIso();
          refChanged = true;
        }
      }
      if (refChanged) writeJson(REFERRAL_FILE, refDb);
    }

    return { ok: true, row, antiCheat: check };
  });

  /* ── My scores (current user) ── */
  fastify.get('/api/scores/me', async (request, reply) => {
    const user = requireAuthApi(request, reply);
    if (!user) return;

    const db = readJson(SCORE_FILE, { scores: [] as any[] });
    const myScores = db.scores.filter((s: any) => s.userId === user.id);

    // Best score per game
    const bestByGame: Record<string, any> = {};
    for (const s of myScores) {
      if (
        !bestByGame[s.game] ||
        Number(s.score) > Number(bestByGame[s.game].score)
      ) {
        bestByGame[s.game] = {
          game: s.game,
          score: Number(s.score),
          createdAt: s.createdAt,
        };
      }
    }

    // Stats per game
    const statsByGame: Record<
      string,
      { game: string; plays: number; bestScore: number; totalScore: number }
    > = {};
    for (const s of myScores) {
      if (!statsByGame[s.game]) {
        statsByGame[s.game] = {
          game: s.game,
          plays: 0,
          bestScore: 0,
          totalScore: 0,
        };
      }
      statsByGame[s.game].plays++;
      statsByGame[s.game].totalScore += Number(s.score);
      if (Number(s.score) > statsByGame[s.game].bestScore)
        statsByGame[s.game].bestScore = Number(s.score);
    }

    // Recent 20 scores
    const recent = myScores
      .slice(-20)
      .reverse()
      .map((s: any) => ({
        game: s.game,
        score: Number(s.score),
        createdAt: s.createdAt,
      }));

    return {
      ok: true,
      totalPlays: myScores.length,
      gamesPlayed: Object.keys(statsByGame).length,
      stats: Object.values(statsByGame),
      bestByGame: Object.values(bestByGame),
      recent,
    };
  });

  /* ── Top scores per game ── */
  fastify.get('/api/scores/:game/top', async (request, reply) => {
    const user = requireAuthApi(request, reply);
    if (!user) return;
    const params = request.params as any;
    const query = request.query as any;
    const game = String(params.game || '');
    const limit = Math.min(100, Math.max(1, Number(query.limit || 10)));
    const db = readJson(SCORE_FILE, { scores: [] as any[] });
    const rows = db.scores
      .filter((s: any) => s.game === game)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit)
      .map((r: any) => ({
        ...r,
        playerName: escapeHtml(r.playerName || 'Guest'),
        displayName:
          r.userId === user.id
            ? escapeHtml(r.playerName)
            : escapeHtml(maskName(r.playerName)),
      }));
    return { ok: true, game, rows };
  });

  /* ── All top scores ── */
  fastify.get('/api/scores/all/top', async (request, reply) => {
    const user = requireAuthApi(request, reply);
    if (!user) return;
    const db = readJson(SCORE_FILE, { scores: [] as any[] });
    const top: Record<string, any[]> = {};
    for (const g of ALLOWED_GAMES) {
      top[g] = db.scores
        .filter((s: any) => s.game === g)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 5)
        .map((r: any) => ({
          ...r,
          playerName: escapeHtml(r.playerName || 'Guest'),
          displayName:
            r.userId === user.id
              ? escapeHtml(r.playerName)
              : escapeHtml(maskName(r.playerName)),
        }));
    }
    return { ok: true, top };
  });

  /* ── Overall leaderboard (composite scoring) ── */
  fastify.get('/api/scores/overall/top', async (request, reply) => {
    const user = requireAuthApi(request, reply);
    if (!user) return;
    const query = request.query as any;
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

    const db = readJson(SCORE_FILE, { scores: [] as any[] });
    const achDb = readJson(ACH_FILE, { achievements: [] as any[] });

    // Achievement point values (from catalog)
    const achPointMap: Record<string, number> = {
      'first-play': 10,
      'hangman-100': 25,
      'ninja-100': 25,
      'ninja-200': 60,
      'all-games': 30,
      'login-week': 40,
      'streak-5': 90,
      'score-500': 100,
      'veteran-50': 150,
      'night-owl': 35,
      'early-bird': 20,
      'lunch-gamer': 10,
      'loser-streak': 35,
      'first-bomb': 10,
      'bomb-collector': 25,
      'speed-demon': 50,
      slowpoke: 15,
      'zero-hero': 30,
      marathon: 45,
      perfectionist: 80,
      'fruit-frenzy': 50,
      'comeback-king': 70,
      'weekend-warrior': 10,
      'score-1000': 200,
      'hangman-master': 40,
      'hangman-combo': 40,
      'ninja-addict': 25,
      'kombo-master': 50,
      'bomb-dodger': 40,
      'speedrun-hangman': 50,
      centurion: 150,
      'triple-threat': 40,
      'snake-first': 10,
      'snake-100': 25,
      'snake-500': 80,
      'snake-insane': 40,
      'snake-god': 200,
      'long-snake': 20,
      'snake-combo': 40,
      'flappy-first': 10,
      'flappy-10': 25,
      'flappy-50': 50,
      'flappy-100': 80,
      'flappy-master': 200,
      'flappy-addict': 25,
      'snake-addict': 25,
      'snake-fast': 40,
      'snake-long-30': 40,
      'snake-combo-10': 80,
      'snake-insane-win': 200,
      'instant-death': 20,
      'wall-smasher': 10,
      'self-bite': 10,
      'obstacle-crash': 10,
      'login-2121': 200,
      'midnight-gamer': 80,
      'friday-13': 200,
      'new-year': 40,
      valentine: 40,
      'april-fool': 20,
      'sahur-gamer': 20,
      'score-2000': 200,
      'score-5000': 300,
      'play-200': 200,
      'diverse-daily': 20,
      speedster: 40,
      'rage-quit': 35,
      'exact-1': 80,
      'nice-69': 40,
      'blaze-420': 40,
      'devil-666': 80,
      'lucky-777': 200,
      'clean-100': 20,
      'night-marathon': 80,
      'loyal-fan': 40,
    };

    // Group scores by userId
    const scoresByUser = new Map<string, any[]>();
    for (const s of db.scores) {
      const arr = scoresByUser.get(s.userId) || [];
      arr.push(s);
      scoresByUser.set(s.userId, arr);
    }

    // Group achievements by userId
    const achByUser = new Map<string, any[]>();
    for (const a of achDb.achievements) {
      const arr = achByUser.get(a.userId) || [];
      arr.push(a);
      achByUser.set(a.userId, arr);
    }

    // Collect all unique user IDs
    const allUserIds = new Set([...scoresByUser.keys(), ...achByUser.keys()]);

    // Calculate composite score for each user
    const rankings: any[] = [];
    for (const userId of allUserIds) {
      const userScores = scoresByUser.get(userId) || [];
      const userAchs = achByUser.get(userId) || [];

      // Best score per game
      const bestScores: Record<string, number> = {};
      for (const g of ALLOWED_GAMES) {
        const gameScores = userScores
          .filter((s: any) => s.game === g)
          .map((s: any) => Number(s.score || 0));
        bestScores[g] = gameScores.length > 0 ? Math.max(...gameScores) : 0;
      }

      // Total best scores across all games
      const totalBestScore = Object.values(bestScores).reduce(
        (a, b) => a + b,
        0,
      );

      // Achievement points
      const achievementPoints = userAchs.reduce(
        (sum: number, a: any) => sum + (achPointMap[a.code] || 0),
        0,
      );

      // Games played diversity bonus (10 pts per unique game)
      const gamesPlayed = new Set(userScores.map((s: any) => s.game));
      const diversityBonus = gamesPlayed.size * 10;

      // Total play count bonus (1 pt per game played, max 100)
      const playCountBonus = Math.min(userScores.length, 100);

      // Composite score formula
      const compositeScore =
        totalBestScore + achievementPoints + diversityBonus + playCountBonus;

      const playerName =
        userScores[0]?.playerName || userAchs[0]?.playerName || 'Unknown';

      rankings.push({
        userId,
        playerName: escapeHtml(playerName || 'Guest'),
        displayName:
          userId === user.id
            ? escapeHtml(playerName)
            : escapeHtml(maskName(playerName)),
        compositeScore,
        totalBestScore,
        achievementPoints,
        achievementCount: userAchs.length,
        gamesPlayed: gamesPlayed.size,
        totalPlays: userScores.length,
        bestScores,
      });
    }

    rankings.sort((a, b) => b.compositeScore - a.compositeScore);
    const rows = rankings.slice(0, limit);

    return { ok: true, rows };
  });

  /* ── My achievements ── */
  fastify.get('/api/achievements/me', async (request, reply) => {
    const user = requireAuthApi(request, reply);
    if (!user) return;
    const ach = readJson(ACH_FILE, { achievements: [] as any[] });
    const rows = ach.achievements
      .filter((a: any) => a.userId === user.id)
      .sort((a: any, b: any) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      );
    return { ok: true, rows };
  });

  /* ── Achievement catalog ── */
  fastify.get('/api/achievements/catalog', async (request, reply) => {
    const user = requireAuthApi(request, reply);
    if (!user) return;

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
      // New quirky / negative achievements
      {
        code: 'night-owl',
        title: '🦉 Hantu Malam — Main jam 12-5 pagi',
        rarity: 'rare',
        points: 35,
        game: 'all',
      },
      {
        code: 'early-bird',
        title: '🐤 Early Bird — Main subuh-subuh',
        rarity: 'uncommon',
        points: 20,
        game: 'all',
      },
      {
        code: 'lunch-gamer',
        title: '🍱 Gamer Makan Siang — Main pas istirahat',
        rarity: 'common',
        points: 10,
        game: 'all',
      },
      {
        code: 'loser-streak',
        title: '💀 Kalah Terus — Kalah 5x berturut-turut',
        rarity: 'rare',
        points: 35,
        game: 'all',
      },
      {
        code: 'first-bomb',
        title: '💣 Kena Bom! — Pertama kali kena bom',
        rarity: 'common',
        points: 10,
        game: 'fruit-ninja',
      },
      {
        code: 'bomb-collector',
        title: '🧨 Kolektor Bom — Kena 10 bom total',
        rarity: 'uncommon',
        points: 25,
        game: 'fruit-ninja',
      },
      {
        code: 'speed-demon',
        title: '⚡ Speed Demon — Tebak Cellimat Pashang < 30 detik',
        rarity: 'rare',
        points: 50,
        game: 'hangman',
      },
      {
        code: 'slowpoke',
        title: '🐌 Slowpoke — Satu game lebih dari 5 menit',
        rarity: 'uncommon',
        points: 15,
        game: 'all',
      },
      {
        code: 'zero-hero',
        title: '🤡 Zero Hero — Skor 0, tetap hero',
        rarity: 'rare',
        points: 30,
        game: 'all',
      },
      {
        code: 'marathon',
        title: '🏃 Marathon Gamer — 10 game dalam sehari',
        rarity: 'rare',
        points: 45,
        game: 'all',
      },
      {
        code: 'perfectionist',
        title: '✨ Perfectionist — Tebak Cellimat Pashang tanpa salah',
        rarity: 'epic',
        points: 80,
        game: 'hangman',
      },
      {
        code: 'fruit-frenzy',
        title: '🍉 Fruit Frenzy — Iris 50+ buah dalam 1 game',
        rarity: 'rare',
        points: 50,
        game: 'fruit-ninja',
      },
      {
        code: 'comeback-king',
        title: '👑 Comeback King — Menang setelah 3x kalah',
        rarity: 'epic',
        points: 70,
        game: 'all',
      },
      {
        code: 'weekend-warrior',
        title: '🎯 Weekend Warrior — Main di hari libur',
        rarity: 'common',
        points: 10,
        game: 'all',
      },
      {
        code: 'score-1000',
        title: '🏆 Grandmaster 1000 — Total skor 1000+',
        rarity: 'legendary',
        points: 200,
        game: 'all',
      },
      {
        code: 'hangman-master',
        title: '🔤 Ahli Kata — Menang 10x Tebak Cellimat Pashang',
        rarity: 'rare',
        points: 40,
        game: 'hangman',
      },
      {
        code: 'hangman-combo',
        title: '🔥 Kombo Master — Kombo 5+ di Tebak Cellimat Pashang',
        rarity: 'rare',
        points: 40,
        game: 'hangman',
      },
      {
        code: 'ninja-addict',
        title: '🍊 Ketagihan Potong — 20x main Potong Bhuahaya',
        rarity: 'uncommon',
        points: 25,
        game: 'fruit-ninja',
      },
      {
        code: 'kombo-master',
        title: '🔥 Kombo Master — Kombo 10+ di Potong Bhuahaya',
        rarity: 'epic',
        points: 50,
        game: 'fruit-ninja',
      },
      {
        code: 'bomb-dodger',
        title: '🛡️ Bomb Dodger — 3 menit tanpa kena bom',
        rarity: 'rare',
        points: 40,
        game: 'fruit-ninja',
      },
      {
        code: 'speedrun-hangman',
        title: '🚀 Speedrun — Tebak Cellimat Pashang < 15 detik',
        rarity: 'epic',
        points: 50,
        game: 'hangman',
      },
      {
        code: 'centurion',
        title: '💯 Centurion — Mainkan 100 game total',
        rarity: 'legendary',
        points: 60,
        game: 'all',
      },
      {
        code: 'triple-threat',
        title: '🎯 Triple Threat — 3x skor 50+ dalam sehari',
        rarity: 'rare',
        points: 40,
        game: 'all',
      },
      // ── Snake achievements ──
      {
        code: 'snake-first',
        title: '🐍 Ular Pertama — Main Anomali Ulariyan pertama kali',
        rarity: 'common',
        points: 10,
        game: 'snake',
      },
      {
        code: 'snake-100',
        title: '🐍 Ular Gesit — Skor 100+ di Anomali Ulariyan',
        rarity: 'uncommon',
        points: 25,
        game: 'snake',
      },
      {
        code: 'snake-500',
        title: '🐍 Raja Ular — Skor 500+ di Anomali Ulariyan',
        rarity: 'epic',
        points: 80,
        game: 'snake',
      },
      {
        code: 'snake-insane',
        title: '💀 Gak Ngotak — Main Anomali Ulariyan level tersulit',
        rarity: 'rare',
        points: 40,
        game: 'snake',
      },
      {
        code: 'snake-god',
        title: '👑 Snake God — Skor 200+ di Gak Ngotak',
        rarity: 'legendary',
        points: 150,
        game: 'snake',
      },
      {
        code: 'long-snake',
        title: '📏 Ular Panjang — Panjang ular 20+',
        rarity: 'uncommon',
        points: 25,
        game: 'snake',
      },
      {
        code: 'snake-combo',
        title: '🔥 Snake Combo — Kombo 5+ di Anomali Ulariyan',
        rarity: 'rare',
        points: 40,
        game: 'snake',
      },
      // ── Flappy Bird achievements ──
      {
        code: 'flappy-first',
        title: '🐦 Burung Pertama — Main Piyik Mabur',
        rarity: 'common',
        points: 10,
        game: 'flappy-bird',
      },
      {
        code: 'flappy-10',
        title: '🐦 Terbang Rendah — Skor 10+ Piyik Mabur',
        rarity: 'uncommon',
        points: 20,
        game: 'flappy-bird',
      },
      {
        code: 'flappy-50',
        title: '🐦 Pilot Handal — Skor 50+ Piyik Mabur',
        rarity: 'rare',
        points: 50,
        game: 'flappy-bird',
      },
      {
        code: 'flappy-100',
        title: '🐦 Ace Pilot — Skor 100+ Piyik Mabur',
        rarity: 'epic',
        points: 80,
        game: 'flappy-bird',
      },
      {
        code: 'flappy-master',
        title: '🐦 Bird God — Skor 200+ Piyik Mabur',
        rarity: 'legendary',
        points: 150,
        game: 'flappy-bird',
      },
      {
        code: 'flappy-addict',
        title: '🐦 Ketagihan Terbang — 20x Piyik Mabur',
        rarity: 'uncommon',
        points: 25,
        game: 'flappy-bird',
      },
      // ── More Snake achievements ──
      {
        code: 'snake-addict',
        title: '🐍 Pecandu Ular — 20x main Anomali Ulariyan',
        rarity: 'uncommon',
        points: 25,
        game: 'snake',
      },
      {
        code: 'snake-fast',
        title: '🐍 Ular Kilat — Skor 50+ dalam 30 detik',
        rarity: 'rare',
        points: 50,
        game: 'snake',
      },
      {
        code: 'snake-long-30',
        title: '🐍 Anaconda — Panjang ular 30+',
        rarity: 'rare',
        points: 50,
        game: 'snake',
      },
      {
        code: 'snake-combo-10',
        title: '🐍 Kombo Dewa — Kombo 10+ di Anomali Ulariyan',
        rarity: 'epic',
        points: 80,
        game: 'snake',
      },
      {
        code: 'snake-insane-win',
        title: '🐍 Ular Legendaris — 300+ di Gak Ngotak',
        rarity: 'legendary',
        points: 200,
        game: 'snake',
      },
      {
        code: 'instant-death',
        title: '💀 Instan Mati — Mati < 3 detik di Snake',
        rarity: 'uncommon',
        points: 15,
        game: 'snake',
      },
      {
        code: 'wall-smasher',
        title: '🧱 Penabrak Dinding — Mati nabrak dinding',
        rarity: 'common',
        points: 10,
        game: 'snake',
      },
      {
        code: 'self-bite',
        title: '🐍 Gigit Sendiri — Mati gigit badan sendiri',
        rarity: 'common',
        points: 10,
        game: 'snake',
      },
      {
        code: 'obstacle-crash',
        title: '🪨 Nabrak Rintangan — Mati kena rintangan',
        rarity: 'common',
        points: 10,
        game: 'snake',
      },
      // ── Time-based quirky achievements ──
      {
        code: 'login-2121',
        title: '🕘 21:21 — Main tepat jam 21:21',
        rarity: 'legendary',
        points: 200,
        game: 'all',
      },
      {
        code: 'midnight-gamer',
        title: '🌙 Midnight Gamer — Main tepat tengah malam',
        rarity: 'epic',
        points: 100,
        game: 'all',
      },
      {
        code: 'friday-13',
        title: '🎃 Friday 13th — Main di hari sial',
        rarity: 'legendary',
        points: 200,
        game: 'all',
      },
      {
        code: 'new-year',
        title: '🎆 Tahun Baru — Main di 1 Januari',
        rarity: 'rare',
        points: 50,
        game: 'all',
      },
      {
        code: 'valentine',
        title: '💕 Valentine — Main di 14 Februari',
        rarity: 'rare',
        points: 50,
        game: 'all',
      },
      {
        code: 'april-fool',
        title: '🤪 April Mop — Main di 1 April',
        rarity: 'uncommon',
        points: 25,
        game: 'all',
      },
      {
        code: 'sahur-gamer',
        title: '🌙 Sahur Gamer — Main jam 3 pagi',
        rarity: 'uncommon',
        points: 25,
        game: 'all',
      },
      // ── Cumulative / cross-game achievements ──
      {
        code: 'score-2000',
        title: '🏅 Skor 2000 — Total skor 2000+',
        rarity: 'legendary',
        points: 200,
        game: 'all',
      },
      {
        code: 'score-5000',
        title: '💎 Diamond Score — Total skor 5000+',
        rarity: 'legendary',
        points: 300,
        game: 'all',
      },
      {
        code: 'play-200',
        title: '🎮 Hardcore Gamer — 200 game total',
        rarity: 'legendary',
        points: 200,
        game: 'all',
      },
      {
        code: 'diverse-daily',
        title: '🎲 Multi Gamer — 3+ game berbeda dalam sehari',
        rarity: 'uncommon',
        points: 20,
        game: 'all',
      },
      {
        code: 'speedster',
        title: '⚡ Speedster — Game selesai < 10 detik',
        rarity: 'rare',
        points: 40,
        game: 'all',
      },
      // ── Funny / exact score achievements ──
      {
        code: 'rage-quit',
        title: '😤 Rage Quit — 3 game berturut skor < 5',
        rarity: 'rare',
        points: 35,
        game: 'all',
      },
      {
        code: 'exact-1',
        title: '☝️ Tepat Satu — Skor tepat 1',
        rarity: 'epic',
        points: 80,
        game: 'all',
      },
      {
        code: 'nice-69',
        title: '😏 Nice — Skor tepat 69',
        rarity: 'rare',
        points: 50,
        game: 'all',
      },
      {
        code: 'blaze-420',
        title: '🌿 Blaze It — Skor tepat 420',
        rarity: 'rare',
        points: 50,
        game: 'all',
      },
      {
        code: 'devil-666',
        title: '😈 Devil Score — Skor tepat 666',
        rarity: 'epic',
        points: 80,
        game: 'all',
      },
      {
        code: 'lucky-777',
        title: '🎰 Jackpot! — Skor tepat 777',
        rarity: 'legendary',
        points: 200,
        game: 'all',
      },
      {
        code: 'clean-100',
        title: '✅ Skor Bulat — Skor kelipatan 100',
        rarity: 'uncommon',
        points: 20,
        game: 'all',
      },
      {
        code: 'night-marathon',
        title: '🌃 Night Marathon — 5+ game jam 12-5 pagi',
        rarity: 'epic',
        points: 80,
        game: 'all',
      },
      {
        code: 'loyal-fan',
        title: '❤️ Loyal Fan — 30+ game di satu tipe',
        rarity: 'rare',
        points: 40,
        game: 'all',
      },
    ];

    const ach = readJson(ACH_FILE, {
      achievements: [] as any[],
    }).achievements.filter((a: any) => a.userId === user.id);
    const scores = readJson(SCORE_FILE, { scores: [] as any[] }).scores.filter(
      (s: any) => s.userId === user.id,
    );
    const totalGames = scores.length;
    const totalScore = scores.reduce(
      (a: number, b: any) => a + Number(b.score || 0),
      0,
    );
    const playedGames = new Set(scores.map((s: any) => s.game));
    const unlocked = new Set(ach.map((a: any) => a.code));

    if (totalGames > 0) unlocked.add('first-play');
    if (scores.some((s: any) => s.game === 'hangman' && Number(s.score) >= 100))
      unlocked.add('hangman-100');
    if (
      scores.some(
        (s: any) => s.game === 'fruit-ninja' && Number(s.score) >= 100,
      )
    )
      unlocked.add('ninja-100');
    if (
      scores.some(
        (s: any) => s.game === 'fruit-ninja' && Number(s.score) >= 200,
      )
    )
      unlocked.add('ninja-200');
    if (
      playedGames.has('hangman') &&
      playedGames.has('fruit-ninja') &&
      playedGames.has('flappy-bird') &&
      playedGames.has('snake')
    )
      unlocked.add('all-games');
    if (Number(user.loginCount || 0) >= 7) unlocked.add('login-week');
    if (totalScore >= 500) unlocked.add('score-500');
    if (totalGames >= 50) unlocked.add('veteran-50');

    const recentScores = scores
      .sort((a: any, b: any) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      )
      .slice(0, 5);
    if (recentScores.length >= 5 && recentScores.every((s: any) => isWin(s)))
      unlocked.add('streak-5');
    if (recentScores.length >= 5 && recentScores.every((s: any) => !isWin(s)))
      unlocked.add('loser-streak');

    // Time-based (from already-unlocked records)
    // Note: time-based unlocks are only detectable at score-submit time, so rely on ach records
    // Bomb-related
    if (
      scores.some(
        (s: any) =>
          s.game === 'fruit-ninja' && Number(s.meta?.bombsHit || 0) >= 1,
      )
    )
      unlocked.add('first-bomb');
    const catTotalBombs = scores
      .filter((s: any) => s.game === 'fruit-ninja')
      .reduce((a: number, b: any) => a + Number(b.meta?.bombsHit || 0), 0);
    if (catTotalBombs >= 10) unlocked.add('bomb-collector');

    // Speed demon, slowpoke, zero-hero
    if (
      scores.some(
        (s: any) =>
          s.game === 'hangman' &&
          s.meta?.win &&
          Number(s.meta?.durationSec || 999) < 30,
      )
    )
      unlocked.add('speed-demon');
    if (scores.some((s: any) => Number(s.meta?.durationSec || 0) > 300))
      unlocked.add('slowpoke');
    if (scores.some((s: any) => Number(s.score) === 0))
      unlocked.add('zero-hero');

    // Perfectionist
    if (
      scores.some(
        (s: any) =>
          s.game === 'hangman' &&
          s.meta?.win &&
          Number(s.meta?.wrongGuesses || 99) === 0,
      )
    )
      unlocked.add('perfectionist');

    // Fruit frenzy
    if (
      scores.some(
        (s: any) =>
          s.game === 'fruit-ninja' && Number(s.meta?.fruitsSliced || 0) >= 50,
      )
    )
      unlocked.add('fruit-frenzy');

    // Total score 1000
    if (totalScore >= 1000) unlocked.add('score-1000');

    // Hangman master — 10 wins
    const catHangmanWins = scores.filter(
      (s: any) => s.game === 'hangman' && s.meta?.win === true,
    ).length;
    if (catHangmanWins >= 10) unlocked.add('hangman-master');

    // Ninja addict — 20 plays
    const catNinjaPlays = scores.filter(
      (s: any) => s.game === 'fruit-ninja',
    ).length;
    if (catNinjaPlays >= 20) unlocked.add('ninja-addict');

    // Kombo master — 10+ combo in FN
    if (
      scores.some(
        (s: any) =>
          s.game === 'fruit-ninja' && Number(s.meta?.maxKombo || 0) >= 10,
      )
    )
      unlocked.add('kombo-master');

    // Bomb dodger — FN game with 0 bombs hit and 3+ min duration
    if (
      scores.some(
        (s: any) =>
          s.game === 'fruit-ninja' &&
          Number(s.meta?.bombsHit || 0) === 0 &&
          Number(s.meta?.durationSec || 0) >= 180,
      )
    )
      unlocked.add('bomb-dodger');

    // Speedrun hangman — win in under 15 seconds
    if (
      scores.some(
        (s: any) =>
          s.game === 'hangman' &&
          s.meta?.win &&
          Number(s.meta?.durationSec || 999) < 15,
      )
    )
      unlocked.add('speedrun-hangman');

    // Centurion — 100 games total
    if (totalGames >= 100) unlocked.add('centurion');

    // Triple threat — 3+ scores ≥ 50 on any single day
    const catDayCounts: Record<string, number> = {};
    scores.forEach((s: any) => {
      if (Number(s.score || 0) >= 50) {
        const d = String(s.createdAt || '').slice(0, 10);
        catDayCounts[d] = (catDayCounts[d] || 0) + 1;
      }
    });
    if (Object.values(catDayCounts).some((c) => c >= 3))
      unlocked.add('triple-threat');

    // Comeback king — latest win after 3 losses
    const catLast4 = scores
      .sort((a: any, b: any) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      )
      .slice(0, 4);
    if (
      catLast4.length >= 4 &&
      isWin(catLast4[0]) &&
      !isWin(catLast4[1]) &&
      !isWin(catLast4[2]) &&
      !isWin(catLast4[3])
    )
      unlocked.add('comeback-king');

    // ── Snake achievements (catalog unlock) ──
    if (scores.some((s: any) => s.game === 'snake'))
      unlocked.add('snake-first');
    if (scores.some((s: any) => s.game === 'snake' && Number(s.score) >= 100))
      unlocked.add('snake-100');
    if (scores.some((s: any) => s.game === 'snake' && Number(s.score) >= 500))
      unlocked.add('snake-500');
    if (
      scores.some(
        (s: any) => s.game === 'snake' && s.meta?.difficulty === 'gak-ngotak',
      )
    )
      unlocked.add('snake-insane');
    if (
      scores.some(
        (s: any) =>
          s.game === 'snake' &&
          s.meta?.difficulty === 'gak-ngotak' &&
          Number(s.score) >= 200,
      )
    )
      unlocked.add('snake-god');
    if (
      scores.some(
        (s: any) => s.game === 'snake' && Number(s.meta?.length || 0) >= 20,
      )
    )
      unlocked.add('long-snake');
    if (
      scores.some(
        (s: any) => s.game === 'snake' && Number(s.meta?.maxCombo || 0) >= 5,
      )
    )
      unlocked.add('snake-combo');

    // ── Flappy Bird achievements (catalog unlock) ──
    if (scores.some((s: any) => s.game === 'flappy-bird'))
      unlocked.add('flappy-first');
    if (
      scores.some((s: any) => s.game === 'flappy-bird' && Number(s.score) >= 10)
    )
      unlocked.add('flappy-10');
    if (
      scores.some((s: any) => s.game === 'flappy-bird' && Number(s.score) >= 50)
    )
      unlocked.add('flappy-50');
    if (
      scores.some(
        (s: any) => s.game === 'flappy-bird' && Number(s.score) >= 100,
      )
    )
      unlocked.add('flappy-100');
    if (
      scores.some(
        (s: any) => s.game === 'flappy-bird' && Number(s.score) >= 200,
      )
    )
      unlocked.add('flappy-master');
    const catFlappyPlays = scores.filter(
      (s: any) => s.game === 'flappy-bird',
    ).length;
    if (catFlappyPlays >= 20) unlocked.add('flappy-addict');

    // ── More Snake catalog unlocks ──
    const catSnakePlays = scores.filter((s: any) => s.game === 'snake').length;
    if (catSnakePlays >= 20) unlocked.add('snake-addict');
    if (
      scores.some(
        (s: any) =>
          s.game === 'snake' &&
          Number(s.score) >= 50 &&
          Number(s.meta?.durationSec || 999) < 30,
      )
    )
      unlocked.add('snake-fast');
    if (
      scores.some(
        (s: any) => s.game === 'snake' && Number(s.meta?.length || 0) >= 30,
      )
    )
      unlocked.add('snake-long-30');
    if (
      scores.some(
        (s: any) => s.game === 'snake' && Number(s.meta?.maxCombo || 0) >= 10,
      )
    )
      unlocked.add('snake-combo-10');
    if (
      scores.some(
        (s: any) =>
          s.game === 'snake' &&
          s.meta?.difficulty === 'gak-ngotak' &&
          Number(s.score) >= 300,
      )
    )
      unlocked.add('snake-insane-win');
    if (
      scores.some(
        (s: any) =>
          s.game === 'snake' && Number(s.meta?.durationSec || 999) < 3,
      )
    )
      unlocked.add('instant-death');

    // ── Cumulative catalog unlocks ──
    if (totalScore >= 2000) unlocked.add('score-2000');
    if (totalScore >= 5000) unlocked.add('score-5000');
    if (totalGames >= 200) unlocked.add('play-200');
    if (scores.some((s: any) => Number(s.meta?.durationSec || 999) < 10))
      unlocked.add('speedster');

    // Diverse daily
    const catDayGames: Record<string, Set<string>> = {};
    scores.forEach((s: any) => {
      const d = String(s.createdAt || '').slice(0, 10);
      if (!catDayGames[d]) catDayGames[d] = new Set();
      catDayGames[d].add(s.game);
    });
    if (Object.values(catDayGames).some((s) => s.size >= 3))
      unlocked.add('diverse-daily');

    // ── Funny score-based catalog unlocks ──
    if (scores.some((s: any) => Number(s.score) === 1)) unlocked.add('exact-1');
    if (scores.some((s: any) => Number(s.score) === 69))
      unlocked.add('nice-69');
    if (scores.some((s: any) => Number(s.score) === 420))
      unlocked.add('blaze-420');
    if (scores.some((s: any) => Number(s.score) === 666))
      unlocked.add('devil-666');
    if (scores.some((s: any) => Number(s.score) === 777))
      unlocked.add('lucky-777');
    if (
      scores.some((s: any) => {
        const sc = Number(s.score);
        return sc > 0 && sc % 100 === 0;
      })
    )
      unlocked.add('clean-100');

    // Rage quit (3 consecutive low skor)
    const catLast3 = scores
      .sort((a: any, b: any) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      )
      .slice(0, 3);
    if (
      catLast3.length >= 3 &&
      catLast3.every((s: any) => Number(s.score || 0) < 5)
    )
      unlocked.add('rage-quit');

    // Loyal fan — 30+ of one game type
    for (const g of ['hangman', 'fruit-ninja', 'flappy-bird', 'snake']) {
      if (scores.filter((s: any) => s.game === g).length >= 30) {
        unlocked.add('loyal-fan');
        break;
      }
    }

    // Time-based, night-marathon — rely on existing ach records (can only be detected at submit time)
    // login-2121, midnight-gamer, friday-13, new-year, valentine, april-fool, sahur-gamer, night-marathon are time-only

    const rows = catalog.map((c) => ({ ...c, unlocked: unlocked.has(c.code) }));
    const stats = {
      unlocked: rows.filter((r) => r.unlocked).length,
      total: rows.length,
      totalPoints: rows
        .filter((r) => r.unlocked)
        .reduce((a, b) => a + b.points, 0),
      progress: 0,
    };
    stats.progress = Math.round((stats.unlocked / stats.total) * 100);
    return { ok: true, rows, stats };
  });

  /* ── Hangman phrase (per-user unique) ── */
  fastify.get('/api/hangman/phrase', async (request, reply) => {
    const user = requireAuthApi(request, reply);
    if (!user) return;
    ensurePhrasesSeed();
    const p = readJson(PHRASE_FILE, { phrases: [] as any[] });
    const allPhrases: any[] = p.phrases || [];
    if (!allPhrases.length) {
      return { ok: true, row: { phrase: 'CIE YANG JOMBLO', hint: 'roast' } };
    }

    const seen = getUserPhraseHistory(user.id);
    let unseen = allPhrases.filter((ph: any) => !seen.includes(ph.id));

    // All phrases exhausted — try generating more via OpenAI, else reset history
    if (unseen.length === 0) {
      const expanded = await generateMorePhrases(allPhrases, 150);
      if (expanded.length > allPhrases.length) {
        const now = new Date().toISOString().slice(0, 10);
        writeJson(PHRASE_FILE, {
          date: now,
          version: p.version || 'v4-permanent-150',
          phrases: expanded,
        });
        unseen = expanded.filter((ph: any) => !seen.includes(ph.id));
      }
      // If still no unseen (OpenAI failed / no new phrases), reset user history
      if (unseen.length === 0) {
        resetUserPhraseHistory(user.id);
        unseen = allPhrases;
      }
    }

    const row = unseen[Math.floor(Math.random() * unseen.length)];
    addUserPhraseHistory(user.id, row.id);
    return { ok: true, row };
  });

  /* Helper: generate more phrases via OpenAI or fallback */
  async function generateMorePhrases(
    existing: any[],
    target: number,
  ): Promise<any[]> {
    const settings = readJson(SETTINGS_FILE, {} as any);
    const apiKey =
      settings?.ai?.openaiApiKey || process.env.OPENAI_API_KEY || '';
    const model =
      settings?.ai?.openaiModel || process.env.OPENAI_MODEL || 'o4-mini';
    if (!apiKey) return existing;

    try {
      const existingPhrases = existing.map((p: any) => p.phrase).join(', ');
      const sys =
        'Kamu penulis frase game tebak kata Indonesia. Hasilkan frase natural, lucu, roasting, galau, dark joke ringan, romantis receh, trending Indonesia. Balas JSON valid.';
      const userMsg = `Buat ${target} frase BARU bahasa Indonesia untuk game tebak kata. Aturan: 3-8 kata, UPPERCASE, TIDAK BOLEH ada duplikat. Topik: jomblo, patah hati, red flag, toxic, ghosting, burnout, gaji kecil, AI, sawit, cerai, dark jokes, healing, delulu, overthinking, hustle culture, harga naik. JANGAN ulangi frase ini: ${existingPhrases.slice(0, 2000)}. Format: {"phrases":[{"phrase":"...","hint":"roast|galau|dark|humor|romantis"}]}`;
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: userMsg },
          ],
        }),
      });
      if (!r.ok) return existing;
      const j = (await r.json()) as any;
      const txt = j?.choices?.[0]?.message?.content || '{}';
      let arr: any[] = [];
      try {
        const parsed = JSON.parse(txt);
        arr = Array.isArray(parsed)
          ? parsed
          : parsed.phrases || parsed.items || [];
      } catch {
        return existing;
      }

      const existSet = new Set(existing.map((p: any) => p.phrase));
      const baseId = Date.now();
      const newPhrases = (arr || [])
        .map((x: any, i: number) => {
          const phrase = String(x.phrase || '')
            .toUpperCase()
            .replace(/[^A-Z\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          const hint = ['roast', 'galau', 'dark', 'humor', 'romantis'].includes(
            String(x.hint || '').toLowerCase(),
          )
            ? String(x.hint).toLowerCase()
            : 'roast';
          return {
            id: `gen-${baseId}-${i}`,
            phrase,
            hint,
            source: 'openai-auto',
          };
        })
        .filter((x: any) => {
          const wc = x.phrase.split(/\s+/).filter(Boolean).length;
          return wc >= 3 && wc <= 8 && !existSet.has(x.phrase);
        });

      if (newPhrases.length >= 10) {
        return [...existing, ...newPhrases];
      }
    } catch {
      /* OpenAI failed */
    }
    return existing;
  }

  /* ── Fruit Ninja config (public) ── */
  fastify.get('/api/game/fruit-ninja/config', async () => {
    const s = readJson(SETTINGS_FILE, {} as any);
    return { ok: true, fruitNinja: s.fruitNinja || {} };
  });

  /* ── Snake config (public) ── */
  fastify.get('/api/game/snake/config', async () => {
    const s = readJson(SETTINGS_FILE, {} as any);
    return { ok: true, snake: s.snake || {} };
  });
}
