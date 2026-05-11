# Playbooks index

These are the role / domain instruction docs the agent reads on demand. The router lives in `AGENTS.md` (intent → playbook). This file is the catalogue.

| Playbook | When the agent should read it |
|---|---|
| [researcher.md](researcher.md) | Open research, URL drops, "style from <site>", "analyze @handle", "break down TikTok / Reel", "what's trending in", competitor analysis, video downloads |
| [scenarist.md](scenarist.md) | "write a script", "make a video about X", "rework scene 3", "rewrite hook", "shorten / lengthen", scenario feedback |
| [art-director.md](art-director.md) | "generate prompts / assets", "make images / video / VO / music", "regenerate scene-XX", model swap, A/B variants, cost preview |
| [editor.md](editor.md) | "compose the video", "render", "captions", "transitions", "audio mix", "final cut", "preview" |
| [producer.md](producer.md) | "make video end-to-end", batch (N≥3), "save as template", "review batch", profile export/import |
| [core.md](core.md) | "set up", "ralphy doctor", "nothing works", "read logs", any ralphy CLI usage question |
| [ralphy-install.md](ralphy-install.md) | Fresh machine, `which ralphy` empty, "install ralphy" |
| [remotion.md](remotion.md) | Writing or editing Remotion code (compositions, components, ffmpeg post) |

## How they fit together

- **`CLAUDE.md`** is the bootstrap. Hard rule: "Before responding to a request that maps to a playbook, READ the playbook fully — do not improvise."
- **`AGENTS.md`** is the router (intent → playbook). It is `@`-imported into the system prompt, so it's always in context.
- **Playbooks** live here, in plain markdown. No frontmatter, no skill activation. Read on demand via `Read`.
- Each playbook starts with **"Read this when:"** so the agent can confirm the match before diving in.
- Each playbook lists its **Sub-docs** (e.g. `researcher/yt-dlp.md`) and the agent reads sub-docs on demand for the specific sub-task.

## Playbooks vs skills

- **Playbooks (here, `docs/playbooks/`)** — role / domain instruction docs. The agent reads them on demand. Loaded via `Read` after `AGENTS.md` routing matches an intent. No frontmatter, no slash-command. They cover roles like *scenarist* / *art-director* / *editor* / *producer* / *core* (env / debug / CLI).
- **Skills (`.agents/skills/<name>/SKILL.md`)** — narrow workflows with a deterministic input → output contract and a single CLI command. They are slash-invocable (`/<name>`). Currently three exist:
  - `ralph-researcher` — URLs / handles / topic → `report.md` + `sources.json` (workspace/research/<slug>/)
  - `ralph-evaluator` — rendered mp4 → `eval-report.md` + `eval.json`
  - `remotion-best-practices` — reference rules for Remotion code

Old role-shim skills (`ralph-art-director`, `ralph-core`, `ralph-editor`, `ralph-producer`, `ralph-scenarist`) were removed in favor of direct routing via `AGENTS.md` → playbooks. If you need to invoke those roles in chat, just say the role-utterance (e.g. "compose the video") and the routing will pick the right playbook.
