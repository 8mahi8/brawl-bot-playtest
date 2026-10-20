# BRAWL Online Integration LAB (isolated development branch)

This folder contains two **development candidates**, built from the newer shared-foundation game files. Neither replaces the existing BOT-only GitHub Pages pages nor the previously stored online HTML.

| Mode | Standalone HTML | Firebase room root | Protocol |
| --- | --- | --- | --- |
| 1vs1 | [1v1-online-lab.html](./1v1-online-lab.html) | `/rooms` | `30` |
| 2vs2 | [2v2-online-lab.html](./2v2-online-lab.html) | `/rooms2v2` | `3011` |

## Implemented

- Restored independent create/join controls, compatible with each mode's existing lobby state machine.
- Kept the newer Foundation gameplay/BOT mode untouched: BOT practice is fully offline.
- Added optional RTDB endpoint input or `?db=https://...` query parameter. Stored per browser on a best-effort basis; input works if storage is unavailable.
- Lazy-load Firebase compat SDK on first online action, not at startup or while practicing with BOTs.
- Allowed Firebase SDK and RTDB websocket hosts in page CSP.
- Removed cross-mode in-game navigation; Google Sites menu will switch between separately embedded mode pages.
- Kept all changes off the existing `main` BOT pages and outside the user's actual Google Sites.

## Tests

`.github/workflows/online-lab.yml` runs:
- Inline script syntax parsing, correct CSP, missing endpoint handling, no hardcoded production RTDB.
- Real Chromium boot, BOT practice, online buttons, and absence of Firebase requests in BOT mode.
- Two separate browser pages with a **mock database**: create 1vs1 and 2vs2 rooms, then join them from second client.

**These tests do not make any real Firebase network request or validate live Rules/Auth, distributed transaction behavior, RTT, desync, WebKit Safari, or 2/4-player match completion.**

## Required before publication / live use

1. Use an **isolated test Firebase Realtime Database**; do not connect the old root-wide anonymous read/write production Rules. The existing reported Rules used a date-bounded open root (deadline 2026-11-08 JST) and are insufficient for public online play.
2. Implement scoped participant/host authorization (e.g., Firebase Anonymous Authentication with UID-bound room membership), correct room and action write validators, and a secure room creation/join flow. Do not just turn off root restrictions for convenience. Backend architecture may require adapting legacy whole-room transactions.
3. Test real Firebase SDK + emulator with two and four clients, transactions, join/READY/start, simultaneous actions, HP and match outcome, disconnect/reconnect, presence, rematch, and adverse latency.
4. Verify iPad Safari and Google Sites embedded use on an appropriately isolated test site. Keep the old published pages available for rollback.

**Status: functional UI + mock room-connect proof; NOT production online-ready.** The branch/PR is intentionally a draft. No real RTDB data, Rules, hosting, or Google Sites was modified by this work.
