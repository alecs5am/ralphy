# Distribution & publishing factory — design

> **Status:** packaging phase shipped on top of `ralphy unit package` (#423). Direct platform API upload is deliberately NOT built (manual-package-first).
> **Tracks:** [`../../notes/issues/done/458-distribution-and-publishing-factory.md`](../../notes/issues/done/458-distribution-and-publishing-factory.md) (moves to `notes/issues/done/` on close)
> **Grounded as of:** 2026-06-23 against the live repo. Path/primitive citations below were verified to exist at that time.

Read [`../../CLAUDE.md`](../../CLAUDE.md) (the `.ralphy/` layout, the Unit model) and [`../../AGENTS.md`](../../AGENTS.md) (invariant #14 append-only, the FORM/PUBLISH-A-UNIT route) for the surrounding context. This doc covers the **distribution/publishing phase**: turning a finished Unit into a platform-ready, single-file handoff.

---

## 1. Goal & non-goals

### Goal

Make distribution a first-class production phase, not a manual last mile. Every shippable Unit produces a `distribution-pack.json` carrying per-platform copy, per-channel spec/safe-area validation, a thumbnail pick, the copied deliverables bundle, and a single `<slug>-distribution.zip` a user can hand to a buyer or upload by hand — gated on the readiness scorecard so we never call an unverified render "shippable".

### Non-goals

- **No new direct platform integration in this phase.** Token custody, per-platform ToS, and takedown risk remain separate connector concerns.
- **No new caption/hashtag logic.** Copy is the unit's `UnitCaption` (#403), reused verbatim; the pack never re-derives it.
- **No new media probing / spec table.** Channel specs are the #443 platform validator's; the pack consumes its verdict, it does not own a parallel spec table.
- **No scheduler, performance import, or team-review workflow.** Listed as later extensions in the issue; not built.

---

## 2. The phase, as it now stands

`ralphy unit package <project> <slug>` is the whole phase. It is a pure assemble + COPY + write, with the heavy lifting in two libraries:

1. **`cli/lib/distribution.ts → buildDistributionPack()`** — the read + assemble half. Reads `units/<slug>/unit.json`, reuses the unit caption (drafts one only when absent, via an injectable draft fn — no live LLM in tests), shapes a per-platform `PlatformSection`, wires in the #443 validator, reads the #427 scorecard, and returns a schema-valid `DistributionPack`. Never touches disk beyond reads.
2. **`cli/commands/unit.ts → package`** — the write half. COPIES the selected deliverables into `units/<slug>/distribution/`, writes the pack JSON + `DISTRIBUTION.md` handoff, and ZIPs the bundle. Every write is append-only (auto-versions a prior, never overwrites).

What lands on disk, beside `unit.json`:

| Artifact | Owner | Note |
|---|---|---|
| `distribution-pack.json` | command | The machine-readable pack (schema below). Auto-versions on `--force`. |
| `DISTRIBUTION.md` | command | The readable handoff (per-platform copy + spec + export reqs). |
| `distribution/` | command | COPIES of the curated deliverables (sources untouched). |
| `<slug>-distribution.zip` | command | The single-file bundle: the copied media under `distribution/` + the pack JSON + the handoff at the root. |

---

## 3. The schema (`cli/lib/schemas/distribution-pack.ts`)

Additive over #423 (the schema documents "Append, never repurpose" — these fields were appended, nothing was repurposed).

- **`PlatformSection`** gained, per platform: `specStatus` (`pass|warn|fail|na` from #443), `specNotes[]` (concrete fix hints), `outputFilenames[]` (the deliverables THIS platform posts — kind-filtered, §4), and `exportRequirements[]` (the channel's hard spec as readable strings).
- **Top-level `DistributionPack`** gained: `readiness` (a `DistributionReadiness` block sourced verbatim from the scorecard), `shippable` (the gated boolean, §5), and `archive` (the unit-relative ZIP path).
- **Helpers:** `profileKeyFor(platform)` maps the pack's publish-copy taxonomy (`meta`, `app-store`) onto the validator's richer spec taxonomy (`meta-ad`, `app-store-screenshot`); `distributionZipName(slug)` is the ZIP basename.

`platformsForFormat(format)` (unchanged from #423) still decides WHICH platforms a format distributes to (video → tiktok/reels/shorts, fb-creative → meta, carousel → tiktok/reels, image → reels/meta/app-store).

---

## 4. Channel profiles wired in (#443)

The pack validates each target platform against ONLY its kind-matching media, one platform at a time, merging the per-platform reports (`validatePerPlatform` in `cli/lib/distribution.ts`). The rule that makes this honest: a video platform spec-checks the video and ignores a still cover (a thumbnail is not an upload); an image platform checks the stills. A platform with no media of its kind yields an `na` section — the copy still ships, there is just nothing to spec.

The validator (`cli/lib/eval/platform.ts → validatePlatformSpec`) is unchanged and reused as-is: deterministic, with an INJECTABLE media probe (default ffprobe + image-size) so fixtures never spawn ffprobe. A hard violation (wrong aspect / resolution / duration / codec / file-size) is a `fail`; a tight safe-area or missing metadata is a `warn`.

---

## 5. Readiness gate (#427)

The pack is `shippable` only when the #427 scorecard verdict is `ship` **or** the user explicitly bypasses it. `buildScorecard()` is a pure best-effort file read (zero model calls); a read failure degrades to a non-`ship` verdict rather than throwing, so the bundle still assembles but is flagged not-yet-shippable. `--bypass-readiness "<reason>"` marks it shippable despite a `repair` / `needs-user-decision` / `blocked` verdict and records the reason to the append-only `user-prompts.jsonl` (`stage: "bypass-readiness"`), mirroring the `unit create --force-polished` escape hatch. The pack always carries the verdict + reason so the agent can surface why it is or is not shippable.

This is the same discipline as AGENTS.md invariant #4 (gates refuse, not warn): the user bypass is the explicit override, logged, never silent.

---

## 6. The ZIP (#458 #3)

The bundle is zipped in-process with **`adm-zip`** — the read/write zip library already in the dependency tree (pulled in by the direct `hyperframes` dependency; pinned in `bun.lock`). No new npm dependency, and no shelling to a system `zip` binary (which the codebase otherwise reaches for in `cli/lib/unpack-zip.ts` for the READ path; the WRITE path uses the library so it works regardless of the host's `zip`). A minimal ambient declaration lives at `cli/types/adm-zip.d.ts` (no `@types/adm-zip` is published). The ZIP auto-versions like every other pack artifact (`<slug>-distribution.v2.zip`), never overwriting a prior.

---

## 7. Already satisfied by #423 (confirmed, not re-added)

- **#458 #4 — social-copy integration.** `buildDistributionPack` reuses `manifest.caption` (the #403 `UnitCaption`) verbatim and only drafts via the injectable `buildUnitCaption` fallback when the unit has none. No caption/hashtag logic is duplicated.
- **#458 #6 — manual-first publishing.** The deliverable is a packaged handoff (JSON + Markdown + media + ZIP). There is no platform API client, by design (§1 non-goals).

---

## 8. Honest gaps

- **No direct platform upload.** Deliberate (§1). The pack is the upload-ready input; the upload is the user's (or a future, consent-gated, per-account service's).
- **Generated-docs depth.** The in-repo `docs/cli-surface.generated.md` captures the `package` subcommand description, not every nested option. `--bypass-readiness` / `--force` remain discoverable through `ralphy unit package --help`; public reference pages are maintained in `ralphy-docs`.
- **Safe-area is a declared geometric check, not a vision read.** The #443 validator compares a DECLARED safe inset to the platform chrome; it does not look at pixels. A future vision pass would close this.
- **No scheduler / performance import / team review.** Later extensions per the issue; out of scope.

---

## What this does NOT decide

Direct-upload auth, platform token custody, and any unattended scheduler are deferred. The commitment of this phase is a correct, validated, readiness-gated, single-file package.
