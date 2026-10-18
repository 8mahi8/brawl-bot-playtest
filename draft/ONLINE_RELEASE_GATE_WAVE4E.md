# BRAWL Draft Wave 4E — trusted 2vs2 combat core (local emulator only)

**Implementation status: pure trusted reducer + privileged emulator consumer; not wired into playable Safari labs, not deployed to cloud and not a public release.**

## Change in authority

In Wave 4D, a draft player could write `positions/$uid` directly within broad bounds. This was insufficient to stop teleports. Wave 4E changes `network/staging/DRAFT_AUTHZ_INPUT_GATE_TEST_ONLY.rules.json`: no browser can write authoritative positions anymore. A valid joined UID may append a bounded `move` intent (`dx,dy`, -1..1), or a shot intent; incoming sequence increments are capped to a 32-action window. The test suite explicitly denies even a player's **own** direct position write.

The trusted core in `draft/trusted-match-core.cjs` is **not shipped to the browser**. It computes movement distance from server timestamps, caps each step to 120ms at 0.25 px/ms, ignores client-reported `x,y`, checks world boundaries and solid rectangles, applies conservative straight-line wall-aware hits, 450ms shot cooldown, ammo use, KO, team result and server-owned score. The test uses one 10-damage simplified shot per accepted attack for isolation; **these are NOT the current BRAWL Tank multi-pellet/character/ULT physics** and must not be substituted into the playable game unchanged.

`draft/trusted-match-service.cjs` is the prototype trusted consumer. It fetches the already Rule-authorized UID's input from RTDB, verifies membership, session token and expiry, performs a server-side RTDB transaction, and publishes only narrow per-player views, receipts and a public scoreboard. The consumer is exercised in the RTDB test using a rules-disabled *test harness* as the trusted service role — not a browser privilege or real deployed backend. Never put privileged credentials or emulator bypass in HTML or Google Sites.

## Evidence gates

- `tests/draft-trusted-match-core.cjs`: server-only hit geometry, fake-origin rejection, teammates, wall blocking, capped motion, cooldown/replay, phase and team KO.
- `tests/draft-staging-authz-emulator.cjs`: prior Auth UID privacy/anti-tamper matrix, now with direct-position write denial and scoped move intents.
- `tests/draft-trusted-match-emulator.cjs`: actual authenticated RTDB player inputs, isolated trusted-emulator consumption, protected positions, non-replay, two genuine server-computed kills, score and phase reflected in filtered public view.
- CI: `.github/workflows/draft-staging-authz.yml` runs all three and freezes normal public versions.

## Still blocking deployment

1. **Authoritative full gameplay parity.** Port existing 1vs1/2vs2 combat timing, projectile flight, all four characters, walls, skills, ULT, GAD2 and card effects into tested trusted server mechanics; simplified hitscan is only a security prototype.
2. **A real backend runtime.** A trusted Cloud Function / server process is not yet provisioned or deployed. Queue delivery, concurrent workers, pending receipt recovery, projection monotonicity, room creation and failure replay need hardening.
3. **Firebase Auth/join lifecycle.** Real UID sign-in, per-seat authorization and secure rejoin must be implemented and tested in a separate cloud staging project. The unit test uses synthetic authenticated contexts.
4. **Client latency & Safari controls.** Verify real school iPad landscape Safari/Google Sites touch and performance; credible low-latency authoritative predictions cannot be proved by rules tests.
5. **Release approval.** Keep `network/release/DRAFT_DENY_ALL_BASELINE.rules.json`, existing Google Sites, production Firebase and normal public HTML unchanged until the owner explicitly approves a separate draft publication.

## Security caveat

Some client command fields (`x,y,at`) are still present for compatibility with the earlier local protocol. The trusted reducer **does not** use user-supplied position to determine movement or hits. The Auth UID rules alone are not sufficient to validate shot frequency, full game rules or against malicious cloud clients. Browser-host authority must not be treated as production security.
