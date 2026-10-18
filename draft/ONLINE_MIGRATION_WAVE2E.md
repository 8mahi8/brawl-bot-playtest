# BRAWL Tactical Draft — Wave 2E, isolated online 1vs1 ricochet

2026-10-19. This builds on merged PR #70 and ports the equivalent one-bounce 70% projectile mechanic into the different 1v1 shot pipeline.

The host evaluates projectile contact and applies damage; all WebKit clients calculate the same geometry. A normal projectile (never an ULT) reflects exactly once on an unambiguous wall face, with 70% damage afterwards. A second collision or ambiguous corner absorbs the projectile. Splitting after bouncing keeps the used bounce budget and original fireActionId; no recursive growth.

Bomber's normal queued bomb, including each split mini-bomb, receives a one-wall reflected end position and 70% post-bounce damage. Ultimate and gadget attacks are excluded. No card effects are enabled in the public normal game.

Coverage: Node VM executes exact geometry using circular-wall collision and checks reflection, corner, split stacking and Bomber path. Local 2-client WebKit E2E checks host wall bounce and existing recoil/split/delayed blast round-trip. Draft labs remain localhost-only and require local Firebase RTDB emulator. Public deployment remains blocked on security rules, seat auth, real iPad and disconnect/rejoin tests.

Remaining new cards: GAD2 five abilities, then HOT ZONE 20s-round drafting.
