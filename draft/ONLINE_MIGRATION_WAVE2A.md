# BRAWL — Tactical Draft online Wave 2A

2026-10-18 | Experimental localhost-only Firebase emulator

## Implemented
- 2vs2 KO host-authoritative delayed_blast card: ninth existing card plus recoil plus delayed blast = 10 choices in the 2vs2 prototype pool.
- On first normal projectile hit (or first ordinary Bomber bomb overlap), host schedules a 700ms warning followed by 10 damage / 55 world radius. Client rendering reads host's canonical scheduled entry and draws an expanding warning ring.
- First hit of a single fireActionId triggers one explosion. Tank's 5 and Gunner's 3 bullets never create multiple explosions from the same original attack. Other enemies may be damaged at impact without triggering a second explosion.
- Per-owner 3 second cooldown, stored in canonical game draft state. Old fireActionIds are bounded at 80 to prevent unbounded RTDB payload growth.
- Never activates on gadget, ultimate, gas, DOT or draft explosions (all 'effect' rather than 'normal'). Doesn't hurt teammates. Blast state and timers reset on round start. No client-side authoritative damage.

## Release gates
- The card is NOT present in 1vs1 yet. Split-round and ricochet are not present in either online offering pool yet.
- Existing 4-client WebKit test checks draft networking/room transactions; pure Node reducer tests verify blast dedupe, cooldown and reset. **Direct live blast-hit/HP end-to-end remains unverified** and is required before any public release.
- Both online builds remain localhost RTDB emulator-only, with no changes to real-world Firebase Rules or published normal 1vs1/2vs2 pages.

## Next priorities
1. Add a deterministic host simulation and 4-client live RTDB E2E that watches a blast resolve into enemy HP exactly once.
2. Port the same delayed blast to the 1vs1 transactional HP and bomber event pipeline.
3. Port split and ricochet with per-fireActionId attribution and authoritative collision rules, then 5 extra gadget cards, followed by 2vs2 Hot Zone 20-second draft rounds.
