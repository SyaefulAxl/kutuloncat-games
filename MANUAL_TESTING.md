# KutuLoncat Games — Manual Testing Checklist (Human QA)

> For testers to verify features that automated tests **cannot** cover.  
> Report findings using the template at the bottom.

---

## 1. Registration & OTP Flow

| #   | Test Case              | Steps                                                   | Expected Result                                                               | Pass? |
| --- | ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- | ----- |
| 1.1 | Register new user      | Open app → "Daftar" → enter name, phone, email → Submit | OTP input appears; WhatsApp OTP received within 30s                           | ☐     |
| 1.2 | Verify OTP             | Enter correct 6-digit code                              | Redirected to dashboard; welcome WhatsApp message received                    | ☐     |
| 1.3 | Wrong OTP              | Enter wrong code 3 times                                | Error message shown; not logged in                                            | ☐     |
| 1.4 | Register with referral | Add `?ref=XXXX` to URL → register                       | Referral code pre-filled; after registration, appears in referrer's dashboard | ☐     |
| 1.5 | Duplicate phone        | Try to register with existing phone                     | Error: "nomor sudah terdaftar" or similar                                     | ☐     |

---

## 2. Login Flow (OTP Required)

| #   | Test Case                     | Steps                                     | Expected Result                               | Pass? |
| --- | ----------------------------- | ----------------------------------------- | --------------------------------------------- | ----- |
| 2.1 | Login existing user           | "Masuk" → enter registered phone → Submit | OTP sent via WhatsApp; OTP input shown        | ☐     |
| 2.2 | Verify login OTP              | Enter correct OTP                         | Redirected to dashboard; name shown correctly | ☐     |
| 2.3 | Login with non-existing phone | Enter unregistered phone                  | Error: "pengguna belum terdaftar"             | ☐     |
| 2.4 | Session persistence           | Login → close browser → reopen            | User still logged in (cookie valid)           | ☐     |

---

## 3. Games — Playability

### 3.1 Hangman

| #     | Test Case      | Steps                         | Expected                                                    | Pass? |
| ----- | -------------- | ----------------------------- | ----------------------------------------------------------- | ----- |
| 3.1.1 | Play full game | Start Hangman → guess letters | Game displays phrase, keyboard works, win/lose screen shows | ☐     |
| 3.1.2 | Win scenario   | Guess all letters correctly   | Score appears, achievements toast shows                     | ☐     |
| 3.1.3 | Lose scenario  | Miss 6 letters                | "Kalah" screen, correct phrase revealed                     | ☐     |
| 3.1.4 | Hint display   | Check if hint text is shown   | Hint visible and matches phrase category                    | ☐     |

### 3.2 Fruit Ninja

| #     | Test Case         | Steps                         | Expected                                        | Pass? |
| ----- | ----------------- | ----------------------------- | ----------------------------------------------- | ----- |
| 3.2.1 | Swipe fruits      | Start game → swipe on screen  | Fruits slice with animation; score increases    | ☐     |
| 3.2.2 | Bomb avoidance    | Avoid bombs                   | Hitting bomb deducts life; game over on 0 lives | ☐     |
| 3.2.3 | Stage progression | Play through stages           | Difficulty increases; fruits move faster        | ☐     |
| 3.2.4 | Combo system      | Slice multiple fruits quickly | Combo counter shows; bonus points awarded       | ☐     |

### 3.3 Flappy Bird

| #     | Test Case           | Steps                | Expected                             | Pass? |
| ----- | ------------------- | -------------------- | ------------------------------------ | ----- |
| 3.3.1 | Tap to fly          | Click/tap screen     | Bird flaps; passes through pipe gaps | ☐     |
| 3.3.2 | Collision detection | Hit a pipe or ground | Game over screen; score displayed    | ☐     |
| 3.3.3 | Pipe gap consistent | Play multiple rounds | Pipes have consistent gap size       | ☐     |
| 3.3.4 | Score counting      | Pass pipes           | Score increments by 1 per pipe       | ☐     |

### 3.4 Snake

