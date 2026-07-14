# KutuLoncat Games — Project Tracker

> **Version:** 6.0.0 | **Last Updated:** 2026-07-14 | **Status:** Production

---

## 📋 Project Overview

**KutuLoncat Games** adalah platform mini-game berbasis web untuk komunitas. Platform ini menyediakan beberapa game HTML5 dengan sistem leaderboard, achievements, dan manajemen pengguna via WhatsApp OTP.

| Item           | Detail                                   |
| -------------- | ---------------------------------------- |
| **Nama**       | KutuLoncat Games                         |
| **Versi**      | 6.0.0                                    |
| **Domain**     | kutuloncat.my.id / test.kutuloncat.my.id |
| **Repository** | GitHub (private)                         |
| **Lisensi**    | Private                                  |

---

## 🏗️ Tech Stack

| Layer        | Teknologi                            | Versi          |
| ------------ | ------------------------------------ | -------------- |
| Frontend     | React + TypeScript + Vite            | 19 / 5.7 / 6.4 |
| UI Framework | Tailwind CSS + shadcn/ui             | 4.1 / New York |
| Game Engine  | Phaser                               | 3.87           |
| Backend      | Node.js + Fastify                    | 24.x / 5.2     |
| Database     | DuckDB + JSON file storage           | 1.4.4          |
| Auth         | Cookie session + WhatsApp OTP (WAHA) | —              |
| Deployment   | PM2 + Nginx + Let's Encrypt          | —              |

---

## 🎮 Games

| #   | Game                              | Engine | Status      | Anti-Cheat             | Daily Challenge |
| --- | ---------------------------------- | ------ | ----------- | ---------------------- | ---------------- |
| 1   | **Tebak Cellimat Pashang (Hangman)** | Phaser | ✅ Complete | ✅ HMAC + plausibility | — (100 frase baru di-seed harian, mekanisme terpisah) |
| 2   | **Potong Bhuahaya (Fruit Ninja)**  | Phaser | ✅ Complete | ✅ HMAC + plausibility | — |
| 3   | **Piyik Mabur (Flappy Bird)**      | Phaser | ✅ Complete | ✅ HMAC + plausibility | — |
| 4   | **Anomali Ulariyan (Snake)**       | Phaser | ✅ Complete | ✅ HMAC + plausibility | — |
| 5   | **Tehencis (Tetris)**              | Phaser | ✅ Complete | ✅ HMAC + plausibility | — |
| 6   | **AI-m Targetnya (Archery)**       | Phaser | ✅ Complete | ✅ HMAC + plausibility | — |
| 7   | **Space Panic**                    | Phaser | ✅ Complete | ✅ HMAC + plausibility | ✅ seeded level layout |
| 8   | **Pecah Bhata (Brick Breaker)**    | Phaser | ✅ Complete | ✅ HMAC + plausibility | ✅ tagged leaderboard |
| 9   | **Serbu Balik Alien (Space Raid)** | Phaser | ✅ Complete | ✅ HMAC + plausibility | ✅ tagged leaderboard |
| 10  | **Jaga Kotha (Sky Defense)**       | Phaser | ✅ Complete | ✅ HMAC + plausibility | ✅ tagged leaderboard |
| 11  | **Lahap Labirin (Maze Chase)**     | Phaser | ✅ Complete | ✅ HMAC + plausibility | ✅ tagged leaderboard |
| 12  | **Kodok Nyabrang (Road Hopper)**   | Phaser | ✅ Complete | ✅ HMAC + plausibility | ✅ seeded lane setup |

### Anti-Cheat Notes

- Semua game menggunakan **HMAC-SHA256 signed session** untuk memverifikasi bahwa skor berasal dari sesi game yang valid.
- Semua 12 game punya **game-specific plausibility checks** (validasi waktu, skor maksimal vs kills/lines/dots/dll — lihat `server/lib/auth.ts:validateAntiCheat`). Ini menggantikan status lama yang menandai Flappy Bird & Snake "HMAC only" — keduanya sudah punya validasi plausibilitas penuh.
- Skor yang ditandai `suspicious` tidak pernah masuk leaderboard atau memicu achievement, tapi tetap disimpan untuk review admin.

