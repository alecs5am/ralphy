# Ralphy CLI Surface

> Single-file enumeration of every CLI verb — today's surface, what lands at v1.0, what's post-launch. Curated by hand for now; auto-gen lands per [`07.03.01`](../roadmap/07-socials-and-docs/SPEC.md). Mirrored into Mintlify at `docs-mintlify/cli/surface.mdx` (per [`01.10.02`](../roadmap/01-cli/SPEC.md)).

**Status legend.**
- `today` — implemented and working in v0.x.
- `v1.0` — planned and gating launch.
- `v1.0-stretch` — planned, may slip.
- `post-v1.0` — explicitly later.

---

## Top-level

| Verb | Status | Signature | What it does |
|---|---|---|---|
| `ralphy --version` / `-v` | today | — | Print binary version |
| `ralphy --help` | today | — | Top-level help |
| `ralphy help <command>` | today | nested walker | Walks nested help |
| `ralphy setup` | today (hardening at `01.04`) | `[-y] [--openrouter-key K] [--elevenlabs-key K] [--keys-from-env] [--project-dir D] [--import-profile P] [--no-verify] [--allow-unverified] [--no-skill-install]` | First-time wizard. Validates keys with live probes. On `v1.0` ends by offering to install the agent skill bundle (`01.09.06`). |
| `ralphy status` | today | `[-p]` | Ambient state: project, keys, daemon, queue, install mode |
| `ralphy doctor` | today (hardening at `01.04.03`) | `[-p]` | Env health: bun / ffmpeg / yt-dlp / keys / workspace / install mode |
| `ralphy new "<brief>"` | v1.0 | `[--id <slug>] [--brand <slug>] [--persona <slug>] [--template <slug>]` | Casual on-ramp. Creates project under `~/.ralphy/projects/<id>/` (`01.09.01`). |
| `ralphy make "<brief>"` | v1.0 | `[--style <slug>] [--ref <list>] [--cref <r>] [--sref <r>] [--pref <r>] [--batch <n>] [--budget <usd>] [--dry-run] [--final]` | Brief → mp4. Default mode = draft (minimum scope, best models). `--final` ships directly. |
| `ralphy ship <project-id>` | v1.0 | `[--allow-failed-eval] [--allow-over-budget] [--no-ref-consent --reason <text>]` | Promote draft to full storyboard + final render. Runs gates. |
| `ralphy trend <target>` | v1.0 | `[--niche <s>] [--platforms tiktok,reels,shorts] [--window 14d] [--top 20] [--save-refs]` | Niche / handle scanner. Wraps `research scrape-trends`. |
| `ralphy clone <url-or-ref>` | v1.0 | `[--as-template <id>] [--strict-look] [--prompt-only]` | Lift a style from a URL → template. Wraps `ref pull` → `ref analyze` → `ref blueprint` → `template create`. |
| `ralphy iterate <project-or-campaign>` | v1.0-stretch | `[--source <csv-or-api>] [--retire <expr>] [--remix <n>]` | Analytics-driven remix. CSV path for v1.0; external APIs post-launch. |
| `ralphy mcp` | v1.0 | `[--transport stdio\|sse] [--port <p>]` | Boot the MCP server (stdio default). |
| `ralphy skill install` | v1.0 | `[--agent claude\|cursor\|codex\|copilot] [--scope user\|project] [--symlink\|--copy]` | Install Ralphy skill bundle into the chosen agent. |
| `ralphy skill uninstall` | v1.0 | `[--agent <id>]` | Reverse. |
| `ralphy skill new <name>` | v1.0 | — | Scaffold a new SKILL.md + playbook stub + AGENTS.md row. |
| `ralphy resume <project-id>` | v1.0 | — | Continue a cancelled run from the last completed stage. |
| `ralphy producer "<brief>"` | v1.0 | `[--batch <n>] [--on-fail continue\|halt]` | Batch end-to-end. Minimum confirmation. |
| `ralphy council <project-id>` | v1.0 | `[--agents 1..7] [--quick] [--dry-run]` | Multi-agent evaluation. Replaces `ralphy eval`. Models hidden from user. |
| `ralphy eval <project-id>` | today (alias post-v1.0) | — | Alias for `ralphy council --agents 1 --quick`. |
| `ralphy render <project-id>` | today | `[--loudnorm] [--composition <slug>]` | Render to `workspace/projects/<id>/render/final.mp4`. |
| `ralphy upgrade` | post-v1.0 | — | Self-update the binary. |
| `ralphy completion <shell>` | post-v1.0 | `<bash\|zsh\|fish>` | Shell completions. |

