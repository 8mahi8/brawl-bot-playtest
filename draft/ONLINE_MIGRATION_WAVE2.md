# BRAWL Tactical Draft — Online migration Wave 2

2026-10-18 / only LOCAL Firebase emulator labs (not public).

## Newly implemented and selectable on both isolated online prototypes

**split_round / 分裂弾**: The one central projectile of a normal Tank 5 / Gunner 3 / Sniper 1 volley is replaced after half of its range by exactly two daughter projectiles. Each does 60% of original center-shot damage, no recursive splitting. Daughter projectiles share the original fireActionId, and the central projectile is removed. A normal Bomber throw becomes two small blast events (each 50% damage, 72% radius; original enhanced slow/DoT may occur on at most one). ULT remains unchanged.

**delayed_blast / 遅延爆発**: First eligible normal hit within a 3-second cooldown schedules one canonical +700ms 10-damage/55-radius blast, keyed by original volley/throw fireActionId. Tank's 5 pellets, Gunner's 3 sequential bullets, and Bomber's two split blasts cannot schedule multiple blasts from one action. Delayed blast has effect-damage kind and cannot chain, gain a normal-shot bonus, or self-retrigger. A visible danger-circle telegraph is rendered from the shared canonical timed state.

## Correct authority model

- 1vs1 uses the existing per-client shared bullet projection for visuals, with host-only damage transactions, a canonical draftBlasts RTDB map, atomic event consumption/HP and round settlement. Delayed bomb triggers are derived only from authoritative bomber impact events.
- 2vs2 uses host BrawlCombatV8.accept/step: children, normal Bomber explosions, and timed delayed explosions exist only in canonical combat state. RTDB transaction retries reproduce stable projectile IDs and do not spawn extra children. A small battle audit counter helps confirm host-owned split/blast outcomes.
- Followthrough and other effects are action-scoped: a second split daughter from the same original fireActionId cannot trigger an extra Followthrough damage bonus, but the next distinct volley can.
- Neither normal published BRAWL page nor production Firebase rules/auth/Google Sites is edited. Extra positioning and fire QA functions exist only inside localhost-only emulator labs.
- The third requested fire modifier **ricochet / 跳弾 remains blocked**: accurate one-bounce wall-face/corner collision plus Bomber-specific projectile treatment still need implementation and tests before the card can enter the online offer pool.

## Tests and limitations

- Static schema/runtime contracts block unimplemented GAD2 and ricochet cards.
- Pure VM test executes the exact squad center-split implementation and asserts two 60%-damage children with one shared volley ID, not recursive descendants.
- Both existing 2-client and 4-client emulator/WebKit suites verify room/draft/KO stability; additional checks fire real bullets and verify split and first-hit delayed blast behavior.
- Real school-iPad Safari, production seat authentication, reconnect, and Google Sites integration remain separate release gates. Online Labs are NOT public playable releases.
