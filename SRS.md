# KutuLoncat Games — Software Requirements Specification (SRS)

**Version:** 5.0.0
**Date:** June 2025
**Author:** Syaeful Azil

---

## 1. Introduction

### 1.1 Purpose

KutuLoncat Games is a web-based gaming platform that provides entertaining casual games with social features including leaderboards, achievements, referral system, and WhatsApp-based authentication.

### 1.2 Scope

The system consists of:

- A web frontend (React 19 + TypeScript + Phaser 3.87)
- A backend API server (Fastify 5)
- Hybrid storage (DuckDB + JSON files)
- WhatsApp integration via WAHA gateway

### 1.3 Target Users

- Indonesian casual gamers
- Ages 13+
- Mobile and desktop web users

---

## 2. Functional Requirements

### 2.1 Authentication System (FR-AUTH)

| ID         | Requirement                                                          | Priority |
| ---------- | -------------------------------------------------------------------- | -------- |
| FR-AUTH-01 | Users register with name, phone, and optional email via WhatsApp OTP | Must     |
| FR-AUTH-02 | 6-digit OTP sent via WhatsApp, valid for 60 minutes                  | Must     |
| FR-AUTH-03 | Login requires OTP verification on every login attempt               | Must     |
| FR-AUTH-04 | Welcome message sent via WhatsApp on first registration              | Must     |
| FR-AUTH-05 | Login notification sent via WhatsApp on each successful login        | Should   |
| FR-AUTH-06 | Cookie-based session with 1-year expiry                              | Must     |
| FR-AUTH-07 | Guest access on test.kutuloncat.my.id hostname                       | Should   |
| FR-AUTH-08 | Phone number normalization (08xx → +62xxx)                           | Must     |

### 2.2 Game System (FR-GAME)

| ID         | Requirement                                                                                                 | Priority |
| ---------- | ----------------------------------------------------------------------------------------------------------- | -------- |
| FR-GAME-01 | 6 games: Hangman (Tebak Kata), Fruit Ninja, Flappy Bird, Snake, Tetris (Tehencis), Archery (AI-m Targetnya) | Must     |
| FR-GAME-02 | Anti-cheat system with HMAC session signing                                                                 | Must     |
| FR-GAME-03 | Score submission with validation (no negative scores)                                                       | Must     |
| FR-GAME-04 | Per-game leaderboard (top 20)                                                                               | Must     |
| FR-GAME-05 | Overall composite leaderboard across all games                                                              | Must     |
| FR-GAME-06 | 71 achievements across all games                                                                            | Must     |
| FR-GAME-07 | Achievement catalog with rarity system (common → legendary)                                                 | Must     |
| FR-GAME-08 | Score history retention (max 10,000 entries)                                                                | Should   |

### 2.3 Referral System (FR-REF)

| ID        | Requirement                                                 | Priority |
| --------- | ----------------------------------------------------------- | -------- |
| FR-REF-01 | Each user receives a unique 4-digit referral code           | Must     |
| FR-REF-02 | Referral code can be entered during registration            | Must     |
| FR-REF-03 | Referral link support (kutuloncat.my.id?ref=XXXX)           | Must     |
| FR-REF-04 | Referral code validation during registration                | Should   |
| FR-REF-05 | Referral activation: referred user plays 2+ different games | Must     |
| FR-REF-06 | Each active referral valued at Rp2,000                      | Must     |
| FR-REF-07 | User referral dashboard with stats and list                 | Must     |
| FR-REF-08 | Admin referral dashboard with all-user overview             | Should   |

### 2.4 Leaderboard System (FR-LB)

| ID       | Requirement                                                              | Priority |
| -------- | ------------------------------------------------------------------------ | -------- |
| FR-LB-01 | Per-game top scores (max 100 per query)                                  | Must     |
| FR-LB-02 | Overall composite leaderboard                                            | Must     |
| FR-LB-03 | Composite score = best scores + achievement pts + diversity + play count | Must     |
| FR-LB-04 | Name masking for privacy (show first 3 chars + \*\*\*\*)                 | Must     |

### 2.5 Admin System (FR-ADMIN)

| ID          | Requirement                                 | Priority |
| ----------- | ------------------------------------------- | -------- |
| FR-ADMIN-01 | CRUD for phrases (Hangman game content)     | Must     |
| FR-ADMIN-02 | User management (view, edit, delete)        | Must     |
| FR-ADMIN-03 | Score season management (archive and reset) | Must     |
| FR-ADMIN-04 | Game configuration (Fruit Ninja settings)   | Should   |
| FR-ADMIN-05 | Referral dashboard for all users            | Should   |

---

## 3. Non-Functional Requirements

### 3.1 Performance

