# BRAWL Tactical Draft — 2vs2 Wave 2C (emulator lab)

This is an isolated localhost-only port of split_round. Prior PR #66/#68 delayed-blast host resolution and #67 1vs1 implementation are kept intact.

* Normal center projectile alone splits at half range: 2 daughters, 60% damage each, no recursion. Tank five, Gunner three, Sniper one original volleys preserve original projectile damage/falloff, range and host collision.
* Normal Bomber attack becomes two small side-offset bombs: 50% damage, 72% radius, enhanced slow/DoT only once. Ult and gadget remain unaffected.
* Children and mini-bombs retain the original fireActionId. Followthrough must not trigger again on a second daughter; delayed blast uses the existing host-side once-per-volley dedupe with 700ms/10 damage/55 radius/3-second cooldown.
* Node deterministic unit tests invoke the exact split physics from the standalone HTML and verify same-volley prevention. Four-client WebKit E2E verifies one host split and confirms existing live delayed-blast damage and HP synchronization.
* No published normal game HTML, Firebase production Auth/Rules, Google Sites, or production game endpoints changed. Public draft release remains gated on security/seat verification, reconnect behavior and real iPad Safari.

Remaining: ricochet, five GAD2 cards, 2vs2 timed Hot Zone draft.
