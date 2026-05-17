# 05 — Project Resources — SPEC

> **Vision.** Every piece of project state has one canonical home, one canonical name, and one CLI verb that touches it. The append-only invariant is enforced by code, not convention. Brands and personas are real, not decorative.

## Scope

**In:**

- Workspace + project on-disk shape, validated at CLI boundary
- Registry index for cross-project queries
- Brand, Persona, Ref, Project, Template, Batch, Asset, Workspace, Profile CRUD plumbing (the verbs already exist; this is hardening + uniformity)
- Asset cache + companion-repo pool integration
- Append-only enforcement in code
- Profile export / import

**Not in (cross-references):**

- Prompt cookbooks / template contents → [`02`](../02-prompts-and-templates/)
- Verb shape itself (JSON contract, flags) → [`01`](../01-cli/)
- Companion-repo publishing CI → [`09`](../09-distribution-and-release/)
- Telemetry layered on gen-log → [`10`](../10-cost-and-telemetry/)

---

## 05.01 Workspace registry

A single index of every named resource in the workspace. Without it, cross-resource queries require filesystem walks.

### 05.01.01 `workspace/.ralph/registry.json` is the single index  [ ]
**v1.0:** yes

**Acceptance criteria:**
- File schema: `{ projects: [{id, dir, brand?, persona?, last_activity_ts, status, cost_usd}], brands: [...], personas: [...], refs: [...], templates: [...] }`.
- Every CRUD operation through `ralphy <resource> create|delete` updates the registry atomically (write-temp + rename).
- Registry is rebuildable from filesystem via `ralphy workspace reindex` — idempotent.
- File-locked on writes; concurrent CLI invocations are safe.

### 05.01.02 `ralphy workspace status` shows registry health  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Returns counts per resource type, last-activity, registry vs filesystem drift.
- Reports "orphan dirs" (filesystem entries not in registry) and "phantom entries" (registry entries with no filesystem backing).

### 05.01.03 Registry queries (project list / show) use the index  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy project list` reads from registry only — no filesystem scan in the hot path.
- `ralphy project list --filter "brand=acme"` works.
- Sort flags: `--sort last_activity|cost|name|status`.

---

## 05.02 Canonical project shape

The on-disk layout of `workspace/projects/<id>/` is documented and validated.

### 05.02.01 Project schema documented in `docs/project-shape.md`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- New doc enumerates every file/dir under `workspace/projects/<id>/` with its purpose, owner playbook, and append-only status.
- Includes `prompts.json`, `asset-manifest.json`, `scenario.json`, `captions.json`, `STORYBOARD.md`, `POSTMORTEM.md`, `postmortem/`, `assets/`, `render/`, `logs/`.
- Each entry: which playbook reads/writes it, what's allowed (append / new-file / overwrite-on-promote / never-touch).

### 05.02.02 `ralphy project validate <id>` verifies the shape  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Checks: required files present, JSONL files parseable, asset-manifest references files that exist, no overwrite of v1 by v2 (only additive versions).
- Output: `{ ok, issues: [{ severity, file, message, hint }] }`.
- Exit 0 if clean, exit 5 (quality-gate refusal) if any error.

### 05.02.03 `ralphy project show <id>` returns a denormalized view  [~]
**v1.0:** yes

**Acceptance criteria:**
- One JSON object with: project meta, linked brand/persona, scenario summary, gen-log rollup (cost + per-stage counts), asset-manifest, render status.
- Pretty mode renders a one-screen dashboard.
- Today: partial — extend to include brand/persona/render status.

---

## 05.03 Append-only invariant enforced in code

`AGENTS.md` invariant #13 says "never delete or overwrite user/agent-produced artifacts without explicit user request". Today this is honored by the agent; code can violate it silently.

### 05.03.01 CLI layer refuses non-consented deletes  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Any path under `workspace/projects/<id>/{assets,render,logs,postmortem}/` or any project-root `.json` / `.md` is **read-only by default** at the CLI library boundary (`cli/lib/fs/safe.ts` new module).
- Mutation requires explicit `consent_kind`: `"new-version"`, `"new-file"`, `"append"`, or `"user-explicit-delete"`. Anything else throws.
- Tests cover every kind.

### 05.03.02 `ralphy generate` writes new versions, never overwrites  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Existing slot file `scene-04-image.png` + new gen → writes `scene-04-image.v2.png`.
- Subsequent gens go `.v3`, `.v4`, …
- Asset manifest tracks all versions; latest is the "active" version unless explicitly promoted.
- `ralphy asset promote <project> <slot> <version>` sets which version the renderer uses.

