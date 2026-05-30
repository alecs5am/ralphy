# prompt-cookbook — dev-tool-fb-creative-pack

Per-set prompt formulas with `{{slots}}`. Every formula cites the brand `{{palette}}` hex verbatim and ships an explicit negative list. All run on `openai/gpt-5.4-image-2` with `{{hero_ref}}` as `--ref`.

## Set A — real-people testimonial portrait

```
LAYOUT (top to bottom):
1. PHOTO BLOCK (52% height): Rounded 24px-radius photograph filling width with 5% margin.
   CONTENTS: a photoreal candid portrait of <persona> — <2-3 specific features:
   age, ethnicity, hair, wardrobe>. Natural skin texture with visible pores,
   <named imperfection: mole / asymmetry / stubble>, slight facial asymmetry.
   <Setting + lighting>. Sony A7 IV, Sigma 85mm at f/2.0, Kodak Portra 400 grain,
   naturalistic, NOT glossy.

2. QUOTE CARD (30% height): Pure white panel, 88% width, thin border, soft shadow.
   - Pull-quote {{ink}} Inter Medium ~52pt, slight italic, {{cta_color}} open-quote glyph
   - Attribution slate-400 Inter Regular ~26pt
   - Below, {{win_color}} Inter SemiBold supporting stat from {{key_numbers}}

3. CTA + URL FOOTER (18%): {{cta_color}} pill + slate-400 sub-line.

Negative: dark background, plastic skin, beauty filter, AI fingers, perfect teeth,
frozen expression, fashion-editorial pose, any accent besides {{cta_color}}/{{win_color}}.
```

Four tokens unlock the realism: **"naturalistic, NOT glossy"** + **"Sony A7 IV, Sigma 85mm at f/2.0"** + **"Kodak Portra 400 grain"** + **a named imperfection in the body**. Without all four, gpt-5.4-image-2 defaults to beauty-filter editorial.

## Set B — strikethrough price stack

```
PRICE STACK (50% height): Four large rows stacked vertically with generous spacing.
Each row: vendor name (left, {{ink}} Inter Medium ~36pt), large price (right, Inter
Black ~64pt). Competitor rows have a 4px red #DC2626 line running cleanly through the
ENTIRE row (label + price) horizontally at vertical center. The {{brand_name}} row has
NO strikethrough and uses {{win_color}} for the price.

Row 1: "<Competitor A>" — "<price>" (red strikethrough through both)
... Row 4: "{{brand_name}}" — "<your price>" (NO strikethrough, {{win_color}}, small "<-" arrow)

Negative: strikethrough on the {{brand_name}} row, missing strikethrough on competitor
rows, broken/wavy/dashed strikethrough lines.
```

Key tokens: **explicit row-by-row strikethrough policy** + **the explicit anti-token "strikethrough on the {{brand_name}} row"**. Without the anti-token gpt-image sometimes applies the line uniformly.

## Set B/C — macOS-chrome code card

```
CODE CARD: A floating window-chrome card centered, ~88% canvas width, 25px corner
radius, soft drop shadow. macOS-style header with three small circles
(red/amber/emerald), centered title "<file>" in JetBrains Mono. Card body deep navy
#0F172A. Inside, 3-4 lines of crisp monospace code (JetBrains Mono ~30pt) with line
numbers in muted #475569.
Syntax: keywords blue #60A5FA, strings emerald #34D399, comments slate-400 #94A3B8,
variables cream #F1F5F9.
<3-4 lines of code that match {{api_surface}} EXACTLY — curl if the SDK is unverified>
```

Key tokens: **macOS chrome verbatim** + **explicit syntax-color-per-token mapping** + **line-numbers gutter**. CRITICAL: the code lines must match `{{api_surface}}` — if the site documents only `curl -X POST <url>`, show curl, NOT an invented `import {{brand_name}}` SDK (the 5/32 leak in the source). gpt-image renders this near-pixel-perfect; gemini smudges monospace.

## Set C — horizontal bar chart (data-viz)

```
HORIZONTAL BAR CHART: Four horizontal bars stacked vertically. Each row has three
columns:
   - LEFT: brand label, {{ink}} Inter Medium ~32pt, left-aligned
   - MIDDLE: bar — rounded ends, height ~64px, track #F3F4F6, fill in row color
   - RIGHT: percentage, large Inter Bold ~48pt, right-aligned
Rows (top to bottom):
- "{{brand_name}}" · bar {{win_color}}, length 95% · "95%" in {{win_color}}
- "<Competitor>" · bar slate-400 #9CA3AF, length 82% · "82%" in slate-400
- ... [more competitor rows]
```

Key tokens: **explicit three-column spec per row** + **named track + fill colors** + **named bar length as % of canvas**. Produces near-publication-quality charts first try.

## Set D — meme header

A known meme format (wojak / drake / twitter-mock / slack-chat / distracted-bf) with the brand message in the caption slot. Keep the meme layout faithful — the recognizability IS the hook — and put the `{{key_numbers}}` punchline in the format's text zone. In-group dev humor; don't over-brand the meme itself (a small footer logo is enough).

## Set E — niche-audience hook

Audience-specific framings (RAG-stack engineer, weekend-shipper, OpenAI-credits burner). Reuse the Set B/C layouts but reframe the headline + one supporting graphic for the niche. The matrix value is *register variety on one message*, not new layouts.

## Negative base (carry on every creative)

```
Negative: any accent besides {{cta_color}}/{{win_color}}, dark background (unless the
brand bg is dark), plastic/AI skin, AI fingers, gibberish or misspelled headline,
invented API symbols not in {{api_surface}}, broken chart bars, garbled monospace.
```

## Model + flags (every creative)

```bash
ralphy generate image --project <id> --slot <slot> \
  --model openai/gpt-5.4-image-2 --size 1080x1350 \
  --ref refs/hero.png --prompt-file prompts/<slot>.txt
# run all slots with `& ... wait` for true parallel
```

gpt-5.4-image-2 is the pick: typography-grade for headlines, code, percentages, strikethrough, and photoreal portraits. It honors `--size 1080x1350` (4:5) via `image_config` (nearest native bucket; pad/scale downstream if pixel-exact matters). The 1-concurrent cap is a stale myth — probe and run parallel.
