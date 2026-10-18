# Wave 4D — isolated draft Firebase input-authorization experiment

**Status: test-only staging contract, NOT a secure public build or deployed cloud rules.**

This wave creates a separate demo Firebase RTDB emulator configuration at `firebase.draft-staging-authz-e2e.json`, a conservative Auth UID-based rules prototype in `network/staging/DRAFT_AUTHZ_INPUT_GATE_TEST_ONLY.rules.json`, and an adversarial rules test in `tests/draft-staging-authz-emulator.cjs`. These files are **not** imported by the playable localhost draft labs and do not modify normal public Firebase, Google Sites or production rooms.

## Security architecture under test

`draftStagingRooms/$roomId` is reserved for a **trusted match coordinator** to create player membership, issue temporary connection tokens, rotate those tokens on rejoin and own all result calculations.

An authenticated player can only append an immutable, schema-checked input at `inputs/$uid/$actionId`, update their scoped `positions/$uid` with increasing sequence numbers, and create/delete their *own token-bound* `presence/$uid/$connectionId`. Writes require an active trusted membership, unexpired trusted session, a matching connection token, and a matching trusted match/round/life/playing phase. Attacker-chosen winner, cards, HP, scores, membership, session token, accepted-sequence or full-room updates are denied. Only authenticated joined players can read the server-published `public` summary; `views/$uid` and `receipts/$uid` are only readable by that UID.

Unlike the current localhost gameplay emulator, this prototype **does not expose raw authoritative state or the positions of enemies hidden by stealth/smoke**. A future trusted coordinator must produce filtered visible views. Joining and validation of physical movement/attack rate/collisions are intentionally impossible on these Rules alone.

## What the emulator test should prove

- Anonymous, nonmember, cross-player and cross-connection access denied
- Game result/HP/score/member/session tampering denied
- Player's valid move, shot and presence changes allowed
- Malformed action schema, stale timestamps, out-of-bounds positions and repeated action IDs denied
- Accepted-sequence advancement rejects old actions, old token fails after trusted rejoin rotation
- Membership removal, expiry, death and leaving `playing` phase stop new gameplay input
- Public and player-visible reads restricted to trusted members, with room-wide raw reads denied

## Unresolved publication blockers

- Build and test a separate trusted authoritative match service; prevent spoofed movement/rapid-fire by server validation and rate limits. **Raw player input passing Rules does not prove a real combat hit.**
- Provision an intentionally separate staging Firebase project and Authentication (not done), bind actual sign-in UIDs and remove the need for the test-only admin fixture.
- Test real hosted Auth/Rules, Safari input, foreground/background recovery, Google Sites embedding and malicious multi-client behavior. Security Rules tests are necessary but not sufficient.
- Leave `network/release/DRAFT_DENY_ALL_BASELINE.rules.json` unchanged until the complete trusted architecture is proven and the owner approves publication.

The normal published versions and their current rooms remain unchanged. Test-only rules are **never to be deployed** as production config.
