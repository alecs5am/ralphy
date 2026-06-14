# Old-Spice absurd spokesman

> **For the LLM writing the next image / i2v prompt.** When the brief asks for
> an "Old Spice style" / "absurd swagger spokesman" / "Terry Crews vibe" /
> "Isaiah Mustafa vibe" ad, the visual language is the OPPOSITE of luxury
> fragrance (Tom Ford / Dior Sauvage). The rules below were extracted from a
> shot-by-shot analysis of three Old Spice ads and validated on a comedic
> deodorant spot.

## When to apply

Comedic, high-energy spokesman ads where one charismatic on-camera presenter
delivers an escalating absurd monologue — body wash, deodorant, snacks, energy
drinks, any "loud confident pitch-man" register. Also the right register for any
ad built around impossible match-cuts (the room transforms around a locked
actor) or a deliberately-fake comedic prop.

Do **NOT** apply to: moody luxury-fragrance / Tom-Ford chiaroscuro; calm
lifestyle UGC; photoreal candid portraits ([`photoreal-studio-portraits`](../photoreal-studio-portraits/));
product-only hero renders ([`cgi-product-renders`](../cgi-product-renders/));
any brief whose comedy is dry / deadpan rather than loud / intense.

## Model picks

| Goal | Model | Why |
|---|---|---|
| Spokesman master + scene frames | `openai/gpt-5.4-image-2` or `google/gemini-3-pro-image-preview` | Both produce credible high-key commercial frames; gemini for multi-ref identity lock once a master exists. |
| The actual motion (talking-head + comedic beats) | `kwaivgi/kling-v3.0-pro` | Photoreal-human i2v with `--audio` (EN only). Seedance rejects photoreal-human anchors. |

Lock a spokesman master shot and pass it as `--ref` on every downstream frame
(identity drift between cuts is the #1 quality killer). For the photoreal-skin
realism layer, fold in the six-token spine from
[`photoreal-studio-portraits`](../photoreal-studio-portraits/) — the body is
oiled, but the FACE must still read as photographed, not airbrushed.

## The register (it is high-key, NOT moody)

| Dimension | Old-Spice register | NOT (the trap) |
|---|---|---|
| Light | HIGH-KEY bright pastel, even commercial fill, soft directional key | Chiaroscuro, magic-hour, low-key drama |
| Setting | Bright pastel suburban / beach / kitchen / alpine lake — daylight, practical commercial set | Polished black marble luxury interior |
| Wardrobe | Shirtless / bare-chested; below-waist only (red athletic shorts, white waist towel, khakis) | Tuxedo, safari shirt, towel-on-shoulder (those are perfume ads) |
| Skin | Oiled-gleaming or lotioned sheen, visible muscle striations, accurate specular on the oil | Dry matte, or all-over slick oil with no striation |
| Mouth | OPEN — mid-shout / mid-vocalising | Closed cool half-smile |
| Eyes | Direct-camera, WIDE, unbroken eye contact | Cool half-lidded |
| Brows | Raised-both or furrowed-comedic | Subtle one-eyebrow-cool |
| Framing | Medium-wide or wide, short-tele 50mm, subject centered with breathing room | Tight moody portrait |

Two camera-movement flavours — pick one per scene:
- **Mustafa-style:** continuous smooth dolly-out / tracking reveals the absurd
  context (he is on a horse / on a log / mid-dive) while the actor holds a
  locked pose.
- **Terry-style:** locked-off camera; the actor is the kinetic one (jumps,
  flexes, sprays, shouts, transforms).

## Deliberate-prop VFX — the five tells

When a comedic creature or object is meant to look "obviously fake on purpose"
(a rubber-puppet cobra, a clone-motorcycle, a head that becomes a wheel), it has
to signal **intentional set-design fake** — otherwise the viewer reads it as the
AI / VFX department failing. All five tells are required; with fewer, the model
defaults to a generic illustrated render that is the worst of both worlds.

1. **Matte rubber / latex finish** — soft, sock-puppet / Henson hand-puppet
   surface. Never enamel-gloss specular.
2. **Deliberate prop-shop colour** — kelly / apple / school-art-class green
   (signals "art-department felt"). Not natural olive-bronze (reads as a failed
   real attempt) and not neon metallic emerald (reads as a CGI mascot).
3. **Visible craftsmanship tells** — a faint seam where cast halves meet, rubber
   wrinkles where it bent, a hint of wire armature or a puppeteer hand. Show it
   at least once.
4. **Stiff or jerky posture** — fixed in one pose like a prop master arranged
   it; never fluid serpentine motion.
5. **Comedic face design** — wide cartoon "Muppet" eyes, suspiciously symmetric
   face, silly open-mouth grin, pink-rubber tongue. Friendly, not menacing.

Negative cluster for the prop:

```
realistic snake skin, natural scale detail, national geographic, photoreal,
shiny enamel, metallic finish, fluid serpentine motion, fluorescent neon green,
shattering-glass overlay, lens-flare glow, fantasy CGI, dragon
```

Does **NOT** apply to: props that are supposed to be *real* in the fiction (a
real product, a real car) — those follow the normal photoreal rules, not the
deliberate-fake ones.

## Start-vs-end frame motion delta (mandatory for i2v)

When you produce a **start AND end frame** to drive an i2v model (Kling first +
last, Seedance keyframes), the two frames CANNOT be near-identical. If start ≈
end, the model interpolates ZERO motion and the clip renders as a static, dead
shot. In an Old-Spice-style ad the actor's pose / expression / hand position
changes significantly **every 1–2 seconds**, so two frames 4–5s apart must show
a distinct physical beat.

Every start↔end pair must answer, in one concrete sentence, **"what physically
changes in these 4 seconds?"** If you cannot answer it, the frames are static
and so is the video. Worked deltas:

- Start: arm at side, mouth closed, brow neutral → End: right arm lifted
  shoulder-height holding the product, mouth wide open mid-shout, both brows
  raised.
- Start: cobra coiled around shoulders, hands at sides → End: both hands raised
  in a "of course" gesture, the cobra has flicked its tongue and turned its head
  30° toward the lens.
- Camera-driven (Mustafa): Start: tight medium, neutral pose → End: wider frame
  as the camera has dollied out to reveal he is on a horse — actor pose
  unchanged, the *camera* delivers the delta.

Does **NOT** apply to: deliberately static "freeze" beats, single-frame i2v (no
end frame), or pure camera-push clips where the change is intentionally only the
framing (still a delta — name it).

## Anti-AI-slop tells for the photoreal layer

Fold these into the spokesman frames (they are the same family as
[`photoreal-studio-portraits`](../photoreal-studio-portraits/)): visible skin
pores + muscle striations; accurate, consistent specular on the oil across
motion; physical interaction with props (real grip / weight); sharp intentional
motion-blur on fast movement; consistent lighting on the moving subject (no
per-frame palette drift). Practical-set imperfection (a wall that visibly wobbles
during an impossible cut) reads as *real commercial set*, not as a glitch — lean
into it.

## Known traps

- **Building moody luxury light.** The single most common miss. This register is
  bright and high-key; if the frame is dark and dramatic, it is wrong.
- **Closed-mouth cool expression.** The mouth is open and the eyes are wide. A
  suave half-smile kills the comedy.
- **A prop with only some of the five tells.** Half-fake reads as AI failure.
  Enforce all five or make the prop fully real.
- **Identical start/end frames.** Guarantees a static i2v clip.
- **Music bleeding in from the i2v model.** Kling will add a random library cue
  that fights the dialogue — ban music in the prompt and post-mix a separate
  ElevenLabs Music pass (see `MODELS.md` `--audio` policy).
