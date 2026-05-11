# Prompt style

A prompt consists of four layers in strict order:

1. **Subject** — who/what is in frame. Concrete, no "good-looking guy" — "young guy 25 years old, dark hair, grey hoodie, uncertain smile".
2. **Setting** — environment. Pull from `workspace/scenes/SETTINGS.md` (9 archetypes: kitchen, bathroom, gym, car, office, metro, bedroom, street, hackathon).
3. **Style/lens** — photographic tokens. "shot on iPhone 15 Pro, vertical 9:16, natural light, slight handheld shake".
4. **Negative** — what should not be there. "no professional studio lighting, no model-look, no plastic skin".

## By slot type

### Image

- Size always `1080x1920` (9:16). No square_hd / landscape — our pipeline is vertical.
- If there's a persona/brand reference in `assets/uploaded/` — push the URL into `image_urls` (multi-ref for gemini-3-pro-image-preview).
- Negative ALWAYS contains "no text overlays, no watermarks" — captions are done in Remotion separately.

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

If the project was incarnated from a template — **read `workspace/templates/<slug>/fragments.md` first** and reuse blocks from there. Don't write stylistic tokens from scratch when the template has already standardized them.

## Concrete over generic

Don't write prompts "in the style of Wes Anderson" — that works worse than concrete references and tokens. For Soviet/post-Soviet aesthetics prefer: "Soviet 80s Polaroid", "kommunalka kitchen", "khrushchyovka interior" — not "Russian style" as a generic word.