### Daily Challenge Notes

- Space Panic dan seluruh 5 game Season 2 punya toggle "Harian" (header game / menu Space Panic). Skor yang dikirim dengan `meta.daily=true` masuk papan `/api/scores/:game/daily` (reset tiap hari, generik untuk game manapun).
- **Fairness bertingkat:** Space Panic (level layout) dan Kodok Nyabrang (setup lajur) benar-benar men-seed generator prosedural mereka dengan `mulberry32(seed tanggal)` — starting board identik untuk semua pemain hari itu. Empat game Season 2 lain (Pecah Bhata, Serbu Balik Alien, Jaga Kotha, Lahap Labirin) sudah punya struktur awal yang deterministik tanpa random (baris bata/formasi alien/lorong labirin tetap), jadi mode Harian di situ berarti "papan peringkat harian terpisah" — bukan replay ter-seed, karena spawn reaktif saat main tetap acak seperti biasa.
- Achievement lintas-game baru: `daily-multi` — main Daily Challenge di 3+ game berbeda dalam sehari.

---

## 📊 Feature Matrix

### Core Features

| Feature                            | Status | Detail                      |
| ---------------------------------- | ------ | --------------------------- |
| Login via WhatsApp OTP             | ✅     | WAHA integration            |
| Login via nomor (admin-registered) | ✅     | DuckDB→JSON auto-sync       |
| Guest access (test domain)         | ✅     | test.kutuloncat.my.id       |
| User profile + photo upload        | ✅     | Base64 storage              |
| Leaderboard (per game + global)    | ✅     | Top scores with pagination  |
| Achievement system                 | ✅     | 71 achievements, permanent  |
| Score submission                   | ✅     | All 6 games                 |
| Admin panel                        | ✅     | Full CRUD                   |
| Cookie session auth                | ✅     | 1-year expiry               |
| Rate limiting                      | ✅     | 30 req/15 min               |
| SPA routing + fallback             | ✅     | Vite build → Fastify static |
| **Referral system**                | ✅     | 4-digit code, link sharing  |
| **Overall leaderboard**            | ✅     | Composite scoring           |
| **OTP login (wajib)**              | ✅     | OTP required for all logins |
| **Welcome WhatsApp message**       | ✅     | Sent after registration     |
| **Login notification message**     | ✅     | Sent after each login       |

### Admin Features

| Feature                          | Status | Detail                              |
| -------------------------------- | ------ | ----------------------------------- |
| User management                  | ✅     | List, add, edit, delete, resend OTP |
| Phrase management                | ✅     | CRUD + AI generation (OpenAI)       |
| Score management                 | ✅     | View, clear, save season            |
| Achievement management           | ✅     | View, backup, restore               |
| Season archive                   | ✅     | Save + list + detail + delete       |
| AI settings                      | ✅     | OpenAI API key + model config       |
| WAHA diagnostics                 | ✅     | Connection test + send test         |
| Game config (fruit-ninja, snake) | ✅     | Via settings.json                   |

---

## 🏆 Achievement System

Total: **71 achievements** across 7 categories:

| Kategori             | Jumlah | Contoh                                   |
| -------------------- | ------ | ---------------------------------------- |
| General / All Games  | ~15    | first_blood, score_1000, play_all_games  |
| Hangman-specific     | ~20    | hangman_master, no_mistakes, speed_demon |
| Fruit Ninja-specific | ~15    | slice_master, combo_king, bomb_dodger    |
| Snake-specific       | ~10    | snake_25, snake_hard_mode, long_snake    |
| Flappy Bird-specific | ~5     | flappy_10, flappy_50                     |
| Streak / Consistency | ~3     | streak_3, streak_7                       |
| Score milestones     | ~3     | total_10000, total_50000                 |

