# Prompt library by goal / situation (02.0L)

Organized by **what the user is trying to do**, not by **which model they're calling**. Each entry is a worked example the agent can read and pattern-match from before generating.

> **Status (v1.0):** Library scaffolding + 5 seed entries shipped. Full 50-entry catalog is tracked under 02.0L follow-up — see `roadmap/02-prompts-and-templates/SPEC.md#020l`. Pattern is stable; new entries can be added without code changes.

## Entry families

| Family | Examples | Count (v1.0) |
|---|---|---|
| Hooks | `hook-saas-3s`, `hook-confession-5s` | 1 seed |
| Scene bodies / product reveals | `product-reveal-5s`, `before-after-physical-transform`, `chart-animate-in-data` | 1 seed |
| Selfie / talking-head modes | `selfie-rant-confession`, `vo-deadpan-irony` | 1 seed |
| Caption styles | `caption-pop-each-word`, `caption-block-2-words` | 1 seed |
| Music modes | `music-tension-uptempo`, `music-deadpan-bg` | 1 seed |
| Transitions | `transition-jump-cut-stinger`, `outro-loop-back` | — |
| Motion graphics | `lower-third-credit-card`, `text-on-screen-payoff` | — |

## Entry frontmatter

```yaml
goal: <one-sentence statement of what this entry achieves>
applies_to: [image | video | vo | music | caption | transition | motion-graphic]
tags: [...]
models_known_good: ["kwaivgi/kling-v3.0-pro", ...]
models_known_bad: ["openai/sora", ...]
references: ["https://www.tiktok.com/@handle/video/123", ...]
```

## Entry body

Three worked examples — `## Bad`, `## OK`, `## Ideal` — each a complete prompt + a paragraph explaining why.

## CLI surface

`ralphy prompts library lookup --goal "<text>"` returns the top-N matching entries with a confidence score. The agent reads the matched entries before issuing the gen call. Implementation pending — placeholder verb tracked under 02.0L.03.
