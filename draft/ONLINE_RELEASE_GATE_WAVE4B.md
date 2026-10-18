# BRAWL Draft Online — Wave 4B Release Gate

The Wave 4A tests already prove real combat KO and a non-owner WebKit socket interruption. This additional gate runs exclusively against the **localhost RTDB emulator**. It changes no public game, production Firebase rules, or Google Sites embed.

## Gate C: Usable reconnected fighter

After a genuine non-host `goOffline()` -> same-tab reload -> same-seat join, wait for combat input readiness, send a new position packet, and require the host WebKit client to observe its **fresh connection token** and coordinates. Fire a normal attack using the existing player input path, and require an **accepted host-authoritative action** in the emulator's committed game state (not just a local echo). No round results or action receipts are test-written.

## Gate D: Active-seat anti-takeover

Create an independent fifth Safari/WebKit context with the active red2 player ID prefilled in sessionStorage. Its attempt to join the full playing room must be denied. The original player's ID, online count, and four-seat roster stay unchanged.

## Gate E: Host disconnect / return

Disconnect the actual room owner while the match is playing. The other clients must enter a shared `paused` phase and stop the combat clock; no non-owner may become host. Rejoin the original host from the same Safari tab, preserve the host's player identity and cards, require a **new** connection token, and check that the game's host token is refreshed before resuming play. Preserve score and round.

## Limits

- The failure-mode suite still does **not** validate real physical iPad/Safari, background app suspension, multi-client simultaneous outage, production auth/rules, or HOT ZONE draft.
- Non-host and host return are explicitly tested only inside the 15-second pause grace period.
- Later rounds still use a forced-result fixture to exercise long GAD2 cases quickly; first-round KO is a genuine shot-triggered combat outcome.
