# Fight Scenes — Template

Cinematic combat for short-form: duels, brawls, chases, sword fights, hero/villain exchanges. The template translates choreography into model-readable structure so the i2v stack actually renders momentum, weight, and impact instead of generic flailing.

## Why it works

Fight cuts go viral when three things land at once:

1. **Apex-pose hook in the first 0.5–2.0s** — the viewer enters mid-strike, not before it. The opening frame already shows maximum extension (fist mid-impact, blade locked, kick at peak). No setup, no "two guys squaring up."
2. **Specific moves, not vague action.** "They fight intensely" is dead. "Defender flows back three steps, parries the overhead, pivots 45° and drives an elbow into the ribs" is alive. Specificity gives the model a physics target.
3. **Camera as combatant.** Push on aggression, pull on grapple, orbit on deadlock, whip-pan on chaos. The camera carries half the kinetic load.

On top of that: dust, sparks, fabric ripple, sweat spray, shockwaves, and pre-impact silence sell the punch. The body of the cookbook is in [`prompt-cookbook.md`](prompt-cookbook.md).

## Vibe anchors

- **Tension–release rhythm.** Circle → strike → recover → escalate. Never a flat plateau of constant action; the eye burns out in 3 seconds.
- **Choreography as language.** Each exchange has an initiator and a responder. Name them. Track who has initiative.
- **Environmental commitment.** Rain means slipping, splashing, water flying off heads. Bamboo means stalks splitting on missed strikes. Choose an arena and let it interact.
- **Impact, not gore.** Suggest force through deformation, knockback, dust, and recovery. Avoid hyperrealistic blood — the i2v models render it poorly and platforms throttle it.
- **Stamina realism.** After 10–15 exchanges, fighters breathe. Skipping recovery breaks suspension of disbelief.

## Variation axes

| Axis | Choices |
|---|---|
| Discipline | kung-fu, karate, muay-thai, capoeira, mma, taekwondo, judo, wrestling |
| Weapon | unarmed, katana, dual-blades, spear, bo staff, whip, gun-fu, dual pistols |
| Register | grounded-realism, wuxia/wirework, anime-superhero, fantasy-elemental, gritty-street |
| Environment | rain courtyard, bamboo grove, neon alley, rooftop at night, gladiator arena, mountain peak, frozen lake, burning warehouse, ancient stone temple |
| Scale | 1v1 duel, 2v1 flanking, wave attacks (1→2→3), group melee with sectioned frame |
| Tempo | deliberate samurai stillness, explosive MMA scramble, balletic wuxia float, anime-shockwave maximalism |
| Light | golden hour, neon-rain, blue-moon, firelight interior, lightning storm |

Mix one cell per row. Crossing register × environment is where the freshness lives ("muay-thai in a flooded subway tunnel").

## Narrative arc (the structure constant)

```
[2s HOOK]              apex pose, mid-action, viewer enters in motion
[EXCHANGE 1]           initiator commits, defender responds
[EXCHANGE 2]           defender counters or escalates
[ESCALATION]           tempo doubles, environment starts breaking
[CLIMACTIC MOMENT]     decisive beat — clear win, stalemate, or twist
[RESOLUTION]           breathing, bow, walk-off, or chase resumes
```

For a 9:16 social cut at 8–15s, fold this into 2–4 model clips:
- 1 clip: hook + exchange 1 (5s)
- 1 clip: exchange 2 + escalation (5s)
- 1 clip: climax + resolution (5s)

## Required inputs

The producer/scenarist needs all of these before the art-director starts generating prompts. Missing inputs → ask, don't guess.

1. **Combatant A** — appearance (clothing, build, age cue), discipline, emotional state (calm, desperate, cocky), starting position relative to camera.
2. **Combatant B** — same fields. Asymmetry between A and B is what makes it a fight, not a sparring session.
3. **Arena** — one location with one weather/light condition. Pick from variation axes; don't blend two.
4. **Discipline + weapon mix** — one per fighter. Cross-discipline (katana vs bo staff) reads better than same-discipline.
5. **Register** — pick exactly one. Grounded-realism and anime-superhero do not co-exist in one cut.
6. **Stakes** — one line. "Honor duel," "rescue," "ambush survival," "tournament final." This drives facial expressions and recovery behavior.
7. **Reference (optional, conditional)** — required only if the user names a real fighter, a copyrighted character, or a specific gym/franchise. Otherwise generic.

## When NOT to use this template

- **Talking-head content.** Mid-fight dialogue does not render. Use `talking-head-rant` or `talking-character` and cut to action b-roll.
- **Cute/comedy violence.** Slapstick has different physics requirements; this template assumes weight and consequence.
- **Real-world combat sport replays.** UFC/boxing recreation needs reference photos and the reference-required gate. Without that, it reads as fake.
- **Gore or explicit injury.** Models refuse or render badly. Use suggestion (knockback, stagger, blood-on-fabric implication) not depiction.
- **Sub-5s ad cut where the viewer needs to read brand context first.** Action without setup is fine for entertainment, terrible for product association — combine with `before-after-product` if it's an ad.

## Companion docs

- [`hooks.md`](hooks.md) — 10 opening hook patterns with examples, ranked by reliability.
- [`prompt-cookbook.md`](prompt-cookbook.md) — master template, camera moves, lighting, sound design notes, common mistakes, full example prompts.
