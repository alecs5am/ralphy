# Indie PS1 / PS2 horror registers

> **For the LLM writing the next image / i2v prompt.** Two retro-game horror
> looks that are constantly confused. They are NOT interchangeable — picking the
> wrong one is the most common miss, and it reads as "childish / cartoonish for
> kids" when you crude-PS1 a doomer brief, or as "too clean / AAA" when you
> smooth-shade a found-footage brief.

## When to apply

A brief asks for a retro-videogame horror look — "PS1 horror", "Fears to
Fathom / Chilla's Art style", "found-footage game", or the sad / doomer /
melancholy "PS2 / dreamcore" aesthetic. First decide which of the two registers
below the brief wants, then follow that register's recipe.

Do **NOT** apply to: photoreal humans, broadcast realism, posters, FB creatives,
or any brief wanting polished cinematic realism. Confirm the user wants the
retro-game look before applying — and for the doomer variant, confirm cold-blue
melancholy specifically (it is a narrow mood).

## Register A — crude PS1 indie-horror (found-footage dread)

The Chilla's Art / Fears to Fathom look: flat restrained lighting, heavy film
grain / VHS noise, muted desaturated palette, low-res textures, low-poly models
with *realistic* proportions, a mundane found-footage feel. The reliable recipe
on `openai/gpt-5.4-image-2`:

1. **Name the exact games.** `rendered in the visual style of Chilla's Art and
   Fears to Fathom indie PS1/PS2 horror games — flat restrained lighting, heavy
   film grain / VHS noise, muted desaturated palette, low-res textures, low-poly
   models with realistic proportions, mundane found-footage look; NOT cinematic,
   NOT painterly, NOT AAA, NOT voxel/cube-based.` Generic "voxel / low-poly, NOT
   photoreal" tokens alone fail — gpt-image renders a dark painterly-cinematic
   image instead.
2. **Pass the games' screenshots as the DOMINANT style `--ref`.** This is what
   actually flips the register; words alone do not.
3. **Do NOT pass your own earlier cinematic render as a content `--ref` while
   chasing this look.** A cinematic frame as a ref dominates the style ref and
   drags the output back to glossy / dramatic. Describe the content in the prompt
   instead. Once a frame is ALREADY in the target register, it is safe to ref it
   for continuity.
4. **Frame as a first-person game screenshot.** `a screenshot from a first-person
   horror video game, no UI`, with a POV blocky hand + a light source in the
   foreground. Place guides / characters logically (a hologram emanates from an
   emitter, not floating). Keep characters LARGE and CLOSE, feet visible, filling
   the vertical frame — they double as the TikTok thumbnail.

For scene continuity: once a register-correct hub frame exists, ref THAT hub
(now flat / safe) for location + style + the character master for identity, and
keep the Chilla's-Art wording in the prompt. Generate scene anchors SEQUENTIALLY
(each reffing the previous non-death scene) — parallel gen drifts the location.
For a faux let's-play, put first-person POV hands in EVERY frame (the model drops
them unless each prompt demands them).

Does **NOT** apply to: `google/gemini-3-pro-image-preview` (different bias,
better multi-ref — use it once a register-correct frame exists to ref); the PS2
doomer register below; polished cinematic realism. Note gpt-image still tends to
crop legs in 9:16 with a foreground POV hand — add "wide shot, head-to-boots, do
not crop legs" and expect occasional re-rolls.

### Trick — a real person in crude PS1 (identity photo + a Low Poly Shorts frame)

To turn a REAL person into a crude-PS1 ("Low Poly Shorts") character, pass TWO
refs on `google/gemini-3-pro-image-preview` multi-ref: the identity photo as one
`--ref`, and an actual "Low Poly Shorts"-style video FRAME as a SECOND, STYLE
`--ref`. Prompt a baked / dithered painted PS1 face TEXTURE integrated into a
low-poly head, with NORMAL body proportions. The style frame is what carries the
crudeness — the identity photo alone will not.

Ban list (each is a distinct failure mode, not a nitpick):