### 05.03.03 `ralphy project delete <id>` is the only project-scope wipe  [~]
**v1.0:** yes

**Acceptance criteria:**
- Requires `--confirm` flag or interactive Y/N (no auto-yes via `-y` without `--confirm` also set).
- Removes project dir, registry entry, asset-cache reverse-links — atomic.
- Pretty mode confirms list of artifacts about to disappear; JSON mode requires `--confirm`.

### 05.03.04 JSONL logs are append-only at the library layer  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/log/append.ts` is the only writer for `generations.jsonl`, `user-prompts.jsonl`, `user-assets.jsonl`.
- It only supports `append`. Truncation throws.
- Rotation / archival is post-launch (`05.07.x`).

---

## 05.04 Brand & Persona as first-class

Brand = "what the product/voice sounds like". Persona = "who is on camera / behind the VO". Both must reach the prompt cookbook automatically.

### 05.04.01 Brand schema covers tone, palette, banned terms, audio voice  [~]
**v1.0:** yes

**Acceptance criteria:**
- `brand.json` schema includes: `tone[]`, `palette: {primary, secondary, accent}`, `banned_terms[]`, `voice_id` (ElevenLabs), `music_style[]`, `logo_path?`, `safe_zones?`.
- Validation via `ralphy brand validate <id>`.
- Documented in `docs/brand-schema.md`.

### 05.04.02 Persona schema covers archetype, look, voice, mannerisms  [~]
**v1.0:** yes

**Acceptance criteria:**
- `persona.json` schema includes: `archetype`, `age_range`, `look_descriptors[]`, `voice_id`, `accent`, `mannerisms[]`, `reference_image?`.
- `ralphy persona suggest --archetype <text>` returns 3 closest matches.

### 05.04.03 Project inherits brand + persona via slugs  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy project create --brand <slug> --persona <slug>` links by reference, not copy.
- `ralphy project show <id>` denormalizes brand + persona inline.
- Editing brand updates rendered prompts on next gen (no stale copies in `prompts.json`).

### 05.04.04 Playbooks consume brand/persona via canonical helpers  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/project/context.ts` exports `getProjectContext(id)` returning `{ brand, persona, refs[], template? }`.
- Scenarist, art-director, editor playbooks call this helper instead of reading individual files.
- Tests assert the helper is called from each playbook entry-point.

---

## 05.05 Asset cache + companion repo pool integration

