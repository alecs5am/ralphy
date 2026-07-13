# Knowledge flywheel — the route map

> **Status:** route map over surfaces that mostly already exist. This doc ROUTES between the memory, guideline, MODELS.md, template, Unit, library, benchmark, skill, content-mode, and notes-issue surfaces — it does not build new ones. Where a route is still manual or unbuilt, §8 names it honestly.
> **Tracks:** [`../../notes/issues/done/459-library-and-knowledge-flywheel.md`](../../notes/issues/done/459-library-and-knowledge-flywheel.md)
> **Grounded as of:** 2026-06-23 against the live repo. Every code/path citation below was verified to exist (or noted as absent/manual) at that time.

Read [`../../CLAUDE.md`](../../CLAUDE.md) (the `.ralphy/` layout + the five-entity content model), [`../../AGENTS.md`](../../AGENTS.md) (invariant #18 auto-capture memory, #14 append-only), and [`../skills-vs-templates.md`](../skills-vs-templates.md) (Unit / Template / Style / Recipe / Asset) for the surrounding context. The content factory compounds only if production output becomes reusable input; otherwise every agent starts from scratch and every postmortem lesson decays. This doc is the deliberate route from output back to input.

---

## 1. Route map — where each kind of lesson belongs

Every durable thing a project produces is one of a small set of KINDS, and each kind has exactly one home surface. Sending a lesson to the wrong surface is the failure this map prevents: a craft trick buried in a postmortem never reaches the pipeline, and a one-project quirk written into a guideline poisons every future run.

| Lesson kind | Surface | Verb / path | Why this home |
|---|---|---|---|
| Durable preference (user style / register / pacing) | **memory** | `ralphy memory note` (AGENTS.md #18) | Cross-project, agent-facing recall; tiered global vs `--workspace`. |
| Failure rule (what to avoid, with negative scope) | **memory** (or guideline if prompt-shaped) | `ralphy lessons route` → `ralphy memory note` | A rule with `appliesWhen` + `doesNotApplyTo`; recalled before acting. |
| Prompt-craft (how to prompt a register: skin pores, anti-slop, six-token spine) | **guideline** | [`guidelines/<slug>/`](../../guidelines/) + `ralphy guideline show` | Folded into the `ralphy generate` prompt for a covered register (AGENTS.md #13). |
| Repeatable structure (beat skeleton, slot layout) | **template** | public library or `.ralphy/workspaces/<ws>/templates/<slug>/` | The unit of reusable content know-how, matched by `ralphy template suggest`. |
| Look / aesthetic | **Style tag + Asset blocks** | anchor images as Assets + a `tags[]` facet | "Style" demoted to a Unit tag (#082); the look = its anchor Assets. |
| Effect / treatment (ffmpeg filtergraph, HF snippet, encode recipe, prompt technique) | **Recipe block** | publish via templater → `publish-entity.ts --block` | Only when it carries an extractable artifact; else it is a Tag (recipe-vs-tag #082/#083). |
| Finished example | **Unit** | `<project>/units/<slug>/` (#069) | The shipped deliverable + provenance; the `produced` end of a Template. |
| Reusable public building block | **library entity** | companion [`ralphy-web`](https://github.com/alecs5am/ralphy-web) repository | Discoverable by id across users. |
| Model warning / tried-and-dropped | **MODELS.md** | `MODELS.md` "Tried-and-dropped" (append-only) | The next agent trying the same swap reads it first; never deleted (`developing-ralphy.md`). |
| Content-mode rule (a per-mode route / gate / research-depth tweak) | **content-mode registry** | [`../../cli/lib/content-modes.ts`](../../cli/lib/content-modes.ts) | The mode sits above format; a rule that changes a route belongs to its mode. |
| CLI bug / missing verb | **notes-issue** | [`../../notes/issues/`](../../notes/issues/) | The live backlog `/dev-loop` executes; never improvise around a gap silently. |
| Transient / environment-dependent / over-narrow | **dropped** | (no write) | A retry-solved error or a missing-key failure hardens into stale refusals if kept (AGENTS.md #18). |

---

## 2. Promotion workflow — output becomes reusable input

A successful project flows up a four-rung ladder. Each rung is an existing verb; the agent climbs only as far as the lesson's reuse value justifies.

1. **Finished project → local Unit.** A render that passed the native-video final gate (`ralphy project status <id> --contract` → `polished === true`) is curated into `<project>/units/<slug>/` via `ralphy unit create` (#069) — COPIES of chosen `artifacts/` + a `unit.json` carrying ordered media + provenance (template / style / recipe / asset ids, #420). Append-only; a re-`create` writes `.v2`.
2. **Local Unit → workspace template.** When a Unit's *structure* is worth reusing within the studio, `ralphy template extract` promotes it into `.ralphy/workspaces/<ws>/templates/<slug>/` — user-local, gitignored, immediately matchable by `ralphy template suggest`.
3. **Workspace template / Unit → public library entity.** The [`templater`](../../.agents/skills/templater/SKILL.md) skill reads the project's `units/*/unit.json`, decomposes it into Unit + reusable Blocks, de-dups each candidate against the live library, then prints the ordered publish runbook. The companion `ralphy-web` publisher pushes media to Bunny CDN and updates its committed `library.json`.
4. **Library entity → benchmark.** A published Unit that exemplifies (or violates) a mode's quality bar is filed into a golden benchmark set (#419) — `ralphy benchmark show <slug>` surfaces good / acceptable / bad examples per content-mode + format ([`../../cli/lib/schemas/benchmark.ts`](../../cli/lib/schemas/benchmark.ts)); eval and council passes cite it so critique is grounded.

The reverse edges already exist for free: a published Template fans out `1 → N` Units through the farm by id ([`../skills-vs-templates.md`](../skills-vs-templates.md) cardinality), and `unitsUsing("template", id)` resolves Template → its Units.

---

## 3. Failure workflow — repeated failures propose surface updates

The lesson source is the [`postmortem`](../../.agents/skills/postmortem/SKILL.md) skill (chronological history + lessons + CLI-bug list + model/cost rollup) plus eval reports, repair plans, and council reports. The router that turns those into routed proposals is the **failure-lessons-router (#425), and it is BUILT**: `ralphy lessons route <project> [--dry-run]` ([`../../cli/commands/lessons.ts`](../../cli/commands/lessons.ts), [`../../cli/lib/lessons/router.ts`](../../cli/lib/lessons/router.ts)).

- **Input:** postmortem files, eval reports, repair plans, council reports, generation failure logs.
- **Output:** proposals, each tagged with the §1 route enum — `memory | guideline | MODELS.md | content-mode | template | skill | cli-issue | drop`.
- **Provenance is mandatory:** every proposal points back at the source project + source section.
- **Negative scope is mandatory on `memory` and `guideline` proposals** (`appliesWhen` + `doesNotApplyTo`, the #045 discipline) — the load-bearing line that stops a one-project quirk from over-applying.
- **Prefer updating an existing entry over a near-duplicate sibling** — re-note the survivor slug, versioning up (AGENTS.md #18).
- Only the `memory` route may stage automatically, into the `proposed/` tier ([`../../cli/lib/memory/store.ts`](../../cli/lib/memory/store.ts) `writeEntry`, status `proposed`); every other route emits a proposal a human enacts (§7).

The lighter per-session path is `ralphy memory distill <project>` (#113), which routes postmortem lessons to memory/guideline and stages the memory ones into `proposed/`. The router widens that to the full 8-way enum.

---

## 4. Library seed pass

The mode system needs real examples, and benchmark sets need material. The **seed-Units pass (#447, #447) is still OPEN**: it packages 10-15 internal deliverables across video / image-pack / carousel / poster / motion-design into Units with clean `unit.json` provenance, thumbnails, previews, and mode metadata, validates each through the relevant readiness scorecard, and publishes/stages them through the same templater → `publish-entity.ts` path as §2 (no special seed path). Seed Units double as benchmark material — they feed the #419 golden sets (built, §2 rung 4) and the issue must document which modes still lack a seed example. This is the manual bootstrap that primes the flywheel before organic production fills it.

---

## 5. Library QA — entities safe as execution input

The library is execution input, not just a gallery card: a broken media URL or unresolved provenance id can misroute an agent or make a Unit unreproducible. Library schema and media QA are therefore owned and run by the companion `ralphy-web` repository before its committed `library.json` is published.

---

The trust boundary is the only difference: auth + `ownerId`, a moderation gate, a state machine, quotas, and a real backend write target (untrusted bytes never enter git). See that doc's §9 for the maintainer-vs-community trust contrast and §10 for the backend prerequisite.

---

## 7. Review gates — no auto-learning into public guidance

The hard rule: **nothing auto-promotes into PUBLIC, agent-facing guidance without maintainer or user review.** The flywheel proposes; a human approves.

- **memory** is the one surface with an automatic staging tier — and even there, proposals land in `proposed/` and require an explicit `ralphy memory approve <slug>` to move into the active tier ([`../../cli/lib/memory/store.ts`](../../cli/lib/memory/store.ts) `approveEntry`). The auto-capture exception (#18 write-and-tell) is scoped to in-session corrections the agent already confirmed, never to bulk distill output.
- **guideline / MODELS.md / template / content-mode / skill** proposals from the router are reports only — a maintainer enacts them by hand. The router NEVER writes these (`router.ts` stages only `memory`).
- **library publish** is a deliberate human `--push` step (#056), and a community upload reaches `public` only through `in_review` + a moderator approve (§6).
- **benchmark** sets ship in the repo and change by commit (reviewed).

This is the same defect-class boundary as the append-only contract (AGENTS.md #14): the system never silently rewrites the knowledge a future agent will trust.

---

## 8. Honest gaps — wired vs. still manual

| Route / rung | Status |
|---|---|
| Project → local Unit (`ralphy unit`) | **Wired** (#069). |
| Local Unit → workspace template (`ralphy template extract`) | **Wired**. |
| Templater extract/classify/de-dup | **Wired** (skill + `publish-entity.ts` validators). |
| Library publish (`publish-entity.ts --push`) | **Wired**, but a manual maintainer step by design (#056). |
| Unit → benchmark set (#419) | **Wired** (`ralphy benchmark`); FILLING the sets is manual. |
| Failure-lessons-router (`ralphy lessons route`, #425) | **Wired** — proposals only; enacting non-memory routes is manual. |
| Memory propose → approve | **Wired** (`proposed/` tier + `ralphy memory approve`). |
| Library QA (#448) | **Owned by `ralphy-web`** and run in that repository's CI. |
| Guideline coverage (#417) | **Surface wired** (`guidelines/` + `ralphy guideline`); breadth is an ongoing manual pass. |
| Library seed Units (#447) | **NOT done** — open issue; the manual bootstrap pass. |
| Community uploads (#067) | **Design-only** — no backend, no auth, no write API yet. |
| Auto-enacting router proposals into guideline/MODELS.md/template | **Intentionally NOT built** — review-gated by §7; stays manual forever for public surfaces. |

---

## What this does NOT decide

Whether the seed pass (#447) targets the public library or workspace-local first; the exact moderation split for community uploads (#067 §11); how aggressively the router should auto-stage vs. report; and the breadth of guideline coverage (#417). All deferred to their tracking issues. The only commitment here is the route map (§1) and the rule that public, agent-facing guidance is never auto-written (§7).
