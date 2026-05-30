# kind-decision

Decide whether to produce a `vibe-reference` or `vibe-style` template.

`--kind` flag overrides this decision. Without it, the skill auto-detects via the rules below.

## The two kinds

- **vibe-reference** — full-stack production template: scene-by-scene composition pattern, prompt cookbook with slots, model stack notes, AND a HyperFrames composition skeleton (`index.html` + GSAP timeline pattern) so `ralphy template use` scaffolds a project that can render with one command. Heavyweight; high reuse value when the source project has a strong, repeatable HyperFrames composition.

- **vibe-style** — prompt cookbook + hooks + camera vocabulary + worked examples. NO composition skeleton. Consumers compose their own HyperFrames HTML; the template is purely about HOW to prompt and WHICH models to use. Lighter weight; better fit when the source project's composition is ad-hoc / unique-per-instance.

## Decision tree

```
START
  |
  v
Does the source project have ALL FOUR:
  - scenario.json
  - prompts.json (or reconstructable from gen-log)
  - asset-manifest.json
  - index.html (HyperFrames composition)
  ?
  |
  +-- YES ---> Is the composition generalizable (parametric across briefs,
  |             not hardcoded to one product / one persona)?
  |             |
  |             +-- YES ---> KIND = vibe-reference
  |             |
  |             +-- NO ----> The composition is project-specific.
  |                          Templating it would require generalizing the composition
  |                          itself, which is out of scope for this skill.
  |                          KIND = vibe-style (with a TODO note in TEMPLATE.md
  |                                              flagging the composition is custom)
  |
  +-- NO ----> KIND = vibe-style
```

## Why the composition gate matters

`ralphy template use` ships a composition skeleton when `template.json:compositionTemplate` is set. If the source project's `index.html` is hand-authored against one specific brief, the composition is hardcoded to that brief's beats + slots — generalizing it is a separate effort, not a template-extraction.

In that case the vibe-style template still ships valuable assets (prompts + model stack + hooks), but consumers know they'll need to hand-author the composition. This is honest about what's reusable.

## What changes between the two

| File | vibe-reference | vibe-style |
|---|---|---|
| `template.json:compositionTemplate` | Required | Omitted |
| `composition.md` | Written (scene skeleton) | Skipped — beat info goes into `TEMPLATE.md` "Beat structure" |
| `fragments.md` | Optional (reusable prompt fragments) | Skipped |
| `reference-example.md` | Required (pointer to source project + ralphy-assets/examples mp4) | Skipped — the cookbook IS the example |
| `hooks.md` | Skipped | Required (0–2s hook patterns) |
| `examples.md` | Skipped | Required (worked variant examples) |
| `prompt-cookbook.md` | Required | Required |
| `model-stack.md` | Required | Required |
| `TEMPLATE.md` | Required | Required |
| `README.md` | Required (one-screen "how to use") | Required |

## When to override the auto-decision

- The user types `--kind vibe-reference --force` even though there's no `index.html`. Honor it but emit a warning that consumers will need to hand-author the composition (because `template.json:compositionTemplate` would be `null` in that case, which `template use` handles fine — it just skips the composition scaffold step).
- The user types `--kind vibe-style` on a project that has all four files. Honor it. Sometimes the user wants to ship a lighter version on purpose (e.g. publishing a prompt cookbook without committing to maintaining the composition).

## What the auto-decision can't see (yet)

The current detection is structural (files exist or not). It can't tell whether a composition is "good enough to be reused" or whether it's a fragile one-off. Future iteration could add a quality gate by running `ralphy render` against the template-scaffolded project; out of scope for v1.
