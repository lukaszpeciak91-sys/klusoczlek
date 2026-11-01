# PR48 — Marcin final battle contract (work in progress)

Base main: `1667f44d5d244bac27cf4d5c8dc8163701066fd7`; PR44–PR47 merged. Existing user-supplied `public/assets/dialogue/dialogue-marcin.png` is not touched.

Six waves remain unchanged: 138 ordinary enemies. Specials: Marcin plus two Żubrokryptyda escorts. Finale pool: eight Bobrozombi and four Bocianołaki, uniquely identified and queued separately. Planned episode population: 153, not a mandatory kill count. Once Marcin lands, a rotating three-source scheduler shares seven non-boss live slots between wave-six survivors/spawns, escorts and finite reinforcements; unsafe spawn results remain queued for retry.

Marcin's fatal hit irrevocably enters `boss-resolving`; pending spawns are cancelled and all spawned living minions are logically removed with red pixel bursts. Combat is disabled immediately. The globally stepped VFX list must empty before final portrait dialogue; only the final DALEJ permits victory. Scripted removals never increase the player kill numerator; the boss fatal hit does.

Portrait key `marcin` uses the existing strict 192×192 PNG loader with letter fallback on missing/invalid content. Existing PR46 ambient barks suspend on terminal resolution. Physical Android Chrome acceptance is separate.

Validation status: GitHub Actions and browser evidence must be checked at the exact PR head. This document records the intended contract, not a claim of GREEN results.