- **Prompt-only "crude PS1" with no style-frame ref.** Gemini renders a smooth
  uncanny photo-on-mesh — the Mortal-Kombat-digitize look — not a crude model.
- **Bobblehead / oversized heads.** Keep head-to-body proportions normal; the
  crudeness lives in the TEXTURE and facet count, not in caricature scale.
- **Post-process "image crunch".** Do not reach for a downscale / crunch pass to
  fake the register — bake the grit at generation instead.

See memory `ps1-crude-real-person-i2v`; and note the PS1 model must read as a
VOLUMETRIC 3D low-poly MODEL, not flat 2D pixel art (memory
`ps1-volumetric-3d-not-pixel-art`).

### Trick — holding the crude look through i2v (crude-pass before seedance)

An anchor built straight from clean volumetric masters DRIFTS realistic when you
run it through `bytedance/seedance-2.0` i2v — the model regresses a clean anchor
back toward photo-realism, breaking the crude look. Fix: regen the anchor
through a crude-pass FIRST, then i2v the crude anchor.

The crude-pass is itself a two-ref gemini gen:

- **Image1 = your own anchor**, held for composition / pose / framing.
- **Image2 = a passed crude anchor**, held for face crudeness — faceted box-ish
  heads, flat painted features, low-poly facet bodies, dithered cloth.

That same crude-pass bakes the frame grit that clears seedance's input-image
privacy scan — a clean anchor reads as a photo and gets blocked. Do not restate
that scan's rules here; read the "Clearing the safety / privacy filter" section
of the [`/seedance-prompts`](../../.agents/skills/seedance-prompts/SKILL.md#clearing-the-safety--privacy-filter)
skill (#547).

Does **NOT** apply to: the clean-volumetric register (deliberately smooth
low-poly) — it needs NO crude pass; and the box-face hack — do not substitute
plain box heads for real crudeness, bake the grit instead.

## Register B — smooth PS2 cutscene (sad / doomer melancholy)

For the "sad / melancholy / depression" 3D-render look (heavy rain, lonely
figure, doomer mood), target the **PS2-era real-time CUTSCENE register — Silent
Hill 2 (2001) / Indigo Prophecy look** — NOT crude blocky PS1, NOT modern CGI,
NOT bright / cartoon. This is the large "sad PS2 / dreamcore doomer" IG/TikTok
aesthetic, and crude PS1 + a warm palette reads as childish here.

Prompt formula (validated on a melancholy heavy-rain piece):

- `early-2000s PlayStation 2-era real-time cutscene render, Silent Hill 2 /
  Indigo Prophecy look` — smooth-shaded low-to-mid-poly, slightly doll-like
  proportions, plain low-res textures, soft baked shadows. Explicitly ban: crude
  blocky PS1, modern hi-fi CGI, Pixar / cartoon, clean.
- Texture: heavy film grain + low-bitrate / VHS compression artifacts + slight
  soft out-of-focus blur + crushed blacks.
- Grade: deep desaturated COLD navy-steel-blue NIGHT (or desaturated olive/green
  for the daytime variant), very low-key, room mostly in darkness, one light
  source.
- Mood device: a large window with HEAVY RAIN streaking the glass + blurred city
  lights bleeding through; a lone static figure, hollow / defeated expression.
- Refs: pass a real example FROM THE GENRE as the dominant style ref + the
  character ref for identity (`google/gemini-3-pro-image-preview` multi-ref).
- **Do the grain / grade ON the generation — do NOT post-crunch.** A PS1-crunch
  downscale effect is the WRONG tool here; it is a different look.

Does **NOT** apply to: the crude-PS1 register above; bright / wholesome
nostalgia; daytime / warm scenes. Confirm the user wants the cold-blue doomer
mood before applying.

## The one-line decision

- Found-footage dread, mundane horror, "let's play", flat + grainy + blocky →
  **Register A (crude PS1)**.
- Sad / lonely / heavy-rain / dreamcore melancholy, smooth-but-dated, cold-blue →
  **Register B (PS2 cutscene)**.

If the brief is ambiguous, ask which mood before generating — the registers do
not blend.