- Achievements bersifat **permanen** — tidak terhapus saat clear scores atau save season.
- Backup/restore tersedia di admin panel.

---

## 🗄️ Architecture

### Data Storage (Hybrid)

```
┌─────────────────┐     ┌──────────────────┐
│  JSON Files     │     │  DuckDB          │
│  (Source of     │────→│  (Admin view,    │
│   Truth for     │     │   seasons,       │
│   auth/scores)  │     │   analytics)     │
└─────────────────┘     └──────────────────┘
```

| Storage | Files             | Purpose                                |
| ------- | ----------------- | -------------------------------------- |
| JSON    | users.json        | Auth source of truth                   |
| JSON    | sessions.json     | Session management                     |
| JSON    | scores.json       | Active scores                          |
| JSON    | achievements.json | Permanent achievements                 |
| JSON    | phrases.json      | Hangman phrases                        |
| JSON    | otp.json          | OTP codes (temp)                       |
| JSON    | settings.json     | App configuration                      |
| JSON    | referrals.json    | Referral tracking (v4.0.0+)            |
| DuckDB  | kutuloncat.duckdb | Users (admin), seasons, phrases mirror |

### API Endpoints

| Method | Endpoint                       | Auth    | Description                     |
| ------ | ------------------------------ | ------- | ------------------------------- |
| GET    | `/health`                      | No      | Health check                    |
| POST   | `/api/auth/request-otp`        | No      | Request WhatsApp OTP            |
| POST   | `/api/auth/verify-otp`         | No      | Verify OTP + create session     |
| POST   | `/api/auth/login-number`       | No      | Send OTP for login (v4.0)       |
| POST   | `/api/auth/login-verify`       | No      | Verify login OTP (v4.0)         |
| POST   | `/api/auth/logout`             | Session | Logout                          |
| GET    | `/api/me`                      | Session | Current user                    |
| POST   | `/api/me`                      | Session | Update profile                  |
| POST   | `/api/me/photo`                | Session | Upload photo                    |
| POST   | `/api/session/start`           | Session | Start game session (anti-cheat) |
| POST   | `/api/scores`                  | Session | Submit score                    |
| GET    | `/api/scores/:game/top`        | Session | Leaderboard per game            |
| GET    | `/api/scores/overall/top`      | Session | Overall composite leaderboard   |
| GET    | `/api/scores/all/top`          | Session | Global leaderboard              |
| GET    | `/api/hangman/phrase`          | Session | Random phrase                   |
| GET    | `/api/achievements/me`         | Session | User's achievements             |
| GET    | `/api/achievements/catalog`    | Session | All 71 achievements             |
| GET    | `/api/game/fruit-ninja/config` | No      | Fruit Ninja settings            |
| GET    | `/api/game/snake/config`       | No      | Snake settings                  |
| GET    | `/api/admin/*`                 | Admin   | All admin operations            |
| GET    | `/api/referral/me`             | Session | Referral dashboard (v4.0)       |
| GET    | `/api/referral/validate/:code` | No      | Validate referral code (v4.0)   |
| GET    | `/api/admin/referrals`         | Admin   | All referrals overview (v4.0)   |

---

## 📁 Project Structure

