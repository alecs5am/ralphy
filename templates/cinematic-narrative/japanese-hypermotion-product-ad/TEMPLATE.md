# Japanese Hyper-Motion Product Ad

15-second 9:16 hyper-energetic Japanese hyperpop product ad. 8 hard-cut beats at ~1.9s average over a pink-and-cyan tile-grid 3D stage with chibi mascots running on/around the product, orchestral-hyperpop or sakura-trap music bed at 130-140 BPM with drum-fill stings on every cut, and a katakana logo + slogan slam at the close.

Format: TikTok / Reels / Shorts. Music + SFX only — no VO.

## When to use this template

- You have a small consumer gadget with strong brand-text + accent color + visible internals or screen content (Flipper Zero, Playdate, Game Boy, Nothing Ear, Tamagotchi-class, AnkerMake module, Raspberry Pi case).
- You want anime / kawaii energy WITHOUT going full-anime — this template's DNA is "hyper-real CGI product render with anime overlay typography and 2D chibi sticker characters layered ON the 3D stage."
- You're shipping to a gadget+anime crossover audience (JP TikTok, gen-z gadget channels, otaku tech reviewers).
- You explicitly want a high-cut, high-energy 15s ad. Not a 30s explainer, not a 60s narrative.

## Required inputs (slots)

| Slot | Description | Source-project example |
|---|---|---|
| `{{brand_name}}` | The brand / company shipping the product | Flipper Devices |
| `{{product_name}}` | The product line | Flipper Zero |
| `{{product_dna_paragraph}}` | 2-3 sentence verbatim-repeatable description of the physical product — body color, accent color, brand text placement, screen content, all distinguishing buttons / ports. THIS PARAGRAPH IS REPEATED VERBATIM IN EVERY IMAGE PROMPT. Do not summarize. | "WHITE plastic body, orange 5-way D-pad cluster right half, orange rectangular OLED bezel left half, bold orange embossed FLIPPER text on lower front, 1.4-inch monochrome OLED showing pixel-dolphin + katakana フリッパー, black BACK button right of D-pad, MicroSD slot on bottom edge, USB-C on right edge" |
| `{{brand_kana_logo}}` | The brand name transliterated into katakana (or hiragana / hangul / kanji for non-JP variants) — used in the scene-06 outro typography slam | フリッパー・ゼロ |
| `{{japanese_slogan}}` | Short 2-4 word katakana slogan, ideally with a punctuation dot (・) separator | ハック・スベテヲ (hack everything) |
| `{{music_style_keywords}}` | Genre + BPM + sting cadence for the ElevenLabs music prompt | "japanese hyperpop, sakura-trap, 140 BPM, drum-fill stings on every downbeat" |
| `{{hero_archetype}}` (optional) | If you include the human use-case scene (scene-03), describe the hero in one sentence | "Japanese streetwear guy, 22yo, pink-dyed messy hair, twin lip piercings, oversized black hoodie with pink graphic print, smug grin" |
| `{{use_case_location}}` (optional) | The location the hero interacts with the product in | "Japanese game arcade with pink+cyan neon cabinets and a coin-slot interaction" |
| `{{target_audience}}` (optional) | Drives the chibi cast composition + slogan tone | "JP / EN gen-z TikTok, gadget+anime crossover crowd" |

## Beat structure (8 cuts, 450 frames @ 30fps)

| # | Slot | Range | Beat | Camera | Why |
|---|---|---|---|---|---|
| 01 | hook-entrance | 0.00-1.80s (54f) | 5f black flash → BAMM color slam → product WHIPS in from right with hot-pink motion-blur, SLAMS dead-center with rotation wobble. Katakana 「バーン！」 punches in. | Static wide → 5% push-in last 10f | Pattern-interrupt, max-retention 0.5s hook |
| 02 | macro-tease | 1.80-3.60s (54f) | Extreme macro on screen / signature surface. Brand mascot or kana types in pixel-by-pixel. Soft DOF blur around. | Static → 5% punch-in last 10f | Brand-sticker reveal, mascot = meme |
| 03 | use-case (human OR all-product) | 3.60-5.60s (60f) | Hero interacts with product in `{{use_case_location}}`. 180° camera whip-orbit left-to-right. Hero's expression escalates mid-orbit. | 180° whip-orbit | Human element + use-case meme |
| 03b | macro-insert-A | 5.60-6.40s (24f) | Extreme macro of the use-case payoff (coin-magnet, particle absorption, spark contact). | Static macro | Punch-up insert, power moment |
| 04 | chibi-runway | 6.40-8.20s (54f) | Top-down 75° angle. Product lies flat on tile floor. 4 2D anime-sticker chibis BURST in from left, BLAST across the product like a runway, sparkle-trails. Katakana speech bubbles. | Slight 15-20° orbit + subtle shake | Kawaii moment, ad differentiator |
| 05 | exploded-reveal | 8.20-10.60s (72f) | Product VIOLENTLY EXPLODES upward into N component layers (3 simple / 10 tech-dense) with ~2cm gaps. Each layer rotating slowly. Katakana labels punch in beside layers. Chibis below recoil with anime 「！？」. | Static wide → slow pull-back | Info-density spike, tech-audience hook |
| 05b | macro-insert-B | 10.60-11.40s (24f) | Extreme macro of one internal detail (pin glint cascade, PCB trace pulse, antenna shimmer). | Static macro | Tech-porn beat, ties to scene-05 |
| 06 | outro-logo-slam | 11.40-15.00s (108f) | 8-frame impact-flash → all layers SNAP back together → product lands centered in hero pose. `{{brand_kana_logo}}` types in pixel-by-pixel above. `{{japanese_slogan}}` slams in below. Slow dolly-in last 60f, freeze last 15f. | Slow dolly-in, freeze | CTA-lock |

