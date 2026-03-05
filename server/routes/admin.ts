import type { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import {
  readJson,
  writeJson,
  normalizePhone,
  escapeHtml,
  syncPlayerName,
  SETTINGS_FILE,
  PHRASE_FILE,
  SCORE_FILE,
  ACH_FILE,
  USERS_FILE,
  SESSIONS_FILE,
  REFERRAL_FILE,
  OTP_FILE,
  UPLOADS_DIR,
  HINTS,
  pick,
} from '../lib/storage.js';
import { requireAdmin, getWahaConfig } from '../lib/auth.js';
import {
  dbUpsertPhrases,
  dbGetAllPhrases,
  dbSaveScoreSeason,
  dbGetSeasons,
  dbGetSeasonDetail,
  dbDeleteSeason,
  dbGetAllUsers,
  dbGetUser,
  dbUpdateUser,
  dbDeleteUser,
} from '../lib/db.js';

export async function adminRoutes(fastify: FastifyInstance) {
  /* ── Auth required check ── */
  fastify.get('/api/admin/auth-required', async () => {
    return { ok: true, required: !!process.env.ADMIN_PASSWORD };
  });

  /* ── AI settings ── */
  fastify.get('/api/admin/ai-settings', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const s = readJson(SETTINGS_FILE, {} as any);
    return {
      ok: true,
      hasKey: !!(s?.ai?.openaiApiKey || process.env.OPENAI_API_KEY),
      openaiModel: s?.ai?.openaiModel || 'gpt-4o-mini',
    };
  });

  fastify.post('/api/admin/ai-settings', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = request.body as any;
    const cur = readJson(SETTINGS_FILE, {} as any);
    const ai = {
      openaiApiKey: String(body?.openaiApiKey || cur?.ai?.openaiApiKey || ''),
      openaiModel: String(
        body?.openaiModel || cur?.ai?.openaiModel || 'gpt-4o-mini',
      ),
    };
    writeJson(SETTINGS_FILE, { ...cur, ai });
    return { ok: true, hasKey: !!ai.openaiApiKey, openaiModel: ai.openaiModel };
  });

  /* ── Generate phrases via OpenAI ── */
  fastify.post('/api/admin/generate-phrases', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = request.body as any;
    const count = Math.min(300, Math.max(1, Number(body?.count || 100)));
    const prompt = String(
      body?.prompt || 'roast user, galau, dark joke, romantis receh',
    ).trim();
    const settings = readJson(SETTINGS_FILE, {} as any);
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
          const j = (await r.json()) as any;
          const txt = j?.choices?.[0]?.message?.content || '{}';
          let arr: any[] = [];
          try {
            const parsed = JSON.parse(txt);
            arr = Array.isArray(parsed)
              ? parsed
              : parsed.phrases || parsed.items || [];
          } catch {
            /* parse error */
          }
          const cleaned = (arr || [])
            .map((x: any, i: number) => ({
              id: `gen-${Date.now()}-${i}`,
              phrase: String(x.phrase || '')
                .toUpperCase()
                .replace(/[^A-Z\s]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim(),
              hint: HINTS.includes(String(x.hint || '').toLowerCase() as any)
                ? String(x.hint).toLowerCase()
                : 'roast',
              source: 'openai',
            }))
            .filter((x: any) => {
              const wc = x.phrase.split(/\s+/).filter(Boolean).length;
              return wc >= 3 && wc <= 8;
            })
            .slice(0, count);
          if (cleaned.length >= Math.max(10, Math.floor(count * 0.4))) {
            return {
              ok: true,
              provider: 'openai',
              prompt,
              count: cleaned.length,
              phrases: cleaned,
            };
          }
        }
      } catch {
        /* OpenAI failed — fall through */
      }
    }

    // Fallback
    const pool = [
      'KAMU JOMBLO YA',
      'SKRIPSIMU MASIH JUDUL DOANG',
      'DIA ONLINE BUKAN BUATMU',
      'HIDUPMU MODE UJI COBA',
      'BESOK KITA KETAWA LAGI',
    ];
    const fallback = Array.from({ length: count }, (_, i) => ({
      id: `gen-${Date.now()}-${i}`,
      phrase: pick(pool),
      hint: HINTS[i % HINTS.length],
      source: 'fallback',
    }));
    return {
      ok: true,
      provider: 'fallback',
      prompt,
      count: fallback.length,
      phrases: fallback,
    };
  });

  /* ── Phrases CRUD ── */
  fastify.get('/api/admin/phrases', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const p = readJson(PHRASE_FILE, {
      phrases: [] as any[],
      date: '',
      version: '',
    });
    return {
      ok: true,
      date: p.date || '',
      version: p.version || '',
      phrases: p.phrases || [],
    };
  });

  fastify.post('/api/admin/phrases', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = request.body as any;
    const rows = Array.isArray(body?.phrases) ? body.phrases : [];
    const cleaned = rows
      .map((r: any, i: number) => ({
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
      .filter((x: any) => {
        const wc = x.phrase.split(/\s+/).filter(Boolean).length;
        return wc >= 3 && wc <= 8;
      })
      .slice(0, 300);
    const now = new Date().toISOString().slice(0, 10);
    const prev = readJson(PHRASE_FILE, { version: 'admin-custom' } as any);
    writeJson(PHRASE_FILE, {
      date: now,
      version: prev.version || 'admin-custom',
      phrases: cleaned,
    });
    // Persist to DuckDB
    try {
      await dbUpsertPhrases(cleaned);
    } catch (e) {
      fastify.log.error(e, 'DuckDB phrase sync failed');
    }
    return { ok: true, count: cleaned.length };
  });

  /* ── Settings ── */
  fastify.get('/api/admin/settings', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const s = readJson(SETTINGS_FILE, {} as any);
    const safe = JSON.parse(JSON.stringify(s || {}));
    if (safe?.ai?.openaiApiKey) safe.ai.openaiApiKey = '***set***';
    if (safe?.waha?.apiKey) safe.waha.apiKey = '***set***';
    delete safe.antiCheatSecret;
    return { ok: true, settings: safe };
  });

  fastify.post('/api/admin/settings', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = request.body as any;
    const cur = readJson(SETTINGS_FILE, {} as any);

    if (body.fruitNinja && typeof body.fruitNinja === 'object') {
      cur.fruitNinja = { ...cur.fruitNinja, ...body.fruitNinja };
    }
    if (body.snake && typeof body.snake === 'object') {
      cur.snake = { ...cur.snake, ...body.snake };
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
    writeJson(SETTINGS_FILE, cur);
    return { ok: true };
  });

  /* ── WAHA diagnostics ── */
  fastify.get('/api/admin/waha/diagnostics', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { baseUrl, apiKey, session } = getWahaConfig();
    const out: any = {
      ok: true,
      baseUrl,
      hasApiKey: !!apiKey,
      session,
      checks: [],
    };

    if (!baseUrl) {
      out.checks.push({
        name: 'config',
        status: 0,
        ok: false,
        sample: 'WAHA_BASE_URL not configured',
      });
      return out;
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
        const r = await fetch(c.url, { headers: c.headers as any });
        const txt = await r.text();
        out.checks.push({
          name: c.name,
          status: r.status,
          ok: r.ok,
          sample: txt.slice(0, 180),
        });
      } catch (e: any) {
        out.checks.push({
          name: c.name,
          status: 0,
          ok: false,
          sample: String(e.message || e),
        });
      }
    }
    return out;
  });

  /* ── WAHA test send ── */
  fastify.post('/api/admin/waha/test-send', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = request.body as any;
    const phone = normalizePhone(body?.phone || '');
    if (!phone)
      return reply.code(400).send({ ok: false, error: 'phone required' });

    const { baseUrl, apiKey, session } = getWahaConfig();
    if (!baseUrl || !apiKey)
      return reply.code(400).send({ ok: false, error: 'WAHA not configured' });

    const payload = {
      session,
      chatId: `${phone.replace('+', '')}@c.us`,
      text: String(body?.text || 'Test WAHA dari Admin'),
    };
    const tries: { url: string; headers: Record<string, string> }[] = [
      { url: `${baseUrl}/api/sendText`, headers: { 'X-Api-Key': apiKey } },
      { url: `${baseUrl}/api/messages/text`, headers: { 'X-Api-Key': apiKey } },
      {
        url: `${baseUrl}/sendText`,
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    ];

    const results: any[] = [];
    for (const t of tries) {
      try {
        const r = await fetch(t.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...t.headers,
          } as Record<string, string>,
          body: JSON.stringify(payload),
        });
        const txt = await r.text();
        results.push({
          url: t.url,
          status: r.status,
          ok: r.ok,
          sample: txt.slice(0, 180),
        });
        if (r.ok) return { ok: true, via: t.url, results };
      } catch (e: any) {
        results.push({
          url: t.url,
          status: 0,
          ok: false,
          sample: String(e.message || e),
        });
      }
    }
    return reply
      .code(502)
      .send({ ok: false, error: 'all endpoints failed', results });
  });

  /* ══════════════════════════════════════
     Achievement Management (permanent)
     ══════════════════════════════════════ */

  /** Backup achievements — download as JSON */
  fastify.get('/api/admin/achievements/backup', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const achievements = readJson(ACH_FILE, { achievements: [] as any[] });
    reply.header(
      'Content-Disposition',
      `attachment; filename="achievements-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    return {
      ok: true,
      backupDate: new Date().toISOString(),
      count: (achievements.achievements || []).length,
      achievements: achievements.achievements || [],
    };
  });

  /** Restore achievements from backup JSON */
  fastify.post('/api/admin/achievements/restore', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = request.body as any;
    const incoming = Array.isArray(body?.achievements) ? body.achievements : [];
    if (incoming.length === 0) {
      return reply
        .code(400)
        .send({ ok: false, error: 'No achievements in payload' });
    }

    // Merge: keep existing + add missing from backup (by unique key: userId+code)
    const current = readJson(ACH_FILE, { achievements: [] as any[] });
    const existingKeys = new Set(
      (current.achievements || []).map((a: any) => `${a.userId}::${a.code}`),
    );
    let added = 0;
    for (const a of incoming) {
      const key = `${a.userId}::${a.code}`;
      if (!existingKeys.has(key)) {
        current.achievements.push(a);
        existingKeys.add(key);
        added++;
      }
    }
    writeJson(ACH_FILE, current);
    return {
      ok: true,
      message: `Restored ${added} new achievements (${current.achievements.length} total)`,
      total: current.achievements.length,
      added,
    };
  });

  /** Get all achievements summary */
  fastify.get('/api/admin/achievements', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const data = readJson(ACH_FILE, { achievements: [] as any[] });
    const achievements = data.achievements || [];
    // Group by user
    const byUser: Record<string, any[]> = {};
    for (const a of achievements) {
      const key = a.userId || 'unknown';
      if (!byUser[key]) byUser[key] = [];
      byUser[key].push(a);
    }
    return {
      ok: true,
      total: achievements.length,
      users: Object.keys(byUser).length,
      achievements,
    };
  });

  /* ══════════════════════════════════════
     Score Season Management
     ══════════════════════════════════════ */

  /** List all saved seasons */
  fastify.get('/api/admin/seasons', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    try {
      const seasons = await dbGetSeasons();
      return { ok: true, seasons };
    } catch (e: any) {
      return { ok: true, seasons: [] };
    }
  });

  /** Get season detail */
  fastify.get('/api/admin/seasons/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as any;
    try {
      const detail = await dbGetSeasonDetail(Number(id));
      if (!detail)
        return reply.code(404).send({ ok: false, error: 'not found' });
      return {
        ok: true,
        name: detail.name,
        created_at: detail.created_at,
        scores: JSON.parse(detail.scores_json),
        achievements: JSON.parse(detail.achievements_json),
      };
    } catch (e: any) {
      return reply.code(500).send({ ok: false, error: String(e.message) });
    }
  });

  /** Delete a season */
  fastify.delete('/api/admin/seasons/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as any;
    try {
      const deleted = await dbDeleteSeason(Number(id));
      if (!deleted)
        return reply.code(404).send({ ok: false, error: 'Season not found' });
      return { ok: true, message: 'Season deleted' };
    } catch (e: any) {
      return reply.code(500).send({ ok: false, error: String(e.message) });
    }
  });

  /** Clear scores only (achievements are permanent — never cleared) */
  fastify.post('/api/admin/scores/clear', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    writeJson(SCORE_FILE, { scores: [] });
    return { ok: true, message: 'Scores cleared (achievements preserved)' };
  });

  /** Save as season + clear */
  fastify.post('/api/admin/scores/save-season', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = request.body as any;
    const name = String(
      body?.name || `Season ${new Date().toLocaleDateString('id-ID')}`,
    );

    const scores = readJson(SCORE_FILE, { scores: [] as any[] });
    const achievements = readJson(ACH_FILE, { achievements: [] as any[] });

    if (!scores.scores?.length) {
      return reply.code(400).send({ ok: false, error: 'No scores to save' });
    }

    try {
      const seasonId = await dbSaveScoreSeason(
        name,
        JSON.stringify(scores.scores),
        JSON.stringify(achievements.achievements),
      );

      // Clear current scores only — achievements are permanent
      writeJson(SCORE_FILE, { scores: [] });

      return {
        ok: true,
        seasonId,
        name,
        savedScores: scores.scores.length,
        savedAchievements: achievements.achievements.length,
      };
    } catch (e: any) {
      return reply.code(500).send({ ok: false, error: String(e.message) });
    }
  });

  /* ══════════════════════════════════════
     User Management
     ══════════════════════════════════════ */

  /** List all users */
  fastify.get('/api/admin/users', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    try {
      const users = await dbGetAllUsers();
      return { ok: true, users };
    } catch (e: any) {
      return { ok: true, users: [] };
    }
  });

  /** Get user detail */
  fastify.get('/api/admin/users/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as any;
    try {
      const user = await dbGetUser(Number(id));
      if (!user)
        return reply.code(404).send({ ok: false, error: 'User not found' });
      return { ok: true, user };
    } catch (e: any) {
      return reply.code(500).send({ ok: false, error: String(e.message) });
    }
  });

  /** Update user */
  fastify.put('/api/admin/users/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as any;
    const body = request.body as any;
    try {
      const updated = await dbUpdateUser(Number(id), {
        name: body?.name,
        phone: body?.phone,
        email: body?.email,
        language: body?.language,
        status: body?.status,
      });
      if (!updated)
        return reply.code(400).send({ ok: false, error: 'Nothing to update' });

      // Get updated user from DuckDB to find matching JSON user
      const dbUser = await dbGetUser(Number(id));
      if (dbUser) {
        const udb = readJson(USERS_FILE, { users: [] as any[] });
        const jsonUser = udb.users.find(
          (u: any) => u.phone === dbUser.phone,
        );

        if (jsonUser) {
          let jsonChanged = false;

          // Sync name to JSON user + leaderboard + achievements
          if (body?.name) {
            const safeName = escapeHtml(String(body.name).slice(0, 40));
            jsonUser.name = safeName;
            jsonChanged = true;
            syncPlayerName(jsonUser.id, safeName);
          }

          // Sync status to JSON user
          if (body?.status) {
            jsonUser.status = body.status;
            jsonChanged = true;
          }

          if (jsonChanged) writeJson(USERS_FILE, udb);

          // If blocking, invalidate all sessions (force logout)
          if (body?.status === 'blocked') {
            const sdb = readJson(SESSIONS_FILE, { sessions: [] as any[] });
            const before = sdb.sessions.length;
            sdb.sessions = sdb.sessions.filter(
              (s: any) => s.userId !== jsonUser.id,
            );
            if (sdb.sessions.length !== before) {
              writeJson(SESSIONS_FILE, sdb);
            }
          }
        }
      }

      return { ok: true, message: 'User updated' };
    } catch (e: any) {
      return reply.code(500).send({ ok: false, error: String(e.message) });
    }
  });

  /** Delete user — full cleanup across DuckDB, JSON users, sessions, referrals, scores, achievements */
  fastify.delete('/api/admin/users/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as any;
    try {
      // 1) Get user info from DuckDB before deleting (need phone to find JSON user)
      const dbUser = await dbGetUser(Number(id));
      if (!dbUser)
        return reply.code(404).send({ ok: false, error: 'User not found' });

      // 2) Delete from DuckDB
      await dbDeleteUser(Number(id));

      // 3) Find and remove from users.json (match by phone)
      const udb = readJson(USERS_FILE, { users: [] as any[] });
      const jsonUser = udb.users.find((u: any) => u.phone === dbUser.phone);
      const jsonUserId = jsonUser?.id;

      if (jsonUser) {
        udb.users = udb.users.filter((u: any) => u.id !== jsonUserId);
        writeJson(USERS_FILE, udb);
      }

      // 4) Remove all sessions for this user (force immediate logout)
      if (jsonUserId) {
        const sdb = readJson(SESSIONS_FILE, { sessions: [] as any[] });
        const beforeCount = sdb.sessions.length;
        sdb.sessions = sdb.sessions.filter(
          (s: any) => s.userId !== jsonUserId,
        );
        if (sdb.sessions.length !== beforeCount) {
          writeJson(SESSIONS_FILE, sdb);
        }
      }

      // 5) Clean up referrals — both directions
      if (jsonUserId) {
        const refDb = readJson(REFERRAL_FILE, { referrals: [] as any[] });
        const beforeLen = refDb.referrals.length;

        // Also clear referredBy on users this person referred
        const referredIds = refDb.referrals
          .filter((r: any) => r.referrerUserId === jsonUserId)
          .map((r: any) => r.referredUserId);
        if (referredIds.length > 0) {
          const udb2 = readJson(USERS_FILE, { users: [] as any[] });
          let uChanged = false;
          for (const u of udb2.users) {
            if (referredIds.includes(u.id) && u.referredBy) {
              u.referredBy = '';
              uChanged = true;
            }
          }
          if (uChanged) writeJson(USERS_FILE, udb2);
        }

        // Remove all referral records involving this user
        refDb.referrals = refDb.referrals.filter(
          (r: any) =>
            r.referredUserId !== jsonUserId &&
            r.referrerUserId !== jsonUserId,
        );

        if (refDb.referrals.length !== beforeLen) {
          writeJson(REFERRAL_FILE, refDb);
        }
      }

      // 6) Remove all scores completely (gone from leaderboard)
      if (jsonUserId) {
        const scoreDb = readJson(SCORE_FILE, { scores: [] as any[] });
        const beforeLen = scoreDb.scores.length;
        scoreDb.scores = scoreDb.scores.filter(
          (s: any) => s.userId !== jsonUserId,
        );
        if (scoreDb.scores.length !== beforeLen) {
          writeJson(SCORE_FILE, scoreDb);
        }
      }

      // 7) Remove all achievements completely
      if (jsonUserId) {
        const achDb = readJson(ACH_FILE, { achievements: [] as any[] });
        const beforeLen = achDb.achievements.length;
        achDb.achievements = achDb.achievements.filter(
          (a: any) => a.userId !== jsonUserId,
        );
        if (achDb.achievements.length !== beforeLen) {
          writeJson(ACH_FILE, achDb);
        }
      }

      // 8) Remove OTP entries for this phone
      const odb = readJson(OTP_FILE, { otps: [] as any[] });
      const otpBefore = odb.otps.length;
      odb.otps = odb.otps.filter((o: any) => o.phone !== dbUser.phone);
      if (odb.otps.length !== otpBefore) writeJson(OTP_FILE, odb);

      // 9) Delete uploaded photos
      if (jsonUserId) {
        try {
          const files = fs.readdirSync(UPLOADS_DIR);
          for (const f of files) {
            if (f.startsWith(`u-${jsonUserId}-`)) {
              fs.unlinkSync(path.join(UPLOADS_DIR, f));
            }
          }
        } catch {
          /* ignore upload cleanup errors */
        }
      }

      return {
        ok: true,
        message: `User ${dbUser.name} fully deleted (DB + JSON + sessions + referrals + scores + achievements cleaned)`,
      };
    } catch (e: any) {
      return reply.code(500).send({ ok: false, error: String(e.message) });
    }
  });

  /** Resend OTP to user (via WAHA) */
  fastify.post('/api/admin/users/:id/resend-otp', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as any;
    try {
      const user = await dbGetUser(Number(id));
      if (!user)
        return reply.code(404).send({ ok: false, error: 'User not found' });
      if (!user.phone)
        return reply.code(400).send({ ok: false, error: 'No phone number' });

      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const { baseUrl, apiKey, session } = getWahaConfig();
      if (!baseUrl || !apiKey) {
        return reply
          .code(400)
          .send({ ok: false, error: 'WAHA not configured' });
      }

      const chatId = `${user.phone.replace('+', '')}@c.us`;
      const text = `🔐 *KutuLoncat Games*\n\nKode OTP kamu: *${otp}*\nBerlaku 5 menit.\n\nJangan bagikan ke siapapun!`;
      const payload = { session, chatId, text };

      const endpoints = [
        { url: `${baseUrl}/api/sendText`, headers: { 'X-Api-Key': apiKey } },
        {
          url: `${baseUrl}/api/messages/text`,
          headers: { 'X-Api-Key': apiKey },
        },
      ];

      for (const ep of endpoints) {
        try {
          const r = await fetch(ep.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...ep.headers,
            } as Record<string, string>,
            body: JSON.stringify(payload),
          });
          if (r.ok) {
            // Save OTP
            const otpData = readJson(
              path.join(path.dirname(SCORE_FILE), 'otp.json'),
              { otps: [] as any[] },
            );
            otpData.otps.push({
              userId: user.id,
              phone: user.phone,
              otp,
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
            });
            writeJson(path.join(path.dirname(SCORE_FILE), 'otp.json'), otpData);
            return { ok: true, message: `OTP sent to ${user.phone}` };
          }
        } catch {
          /* try next */
        }
      }
      return reply
        .code(502)
        .send({ ok: false, error: 'Failed to send OTP via WAHA' });
    } catch (e: any) {
      return reply.code(500).send({ ok: false, error: String(e.message) });
    }
  });
}