```
kutuloncat-games/
├── package.json            # v3.0.0, scripts, dependencies
├── tsconfig.json           # TypeScript config
├── vite.config.ts          # Vite + React + Tailwind
├── server/
│   ├── index.ts            # Fastify server, plugins, seed data
│   ├── routes/
│   │   ├── auth.ts         # Auth endpoints (OTP, login, profile)
│   │   ├── game.ts         # Game endpoints (scores, achievements)
│   │   ├── referral.ts     # Referral endpoints (v4.0)
│   │   └── admin.ts        # Admin endpoints (CRUD, AI, WAHA)
│   └── lib/
│       ├── auth.ts         # Session, cookies, anti-cheat, WAHA
│       ├── db.ts           # DuckDB singleton + queries
│       └── storage.ts      # JSON file I/O, constants
├── src/
│   ├── App.tsx             # React Router, lazy loading
│   ├── main.tsx            # React entry point
│   ├── index.css           # Tailwind imports
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── HangmanPage.tsx
│   │   ├── FruitNinjaPage.tsx
│   │   ├── FlappyBirdPage.tsx
│   │   ├── SnakePage.tsx
│   │   ├── LeaderboardPage.tsx
│   │   ├── ProfilePage.tsx
│   │   ├── AchievementsPage.tsx
│   │   ├── ReferralPage.tsx    # Referral dashboard (v4.0)
│   │   └── AdminPage.tsx
│   ├── games/
│   │   ├── hangman/HangmanScene.ts
│   │   ├── fruit-ninja/FruitNinjaScene.ts
│   │   ├── flappy-bird/FlappyBirdScene.ts
│   │   └── snake/SnakeScene.ts
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── PhaserGame.tsx
│   │   ├── HangmanGame.tsx
│   │   └── ui/             # shadcn/ui components
│   ├── hooks/
│   │   └── useAuth.tsx
│   └── lib/
│       ├── api.ts          # API client
│       └── utils.ts        # cn() helper
├── scripts/
│   ├── qa-test.ts          # QA test suite (55 tests)
│   ├── migrate_to_duckdb.js
│   └── debug-logout.ts
├── data/                   # Runtime data (gitignored)
│   ├── *.json
│   └── kutuloncat.duckdb
├── dist/                   # Production build output
├── DEPLOYMENT.md           # VPS deployment guide
└── .env                    # Environment variables (gitignored)
```

---

## 📝 Development History

### Session 1 — Initial Build

- Scaffolded project: Vite 6 + React 19 + TypeScript + Phaser 3.87
- Implemented Hangman game with phrase management
- Built Fastify 5 backend with JSON file storage
- Added cookie-based session authentication
- Integrated WhatsApp OTP via WAHA
- Created admin panel with phrase CRUD + AI generation
- **Version: 1.0.0**

### Session 2 — Game Expansion

- Added Fruit Ninja game with Phaser canvas
- Added Flappy Bird game
- Added Snake game with difficulty selector
- Implemented DuckDB for admin dashboard + seasons
- Added score season archiving system
- Built comprehensive achievement system (71 achievements)
- Added leaderboard (per game + global)
- Rate limiting + anti-cheat (HMAC sessions)
- **Version: 2.0.0**

### Session 3 — Bug Fixes & Hardening

- ✅ Fixed: Standardized all user status from `'subscribed'` to `'active'`
- ✅ Fixed: Login/register flow — added `dbGetUserByPhone()` for admin-managed users
- ✅ Fixed: Snake difficulty selector moved below game frame
- ✅ Fixed: **Critical** — Score saving in all games changed from broken `Authorization: Bearer` to cookie auth (`credentials: 'include'`)
- ✅ Fixed: Achievements made permanent — no longer cleared by score clear or season save
- ✅ Added: Achievement backup/restore endpoints + admin UI section
- **Version: 3.0.0**

### Session 4 — QA, Documentation & Deployment

- ✅ Created DEPLOYMENT.md — comprehensive VPS deployment guide
- ✅ Created QA test suite — 55 automated tests, 100% pass rate
- ✅ Fixed: Negative score validation (server-side reject score < 0)
- ✅ Created PROJECT_TRACKER.md — this document
- ✅ TypeScript: 0 errors
- ✅ Vite build: Success (1633 modules, ~20s)
- ⏳ Push to GitHub

### Session 5 — Referral System, OTP Login, Overall Leaderboard & Docs

