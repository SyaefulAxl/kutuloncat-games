# KutuLoncat Games — Technical Requirements

**Version:** 4.0.0
**Date:** June 2025

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Client (Browser)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ React 19 │ │ Phaser 3 │ │Tailwind4 │ │shadcn  │ │
│  │  SPA UI  │ │  Canvas  │ │  Styles  │ │  /ui   │ │
│  └────┬─────┘ └────┬─────┘ └──────────┘ └────────┘ │
│       └──────┬──────┘                                │
│              │ HTTP (fetch)                          │
└──────────────┼──────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│                  Server (Fastify 5)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │   Auth   │ │   Game   │ │ Referral │ │ Admin  │ │
│  │  Routes  │ │  Routes  │ │  Routes  │ │ Routes │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ │
│       └──────┬──────┴──────┬─────┘           │      │
│              ▼             ▼                 │      │
│  ┌───────────────┐ ┌──────────────┐          │      │
│  │   DuckDB      │ │  JSON Files  │          │      │
│  │ (structured)  │ │  (flexible)  │          │      │
│  └───────────────┘ └──────────────┘          │      │
│              │                                │      │
│              ▼                                │      │
│  ┌───────────────────────────────────────────┘      │
│  │         External Services                         │
│  │  ┌──────────┐  ┌──────────┐                      │
│  │  │   WAHA   │  │  OpenAI  │                      │
│  │  │ WhatsApp │  │   API    │                      │
│  │  └──────────┘  └──────────┘                      │
│  └───────────────────────────────────────────────────│
└──────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

### 2.1 Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 19.0.0 | UI component framework |
| Vite | 6.3.5 | Build tool & dev server |
| TypeScript | 5.7.3 | Type-safe JavaScript |
| Phaser | 3.87.0 | 2D game engine (Canvas/WebGL) |
| Tailwind CSS | 4.1.8 | Utility-first CSS |
| shadcn/ui | latest | Component library (Radix + Tailwind) |
| React Router | 7.6.1 | Client-side routing |
| Lucide React | 0.513.0 | Icon library |

### 2.2 Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| Fastify | 5.2.1 | HTTP server framework |
| DuckDB | 1.4.4 | Embedded analytical database |
| Node.js | 18+ | JavaScript runtime |
| @fastify/cookie | 11.0.2 | Cookie handling |
| @fastify/static | 8.1.0 | Static file serving |
| @fastify/formbody | 8.0.2 | Form body parsing |
| uuid | 11.1.0 | Unique ID generation |
| node-fetch | 3.3.2 | HTTP client (WAHA API) |

### 2.3 Development

| Technology | Version | Purpose |
|-----------|---------|---------|
| tsx | 4.19.4 | TypeScript execution |
| concurrently | 9.1.2 | Parallel script running |
| @types/node | 22.15.21 | Node.js type definitions |
| PostCSS | 8.5.4 | CSS processing |
| Autoprefixer | 10.4.21 | CSS vendor prefixes |

---

## 3. Database Schema

### 3.1 DuckDB Tables

