# Open-world mode compiler — provisional modes

> **Status:** shipped. `compileMode()` + the `ProvisionalMode` schema are built and tested (#454). This doc is the behavior contract the agent follows when a brief has no registered content mode.
> **Tracks:** [`../notes/issues/done/454-open-world-mode-compiler-provisional-modes.md`](../notes/issues/done/454-open-world-mode-compiler-provisional-modes.md)
> **Grounded as of:** 2026-06-23 against the live repo.

The fixed content-mode taxonomy (#418, `cli/lib/content-modes.ts`) must not be a ceiling. A brief for a category Ralphy has no registered mode for should degrade into **disciplined discovery**, not generic prompting, silent under-routing, or refusal. That path is the open-world compiler.

Read alongside [`content-modes.md`](content-modes.md) (the registered taxonomy) and [`content-mode-coverage.md`](content-mode-coverage.md) (the supported-route matrix).

## 1. The three statuses

`compileMode(utterance)` (a pure, deterministic wrapper over the existing `classifyContentMode()` — it does NOT change the classifier's signature) returns a `status`:

- **`known`** — a registered mode cleared the confidence floor. Route it normally (respect `isModeSupported()` per #413 before promising it).
- **`ambiguous`** — registered modes scored but the agent must disambiguate (a tie / a boundary top with a contender). Ask exactly one disambiguating question.
- **`unknown`** — nothing meaningful scored, or the best mode is below the known floor. This is the open-world path: the result carries `mode: null`, `supported: false`, and a `closestFormat` — the inferred MEDIA CONTAINER (`video | image | carousel | motion-design | audio | poster | unknown`), explicitly NOT a content-mode claim (acceptance #2).

## 2. Closest-format fallback

For `unknown`, `inferClosestFormat()` reads deterministic container cues (most-specific-first: carousel > motion-design > audio > poster > video > image) and returns the rough container to discover into, or `unknown` when even the container is unclear. The agent learns "this probably ships as audio," not "this is mode X."

## 3. The provisional-mode profile

When status is `unknown`, the agent drafts a `ProvisionalMode` (`cli/lib/schemas/provisional-mode.ts`) rather than refusing. `buildProvisionalMode(brief)` seeds a deterministic, schema-valid skeleton — closest format, weakly-matched modes as `couldMapTo` candidates, generic unfamiliar-mode assumptions + risks, format-derived quality gates and a suggested model stack (advisory; reconfirm against `MODELS.md`), and the stricter checkpoint cadence. The agent then researches the niche, asks only high-leverage questions, and fills it.

**The load-bearing rule (acceptance):** a provisional mode IS allowed to produce content; it is NOT allowed to pretend it has the support level of a tested, registered mode. `supportLevel` is the literal `"provisional"` — it can never be upgraded in place; promotion is a separate proposal (§5).

## 4. Stricter checkpoints (acceptance #5)

An unfamiliar mode has no benchmark to gate against, so it runs with extra blocking approvals. `buildProvisionalMode` always seeds three, all `blocking: true`:

1. **`profile-approval`** — present the drafted profile (inferred audience, format, assumptions, refs, risks, model stack) and wait for the user to confirm or correct it.
2. **`pre-paid-gen`** — after research + refs are in, STOP for explicit approval before the first paid generation. Never auto-run a batch on an unfamiliar mode.
3. **`first-output-review`** — generate ONE sample, present it, and wait before fanning out.

This composes with the existing reference gate (AGENTS.md #3) and research-first default (#416) — the provisional path is strictly tighter, never looser.

## 5. Promotion path (acceptance #6)

After a successful provisional run, the agent produces a promotion proposal — one of:

- **keep-provisional** — a one-off; leave it provisional.
- **map-to-existing** — it really was a registered mode (likely one of `couldMapTo`); route future briefs there.
- **create-new** — a recurring category worth a registered mode; file a `notes/issues/` entry to add it to `cli/lib/content-modes.ts` with its role chain, gates, and unit shape.

Promotion is never automatic — adding a supported route is a maintainer decision (the same review-gate discipline as the knowledge flywheel, #459).

## 6. What this does NOT do

- It does not call an LLM or the network — `compileMode` / `buildProvisionalMode` are deterministic skeletons. The research + fill steps are the agent's job, through the existing research surfaces.
- It does not register a CLI verb — the compiler is a library the intake / routing layer calls. (Whether `AGENTS.md` routing should name the open-world path explicitly is a separate doc-routing decision.)
- It does not relax any gate. Unknown means *more* checkpoints, never fewer.
