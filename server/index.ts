/* Suppress DEP0169 (url.parse) triggered by @mapbox/node-pre-gyp inside duckdb.
 * This is a third-party issue we cannot fix; the warning is harmless. */
const _origEmit = process.emit.bind(process);
process.emit = function (ev: string, ...args: any[]) {
  if (
    ev === 'warning' &&
    typeof args[0]?.name === 'string' &&
    args[0].name === 'DeprecationWarning' &&
    args[0].code === 'DEP0169'
  ) {
    return false;
  }
  return _origEmit(ev, ...args);
} as typeof process.emit;

import 'dotenv/config';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { authRoutes } from './routes/auth.js';
import { gameRoutes } from './routes/game.js';
import { adminRoutes } from './routes/admin.js';
import { referralRoutes } from './routes/referral.js';
import {
  readJson,
  SCORE_FILE,
  PHRASE_FILE,
  ensurePhrasesSeed,
} from './lib/storage.js';
import {
  initDb,
  dbGetPhraseCount,
  dbUpsertPhrases,
  dbSeedUsers,
  dbGetAllUsers,
  dbSyncUserFromJson,
} from './lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3001);
const IS_PROD = process.env.NODE_ENV === 'production';

const fastify = Fastify({
  logger: {
    level: IS_PROD ? 'warn' : 'info',
    transport: IS_PROD
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true } },
  },
  bodyLimit: 256 * 1024, // 256KB
});

/* ── Plugins ── */
await fastify.register(fastifyCookie);
await fastify.register(fastifyCors, {
  origin: IS_PROD ? false : true,
  credentials: true,
});
await fastify.register(fastifyRateLimit, {
  max: 30,
  timeWindow: '15 minutes',
  allowList: (request) => !request.url.startsWith('/api/auth'),
});