#### `phrases`
```sql
CREATE TABLE IF NOT EXISTS phrases (
  id VARCHAR PRIMARY KEY,
  category VARCHAR NOT NULL,
  text VARCHAR NOT NULL,
  hint VARCHAR,
  difficulty VARCHAR DEFAULT 'medium',
  language VARCHAR DEFAULT 'id',
  source VARCHAR DEFAULT 'manual',
  play_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

#### `score_seasons`
```sql
CREATE TABLE IF NOT EXISTS score_seasons (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  status VARCHAR DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

#### `users`
```sql
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  phone VARCHAR NOT NULL UNIQUE,
  email VARCHAR,
  language VARCHAR DEFAULT 'id',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR DEFAULT 'active',
  login_count INTEGER DEFAULT 0,
  referral_code VARCHAR,
  referred_by VARCHAR
)
```

### 3.2 JSON File Schemas

#### `users.json`
```json
{
  "users": [{
    "id": "u-uuid",
    "name": "string",
    "phone": "string (62xxx)",
    "email": "string?",
    "language": "id",
    "joinedAt": "ISO-8601",
    "status": "active|banned",
    "loginCount": 0,
    "referralCode": "string (4 digits)",
    "referredBy": "string?"
  }]
}
```

#### `scores.json`
```json
{
  "scores": [{
    "id": "sc-uuid",
    "userId": "u-uuid",
    "game": "hangman|fruit-ninja|flappy-bird|snake",
    "score": 0,
    "details": {},
    "playedAt": "ISO-8601",
    "hmac": "string"
  }]
}
```

#### `achievements.json`
```json
{
  "achievements": [{
    "id": "ach-uuid",
    "userId": "u-uuid",
    "achievementId": "string",
    "game": "hangman|fruit-ninja|flappy-bird|snake",
    "unlockedAt": "ISO-8601"
  }]
}
```

#### `referrals.json`
```json
{
  "referrals": [{
    "referrerUserId": "u-uuid",
    "referredUserId": "u-uuid",
    "referralCode": "string (4 digits)",
    "status": "inactive|active",
    "createdAt": "ISO-8601",
    "activatedAt": "ISO-8601?"
  }]
}
```

#### `sessions.json`
```json
{
  "sessions": [{
    "token": "uuid",
    "userId": "u-uuid",
    "createdAt": "ISO-8601",
    "expiresAt": "ISO-8601"
  }]
}
```

#### `otp.json`
```json
{
  "otps": [{
    "phone": "string (62xxx)",
    "code": "string (6 digits)",
    "type": "register|login",
    "name": "string?",
    "email": "string?",
    "referralCode": "string?",
    "createdAt": "ISO-8601",
    "expiresAt": "ISO-8601"
  }]
}
```

---

## 4. API Endpoints

### 4.1 Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/request-otp` | No | Send OTP for registration |
| POST | `/api/auth/verify-otp` | No | Verify registration OTP |
| POST | `/api/auth/login-number` | No | Send OTP for login |
| POST | `/api/auth/login-verify` | No | Verify login OTP |
| POST | `/api/auth/logout` | Yes | End session |
| GET | `/api/me` | Yes | Get current user |
| POST | `/api/me` | Yes | Update user profile |
| POST | `/api/me/photo` | Yes | Upload profile photo |

### 4.2 Game

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/game/start` | Yes | Start game session |
| POST | `/api/game/score` | Yes | Submit score |
| GET | `/api/scores/:game/top` | Yes | Game leaderboard |
| GET | `/api/scores/overall/top` | Yes | Overall leaderboard |
| GET | `/api/scores/my` | Yes | User's scores |
| GET | `/api/achievements/catalog` | Yes | All achievements |
| GET | `/api/achievements/my` | Yes | User's achievements |

### 4.3 Referral

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/referral/me` | Yes | User's referral dashboard |
| GET | `/api/referral/validate/:code` | No | Validate referral code |
| GET | `/api/admin/referrals` | Admin | All referrals overview |

### 4.4 Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/stats` | Admin | Platform statistics |
| GET | `/api/admin/users` | Admin | User management |
| POST | `/api/admin/users/:id/ban` | Admin | Ban user |
| POST | `/api/admin/phrases/generate` | Admin | Generate phrases |
| GET | `/api/admin/phrases` | Admin | List phrases |
| POST | `/api/admin/season` | Admin | Manage seasons |

---

## 5. Security Implementation

### 5.1 Authentication Flow
1. User enters phone number
2. Server generates 6-digit OTP, stores with 60-min expiry
3. OTP sent via WAHA WhatsApp API
4. User enters OTP in app
5. Server validates OTP, creates session token (UUID)
6. Session cookie set: `httpOnly`, `sameSite: lax`, 1-year maxAge
7. All subsequent requests authenticated via cookie

### 5.2 Anti-Cheat (Score Validation)
```
HMAC = SHA256(userId + game + score + gameSessionId + serverSecret)
```
- Game session created server-side with `startedAt` timestamp
- Score submission validates: session exists, HMAC matches, reasonable score for elapsed time
- Invalid scores rejected with 400 status

### 5.3 Input Validation
- Phone: regex `/^62\d{9,13}$/`
- Name: 2-50 chars, HTML-escaped
- Email: optional, basic format validation
- OTP: exactly 6 digits
- Referral Code: exactly 4 digits

### 5.4 Access Control
- Public: login, register, OTP verification, referral validation
- Authenticated: games, scores, achievements, profile, referral dashboard
- Admin: user management, phrase generation, season management, referral overview

---

## 6. Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Initial Page Load | < 3s | Lazy-loaded routes |
| API Response Time | < 500ms | 95th percentile |
| Game FPS | 60 FPS | Canvas rendering |
| Memory Usage | < 500MB | Server process |
| Concurrent Users | 50+ | Single instance |
| Database Size | < 1GB | DuckDB + JSON |

### 6.1 Optimization Strategies
- React.lazy + Suspense for code splitting
- Vite tree-shaking and minification
- Phaser WebGL renderer with Canvas fallback
- DuckDB for fast analytical queries (leaderboard)
- JSON files for simple CRUD (low overhead)
- Static asset caching (1-year for hashed files)

---

## 7. Browser Compatibility

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome | 90+ | Full support |
| Firefox | 90+ | Full support |
| Safari | 15+ | Full support |
| Edge | 90+ | Full support |
| Mobile Chrome | 90+ | Touch controls |
| Mobile Safari | 15+ | Touch controls |

### Required Browser Features
- ES2020+ (async/await, optional chaining)
- Canvas 2D / WebGL
- Fetch API
- CSS Grid + Flexbox
- localStorage

---

## 8. External Service Dependencies

### 8.1 WAHA (WhatsApp HTTP API)
- **Purpose:** OTP delivery, welcome messages, login notifications
- **Protocol:** HTTPS REST API
- **Auth:** API key header (`X-Api-Key`)
- **Endpoints Used:**
  - `POST /api/sendText` — Send text messages
- **SLA Requirement:** 99% uptime
- **Fallback:** Graceful error message if WAHA unreachable

### 8.2 OpenAI API
- **Purpose:** Auto-generate Hangman phrases in Indonesian
- **Model:** GPT-4o-mini
- **Rate Limit:** Admin-triggered only (not user-facing)
- **Fallback:** Manual phrase entry via admin panel

---

## 9. Deployment Architecture

### 9.1 Single Server (Current)
```
VPS (1 vCPU, 1GB RAM)
├── Nginx (reverse proxy, SSL termination)
├── Node.js (Fastify server, port 3001)
├── DuckDB (embedded, file-based)
└── JSON files (data/)
```

### 9.2 Scaling Considerations
- **Horizontal scaling not supported** (DuckDB is single-process)
- For higher traffic: migrate to PostgreSQL + Redis sessions
- CDN for static assets (Cloudflare)
- Read replicas for leaderboard queries

---

## 10. Data Flow Diagrams

### 10.1 Registration Flow
```
User → Enter phone+name → POST /api/auth/request-otp
     → Server generates OTP → WAHA sends WhatsApp
     → User enters OTP → POST /api/auth/verify-otp
     → Server creates user + session → Set cookie
     → Server sends welcome WhatsApp → Redirect to dashboard
```

### 10.2 Score Submission Flow
```
User plays game → Game ends → Client sends POST /api/game/score
     → Server validates HMAC + session → Save score
     → Check achievements → Unlock new achievements
     → Check referral activation (2+ games?) → Update referral status
     → Return score + new achievements to client
```

### 10.3 Referral Flow
```
Referrer shares link/code → New user opens link
     → referralCode auto-fills → User registers
     → Referral record created (status: inactive)
     → User plays Game 1 → Still inactive
     → User plays Game 2 → Referral activated! (status: active)
     → Referrer sees updated dashboard
```

---

*Last updated: June 2025 — v4.0.0*
