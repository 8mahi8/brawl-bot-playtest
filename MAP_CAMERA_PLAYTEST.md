# BRAWL 2vs2 new map & follow camera playtest (2026-10-12)

## Status
- Candidate only: [2v2-map-camera-test.html](./2v2-map-camera-test.html).
- Compare old map: [2v2-stealth-clean-test.html](./2v2-stealth-clean-test.html).
- 1vs1 unchanged.
- Offline BOT-only practice (no Firebase / no online multiplayer).

## Changes
- KO world: 1360 x 760, 3-route mirror-symmetric layout from DESIGN_MAP_STEALTH_V1.md, includes stealth-field positioning.
- HZ retains central objective, coordinates adapted to the new 1360x760 world with symmetric arena obstacles.
- Shared world coordinates in combat core, BOT navigation, gas bounds, camera, spawning, minimap, input and collision.
- BOT graph linked via eight nearby neighbor cells rather than full O(n²) scan.
- Smooth follow-camera on world plane; camera respects world boundary; mobile portrait follows horizontal axis rather than shrinking entire world.
- Same pointer-to-world coordinate transform handles aiming while camera moves.
- Corner minimap shows positions of YOU, teammates, visible enemies only, stealth zones, walls and viewport rectangle. Red dots must not leak concealed enemies.
- F key or miniboard button switches between follow and full overview; helpful for BOT observation.
- Character stats, skill damage and attack range unchanged.
- Phase Mist drawing code inherited. User-reported light cyan wave overflow and visibly overlapped field regions remain separate pending real visual review; this update does not assert those are fixed.

## Automated checks completed
- Scripts compile in JavaScript syntax.
- KO/HZ: four spawn points non-blocked, 4 BOT decision outputs finite, valid positions, collision clamp, combat ticks progress.
- KO/HZ: route planning across both bases and mid map; 4ms per group on small synthetic test.
- Camera transform: desktop 1280x630, tablet 1024x700, phone 390x590, ultrawide 1920x650, tested border clamp, world/screen pointer transform roundtrip, follow and overhead modes.
- 1vs1 file untouched; 2vs2 candidate saved separately.
- **Live GitHub Pages propagation, browser runtime on real devices, FPS, map playability and visibility are not yet verified**.

## Remaining planned
- Playtest PC/iPad. Validate camera stability and aim while running, minimap visibility, no HUD overlap, BOT navigation under 4-character continuous play, KO pacing (time to first encounter/escape/rotation).
- Stealth field wave/overlap rendering fix from prior feedback.
- Hold left mouse for aim, release to fire (unchanged here; PC input upgrade separately).
- Character balance only after new map feel is tested.
