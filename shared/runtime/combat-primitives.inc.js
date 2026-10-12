// Shared combat math for both BRAWL modes. Inlined inside BrawlCombatV8 closure by scripts/build-brawl.cjs; accesses BALANCE.
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const tankDamage=d=>Math.round(BALANCE.tankNearDamage-(BALANCE.tankNearDamage-BALANCE.tankFarDamage)*clamp((d-BALANCE.tankFalloffStart)/(BALANCE.tankFalloffEnd-BALANCE.tankFalloffStart),0,1));
 const jumpDuration=d=>Math.round(BALANCE.tankJumpMinMs+(BALANCE.tankJumpMaxMs-BALANCE.tankJumpMinMs)*clamp(d/BALANCE.tankJumpRange,0,1));
