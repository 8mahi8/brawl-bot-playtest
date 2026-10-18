# BRAWL Draft Online — Wave 4A Release Gate

This is a **test-only** change on the isolated 2vs2 RTDB localhost emulator. No production Firebase, normal public HTML, or Google Sites changes.

## Gate A: Natural combat victory
Prior end-to-end tests forced the KO outcome by writing winner and scores. The first round is now played through two actual blue-team Tank normal attacks, fired by the same Safari/WebKit clients as a real player. The test fixture lowers **only** both opponents' HP to 1 and arranges a clear map lane. The host alone must perform normal collision and damage, eliminate the opponents, set blue score to 1 and enter the real draft. The remaining round-1 draft and all subsequent round transitions still use the full 4-client draft sequence. Other fixtures deliberately force later KO transitions for efficient regression of 5 GAD2 effects.

## Gate B: Actual connection interruption and same-seat resume
In the fifth combat round, a non-host participant calls Firebase RTDB goOffline(). The server must remove presence through its registered onDisconnect handler, all clients pause, and the combat clock must freeze. The **same Safari/WebKit tab** then reloads preserving sessionStorage, rejoins the existing room with the same seat and player identity, and obtains a new Firebase connection token. The host resumes only after all 4 are present. Scores, round, drafted cards and host ownership must survive.

## Remaining release blockers
- The actual school's physical landscape iPad Safari performance/input test.
- Production-secure Firebase Auth and RTDB rules on a separately provisioned database; do **not** alter the normal game's live configuration.
- Dedicated reconnect scenarios for host migration, browser suspension beyond 15s and simultaneous disconnects.
- 1vs1 GAD2, HOT ZONE draft and standalone publishable offline/online artifacts remain separate deliverables.
