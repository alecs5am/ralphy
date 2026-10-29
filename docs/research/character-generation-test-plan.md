# Character and background generation: controlled test matrix (#568)

> **Status:** plan only. Nothing has run. **No paid call happens until the owner approves the cost estimate below** (#568 acceptance: "Paid tests run only after the owner approves a cost estimate").
> **Knowledge base it feeds:** [`.agents/skills/art-director/references/characters-and-backgrounds.md`](../../.agents/skills/art-director/references/characters-and-backgrounds.md). Each row there marked **U** (untested) or **O** (observed in a single project) names the matrix phase below that settles it.
> **Prices:** taken from `ralphy models show <id>` on 2026-10-30, and cross-checked against the live OpenRouter video catalog the same day.

## The ask

**Approve a hard cap of $40 for Tier A.** The estimate is about $31 including a 15% contingency. The cap also covers the higher Veo rate that the CLI's estimate table still uses.

Tier B is optional. It needs connector routes and registry rows first and would get its own approval later.

## What the matrix answers

1. **Photoreal from a prompt.** Which registry image model gives the best text-only master? Which one best holds that identity across angles and scenes (P)?
2. **One-shot identity from photos.** Does a direct edit of one original photo beat a face synthesized from several photos (C)?
3. **Styles.** How does each model hold a character in each style: flat 2D, comic ink, anime, smooth 3D CGI, gouache, crude PS1 (S)?
4. **Backgrounds.** Does a location plate hold across reverse and three-quarter angles, and through a lighting edit (L)?
5. **Edit drift.** How fast does identity drift through chained edits, compared with independent edits made from the master (E)?
6. **Typography.** How accurate is baked-in text (T)?
7. **Animation.** How well do the i2v models hold the same approved still, and the same character across two clips (V)?

## Fixed brief

Every model gets identical text. Prompts live in `prompts/` inside the test project, one file per slot, so the run can be audited.

**Character "Mara".** A fictional 31-year-old ferry mechanic. She is built from six distinct identity markers, so identity can be scored by counting them:

| # | Marker |
|---|---|
| M1 | Short asymmetric black bob |
| M2 | Grey streak at the left temple |
| M3 | Small scar through the right eyebrow |
| M4 | Thick amber-framed glasses |
| M5 | Navy work jacket with one reflective orange stripe across the chest |
| M6 | Silver ring on the left index finger |

Weathered olive skin is part of the description but not a scored marker.

**Location "engine room".** It has four scored markers:

| # | Marker |
|---|---|
| R1 | Green-painted steel walls |
| R2 | Brass pressure gauges on the back wall |
| R3 | One round porthole on camera-left |
| R4 | Yellow caution stripes on the floor and one caged bulb overhead |

**Second setting "pier".** A rainy wooden pier at dusk, with one lamp post.

**Style spines** (one line, prepended to every prompt in phase S). Never name a studio, a title or an artist.

| Style | Spine |
|---|---|
| `flat2d` | Flat 2D vector cartoon, clean outlines, 4-colour fills |
| `comicink` | Comic-book ink line art, halftone shading, limited palette |
| `anime` | Anime cel shading, sharp shadow shapes, clean line art |
| `cgi3d` | Smooth stylized 3D animated-feature character, soft global illumination |
| `gouache` | Painterly gouache illustration, visible brush texture |
| `ps1` | Crude PS1-era low-poly in-engine character, low-res textures. NOT photoreal, NOT glossy, NOT voxel |

**Photoreal spine.** Phases P, C, L, E and T use the six-token spine from `ralphy guideline show photoreal-studio-portraits`.

**Owner photos.** Five photos the owner supplies of himself, placed in `artifacts/refs/owner-01.jpg` … `owner-05.jpg`. `owner-01` is the neutral frontal primary. This is the reference gate's consent path for a real person (AGENTS invariant 3). Nobody else's likeness is used.

## Models

**Tier A** (registry models, callable through `ralphy generate` on `main`):

| Kind | Models |
|---|---|
| Image | `google/gemini-3-pro-image-preview` (`gem`), `openai/gpt-5.4-image-2` (`gpt`) |
| Video | `kwaivgi/kling-v3.0-pro`, `bytedance/seedance-2.0`, `google/veo-3.1`, `alibaba/wan-2.7`, and `fal-ai/kling-video/o3/pro/reference-to-video` (fal) |

**Tier B** (optional, separate approval). These models appear in 2026-09 and 2026-10 project logs, but have no registry row or route on `main`:

- `google/gemini-nano-banana-2.1`
- `bytedance-seed/seedream-5-0-pro`
- `black-forest-labs/flux-3-image`
- `openai/gpt-image-2.5-sunburst`
- `bytedance/seedance-2.5`
- `alibaba/wan-3.0`
- `minimax/hailuo-3`
- `heygen/avatar-iv`
- `fal-ai/kling-video/ai-avatar/v2/pro`

Each needs a `MODELS.md` row, a `docs/models/<kind>.md` section and a connector route first (the model discipline in [`developing-ralphy.md`](../developing-ralphy.md)).

## Exact commands

Run these from a checkout; prefix each command with `bun run ralphy --`, or use the installed `ralphy` (v0.4.0).

- `$M` is the image model id; `<m>` is its short tag (`gem` or `gpt`).
- Run each image line once per model.
- Slot names avoid the `scene-NN-` prefix on purpose: this is a test project, not a storyboarded production, so the #570 storyboard gate does not apply.

### Setup ($0, after approval)

```bash
ralphy project create "Character matrix 568" --as char-matrix-568 --workspace default --kind image-pack
ralphy project approve char-matrix-568 --cap 40 --expiry 7d --reason "Owner-approved #568 test matrix estimate"
ralphy project style-lock char-matrix-568 --check || ralphy project style-lock char-matrix-568
ralphy project log-prompt char-matrix-568 --stage approval --text "<owner approval, verbatim>"
# Owner copies owner-01..05.jpg into artifacts/refs/, then:
ralphy ref pack char-matrix-568 --add artifacts/refs/owner-01.jpg --type model-person --lock --note "primary frontal"
ralphy ref lint char-matrix-568 --contact-sheet
```

Before each paid phase, run the phase's first command once with `--dry-run`. It prints the resolved request and the estimate.

### Phase L: location (4 images per model)

```bash
ralphy generate image --project char-matrix-568 --model $M --slot l1-plate-<m> --prompt-file prompts/l1-plate.txt --aspect 9:16
ralphy generate image --project char-matrix-568 --model $M --slot l2-reverse-<m> --prompt-file prompts/l2-reverse.txt --ref artifacts/images/l1-plate-<m>.png --aspect 9:16
ralphy generate image --project char-matrix-568 --model $M --slot l3-threequarter-<m> --prompt-file prompts/l3-threequarter.txt --ref artifacts/images/l1-plate-<m>.png --aspect 9:16
ralphy generate image --project char-matrix-568 --model $M --slot l4-redlight-edit-<m> --prompt-file prompts/l4-redlight-edit.txt --ref artifacts/images/l1-plate-<m>.png --aspect 9:16
```

`l4` is the continuity edit: "KEEP the room identical; change ONLY the lighting: caged bulb off, one red emergency lamp on."

### Phase P: photoreal from a prompt (6 images per model)

```bash
ralphy generate image --project char-matrix-568 --model $M --slot p1-master-<m> --prompt-file prompts/p1-master.txt --aspect 3:4
```

**Checkpoint 1.** The owner picks the better `p1-master` as `$MASTER` and the better `l1-plate` as `$PLATE`. Log the choice with `ralphy project log-prompt --stage approval`.

Both models then run P2 and P3 from the **same** `$MASTER`, so these phases measure identity hold, not master quality:

```bash
for v in threequarter profile fullbody; do
  ralphy generate image --project char-matrix-568 --model $M --slot p2-$v-<m> --prompt-file prompts/p2-$v.txt --ref $MASTER --aspect 3:4
done
ralphy generate image --project char-matrix-568 --model $M --slot p3-engine-<m> --prompt-file prompts/p3-engine.txt --ref $MASTER --ref $PLATE --aspect 9:16
ralphy generate image --project char-matrix-568 --model $M --slot p3-pier-<m> --prompt-file prompts/p3-pier.txt --ref $MASTER --ref artifacts/images/p2-threequarter-<m>.png --aspect 9:16
```

Every P3 prompt numbers its references and gives each one a role: "Image 1: identity only. Image 2: room and light only."

### Phase C: one-shot identity from photos (4 images per model)

```bash
ralphy generate image --project char-matrix-568 --model $M --slot c1-direct-<m> --prompt-file prompts/c1-direct.txt --ref artifacts/refs/owner-01.jpg --aspect 3:4
ralphy generate image --project char-matrix-568 --model $M --slot c2-averaged-<m> --prompt-file prompts/c2-averaged.txt --ref artifacts/refs/owner-01.jpg --ref artifacts/refs/owner-02.jpg --ref artifacts/refs/owner-03.jpg --ref artifacts/refs/owner-04.jpg --ref artifacts/refs/owner-05.jpg --aspect 3:4
```

- `c1` is an edit: "keep this exact photo's crop, expression and head geometry; change only the background to plain grey and the top to a navy work jacket."
- `c2` asks for a new frontal portrait synthesized from all five photos.

**Checkpoint 2.** The owner rates the likeness of `c1` and `c2`, then picks `$CMASTER`. Then:

```bash
ralphy generate image --project char-matrix-568 --model $M --slot c3-engine-<m> --prompt-file prompts/c3-engine.txt --ref $CMASTER --ref artifacts/refs/owner-01.jpg --ref $PLATE --aspect 9:16
ralphy generate image --project char-matrix-568 --model $M --slot c3-pier-<m> --prompt-file prompts/c3-pier.txt --ref $CMASTER --ref artifacts/refs/owner-01.jpg --aspect 9:16
```

### Phase S: styles (12 images per model)

```bash
for s in flat2d comicink anime cgi3d gouache ps1; do
  ralphy generate image --project char-matrix-568 --model $M --slot s-$s-master-<m> --prompt-file prompts/s-$s-master.txt --aspect 3:4
  ralphy generate image --project char-matrix-568 --model $M --slot s-$s-engine-<m> --prompt-file prompts/s-$s-engine.txt --ref artifacts/images/s-$s-master-<m>.png --aspect 9:16
done
```

The scene prompt says: "EXACT same character and art style as Image 1, now in the engine room." It carries no photoreal plate ref, so photoreal contamination cannot mask style drift.

### Phase E: edit drift (10 images per model)

The five edits are written to `prompts/e-1.txt` … `e-5.txt`. Each one says "change ONLY X; keep face, hair, glasses, jacket and ring identical":

| Edit | Change |
|---|---|
| 1 | Plain mid-grey background |
| 2 | Laughing, teeth visible |
| 3 | Warm golden-hour light from the left |
| 4 | A steaming tin mug in her right hand (a hand test) |
| 5 | Jacket zipped to the collar |

```bash
prev=$MASTER
for k in 1 2 3 4 5; do
  ralphy generate image --project char-matrix-568 --model $M --slot e-chain-$k-<m> --prompt-file prompts/e-$k.txt --ref $prev --aspect 3:4
  prev=artifacts/images/e-chain-$k-<m>.png
  ralphy generate image --project char-matrix-568 --model $M --slot e-ind-$k-<m> --prompt-file prompts/e-$k.txt --ref $MASTER --aspect 3:4
done
```

### Phase T: typography (2 images per model)

```bash
ralphy generate image --project char-matrix-568 --model $M --slot t-badge-<m> --prompt-file prompts/t-badge.txt --ref $MASTER --aspect 3:4
ralphy generate image --project char-matrix-568 --model $M --slot t-sign-<m> --prompt-file prompts/t-sign.txt --aspect 9:16
ralphy eval ocr char-matrix-568 --expected prompts/t-expected.txt --mode hero-banner
```

- The badge is an embroidered name tape: `MARA K. / ENGINE CREW`.
- The sign reads `PIER 7 / NO MOORING AFTER 22:00`.
- `--mode hero-banner` is a baked-text mode, so the OCR gate applies. Read only the `t-*` rows of `text-legibility.json`.

### Phase V: video (16 clips)

**Checkpoint 3.** The owner picks the three anchor stills: the best `p3-engine`, `s-flat2d-engine` and `s-ps1-engine`.

Every clip:
- uses one first frame, silent, 6 s, 9:16, 720p;
- runs the same motion prompt, `prompts/v-motion.txt`: "She turns her head toward the porthole, takes off her glasses with her right hand, wipes the lenses on her sleeve and puts them back on. Camera locked off. No other people. No text."

The prompt tests identity, hands and the glasses in one take.

```bash
for still in photo flat2d ps1; do          # map each tag to its chosen still path
  for model in kwaivgi/kling-v3.0-pro bytedance/seedance-2.0 google/veo-3.1 alibaba/wan-2.7; do
    ralphy generate video --project char-matrix-568 --slot v1-$still-${model##*/} --model $model \
      --first-frame <still-path> --prompt-file prompts/v-motion.txt --duration 6 \
      --aspect-ratio 9:16 --resolution 720p --queue --queue-tag char-matrix-568-v1
  done
done
ralphy queue list --tag char-matrix-568-v1
```

Cross-clip identity (V2) and reference-to-video (V3):

```bash
# V2: a second clip of the same photoreal identity from the pier still.
ralphy generate video --project char-matrix-568 --slot v2-pier-kling --model kwaivgi/kling-v3.0-pro --first-frame artifacts/images/p3-pier-<winner>.png --prompt-file prompts/v2-pier.txt --duration 6 --aspect-ratio 9:16
ralphy generate video --project char-matrix-568 --slot v2-pier-wan --model alibaba/wan-2.7 --first-frame artifacts/images/p3-pier-<winner>.png --prompt-file prompts/v2-pier.txt --duration 6 --aspect-ratio 9:16
# V3: reference-to-video from the identity pack (no first frame).
ralphy generate video --project char-matrix-568 --slot v3-r2v-klingo3 --provider fal --model fal-ai/kling-video/o3/pro/reference-to-video --ref $MASTER --ref artifacts/images/p2-threequarter-<winner>.png --ref artifacts/images/p2-profile-<winner>.png --prompt-file prompts/v3-r2v.txt --duration 6 --aspect-ratio 9:16
ralphy generate video --project char-matrix-568 --slot v3-r2v-seedance --model bytedance/seedance-2.0 --ref artifacts/images/s-flat2d-master-<winner>.png --prompt-file prompts/v3-r2v-flat2d.txt --duration 6 --aspect-ratio 9:16
```

The seedance clip on the photoreal still is expected to be refused by the privacy filter. Record the refusal as a result. It is a submit-time 400, so grep the job log; it does not reach `generations.jsonl`.

## Cost estimate

### Prices used

| Model | Price | Source |
|---|---|---|
| `gemini-3-pro-image-preview` | $0.15 per image | Registry. Observed $0.137-0.145. |
| `gpt-5.4-image-2` | $0.20 per image | Registry. Observed $0.15-0.21. |
| `kwaivgi/kling-v3.0-pro` | $0.14/s | The CLI estimate (`VIDEO_PRICE_PER_SEC`), used here. The registry and the OpenRouter catalog on 2026-10-30 list $0.112/s silent, so this slightly overestimates. |
| `bytedance/seedance-2.0` | $0.14/s | Registry, verified against billing. |
| `google/veo-3.1` | $0.20/s silent | Registry, updated 2026-10-30 from the OpenRouter catalog. The CLI estimate table still uses $0.50/s, so `--dry-run` shows the higher figure; the cap column uses it. |
| `alibaba/wan-2.7` | $0.10/s at 720p | Registry. |
| fal Kling O3 | $0.112/s audio-off | Registry. |

### Per run

| Phase | Runs per model | gem | gpt | Phase total |
|---|---:|---:|---:|---:|
| L (location) | 4 | $0.60 | $0.80 | $1.40 |
| P (photoreal from a prompt) | 6 | $0.90 | $1.20 | $2.10 |
| C (photo identity) | 4 | $0.60 | $0.80 | $1.40 |
| S (6 styles × master + scene) | 12 | $1.80 | $2.40 | $4.20 |
| E (5 chained + 5 independent) | 10 | $1.50 | $2.00 | $3.50 |
| T (typography) | 2 | $0.30 | $0.40 | $0.70 |
| **Images: 76** | 38 | **$5.70** | **$7.60** | **$13.30** |

| Video | Clips | Per clip | Total | At the CLI-table Veo price |
|---|---:|---|---:|---:|
| V1 kling × 3 stills | 3 | $0.84 | $2.52 | $2.52 |
| V1 seedance × 3 | 3 | $0.84 | $2.52 | $2.52 |
| V1 veo × 3 | 3 | $1.20 | $3.60 | $9.00 |
| V1 wan × 3 | 3 | $0.60 | $1.80 | $1.80 |
| V2 kling + wan | 2 | $0.84 / $0.60 | $1.44 | $1.44 |
| V3 fal Kling O3 + seedance r2v | 2 | $0.67 / $0.84 | $1.51 | $1.51 |
| **Video: 16 clips** | 16 | | **$13.39** | **$18.79** |

### Scoring

- `ralphy eval ocr` over the project stills costs about $0.15 (one vision pass per still).
- `ralphy eval video --mode native-video` on 16 clips costs about $0.32. In `passport-model-comparison-20260909` this analysis cost $0.007-0.022 per clip.
- Scoring total: about $0.50.

### Total

| Line | Estimate | At the CLI-table Veo price |
|---|---:|---:|
| Images + video + scoring | $27.19 | $32.59 |
| With 15% contingency (gpt fails about 10% of calls in the choose-path logs, and refusals may still bill) | $31.27 | $37.48 |
| **Requested hard cap (`ralphy project approve --cap`)** | **$40** | |

The run produces no repair re-rolls. It compares first outputs only. The CLI retries transient errors itself, and a refusal is recorded as a result, not retried with new wording.

**Tier B (optional, not in the cap; needs routes first):**

| Part | Cost |
|---|---:|
| Four image models × 21 images, on phases P, C, three styles of S, and the E chain. Logged prices: Nano Banana 2.1 $0.04, Seedream 5 Pro $0.09, FLUX.3 $0.05, Sunburst about $0.065. | about $5.15 |
| Seedance 2.5, Wan 3.0 and Hailuo 3 on the three V1 stills | about $7.65 |
| HeyGen Avatar IV (15 s at $0.05/s) and Kling AI Avatar v2 Pro (15 s at $0.115/s) on `$CMASTER` | about $2.48 |
| **Total** | **about $15** |

## Scoring method

The checks reuse what exists; no new judge is introduced.

**Identity:**
- Each still is scored on the six character markers (M1-M6, 0/1 each).
- The owner also answers "same person as the master?" (pass/fail).
- For C rows, the owner adds a likeness score of 1-5 and "do you recognize yourself" (pass/fail).
- The owner's call is ground truth. In `avatar-pony-statics-20261007` and `avatar-digital-copies-20261008`, only the person's own judgment settled likeness.

**Style (S):**
- Register held, pass/fail, against the style spine.
- "Same character and same style as the master", pass/fail.

**Artifacts (all stills and clips):**
- Hands: finger count and fused fingers.
- Face: eyes, melting, symmetry.
- Anatomy and clipping.
- Extra people.
- Unrequested text.
- Each is a pass/fail. Use the [`pre-render-checklist.md`](../../.agents/skills/art-director/references/pre-render-checklist.md) items.

**Background (L):**
- The four room markers R1-R4, 0/1 each.
- For `l4`: "only the lighting changed", pass/fail.

**Edit drift (E):**
- Markers kept at each step of the chain and of the independent set.
- The first chain step at which the owner sees a different person.

**Typography (T):**
- Exact-match rate from `ralphy eval ocr` against `prompts/t-expected.txt`.

**Video (V):**
- `ralphy eval video <clip> --mode native-video` (the deep-vision `continuity-identity` and motion rules).
- The same human identity and artifact labels as the stills.
- Refusals recorded as `blocked:<reason>`.
- Our deep-vision pass both missed and invented a morph in `ralphy-more-than-friends-001`. Its verdict is an input to the score, not the verdict itself.

**Review aids ($0):**
- `ralphy project contact-sheet char-matrix-568 --slots 'p3-*' --cols 4` and the same per phase, so each grid compares the models side by side.
- `ralphy project verify char-matrix-568` for file integrity: dimensions, and the payload format matching the extension.

## Where results go

**Labels:** `cli/lib/eval/calibration-datasets/character-identity-568.json`.
- It follows the #557 pattern (see `contact-sheet-digest.json`): labels and paths only, no media, with paths relative to `.ralphy/workspaces/`.
- One record per artifact holds the model, phase, marker scores, human pass/fail and rationale.
- A second file in the #483 binary shape (`version`, `gate`, `examples[]` with `expectedLabel`) makes the identity pass/fail labels usable by `ralphy eval calibrate` once a still-image identity judge exists.
- That judge is a follow-up. Today no `QUALITY_GATES` id covers still identity, and `ralphy eval fidelity` covers products and brands only.

**Media:** stays in `char-matrix-568` (append-only, AGENTS invariant 14).

**Write-up:** `docs/research/character-generation-results.md`.
- After it, the labels in `characters-and-backgrounds.md` move from **U** to **O**, or to **measured**.
- `MODELS.md` and `docs/models/*.md` change only where a result contradicts them.

## Stop rules

- The spend ledger hard-stops at the approved cap. Never pass `--no-budget` during the matrix.
- If a phase fails for infrastructure reasons (more than 3 consecutive provider errors), stop the phase and report. Do not switch models mid-phase.
- The three checkpoints (master pick, likeness pick, anchor pick) are owner decisions. The agent does not pick winners.
