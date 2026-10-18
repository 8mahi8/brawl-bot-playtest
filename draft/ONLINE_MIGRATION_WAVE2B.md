# BRAWL Tactical Draft — Online Wave 2B (1vs1)
2026-10-18 | LOCAL RTDB emulator only; not a public release.

This change cherry-picks only 1vs1 duel implementation and tests from PR #65 onto main after PR #66.
It deliberately does NOT overwrite PR #66's 2vs2 host-authoritative delayed blast.

- 1vs1 split_round: normal center pellet splits into 2 children at half range; each child is 60% damage. Ordinary Bomber bomb becomes 2 small half-damage bombs. No ultimate recursion.
- 1vs1 delayed_blast: first normal hit of a fire action schedules +700ms 10-damage radius-55 effect at host RTDB state; 3s cooldown, original fireId dedupe, no effect recursion.
- Unit + browser E2E include Tank/Gunner same-volley validation, host/guest synchronized damage, split proof, and checks of draft restrictions.
- Existing normal 1vs1/2vs2, Firebase production Rules/Auth, and Google Sites are unchanged.

Reused source PR #65 commit f4b3a439a5de28bd3df31abca19dd1ac6f62138e (its 1vs1 suite passed there).
Integration must independently pass new CI; no claims of real iPad production readiness before that check.
Remaining: authoritative 2vs2 live-blast HP E2E, 2vs2 split, ricochet, GAD2, HOT ZONE draft, and production security/seat rules.
