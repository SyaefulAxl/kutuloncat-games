# 🧪 Referral System — Human Testing Action Plan

## Prerequisites

- Running server on `localhost:3001` + frontend on `localhost:5173`
- WAHA configured (for OTP login) or use bypass login
- At least **2 phone numbers** available for testing
- Admin panel access

---

## Test Scenario 1: Registration with Referral Code

### User A (Referrer)

1. **Login** with phone `+6283131372021` (or any existing user)
2. Go to **Referral Dashboard** (`/referral`)
3. ✅ Verify: Referral code is displayed (e.g. `ABCD1234`)
4. ✅ Verify: Referral link is displayed (e.g. `https://domain.com/login?ref=ABCD1234`)
5. **Copy the referral code** — click the copy icon button
6. ✅ Verify: Only the code button shows checkmark (not the link button too)
7. **Copy the referral link** — click "Salin Link" button
8. ✅ Verify: Only the link button shows "✅ Tersalin" (not the code button)
9. Note the referral code for User B

### User B (Referred)

10. Open an **incognito/private** browser window
11. Navigate to login page with referral: `/login?ref=ABCD1234`
12. ✅ Verify: Referral code auto-fills in the registration form
13. Register with a **new phone number** (e.g. `+6285871353797`)
14. Complete OTP verification
15. ✅ Verify: Registration succeeds with referral attached

---

## Test Scenario 2: Referral Activation

### User B (After Registration)

16. Go to **Dashboard** → play **Game 1** (e.g., Hangman / Tebak Kata)
17. Complete at least 1 round (score gets submitted)
18. Go back, play **Game 2** (e.g., Snake)
19. Complete at least 1 round
20. ✅ Verify: User B has now played 2+ different games

### User A — Check Dashboard

21. Switch back to User A's browser
22. Go to **Referral Dashboard** (`/referral`)
23. ✅ Verify: User B appears in the referral list
24. ✅ Verify: Status shows **✅ Aktif** (since User B played 2+ games)
25. ✅ Verify: Total earnings incremented by `Rp5,000` (default per referral)

---

## Test Scenario 3: Admin Referral View

26. Login as admin and go to **Admin Panel** (`/admin`)
27. Open the **"Referral Management"** section
28. ✅ Verify: Summary cards show correct totals (Total, Aktif, Belum Aktif, Total Bonus)
29. ✅ Verify: Per-referrer breakdown shows User A as referrer
30. ✅ Verify: Under User A, User B appears with **✅ Aktif** status + activation date
31. ✅ Verify: User B's phone number is visible
32. Click **"Refresh Referrals"** button
33. ✅ Verify: Data refreshes without errors

---

## Test Scenario 4: Inactive Referral

34. Register **User C** with User A's referral code but do NOT play any games
35. Check User A's referral dashboard
36. ✅ Verify: User C appears with **⏳ Belum Aktif** status
37. Check admin panel referral section
38. ✅ Verify: User C listed as inactive under User A
39. Have User C play **only 1 game** (not 2)
40. ✅ Verify: Status remains **⏳ Belum Aktif** (needs 2+ different games)

---

## Test Scenario 5: Invalid/Self Referral

41. Try registering with your own referral code
42. ✅ Verify: Error or prevention (cannot self-refer)
43. Try registering with an invalid/nonexistent referral code
44. ✅ Verify: Validation error — "Kode referral tidak valid"

---

## Test Scenario 6: Copy Buttons Independence

45. Go to Referral Dashboard
46. Click **Copy Code** button → check icon appears on code button ONLY
47. Wait 2 seconds → check icon disappears
48. Click **Salin Link** button → "✅ Tersalin" appears on link button ONLY
49. Wait 2 seconds → reverts to "Salin Link"
50. Click both rapidly → each manages its own state independently

---

## Expected Results Summary

| #   | Test                     | Expected                           |
| --- | ------------------------ | ---------------------------------- |
| 1   | Referral code displayed  | Unique code shown                  |
| 2   | Copy code                | Only code button shows ✅          |
| 3   | Copy link                | Only link button shows ✅          |
| 4   | Register with code       | New user linked to referrer        |
| 5   | Play 2 games → activated | Status changes to Aktif            |
| 6   | Earnings updated         | +Rp5,000 per active referral       |
| 7   | Admin view               | All referrals visible with details |
| 8   | Inactive referral        | Shows ⏳ until 2 games played      |
| 9   | Self-referral            | Rejected                           |
| 10  | Invalid code             | Validation error                   |

---

## Ideas & Remarks

### 💡 Future Ideas

- **Referral leaderboard**: Show who referred the most users
- **Tiered bonuses**: Higher rewards for referrers with 5+, 10+ active referrals
- **Referral notifications**: WhatsApp message to referrer when their referral activates
- **Shared earning**: Give referred user a small bonus too (both sides win)
- **Expiry system**: Referrals that don't activate within 30 days could expire

### ⚠️ Known Considerations

- Referral activation check runs on score submission — status may not update immediately until User B submits a score in their 2nd game
- The admin `/api/admin/referrals` endpoint also runs an activation check on each call, so opening the admin panel will catch any missed activations
- Phone numbers are visible to admin only (masked for regular users in their referral list)
