# BRAWL Tactical Draft — Wave 2D: 2vs2 Ricochet (localhost emulator only)
2026-10-19

Scope: 2vs2's isolated host reducer and local RTDB/WebKit test suite. No normal published sites, Google Sites or production Firebase auth/rules are altered.

Ricochet: each eligible normal projectile may reflect off unambiguous wall faces a single time and retains 70% damage afterwards. Unowned bullets take the original fast path. At corners where neither or both wall axes are independently blocked, projectiles stop; wall penetration is forbidden. A split-center projectile retains the one-bounce budget on both daughters, retains original fireActionId, and applies each damage multiplier only once.

Bomber: normal throw follows a single planar reflected path if card-equipped; the same bomb (or normal split mini-bombs) detonates with 70% damage after bounce. Ambiguous wall corners terminate at last safe position. Ultimate/gadget trajectories are unchanged.

Regression tests include VM-executed real host functions for wall, corner, second bounce, damage stacking, and Bomber terrain, plus a four-WebKit-client Firebase emulator test verifying at least one persisted host bounce and the existing actual delayed-blast HP sync.

Next: port the validated ricochet semantics independently to isolated 1vs1; verify real iPad and production Auth/Rules before any public draft release.
