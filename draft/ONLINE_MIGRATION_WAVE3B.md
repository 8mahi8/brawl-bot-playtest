# BRAWL Tactical Draft Wave 3B — GAD2 smoke (2vs2 local emulator)

## Ability and counterplay
Adds smoke as a second supported GAD2 card, using the same independent touch/keyboard button as the already tested mine. Latest obtained supported GAD2 is equipped. GAD2 has its own 12-second host cooldown and never consumes the normal character gadget. Smoke is a circular field, radius 100 world units, lasting exactly 4000ms of active combat. It is placed 48 units ahead of the owning player and limited to one live cloud per owning seat.

Existing BrawlStealthV1 bush visibility determines hidden/revealed/detected states inside smoke. Allies remain visible to allies; enemies can discover nearby targets. Smoke itself does not block any projectile or normal movement. Player-specific '煙幕：潜伏中'/'煙幕：発見中' text is displayed over the local player to avoid confusing concealed vs detected. A normal attack launched inside smoke reveals its actor for 700ms, resolved by the host authority. Regular 1500ms reveal remains for all other conditions. Expiration is host-driven. No extra RTDB listener or new production path.

## External design precedents
Official VALORANT Yoru developer blog stresses distinct friendly decoy visibility vs an identical enemy decoy. Official Overwatch Sombra dev blog stresses preserving enemy counterplay for invisibility/teleport. Links: https://playvalorant.com/en-us/news/dev/state-of-the-agents-yoru-part-2/ and https://news.blizzard.com/en-us/article/24009616/directors-take-a-designers-journey-into-sombras-rework . No third-party art, sound or code is copied.

## Verification gate
Node unit contract tests for 4s / radius100 / 700ms reveal, bush-based visibility, latest GAD2 equipment and mine regression. Four WebKit clients use localhost RTDB emulator, equip smoke, deploy an actual normal GAD2 action, verify server committed cloud/timers, enemy inability to see a distant concealed owner, local owner stealth indicator, and canonical host shot reveal. Previous mine, ricochet, split, delayed blast and frozen normal releases must remain green.

## Not deployed
Live Firebase Auth/Rules, Google Sites and published normal modes are untouched. One vs one GAD2 is still gated. Three 2vs2 GAD2 effects (portable wall, hologram, warp beacon) remain. HOT ZONE timing and actual iPad tests remain pending.
