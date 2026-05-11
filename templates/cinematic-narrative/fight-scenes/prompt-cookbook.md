# Fight Scenes — Prompt Cookbook

Operational reference for the art-director when generating keyframes and i2v prompts. Read alongside [`TEMPLATE.md`](TEMPLATE.md) (structure) and [`hooks.md`](hooks.md) (openings).

## Master prompt template

Populate every section. Empty sections are where the model improvises wrongly.

```
[SETTING & ATMOSPHERE]
Location: <specific terrain, weather, time of day>
Lighting: <key light direction, shadow behavior, color palette>
Ambient: <particles, wind, environmental sound presence>

[COMBATANT A]
Appearance: <clothing, build, age cue, weapon, stance>
Emotional state: <calm/desperate/cocky/exhausted>
Discipline: <kung-fu, muay-thai, katana, gun-fu, ...>
Starting position: <distance from camera, angle vs B>

[COMBATANT B]
<same fields as A — must be visually distinct from A>

[OPENING 2-SECOND HOOK]
<one hook from hooks.md, fully described>

[EXCHANGE 1 — A initiates]
Moves: <named techniques: jab-cross, roundhouse, overhead-slash, parry-riposte>
Camera: <dolly forward, whip-pan, rack focus, orbit>
Effects: <dust burst, fabric ripple, sweat spray, spark>

[EXCHANGE 2 — B counters]
<same fields>

[ESCALATION]
<faster cadence, environment starts breaking, stakes rise>

[CLIMACTIC MOMENT]
<decisive beat: clean strike, stalemate, twist>

[RESOLUTION]
<breathing, walk-off, bow, chase resumes>

[POST-PRODUCTION NOTES]
SFX: <impact foley, blade whistle, ambient cuts>
Color grade: <warm golden, cool blue, desaturated>
Slow-motion segments: <which beats at 0.5x or 0.25x>
```

Length target: 300–800 words for a single 5–10s i2v clip. Longer is fine; the i2v models tolerate detail. Vague is fatal.

## Camera moves — the active-participant doctrine

Match camera to choreography intensity. Static cameras kill fights.

### Dynamic motion

- **Dolly forward** — push toward impact during aggression. Simulates the aggressor's momentum.
- **Dolly backward** — pull away during grapple/clinch to reveal spatial relationships.
- **Lateral tracking** — pan side-to-side following lateral footwork.
- **Orbital** — circle around stationary combatants during deadlock or grapple.
- **Whip-pan** — rapid horizontal swing between fighters; chaotic multi-fighter perspective.
- **Snap zoom** — rapid in/out on impact; emphasizes a single beat.
- **Reverse dolly** — camera retreats while combatant advances; deceptive speed.

### Static positioning

