# examples — analog-horror-psa

Two filled-in variants of the template for reference. The first is the source instance (verbatim). The second is a rebrief of the same scaffold onto a different `{{subject_warning}}` to show the format's reusable range.

---

## Variant 1 — "Your Dog Is Not Your Dog" (source instance, verbatim)

This is `workspace/projects/analog-horror-fridge-001/scenario.json` with the slots un-substituted. Use it as the validation case: if you fill the slots back to these values, you should reproduce the source's `final-glitchx-full-v3-opt30.mp4` (28 MB winner).

### Slot fills

| Slot | Value |
|---|---|
| `{{brand_name}}` | Compliance Bureau (in-universe) |
| `{{subject_warning}}` | your dog |
| `{{subject_warning_id}}` | 9-D |
| `{{bulletin_id}}` | nine D |
| `{{tell_1}}` | watches you sleep |
| `{{tell_2}}` | its reflection does not blink |
| `{{tell_3}}` | whispers your name when you are alone |
| `{{do_not_1}}` | look in its eyes after sunset |
| `{{do_not_2}}` | say its old name |
| `{{do_not_3}}` | let it on your bed |
| `{{but_reveal}}` | your dog died three years ago |
| `{{and_sting}}` | tonight it stops pretending |
| `{{vo_voice_id}}` | "Alerter" community voice (or `weA4Q36twV5kwSaTEL0Q` Ava as API fallback) |
| `{{target_language}}` | en |

### Full VO (ALL CAPS input)

```
COMPLIANCE BULLETIN NINE D.
THIS IS A RESIDENTIAL BEHAVIORAL ALERT.
IF YOUR DOG WATCHES YOU SLEEP.
IF ITS REFLECTION DOES NOT BLINK.
IF IT WHISPERS YOUR NAME WHEN YOU ARE ALONE.
DO NOT LOOK IN ITS EYES AFTER SUNSET.
DO NOT SAY ITS OLD NAME.
DO NOT LET IT ON YOUR BED.
BUT YOUR DOG DIED THREE YEARS AGO.
AND TONIGHT IT STOPS PRETENDING.
```

### Notes

- Setup callback (do-not-3 → tell-1): the entity that "watches you sleep" is now forbidden from your bed. That callback is the format's signature dread-build.
- The scene-09 icon (empty collar + headstone + "2 0 2 2" year) lands the "but" emotionally because the collar is what the entity was wearing throughout the previous 8 scenes — without saying so.
- Scene-10's first 0.8s shows the dog-grin icon (mouth-too-wide, eyes-void) before HARD CUT to color-bar static. Don't extend that 0.8s — the cut is the punch.

---

## Variant 2 — "Your Child Is Not Your Child" (re-brief on the same scaffold)

A demonstration that the format generalizes by replacing `{{subject_warning}}` and re-keying the IF/DO-NOT/BUT/AND clauses. Same beat scaffold, same icon style lock, same VO register, same SFX bed.

### Slot fills

| Slot | Value |
|---|---|
| `{{brand_name}}` | Domestic Vigilance Authority (in-universe) |
| `{{subject_warning}}` | your child |
| `{{subject_warning_id}}` | 4-A |
| `{{bulletin_id}}` | four A |
| `{{tell_1}}` | stands in your doorway after midnight |
| `{{tell_2}}` | its photograph from last year does not match |
| `{{tell_3}}` | knows what you dreamed about |
| `{{do_not_1}}` | answer when it asks if you are sleeping |
| `{{do_not_2}}` | use its first name |
| `{{do_not_3}}` | leave its bedroom door open |
| `{{but_reveal}}` | your child has been missing since two thousand twenty |
| `{{and_sting}}` | tonight the imitation finishes |
| `{{vo_voice_id}}` | "Alerter" community voice |
| `{{target_language}}` | en |

### Full VO (ALL CAPS input)

```
COMPLIANCE BULLETIN FOUR A.
THIS IS A RESIDENTIAL BEHAVIORAL ALERT.
IF YOUR CHILD STANDS IN YOUR DOORWAY AFTER MIDNIGHT.
IF ITS PHOTOGRAPH FROM LAST YEAR DOES NOT MATCH.
IF IT KNOWS WHAT YOU DREAMED ABOUT.
DO NOT ANSWER WHEN IT ASKS IF YOU ARE SLEEPING.
DO NOT USE ITS FIRST NAME.
DO NOT LEAVE ITS BEDROOM DOOR OPEN.
BUT YOUR CHILD HAS BEEN MISSING SINCE TWO THOUSAND TWENTY.
AND TONIGHT THE IMITATION FINISHES.
```

### Icon adaptations (paste into `prompt-cookbook.md` STYLE_BASE)

| Scene | Subject for THIS icon |
|---|---|
| 01 (hook) | Red EBS-style title card with "4-A" + horizontal red bars |
| 02 (setup) | Side-view child silhouette standing calmly, simple flat pictogram, no expression, ordinary clothing silhouette (round head, short body, sock-feet) |
| 03 (if-1) | A vertical doorframe pictogram on the left; a child silhouette standing in the doorway facing the viewer; two small bright dots for eyes |
| 04 (if-2) | Split-frame: left side a photo frame pictogram with a generic child silhouette inside; right side the same child silhouette IRL, but with eyes as solid blocks instead of dots. Pictogram speech bubble between them with "≠" symbol |
| 05 (if-3) | Child head profile with mouth slightly open + speech bubble with three scrambled symbols (╳ ▒ ╳) representing "knows your dream" |
| 06 (do-not-1) | Child face front-view + red prohibition slash + tiny moon pictogram below the slash (for "after midnight") |
| 07 (do-not-2) | A pictogram of a name tag / label with three illegible glyphs + red prohibition slash |
| 08 (do-not-3) | A horizontal bedroom-door pictogram with the door ajar, child silhouette behind, + large red prohibition slash across the open door |
| 09 (but) | Pictogram of an empty bedroom doorway with a small toy on the floor + "2 0 2 0" digits below |
| 10 (climax) | Child face front-view with mouth split open too wide showing pictogram-block teeth, eyes pure black voids. HARD CUT to blurred color-bar static at 0.8s |

### Notes

- The pattern is portable as long as `{{subject_warning}}` is something the viewer takes for granted in their domestic life — pet, child, partner, reflection, neighbor.
- Verify the {{but_reveal}} year is in the past (the "missing since" date is what closes the loop emotionally).
- {{and_sting}} should imply this-very-night to ground the dread in present-time.

---

## Suggested rebrief axes (other variants to try)

| Subject | Tells (3) | Do-nots (3) | But | And |
|---|---|---|---|---|
| your reflection | "moves when you do not", "blinks before you do", "smiles when you do not" | "stand in front of mirrors after dark", "speak to it", "let it stand alone" | "your mirror has been empty since the fire" | "tonight it steps out" |
| your neighbor | "knocks at the same minute every night", "knows your address", "thanks you for things you did not do" | "answer the door after eight", "say their name aloud", "look at their windows" | "their house was demolished in nineteen ninety-eight" | "tonight they finish moving in" |
| the second moon | "is brighter than the first", "stays still when the sky turns", "is visible only to you" | "point at it", "describe it to others", "sleep with the curtains open" | "earth has had one moon since recorded history began" | "tonight it lands" |

For any of these: the format is the constant, the content is the variable. Re-read TEMPLATE.md "Key rules" 1-7 every time before generation — the cost overruns in the source project all came from rule violations, not from creative work.
