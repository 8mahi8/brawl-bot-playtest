# BRAWL Draft Online — Wave 4C: UI parity and Firebase release boundaries

## What was actually verified

The **1vs1** and **2vs2** draft labs retain the baseline iPad online-lab CSS exactly, and all ordinary HTML elements with IDs retain their tags and attributes. The only new DOM IDs are draft UI. The test also checks common pointer/keyboard/window event registration markers, checks localhost-only Firebase connection restrictions, and confirms the published Google Sites normal files remain unmodified.

Run: `node tests/draft-online-ui-release-parity.cjs`. This is a **source-contract test, not proof that every frame and gesture looks/feels identical**. A physical school iPad and real Google Sites embed still need hands-on testing. Future changes to either normal lab should fail CI until the draft is re-reviewed.

## Security finding: draft labs are not safely publishable yet

The existing `DRAFT_ONLINE_E2E_TEST_ONLY.rules.json` and `DRAFT_SQUAD_E2E_TEST_ONLY.rules.json` intentionally allow **any** read/write under their draft room roots. These rules are suitable only for a loopback RTDB emulator without cloud access. **Never deploy them to Firebase production or copy them into a Google Sites release.**

The JavaScript clients currently identify seats with a sessionStorage ID. That ID is not verified by Firebase Authentication. The 4-WebKit test that rejects a stolen identity proves only application-level behavior against an active session. It does **not** prove identity authorization against malicious network writes. Similarly, the host-authoritative combat engine runs in a user's browser: with open RTDB rules, an adversarial client could write match outcomes or other users' state. Firebase Auth alone cannot prove that a host client computed legitimate damage.

`network/release/DRAFT_DENY_ALL_BASELINE.rules.json` is a **fail-closed design artifact, not playable rules**. It allows no reads or writes until a separate secure online architecture is implemented and tested.

## Required engineering before online publication

1. Use a **separate staging Firebase project/database** and distinct draft room roots. Do not touch existing normal-game Auth/Rules/rooms.
2. Introduce Firebase Auth identities (anonymous sign-in is sufficient to issue stable UIDs for casual players, but must be bound to a seat in a server-validated join transaction). Never rely on room code or sessionStorage ID as authorization.
3. Enforce per-UID permissions for positional input and actions; use a trusted server (Cloud Functions or equivalent) to validate joins, slots, rate limits, action timing and state transitions. A client cannot directly set the room's scores, HP, winner, draft offers or arbitrary player cards.
4. Treat presence and disconnect via trusted connection lifecycle, with rejoin credentials/UID checks. Restrict who may pause/resume/abort a game; do not give any participant unrestricted writes to `game`.
5. Add adversarial RTDB tests: anonymous/no-auth access denied, cross-player writes denied, tampered scores/HP denied, forged host/connection IDs denied, replay and excessive actions denied, valid join/shot/rejoin accepted. Never promote rules after only functional WebKit tests.
6. Only after staging E2E + security tests + physical landscape iPad Safari/Google Sites tests pass, create independent draft HTML exports, request owner review, and publish. Do not use this document as publication approval.

## Publication status

- `1vs1 KO` and `2vs2 KO` draft localhost labs: **development candidate; NOT public/secure**.
- Draft HOT ZONE: not implemented.
- Existing normal public versions, production configuration and Google Sites: unchanged.