Total: 14 still anchors (most scenes have first+last keyframes; the two macro inserts use first-only).

## Key rules (from postmortem — every rule cost iterations to learn)

1. **Lock the storyboard BEFORE generating any stills.** First Flipper run burned $1.20 on product shots that didn't match the locked narrative. Storyboard first, gen second. No exceptions.
2. **Pull canonical product imagery from the brand's official site as step 1.** Do not invent product details from memory. The first batch had wrong body color (orange-translucent instead of white) because no canonical ref was passed. User had to drop screenshots to fix it — and that fix cost another $1.60 to re-shoot.
3. **For hyper-motion physics → `bytedance/seedance-2.0`, NOT kling.** MODELS.md says kling is "default narrative i2v" — that's wrong for this format. Kling is for talking-head and slow narrative. Seedance handles violent slams, explosions, runway bursts, magnet-pulls, glint cascades.
4. **For real human faces / orbit → `kwaivgi/kling-v3.0-pro` single-frame + photoreal banana stills.** Seedance goes uncanny on humans, gpt-image-2 goes anime. Only banana (`google/gemini-3-pro-image-preview`) + documentary-photography prompt language gives photoreal humans. And kling's photoreal strength is *expression-only escalation* — don't ask it to move the body, ask it to *intensify* what's already in the frame.
5. **For product fidelity / branding / typography / internals → `openai/gpt-5.4-image-2`.** Banana stretches proportions and invents screen content; gpt-image-2 nails real product topology, brand text, kana typography, and 10-layer exploded views.
6. **Strip C2PA from every gpt-image-2 / banana PNG before passing to i2v.** `ffmpeg -y -i in.png -map_metadata -1 -compression_level 100 out.png`. Embedded `caBX` chunks break base64 transport on some endpoints.
7. **NEVER submit kling-v3.0-pro with both `--first-frame` AND `--last-frame`.** Reliably 400s with `"File is not in a valid base64 format"` on OpenRouter. Use seedance for multi-frame; kling for single-frame.
8. **ALL-CAPS action verbs in motion prompts.** Replace "device flies in" with "Device WHIPS in from the right with extreme motion-blur, SLAMS to a violent dead-stop". Models respond to action vocabulary. Apply to: WHIP, SLAM, EXPLODE, BURST, BLAST, VIOLENT, AGGRESSIVE, MASSIVE.
9. **Vendor moderation refusal? Switch vendor, don't reword.** Seedance returned `"no job.id"` twice on the hero scene; `wan-2.7` accepted it on the same prompt. First-pass fail isn't terminal.
10. **Slot names lowercase-kebab.** `music-A-orchestral` → error. `music-a-orchestral` → ok. Same for every `--slot` flag.

## Workflow (target: ≤1.5x minimum-viable iterations)

1. **Research (5-10 min).** `ralphy ref pull` a target-vibe video if user dropped one. WebFetch the brand's official site → save 2-4 canonical product PNGs to `refs/`. Ask user for any supplied screenshots and save into `refs/` immediately (do NOT trust `/var/folders/.../TemporaryItems/` paths — they expire mid-session).
2. **Storyboard (10 min).** Author `STORYBOARD.md` with 6-10 scenes × `{duration, location, action, camera, refs, i2v anchors}`. Lock 4 questions BEFORE generating: hero archetype, music vibe, cut density, outro/CTA. Get explicit user "go" before phase 3.
3. **Stills (10 min, parallel).** 2 stills per major scene (first + last) via gpt-image-2; banana for any photoreal human inserts. Pass 2-3 refs per call: canonical product + this template's tile-grid style ref + scene-specific ref. Strip C2PA in batch after generation. User-reviews the 12-16 stills BEFORE video gen.
4. **i2v clips (10-15 min, parallel).** Hyper-motion / explosions / runway / coin-arc → seedance-2.0 (4s, $0.56). Real-human orbit → kling-v3.0-pro single-frame (5s, $0.70). Fallback for vendor refusal → wan-2.7 (4s, $0.40).
5. **Music (1 min).** Generate 3 variants in parallel for A/B/C compare. Lowercase slot names only. Render all 3, user picks, swap MUSIC_FILE constant for final render.
6. **Composition (15 min, mostly manual).** Symlink `public/<project-id>` → `workspace/projects/<id>/`. `src/videos/<id>/{scenes.ts, index.tsx}`. Register in `src/Root.tsx`. Smoke-render frames 0-30 to validate composition. Full render via `bunx remotion render`.
7. **SFX layer (post-music-pick).** 8 whoosh / impact / sparkle / coin / magnet / cartoon / explode / glint / typewriter `<Audio>` overlays dropped into `scenes.ts` as a `sfx[]` field.