---

## Generate (gate to provider APIs)

All share: `--project <id>`, `--slot <slug>`, `--dry-run`, `--cref <r>`, `--sref <r>`, `--pref <r>` (per `02.02`).

| Verb | Status | Signature | Notes |
|---|---|---|---|
| `ralphy generate image` | today | `--prompt <text> [--model <id>] [--size 1080x1920]` | Default `openai/gpt-5.4-image-2`. |
| `ralphy generate video` | today | `--prompt <text> [--model <id>] [--duration <s>] [--aspect-ratio <r>] [--resolution <r>] [--first-frame <r>] [--last-frame <r>] [--audio] [--no-validate]` | Default `kwaivgi/kling-v3.0-pro`. Per-model whitelists enforced. |
| `ralphy generate voiceover` | today | `--prompt <text> [--voice-id <id>] [--stability <0..1>] [--similarity <0..1>] [--style <0..1>]` | ElevenLabs. |
| `ralphy generate music` | today | `--prompt <text> [--duration <s>]` | ElevenLabs Music. |
| `ralphy generate captions` | today | `--audio <path>` | Whisper-1 (cloud default) or whisper.cpp (local, opt-in per `06.03`). |

---

## Resources (CRUD pattern: `create | list | show <id> | update <id> | delete <id>`)

| Resource | Status | Notable extensions |
|---|---|---|
| `ralphy brand` | today | Schema covers tone, palette, banned terms, voice (per `05.04.01`). |
| `ralphy persona` | today | Schema covers archetype, look, voice. `ralphy persona suggest --archetype <text>`. |
| `ralphy ref` | today | `ralphy ref pull <url>` (yt-dlp), `ralphy ref blueprint <slug>`, `ralphy ref scrape-trends`. |
| `ralphy project` | today | `log <id>`, `timeline <id>`, `log-prompt`, `log-asset`, `score <id>`, `transcribe <id>`, `clone <id>`, `validate <id>` (v1.0 per `05.02.02`), `migrate-scenario` (v1.0 one-off), `show <id>` (denormalized per `05.02.03`). |
| `ralphy template` | today | `template suggest "<utterance>"`, `template use <id>`, `template install <slug>` (v1.0 per `01.09.03`), `template export <slug>` (post). |
| `ralphy batch` | today | `batch submit --from <file>`, `batch run`, `batch --vary hook --variants N` (v1.0 per `02.08.02`). |
| `ralphy asset` | today | per-slot asset management. `ralphy asset promote <project> <slot> <version>` (v1.0 per `05.03.02`). |
| `ralphy workspace` | today | `workspace status`, `workspace reindex` (v1.0 per `05.01.02`), `workspace migrate-to-home` (v1.0-stretch per `01.09.08`), `workspace migrate-gen-log` (v1.0 per `10.01.02`). |
| `ralphy config` | today | `config set <k> <v>`, `config get <k>`, `config list`. Global at `~/.ralphy/config.json` (v1.0 per `01.09.02`). |
| `ralphy profile` | today | `profile export <name>`, `profile import <tarball>` (round-trip per `05.06`). |
| `ralphy memory` | v1.0 | `memory add "<text>" [--kind <k>] [--scope <s>]`, `memory list`, `memory show <slug>`, `memory edit <slug>`, `memory remove <slug>`, `memory clear --confirm`, `memory export`, `memory import` (per `05.06A`). |

---

## Utilities (local, no API)

