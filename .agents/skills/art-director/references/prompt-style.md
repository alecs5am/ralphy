# Prompt style

## Pick the register FIRST (before layers 1-4)

**Register is the upstream pick.** Before writing any of the four layers below, name the register in one line and write it into `STORYBOARD.md` as the aesthetic-lock string. The register determines the camera / lens / film-stock / light / palette tokens of layer 3 — it is not an afterthought to be appended at the end.

The register-axis pick checklist (run before drafting prompts):

1. **Name the register in one phrase** — "still-photo candid documentary", "Old-Spice high-key commercial", "broadcast-realism square 1:1 audience-cam", "CGI translucent specimen", "liminal-spaces analog-horror camcorder", "deliberate-prop VFX matte-rubber", "meme-header TikTok white-canvas". The full taxonomy lives at the top of [`photoreal-humans.md`](./photoreal-humans.md).
2. **Pull one canonical reference frame** and READ it. `ralphy ref pull <url> --frames` then eyeball. Do NOT scrape-summarize ("looks like X") — that drops the load-bearing cues (lens choice, light direction, film grain, palette baked vs graded). `biofix-hypnic-en-001` mis-shipped a photoreal-X-ray register because the agent skipped this step (`feedback_biofix_cgi_specimen_not_xray`).
3. **Check character fit per [`character-fit.md`](./character-fit.md).** Clean mascot in gritty register? Pick reinterpret-in-medium OR distressed variant OR shift register — BEFORE fanning out anchors.
4. **Write the one-line aesthetic-lock string** into `STORYBOARD.md` and prepend it to the FIRST line of every subsequent image prompt across all branches. `ralphy-vs-higgsfield-001` Lesson #7 — three registers shipped because no lock string existed.
5. **For photoreal humans**, run [`photoreal-humans.md`](./photoreal-humans.md)'s 5-cue checklist verbatim — all 5 cues required, not 3, not 4.

**The register is approved at the cover-first checkpoint**, NOT after fanning out the full set. Generate one cover per register, surface to the user, wait for approval before any further anchors. Refuse to fan out without this approval — same refusal class as the quality gate.

## The four prompt layers (after register is locked)

A prompt consists of four layers in strict order:

1. **Subject** — who/what is in frame. Concrete, no "good-looking guy" — "young guy 25 years old, dark hair, grey hoodie, uncertain smile".
2. **Setting** — environment. Pull from `docs/creative-library/scenes/SETTINGS.md` (9 archetypes: kitchen, bathroom, gym, car, office, metro, bedroom, street, hackathon).
3. **Style/lens** — photographic tokens, **inherited from the picked register**. "shot on iPhone 15 Pro, vertical 9:16, natural light, slight handheld shake" for casual UGC; "Sony A7 IV + Sigma 35mm f/2.8 ART + Kodak Portra 400 + soft window light, hyperreal NOT glossy, naturalistic candid not staged" for still-photo register; etc.
4. **Negative** — what should not be there. "no professional studio lighting, no model-look, no plastic skin".

## By slot type

### Image

- Size always `1080x1920` (9:16). No square_hd / landscape — our pipeline is vertical.
- If there's a persona/brand reference in `artifacts/refs/` — push the URL into `image_urls` (multi-ref for gemini-3-pro-image-preview).
- Negative ALWAYS contains "no text overlays, no watermarks" — captions are done in the HyperFrames composition separately.

### Video (i2v)

- Motion description: 1-2 phrases. "subtle handheld camera shake, character slightly nods, eyes blink naturally". Don't describe the whole frame — it's already in the keyframe.
- Camera movement: "static" / "slow push-in 5%" / "subtle handheld" — pick one.
- Duration: 5s or 10s. 15s only for veo-3.1.
- **`generate_audio: false`** always (see MODELS.md — no native TTS).

### Voiceover (ElevenLabs)

- Voice settings deadpan-young — see MODELS.md "Voice settings".
- `output_format: mp3_44100_128`.
- Text — exactly as the scenarist wrote it, no edits of your own. If an edit is needed — handback to `scenarist playbook`.

### Music (ElevenLabs Music)

- `force_instrumental: true` always (unless the template explicitly requires vocals).
- `music_length_ms` is sized to video length + 2s tail for fade-out.
- Prompt: genre + tempo + mood. "melancholic lo-fi hip-hop, 80 BPM, vinyl crackle, no vocals, instrumental beats".

## Style fragments

If the project was incarnated from a template — **read `.ralphy/workspaces/<ws>/templates/<slug>/fragments.md` first** and reuse blocks from there. Don't write stylistic tokens from scratch when the template has already standardized them.

## Concrete over generic

Don't write prompts "in the style of Wes Anderson" — that works worse than concrete references and tokens. For Soviet/post-Soviet aesthetics prefer: "Soviet 80s Polaroid", "kommunalka kitchen", "khrushchyovka interior" — not "Russian style" as a generic word.