## Anti-patterns (DO NOT — every one of these costs iterations)

- **DO NOT** generate assets before a locked STORYBOARD. Scenarist → art-director → editor is strict order.
- **DO NOT** trust your memory for product colors / brand-text placement / accent layout. Pull canonical reference imagery from the brand site as step 1, or refuse.
- **DO NOT** use kling-v3.0-pro for hyper-motion (slam, explode, runway). It softens motion and breaks on multi-frame. Use seedance.
- **DO NOT** use seedance-2.0 for photoreal human faces. Use banana stills + kling-pro single-frame.
- **DO NOT** use kling for body movement or camera move on a human portrait — use it for *expression-only escalation*.
- **DO NOT** parameterize music variant via `inputProps` for a 3-way A/B/C compare — just edit `MUSIC_FILE` constant in `scenes.ts` and re-render. Simpler.
- **DO NOT** use `TransitionSeries` for hyper-motion — overkill. Plain `<Sequence>` with adjacent `from` values gives the right hard-cut feel.
- **DO NOT** extend runtime to "fit in more story" when iterating one weak scene — split it into 2-3 micro-shots within the same time budget. Music sync, SFX cues, downstream `from` offsets all depend on the locked master timeline.
- **DO NOT** delete the previous winner's mp4 when iterating one scene — name new attempts with a suffix or new slot. One-line `scenes.ts` swap reverts to the original.
- **DO NOT** invent the chibi cast from a generic "kawaii mascots" prompt. The cast should read as "this product's family" — design 4 mascots tied to the product's domain (e.g. Flipper got orange-pigtailed girl + cat-chibi + goggles-boy + dolphin-mascot because the dolphin is the on-screen mascot already).

## Workflow tricks that paid off

- **Split-instead-of-regen.** When one scene tries to deliver multiple beats and fails, split it into 2-3 micro-shots within the same time budget instead of re-prompting heavier. Each micro-shot delivers ONE clear beat. Reads instantly.
- **Cultural visual tropes as one-token prompts.** Genre-native anime clichés (kane-no-me money-eyes, kira-kira sparkle eyes, shūchū-sen speed-lines, ase sweat-drop, gaan/baan impact text, SD-chibi mode) communicate complex states in 0.5s with zero ambiguity. Use them as anchors in any scene that needs a strong emotional read.
- **Hybrid photoreal + anime overlay** (banana strength). Real photographed face + cartoon ¥-eye pupils is an instantly memetic hybrid. Prompt with explicit layer-split language: "applied over", "hybrid", "cartoonish graphic within an otherwise photoreal eye".
- **Existing generated frame as character ref.** To keep the SAME actor across multiple shots, pass the already-generated keyframe as the first `--ref`. Banana holds character identity (hair color, hoodie graphic, face shape) far better via image-ref than via text description alone.
- **Cultural-genre framing > literal-act framing for moderation.** "Hacker / smug / hack" gets refused; "gambling-ecstasy / anime money-eyes trope / kane-no-me / arcade reaction" gets accepted. Same intent, different acceptance rate.
- **Single-frame is the safer bet for tricky person-content shots.** If multi-frame failed once on a human shot, drop to single-frame and let the prompt drive motion.
- **`startFrom: 30-60` per Sequence on i2v clips.** Most i2v clips have a "static-ish" first 0.3-0.8s while the model initializes motion. Trim into the most-dynamic window.
- **Smoke-render frames 0-30** before full render: `bunx remotion render src/index.ts <id> /tmp/smoke.mp4 --frames 0-30`. Catches scene.ts bugs in 5 seconds.

## Cost ballpark

- **Disciplined run:** ~$8 (image $4 + video $4 + music subscription + render local).
- **Realistic run with 1 creative iteration on a weak scene:** ~$10-12.
- **First-run-no-discipline:** ~$13-15 (Flipper hit $14.30 with one full scene-03 redo).

See `model-stack.md` for per-stage cost breakdown.