| Verb | Status | Signature | Notes |
|---|---|---|---|
| `ralphy audio loudnorm` | today | `--input <p> --output <p> [--target -14]` | EBU R128 normalization. |
| `ralphy audio sidechain-duck` | today | `--vo <p> --music <p> --output <p>` | Duck music under VO. |
| `ralphy audio probe` | v1.0 | `<path>` | LUFS, channels, codec, dead-air %. |
| `ralphy video concat` | today | `--inputs <list> --output <p>` | Concat scenes. |
| `ralphy video extract-segment` | today | `--input <p> --start <s> --end <s> --output <p>` | Cut. |
| `ralphy video burn-subs` | today | `--input <p> --captions <p> --output <p>` | Hardcode captions. |
| `ralphy video tonemap-hdr` | today | `--input <p> --output <p>` | HDR → SDR. |
| `ralphy video smart-crop` | today (hardening at `06.02`) | `--input <p> --output <p> [--aspect 9:16] [--track face\|saliency\|center] [--stabilize]` | Face/saliency-aware crop. |
| `ralphy video probe` | v1.0 | `<path>` | duration, resolution, fps, codec, audio. |
| `ralphy video frame` | v1.0 | `<input> --at <sec> [--count N --interval <sec>] [--format png\|jpeg]` | Frame extraction. |
| `ralphy video recipes --write-docs` | v1.0 | — | Regenerate `docs/ffmpeg-recipes.md`. |
| `ralphy local list` | v1.0-stretch | — | List installed local models. |
| `ralphy local install <kind>/<model>` | v1.0-stretch | — | Install whisper.cpp etc. |
| `ralphy bench local` | post-v1.0 | — | Compare local vs cloud. |

---

## Models registry

| Verb | Status | Signature |
|---|---|---|
| `ralphy models list` | today | `[-p]` |
| `ralphy models show <id>` | today | `[-p]` |

---

## Assets (companion repo `ralphy-assets`)

| Verb | Status | Notes |
|---|---|---|
| `ralphy assets list` | today | `[--kind <kind>]` |
| `ralphy assets pull <pool> --install <project>` | today | sha-verified |
| `ralphy assets pull-pool <kind>/<slug> --install <project>` | today | per `05.05.02` |
| `ralphy assets pull-key` | today | targeted asset |
| `ralphy assets install <list>` | today | bulk |
| `ralphy assets clean` | today | clear local cache |
| `ralphy assets cache-info` | today | size, age |
| `ralphy assets catalog --write` | today | regenerate `docs/assets-catalog.md` |
| `ralphy assets install-local-models` | v1.0 | per `06.03.02` |

---

## Examples (companion repo)

| Verb | Status |
|---|---|
| `ralphy example list` | today |
| `ralphy example pull <slug>` | today |

---

## Daemon / queue

| Verb | Status |
|---|---|
| `ralphy daemon start \| stop \| status` | today |
| `ralphy queue add \| list \| show \| cancel \| retry \| logs \| watch` | today |

---

## Cost & Telemetry

| Verb | Status | Signature |
|---|---|---|
| `ralphy cost report` | v1.0 | `[--project <id>] [--since 7d] [--group-by template\|brand\|model\|day]` |
| `ralphy cost forecast` | v1.0-stretch | `--brief "<text>"` |
| `ralphy export <backend>` | v1.0 | `<langfuse\|phoenix\|otel> [--target <url>] [--since 7d] [--include-bodies]` |

---

## Prompts library

| Verb | Status |
|---|---|
| `ralphy prompts modes --kind <k> --model <id>` | v1.0-stretch (per `02.03.04`) |
| `ralphy prompts library lookup --goal "<text>"` | v1.0 (per `02.0L.03`) |

---

## Release (maintainer-only)

The `/release` skill drives this end-to-end. Manual verbs exposed:

| Verb | Status |
|---|---|
| `ralphy release delist <version>` | v1.0 |

---

## Common flags (cross-verb)

| Flag | Status | Where |
|---|---|---|
| `--project <id>` | today | every project-scoped verb |
| `--slot <slug>` | today | every gen / asset-write verb |
| `--cwd <path>` | today | workspace root pin |
| `-p` / `--pretty` | today | human output |
| `--json` | today | no-op (default); kept for scripts |
| `--quiet` | v1.0 | suppress progress |
| `--dry-run` | partial | every paid / mutating verb at v1.0 |
| `--output-format text\|json\|stream-json` | v1.0 | NDJSON for long-running |
| `--cref <r>` / `--sref <r>` / `--pref <r>` | v1.0 | every gen verb |

---

## Exit codes (closed set)

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | generic runtime (target → 0) |
| 2 | user error (bad flag, missing input) |
| 3 | provider error (rate limit, API down) |
| 4 | environment error (missing key / dep) |
| 5 | quality-gate refusal |
| 130 | cancelled (SIGINT) |

Full error code catalog: `cli/lib/errors/catalog.ts` (per `01.06.01`).
