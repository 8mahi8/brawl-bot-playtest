# BRAWL Tactical Draft — online card migration Wave 1

Date: 2026-10-18; scope: **local Firebase emulator-only**, NOT a public deployment.

## Why we did not copy the BOT cards into the online HTML

The offline BOT branch owns both actors in one canvas. The 1vs1 online implementation separately replicates positions and uses authoritative RTDB transactions for HP. The 2vs2 online implementation has a host-authoritative combat reducer, action receipts, canonical motion revisions and network prediction. Copying the offline visuals directly would cause double damage, divergent collision results and hidden-card manipulation.

## Wave 1 — RECOIL SHOT / 反動射撃

- Card appears in the online draft selection (the original 8 plus recoil = 9), is owned through the same atomic picks and stays until replaced.
- Ordinary direct-hit damage is multiplied **1.10 on the authoritative damage path**. Gadget and ultimate are excluded.
- **1vs1:** local actor moves a maximum 60 world units backward, collision-checked in 10 steps, once per firing action with 1.2-second cooldown. Existing peer positions are published right after the movement. Bomber ordinary bomb damage is separately modified inside the existing atomic bomb-queue transaction.
- **2vs2:** the authoritative combat reducer executes collision-safe 60-world-unit recoil only after an accepted normal shot action, writes a canonical motion revision (the client reconciles it), and stores draftRecoilUntil for 1.2 seconds. The host's normal-hit reducer applies 1.10 to one projectile hit regardless of volley size. Bomber ordinary bombs are explicitly tagged normalAttack, so Bomber's multiple ultimate bombs never get an unintended +10%.
- Tank five pellets / Gunner three bullets = **one** recoil impulse per accepted action.

## QA / release gates

- Pure reducers test +10% ordinary damage, no effect on ULT/GAD, draft rules.
- 1vs1 emulator WebKit checks recoil after an actual shot, ~60 movement, peer position sync, and cooldown.
- 2vs2 emulator WebKit checks accepted owner action, canonical host motion revision, draftRecoilUntil, four-player synchronization, winner-first picks and match end.
- Normal release HTMLs, published Firebase Rules and Google Sites are **not changed**.
- The other eight new playstyle cards (split, ricochet, delayed blast and five GAD2) are **NOT yet** in online offerings. They remain BOT-playtest-only: a deliberate correctness gate.
- Online labs remain localhost + emulator only. TEST-ONLY open emulator rules are NEVER suitable for production.
- Not yet a confirmation of school iPad Google Sites multiplayer readiness.

## Next action

After Wave 1 passes, migrate deterministic fireActionId-based split/ricochet/delayed blast effects on both authoritative paths. GAD2 action validation, replicated ability state and collision/visibility require independent host-side implementation and four-client verification before the cards become selectable online.
