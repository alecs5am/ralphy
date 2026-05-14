# Ralphy CLI — UX vision

> Status: **design doc, not yet implemented.** The landing
> (`landing/components/Hero.tsx` + `sections/HowItWorks.tsx`) promises this
> surface. Today's CLI exposes ~70% of it under different names; the
> remaining 30% is missing entirely. This doc is the spec for a future
> "polish pass" by another agent (`/cli-improve`).

## Why this exists

The landing makes four headline promises:

1. **Trend-watch.** *"Drop a niche or an @handle. Ralphy crawls TikTok, Reels & Shorts and reports what's gaining velocity."*
2. **Style-clone.** *"Paste a URL. Ralphy lifts the visual recipe; you keep the words."*
3. **One-prompt render.** *"From idea to finished mp4 in ~8 minutes."*
4. **Iterate from numbers.** *"Plug views, watch-time, conversions back in. Ralphy doubles down on what works."*

Today's CLI can do **all four** — but the verbs are spread across
`research`, `ref`, `generate`, `render`, `eval`, with inconsistent flag
shapes and no glue command. A new user who types what the landing says
will hit "unknown command" five times before finding the path.

This doc proposes a **front-stage layer** of 6 verbs that map cleanly to
the landing copy, and routes them to the existing back-stage subcommands.
The back stage stays — power users still get `ref pull`, `research synthesize`,
etc. — but the front stage is what we screenshot, what we type in demos, what
agents call by default.

## Hard constraints

- **Backwards-compatible.** Every existing verb keeps working. The new
  verbs are additions, not renames.
- **Composable.** Each new verb is a thin shell over existing
  `cli/lib/**` primitives. No new model providers, no new ffmpeg recipes.
- **Self-evident.** `ralphy <verb> --help` shows examples that match the
  landing 1:1.
- **Agent-friendly.** Output is JSON by default, `-p` for pretty.
  Long-running verbs stream progress events via NDJSON on stdout.

## Front-stage verbs (6)

### `ralphy trend [target...]`

Discover what's spiking *now* in a niche or for a handle.

```
ralphy trend "@nikitabier" --niche saas --window 14d
ralphy trend --niche "diy electronics" --platforms tiktok,reels
```

| Flag | Default | Description |
|---|---|---|
| `--niche <s>` | — | Free-text niche; required if no `@handle` given |
| `--platforms <list>` | `tiktok,reels,shorts` | Comma-sep platforms to crawl |
| `--window <duration>` | `14d` | How far back to scan |
| `--top <n>` | `20` | Return top-N clips |
| `--save-refs` | `false` | Auto-import discovered clips as refs |

**Routes to:** `research scrape-trends` + post-processing.
**Today's gap:** `scrape-trends` exists but takes no niche/handle filter.

Output (JSON):
```json
{
  "clips": [
    { "url": "https://tiktok.com/...", "views": 1240000, "format": "hyper-motion", "hook": "...", "velocity": "+312%/wk" }
  ],
  "summary": { "top_formats": [...], "spiking_now": "..." }
}
```

---

### `ralphy clone <url-or-ref>`

Lift a visual recipe (palette, format, pacing, hook, music style) from a
URL or already-imported ref into a fork-and-tweak template.

```
ralphy clone https://tiktok.com/@x/video/72939
ralphy clone soviet-01 --as-template hyper-motion-v2
```

| Flag | Default | Description |
|---|---|---|
| `--as-template <id>` | derived | Slug to save the cloned style under |
| `--strict-look` | `false` | Mirror palette + grading; reuse hook exactly |
| `--prompt-only` | `false` | Skip music/voice extraction |

**Routes to:** `ref pull` → `ref analyze` → `ref blueprint` → `template create`.
**Today's gap:** the chain works but requires 4 commands and a JSON-stitching
step.

---

### `ralphy make <one-line-brief>`

The headline command — one prompt to finished mp4.

```
ralphy make "Linear product spot, hyper-motion, 22s" --style hyper-motion-v2
ralphy make --brief "5 TikToks for the HP1 launch" --batch 5
```

| Flag | Default | Description |
|---|---|---|
| `--style <id>` | auto-pick | Template slug (from `template list`) |
| `--ref <list>` | — | Comma-sep refs to use as visual anchors |
| `--batch <n>` | `1` | Generate N variants in parallel |
| `--budget <usd>` | `15` | Soft cap on API spend before checking with you |
| `--dry-run` | `false` | Plan only — no model calls |

**Routes to:** `project create` → `research add` → `generate` → `render`.
**Today's gap:** `render` takes a `<projectId>` — assumes the project
already exists. `make` wraps the whole flow.

NDJSON stream events: `plan-locked`, `prompts-locked`, `scene:N:start`,
`scene:N:done`, `render-start`, `done`.

---

### `ralphy iterate <project-id-or-campaign>`

Plug analytics back in. Retire losers, double down on winners.

```
ralphy iterate linear-001
ralphy iterate --campaign hp1-launch --source tiktok-api,reels-csv
```

| Flag | Default | Description |
|---|---|---|
| `--source <list>` | `auto` | Where to read metrics — agency API or CSV path |
| `--retire <metric>` | `ctr<2%` | Variants below this get archived |
| `--remix <n>` | `3` | How many fresh variants to generate from winners |

