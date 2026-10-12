// Source of truth for common 1vs1/2vs2 weapon timing, spread and gadget knockback.
// This is inserted into BOTH standalone game HTML files by build-brawl.cjs.
// __*__ placeholders are replaced exclusively with shared/brawl-core-contract.json.
const BrawlWeaponV1=Object.freeze({
 spread(char){return char==='tank'?__TANK_SPREAD__:char==='gunner'?__GUNNER_SPREAD__:[0];},
 gapMs(overdrive){return overdrive?__GUNNER_BURST_OVERDRIVE_MS__:__GUNNER_BURST_NORMAL_MS__;},
 overdriveReloadMs:__GUNNER_RELOAD_MS__,
 sniperKnockback:__SNIPER_KNOCKBACK__,
 bulletSpeed:__BULLET_SPEED__
});
