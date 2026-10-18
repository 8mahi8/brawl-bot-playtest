# BRAWL Draft Wave 3E — 2vs2 Hologram

## Local-only rules
The fifth GAD2 ability is a seven-second decoy with fourteen-second independent cooldown, one per owner seat. It copies the owner's character appearance, moves under host authority at up to 97 world units per second, aims toward a real enemy, changes strafe direction and fires harmless display-only shots approximately every 850ms. Every real enemy projectile or Bomber standard bomb touching it removes the decoy once. It has no real HP, ammo, gadget, ULT, damage, score, capture, KO or respawn entries. It cannot win objectives or charge ULT.

Only the host RTDB transaction updates gad2Holograms and gad2FakeShots. Fake projectiles have damage=0 and 380ms lifetime in their own visual-only collection, never in combat projectiles or hit processing. Owner death or respawn makes the hologram disappear. Permanent and portable wall collisions govern movement and fake fire sightlines. Quiet-KO ticking cannot defer an active hologram clock.

## Visibility
Allies see a pale diamond and clear 分身 label. Enemies see the same character sprite with normal ENEMY status label and no special marker. Bush/smoke conceal applies when relevant. Destruction creates a cyan dissolve ring. Referenced official Yoru design notes about ally-vs-enemy readable decoys: https://playvalorant.com/en-us/news/dev/state-of-the-agents-yoru-part-2/ . No third-party art, sounds or code copied.

## Validation
Node VM executes exact online-host movement and sight functions, checks movement speed 97 and terrain line-of-sight. Card contracts verify fake shot isolation, hostile-fire-only dissolution and 1vs1 gating. Four WebKit clients on localhost Firebase RTDB emulator deploy via regular GAD2 input, verify 7s/14s timers, observe movement and fake fire with unchanged opponent HP/owner ULT, verify ally-only label and a real enemy shot's single dissolve, and confirm all-client sync. Full existing mine/smoke/warp/wall/delayed blast/split/ricochet regressions and public-release isolation remain required.

## Not released
Live Firebase Auth/Rules and Google Sites unchanged. Normal public 1vs1/2vs2 releases untouched. All 5 GAD2 effects are local 2vs2 experiments, but 1vs1 GAD2, authenticated security, reconnection, actual landscape iPad Safari and HOT ZONE draft remain unverified.
