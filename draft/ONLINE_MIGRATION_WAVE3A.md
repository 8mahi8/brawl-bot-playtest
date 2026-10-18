# BRAWL Draft Wave 3A — 2vs2 GAD2 trap mine (local emulator only)

## Design references
Riot VALORANT Yoru: allies must distinguish friendly decoys while enemies see convincing clones; Blizzard Overwatch Sombra developer notes: stealth/teleport need readable enemy counterplay. References: https://playvalorant.com/en-us/news/dev/state-of-the-agents-yoru-part-2/ and https://news.blizzard.com/en-us/article/24009616/directors-take-a-designers-journey-into-sombras-rework . These principles guide future hologram/smoke/warp, not copied art or names.

## Implemented scope
GAD2 is separate from the character gadget (different touch button, PC R key, cooldown tracked by host). First card: trap_mine. A single host-validated mine per owning seat, spawned 44 units ahead in a clear unoccupied spot; 9s lifetime, 12s CD, 8 damage and 1400ms movement slow upon first valid enemy contact. No friendly fire. Expired, triggered, or owner-dead mines are deleted. Teammates see the mine, enemies see it only within 110 game units. The owner can equip the latest acquired supported GAD2.

## Test plan
Node card contract validates only implemented cards are offered; exact action whitelist, independent button, cooldown, mine trigger, hit/slow and deletion are protected. Four real WebKit browsers on localhost Firebase emulator deploy a mine through the regular network action path, move an enemy into range, verify one committed enemy HP hit, slow and all-client state sync; verify normal gadget charges do not decrease. Previous shot modifier/draft/frozen published release CI checks remain mandatory.

## Restrictions
Public normal HTML, Firebase production Auth/Rules, and Google Sites must not change. One 2vs2 GAD2 is a prototype, not a release. Still gated: four other GAD2 cards in 2vs2, all five GAD2 in 1vs1, timed HOT ZONE draft. Follow up with counterplay UX, reconnection and real iPad tests before publishing.
