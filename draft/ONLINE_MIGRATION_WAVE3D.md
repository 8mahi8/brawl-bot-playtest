# BRAWL Draft Wave 3D — Portable Wall 2vs2 (emulator-only)

## Host-owned behavior
Deploy 42 × 112 world-unit vertical cover 95 units in front of the owner for 4000ms, independent GAD2 cooldown 12000ms. Reject placement outside the arena, intersecting any permanent wall or active temporary wall, overlapping any live player with seven world units extra margin, or blocking a Hot Zone objective. One active wall per seat; expire on the canonical host clock. Never mutate the permanent KO/Hot Zone wall definitions.

All host-side projectile trajectories (normal, split, ricochet), bomber throw reflection, movement effects (Tank recoil/dash/knockback), warp destination selection and area effects' landing checks use the same dynamic collision function. Browser movement, aiming obstruction, predicted bullets, minimap and main arena render authoritative rectangles replicated through the existing RTDB game node. This is **solid terrain**, not a visual-only effect and not an instant-damage tool.

## Tests
VM extracts **exact host geometry** for wall placement, out-of-bounds, static overlap, player occupancy, wall collision before/after expiration, runtime bullet and movement pathways. Full local Firebase RTDB emulator four-WebKit E2E equips a wall, deploys at a safe location, checks 4s lifetime/12s cooldown and intact normal gadget charges, observes all four clients' replicas, rejects player placement inside wall, fires a real Tank volley through the temporary wall and checks committed enemy HP unchanged; finally checks canonical expiration and released movement. CI test fixture may deliberately extend/shorten lifetime **after asserting actual 4s configuration** for stable cross-browser movement tests.

## Isolation
2vs2 localhost-only prototype. Existing published HTML, Google Sites, live Auth/Rules and production Firebase were not changed. 1vs1 GAD2 and Hot Zone draft remain gated. The last 2vs2 GAD2 effect to build is Hologram; official playtest still requires real landscape iPad Safari, authenticated rules and reconnection validation.