- ✅ Implemented referral system with 4-digit unique codes
- ✅ Referral dashboard page (code sharing, stats, earnings)
- ✅ Referral activation on 2+ games played
- ✅ Referral link support (?ref=XXXX in URL)
- ✅ Referral validation endpoint
- ✅ Overall leaderboard with composite scoring formula
- ✅ Login flow changed to require OTP verification every time
- ✅ Welcome WhatsApp message sent after registration
- ✅ Login notification WhatsApp message sent after each login
- ✅ Backfill referral codes for existing users on next login
- ✅ Created comprehensive documentation suite:
  - SRS.md (Software Requirements Specification)
  - FRD.md (Functional Requirements Document)
  - BRD.md (Business Requirements Document)
  - Installation.md (Developer setup guide)
  - Guidance.md (User guide in Indonesian)
  - Preparation.md (Pre-deployment checklist)
  - TechnicalRequirements.md (Infrastructure & architecture)
- ✅ Updated DEPLOYMENT.md and PROJECT_TRACKER.md for v4.0.0
- **Version: 4.0.0**

### Session 6 — Space Panic, Tetris/Archery, Season 2 Arcade & Daily Challenge Expansion

*(Note: this section summarizes everything since Session 5 that this tracker had never recorded — the doc had drifted several versions behind the actual repo before this pass.)*

- ✅ Added Tetris (Tehencis) and Archery (AI-m Targetnya), international phone support, admin protection, deploy.sh for safe production deploys
- ✅ Added Space Panic — Dig Dug-style arcade platformer with full anti-cheat, achievements, and a seeded Daily Challenge mode (mulberry32 PRNG on date)
- ✅ Added Season 2: five new code-drawn arcade games (Pecah Bhata, Serbu Balik Alien, Jaga Kotha, Lahap Labirin, Kodok Nyabrang) sharing a `src/games/arcade/kit.ts` engine (design-space scaling, synthesized SFX, tap/swipe/pointer plumbing) + `ArcadeShell` page chrome, each with their own anti-cheat validator and achievement set
- ✅ Extended Daily Challenge to all 5 Season 2 games: header toggle in `ArcadeShell`, scores tagged `meta.daily`/`dailyDate`, surfaced on the existing generic `/api/scores/:game/daily` leaderboard endpoint and the "Hari Ini" tab on the Leaderboard page. Kodok Nyabrang's lane setup is genuinely seeded (`mulberry32`) for identical starting boards; the other four already had deterministic starting structure, so daily mode there means a dedicated daily leaderboard rather than a re-seeded layout
- ✅ Added `daily-multi` achievement — play the Daily Challenge in 3+ different games in one day
- ✅ Full known-issues audit: confirmed Snake/Flappy Bird anti-cheat and XSS escaping were already resolved by earlier sessions but never marked as such in this doc; found one real unresolved issue (`public/admin.html` missing its admin-password header)
- **Version: 6.0.0**

---

## 🧪 QA Test Results

**Date:** 2025-06-03 | **Score: 100% (55/55)**

| Category    | Tests | Pass | Fail |
| ----------- | ----- | ---- | ---- |
| Smoke       | 5     | 5    | 0    |
| Auth        | 8     | 8    | 0    |
| Game API    | 13    | 13   | 0    |
| Achievement | 2     | 2    | 0    |
| Admin       | 10    | 10   | 0    |
| Security    | 5     | 5    | 0    |
| Performance | 4     | 4    | 0    |
| Integration | 5     | 5    | 0    |

### Test Details

- **Smoke:** Health, SPA, static assets, fallback, 404
- **Auth:** 401 guard, OTP flow, login validation, DuckDB→JSON sync, session cookie
- **Game:** Phrase API, session start, score submission (4 games), validation, leaderboard
- **Achievement:** My achievements, catalog (71 total)
- **Admin:** Phrases, settings, users, seasons, achievements backup, AI, WAHA
- **Security:** XSS, SQL injection, oversized body, negative score, name length
- **Performance:** <10ms avg response on all endpoints
- **Integration:** Score→leaderboard flow, achievement persistence, logout invalidation

---

## ⚠️ Known Issues & Technical Debt

**Resolved since the last audit (verified 2026-07-14 against the actual code, not just this doc):**

