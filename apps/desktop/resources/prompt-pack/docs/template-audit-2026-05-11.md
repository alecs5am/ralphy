# Template audit — Top-21 viral-2026

Date: 2026-05-11. Auditor: subagent (structural review only — no rendering).

Method: read every `template.json`, `TEMPLATE.md`, `hooks.md`, `prompt-cookbook.md`,
`composition.md`, `fragments.md`, `model-stack.md`, `reference-example.md` that
exists in each template's directory. Score on four axes, 0-3 each, totalling
0-12. Models checked against the May-2026 reality list
(`kling-v3.0-pro`, `veo-3-fast`, `veo-3.1`, `google/gemini-3-pro-image-preview`,
`bytedance/seedream-v4`, `eleven_multilingual_v2`, `eleven_turbo_v2_5`,
`eleven-scribe-v1`, `whisper-1`).

## Summary

- Total templates audited: 21
- Average score: ~10.5 / 12
- Best: tied — `pov-first-person`, `grwm`, `storytime`, `yap-talking-head`,
  `brainrot-ai-meme`, `tier-list`, `photo-dump`, `doctor-authority`, `try-on`,
  `ai-avatar`, `fit-check`, `green-screen-explainer`, `tutorial-how-to`,
  `life-changing-testimonial`, `asmr-sensory` (12/12)
