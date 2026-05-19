# slot-detection

Full-auto LLM pass that finds `{{slot}}` placeholders in `prompts.json` so the template generalizes across brands / products / cast.

The skill applies the resulting substitutions without user confirmation — per the design decision: a wrong slot costs one regen, full-auto is faster than an interactive gate.

## What's a slot?

A token that's project-specific and would change for the next project using the same template.

| Category | Examples | Slot key suggestion |
|---|---|---|
| Brand / company | "Nothing", "Flipper Devices", "Panic Inc." | `{{brand_name}}` |
| Product | "HP1", "Playdate", "Flipper Zero", "Glitter Cream" | `{{product_name}}` |
| Character / cast | "Anna", "Speaker A (black man late 20s)" | `{{character_a}}`, `{{character_b}}` (preserve role descriptor) |
| Voice profile descriptor | "soft warm baritone with slight gravel" | `{{character_a_voice}}` |
| Location / setting | "cream boucle couch in soft afternoon light" | `{{location_master_plate}}` |
| Target language | "English", "Russian", "Korean" | `{{target_language}}` |
| Target audience | "American gen-z", "JP TikTok" | `{{target_audience}}` |
| Specific reference URL or @handle | "@americanbaron deadpan style" | `{{reference_style_handle}}` |

## What's NOT a slot

Things that define the template's identity stay literal:

- Aesthetic descriptors: "pixel art", "y2k cinematic", "deadpan philosophical", "analog horror"
- Camera grammar: "top-down", "side-profile", "macro pull-back"
- Lighting register: "soft afternoon light", "neon-soaked", "high-key pastel"
- Format / aspect: "9:16 vertical", "16:9 letterbox"
- Render conventions: "Sony A7 IV + Sigma 35mm + Kodak Portra 400"
- Anti-patterns / negative-prompt blocks: "no glossy beauty-filter skin, no enlarged eyes"

These are the template's DNA — replacing them with slots dilutes what the template is.

## LLM pass shape

Input: full `prompts.json` content + `BRIEF.md` (if present) + scenario.json title/tagline (if any).

Prompt skeleton (consumed by `callLLM()` — never paste raw OpenRouter calls):

```
You are extracting slot placeholders for a reusable video template.

Given these prompts from a finished project, identify proper-noun mentions
of brand / product / character names / specific locations / target language
that should become {{slot_name}} placeholders so the template generalizes
to other brands / products / cast.

DO NOT extract aesthetic descriptors, camera grammar, lighting register,
or render conventions — those are the template's identity and stay literal.

Return JSON:
{
  "slots": [
    { "key": "brand_name", "originalValue": "Nothing", "occurrences": 14, "category": "brand" },
    { "key": "product_name", "originalValue": "HP1", "occurrences": 22, "category": "product" },
    ...
  ],
  "substituted_prompts": {
    "<slot-from-prompts.json>": "<prompt-with-{{slots}}-substituted>"
  }
}

Be conservative: better to leave a token literal than to over-genericize.
If you're unsure whether a string is a brand or a descriptor, leave it
literal and flag it in a "uncertain" array.

Source prompts:
<prompts.json contents>

Original brief (if present):
<BRIEF.md contents>
```

Model: pick a fast cheap one for this — `google/gemini-2.5-flash` is sufficient. The substitution accuracy here is not safety-critical (worst case: a future user edits the cookbook by hand to add a missing slot).

## Naming conventions for slot keys

Lowercase snake_case inside double-curly: `{{brand_name}}`, `{{product_name}}`, `{{character_a}}`, `{{character_a_voice}}`, `{{location_master_plate}}`, `{{target_language}}`, `{{target_audience}}`, `{{reference_style_handle}}`.

For multiple characters / locations, suffix with `_a` / `_b` / `_c`, not numbers — easier to read in prompt text.

## Output: how slots flow into the template files

- `prompt-cookbook.md` — every prompt has slots substituted in place.
- `template.json:slots` — array of `{ key, category, defaultExample, required }` so the consumer can validate they've been filled in.
- `TEMPLATE.md` "Required inputs" section — table listing each slot with description + example value from the source project (so the next agent has a concrete reference for what to put there).

## Edge cases

- **Same proper noun appears with different casings** ("Nothing", "NOTHING (R)", "nothing"): collapse to a single slot with the most-common casing as default.
- **A slot value is also a substring of an aesthetic descriptor**: e.g. project named "playdate-pixel" — "playdate" is the product, but "pixel art" is the aesthetic. The LLM should leave "pixel art" literal and only extract "Playdate" as `{{product_name}}`. Test cases for the prompt should cover this.
- **Russian / non-English proper nouns**: the LLM handles these natively (it's just text). Slot key stays English-language regardless of source.
- **Slot count gets too high (>10)**: that's a sign the project isn't very templatizable. Warn the user, propose merging similar slots (e.g. `{{character_a_voice}}` + `{{character_b_voice}}` → single `{{voice_profile_template}}` with role substitution).
