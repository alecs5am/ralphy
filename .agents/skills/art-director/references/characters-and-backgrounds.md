# Characters and backgrounds: model choice and cross-shot consistency (#568)

**Read this when:** a brief needs a recurring character (photoreal, cloned from a photo, or stylized), a location that must hold across shots, an edit of an approved image, or a talking presenter. Read it before the anchor-order step in [`anchor-order.md`](./anchor-order.md) and before you pick a model in [`model-choice.md`](./model-choice.md).

Each claim carries a label:

- **D** (documented): vendor docs, a model card or the OpenRouter catalog. Links are in [Sources](#sources).
- **O** (observed): seen in our own projects. The project id is given so you can read its logs (`.ralphy/workspaces/<ws>/projects/<id>/`).
- **U** (untested): neither documented nor observed by us. Treat it as a guess and test one anchor before any fan-out.

The controlled test matrix that will replace most **U** labels is planned in [`docs/research/character-generation-test-plan.md`](../../../../docs/research/character-generation-test-plan.md). It has not run yet, because paid tests wait for the owner to approve the cost estimate. Until then, every **O** below is one project's experience, not a measurement.

## Which models you can call today

Only models with a `MODELS.md` row are callable through `ralphy generate` on this checkout. Confirm each with `ralphy models show <id>`.

- **Image:** `google/gemini-3-pro-image-preview` and `openai/gpt-5.4-image-2`.
- **Video:** `kwaivgi/kling-v3.0-pro`, `bytedance/seedance-2.0`, `google/veo-3.1`, `alibaba/wan-2.7`, and the two fal reference-to-video models.

Some project logs from 2026-09 and 2026-10 also show models that have **no registry row and no route on `main`**:

- Image: `black-forest-labs/flux-3-image`, `bytedance-seed/seedream-5-0-pro`, `google/gemini-nano-banana-2.1`, `openai/gpt-image-2.5-sunburst`.
- Video: `bytedance/seedance-2.5`, `alibaba/wan-3.0`, `minimax/hailuo-3`, `heygen/avatar-iv`, `fal-ai/kling-video/ai-avatar/v2/pro`.

Their findings are recorded here because they are real evidence. Do not call them until they get a registry row and a connector route (AGENTS invariants 1 and 2, and the model discipline in `docs/developing-ralphy.md`).

## Decision table

| Goal | Model (route) | Inputs | Consistency method | Known risks | Evidence |
|---|---|---|---|---|---|
| **Clone a real person from photos** (still master) | `openai/gpt-5.4-image-2`, as an edit of one original photo | The single best neutral frontal photo, plus 1-2 support photos for hair or a three-quarter view | **Edit the original; do not synthesize a new face.** Keep the source crop, expression and head geometry. Run a likeness checkpoint with the person before any fan-out. | Faces built from several photos come out "averaged" and get rejected. Beautification drifts. Whole-canvas re-rendering shifts features slightly. | O: `avatar-pony-statics-20261007`. Gemini and gpt multi-photo masters were rejected twice; a direct gpt edit of original #5 was accepted at $0.19. O: `avatar-digital-copies-20261008`. A FLUX.3 edit of the primary original with 3 refs was accepted. |
| **Identity reference pack** from an approved master | Same model that made the master. Seedream 5 Pro in O, but it is not routed on `main`. | The approved master, attached to **every** call | 8 independent views: front, 3/4 left and right, two profiles, back, full body, seated. Never chain a view from another generated view. Reframe failed body views only. | Profiles and back are inferred, not measured. Full-body views crop the feet. A tiny face in a full-body view drifts when reused. | O: `avatar-digital-copies-20261008` (v7 pack: 8 views plus 2 reframes, $0.90). O: `fogtown-cast-001` (face too small in a turnaround caused drift). |
| **Real or cloned person in a new scene** | `google/gemini-3-pro-image-preview` for multi-ref; `gpt-5.4-image-2` when gemini softens the likeness | Ref 1: front identity. Ref 2: the angle closest to the shot. Ref 3: the location plate. | **Role separation in the prompt:** "References 1-2 define only identity; reference 3 defines only the room, camera position and light." Reuse the **latest** approved identity, not the first. | Doll or plastic skin from beauty-studio exposure. The environment of the identity ref leaks into the scene. | O: `avatar-digital-copies-20261008` (temple-swap pattern), `seoul-bus-storyboard-20261008` (lessons 1-2). D: Google's guidance to give every ref a role, and Nano Banana Pro's limit of up to 5 characters and 14 refs. |
| **New photoreal character from a prompt** | Master on `gpt-5.4-image-2`; scenes on `gemini-3-pro-image-preview` with the master as `--ref` | Text only for the master, then the master plus a 3-angle pack | Apply the six-token spine from `ralphy guideline show photoreal-studio-portraits` and name 2-3 imperfections. Follow the [`photoreal-humans.md`](./photoreal-humans.md) checklist. | Beauty-filter skin. A TV-commercial register. gpt can return square output; check the dimensions. | D (in-repo guideline). O is weak: no project isolated "gpt is best for a text-only portrait". The matrix row P1 tests this. |
| **Stylized: crude PS1 or low-poly 3D** | `openai/gpt-5.4-image-2` for masters and scenes | The source design (identity), an in-register master (rendering) and a style or hub frame | Prepend a register spine with an explicit NOT-list ("NOT photoreal, NOT glossy, NOT voxel") to every prompt. Pass the hub frame as `--ref` on every gen. | Gemini smooths this look into a glossy figure. The register drifts to AAA or voxel. About 10% of gpt calls fail (TLS errors, silent empty responses, refusals). Naming a studio or game style ("EXACT style of X") gets refused. | O: `fogtown-cast-001`, `choose-path-001`, `choose-silenthill-001`, `choose-spaceship-001` |
| **Stylized: smooth CGI or Pixar-like 3D** | `google/gemini-3-pro-image-preview` | The cast master plus the **world refs on every call**, with the world refs first | Restate the world's geometry, materials and finish in each prompt. Inspect two probes against the world refs before you expand. | Faces drift to photoreal or turn into chrome mannequins. Extra characters appear. Outerwear goes missing. The world style is lost when only cast refs are attached. | O: `ralphy-avatar-worlds-001` (6 of 36 shortlisted; world style lost, fixed by world-first refs) |
| **Cartoon, flat 2D or vector** | `google/gemini-3-pro-image-preview` | One clean master | Make expression and pose variants from the single master: "EXACT same character and art style; change only the expression". | Layout words in the prompt ("LEFT 35%") get rendered as text. IP-coded characters are blocked. | O: `guide-choose-viral-001` (5 variants, 0 regens), `creator-bootcamp-looks-20261016`, `oliver-vector-assets-001` |
| **Anime, manga, comic ink, painterly** | Unknown. Start with `gemini-3-pro-image-preview` and compare with `gpt-5.4-image-2` on one cover. | One master per style | The cover-first checkpoint per register ([`character-fit.md`](./character-fit.md)) | No vendor ranks models per style (not found). | U. Matrix rows S3-S5. |
| **Location or background plate** | `google/gemini-3-pro-image-preview` | A wide master plate first, then reverse and 3/4 views made **with the plate as `--ref`** | [`location-plate.md`](./location-plate.md). Keep plates text-free and add all copy in HyperFrames. | A "close" plate can nearly duplicate the wide plate. Text gets baked into anchors. When a plate sits among the refs for an isolated character plate, the environment leaks onto that plate. | O: `avatar-pony-statics-20261007` (reverse and diagonal views from one master; a contaminated actor plate was cleaned on gpt), `choose-yeti-trent-001` (11 regens to clear text), `choose-magicschool-001` |
| **Continuity edit of a scene** (same room, new action) | `google/gemini-3-pro-image-preview` | The **previous approved scene as the only ref** | "KEEP the environment identical; change ONLY <action>", plus a negative list naming the items that were hallucinated before | gpt invents set pieces across multi-ref edits. Independent regenerations move people to other seats. | O: `choose-silenthill-002` (gpt drifted 3×; one gemini call fixed it), `seoul-bus-storyboard-20261008` (lesson 7) |
| **Typography inside an image** | `openai/gpt-5.4-image-2` | Exact copy in quotes, without markdown | Prefer text-free plates and composite the text afterwards. When text must be baked in, check it with `ralphy eval ocr <id>`. | gpt adds text nobody asked for. Gemini smudges small glyphs (kanji, LED digits). | O: `choose-your-guide-001` (device UI), `choose-yeti-trent-001`, flipper row in `docs/models/dropped.md`. D: both vendors list small or precise text as a limit. |
| **Animate a photoreal character** (i2v) | `kwaivgi/kling-v3.0-pro`, single first frame | The approved still | One first frame only. Leave room in the frame for the motion. | Seedance-2.0 refuses photoreal faces, and the block depends on framing: close shots fail, wide shots can pass. Veo also checks the anchor itself. | O: `shibuya-cast-hat-reveal-20261009`, `seoul-bus-pony-feed-20261008`, `choose-silenthill-001`. D: BytePlus face policy. |
| **Animate a stylized character** | `bytedance/seedance-2.0` | The approved still, containing the character | Route per clip: send only a blocked clip to kling. A last-frame anchor must contain the character. Lock the camera when the cast must stay in frame. | Close shots of a stylized face can still trip the privacy filter. A separate output-side copyright filter catches homage characters. | O: choose-* batch (155 of 164 OK), `choose-swamp-001` (a02 blocked), `choose-silenthill-002` (4 copyright errors), `choose-spaceship-001` |
| **Fan or IP-derived character in motion** | `kwaivgi/kling-v3.0-pro` accepted where others refused | Approved stills | This is a rights question, not a prompt problem. The reference gate applies (AGENTS invariant 3). | Output filters: seedance-2.5 "copyright", flux-3-video "Protected Content", wan-3.0 "IP infringement" (2 of 2 calls on one character), hailuo-3-max "new_sensitive". Rewording as "tribute" or "parody" did not help on images. | O: `seoul-bus-storyboard-20261008`, `seoul-bus-pony-feed-20261008`, `oliver-vector-assets-001` |
| **Same character across clips via references** (R2V) | Kling O3 on fal (`fal-ai/kling-video/o3/pro/reference-to-video`); `bytedance/seedance-2.0 --ref` for non-human refs | Pack views as `--ref` images | Our fal connector maps `--ref` to `image_urls` (`@Image1`). Kling `elements` are **not wired yet** (`cli/lib/providers/fal.ts`). | Kling elements are not exposed on OpenRouter either. OpenRouter seedance refuses photoreal-face refs. fal seedance r2v copied burned-in captions from the source video. | D: in the Kling 3.0 Omni guide, an element is up to 4 multi-angle images or a 3-8 s video; OpenRouter docs. O: `sf-door-meme-001`. The fal Kling O3 live smoke is still pending (U). |
| **Talking presenter, lip sync** | HeyGen Avatar IV or Kling AI Avatar v2 Pro (fal). Neither is routed on `main`. | One photo plus a script or audio | The platform holds identity and lip sync itself | Output is 720p by default. Avatar IV did not accept an audio file sent as a data URL; it needs HTTPS. | O: `gamgee-omni-guide-test-20260930` (18.5 s, identity, room and outfit held, $0.97), `ig-carousel-layout-20260918`, `ralphy-app-demo-20260917`. D: HeyGen docs. See [Avatar platforms](#avatar-platforms-instead-of-generation). |

## One-shot identity from a photo

1. **Consent and the gate.** A real person is a named real entity (AGENTS invariant 3). The person, or their documented consent, supplies the photos. Never clone a third party from a found photo.
2. **Pick one primary photo:** neutral, frontal, sharp, uncapped, ordinary focal length. Exclude exaggerated expressions, caps over the hairline, low-angle selfies and soft or upscaled images. Keep 1-2 support photos for hair and the three-quarter structure, and say in the prompt what each one supplies (O: `avatar-digital-copies-20261008` `PREPARATION.md`).
3. **Edit the primary photo first.** Ask for the same crop, expression and head geometry, and change only the background or clothing. In `avatar-pony-statics-20261007`, averaged masters built from 2 and then 5 photos were rejected on both gemini and gpt. A direct edit of one original was the first likeness the user recognized.
4. **Likeness checkpoint before any fan-out.** Only the person can approve likeness. A vision judge cannot: our deep-vision pass has both missed problems and invented them (O: `ralphy-more-than-friends-001`). Log the approval with `ralphy project log-prompt --stage approval`.
5. **Reattach the approved master, and the original, on every downstream call.** Never chain a generated face from another generated face (O: `avatar-digital-copies-20261008`).
6. **Enhancement is a separate, explicit step.** Retouching ("looksmaxxing") read as doll skin on FLUX.3 in O. The fix was a photographic style ref, such as a real phone-camera sample or a real scene photo, used for light and texture only. Do not undo the enhancement to fake realism (O: `seoul-bus-storyboard-20261008`, lesson 2).
7. **D:** OpenAI applies high input fidelity to every gpt-image-2 input automatically; there is no `input_fidelity` switch to set. OpenAI also says recurring-character consistency can still fail.

## Consistency playbook across shots

**Character sheet / ref pack.**
- Build the identity pack from the approved master. Register it with `ralphy ref pack <id> --add artifacts/images/<master>.png --type model-person --lock`.
- Check the pack with `ralphy ref lint <id> --contact-sheet` before any paid fan-out. It flags missing files, duplicates, tiny images and missing provenance.
- Add the location plates as their own entries, so identity refs and world refs stay separate.

**Reference order and roles.**
- Number the refs in the prompt and give each one a role ("Image 1: face and hair only. Image 2: room and light only").
- Put first the ref whose property is failing:
  - the face crop when identity drifts (O: `fogtown-cast-001`);
  - the world refs when the world style drifts (O: `ralphy-avatar-worlds-001`).
- Use 2-3 well-matched refs, and 4 only when the pose needs its own ref (O: `avatar-digital-copies-20261008`).
- Two-character shots need both masters attached (O: `choose-your-guide-001`).

**First frames.**
- Animate only approved stills.
- Use a single first frame. Kling multi-frame is rejected in preflight. First+last frames between different anchors produced morphs and 360° spins (O: `choose-silenthill-001`).
- A last frame must contain the character (O: `choose-spaceship-001`).
- Compose the anchor with room for the motion, and lock the camera when the cast must stay in frame.

**Seeds.**
- `ralphy generate` exposes no seed flag.
- OpenRouter says determinism is not guaranteed for some models. The Gemini and GPT image endpoints expose no seed at all (D).
- Do not build a consistency plan on seeds. Use refs and first frames.

**Within one clip vs across clips.**
- A single multi-shot clip usually keeps the same person: all 5 models did in `passport-model-comparison-20260909` (O).
- The hard part is the next clip. Anchor every clip on a still from the same identity pack.

**Identity checks between shots.** Use the tools we already have:
- the pre-render checklist item 5 ([`pre-render-checklist.md`](./pre-render-checklist.md));
- `ralphy ref contact-sheet <id>` to put masters and scene stills side by side;
- `ralphy eval video <mp4>`, whose deep-vision pass carries a `continuity-identity` rule;
- `ralphy workspace eval <project> --criterion character-design-cohesion` for a workspace with a style lock.

There is no still-image identity judge yet; the test plan proposes calibrating one. Until it exists, a human likeness or identity review decides.

## Editing vs generation (re-encode drift)

- **An edit is a full re-render.**
  - GPT Image regenerates the whole canvas; its mask is prompt guidance only (D).
  - Gemini has no mask, and "keep everything else the same" is an instruction, not a guarantee (D).
  - In O, narrow edits ("change the bust size", "change the emotion") redesigned the whole character (`fogtown-cast-001`), and an outfit edit also changed the face and hair (`ralphy-avatar-worlds-001`).
- **Rules:**
  - Say "change ONLY X".
  - Edit from the approved master, never from an edit of an edit.
  - Stop after one retry on the same edit ([`regeneration.md`](./regeneration.md)).
  - For a small local fix, prefer compositing (crop, matte, insert in HyperFrames) over a paid re-render ("free before paid", art-director hard rule 8).
- **Format drift.** Seedream outputs were JPEG bytes saved under a `.png` name (O: `avatar-digital-copies-20261008`). Every pass through a model re-encodes the image. Check with `ffprobe` and keep the approved original as the master.
- **Resolution is the model's choice.** Gemini, Nano Banana 2.1 and Seedream returned their own default sizes, not the requested canvas (O: `deeep-guardian-fire-001`). Compare models at matched output sizes, or say that you did not.

## Avatar platforms instead of generation

**Use an avatar platform** for:
- a talking head or spokesperson that must lip-sync a script for more than about 10-15 s;
- the same face across many videos;
- a consented real person.

**Use image + i2v** for action, camera moves, multi-character staging, stylized worlds, or shots under about 10 s.

- **HeyGen Avatar IV (D):** one photo plus a script or audio, with a motion prompt for gestures. A digital twin needs 15-600 s of footage (about 2 min recommended) and a recorded consent statement. Photo avatars get no consent check, so consent is our responsibility. OpenRouter lists `heygen/avatar-iv` at $0.05/s.
- **Kling AI Avatar v2 Pro on fal (D):** image plus audio; works for humans, animals and cartoons; $0.115/s.
- **Seedance 2.5 reference-to-video with image + audio (O):** the user chose its CGI presenter take over Kling AI Avatar, at $9.46 against $2.30 (`ralphy-app-demo-20260917`). One take was rejected by the output copyright filter (`avatar-dm-niches-001`).
- None of the three is routed on `main` yet.

## Refusal map (what blocks, and where it shows up)

| Model | Block | Seen as | Evidence |
|---|---|---|---|
| `gemini-3-pro-image-preview` | Body horror (`IMAGE_SAFETY`); IP-coded characters (`PROHIBITED_CONTENT`) | Empty content plus `native_finish_reason` | O: voidstomper, `oliver-vector-assets-001` (11 blocks) |
| `gpt-5.4-image-2` | Suggestive content; named game or studio style plus gore; IP characters | Explicit refusal text, or a silent empty response (`finish_reason: stop`, no image) | O: choose-path workspace (about 16 silent empties in 432 calls) |
| `bytedance/seedance-2.0` | Photoreal faces in the frame or the refs; copyright on the output | A submit-time 400 that is **not written to `generations.jsonl`**; check the job log | O: `choose-silenthill-001`, `choose-silenthill-002`. D: BytePlus. |
| seedance-2.5, flux-3-video, wan-3.0, hailuo-3-max | IP or protected content on the output | A provider error string per clip | O: `seoul-bus-storyboard-20261008` |
| `google/veo-3.1` | Body horror in the anchor itself | Refusal, even after the prompt is sanitized | O: voidstomper (video lesson 11) |

Reroute the blocked clip, not the batch. Never reword a prompt to get past a likeness or IP filter. Change the shot (wider framing, a stylized register) or get the rights.

## Sources

- Gemini image generation (reference limits, editing behavior): https://ai.google.dev/gemini-api/docs/image-generation
- Gemini deprecations (the `gemini-3-pro-image-preview` API id shut down 2026-06-25; OpenRouter still served it in our projects through 2026-10-24): https://ai.google.dev/gemini-api/docs/deprecations
- Nano Banana Pro prompting tips: https://blog.google/products-and-platforms/products/gemini/prompting-tips-nano-banana-pro/
- OpenAI image generation (input fidelity, masks, limits, default `size: auto`): https://developers.openai.com/api/docs/guides/image-generation
- OpenAI high input fidelity cookbook: https://cookbook.openai.com/examples/generate_images_with_high_input_fidelity
- OpenAI video generation (Sora 2 API shut down 2026-09-24; face inputs rejected): https://developers.openai.com/api/docs/guides/video-generation
- OpenRouter video catalog (durations, frame anchors, seed flags, per-second prices): https://openrouter.ai/api/v1/videos/models
- OpenRouter seed determinism note: https://openrouter.ai/docs/api/reference/parameters
- Kling 3.0 Omni user guide (elements): https://kling.ai/quickstart/klingai-video-3-omni-model-user-guide
- Kling O3 reference-to-video on fal: https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video/llms.txt
- Kling AI Avatar v2 Pro on fal: https://fal.ai/models/fal-ai/kling-video/ai-avatar/v2/pro/llms.txt
- Veo 3.1 reference images (Vertex): https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/use-reference-images-to-guide-video-generation
- Seedance face-reference policy (BytePlus ModelArk; read through official search snippets because the page renders client-side): https://docs.byteplus.com/en/docs/ModelArk/2608626
- HeyGen Avatar IV guide: https://help.heygen.com/en/articles/11269603-heygen-avatar-iv-complete-guide
- HeyGen avatar consent: https://developers.heygen.com/docs/avatar-consent.md
