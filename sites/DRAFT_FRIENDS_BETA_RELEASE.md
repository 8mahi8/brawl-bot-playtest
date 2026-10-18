# BRAWL Tactical Draft — friend-only fast beta (2026-10-19)

## Copy-paste standalone Google Sites HTML

- [Draft 1vs1 KO](./BRAWL_DRAFT_FRIENDS_BETA_1vs1.html) — two friends, three wins, winner chooses first, up to three persistent cards.
- [Draft 2vs2 KO](./BRAWL_DRAFT_FRIENDS_BETA_2vs2.html) — four friends, team-winner snake pick, GAD2, up to three persistent cards.

GitHub **Raw** view displays the full self-contained HTML. Google Sites > **Insert > Embed > Embed code** > paste **full HTML** > Preview > Publish. Paste these on **new draft pages**, not over the existing normal 1vs1/2vs2 pages. Existing published normal HTMLs remain frozen.

These are friend-only online beta candidates, **not a hosted public service or a security-hardened game**. Do not use emulator-only rules on a cloud Firebase database. Keep room IDs among friends; do not share them publicly.

## What changed vs. the emulator prototypes

- Removed the localhost-only launch restriction and local emulator routing.
- Cloud RTDB URL defaults to the known endpoint already used by the existing normal friend **1vs1** release. The 2vs2 beta can also reuse a previously set `brawl-online-lab-url` browser preference.
- Kept existing normal friend RTDB **room roots** for the beta: `/rooms/<5-digit>` for 1vs1, `/rooms2v2/<5-digit>` for 2vs2. Distinct draft protocol version IDs `1031` and `13012` prevent a normal client from joining a draft room (normal versions are `31` and `3012`). Room creation transactions do not overwrite existing occupied IDs.
- Kept the standalone tested draft combat, card system, presentation and iPad controls. No change to normal published game engines.
- Updated CSP to allow the normal Firebase RTDB domains and the Firebase script loader.
- No live cloud Firebase write, Auth, Rules, Google Sites changes or new server deployment performed here.

## To try with friends

1. Paste either full beta HTML into a *new* Google Sites draft page. On PC or school iPad Safari, use the draft 1vs1 or draft 2vs2 page on both/all devices.
2. One player selects Create Room and shares the five-digit room ID; the other player(s) join the matching mode and press READY.
3. Play a KO round, choose draft cards in turn, then verify the next round continues, and check attack responsiveness and HP changes. For 2vs2, check 4 seats, smoke, warp, walls, hologram, disconnect/return and latency.
4. If creation fails with a Firebase `permission_denied`, the current cloud RTDB Rules do not accept draft protocol rooms. **Do not open up the entire database.** The production Rules must be reviewed/updated with owner authorization; no automatic cloud changes have been made.
5. If the 2vs2 beta uses a different Firebase project from normal 2vs2, adjust `window.BrawlOnlineConfig`'s default URL in the standalone HTML before embedding.

## Testing boundaries

The GitHub Actions preflight parses both exact standalone scripts and verifies the original normal releases remain unchanged. Another GitHub Actions job runs real 2-client and 4-client WebKit/RTDB connection/READY tests. Its test HTTP server only swaps the beta URL and CSP to localhost and inserts `useEmulator()` into the served copy; **the committed HTML contains no emulator hook**, and no production Firebase/Google Sites is accessed.

Existing separate localhost labs already cover actual KO, draft picks, reconnection and GAD2 mechanics. This beta smoke complements those, but **it does not establish live Internet success or physical iPad performance**. Only a friend device test can do that.

## Later, not blocking friend-beta feedback

Security hardening, full server-authoritative game logic and HOT ZONE draft remain separate follow-up work. The beta's browser-host model is game-friendly but not cheat-proof; do not expose personal data or use it for high-stakes gameplay.