| #     | Test Case            | Steps                     | Expected                                         | Pass? |
| ----- | -------------------- | ------------------------- | ------------------------------------------------ | ----- |
| 3.4.1 | Arrow key movement   | Use arrow keys / swipe    | Snake moves in direction; grows when eating food | ☐     |
| 3.4.2 | Self-collision       | Run into own body         | Game over screen                                 | ☐     |
| 3.4.3 | Wall collision       | Run into wall             | Game over screen                                 | ☐     |
| 3.4.4 | Difficulty selection | Choose mudah/sedang/susah | Speed differs based on difficulty                | ☐     |

---

## 4. Leaderboard

| #   | Test Case            | Steps                               | Expected                                                                            | Pass? |
| --- | -------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- | ----- |
| 4.1 | Per-game leaderboard | Play a game → check leaderboard tab | Scores sorted descending; own name not masked; others masked                        | ☐     |
| 4.2 | Overall leaderboard  | Navigate to overall leaderboard     | Composite scores shown; formula: totalBest + achievementPts + diversity + playCount | ☐     |
| 4.3 | Score updates live   | Submit new high score → check board | New score appears immediately                                                       | ☐     |

---

## 5. Achievements

| #   | Test Case           | Steps                         | Expected                                           | Pass? |
| --- | ------------------- | ----------------------------- | -------------------------------------------------- | ----- |
| 5.1 | Achievement toast   | Score a new achievement       | Toast notification appears with achievement name   | ☐     |
| 5.2 | Achievement catalog | Navigate to achievements page | 71 achievements shown; unlocked ones highlighted   | ☐     |
| 5.3 | Rarity indicators   | Check achievement details     | Common/Uncommon/Rare/Epic/Legendary labels visible | ☐     |
| 5.4 | Progress percentage | Check progress bar            | Percentage matches unlocked/total ratio            | ☐     |

---

## 6. Referral System (v4.0 NEW)

| #   | Test Case             | Steps                                | Expected                                                               | Pass? |
| --- | --------------------- | ------------------------------------ | ---------------------------------------------------------------------- | ----- |
| 6.1 | View referral page    | Login → navigate to /referral        | Referral code shown; copy button works; stats displayed                | ☐     |
| 6.2 | Share referral link   | Click share/copy referral link       | Link copies to clipboard in format `https://kutuloncat.my.id?ref=XXXX` | ☐     |
| 6.3 | Referral validation   | Open app with `?ref=XXXX` → register | Referrer name shown (masked); registration proceeds                    | ☐     |
| 6.4 | Referral activation   | New user plays 2+ different games    | In referrer's dashboard: referred user status changes to "Aktif"       | ☐     |
| 6.5 | Earnings calculation  | After referral is active             | Earnings = activeCount × Rp2,000                                       | ☐     |
| 6.6 | Invalid referral code | Use `?ref=0000` → register           | Warning: "Kode referral tidak valid" or ignored silently               | ☐     |

---

## 7. Profile

| #   | Test Case       | Steps                        | Expected                               | Pass? |
| --- | --------------- | ---------------------------- | -------------------------------------- | ----- |
| 7.1 | Update name     | Profile → change name → save | Name updated; reflected on leaderboard | ☐     |
| 7.2 | Name max length | Enter 200+ characters        | Name truncated to 40 chars             | ☐     |
| 7.3 | Upload photo    | Profile → upload photo       | Photo displayed; max 2MB enforced      | ☐     |

---

## 8. Admin Panel

| #   | Test Case              | Steps                                  | Expected                                                       | Pass? |
| --- | ---------------------- | -------------------------------------- | -------------------------------------------------------------- | ----- |
| 8.1 | Access admin           | Navigate to /admin                     | Admin panel loads (no password in dev mode)                    | ☐     |
| 8.2 | Manage phrases         | Add/edit/delete a phrase               | Changes reflected in hangman game                              | ☐     |
| 8.3 | Manage users           | View user list; check referral columns | All users shown; referral_code and referred_by columns visible | ☐     |
| 8.4 | View referral overview | Admin → referrals tab                  | All referrers listed with their referral counts                | ☐     |
| 8.5 | Season reset           | Create new season                      | Current scores archived; leaderboard resets                    | ☐     |
| 8.6 | WAHA diagnostics       | Admin → WAHA section                   | Connection status shown                                        | ☐     |