- **Dutch angle** — 20–30° tilt for tension and disorientation.
- **Low angle (worm's eye)** — knee/floor level; aggressor towers, power imbalance.
- **High angle (bird's eye)** — overhead; combatants smaller, environmental scope.
- **Close-up on impact** — extreme tight on contact; exaggerates the strike.
- **Wide master** — full fight visible, choreography legible.

### Focus and exposure

- **Rack focus** — shift sharp from background to foreground combatant.
- **Shallow DoF** — soft background, isolate primary fighter.
- **Deep focus** — sharp front-to-back, stakes-clear.
- **Motion blur** — intentional blur on fast limbs.
- **Slow-motion emphasis** — 0.5x or 0.25x on key impacts.

### Pacing rule

- Aggression beat → push or whip-pan.
- Defense beat → pull, lateral, or rack.
- Deadlock/grapple → orbit.
- Climax → snap zoom + slow-mo.
- Resolution → wide master, settle.

## Lighting recipes

Pick one scheme per cut. Mixing schemes reads as AI-confused lighting and breaks the cinematic register.

| Recipe | Key | Fill | Color | Use for |
|---|---|---|---|---|
| **Golden hour duel** | low orange sun, side-key | warm bounce | orange-amber + long shadows | samurai, honor duel, bamboo grove |
| **Neon-rain alley** | overhead practical neon, hard top-key | wet ground bounce | magenta + cyan, high contrast | gun-fu, urban brawl, chase |
| **Blue-moon courtyard** | top-back moonlight | minimal | cool blue + silver | wuxia, rooftop, solo training reveal |
| **Firelight interior** | flickering practical fire | warm bounce on faces | orange-red + deep black | burning warehouse, tavern brawl |
| **Lightning storm** | strobe top-key | deep shadow | high-contrast white + storm-blue | sorcerer duel, climactic confrontation |
| **Overcast white** | flat top-key | even fill | desaturated, low contrast | grounded MMA, gritty realism, sparring |

Always specify key-light direction in the prompt. "Lighting" alone gets you center-flat output.

## Choreography vocabulary

The i2v models understand named techniques. Use them.

**Striking** — jab, cross, hook, roundhouse, axe kick, spinning heel kick, flying kick, elbow strike, knee strike, open-palm strike, knife-hand.

**Defense** — parry, block, sidestep, duck, weave, roll, backstep.

**Grapple** — clinch, throw, takedown, sweep, hip toss.

**Sequences** — combo (3+ linked), counter, feint, riposte, aerial reversal, spinning strike.

**Weapon-specific** — overhead slash, thrust, lateral cut, blade-lock, riposte, sheath/draw, twirl, sweep.

Specify two named moves per exchange. More is fine. Zero named moves is the failure mode.

## Sound design — production notes

Generated video has no audio. Always include `[POST-PRODUCTION NOTES]` so the editor knows what to layer.

### Impact foley

- **Weapon strike** — sharp metallic ring (sword), dull thunk (club), crisp crack (whip).
- **Fist/kick impact** — bass thump with a slight squishy undertone.
- **Block** — solid wooden knock or metal deflection ring.
- **Body landings** — face (snappy), body (hollow), ground (bass boom).

### Weapon ambience

- **Blade unsheath** — long metallic scrape resolving to a sharp ring.
- **Blade whistle** — high-pitched air-cutting on fast swings.
- **Staff rotation** — subtle whoosh on rapid spins; underplay.

### Environmental

- **Wind** — intensifies with strike speed.
- **Ground impact** — papery rustling for dust, bright snap for stone cracking.
- **Water** — splash matched to visible water displacement.

### Silence as a tool

- **Pre-impact cut-out** — kill all audio for 4–6 frames before the major strike. The impact lands harder.
- **Held breath** — combatant breathing pauses during tension build.
- **Ringing ears** — high-pitched tone after concussive impacts.

### Score

- Tension: string tremolo or percussion roll.
- Impact hits: timpani or bass drum on choreography accents.
- Climax: orchestral swell.
- Resolution: drop-out or bass fade.

ElevenLabs Music can produce a single tension-to-climax cue per clip. Duck the music under foley so impacts read.

## Common mistakes

1. **"They fight intensely."** Replace with named moves and exchange structure.
2. **Static camera.** Specify a camera move per beat.
3. **No environmental interaction.** If it's raining, water flies. If it's bamboo, stalks split.
4. **No facial expression.** Eyes show fatigue, intent, surprise. Name it.
5. **Contradictory physics.** A roundhouse without hip rotation is broken. Spell out the rotation.
6. **Unclear identity.** Always name combatants distinctively (Master/Student, Hero/Villain, gi colors).
7. **Effect overload.** Sparks + dust + lightning + fire + screen-shake at once = mush. Pick one primary effect per beat.
8. **No SFX notes.** The editor is flying blind without `[POST-PRODUCTION NOTES]`.
9. **Unrealistic stamina.** After 10+ exchanges, fighters breathe. Add a recovery beat.
10. **Wrong weapon weight.** A greatsword can't move at dagger speed. Respect mass.
11. **Mid-fight dialogue.** Don't request speech during high action — i2v garbles it. Use VO over a recovery beat instead.
12. **Real-person likeness without reference.** Reference-required gate applies to named fighters, franchises, and copyrighted characters.

## Multi-character coordination

### 2v1

Define the lone fighter as PRIMARY (camera focus). Two attackers flank — left-front and right-back relative to camera. Sequence:

1. A initiates strike.
2. Defender blocks/evades.
3. While defender is committed, B attacks from the opposite angle.
4. Defender chooses: sacrifice an angle or perform an advanced defensive (backflip, spin, drop).
5. Rotate initiative.

### 3+ combatants

- **Specify pairings** at every moment. "Group fight" is mush. "Three guards focus on Defender; ally flanks left guard from behind" is renderable.
- **Section the frame.** Foreground = primary (sharp). Background = secondary (slight DoF softening). Prevents visual overload.

### Wave attacks

Best for boss/protagonist content. Wave 1: single attacker, defender dispatches. Wave 2: two fresh attackers, defender adapts. Wave 3: three converge, climactic coordination beat. Builds escalation cleanly.

## Five worked examples

### 1. Rain courtyard duel — kung-fu master vs student

```
[SETTING] Rain-soaked stone courtyard, ancient temple. Orange lantern light reflecting off wet stone. Steady rain, ankle-level water film, light puddles.
[LIGHTING] Warm low-key from lanterns, side-front; cool ambient from overcast sky; high contrast wet highlights.
[COMBATANT A — Master, 60s] White gi, weathered face, gray hair, white headband. Calm, centered, perfect posture. Kung-fu (Wushu). Standing relaxed, 3m from camera.
[COMBATANT B — Student, 30s] Black gi, lean, hungry eyes. Desperate to prove themselves. Kung-fu, more linear/aggressive. Mid-air, descending into frame.
[HOOK] Cut directly into Student's mid-air flying kick at 0.25x. At apex of strike Master's eyes are serene, hand already rising. Rain droplets suspended around both figures.
[EXCHANGE 1] Student lands, pivots, throws roundhouse at Master's ribs. Master sidesteps minimally; kick whistles past. Water splashes violently from Student's stance. Camera lateral-tracks the dodge.
[EXCHANGE 2] Master flows forward, double-palm strike at Student's chest. Slow-motion contact: gi ripples, hair blows back. Student's crossed forearms parry just in time. Camera dollies forward then snap-zooms on the parry.
[ESCALATION] Student fires three rapid-fire front kicks. Master weaves side-to-side, economy of motion. Whip-pan between them. Rain kicks up with every footstep. On the third kick Master catches Student's ankle.
[CLIMAX] Master rotates the captured leg, spinning Student toward the stones. Student inverts mid-air, rolls across shoulders, lands in a backward handspring.
[RESOLUTION] Both pause, breathing heavy. Master smiles slightly. They bow. Rain streams down faces.
[POST] SFX: blade-whistle on kicks, water splashes synced to footwork, soft thump on parries, pre-impact silence on the mid-air freeze. Music: solo erhu rising into taiko on escalation, softening on bow.
```

### 2. Sorcerer duel on a tower

```
[SETTING] Crumbling wizard's tower roof, storm clouds roiling. Distant lightning. Wind howling. Rubble across stone floor.
[LIGHTING] Lightning strobes (top-back) + ambient blue-black. High contrast; harsh edge highlights.
[COMBATANT A — Sorcerer Knight, 40s] Silver longsword, arcane robes fluttering. Cold, calculating. Standing center, 4m from camera.
[COMBATANT B — Rogue Warrior, 35s] Steel blade, scarred, leather. Desperate, adaptable. 5m to camera-right.
[HOOK] Sorcerer's blade ignites in blue magical flame. Lightning forks down and strikes the blade. Frame flashes white. In the silence after, Rogue's eyes widen.
[EXCHANGE 1] Sorcerer lunges, leaving a blue trail in the air. Rogue pivots hard right; heat singes the stone. Rogue counters with an upward diagonal slash. Camera dollies forward with Sorcerer.
[EXCHANGE 2] Blades meet mid-screen. Orange sparks burst radially. Both lean into the lock, muscles straining. Magic crackles at Sorcerer's free hand. Camera orbits the lock.
[ESCALATION] Rogue breaks lock with a backflip. Sorcerer fires a blue flame projectile from the free hand. Rogue dodge-rolls; projectile explodes against tower stone behind, masonry crumbling.
[CLIMAX] Six rapid parries-ripostes, sparks and fire on each contact. Camera orbits. On the sixth Rogue feints high, drops low, sweeps. Sorcerer airbornes, lands gracefully. Stalemate.
[RESOLUTION] Both panting. Sorcerer's blade dims. Thunder rumbles.
[POST] SFX: deep magical hum on flame ignition, sharp metallic rings on each parry, low boom on the projectile explosion. Music: storm-orchestral, building strings on escalation, single timpani hit on the stalemate.
```

### 3. Rooftop chase becoming a brawl

```
[SETTING] Urban downtown at dusk. Rain-slicked alleys, neon signs (purple, pink). Water runoff streaming on pavement.
[LIGHTING] Neon-rain — magenta + cyan key, hard top-down; high contrast wet highlights.
[COMBATANT A — Pursuer, 25s] Athletic, leather jacket, focused. Relentless. Mid-vault over a fence.
[COMBATANT B — Fugitive, 28s] Lean, dark hoodie, scared but determined. Sprinting, half-frame.
[HOOK] Fugitive rounds a tight corner at full sprint. Camera whip-pans with them. Pursuer vaults the fence behind, lands hard, continues.
[EXCHANGE 1] Up a fire escape — both ascending, metal clanging. Camera below, looking up; fire-escape shadows crossing rhythmically.
[EXCHANGE 2] Rooftop chase. Fugitive jumps a gap. Pursuer lands short, slides on wet asphalt, recovers. Neon blurs in the background.
[ESCALATION] Fugitive hits a dead-end roof. Turns. Pursuer slows, walks forward predatorily. Fugitive adopts defensive stance. Pursuer throws a sharp jab; Fugitive sidesteps. Two-punch combo follows; Fugitive weaves both, counters with a roundhouse. Pursuer blocks high but slides backward.
[CLIMAX] Pursuer explodes — jab, cross, hook, spinning elbow. Fugitive defends, getting pressed toward the roof edge. Risky play: Fugitive catches an incoming punch, hip-throws Pursuer, who lands hard on their back.
[RESOLUTION] Fugitive doesn't wait. Sprints back the way they came, jumping roof to roof, vanishing into neon. Pursuer rises slowly, breathing hard.
[POST] SFX: rain ambient, footsteps on wet metal, snap-crack on each jab, deep bass thud on the throw. Music: synth-bass pulse, accelerating BPM into climax, drop-out on the throw, cold ambient on the escape.
```

### 4. Anime-superhero collision

```
[SETTING] City downtown at night, towering skyscrapers, full moon, neon. Destructible (cars, streetlights). Wind howling.
[LIGHTING] Blue-moon + neon practicals; harsh rim light from energy effects.
[COMBATANT A — Hero] Ageless, silver eyes, floating slightly, cape billowing. Righteous, controlled.
[COMBATANT B — Villain, 40s] Dark aura crackling with black energy, menacing grin. Unhinged.
[HOOK] Villain launches a truck-sized black energy ball. Camera pulls wide for scale. Hero's eyes glow silver-white, dashes forward as a streak. The ball explodes against a skyscraper behind where Hero stood — facade shatters, glass cascades like waterfalls. Hero stands on a mid-air ledge unscathed.
[EXCHANGE 1] Hero launches skyward, accelerating, punches forward. Villain blocks with one arm. Impact shockwaves outward — every window in three blocks shatters. Cars shake.
[EXCHANGE 2] Villain spins, throws a dark crescent slash. Hero sidesteps; slash continues into a skyscraper corner. Building creaks. Hero's eyes widen — collateral risk.
[ESCALATION] Hero lands on a rooftop to minimize casualties. Villain pursues. Hand-to-hand: Hero precise/controlled, Villain wild/powerful. Each strike sends shockwaves. Cars flip. Pavement cracks.
[CLIMAX] Villain charges both palms with black energy, thrusts forward. Hero plants feet, raises both arms, silver light floods their body. Forces collide mid-screen — black vs silver, perfect stalemate, yin-yang shape, pushing both back millimeter by millimeter.
[RESOLUTION] Hero focuses. Silver expands, overwhelming the black. Villain skids backward, grins, launches skyward.
[POST] SFX: deep sub-bass on energy launches, glass-shatter on building hits, whoosh on dashes, sustained tonal hum on the energy lock. Music: orchestral hybrid with synth, full crescendo on the lock, hard drop on the resolution.
```

### 5. Samurai duel at sunset

```
[SETTING] Bamboo grove on a Japanese hillside. Golden hour streaming through stalks. Small clearing of packed earth. Wind, bamboo creaking. Mountain silhouettes background.
[LIGHTING] Golden hour duel — low orange side-key, deep amber shadows, dust motes catching light.
[COMBATANT A — Samurai, 50s] Weathered face, gray streaks, worn katana, stoic. Living legend. Center clearing.
[COMBATANT B — Young Challenger, 22s] Determined jaw, sharp new katana, nervous but honorable. 4m to camera-left.
[HOOK] Slow zoom on Samurai's face. Hand moves to hilt. In one explosive motion, draw — pristine metallic ring. Blade catches sunset, brilliant flash. Eyes are stone. Challenger involuntarily steps back.
[EXCHANGE 1] Samurai forward with economical footwork. Single overhead slash — no wasted motion. Challenger parries; arms visibly bend under force. Slides backward, feet dragging through earth, dust trail. Camera lateral-tracks.
[EXCHANGE 2] Challenger attacks: high, middle, low — three strikes. Samurai backsteps minimally; blade deflects each with precision. Challenger's strikes seem to bounce off an invisible dome. Frustration.
[ESCALATION] Challenger intensifies — longer combos, faster cadence. Samurai's defense flawless, micro-adjusting between exchanges. Bamboo around them begins to split from missed strikes and shockwaves. Camera orbits.
[CLIMAX] Samurai sees the moment. Challenger's footwork goes off-balance on a high strike. Samurai's blade moves — diagonal cut from upper-left to lower-right. Time slows. Challenger sees it but cannot react. Blade passes the ribs at maximum speed, wind cutting through gi fabric. No blood. Deliberately missed by a fraction.
[RESOLUTION] Both freeze. Challenger breathing heavy. Samurai lowers blade. Faintest respect on their face. Challenger bows deeply. Samurai sheathes. Sun dips.
[POST] SFX: long metallic draw on the unsheath, sharp blade-whistle on each cut, soft thud of dragging feet, bamboo crack on the splits, pre-impact silence on the climax cut. Music: solo shakuhachi, taiko on the unsheath, full silence on the climax cut, single bell on the bow.
```

## Output checklist before sending to i2v

- [ ] All template sections populated.
- [ ] One hook from `hooks.md`, fully described.
- [ ] Both combatants visually distinct.
- [ ] At least two named techniques per exchange.
- [ ] Camera move specified per beat.
- [ ] One primary effect per beat (not all at once).
- [ ] Environment interacts with the action.
- [ ] Recovery beat present if 10+ exchanges.
- [ ] No mid-fight dialogue.
- [ ] `[POST-PRODUCTION NOTES]` block with SFX, color grade, slow-mo segments.
- [ ] Reference uploaded if any named real person/franchise.
