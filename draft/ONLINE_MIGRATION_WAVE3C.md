# BRAWL Draft Wave 3C — Host-authoritative 2vs2 warp beacon (emulator only)

## Design and behavior
Warp is a new GAD2 card in the isolated 2vs2 online prototype. GAD2 input and button are independent from a character's original gadget. The most recently acquired supported GAD2 card is equipped (mine, smoke or warp). Place a visible, destructible, one-hit beacon at the owner's currently validated position. Press the same GAD2 button again within **7000ms** of active combat to instantly return. The return is a teleport: intervening walls do not block it. The host checks that the destination circle is in bounds, wall free, and separated from other alive players, otherwise searches 16 directions on each of 24/40/58/76 unit rings. If no safe landing exists, the return is rejected without moving the player.

After return, early break by enemy projectile or bomb, or expiry, a **15000ms** cooldown is committed in the same host-owned state. A broken beacon absorbs the first enemy projectile; allied shots do not destroy it. Each owner has at most one live beacon per seat. Beacon state expires if the owner dies or its life changes. Each successful return increments the canonical motion revision so all connected clients reconcile position. The visual marker is visible to allies and enemies, and the button reads ビーコン/帰還 according to state.

## Network and concurrency reference
Firebase Realtime Database official reference notes that transactions can be retried when concurrent writes conflict, so all beacon state mutation must occur within the same idempotent host transaction, not browser-local counters or side effects: https://firebase.google.com/docs/database/web/read-and-write . Roblox's server-authority notes also recommend authoritative validation of collision and destinations in multiplayer: https://create.roblox.com/docs/projects/server-authority . Our current Firebase host client is authoritative within the emulator prototype; **this is not a production-secure server** without real Auth/Rules.

## Verification
Node VM extracts and executes the **exact** host warp landing function against permanent walls and occupied positions, including fallback and fully blocked rejection. Contracts cover GAD2 card gating, exact lifetime, cooldown, native 1v1 separation and enemy beacon destruction. Four real WebKit clients in a local RTDB emulator place a beacon, move beyond an intervening wall, return, confirm server-committed motion revision and all-client synchronization, and retain normal gadget charges; existing mine, smoke, ricochet, split, delayed blast and draft tests remain mandatory.

## Isolation
No changes to public normal HTML, production Firebase Auth/Rules, Google Sites or published Google Sites embeds. 1vs1 GAD2 remains gated. Two 2vs2 GAD2 effects (portable wall and hologram) remain. Public release requires secure backend rule verification, actual iPad Safari and reconnect/resume tests.