---

## 9. WhatsApp Messages (v4.0 NEW)

| #   | Test Case          | Steps                 | Expected                                    | Pass? |
| --- | ------------------ | --------------------- | ------------------------------------------- | ----- |
| 9.1 | OTP message        | Request OTP           | WhatsApp message with 6-digit code received | ☐     |
| 9.2 | Welcome message    | Complete registration | Welcome message with instructions received  | ☐     |
| 9.3 | Login notification | Login via OTP         | Login notification message received         | ☐     |
| 9.4 | Message formatting | Check all messages    | Proper emoji, line breaks, clickable links  | ☐     |

---

## 10. Mobile / Responsive

| #    | Test Case        | Steps                           | Expected                            | Pass? |
| ---- | ---------------- | ------------------------------- | ----------------------------------- | ----- |
| 10.1 | Mobile portrait  | Open on phone (portrait)        | All pages fit; no horizontal scroll | ☐     |
| 10.2 | Mobile landscape | Rotate phone                    | Games playable; UI adjusts          | ☐     |
| 10.3 | Tablet           | Open on tablet                  | Layout scales properly              | ☐     |
| 10.4 | Touch controls   | Play all 4 games on touchscreen | All games responsive to touch/swipe | ☐     |

---

## 11. Cross-Browser

| #    | Test Case          | Browser         | Pass? |
| ---- | ------------------ | --------------- | ----- |
| 11.1 | Chrome (Desktop)   | Chrome 120+     | ☐     |
| 11.2 | Firefox (Desktop)  | Firefox 120+    | ☐     |
| 11.3 | Safari (macOS/iOS) | Safari 17+      | ☐     |
| 11.4 | Chrome (Android)   | Chrome Mobile   | ☐     |
| 11.5 | Samsung Internet   | Samsung Browser | ☐     |

---

## 12. Edge Cases & Error Handling

| #    | Test Case     | Steps                             | Expected                                  | Pass? |
| ---- | ------------- | --------------------------------- | ----------------------------------------- | ----- |
| 12.1 | Offline mode  | Disconnect internet → play        | Graceful error message; data not lost     | ☐     |
| 12.2 | Rapid clicks  | Click buttons rapidly             | No duplicate submissions; UI stays stable | ☐     |
| 12.3 | Back button   | Use browser back during game      | Returns to previous page without crash    | ☐     |
| 12.4 | Long session  | Leave app open 1+ hour → interact | Session still valid; no re-login needed   | ☐     |
| 12.5 | Multiple tabs | Open app in 2 tabs; play in both  | Both tabs work; scores saved correctly    | ☐     |

---

## Reporting Template

When reporting issues, use this format:

```
**Test ID**: [e.g., 3.2.1]
**Status**: FAIL / PARTIAL / PASS
**Device**: [e.g., iPhone 15 Pro / Chrome 132 / Android 14]
**Steps to Reproduce**:
1. ...
2. ...
3. ...

**Expected**: [what should happen]
**Actual**: [what actually happened]
**Screenshot/Video**: [attach if possible]
**Severity**: Critical / Major / Minor / Cosmetic
```

---

## Summary Checklist

| Area               | Total Tests | Passed  | Notes |
| ------------------ | ----------- | ------- | ----- |
| Registration & OTP | 5           | /5      |       |
| Login              | 4           | /4      |       |
| Hangman            | 4           | /4      |       |
| Fruit Ninja        | 4           | /4      |       |
| Flappy Bird        | 4           | /4      |       |
| Snake              | 4           | /4      |       |
| Leaderboard        | 3           | /3      |       |
| Achievements       | 4           | /4      |       |
| Referral           | 6           | /6      |       |
| Profile            | 3           | /3      |       |
| Admin              | 6           | /6      |       |
| WhatsApp           | 4           | /4      |       |
| Mobile             | 4           | /4      |       |
| Cross-Browser      | 5           | /5      |       |
| Edge Cases         | 5           | /5      |       |
| **TOTAL**          | **65**      | **/65** |       |