/* ── Static files: uploads ── */
const uploadsDir = path.join(ROOT, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
await fastify.register(fastifyStatic, {
  root: uploadsDir,
  prefix: '/uploads/',
  decorateReply: true,
});

/* ── In production: serve Vite-built SPA ── */
if (IS_PROD) {
  const distDir = path.join(ROOT, 'dist');
  if (fs.existsSync(distDir)) {
    await fastify.register(fastifyStatic, {
      root: distDir,
      prefix: '/',
      decorateReply: false,
      wildcard: false,
    });
  }
}

/* ── Seed data ── */
ensurePhrasesSeed();

/* ── Initialize DuckDB and sync phrases ── */
await initDb();
const dbPhraseCount = await dbGetPhraseCount();
if (dbPhraseCount === 0) {
  // First run: migrate JSON phrases → DuckDB
  const jsonPhrases = readJson(PHRASE_FILE, { phrases: [] as any[] });
  if (jsonPhrases.phrases?.length) {
    await dbUpsertPhrases(jsonPhrases.phrases);
    console.log(`📦 Migrated ${jsonPhrases.phrases.length} phrases to DuckDB`);
  }
}

/* ── Seed existing users into DuckDB ── */
const existingUsers = await dbGetAllUsers();
if (existingUsers.length === 0) {
  const seedUsers = [
    {
      name: 'Harish Texcoms',
      phone: '+918286879003',
      email: '',
      language: 'EN',
      joined_at: '2025-06-02T00:00:00Z',
      status: 'active',
    },
    {
      name: 'Guru',
      phone: '+919952365198',
      email: '',
      language: 'EN',
      joined_at: '2025-06-03T00:00:00Z',
      status: 'active',
    },
    {
      name: 'Ciel Rainelle',
      phone: '+628819253930',
      email: '',
      language: 'ID',
      joined_at: '2025-06-04T00:00:00Z',
      status: 'active',
    },
    {
      name: 'sakura~chan',
      phone: '+6285264217725',
      email: '',
      language: 'ID',
      joined_at: '2025-06-05T00:00:00Z',
      status: 'active',
    },
    {
      name: 'Cs',
      phone: '+6285158020234',
      email: '',
      language: 'ID',
      joined_at: '2025-06-17T00:00:00Z',
      status: 'active',
    },
    {
      name: 'Nawaya',
      phone: '+6282113499195',
      email: '',
      language: 'ID',
      joined_at: '2025-06-17T00:00:00Z',
      status: 'active',
    },
    {
      name: 'Riyan',
      phone: '+62895363033811',
      email: '',
      language: 'ID',
      joined_at: '2025-06-17T00:00:00Z',
      status: 'active',
    },
    {
      name: 'Edelweiss',
      phone: '+6289662539117',
      email: '',
      language: 'ID',
      joined_at: '2025-06-17T00:00:00Z',
      status: 'active',
    },
    {
      name: 'Riff',
      phone: '+6285604919192',
      email: '',
      language: 'ID',
      joined_at: '2025-06-17T00:00:00Z',
      status: 'active',
    },
    {
      name: 'Shin Min Ahn',
      phone: '+6289506401845',
      email: '',
      language: 'ID',
      joined_at: '2025-06-17T00:00:00Z',
      status: 'active',
    },
    {
      name: 'HanA',
      phone: '+6281392951140',
      email: '',
      language: 'ID',
      joined_at: '2025-06-17T00:00:00Z',
      status: 'active',
    },
    {
      name: 'Putri_hansa',
      phone: '+6283170088676',
      email: '',
      language: 'ID',
      joined_at: '2025-06-17T00:00:00Z',
      status: 'active',
    },
    {
      name: 'Syaeful Aziz Zulkifli',
      phone: '+6283131372021',
      email: '',
      language: 'ID',
      joined_at: '2025-06-17T00:00:00Z',
      status: 'active',
    },
  ];
  const inserted = await dbSeedUsers(seedUsers);
  console.log(`👥 Seeded ${inserted} users into DuckDB`);
}

/* ── Sync JSON auth users → DuckDB (so admin sees all users) ── */
try {
  const USERS_FILE_PATH = path.join(ROOT, 'data', 'users.json');
  if (fs.existsSync(USERS_FILE_PATH)) {
    const jsonUsers = JSON.parse(fs.readFileSync(USERS_FILE_PATH, 'utf-8')) as {
      users: any[];
    };
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    let synced = 0;
    let inactivated = 0;
    let jsonChanged = false;
    for (const u of jsonUsers.users || []) {
      // Auto-detect inactive: last login > 30 days ago and currently active
      if (u.lastLoginAt && u.status !== 'blocked' && u.status !== 'inactive') {
        const lastLogin = new Date(u.lastLoginAt).getTime();
        if (Date.now() - lastLogin > THIRTY_DAYS) {
          u.status = 'inactive';
          jsonChanged = true;
          inactivated++;
        }
      }
      await dbSyncUserFromJson({
        name: u.name || 'Unknown',
        phone: u.phone || '',
        email: u.email || '',
        loginCount: Number(u.loginCount || 0),
        createdAt: u.createdAt,
        status: u.status,
      });
      synced++;
    }
    if (jsonChanged) {
      fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(jsonUsers, null, 2));
    }
    if (synced > 0) console.log(`🔄 Synced ${synced} JSON users to DuckDB`);
    if (inactivated > 0)
      console.log(
        `💤 Auto-inactivated ${inactivated} users (no login > 30 days)`,
      );
  }
} catch (e) {
  console.error('⚠️ JSON→DuckDB user sync failed:', e);
}

/* ── Health check ── */
fastify.get('/health', async () => {
  const s = readJson(SCORE_FILE, { scores: [] });
  const p = readJson(PHRASE_FILE, { phrases: [] });
  return {
    ok: true,
    app: 'kutuloncat-games',
    storage: 'json-file',
    scores: (s.scores || []).length,
    phrases: (p.phrases || []).length,
  };
});

/* ── Route plugins ── */
await fastify.register(authRoutes);
await fastify.register(gameRoutes);
await fastify.register(adminRoutes);
await fastify.register(referralRoutes);

/* ── SPA fallback (production only) ── */
if (IS_PROD) {
  fastify.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ ok: false, error: 'not found' });
    }
    const indexPath = path.join(ROOT, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
      return reply.type('text/html').send(fs.readFileSync(indexPath, 'utf-8'));
    }
    return reply.code(404).send({ ok: false, error: 'not found' });
  });
}

/* ── Start ── */
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`\n🎮 KutuLoncat Games API aktif di http://0.0.0.0:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log('⚠️  ADMIN_PASSWORD not set — admin panel is unprotected');
  }
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
