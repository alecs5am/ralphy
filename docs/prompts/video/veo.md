# Veo video prompts

Veo-3.x expects the prompt in a **strict 7-part skeleton** (the adapter enforces this):

1. **Shot framing & motion** — camera distance, lens, movement.
2. **Style** — register / film stock / aesthetic.
3. **Lighting** — direction + temperature + softness.
4. **Character** — identity tokens, age, distinctive features.
5. **Location** — where + when (time of day / season).
6. **Action** — verb phrase + gesture.
7. **Dialogue** — one line, quoted.

### Hard rules

- **Veo lip-syncs natively.** If you supply VO, expect mouth shapes to track. Don't supply VO if you also plan to overlay ElevenLabs (double-mouth artifact).
- **Skip the meta-commentary.** Don't write "the camera shows…" — Veo reads "shot:" as the cue.

---

## Mode 1 — `cinematic-product-hero`

**When:** Premium DTC reveal, locked composition, 5–8s.

**Formula:**
```
Shot: locked tripod, 85mm macro, shallow DoF. Style: cinematic commercial, color-graded teal/orange.
Lighting: single hard rim from screen-left, soft fill from frontal. Character: <product> centered, pristine.
Location: matte black studio. Action: <product> rotates slowly, gentle catchlight sweep.
Dialogue: none.
```

**Don't:** handheld motion (reads cheap).

## Mode 2 — `creator-confession-monolog`

**When:** Selfie-distance creator delivers a 5-8s monolog with natural lip-sync.

**Formula:**
```
Shot: selfie 35mm, eye-level, slight handheld. Style: naturalistic, Kodak Portra register.
Lighting: window light screen-left, ambient indoor. Character: <persona + identity>.
Location: <home interior>, morning. Action: leans in slightly, holds eye contact.
Dialogue (deadpan): "<line>"
```

**Don't:** glamour register (defeats the "real human" read).

## Mode 3 — `wide-establishing-environment`

**When:** Opening scene of a multi-clip piece, locks the world before any action.

**Formula:**
```
Shot: wide 24mm, slow dolly-in 1m. Style: cinematic 35mm, anamorphic flare.
Lighting: <golden hour / blue hour / overcast>, ambient.
Character: distant figure silhouette, no detail. Location: <wide environment>.
Action: <minor environmental motion — leaves, water, traffic>. Dialogue: none.
```

**Don't:** add a close-up subject (defeats the establishing shot).

## Mode 4 — `dialogue-two-shot`

**When:** Two characters in conversation, alternating coverage.

**Formula:**
```
Shot: medium two-shot 50mm, locked. Style: TV-drama register.
Lighting: motivated practicals + soft key. Character A: <persona>. Character B: <persona>.
Location: <interior>. Action: A and B mid-conversation, A makes a small gesture.
Dialogue (Character A, conversational): "<line>"
```

**Don't:** over-describe both characters (Veo loses the second).

## Mode 5 — `hyper-motion-action`

**When:** Fast physical motion — sports, action, hyperreal commercial.

**Formula:**
```
Shot: handheld 35mm, motion-tracking subject. Style: hyper-real commercial, slight motion blur.
Lighting: hard sun + bounce. Character: <athlete or actor + wardrobe>.
Location: <action environment>. Action: <verb-rich physical sequence>.
Dialogue: none.
```

**Don't:** mix slow-mo + fast motion in one prompt (Veo picks one badly).
