import type { FastifyInstance } from 'fastify';
import {
  readJson,
  writeJson,
  nowIso,
  escapeHtml,
  maskName,
  REFERRAL_FILE,
  SCORE_FILE,
  USERS_FILE,
  ALLOWED_GAMES,
} from '../lib/storage.js';
import { requireAuthApi, requireAdmin } from '../lib/auth.js';

const REFERRAL_VALUE_RUPIAH = 2000;

/** Check if a referred user is "active":
 *  1. They registered (exist in users)
 *  2. They used a referral code
 *  3. They played at least 2 different games
 */
function isReferralActive(userId: string): boolean {
  const scoreDb = readJson(SCORE_FILE, { scores: [] as any[] });
  const userScores = scoreDb.scores.filter((s: any) => s.userId === userId);
  const gamesPlayed = new Set(userScores.map((s: any) => s.game));
  return gamesPlayed.size >= 2;
}

export async function referralRoutes(fastify: FastifyInstance) {
  /* ── Get my referral info ── */
  fastify.get('/api/referral/me', async (request, reply) => {
    const user = requireAuthApi(request, reply);
    if (!user) return;

    const udb = readJson(USERS_FILE, { users: [] as any[] });
    const me = udb.users.find((u: any) => u.id === user.id);
    if (!me)
      return reply.code(404).send({ ok: false, error: 'user not found' });

    const referralCode = me.referralCode || '';
    const referralDb = readJson(REFERRAL_FILE, { referrals: [] as any[] });
    const myReferrals = referralDb.referrals.filter(
      (r: any) => r.referrerUserId === user.id,
    );

    // Update statuses
    let changed = false;
    for (const ref of myReferrals) {
      const wasActive = ref.status === 'active';
      const nowActive = isReferralActive(ref.referredUserId);
      if (nowActive && !wasActive) {
        ref.status = 'active';
        ref.activatedAt = nowIso();
        changed = true;
      }
    }
    if (changed) writeJson(REFERRAL_FILE, referralDb);

    const activeCount = myReferrals.filter(
      (r: any) => r.status === 'active',
    ).length;
    const inactiveCount = myReferrals.filter(
      (r: any) => r.status !== 'active',
    ).length;

    const referrals = myReferrals.map((r: any) => {
      const refUser = udb.users.find((u: any) => u.id === r.referredUserId);
      return {
        id: r.id,
        referredName: refUser ? escapeHtml(maskName(refUser.name)) : 'Unknown',
        status: r.status,
        createdAt: r.createdAt,
        activatedAt: r.activatedAt,
      };
    });

    return {
      ok: true,
      referralCode,
      referralLink: `https://kutuloncat.my.id?ref=${referralCode}`,
      totalReferrals: myReferrals.length,
      activeCount,
      inactiveCount,
      totalEarnings: activeCount * REFERRAL_VALUE_RUPIAH,
      valuePerReferral: REFERRAL_VALUE_RUPIAH,
      referrals,
    };
  });

  /* ── Admin: referral dashboard (all users) ── */
  fastify.get('/api/admin/referrals', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const udb = readJson(USERS_FILE, { users: [] as any[] });
    const referralDb = readJson(REFERRAL_FILE, { referrals: [] as any[] });

    // Update all statuses
    let changed = false;
    for (const ref of referralDb.referrals) {
      const wasActive = ref.status === 'active';
      const nowActive = isReferralActive(ref.referredUserId);
      if (nowActive && !wasActive) {
        ref.status = 'active';
        ref.activatedAt = nowIso();
        changed = true;
      }
    }
    if (changed) writeJson(REFERRAL_FILE, referralDb);

    // Group by referrer
    const referrerMap = new Map<string, any[]>();
    for (const ref of referralDb.referrals) {
      const arr = referrerMap.get(ref.referrerUserId) || [];
      arr.push(ref);
      referrerMap.set(ref.referrerUserId, arr);
    }

    const summary = Array.from(referrerMap.entries()).map(
      ([referrerId, refs]) => {
        const referrer = udb.users.find((u: any) => u.id === referrerId);
        const activeCount = refs.filter(
          (r: any) => r.status === 'active',
        ).length;
        return {
          referrerName: referrer ? escapeHtml(referrer.name) : 'Unknown',
          referrerId,
          referralCode: referrer?.referralCode || '',
          totalReferrals: refs.length,
          activeCount,
          inactiveCount: refs.length - activeCount,
          totalEarnings: activeCount * REFERRAL_VALUE_RUPIAH,
          referrals: refs.map((r: any) => {
            const refUser = udb.users.find(
              (u: any) => u.id === r.referredUserId,
            );
            return {
              id: r.id,
              referredName: refUser ? escapeHtml(refUser.name) : 'Unknown',
              referredPhone: refUser?.phone || '',
              status: r.status,
              createdAt: r.createdAt,
              activatedAt: r.activatedAt,
            };
          }),
        };
      },
    );

    const totalActive = referralDb.referrals.filter(
      (r: any) => r.status === 'active',
    ).length;
    const totalInactive = referralDb.referrals.filter(
      (r: any) => r.status !== 'active',
    ).length;

    return {
      ok: true,
      totalReferrals: referralDb.referrals.length,
      totalActive,
      totalInactive,
      totalEarnings: totalActive * REFERRAL_VALUE_RUPIAH,
      valuePerReferral: REFERRAL_VALUE_RUPIAH,
      summary,
    };
  });

  /* ── Validate referral code (public, for registration form) ── */
  fastify.get('/api/referral/validate/:code', async (request, reply) => {
    const params = request.params as any;
    const code = String(params.code || '').trim();
    if (!code || code.length < 4) return { ok: false, valid: false };

    const udb = readJson(USERS_FILE, { users: [] as any[] });
    const referrer = udb.users.find((u: any) => u.referralCode === code);
    if (!referrer) return { ok: true, valid: false };

    return {
      ok: true,
      valid: true,
      referrerName: escapeHtml(maskName(referrer.name)),
    };
  });
}