- Page load time < 3 seconds on 3G
- API response time < 500ms (95th percentile)
- Support 100 concurrent users

### 3.2 Security

- OTP-based authentication (no password storage)
- HMAC-based anti-cheat for game scores
- Rate limiting (30 requests/15 minutes for auth endpoints)
- HttpOnly session cookies
- HTML entity escaping for user input

### 3.3 Compatibility

- Chrome, Firefox, Safari, Edge (latest 2 versions)
- Mobile responsive (iOS Safari, Chrome Android)
- Minimum viewport: 320px

### 3.4 Reliability

- DuckDB auto-recovery on connection errors
- JSON fallback storage for critical data
- Graceful shutdown on SIGTERM/SIGINT

---

## 4. System Architecture

```
┌──────────────────────────────────┐
│          Browser (Client)         │
│  React 19 + Phaser 3.87 + TW v4 │
└──────────────┬───────────────────┘
               │ HTTP/REST
┌──────────────▼───────────────────┐
│        Fastify 5 Server          │
│   Port 3001 (dev) / 3001 (prod) │
├──────────────────────────────────┤
│  Routes: auth, game, admin, ref  │
│  Libs: storage, auth, db         │
└──────┬──────────────┬────────────┘
       │              │
┌──────▼──────┐ ┌─────▼──────┐ ┌──────────────┐
│  DuckDB     │ │  JSON Files│ │  WAHA Gateway│
│  (phrases,  │ │  (scores,  │ │  (WhatsApp)  │
│   users,    │ │   users,   │ │              │
│   seasons)  │ │   sessions)│ │              │
└─────────────┘ └────────────┘ └──────────────┘
```

---

## 5. Data Models

### 5.1 User (JSON)

```json
{
  "id": "u-timestamp-random",
  "name": "string",
  "phone": "+62xxx",
  "email": "string",
  "photoUrl": "string",
  "referralCode": "4-digit string",
  "referredBy": "4-digit string or empty",
  "createdAt": "ISO 8601",
  "loginCount": "number",
  "lastLoginAt": "ISO 8601"
}
```

### 5.2 Referral (JSON)

```json
{
  "id": "ref-timestamp-random",
  "referrerUserId": "string",
  "referredUserId": "string",
  "referralCode": "string",
  "status": "active | inactive",
  "createdAt": "ISO 8601",
  "activatedAt": "ISO 8601 | null"
}
```

### 5.3 Score (JSON)

```json
{
  "id": "timestamp-random",
  "game": "hangman | fruit-ninja | flappy-bird | snake",
  "playerName": "string",
  "userId": "string",
  "score": "number",
  "meta": "object",
  "createdAt": "ISO 8601"
}
```

---

## 6. API Endpoints

### 6.1 Authentication

| Method | Path                   | Description                   |
| ------ | ---------------------- | ----------------------------- |
| POST   | /api/auth/request-otp  | Request OTP for registration  |
| POST   | /api/auth/verify-otp   | Verify OTP and create account |
| POST   | /api/auth/login-number | Request OTP for login         |
| POST   | /api/auth/login-verify | Verify login OTP              |
| POST   | /api/auth/logout       | Clear session                 |
| GET    | /api/me                | Get current user              |
| POST   | /api/me                | Update profile                |
| POST   | /api/me/photo          | Upload photo                  |

### 6.2 Games

| Method | Path                      | Description                   |
| ------ | ------------------------- | ----------------------------- |
| POST   | /api/session/start        | Start game session            |
| POST   | /api/scores               | Submit score                  |
| GET    | /api/scores/:game/top     | Per-game leaderboard          |
| GET    | /api/scores/all/top       | All games top 5               |
| GET    | /api/scores/overall/top   | Overall composite leaderboard |
| GET    | /api/hangman/phrase       | Get random phrase             |
| GET    | /api/achievements/me      | My achievements               |
| GET    | /api/achievements/catalog | Achievement catalog           |

### 6.3 Referral

| Method | Path                         | Description             |
| ------ | ---------------------------- | ----------------------- |
| GET    | /api/referral/me             | My referral dashboard   |
| GET    | /api/referral/validate/:code | Validate referral code  |
| GET    | /api/admin/referrals         | Admin referral overview |

---

## 7. Version History

| Version | Date      | Changes                                                           |
| ------- | --------- | ----------------------------------------------------------------- |
| 1.0.0   | May 2025  | Initial release with Hangman + Fruit Ninja                        |
| 2.0.0   | May 2025  | Added Flappy Bird + Snake + 71 achievements                       |
| 3.0.0   | June 2025 | Bug fixes, QA 55/55 pass, negative score validation               |
| 4.0.0   | June 2025 | Referral system, OTP login, welcome messages, overall leaderboard |
