import type { FastifyInstance } from 'fastify';
import {
  readJson,
  writeJson,
  nowIso,
  escapeHtml,
  normalizePhone,
  generateReferralCode,
  getWelcomeMessage,
  getLoginMessage,
  syncPlayerName,
  USERS_FILE,
  OTP_FILE,
  SESSIONS_FILE,
  REFERRAL_FILE,
} from '../lib/storage.js';
import {
  createSession,
  setSessionCookie,
  clearSessionCookie,
  getEffectiveUser,
  requireAuthApi,
  sendWaha,
} from '../lib/auth.js';
import { dbSyncUserFromJson, dbGetUserByPhone } from '../lib/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

export async function authRoutes(fastify: FastifyInstance) {
  /* ── Request OTP ── */
  fastify.post('/api/auth/request-otp', async (request, reply) => {
    const body = request.body as any;
    const name = String(body?.name || '').trim();
    const phone = normalizePhone(body?.phone || '');
    const email = String(body?.email || '').trim();
    if (!name || !phone)
      return reply
        .code(400)
        .send({ ok: false, error: 'name and phone required' });

    const udb = readJson(USERS_FILE, { users: [] as any[] });
    if (udb.users.some((u: any) => u.phone === phone)) {
      return {
        ok: true,
        registered: true,
        message: 'Nomor sudah terdaftar. Gunakan login nomor.',
      };
    }

    // Also check DuckDB (admin-managed users)
    try {
      const dbUser = await dbGetUserByPhone(phone);
      if (dbUser) {
        return {
          ok: true,
          registered: true,
          message: 'Nomor sudah terdaftar. Gunakan login nomor.',
        };
      }
    } catch {
      /* ignore DuckDB errors */
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const odb = readJson(OTP_FILE, { otps: [] as any[] });
    odb.otps = odb.otps.filter((o: any) => o.phone !== phone);
    odb.otps.push({
      phone,
      name,
      email,
      code,
      referralCode: String(body?.referralCode || '').trim(),
      expiresAt: Date.now() + 60 * 60 * 1000,
      createdAt: nowIso(),
    });
    writeJson(OTP_FILE, odb);

    const sent = await sendWaha(
      phone,
      `Kode OTP KutuLoncat: ${code} (berlaku 60 menit)`,
    );
    return { ok: true, sent, registered: false, phone, otpValidMinutes: 60 };
  });

  /* ── Verify OTP ── */
  fastify.post('/api/auth/verify-otp', async (request, reply) => {
    const body = request.body as any;
    const phone = normalizePhone(body?.phone || '');
    const code = String(body?.code || '').trim();
    const odb = readJson(OTP_FILE, { otps: [] as any[] });
    const row = odb.otps.find((o: any) => o.phone === phone && o.code === code);
    if (!row) return reply.code(400).send({ ok: false, error: 'invalid otp' });
    if (Date.now() > row.expiresAt)
      return reply.code(400).send({ ok: false, error: 'otp expired' });

    const udb = readJson(USERS_FILE, { users: [] as any[] });
    let user = udb.users.find((u: any) => u.phone === phone);
    const isNewUser = !user;
    if (!user) {
      const myReferralCode = generateReferralCode();
      user = {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: escapeHtml(row.name),
        phone,
        email: row.email || '',
        photoUrl: '',
        referralCode: myReferralCode,
        referredBy: row.referralCode || '',
        createdAt: nowIso(),
        loginCount: 0,
        lastLoginAt: null,
      };
      udb.users.push(user);

      // Track referral relationship if a valid referral code was used
      if (row.referralCode) {
        const referrer = udb.users.find(
          (u: any) => u.referralCode === row.referralCode && u.id !== user!.id,
        );
        if (referrer) {
          const refDb = readJson(REFERRAL_FILE, { referrals: [] as any[] });
          refDb.referrals.push({
            id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            referrerUserId: referrer.id,
            referredUserId: user.id,
            referralCode: row.referralCode,
            status: 'inactive',
            createdAt: nowIso(),
            activatedAt: null,
          });
          writeJson(REFERRAL_FILE, refDb);
        }
      }
    }
    user.loginCount = Number(user.loginCount || 0) + 1;
    user.lastLoginAt = nowIso();
    writeJson(USERS_FILE, udb);

    // Sync to DuckDB
    dbSyncUserFromJson({
      name: user.name,
      phone: user.phone,
      email: user.email,
      loginCount: user.loginCount,
      createdAt: user.createdAt,
    }).catch(() => {
      /* ignore DuckDB sync errors */
    });

    odb.otps = odb.otps.filter(
      (o: any) => !(o.phone === phone && o.code === code),
    );
    writeJson(OTP_FILE, odb);

    const { sid } = createSession(user.id);
    setSessionCookie(reply, sid);

    // Send welcome message for new registrations
    if (isNewUser) {
      sendWaha(phone, getWelcomeMessage(user.name)).catch(() => {
        /* ignore send errors */
      });
    }

    return { ok: true, user };
  });

  /* ── Login: request OTP for existing user ── */
  fastify.post('/api/auth/login-number', async (request, reply) => {
    const body = request.body as any;
    const phone = normalizePhone(body?.phone || '');
    if (!phone)
      return reply
        .code(400)
        .send({ ok: false, error: 'nomor telepon diperlukan' });

    const udb = readJson(USERS_FILE, { users: [] as any[] });
    let user = udb.users.find((u: any) => u.phone === phone);

    // If not in JSON, check DuckDB (admin-managed users) and create JSON entry
    if (!user) {
      try {
        const dbUser = await dbGetUserByPhone(phone);
        if (dbUser) {
          user = {
            id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: dbUser.name,
            phone: dbUser.phone,
            email: dbUser.email || '',
            photoUrl: '',
            referralCode: generateReferralCode(),
            referredBy: '',
            createdAt: dbUser.joined_at || nowIso(),
            loginCount: 0,
            lastLoginAt: null,
          };
          udb.users.push(user);
          writeJson(USERS_FILE, udb);
        }
      } catch {
        /* ignore DuckDB errors */
      }
    }

    if (!user)
      return reply
        .code(404)
        .send({ ok: false, error: 'nomor belum terdaftar' });

    // Generate OTP for login verification
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const odb = readJson(OTP_FILE, { otps: [] as any[] });
    odb.otps = odb.otps.filter((o: any) => o.phone !== phone);
    odb.otps.push({
      phone,
      name: user.name,
      email: user.email || '',
      code,
      type: 'login',
      expiresAt: Date.now() + 60 * 60 * 1000,
      createdAt: nowIso(),
    });
    writeJson(OTP_FILE, odb);

    const sent = await sendWaha(
      phone,
      `Kode OTP Login KutuLoncat: ${code} (berlaku 60 menit)`,
    );
    return { ok: true, sent, needOtp: true, phone, otpValidMinutes: 60 };
  });

  /* ── Login: verify OTP for existing user ── */
  fastify.post('/api/auth/login-verify', async (request, reply) => {
    const body = request.body as any;
    const phone = normalizePhone(body?.phone || '');
    const code = String(body?.code || '').trim();
    const odb = readJson(OTP_FILE, { otps: [] as any[] });
    const row = odb.otps.find((o: any) => o.phone === phone && o.code === code);
    if (!row) return reply.code(400).send({ ok: false, error: 'invalid otp' });
    if (Date.now() > row.expiresAt)
      return reply.code(400).send({ ok: false, error: 'otp expired' });

    const udb = readJson(USERS_FILE, { users: [] as any[] });
    let user = udb.users.find((u: any) => u.phone === phone);
    if (!user)
      return reply
        .code(404)
        .send({ ok: false, error: 'nomor belum terdaftar' });

    // Backfill referral code for existing users
    if (!user.referralCode) {
      user.referralCode = generateReferralCode();
    }

    user.loginCount = Number(user.loginCount || 0) + 1;
    user.lastLoginAt = nowIso();
    writeJson(USERS_FILE, udb);

    // Sync to DuckDB
    dbSyncUserFromJson({
      name: user.name,
      phone: user.phone,
      email: user.email,
      loginCount: user.loginCount,
      createdAt: user.createdAt,
    }).catch(() => {
      /* ignore */
    });

    odb.otps = odb.otps.filter(
      (o: any) => !(o.phone === phone && o.code === code),
    );
    writeJson(OTP_FILE, odb);

    const { sid } = createSession(user.id);
    setSessionCookie(reply, sid);

    // Send login notification message
    sendWaha(phone, getLoginMessage(user.name)).catch(() => {
      /* ignore */
    });

    return { ok: true, user };
  });

  /* ── Logout ── */
  fastify.post('/api/auth/logout', async (request, reply) => {
    const sid = (request as any).cookies?.sid;
    if (sid) {
      const sdb = readJson(SESSIONS_FILE, { sessions: [] as any[] });
      sdb.sessions = sdb.sessions.filter((s: any) => s.sid !== sid);
      writeJson(SESSIONS_FILE, sdb);
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  /* ── Current user ── */
  fastify.get('/api/me', async (request, reply) => {
    const user = getEffectiveUser(request);
    if (!user)
      return reply.code(401).send({ ok: false, error: 'unauthorized' });
    return { ok: true, user };
  });

  /* ── Update profile ── */
  fastify.post('/api/me', async (request, reply) => {
    const user = requireAuthApi(request, reply);
    if (!user) return;
    const body = request.body as any;
    const udb = readJson(USERS_FILE, { users: [] as any[] });
    const row = udb.users.find((u: any) => u.id === user.id);
    if (!row) return reply.code(404).send({ ok: false });
    if (body.name) row.name = escapeHtml(String(body.name).slice(0, 40));
    if (body.photoUrl !== undefined)
      row.photoUrl = String(body.photoUrl).slice(0, 500);
    writeJson(USERS_FILE, udb);
    // Sync name to leaderboard scores & achievements
    if (body.name) syncPlayerName(user.id, row.name);
    return { ok: true, user: row };
  });

  /* ── Upload photo ── */
  fastify.post('/api/me/photo', async (request, reply) => {
    const user = requireAuthApi(request, reply);
    if (!user) return;
    const body = request.body as any;
    const dataUrl = String(body?.photoData || '');
    const m = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if (!m)
      return reply.code(400).send({ ok: false, error: 'invalid image format' });
    const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 2 * 1024 * 1024)
      return reply
        .code(400)
        .send({ ok: false, error: 'image too large (max 2MB)' });

    if (!fs.existsSync(UPLOADS_DIR))
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filename = `u-${user.id}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);

    const udb = readJson(USERS_FILE, { users: [] as any[] });
    const row = udb.users.find((u: any) => u.id === user.id);
    if (!row) return reply.code(404).send({ ok: false });
    row.photoUrl = `/uploads/${filename}`;
    writeJson(USERS_FILE, udb);
    return { ok: true, photoUrl: row.photoUrl };
  });
}