| #   | Issue                                                                  | Resolution |
| --- | ---------------------------------------------------------------------- | ---------- |
| 1   | Anti-cheat: Snake & Flappy Bird lacked game-specific plausibility checks | `validateAntiCheat()` in `server/lib/auth.ts` now has full plausibility rules for every one of the 12 games, Snake and Flappy Bird included. |
| 2   | README game count was stale                                            | README.md now lists all 12 games (Season 1 + Season 2) and the Daily Challenge feature. |
| 3   | `url.parse()` deprecation warning (Node.js)                            | Deliberately suppressed in `server/index.ts` — DEP0169 comes from a third-party dep inside `duckdb`, not our code; not a real bug, just noise without the filter. |
| 7   | XSS: `escapeHtml()` not applied to all fields                          | Audited: `user.name` is escaped both at registration and on profile update; React auto-escapes all rendered text (no `dangerouslySetInnerHTML` anywhere in `src/`); the legacy static `public/admin.html` only renders settings/config values, never user-submitted names or scores — no unescaped-render path found. |

**Still open:**

| #   | Issue                                                                  | Severity | Status     |
| --- | ---------------------------------------------------------------------- | -------- | ---------- |
| 4   | DuckDB WAL file can cause lock issues on process crash                 | Medium   | Documented |
| 5   | No CI/CD pipeline                                                      | Medium   | Backlog    |
| 6   | No automated E2E browser tests                                         | Low      | Backlog    |
| 8   | Profile photo stored as base64 in JSON (scalability risk)              | Low      | Backlog    |
| 9   | `public/admin.html` (legacy static admin page) never sends the `x-admin-password` header on its `/api/admin/*` calls — will 403 in any deployment with `ADMIN_PASSWORD` set. The maintained admin UI is `AdminPage.tsx` (React); this looks like a leftover from before that existed. Not touched this pass since its intended fate (keep vs. remove) wasn't confirmed. | Low | Backlog |
| 10  | Daily Challenge covers Space Panic + all 5 Season 2 games only — not the original Hangman/Fruit Ninja/Flappy/Snake/Tetris/Archery. Hangman has its own unrelated "100 new phrases/day" seeding, which is not a scored daily leaderboard. | Low | Backlog (natural next step) |

---

## 🔧 Environment Variables

```env
# Required
PORT=3001
NODE_ENV=production
ADMIN_PASSWORD=<strong-password>

# WhatsApp OTP (WAHA)
WAHA_BASE_URL=https://waha.example.com
WAHA_API_KEY=<waha-key>
WAHA_SESSION=default

# AI Phrase Generation (Optional)
OPENAI_API_KEY=<openai-key>
OPENAI_MODEL=gpt-4o-mini

# Anti-cheat
GAME_SECRET=<random-secret>
```

---

## 🚀 Deployment Checklist

- [x] TypeScript passes (`npx tsc --noEmit`)
- [x] Vite build succeeds (`npx vite build`)
- [x] QA tests pass (55/55)
- [x] Negative score validation added
- [x] DEPLOYMENT.md created
- [x] PROJECT_TRACKER.md created
- [ ] Push to GitHub
- [ ] Set up VPS (see DEPLOYMENT.md)
- [ ] Configure .env on server
- [ ] Set ADMIN_PASSWORD
- [ ] Configure Nginx reverse proxy
- [ ] Enable SSL (Let's Encrypt)
- [ ] Set up PM2 process manager
- [ ] Configure backup cron job
- [ ] DNS: kutuloncat.my.id → VPS IP
- [ ] Smoke test on production

---

## 📊 Build Metrics

| Metric              | Value    |
| ------------------- | -------- |
| Total modules       | 1,633    |
| Build time          | ~20s     |
| Bundle size (total) | ~2.3 MB  |
| Phaser chunk        | 1,482 KB |
| React vendor        | 67 KB    |
| Admin page          | 111 KB   |
| Index (core)        | 477 KB   |
| CSS                 | 66 KB    |
| Gzipped total       | ~540 KB  |

---

_Document generated: 2025-06-03_
