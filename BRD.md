# KutuLoncat Games — Business Requirements Document (BRD)

**Version:** 4.0.0
**Date:** June 2025
**Author:** Syaeful Azil

---

## 1. Executive Summary

KutuLoncat Games is a web-based casual gaming platform designed for the Indonesian market. The platform provides free-to-play browser games with social features to drive user engagement and organic growth through a referral system.

---

## 2. Business Objectives

### 2.1 Primary Goals

1. **User Acquisition:** Attract new users through organic sharing and referral incentives
2. **User Engagement:** Maximize session frequency and duration through gamification (achievements, leaderboards)
3. **User Retention:** Encourage return visits via competitive leaderboards and achievement collecting
4. **Growth:** Scale user base through viral referral mechanics

### 2.2 Key Metrics (KPIs)

| Metric                   | Target | Description                       |
| ------------------------ | ------ | --------------------------------- |
| DAU                      | 100+   | Daily Active Users                |
| MAU                      | 500+   | Monthly Active Users              |
| Avg. Session Duration    | 5+ min | Time per visit                    |
| Referral Conversion Rate | 20%+   | % of referrals that become active |
| Retention (D7)           | 30%+   | Users returning after 7 days      |
| Games/Session            | 3+     | Average games played per visit    |

---

## 3. Business Rules

### 3.1 Referral System

- **BR-REF-01:** Each user receives one unique 4-digit referral code upon registration
- **BR-REF-02:** A referral is considered "active" when the referred user has played at least 2 different games
- **BR-REF-03:** Each active referral is valued at Rp2,000
- **BR-REF-04:** Referral codes must be unique across the entire platform
- **BR-REF-05:** Users cannot refer themselves
- **BR-REF-06:** Referral value is informational/motivational (not cash payout by default)

### 3.2 Authentication

- **BR-AUTH-01:** WhatsApp is the sole authentication channel (no email/password)
- **BR-AUTH-02:** OTP is required for both registration AND login (security first)
- **BR-AUTH-03:** OTP validity period: 60 minutes
- **BR-AUTH-04:** Indonesian phone numbers only (+62 prefix)

### 3.3 Content

- **BR-CONT-01:** All game content is in Bahasa Indonesia
- **BR-CONT-02:** Game phrases are auto-generated daily (Hangman)
- **BR-CONT-03:** Content must be appropriate for ages 13+
- **BR-CONT-04:** User-generated content (names) must be HTML-escaped

### 3.4 Competition

- **BR-COMP-01:** Leaderboards visible to all authenticated users
- **BR-COMP-02:** Privacy: other users' names are masked (3 chars + \*\*\*\*)
- **BR-COMP-03:** Anti-cheat measures prevent score manipulation
- **BR-COMP-04:** Season system allows periodic leaderboard resets

---

## 4. Stakeholders

| Role          | Name              | Responsibility                     |
| ------------- | ----------------- | ---------------------------------- |
| Product Owner | Syaeful Azil      | Feature prioritization, acceptance |
| Developer     | Syaeful Azil      | Full-stack development             |
| Admin         | Syaeful Azil      | Content management, user support   |
| End Users     | Indonesian gamers | Playing games, providing feedback  |

---

## 5. Revenue Model

### 5.1 Current (v4.0)

- Free-to-play platform
- Referral system for organic growth (Rp2,000 motivational value per active referral)

### 5.2 Future Considerations

- In-game advertisements (banner, interstitial)
- Premium features or cosmetics
- Sponsored game content
- Tournament entry fees

---

## 6. Risk Assessment

| Risk                     | Impact   | Likelihood | Mitigation                            |
| ------------------------ | -------- | ---------- | ------------------------------------- |
| WAHA gateway downtime    | High     | Medium     | Graceful error handling, retry logic  |
| WhatsApp API rate limits | Medium   | Medium     | Rate limiting on OTP requests         |
| Score cheating           | Medium   | High       | HMAC anti-cheat, server validation    |
| DuckDB corruption        | High     | Low        | JSON fallback, auto-recovery          |
| User data breach         | Critical | Low        | No password storage, httpOnly cookies |

---

## 7. Success Criteria

The v4.0 release is considered successful when:

1. All 4 games are playable without errors
2. Referral system generates at least 10 referrals within first month
3. Overall leaderboard accurately ranks all active players
4. OTP login works reliably via WhatsApp
5. Welcome messages are delivered to new registrations
6. Zero critical bugs in production

---

## 8. Dependencies

| Dependency                | Type             | Risk   |
| ------------------------- | ---------------- | ------ |
| WAHA WhatsApp Gateway     | External Service | Medium |
| WhatsApp Business API     | External Service | Medium |
| Hosting (VPS/Cloud)       | Infrastructure   | Low    |
| Domain (kutuloncat.my.id) | Infrastructure   | Low    |
| DuckDB                    | Database Engine  | Low    |
