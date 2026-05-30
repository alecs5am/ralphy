# prompt-cookbook — multi-style-carousel

Per-slide prompts with `{{slots}}`. The load-bearing idea: ONE reusable JSON STYLE+QUALITY block per aesthetic, and per slide you swap only `scene.subject` + `composition.ui_elements` (the baked text). JSON prompts diff, re-roll, and template across N styles far more cleanly than prose — and gpt-image consumes either equally well.

## The JSON prompt schema (one block per style, reused across its 5 slides)

```json
{
  "prompt": {
    "scene": {
      "description": "<the full STYLE register paragraph for this aesthetic — locked across all 5 slides of the style>",
      "subject": "<VARIES PER SLIDE — the mascot pose / scene subject for this slide>",
      "setting": "<style setting>",
      "action": "static"
    },
    "style":   { "primary": "<aesthetic>", "rendering_quality": "...", "surface_textures": "...", "lighting": "..." },
    "technical": { "camera": { "focal_length": "...", "aperture": "...", "depth_of_field": "...", "angle": "..." }, "resolution": "print poster", "rendering": "..." },
    "composition": {
      "framing": "<style framing — locked>",
      "subject_placement": "<locked>",
      "ui_elements": "<VARIES PER SLIDE — the exact baked eyebrow + headline + sub-line from {{copy_deck}}, 'crisp and perfectly spelled'>"
    },
    "quality": {
      "include": ["<style include tokens>", "single accent {{accent_hex}}"],
      "avoid":   ["gibberish in the headline", "distorted or multiple mascots", "any accent besides {{accent_hex}}", "<the banned source hue>"],
      "reference_standard": "<the named look this style emulates>"
    }
  }
}
```

Lock `style`, `technical`, `composition.framing/subject_placement`, and `scene.description` ONCE per style. Per slide, edit only `scene.subject` and `composition.ui_elements`. That is what makes the 5-slide set read as one design.

## Single-accent lock (carry on every slide)

In `scene.description`, name the one accent explicitly:

```
... single accent {{accent_hex}} (the only color besides black/ink/white), NO other hue ...
```

And in `quality.avoid`, ban a second accent + the source hue of any reference you recolored:

```
"avoid": ["any accent besides {{accent_hex}}", "second accent color", "<source hue, e.g. 'green color'>"]
```

This stops gpt-image drifting into rainbow chrome and reliably recolors a reference that ships in the wrong hue.

## "Use our colors" recolor (one line)

When a reference aesthetic ships in a hue that isn't the brand's, state the hex AND ban the source hue verbatim:

```
a HUGE warped airbrushed chrome graffiti wordmark in bright brand-{{accent_hex_name}}
({{accent_hex}}, our brand color — absolutely NOT <source hue>)
```
plus `quality.avoid: ["<source hue> color"]`. In the source project this reliably recolored an acid-green reference to brand orange.

## Mascot-in-the-medium (the gritty-style rescue)

A clean mascot fails in grunge/xerox/acid. When you don't have a `{{gritty_mascot_ref}}`, force the mascot INTO the print medium in `scene.subject`, verbatim:

```
the {{mascot_desc}} REDRAWN ENTIRELY IN THE POSTER'S OWN MEDIUM — a high-contrast
1-bit photocopied black-and-accent duotone screen-print, rough torn edges, heavy
halftone dithering, scratched and degraded, glitch-doubled edges, fully fused with
the grunge texture — NOT a clean smooth 3D object, NOT a glossy sticker cut-out;
it must look printed and distressed, fully part of the page
```

Key tokens that unlock it: *"REDRAWN ENTIRELY IN THE POSTER'S OWN MEDIUM"*, *"1-bit photocopied duotone"*, and the explicit *"NOT a clean 3D object / NOT a sticker"* negative. (A purpose-built `{{gritty_mascot_ref}}` still beats this — prefer it.)

## Baked-text discipline (`ui_elements`, varies per slide)

Spell the exact strings to render, slide by slide, and demand crispness:

```
"ui_elements": "Eyebrow top-left: '<EYEBROW>'. Headline 2 lines: '<LINE 1>' / '<LINE 2>'.
                Small sub-line: '<sub>'. Headline and labels crisp and perfectly
                spelled (small body text may read as dense micro-type)."
```

Keep headlines to 1-2 short lines — gpt-5.4-image-2 bakes short display copy legibly but smudges paragraphs. Do NOT ask it to set body paragraphs.

## Negative base (carry on every slide)

```
"avoid": ["gibberish or misspelled headline", "distorted, doubled, or multiple mascots",
          "any accent besides {{accent_hex}}", "second accent color", "<recolored source hue>",
          "busy clutter over the headline negative space", "beauty-filter gloss on the mascot"]
```

## Model + flags (every slide)

```bash
ralphy generate image --project <id> --slot {style}-{NN} \
  --model openai/gpt-5.4-image-2 --size 1080x1350 --concurrency 1 \
  --ref {{mascot_master}} [--ref {style}-01 for fill slides 02-05] \
  --prompt-file prompts/{style}-{NN}.json
```

gpt-5.4-image-2 is the ONLY pick — it holds embedded typography; gemini smudges letterforms. It honors `--size 1080x1350` (4:5) via `image_config.aspect_ratio`. Cap is 1 concurrent per key — serialize.