**Routes to:** `eval` (post-render scoring) + `make --remix`.
**Today's gap:** `eval` exists but only operates on local files, doesn't
read external analytics; `--remix` is a new flow.

---

### `ralphy mcp`

Boot the Model Context Protocol server. Same binary, different mode.

```
ralphy mcp                  # stdio transport (default — what `claude mcp add` calls)
ralphy mcp --transport sse --port 3173
```

Exposes every front-stage verb as an MCP tool: `ralphy_trend`,
`ralphy_clone`, `ralphy_make`, `ralphy_iterate`, plus `ralphy_status`
for ambient state.

**Routes to:** new module `cli/lib/mcp/server.ts` (doesn't exist yet).
**Today's gap:** entirely new. Skeleton: `@modelcontextprotocol/sdk` + a
thin tool registry that wraps each verb's existing function.

---

### `ralphy skill install [--agent <id>]`

Drop the markdown skill bundle into the chosen agent's skills dir.

```
ralphy skill install                          # auto-detects ~/.claude/, ~/.cursor/, etc.
ralphy skill install --agent claude --scope user
ralphy skill install --agent cursor --scope project
```

| Flag | Default | Description |
|---|---|---|
| `--agent <id>` | auto-detect | `claude`, `cursor`, `codex` |
| `--scope <s>` | `user` | `user` (`~/.<agent>/skills/`) or `project` (`./.<agent>/skills/`) |
| `--symlink` | `true` | Symlink to the repo's `.agents/skills/` (live updates) |
| `--copy` | `false` | Hard copy instead — survives uninstall |

**Routes to:** new module `cli/lib/skill/installer.ts` (doesn't exist yet).
**Today's gap:** entirely new. The skill bundle exists at
`.agents/skills/` and is symlinked from `.claude/skills/` in the repo —
the installer just packages this for export.

## Back-stage verbs (unchanged)

All current verbs keep working — they're the "advanced" layer:

```
ralphy ref { pull | analyze | blueprint | ... }
ralphy project { create | list | log | timeline | ... }
ralphy template { list | suggest | use | ... }
ralphy generate { image | video | voiceover | music }
ralphy render <project-id>
ralphy eval <mp4>
ralphy research { start | add-source | synthesize | ... }
ralphy batch { from-template | run | ... }
ralphy assets { list | pull | install | ... }
ralphy { setup | doctor | status | init }
```

## Output contract (applies to all verbs)

- **Default**: single-line JSON to stdout, exit 0 on success.
- **`-p` / `--pretty`**: human-readable; tables, colors, animated spinners.
- **Long-running** (`make`, `iterate`, `trend`): NDJSON event stream —
  one event per line, each event has `{ ts, kind, ... }`.
- **Errors**: JSON to stderr with `{ error: { code, message, hint? } }`,
  exit nonzero.
- **All verbs** support `--json` (force JSON even with `-p`) and `--quiet`
  (suppress progress, only emit the final result).

## Help-text convention

Every front-stage verb's `--help` output ends with a `## Examples` block
that **exactly matches** the landing copy:

```
$ ralphy trend --help
…
Examples:
  ralphy trend "@nikitabier" --niche saas
  ralphy trend --niche "diy electronics" --top 5
```

The agent's job: paste the verbatim landing example, get a result.

## Phasing

| Phase | Verbs | Effort | Blocks landing fidelity? |
|---|---|---|---|
| 1 | `ralphy make` (wraps existing chain) | 1d | yes — fixes 4 demo terminals |
| 2 | `ralphy trend` (wrap `research scrape-trends`) | 2d | yes |
| 3 | `ralphy clone` (wrap `ref` chain) | 2d | yes |
| 4 | `ralphy skill install` | 1d | yes — fixes Skill tab in Hero |
| 5 | `ralphy mcp` | 4d (new SDK integration) | yes — fixes MCP tab in Hero |
| 6 | `ralphy iterate` (new analytics readers) | 5d | no (nice-to-have) |

Total: ~3 weeks of focused work for full landing-↔-CLI alignment.

## Open questions

1. **`ralphy make` vs. `ralphy render`** — should `make` *be* the new
   render, or stay a higher layer that calls render under the hood?
   Recommendation: keep both, `make` = "brief → mp4", `render` = "project
   id → mp4".
2. **`ralphy mcp` transport** — stdio-only for v1 (matches `claude mcp add`)
   or also SSE for cloud agents?
3. **`ralphy iterate` analytics sources** — manual CSV first, then
   TikTok Business API + Meta API + YouTube Analytics. Authentication
   model TBD.
4. **Skill scoping for non-Claude agents** — Cursor has rules not
   skills; Codex has `AGENTS.md`. The `skill install` UX should normalize
   these, but the file layout per agent needs a small adapter pattern.

## Don't do

- Don't rename existing verbs. Adoption pain isn't worth the polish.
- Don't make `make` interactive — it should be one shot, all flags up
  front. Wizards belong in `setup` and `init`, not the hot path.
- Don't introduce a TUI / dashboard as the primary surface. The dev
  agent IS the TUI.
