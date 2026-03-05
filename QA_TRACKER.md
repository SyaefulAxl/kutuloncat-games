# KutuLoncat Games — QA Tracker v4.0.0

> **Date**: 2025-07-03  
> **Suite**: `scripts/qa-test-v2.ts` (122 automated tests)  
> **Server**: Fastify 5 @ port 3001  
> **Build**: Vite 6, 1634 modules, 19 output chunks  
> **TypeScript**: Clean (0 errors)

---

## Summary

| Metric             | Result       |
|--------------------|--------------|
| **Total Tests**    | 122          |
| **Passed**         | 120 (98%)    |
| **Failed**         | 0            |
| **Warnings**       | 2            |
| **Avg Response**   | 27ms         |
| **Build Time**     | 15.89s       |

---

## Results by Test Level (ISTQB)

| Level           | Pass | Total | Status |
|-----------------|------|-------|--------|
| Smoke           | 11   | 11    | ✅ PASS |
| Unit            | 16   | 16    | ✅ PASS |
| Integration     | 19   | 19    | ✅ PASS |
| System          | 43   | 45    | ⚠️ 2 WARN |
| Regression      | 12   | 12    | ✅ PASS |
| Security        | 11   | 11    | ✅ PASS |
| Performance     | 8    | 8     | ✅ PASS |

---

## Results by Category

| Category       | Pass | Total | Status |
|----------------|------|-------|--------|
| Smoke          | 7    | 7     | ✅ |
| Unit           | 7    | 7     | ✅ |
| Auth           | 12   | 12    | ✅ |
| Game           | 15   | 15    | ✅ |
| Leaderboard    | 11   | 12    | ⚠️ |
| Achievement    | 6    | 6     | ✅ |
| Referral       | 9    | 9     | ✅ |
| Admin          | 10   | 10    | ✅ |
| Security       | 10   | 10    | ✅ |
| Performance    | 8    | 8     | ✅ |
| Integration    | 7    | 7     | ✅ |
| Regression     | 11   | 11    | ✅ |
| Non-Functional | 7    | 8     | ⚠️ |

---

## Warnings (Non-blocking)

| # | Test | Detail | Action |
|---|------|--------|--------|
| 1 | `GET /api/scores/me` | Endpoint not implemented | Optional — not required for v4.0. Consider adding in v4.1 |
| 2 | Rate limit headers on `/health` | `/health` excluded from rate limiter via allowList | By design — no action needed |

---

## Bugs Found & Fixed During QA

| # | Bug | Root Cause | Fix | Status |
|---|-----|-----------|-----|--------|
| 1 | DuckDB file lock on Windows (Node.js v24) | `isConnErr()` treated all `DUCKDB_NODEJS_ERROR` as connection errors, including `Catalog`/`Binder` errors from ALTER TABLE | Refined `isConnErr()` to only trigger on IO/Connection errors; added retry with in-memory fallback | ✅ Fixed |
| 2 | DuckDB file locked by OneDrive sync (FileCoAuth) | OneDrive immediately syncs `.duckdb` files, locking them | Moved DuckDB path to `%TEMP%/kutuloncat-duckdb/` when inside OneDrive directories | ✅ Fixed |
| 3 | `_tryOpen()` leaked file handles on error | `duckdb.Database()` constructor opened file handle even on error callback | Added `db.close()` in error path to release file lock | ✅ Fixed |

---

## Performance Benchmarks

| Endpoint                  | Avg (ms) | Max (ms) | P95 (ms) |
|---------------------------|----------|----------|----------|
| Health check              | 2        | 3        | 3        |
| Random phrase             | 3        | 5        | 5        |
| Per-game leaderboard      | 2        | 3        | 3        |
| Overall leaderboard       | 2        | 3        | 3        |
| Achievement catalog       | 2        | 3        | 3        |
| Referral dashboard        | 2        | 2        | 2        |
| Referral validate         | 1        | 1        | 1        |
| Concurrent (10 req)       | 18       | —        | —        |

---

## Test Coverage Map

### v4.0.0 New Features

| Feature | Tests | Status |
|---------|-------|--------|
| OTP Login (login-number → login-verify) | Auth #8-12 | ✅ Covered |
| Referral system (validate, dashboard, admin) | Referral #1-9 | ✅ Covered |
| Overall composite leaderboard | Leaderboard #6-11 | ✅ Covered |
| Referral code backfill on login | Auth #12 | ✅ Covered |
| Admin referrals endpoint | Referral #9 | ✅ Covered |

### Existing Features (Regression)

| Feature | Tests | Status |
|---------|-------|--------|
| 4 game sessions (hangman, fruit-ninja, flappy-bird, snake) | Regression #1-4 | ✅ Covered |
| Score submission (4 games) | Game #7-10 | ✅ Covered |
| Anti-cheat (session/token) | Game #7-10 | ✅ Covered |
| Per-game leaderboards | Leaderboard #1-4 | ✅ Covered |
| All-top scores | Leaderboard #5 | ✅ Covered |
| 71 achievements + catalog | Achievement #1-6 | ✅ Covered |
| Admin CRUD (phrases, users, settings, seasons) | Admin #1-10 | ✅ Covered |
| Profile update | Integration #5 | ✅ Covered |
| Logout + session invalidation | Integration #6-7 | ✅ Covered |

### Security

| Vector | Tests | Status |
|--------|-------|--------|
| XSS in name | Security #1 | ✅ Covered |
| SQL injection (phone, referral) | Security #2-3 | ✅ Covered |
| Oversized body (413) | Security #4 | ✅ Covered |
| Negative score rejection | Security #5 | ✅ Covered |
| Name length truncation (40 chars) | Security #6 | ✅ Covered |
| Unauthorized access (401) | Security #7-9 | ✅ Covered |
| Session cookie validation | Security #10 | ✅ Covered |

---

## Action Points

| # | Priority | Action | Owner | Status |
|---|----------|--------|-------|--------|
| 1 | LOW | Consider adding `/api/scores/me` endpoint for user's own score history | Dev | 📋 Backlog |
| 2 | LOW | Set `ADMIN_PASSWORD` in production `.env` | DevOps | 📋 Backlog |
| 3 | LOW | Replace `url.parse()` with WHATWG `URL` API (deprecation warning) | Dev | 📋 Backlog |
| 4 | MEDIUM | Deploy and run QA again in production mode (SPA serving, production static files) | QA | 📋 Backlog |
| 5 | LOW | Add rate limit headers to responses (`x-ratelimit-*`) for API consumers | Dev | 📋 Backlog |

---

## How to Run

```bash
# 1. Start server
npm run dev:server

# 2. Run automated QA suite (122 tests)
npx tsx scripts/qa-test-v2.ts

# Expected result: 120/122 PASS, 0 FAIL, 2 WARN
```

---

## Changelog (QA Session)

- **v2.0**: Comprehensive QA test suite — 122 tests across 13 categories
- **v1.0** (`scripts/qa-test.ts`): Initial suite — 55 tests, v3.0 endpoints only
- Fixed DuckDB `isConnErr()` to not reset connection on catalog/binder errors
- Fixed DuckDB file lock on OneDrive by using `%TEMP%` directory
- Added DuckDB retry mechanism with in-memory fallback
