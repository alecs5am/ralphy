# Roadmap normalization audit

> Generated 2026-05-24. Reproduce: `bun run scripts/validate-roadmap.ts` + the manual cross-checks in this file. Companion: [`VALIDATION.md`](VALIDATION.md).

Scope of this audit: after the SPEC.md → one-file-per-task migration (commit `b349dfb`), several legacy patterns surfaced that the new layout makes unnecessary.

**Applied 2026-05-24** — all four fix bundles below were executed in the same pass. Sections retain the original findings; the **Applied** note at the end of each section records what changed.

## TL;DR

- 354 tasks total: 204 todo / 28 doing / 113 done / 9 cancelled. Frontmatter/folder status: clean (0 mismatches). Filename/frontmatter ID drift: clean. Duplicate IDs: none. Validator paths: 67/67 resolve.
- **7 "visibility-mirror" pointer entries** are SPEC.md-era artifacts that the folder-based status makes redundant. `[fix-ready]`
- **Category 04 has PRD ↔ filed-task topic drift**: 04.07 is overloaded; PRD-promised 04.07/04.08/04.09 slots disagree with what was filed. `[needs-decision]`
- **9 doing/ tasks have no implementation started** and should move back to todo/. `[fix-ready]`
- **2 cancelled tasks cite reasons that the codebase contradicts** — supersession trail is missing. `[fix-ready]`
- **04.09.01 (this week's weekly-content-plan) collided** with the PRD-reserved 04.09 slot for NL workspace query. Needs renumber or PRD update. `[needs-decision]`

## 1 — Visibility-mirror pointer entries `[fix-ready]`

Pattern: a "Post-launch" topic in category X re-lists a task whose canonical definition lives in another topic, with a body that says "mirrors / see / owned by Y". This existed so SPEC.md's category-Y "Post-launch" section also showed the work — necessary when SPEC.md was a single flat status board. The new folder layout already shows post-launch tasks via `v1_0: no` + `todo/` placement, so mirrors are pure noise.

| Mirror file | Canonical | Mirror body |
|---|---|---|
| `roadmap/todo/01-11-05-ralphy-mcp-stdio-mcp-server.md` | `01.01.05` | "Full acceptance criteria live in `01.01.05`. This entry exists to keep the v1.0 status board honest." |
| `roadmap/todo/03-07-01-mcp-server.md` | `01.01.05` | "Owned spec-wise by `01.01.05`. See for full criteria." |
| `roadmap/todo/04-07-04-producer-batch-mode.md` | `04.05.01` | "Full acceptance criteria mirror `04.05.01` / `04.05.02`." |
| `roadmap/todo/04-07-05-ralphy-resume-project-id.md` | `04.06.02` | "Full acceptance criteria mirror `04.06.02`." |
| `roadmap/todo/02-09-05-3-slot-reference-grammar-cref-sref-pref.md` | `02.02.01` | "Mirrors original `02.02.01` / `02.02.02`." |
| `roadmap/todo/02-09-04-standalone-templates-gallery-on-landing.md` | `07.07.01` (done) + `07.07.02` (todo) | "Mirrors original `02.07.01` / `02.07.02`." |
| `roadmap/todo/10-07-02-ralphy-iterate-loop.md` | `01.01.04` | "Owned by `01.01.04`." (pure pointer, no criteria) |

**Proposed fix:** delete mirror files. Each canonical task carries the full acceptance criteria and `v1_0` field — folder placement (`todo/`) plus `v1_0: no` already conveys "post-launch". For cross-category coupling that is genuinely useful (e.g. 01.01.05's relationship to 03-skills), keep a one-line cross-reference in the canonical task's body instead of a separate file.

**Applied 2026-05-24:** 7 mirror files deleted. Dangling references to deleted IDs rewritten in:
- `01-01-05` (was: "Tracked under `01.11.05`") → drops the `01.11.05` reference
- `04-05-01` and `04-06-02` (were: "Moves to / Reopen as `04.07.0x`") → "Reopens post-launch"
- `02-05-01`, `02-04-01`, `02-02-03`, `02-02-01`, `02-02-02` (were: "post-launch with/as `02.09.05`") → repointed to canonical `02.02.01`

## 2 — Category 04 PRD ↔ filed-task topic drift `[needs-decision]`

`roadmap/04-user-flow-and-autonomy/PRD.md` declares the post-launch topic layout:

```
04.07 — Voice / image input to chat
04.09 — Natural-language workspace query
```

But filed tasks use 04.07 as a catch-all "post-launch" bucket:

| File | What it actually is | Where PRD would put it |
|---|---|---|
| `04-07-01-voice-image-input-to-chat.md` | voice/image input | 04.07 ✅ matches |
| `04-07-02-cross-session-memory.md` | `ralphy memory` cross-session layer | **v1.0 must-ship per PRD** ("ralphy memory — cross-session memory layer") — not 04.07. |
| `04-07-03-natural-language-workspace-query.md` | NL workspace query | **04.09 per PRD** — currently mis-filed at 04.07. |
| `04-07-04-producer-batch-mode.md` | mirror of `04.05.01` | not a separate task per Section 1 |
| `04-07-05-ralphy-resume-project-id.md` | mirror of `04.06.02` | not a separate task per Section 1 |
| `04-08-*` (5 study tasks, Path-2 research) | research scope | **not in PRD at all** — added later |
| `04-09-01-weekly-content-plan-and-feedback-loop.md` | weekly content plan + engagement loop (filed 2026-05-24) | **collides with PRD-reserved 04.09 = NL workspace query** |

**Proposed fix choices:**

- **Option A — Renumber to match PRD.** Move `04-07-03-natural-language-workspace-query.md` → `04-09-01-natural-language-workspace-query.md` and re-allocate the just-filed weekly-content-plan task to a new topic (e.g. `04.10 — Posting & feedback loop`). PRD gains a 04.10 row. Update D-04 in OPEN-QUESTIONS if needed.
- **Option B — Update PRD to match files.** Renumber PRD post-launch topics: 04.07 = catch-all post-launch (with sub-tasks for memory/NL-query/producer-mirror); 04.08 = Path-2 study; 04.09 = weekly content plan & engagement loop. Drop the "Natural-language workspace query is 04.09" line; move it to a 04.07.NN sub-row.
- **Option C — Status quo + flag.** Leave the numbering as-is, fix only the misplaced `cross-session-memory` v1.0 status, and add an OPEN-QUESTIONS entry noting the PRD/file drift as a known cosmetic issue.

Default if undirected: **Option B** — file-on-disk is canonical; PRDs are summaries.

**Applied 2026-05-24:** Option B. `roadmap/04-user-flow-and-autonomy/PRD.md` post-launch section rewritten to match filed tasks. Topic numbering on disk is authoritative; PRD is now the index. `04.05` (producer mode) and the `ralphy memory` v1.0 promise moved from must-ship → post-launch to match the filed `v1_0: no` of `04.05.01` and `04.07.02`. `04.08` (Path-2 study) and `04.09` (weekly content plan + posting + feedback loop) added to the post-launch table.

## 3 — `doing/` tasks with no implementation started `[fix-ready]`

These should move back to `todo/` until work begins. Marked `doing` was correct under SPEC.md (it conveyed "this is next") but in the new layout `doing/` means "actively in flight, partial code exists".

| Task | Acceptance file/dir cited | Exists? | Status proposed |
|---|---|---|---|
| `05.06.01` ralphy profile export | `cli/commands/profile.ts` | No | todo |
| `05.06.02` ralphy profile import | `cli/commands/profile.ts` | No | todo |
| `06.01.01` consolidate into `cli/lib/recipes/` | `cli/lib/recipes/` | No | todo |
| `08.07.01` assertGreenZone in scoreScenario | `cli/lib/eval/scoreScenario.ts` + `assertGreenZone()` | No | todo |
| `10.01.01` schema documented and committed | `cli/lib/schemas/generation.ts` | No | todo |
| `10.02.02` local-estimate fallback | `cli/lib/pricing/table.ts` | No | todo |
| `02.02.03` super-original master shots auto-passed | `workspace/projects/<id>/master/` flow | No | todo |
| `05.04.01` brand schema | `cli/lib/schemas/brand.ts` | No | todo |
| `05.04.02` persona schema | `cli/lib/schemas/persona.ts` | No | todo |

The remaining 19 doing/ tasks have at least partial implementation (TTY routing for 01.02.01, doctor / status / project show / assets list / pull-pool / catalog verbs all exist and ship a non-trivial subset of the acceptance criteria). Reassessing each for full done is a deeper pass — see Section 5.

**Applied 2026-05-24:** 9 files moved `doing/` → `todo/`, frontmatter `status:` field synced. Post-fix counts: 206 todo / 19 doing / 113 done / 9 cancelled (was 204 / 28 / 113 / 9 before the audit).

## 4 — Cancelled tasks with reasons the codebase contradicts `[fix-ready]`

| Task | Stored reason | Reality |
|---|---|---|
| `02.07.01` Gallery page on landing | "Subsumed by the existing landing showcase marquee. Reopen as `02.09.04` if the catalog grows." | `landing/app/templates/page.tsx` shipped per `07.07.01` (done). The work moved categories, not killed. |
| `02.07.02` Per-template detail page | "Per-template documentation lives in `templates/<cat>/<slug>/README.md` on GitHub; CLI users get `ralphy template show <slug>`." | `07.07.02` (todo) is the active follow-up — a landing detail page, not docs. Reason confuses two surfaces. |

**Proposed fix:** rewrite the **Resolution** block in both files to read "Superseded by `07.07.01` (gallery route) / `07.07.02` (detail page) — work moved from category 02 to category 07 per `D-04` in `02-prompts-and-templates/OPEN-QUESTIONS.md`." Same content as today, but the trail points at the work that actually happened.

**Applied 2026-05-24:** both Resolution blocks rewritten to cite the successor tasks in category 07.

## 5 — Deeper done-audit (not yet performed)

`scripts/validate-roadmap.ts` only checks that cited paths *exist*. It does NOT verify that the cited code still implements the stated acceptance. A behavioural audit would re-read each of the 113 done tasks against `cli/`, `src/`, and tests, and flag any whose acceptance criteria have drifted.

Cost estimate: ~2-3 hours of focused reading. Recommended cadence: once per major release. Not blocking v1.0 — but the next release-runbook PR should add this as a step.

## 6 — Reproducing this audit

```bash
# Structural — duplicate IDs, frontmatter/folder mismatches, validator
bun run scripts/validate-roadmap.ts                            # writes VALIDATION.md
fd '\.md$' roadmap/{todo,doing,done,cancelled} -x basename {} \
  | sort | uniq -c | sort -rn | awk '$1 > 1'                   # duplicate filenames
rg -No '^id:\s+(\d{2}\.\d{2}\.\d{2})' roadmap/{todo,doing,done,cancelled}/*.md -r '$1' \
  | sort | uniq -c | sort -rn | awk '$1 > 1'                   # duplicate IDs

# Mirror entries — bodies that admit they mirror another task
rg -l 'mirrors|see \`\d|owned by \`\d|owned spec-wise' roadmap/{todo,doing,done,cancelled}/*.md

# PRD vs filed-task topic drift — per category
for cat in roadmap/*-*/; do
  echo "=== $cat ==="
  rg -A6 'Post-launch' "$cat/PRD.md"
  find roadmap -name "$(basename $cat | cut -c1-2)-*-*.md" | sort
done
```
