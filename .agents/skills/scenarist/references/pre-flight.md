# Scenarist pre-flight (every new project)

> Moved out of `SKILL.md` to keep the skill body small (#574). The condensed checklist stays in `SKILL.md`.

> **Pre-flight (every new project):** before drafting scenes, confirm with the user:
> 1. **Target audience language** (EN / RU / KR / other). Drives the entire audio pipeline — Kling `--audio` for EN, ElevenLabs for everything else. Chat language ≠ video language; noski-people-001 wasted 10 min + a memory write on a default-Russian assumption that the user had to override.
> 2. **Aspect / platform** (9:16 TikTok / 16:9 YouTube / 1:1 broadcast realism). Square for caught-on-TV trends, never portrait.
> 3. **Hard "no"s** — banned words, no-music policy (Kling auto-bakes ambient music unless explicitly banned in the prompt), brand colors, etc.
> 4. **Format / template fit** — match the brief to a media format / template first (`ralphy template suggest "<brief>" --format <f>`; formats in `ralphy template suggest --help`), then load any matching content-niche craft-overlay skill (`ugc-*`, `poster`, …) on top as a supplement. A *style* template enters as a remix target only on an explicit pointer. Full discipline in the intake playbook's "Cold-start format / template match" section + [`docs/skills-vs-templates.md`](../../../../docs/skills-vs-templates.md).
> 5. **Storyboard lock** — produce `STORYBOARD.md` (scene table) plus the pre-render `RETENTION_REVIEW.md` ([retention-review.md](./retention-review.md)) and get explicit user "go" BEFORE handing to art-director. Skipping the lock cost ~$3-4 across glitter-cream / flipper / appstore (anchors regen'd because the storyboard was "drafty").
>
> See [`.agents/skills/intake/SKILL.md`](../../intake/SKILL.md) for the full intake protocol that fires before this playbook.
