# AGENTS.md — routing & invariants

**ALWAYS consult this table before acting on a user task. Failing to route is a defect.** When the user makes a request, find the matching row, then `Read .claude/skills/<name>/SKILL.md` and execute. Do not ask permission to invoke a skill.

## Routing

| User intent | Skill |
|---|---|
| Open research / "сделай исследование", URL drop in reference context, "стиль с <site>", "анализ @handle", competitor audit | `/ralph-researcher` |
| "напиши сценарий", "сделай видео про X", scenario feedback ("rework scene 3", "rewrite hook", "shorten") | `/ralph-scenarist` |
| "сгенерируй промпты", "сгенерируй ассеты", "сделай картинки/видео/VO/музыку", "перегенерь scene-01", model swap, A/B variant | `/ralph-art-director` |
| "собери видео", "render", "captions", "transitions", "audio mix", final cut, Remotion code edits | `/ralph-editor` (use `/remotion-best-practices` for API specifics) |
| "сделай видео end-to-end", batch (N≥3), "сохрани как шаблон", "review batch", cost rollup, profile export/import | `/ralph-producer` |
| "set this up", "ralphy doctor", "no keys", missing-deps errors, "read logs", any ralphy CLI usage | `/ralph-core` |
| Fresh machine, `which ralphy` empty, "install ralphy" | `/ralphy-install` |
| Remotion API details (captions, transitions, audio, ffmpeg, library primitives) | `/remotion-best-practices` |
| Creating a new skill | `/skill-creator` |

**Composition:** if a request spans skills, chain them in order. Example: "сделай видос в стиле <url> для <бренда>" → `/ralph-researcher` → `/ralph-scenarist` → `/ralph-art-director` → `/ralph-editor`. Use `/ralph-producer` as the wrapper for end-to-end.

**Batch (N≥3):** always `/ralph-producer → batch-from-template`. Never run loops by hand.

## Hard invariants

1. **No FAL_KEY, no Vercel, no OpenAI direct.** Only `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY`. All media → `cli/lib/providers/media.ts`. All LLM/vision → `cli/lib/providers/llm.ts → callLLM()`.
2. **No runtime TS scripts under `workspace/projects/<id>/scripts/`.** Every model call is a pre-tested `ralphy generate ...` invocation. If an operation isn't covered by ralphy: stop and propose adding a helper.
3. **Reference-required gate.** Named person, brand, or specific real entity → require user-supplied reference (photo/logo/screenshot) before any generation. Refuse with a concrete ask. User can override with explicit "генерь без референса, я понимаю что качество будет хуже"; log as `stage: "no-ref-consent"`.
4. **Quality gates refuse, not warn.** If `scoreScenario`/`scoreImage`/`scoreVideo` fail twice in a row, stop and report concrete options. Do not render mp4 over a failed gate.
5. **No auto-launched processes.** No background Studio, no dashboard. Chat is the interface. Use `ralphy doctor` to surface missing keys/deps; `ralphy render <id>` to produce mp4.
6. **Always check `MODELS.md`** before any model call. Claude's training is stale.
7. **Always use `bun` and `bunx`** (not npm/npx/yarn).
8. **Always use `ralphy <command>`** for CRUD, not direct workspace edits.
9. **Speed targets** (`docs/perf-targets.md`): cold-start template ≤8 min single video, ≤25 min for 10-batch. Exceeding 50% — report before starting.
10. **Templates live in two places.** `templates/` (repo-public, shipped with the CLI — `ai-vegetables`, `before-after-product`, `soviet-nostalgic`, `talking-character`, `talking-head-rant`) and `workspace/templates/` (user-local, gitignored). Both are read by `ralphy template list` / `suggest` / `use`. When the user says "use template X" or "сделай как X", run `ralphy template suggest <utterance>` first if you don't already know X — it ranks across both sources and tags each result with `source`. Workspace overrides repo on id collision.

## Routing failure mode

If no row matches, **don't improvise**. Either:
- Ask one clarifying question that maps the request to a row, or
- Refuse with the closest in-scope alternative.

See `docs/use-cases.md` for canonical utterance examples. See `docs/research/skill-activation.md` for why this file exists.