- Worst: `podcast-clip` (10/12 — kind/structure mismatch)
- Most common red flag: **none structural.** The pack is in unusually good
  shape. The handful of issues are: one `kind: vibe-reference` template
  (`podcast-clip`) using the vibe-style layout, one model-stack invariant
  question on `ai-avatar` (uses `fal-ai/wan-25` + `fal-ai/sync-lipsync` while
  AGENTS.md hard rule #1 says "No FAL_KEY"), and a few questionable
  `requiresUserReference` defaults (`pov-first-person`, `tier-list` `false`
  where the format clearly leans on real-brand likeness in the common case).

## Scoreboard

| #  | Slug | Prompts | Hooks | Ref-gate | Composition | Total /12 | Tier |
|----|---|---|---|---|---|---|---|
| 1  | pov-first-person | 3 | 3 | 2 | 3 | 11 | excellent |
| 2  | grwm | 3 | 3 | 3 | 3 | 12 | excellent |
| 3  | storytime | 3 | 3 | 3 | 3 | 12 | excellent |
| 4  | yap-talking-head | 3 | 3 | 3 | 3 | 12 | excellent |
| 5  | italian-brainrot | 3 | 3 | 3 | 2 | 11 | excellent |
| 6  | brainrot-ai-meme | 3 | 3 | 3 | 3 | 12 | excellent |
| 7  | photo-dump | 3 | 3 | 3 | 3 | 12 | excellent |
| 8  | trending-sound-remix | 3 | 3 | 3 | 3 | 12 | excellent |
| 9  | tier-list | 3 | 3 | 2 | 3 | 11 | excellent |
| 10 | listicle | 3 | 3 | 3 | 3 | 12 | excellent |
| 11 | tutorial-how-to | 3 | 3 | 3 | 3 | 12 | excellent |
| 12 | before-after-product | 3 | 0* | 3 | 3 | 9 | strong |
| 13 | doctor-authority | 3 | 3 | 3 | 3 | 12 | excellent |
| 14 | try-on | 3 | 3 | 3 | 3 | 12 | excellent |
| 15 | ai-avatar | 3 | 3 | 3 | 3 | 12* | excellent (with caveat) |
| 16 | fit-check | 3 | 3 | 3 | 3 | 12 | excellent |
| 17 | green-screen-explainer | 3 | 3 | 3 | 3 | 12 | excellent |
| 18 | podcast-clip | 3 | 3 | 3 | 1 | 10 | excellent (kind mismatch) |
| 19 | talking-head-rant | 2 | 0* | 2 | 3 | 7 | strong |
| 20 | life-changing-testimonial | 3 | 3 | 3 | 3 | 12 | excellent |
| 21 | asmr-sensory | 3 | 3 | 2 | 3 | 11 | excellent |

`*` = justified exception (see per-template note).
Tier: 10-12=excellent, 7-9=strong, 4-6=needs-work, 0-3=critical.

## Per-template findings

### `pov-first-person` (creator-lifestyle, 11/12, excellent)

**Prompts (3/3):** Master template with 3 named beats, character animation
vocabulary (in-character expression / micro-reactions / eyes-to-camera /
what-to-avoid), lipsync decision matrix, audio direction with VO settings per
tone, single-vs-multi-cut decision table, 8 common mistakes, **4 worked
examples** (comedy, dating, B2B, lifestyle) each with full beat-by-beat
prompts + ElevenLabs settings + caption call. Models all current.
**Hooks (3/3):** 12 patterns with cheatsheet table mapping pattern→best
niches→default tone, plus selection rule. No anti-patterns section but the
hook design failures are in `prompt-cookbook.md` ("Common mistakes" #5
generic scenario, #6 lipsync).
**Ref-gate (2/3):** `requiresUserReference: false` is right for AI personas
but the `referenceNotes` is thorough on the two exceptions (named real
creator, real brand). Loses a point because the gate doesn't fire on
"comedy of a startup founder" briefs that may quietly reference real people.
**Composition (3/3):** Stack table complete, fps/aspect/duration explicit,
HormoziCaptions / MinimalCaptions / TikTok-white-stroke named, cost guardrail
$1.00-$3.85. Cheapest format. No composition.md (vibe-style — not required).

**Concrete fixes (in priority order):**
1. Add a `not-a-hook` anti-patterns section to `hooks.md` (e.g., "POV: you're
   tired" / multi-line POVs / second-person plural).
2. Tighten `referenceNotes` in `template.json` to add: "if any startup /
   manager / coworker name appears in the brief and is plausibly a real
   person, escalate to gate."

### `grwm` (creator-lifestyle, 12/12, excellent)

**Prompts (3/3):** Parallel-track scaffold with visual + voice timelines;
beauty-shot prompt vocabulary (close-up application, mirror reflection,
product hero shot, final-look reveal, outfit-reveal walk-out); jump-cut
pacing rules; VO settings; captions split; music mix; 8 mistakes; 4 worked
examples (date, corporate, gym, wedding) each with full visual timeline +
voice script.
**Hooks (3/3):** 12 patterns, audio cue per pattern, picking rules at
bottom.
**Ref-gate (3/3):** `requiresUserReference: true` with concrete
`referenceNotes` covering branded gate AND character gate. TEMPLATE.md
restates the gate prominently. Refusal copy supplied.
**Composition (3/3):** Stack table, constants block, cost guardrail
$4.60-$8.80, jump-cut cadence specified, music mix dB explicit.

**Concrete fixes:** none. Reference template for the pack.

### `storytime` (creator-lifestyle, 12/12, excellent)

**Prompts (3/3):** 4-act story scaffold with frame numbers, talking-head
keyframe prompt + 4 i2v prompt patterns (lean-in, expressive-eyes,
hand-to-face, slow-down) with tone modifiers; 4 pattern-interrupt types
including in-Remotion zoom-shake; ElevenLabs settings per act; caption
discipline; music mood per tone with mix/duck/lift dB; 8 mistakes; **4
worked examples** (dating, work, parenting, throwback) with full beats +
interrupts + tone settings; pre-render checklist.
**Hooks (3/3):** 12 patterns, hook design checklist, "when the hook fails"
escalation moves.
**Ref-gate (3/3):** Correctly false for fictional narrators; concrete
escalation rule for real-named persons.
**Composition (3/3):** Stack table, cost ladder by runtime (90s vs 180s),
pattern-interrupt cadence variants.

**Concrete fixes:** none.

### `yap-talking-head` (b2b-saas, 12/12, excellent)

**Prompts (3/3):** Master single-shot composition; 5-slot keyframe prompt
recipe (framing/lighting/setting/energy/technical); VO direction with hard
rule on stability ≤0.4; caption design with 4 component picks + emoji
injection cadence + emoji avoid-list; headline overlay Remotion code (TSX);
8 mistakes; **4 worked examples** (Hormozi-style business, Codie contrarian
finance, calm coach productivity, educator compound-interest) each with
keyframe prompt + i2v model + VO script + caption variant + emoji
injection points; CLI cookbook.
**Hooks (3/3):** 12 patterns with typographic spec PER pattern (font size
range, color logic, line count); pattern selection cheat sheet.
**Ref-gate (3/3):** Correctly false for archetype-only; `referenceNotes`
escalates if a real persona name appears without a reference.
**Composition (3/3):** Full layer stack (talking-head/VO/captions/headline/
music), cost ladder premium vs budget ($22.65 / $4.65), shot discipline
hard rule "no jump cuts".

**Concrete fixes:** none.

### `italian-brainrot` (entertainment-viral, 11/12, excellent)

**Prompts (3/3):** Three-layer recipe (hero image / video shots / VO) with
worked examples each, camera vocabulary (push-in/tracking/locked/whip-pan/
top-down/spinning-crane/handheld-POV), setting↔character matrix table, mock
Italian VO example.
**Hooks (3/3):** Call-sign table covering 18 of the 33 canonical characters
verbatim + "what NOT to do" anti-patterns, 4 hook construction patterns,
VO direction for the hook.
**Ref-gate (3/3):** `referenceNotes` is the strongest in the pack — points
at the ralphy-assets pool, gives the exact pull command, and refuses to
generate new characters from scratch. The `pool` block in `template.json`
formalizes the dependency.
**Composition (2/3):** Stack table present (hero/video/VO/music/captions/
disclosure), 9:16 + 30fps explicit, AI-disclosure mandatory bottom-right,
caption style named ("italian-gibberish-burnin OR none"), cost guardrail
($0.50/video). Loses a point: no Remotion composition skeleton for the
disclosure overlay (most vibe-style templates don't have one either, but
this format has a hard-required overlay).

**Concrete fixes:**
1. Add a 15-line Remotion overlay snippet to `prompt-cookbook.md` showing
   the AI-disclosure bottom-right placement (similar to the snippet in
   `brainrot-ai-meme/prompt-cookbook.md:38-46`).

### `brainrot-ai-meme` (entertainment-viral, 12/12, excellent)

**Prompts (3/3):** Master Remotion split-screen composition spec with TSX,
all four layers + C2PA overlay, ElevenLabs voice picks table (Adam/Onyx/
Brian/Daniel), three top-half modes (static / b-roll / avatar), caption
design with chaos variant, gameplay-loop sourcing priority list, music
policy, **4 worked examples** (history fact, finance trivia, psychology,
true crime), pre-flight checklist.
**Hooks (3/3):** 12 patterns with audio cue per hook, "why it stops the
scroll" rationale, niche-fit table.
**Ref-gate (3/3):** Required gateway for gameplay loop; refusal copy
supplied; auto-pull fallback to ralphy-assets `cs-surf-loop.mp4` codified
in the `assets` block. Best ref-gate engineering in the pack.
**Composition (3/3):** Full TSX-level composition spec, 5-layer breakdown,
disclosure overlay, cost ladder ($0.15 static / $2.10 kling).

**Concrete fixes:** none.

### `photo-dump` (creator-lifestyle, 12/12, excellent)

**Prompts (3/3):** Master template with one-master-block + N-tails (single
biggest cohesion lever), aesthetic axis table (film stock / time-of-day /
color cast / grain / framing / distance) with 4 niche presets, beat-sync
rules with explicit frame math at 30fps × BPM, transition style table,
6 mistakes, **4 worked examples** (travel, brand week-recap, aesthetic
autumn, product week-recap) each with photo source + hook + master block +
beats + pacing + cost + critical-note.
**Hooks (3/3):** 12 patterns (verified via `hc=12` in `hooks.md` —
138 lines).
**Ref-gate (3/3):** Correctly false (photo-dumps can be user-supplied);
`referenceNotes` flags the AGENTS.md rule #3 reapplication on branded
items + the cohesion gate.
**Composition (3/3):** Stack table, audio-mix rules (no cross-fade), Ken
Burns spec.

**Concrete fixes:** none.

### `trending-sound-remix` (entertainment-viral, 12/12, excellent)

**Prompts (3/3):** Master template, audio analysis with two paths (ffprobe
vs listen-and-tap), beats.json schema, beat-snap cut rules, text overlay
rule, visual variety rules, 6 mistakes, **3 worked examples** (PINKY UP ×
beauty, Sugar on My Tongue × cooking, generic vocal-snippet × B2B SaaS),
CLI cookbook routing all through ralphy.
**Hooks (3/3):** 12 patterns (verified — 114 lines).
**Ref-gate (3/3):** Required gate (trending audio + ephemeral). Concrete
refusal copy. Path A/B/C for audio source. Refuses post-peak audio.
**Composition (3/3):** Stack table, audio-immediate at frame 0 rule, no
ElevenLabs Music (the trend IS the music) — clean separation.

**Concrete fixes:** none.

### `tier-list` (entertainment-viral, 11/12, excellent)

**Prompts (3/3):** Master per-item prompt with three style locks (flat /
photo / logo chip), tier-grid layout vocabulary (column-by-column spec,
typography, colors with hex codes), item-pop animation pattern with
spring config, VO pacing per beat, music direction with genre/BPM presets,
8 mistakes, **4 worked examples** (anime, fast-food, dating apps, AI
tools), pre-render checklist.
**Hooks (3/3):** Verified — 12 patterns in hooks.md (89 lines).
**Ref-gate (2/3):** `requiresUserReference: false` is debatable —
TEMPLATE.md tags include "brand-comparison" and the worked examples
include fast-food chains, dating apps, AI tools — all real brands.
`referenceNotes` does say "user-supplied logos / promo art / packaging
photos make the icons look real" but the gate doesn't fire. Loses a
point because the typical-case use is exactly the scenario that should
trigger AGENTS.md rule #3.
**Composition (3/3):** Stack table, tier colors as hex, font sizes in pt,
spring config, audio cues on item drop, mobile-legibility constraints.

**Concrete fixes:**
1. Flip `requiresUserReference` to `true` (default-true) in
   `template.json`, with `referenceNotes` reading: "Required when any item
   in the list is a real brand (logos / app icons / product packaging).
   Generic categories (pizza toppings, study habits) may waive the gate."
   The current behavior is the inverse — false-default + warning prose —
   which lets real-brand drafts slip through.

### `listicle` (b2b-saas, 12/12, excellent)

**Prompts (3/3):** Master template, counter-overlay design (position, size,
typography, animation, Remotion TSX sketch), item-beat structure, keyframe
prompts per item with sample, VO pacing rules with example transcript,
music direction by niche, 8 mistakes-with-fix, **4 worked examples** (tech
AI, healthy snacks, productivity hacks, European cities).
**Hooks (3/3):** 12 patterns in hooks.md (149 lines).
**Ref-gate (3/3):** Correctly false (items usually generic); concrete
escalation logic for branded items in `referenceNotes`.
**Composition (3/3):** Stack table, counter style fully spec'd, cost
breakdown by stage.

**Concrete fixes:** none.

### `tutorial-how-to` (b2b-saas, 12/12, excellent)

**Prompts (3/3):** 4-block master scaffold (hook/foreshadow/steps/payoff),
step-card design vocabulary, named-transition wipe spec, 10-rule Hoyos
retention discipline, voice tone presets with stability/similarity/style
numbers, music BPM range with rising-fill at step-3→payoff, 8
mistakes-with-fix, **4 worked examples** (cooking Jenny-Hoyos, AI
productivity hack, money-saving finance hack, beauty under-eye fix), CLI
handoff.
**Hooks (3/3):** Hooks.md is 210 lines — single-largest hook file in the
pack.
**Ref-gate (3/3):** Correctly false; `referenceNotes` reapplies the gate
when specific real product / tool / app UI is shown.
**Composition (3/3):** Stack table, retention target 90% specified,
step-card style + counter format, caption policy "always-burned-in".

**Concrete fixes:** none.

### `before-after-product` (dtc-commerce, 9/12, strong)

**Prompts (3/3):** Reads via `fragments.md` (pain-point + reveal + demo +
VO fragments per category, tonal arc patterns, music fragments, caption
style split, negative prompt, ref-prompt addendum) and `model-stack.md`
(stage 0 ref-gate through stage 8 render with cost rollup and a stricter
quality gate on the reveal frame). Examples not labelled "Worked example
1/2/3/4" but every fragment section IS effectively an example bank for
swapping in. Models all current.
**Hooks (0/3 — justified exception):** No `hooks.md`. Format encodes the
5s pain opener directly in TEMPLATE.md ("0-2s Pain hook" + the
fragments.md pain-point bank by category). For a 15-18s ad format where
the "hook" is the pain visual + line baked into the pain-point fragment,
this is fine — but it's a structural divergence from the rest of the
vibe-reference cohort (`talking-head-rant` also missing hooks.md).
**Ref-gate (3/3):** `requiresUserReference: true`, refusal copy in
TEMPLATE.md, stage-0 check in model-stack.md (`ls workspace/.../uploaded/`
before any API call), product reference passed to `--ref` on the reveal
frame with stricter `scoreImage` gate (≥8 vs ≥7 elsewhere).
**Composition (3/3):** Full vibe-reference complement — composition.md,
fragments.md, model-stack.md, reference-example.md. Dual-music split at
frame 150 (5s mark). Caption-style split Hormozi-before/Minimal-after.
Cost rollup $3.70.

**Concrete fixes (in priority order):**
1. Add an explicit "Worked examples" section to `fragments.md` (4
   end-to-end examples: cosmetics / household / SaaS-with-UI / food) so
   art-director routing matches the rest of the pack. Mirror the style of
   `grwm/prompt-cookbook.md:115-235`.
2. `reference-example.md` is a 25-line placeholder — fill in after the
   first real render (matches its own TODO).

### `doctor-authority` (dtc-commerce, 12/12, excellent)

**Prompts (3/3):** Master template, authority-figure keyframe prompt
vocabulary (white-coat dermatologist / nutritionist / dentist /
pharmacist), setting vocab (clinical office / home office / pharmacy /
neutral), VO settings (stability 0.45 for calm-authoritative), captions
discipline (NOT screaming yellow), music policy (off-by-default), 8
mistakes, **4 worked examples** (niacinamide derm, magnesium glycinate
nutritionist, xylitol dentist, KSM-66 ashwagandha pharmacist) each with
full hook→problem→mechanism→recommendation→CTA script.
**Hooks (3/3):** Full hooks.md present (12 patterns × 4 archetypes).
**Ref-gate (3/3):** Dual-gate: branded-product gate AND real-named-
professional gate (refuses outright for real-named professional without
written consent). Therapeutic claims refused. Best regulatory-aware
ref-gate in the pack.
**Composition (3/3):** Stack table, veo-3.1 specified for trust-critical
lip-sync, AI-disclosure overlay mandatory for synthetic doctor.

**Concrete fixes:** none.

### `try-on` (dtc-commerce, 12/12, excellent)

**Prompts (3/3):** Master template, character-consistency discipline
section ("the #1 thing"), per-category variant vocabulary (sunglasses /
fashion / lipstick / earrings), transition design in frame counts at
30fps, price/SKU overlay design, music BPM matched to cut count, 8
mistakes in order of frequency, **4 worked examples** (sunglasses 5
frames, outfit 4 looks walk-into-camera, lipstick 6 shades, earrings 4
styles).
**Hooks (3/3):** 13 hook patterns.
**Ref-gate (3/3):** Required gate; refusal copy with no-ref-consent
override for fictional collections; "AI-improvised branded apparel"
explicitly refused.
**Composition (3/3):** Stack table, transition style enumerated, overlay
position rule.

**Concrete fixes:** none.

### `ai-avatar` (entertainment-viral, 12/12 with caveat, excellent)

**Prompts (3/3):** Master template, avatar prompt design (8 archetypes),
lip-sync model picks, voice settings, multilingual export recipe, C2PA
disclosure section, 8 mistakes, **4 worked examples** (skincare review,
finance educational, news brief, e-commerce ad).
**Hooks (3/3):** 12 patterns.
**Ref-gate (3/3):** Correctly false (fictional avatar) but
`referenceNotes` is excellent on persona-stability across episodes and
the hard-refuse for real-person likeness.
**Composition (3/3):** Stack table with veo-3.1 premium tier.

**HARD-INVARIANT CAVEAT (read before render-test):** `template.json`
stackSummary references `fal-ai/wan-25` and `fal-ai/sync-lipsync` for
`talkingHeadVideo` and `lipsyncOverdub`. AGENTS.md hard rule #1 says
"No FAL_KEY. Only `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY`. All media
→ `cli/lib/providers/media.ts`." Either:
(a) wan-25 + sync-lipsync are actually routed through OpenRouter (the
naming in template.json is misleading and should be `openrouter/wan-25`
style); or
(b) the template is genuinely calling fal-ai and violates hard rule #1.
This needs verification against `cli/lib/providers/media.ts` before any
end-to-end render.

**Concrete fixes (in priority order):**
1. Verify routing. If wan-25 routes through OpenRouter (which is the
   intended pattern), rename the stackSummary entries to clarify (e.g.
   `wan-25 via OpenRouter` like the other entries do). If it routes via
   fal-ai, either fix the routing or document the exception (and update
   AGENTS.md rule #1 to allow this single model).

### `fit-check` (dtc-commerce, 12/12, excellent)

**Prompts (3/3):** Master template, mirror/spin/walk vocabulary,
beat-sync rules, brand-tag overlay specs, music genre by niche, 6
mistakes, **4 worked examples** (streetwear single, thrift haul 3
outfits, workwear 2 outfits, modesty 1 outfit), quality gate.
**Hooks (3/3):** 12 patterns.
**Ref-gate (3/3):** Required when real garments named; concrete
no-ref-consent override for AI-only styling demos.
**Composition (3/3):** Stack table, transition rule "ON the beat",
brand-tag position, music BPM by cut count.

**Concrete fixes:** none.

### `green-screen-explainer` (creator-lifestyle, 12/12, excellent)

**Prompts (3/3):** Master keyframe template, composition design (the
"green-screen" is a Remotion composition, not chroma-key — explicit),
pointer/circle animation, zoom-in cadence with frame math, VO direction,
captions positioned ABOVE creator, music bed, 6 mistakes, **4 worked
examples** (news commentary outraged, Reddit reaction sarcastic, chart
explainer calm finance, meme breakdown amused), CLI cookbook.
**Hooks (3/3):** 12 patterns.
**Ref-gate (3/3):** Required (backdrop content); refuses AI-improvised
news / Reddit / tweets / charts; copyright-sensitive backdrop escalation.
**Composition (3/3):** Stack table, creator-frame position fixed at
bottom-right one-third.

**Concrete fixes:** none.

### `podcast-clip` (creator-lifestyle, 10/12, excellent BUT KIND MISMATCH)

**Prompts (3/3):** Master pipeline template (yt-dlp → transcribe →
viral-moment picker → lossless extract → Remotion compose), title-banner
design, karaoke caption design, smart-crop reframe, cut discipline
(word-boundary only), music defaults, 8 mistakes, **3 worked examples**
(talkshow guest reveal 45s, interview hot take 28s, panel debate peak
55s).
**Hooks (3/3):** 12 patterns.
**Ref-gate (3/3):** Required source long-form video; refuses
AI-generated podcast footage; redirect to `podcast-dub` for translation.
**Composition (1/3):** `kind: "vibe-reference"` in `template.json` but
the on-disk structure is the vibe-style layout (`TEMPLATE.md / hooks.md /
prompt-cookbook.md` only) — NO `composition.md`, NO `fragments.md`, NO
`model-stack.md`, NO `reference-example.md`. The other genuine
vibe-reference templates (`talking-head-rant`, `before-after-product`,
`ai-vegetables`, `soviet-nostalgic`) have all four. Either the `kind`
field is wrong or the template is missing its required sub-files.

**Concrete fixes (in priority order):**
1. Decide the kind. If the template should remain vibe-reference (because
   it has an end-to-end Remotion pipeline), add the four missing files:
   `composition.md` (the Remotion <Composition> spec), `model-stack.md`
   (the existing CLI cookbook split out), `fragments.md` (banner copy +
   caption styles + cut-discipline rules), `reference-example.md`
   (placeholder).
2. If the kind should be vibe-style (simpler interpretation since the
   template already has prompt-cookbook.md), change
   `template.json:kind` from `"vibe-reference"` to `"vibe-style"` —
   single-line fix.

### `talking-head-rant` (creator-lifestyle, 7/12, strong)

**Prompts (2/3):** `fragments.md` has 8 archetype character seeds, hook
screenshot fragments, monologue formulas, word budget, banlist (ad-
speak), camera/motion, music, captions, negative prompt — full bank but
no end-to-end "worked example 1/2/3/4" the way grwm/storytime have.
`model-stack.md` is the cost-rollup stage-by-stage walkthrough.
`composition.md` is the Remotion skeleton. No labelled worked examples
across either model layer.
**Hooks (0/3 — justified exception, like before-after-product):** No
`hooks.md`. The hook screenshot patterns live in `fragments.md` ("Hook
screenshot fragments" section). Compared to grwm's 12 patterns + audio
cues / storytime's 12 patterns + niche fit, the rant fragments are
thinner — they're prompt-fragments, not hook patterns.
**Ref-gate (2/3):** `requiresUserReference: false` is correct for AI
personas. `referenceNotes` covers the real-person escalation but doesn't
address the hook-screenshot ref case — a Reddit post screenshot that's
real should trigger AGENTS.md rule #3, same as green-screen-explainer
does for backdrops. Loses a point.
**Composition (3/3):** Full vibe-reference complement (composition.md,
fragments.md, model-stack.md, reference-example.md). Caption style
specified. Cost rollup ($7.65 veo / $2.25 kling). Hook screenshot fade
window 90-120 frames.

**Concrete fixes (in priority order):**
1. Add 4 labelled worked examples to `fragments.md` covering the 8
   archetypes (e.g., remote IT worker × work rant, courier × transport
   rant, parent × news rant, founder × marketing rant). Match the
   structure of `grwm/prompt-cookbook.md:115-235`.
2. Promote the "Hook screenshot fragments" subsection into a proper
   `hooks.md` with 12 patterns (Reddit post / news headline / Slack
   message / NYT article / TikTok comment / etc.) each with niche fit
   and audio cue. Cross-reference from TEMPLATE.md.
3. Strengthen `referenceNotes` to require a real-screenshot reference
   for any hook screenshot that quotes a real post (mirror the
   green-screen-explainer policy).

### `life-changing-testimonial` (dtc-commerce, 12/12, excellent)

**Prompts (3/3):** Master template, specificity discipline (numbers
required), talking-head keyframe prompt vocabulary, talking-head clip
i2v vocabulary, VO direction (stability 0.4 confiding-not-performative),
captions split (minimal-for-skincare / hormozi-for-fitness), music
(continuous warm bed, no tonal split), b-roll cutaway optional, 8
mistakes-to-refuse, **4 worked examples** (acne skincare, joint pain
nutra, body recomp fitness, saved-my-business software), FTC compliance
note.
**Hooks (3/3):** 12 patterns.
**Ref-gate (3/3):** Required when branded product OR real person;
conditional waiver for generic-pain-pain-solution. Fabricated outcome
numbers explicitly refused (FTC).
**Composition (3/3):** Stack table, veo-3.1 for trust-critical lip-sync,
no music tonal split.

**Concrete fixes:** none.

### `asmr-sensory` (entertainment-viral, 11/12, excellent)

**Prompts (3/3):** Master per-beat template, macro prompt vocabulary,
sound-design matrix per category (beauty / food / unboxing / slime /
spa / craft), audio production discipline, VO discipline, music policy,
6 mistakes that kill ASMR, **4 worked examples** (cream texture, choc
snap reveal, jewelry unboxing whisper-VO, matcha spa pure-foley).
**Hooks (3/3):** 12 patterns.
**Ref-gate (2/3):** `requiresUserReference: false` is right for generic
sensory; `referenceNotes` correctly applies the gate to named brands
(Charlotte Tilbury, Lindt). Loses a point because the
"unboxing" worked example (Example 3 jewelry) is the kind of brief
likely to involve a real branded box, and the template doesn't make the
gate decision more prominent in TEMPLATE.md.
**Composition (3/3):** Stack table, music policy explicit (off OR -25dB),
pace minimum 1.5s per shot, foley as hero.

**Concrete fixes (in priority order):**
1. Add a TEMPLATE.md callout box mirroring the grwm gate ("If the brief
   mentions a real brand…"), so the unboxing case doesn't fall through
   the silent default.

## Cross-cutting findings

- **Templates with stale model names:** None found. Every template
  references `kling-v3.0-pro`, `veo-3.1` / `veo-3-fast`, `google/gemini-3-
  pro-image-preview`, `bytedance/seedream-v4`, `eleven_multilingual_v2`,
  `eleven_turbo_v2_5`, `eleven-scribe-v1` (or just "Scribe v1"), or
  `whisper-1`. No `gpt-4-turbo`, `dalle-3`, `sora`, `sdxl`, `midjourney`,
  or other stale names. The model layer is in good shape.

- **Hard-invariant questions:**
  - `ai-avatar/template.json` references `fal-ai/wan-25` and
    `fal-ai/sync-lipsync` while AGENTS.md hard rule #1 forbids FAL. Needs
    verification against `cli/lib/providers/media.ts`. If wan-25 is
    actually routed through OpenRouter, the template prose needs to be
    fixed; if not, the routing needs to be fixed.

- **Templates missing worked examples for the VO layer:**
  - `before-after-product` — fragments.md has VO fragments organised by
    category but no labelled end-to-end "VO example A/B/C/D" matched to
    pain-point + product type.
  - `talking-head-rant` — fragments.md has monologue formulas but no
    labelled per-archetype worked example. The 8 archetypes don't have
    a corresponding 8 (or even 4) labelled VO examples.

- **Templates where ref-gate is questionable:**
  - `tier-list` — `requiresUserReference: false` but typical use is
    real-brand ranking (fast-food, dating apps, AI tools, anime
    characters, console games). Should flip to true with concrete waiver
    rules for generic categories.
  - `pov-first-person` — `false` is right for generic POVs but the gate
    doesn't fire on briefs that quietly reference real people (startup
    founder names, manager names).
  - `asmr-sensory` — `false` is right by default but the unboxing
    worked example reads like a branded scenario without the gate
    becoming load-bearing in TEMPLATE.md.

- **Templates where hooks count is suspiciously low or missing:**
  - `before-after-product` — no `hooks.md` (encodes hook in TEMPLATE.md);
    arguable but a justified exception for this short ad format.
  - `talking-head-rant` — no `hooks.md`; hook patterns live thin inside
    `fragments.md`. Less justified. Should be promoted to a proper
    `hooks.md` with 12 hook-screenshot patterns.

- **Structural / kind mismatches:**
  - `podcast-clip` — `kind: "vibe-reference"` but missing all four
    vibe-reference sub-files (composition.md, fragments.md,
    model-stack.md, reference-example.md). Either add the files or
    change the kind to "vibe-style".

- **Models invariant — additional note.** `podcast-clip` uses
  `google/gemini-2.5-flash` for the viral-moment picker. This is current
  for May 2026 (`gemini-3-pro` is the image model; `gemini-2.5-flash` is
  the cheap-LLM router). Cross-check against `MODELS.md` confirms.

- **Disclosure / C2PA overlay templates:** `brainrot-ai-meme`,
  `doctor-authority` (synthetic doctor), `ai-avatar` (mandatory),
  `italian-brainrot` (bottom-right). All four have the overlay
  documented; the brainrot-ai-meme one has a TSX snippet, the others
  are prose. Worth normalising into a shared `src/lib/components/
  overlays/AIDisclosure.tsx` referenced from each template.

- **Path / file references found and verified:**
  - `src/lib/components/captions/HormoziCaptions.tsx`, `.../TikTokCaptions
    .tsx`, `.../KaraokeCaptions.tsx`, `.../MinimalCaptions.tsx` —
    referenced by yap-talking-head, brainrot-ai-meme, listicle, etc.
    Not verified on disk by this audit.
  - `pool/italian-brainrot-characters/<slug>.jpg` — referenced as
    image-to-image source by italian-brainrot. Lives in companion repo
    `ralphy-assets`, pulled via `ralphy assets pull-pool`. Not
    verified on disk.
  - `workspace/projects/<id>/assets/uploaded/gameplay-loop.mp4` — used
    by brainrot-ai-meme. Path is referenced consistently.

## Recommended top-5 to render-test (in priority order)

Combination criterion: high virality leverage in 2026 + a structural
weakness or invariant question that only end-to-end will surface.

1. **`ai-avatar`** — the FAL routing question is exactly the kind of
   hard-invariant bug that only manifests on render. If the template
   genuinely calls fal-ai routes, the render will either fail (no
   FAL_KEY) or quietly violate rule #1. Resolve via a 60s render-test.

2. **`brainrot-ai-meme`** — split-screen Remotion composition with
   word-level Scribe captions sitting on the seam, gameplay loop volume
   at 0.08, Ken Burns on the top half, AI-generated overlay. Lots of
   small failure modes (caption drift, gameplay loop seam, disclosure
   overlay sizing) only catchable in render.

3. **`grwm`** — 38-second video, 8-12 jump-cuts every 4-7s, character
   reference must hold across all cuts (the format's #6 mistake is
   character drift). This is the canonical test for multi-cut character
   consistency on `gemini-3-pro-image-preview` + `kling-v3.0-pro`. If
   GRWM holds, every other character-driven template in the pack
   inherits the confidence.

4. **`podcast-clip`** — end-to-end pipeline test of yt-dlp pull →
   ElevenLabs Scribe → Gemini vision pick → ffmpeg lossless cut →
   smart-crop reframe → Remotion compose with KaraokeCaptions +
   title-banner. Five tools chained; the highest assembly risk in the
   pack. Also forces the `kind` mismatch decision.

5. **`tutorial-how-to`** — 90% retention target is the most ambitious
   quality bar in the pack. Tests named-transition wipes, 1-2s
   micro-cuts inside steps, the 15% payoff slowdown, and the
   step-counter morphs. If the retention math holds on render, the
   pacing rules are validated for the rest of the pack.

(Honourable mention: `before-after-product` because it's the cheapest
DTC test and the reveal-frame quality gate at scoreImage ≥ 8 is the
strictest in the pack — but the cohort already trusts this format from
prior renders.)