The pool layer in [`ralphy-assets`](https://github.com/alecs5am/ralphy-assets) is the catalog of reusable references (characters, gameplay loops, trend music). The CLI must read it cleanly and refuse improvisation when an asset exists.

### 05.05.01 `ralphy assets list --kind <kind>` is the catalog entry-point  [~]
**v1.0:** yes

**Acceptance criteria:**
- Reads from the live manifest (24h cached at `workspace/.ralph/asset-cache/manifest.json`).
- Returns `[{ slug, kind, sha256, size, license, source_url, tags[] }]`.
- Pretty: grouped table by kind.

### 05.05.02 `ralphy assets pull-pool <kind>/<slug> --install <project>`  [~]
**v1.0:** yes

**Acceptance criteria:**
- Downloads if absent (with sha256 verify), copies into `workspace/projects/<id>/assets/refs/`, appends a `user-assets.jsonl` entry.
- Idempotent on re-run (no duplicate manifest entries).

### 05.05.03 `docs/assets-catalog.md` regenerates from manifest  [~]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy assets catalog --write` regenerates the markdown.
- CI check: catalog file matches the regenerated output (no manual drift).

### 05.05.04 Improvisation refusal when asset exists  [ ]
**v1.0:** yes

**Acceptance criteria:**
- If a playbook is about to write a prompt naming a real-world entity (character, brand, footage) AND `ralphy assets list` returns a match for that kind, the playbook stops and prompts the user: "use the cataloged asset `<slug>` or override?".
- Override is logged as `stage: "no-pool-consent"` in `generations.jsonl`.

---

## 05.06 Profile export / import

A profile is a portable bundle of a user's whole workspace minus secrets.

### 05.06.01 `ralphy profile export <name>` writes a single tarball  [~]
**v1.0:** yes

**Acceptance criteria:**
- Output: `profiles/<name>.tar.zst` containing projects/, brands/, personas/, refs/, registry.json. No secrets, no asset cache.
- Manifest at the tarball root: `{ ralphy_version, exported_at, contents: {...} }`.
- Compression: zstd level 9. Single file < 100 MB for a 50-project workspace.

### 05.06.02 `ralphy profile import <tarball>` restores  [~]
**v1.0:** yes

**Acceptance criteria:**
- Validates manifest, version-checks against current CLI.
- Additive: existing projects with conflicting ids fail loudly (no silent overwrite).
- `--rename-on-conflict` flag remaps ids.
- After import, `ralphy workspace reindex` is run automatically.

### 05.06.03 Round-trip preserves bit-exact state  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Export → wipe → import → `diff -r` shows zero changes.
- Smoke test in CI on a 3-project fixture.

---

## 05.06A `ralphy memory` — cross-session memory

A persistent, user-owned store that survives sessions and projects. Records preferences, patterns, decisions Ralphy should not forget. Additive, inspectable, fully under the user's control.

### 05.06A.01 Memory store at `~/.ralphy/memory/`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Plain-file store at `~/.ralphy/memory/<slug>.md`, one file per memory entry.
- Frontmatter: `kind: preference|pattern|brand-quirk|rejection|fact`, `scope: global|brand:<slug>|persona:<slug>|template:<slug>`, `created_at`, `last_used_at`.
- Body: free-text rationale + structured data (the rule the agent should apply next time).
- Index at `~/.ralphy/memory/INDEX.md` — auto-maintained, one line per entry, sorted by `last_used_at`.

### 05.06A.02 `ralphy memory` verb tree  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy memory add "<text>" [--kind <k>] [--scope <s>]` — agent + user can both write.
- `ralphy memory list [--kind <k>] [--scope <s>] [--since <duration>]` — search.
- `ralphy memory show <slug>` — full read.
- `ralphy memory edit <slug>` — opens in $EDITOR.
- `ralphy memory remove <slug>` — deletes (explicit; one of the few delete verbs that's allowed without `--confirm`).
- `ralphy memory clear` — wipes everything; requires `--confirm`.

### 05.06A.03 Playbook reads relevant memory before acting  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Every playbook entry-point runs `ralphy memory list --scope <relevant>` and incorporates findings.
- Scope filter: `global` + `brand:<active>` + `persona:<active>` + `template:<active>` for the current project.
- Top-N (configurable, default 20) loaded into context.

### 05.06A.04 Memory write is opt-in but encouraged  [ ]
**v1.0:** yes

**Acceptance criteria:**
- After completing a project, the agent proposes 1-3 memory entries based on what was learned ("user prefers tighter VO pacing", "brand bans the word 'simply'", "template X reliably works for B2B SaaS shorts").
- User accepts / rejects per entry.
- No silent writes — every memory has a clear authorship trail.

### 05.06A.05 Privacy & portability  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Memory is purely local (cross-link [`10.06`](../10-cost-and-telemetry/SPEC.md) — no phone-home).
- `ralphy memory export <output.tar>` and `ralphy memory import <tar>` for portability.
- Profile export (cross-link `05.06.01`) optionally includes memory via `--include memory`.

### 05.06A.06 Memory documented in agent context  [ ]
**v1.0:** yes

**Acceptance criteria:**
- AGENTS.md gets a "Memory" section explaining the contract.
- Playbooks reference `ralphy memory list` as the first action when starting a session for a recurring brand/persona.

---

## 05.07 Post-launch

### 05.07.01 Cross-project search  [ ]
**v1.0:** no

**Acceptance criteria:**
- `ralphy workspace search "ref:glitter-cream"` returns projects using that ref.
- Indexed on registry update; query is O(1) lookup.

### 05.07.02 Project archival  [ ]
**v1.0:** no

**Acceptance criteria:**
- `ralphy project archive <id>` moves to `workspace/.archive/`, removes from active registry, preserves all files.
- `ralphy project unarchive <id>` reverses.

### 05.07.03 Partial profile bundles  [ ]
**v1.0:** no

**Acceptance criteria:**
- `ralphy profile export --include brands,personas` produces a sliced bundle.
- `--exclude projects` likewise.

### 05.07.04 Log rotation  [ ]
**v1.0:** no

**Acceptance criteria:**
- `generations.jsonl` > 50 MB → roll to `generations.NN.jsonl`, keep aggregate stats summary.
