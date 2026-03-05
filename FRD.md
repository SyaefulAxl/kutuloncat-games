# KutuLoncat Games — Functional Requirements Document (FRD)

**Version:** 4.0.0
**Date:** June 2025
**Author:** Syaeful Azil

---

## 1. Overview

This document describes the functional requirements for KutuLoncat Games, a web-based casual gaming platform with social features. The system provides browser-based games with leaderboards, achievements, referral tracking, and WhatsApp-integrated authentication.

---

## 2. User Roles

### 2.1 Player (Default Role)

- Register and login via WhatsApp OTP
- Play 4 browser-based games
- View personal scores and achievements
- View leaderboards (per-game and overall)
- Manage referral code and view referral dashboard
- Update profile (name, photo)

### 2.2 Guest (Test Environment Only)

- Access games on `test.kutuloncat.my.id` without registration
- Limited functionality (no persistent data)

### 2.3 Admin

- Manage game content (phrases)
- Manage users (CRUD)
- Archive score seasons
- View referral reports
- Configure game settings

---

## 3. Feature Specifications

### 3.1 Registration Flow

**Trigger:** User visits registration page
**Steps:**

1. User enters name, phone number, email (optional), referral code (optional)
2. System validates phone format and normalizes to +62 format
3. System checks if phone already registered (JSON + DuckDB)
4. If registered → redirect to login
5. If new → generate 6-digit OTP, store with 60-min expiry
6. Send OTP via WhatsApp (WAHA gateway)
7. User enters OTP code
8. System verifies OTP → creates user account
9. Generate unique 4-digit referral code for user
10. If referral code provided → create referral tracking record
11. Send welcome WhatsApp message
12. Create session, set cookie, redirect to dashboard

**Error Handling:**

- Invalid phone format → 400 error
- OTP expired → prompt to request new one
- WAHA send failure → show warning, allow retry

### 3.2 Login Flow (OTP Required)

**Trigger:** User clicks login
**Steps:**

1. User enters phone number
2. System checks if phone is registered
3. If not registered → 404 error
4. Generate 6-digit OTP, send via WhatsApp
5. User enters OTP code
6. System verifies OTP → creates session
7. Send login notification via WhatsApp
8. Set cookie, redirect to dashboard

### 3.3 Referral System

**Code Generation:**

- 4-digit numeric code (1000-9999)
- Guaranteed unique among all users
- Auto-generated on registration or first login

**Referral Link:**

- Format: `https://kutuloncat.fun?ref=XXXX`
- Auto-fills referral code on registration page
- Shows referrer name for confirmation

**Activation Criteria:**

1. Referred user successfully registered
2. Referred user used the referral code during registration
3. Referred user has played at least 2 different games

**Value:**

- Each active referral = Rp2,000
- Total earnings = active referrals × Rp2,000

**Dashboard Features:**

- Display personal referral code and shareable link
- Copy-to-clipboard functionality
- Stats: total referrals, active count, inactive count, total earnings
- List of referrals with name, join date, and status

### 3.4 Overall Leaderboard

**Composite Score Formula:**

```
Composite = Sum(Best Score per Game) + Achievement Points + Diversity Bonus + Play Count Bonus
```

Where:

- **Best Score per Game:** Highest single score in each of the 4 games
- **Achievement Points:** Sum of points from all unlocked achievements (10-300 pts each)
- **Diversity Bonus:** 10 points per unique game played
- **Play Count Bonus:** 1 point per game played (max 100)

**Display:**

- Top 20 players ranked by composite score
- Shows: rank, name, composite score, games played, achievement count, total plays
- Name masking for privacy (show own name, mask others)

### 3.5 Achievement System

**Rarity Tiers:**
| Tier | Points Range | Color |
|------|-------------|-------|
| Common | 10 pts | Green |
| Uncommon | 15-30 pts | Blue |
| Rare | 35-60 pts | Purple |
| Epic | 50-100 pts | Orange |
| Legendary | 150-300 pts | Gold |

**Total Achievements:** 71
**Categories:** Game-specific, cross-game, time-based, quirky/funny, exact score

### 3.6 Games

#### 3.6.1 Tebak Kata (Hangman)

- Indonesian phrases with hints
- 6 wrong guesses allowed
- Score based on phrase length, difficulty, speed
- Daily-generated phrases (100+ per day)

#### 3.6.2 Fruit Ninja

- Canvas-based fruit slicing game
- 3 stages with increasing difficulty
- Bombs to avoid, combos for bonus points
- 3 lives system

#### 3.6.3 Flappy Bird

- Canvas-based pipe navigation
- Score = pipes passed
- Increasing difficulty

#### 3.6.4 Snake

- Canvas-based snake game
- Multiple difficulty levels (including "Gak Ngotak")
- Score based on food collected
- Combo system

---

## 4. WhatsApp Messages

### 4.1 OTP (Registration)

```
Kode OTP KutuLoncat: XXXXXX (berlaku 60 menit)
```

### 4.2 OTP (Login)

```
Kode OTP Login KutuLoncat: XXXXXX (berlaku 60 menit)
```

### 4.3 Welcome Message

```
🎮 *Selamat datang di KutuLoncat Games!* 🎮

Halo *{name}*! 👋

Kamu berhasil terdaftar di KutuLoncat Games. 🎊

🕹️ Game yang tersedia:
• 🔤 Tebak Kata (Hangman)
• 🍉 Fruit Ninja
• 🐦 Flappy Bird
• 🐍 Snake

Mainkan game dan kumpulkan achievement! 🏆
Ajak teman pakai kode referralmu untuk bonus! 💰

> Selamat bermain dan semoga beruntung! 🍀

Kunjungi: kutuloncat.fun
```

### 4.4 Login Notification

```
🔐 *KutuLoncat Games — Login Berhasil*

Halo *{name}*! 👋
Kamu berhasil login di KutuLoncat Games.

Selamat bermain! 🎮🕹️
```

---

## 5. Acceptance Criteria

| Feature      | Criteria                                                |
| ------------ | ------------------------------------------------------- |
| Registration | User receives OTP, verifies, gets welcome message       |
| Login        | OTP required, session created, notification sent        |
| Referral     | Code generated, link works, activation tracks correctly |
| Overall LB   | Composite scores calculated and ranked correctly        |
| Games        | All 4 games playable, scores submit correctly           |
| Achievements | 71 achievements track and award correctly               |
| Admin        | Full CRUD operations functional                         |
