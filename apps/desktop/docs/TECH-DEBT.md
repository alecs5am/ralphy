# Technical debt: what is real, what is partial, what is a placeholder

The app is a complete instrument over an incomplete contract. Most screens are finished; what
they can *do* is bounded by the Core bridge, and in several places by wiring that was never
finished on this side. This document says which is which, so nobody has to rediscover it by
clicking.

Written 2026-08-27 against `9c3e2ad`. It is a map of gaps, not a plan — the ordering at the end is
a recommendation.

## How to read this

| Status | Means |
|---|---|
| **Real** | Reads or writes the domain store, and the result survives a restart. |
| **Partial** | Works for some of what the screen offers; the rest is stated as unavailable. |
| **Not wired** | The Core contract has the method. The Desktop never calls it. |
| **No contract** | Core exposes nothing for it. The screen says so, in place, with the reason. |
| **Placeholder** | Renders a value that looks measured and is a constant. The worst kind. |
| **Mock only** | Exists in the mock bridge, refuses in the real one, or the reverse. |

The app is deliberate about the fourth row: an `Availability<T>` is `ready` or it carries a
`reason`, and a count that no source returned reads `—` rather than `0`. That honesty is a feature
and should survive every fix below. Items marked **Placeholder** are the ones that break it.

## 1. Contract coverage

The bridge contract (`electron/ralphy/types.ts`) declares **125 methods**. The Desktop calls
**61**. The 64 it never calls are not evenly spread — they are almost exactly the write side:

| Group | Never called |
|---|---|
| Creation | `generation.start`, `unit.create`, `document.create`, `project.iteration.create`, `document.bind` |
| Project writes | `project.show`, `project.update`, `project.status`, `project.iteration.list` |
| Workspace writes | `workspace.show`, `workspace.update`, `workspace.account.list`, `workspace.account.upsert`, `workspace.export`, `workspace.import` |
| Publishing | all seven `publication.*` |
| Review | `feedback.list`, `feedback.add`, `feedback.resolve`, `media.review`, `evaluation.create`, `evaluation.show` |
| Metrics | `metric.list`, `metric.totals` |
| Runs | `run.list`, `run.objects`, `run.results`, `run.cancel` |
| Campaigns | all three `campaign.*` |
| Agent | all nine `agent.*` except `agent.credential.set` |
| Sessions | all four `session.*`, all three `consumer.*` |
| Media pipeline | `transcription.start`, `transform.start`, `repair.start`, `operation.find` |
| Other | `calendar.list`, `calendar.update`, `presentation.items`, `presentation.captions`, `document.revisions`, `migration.desktop.import` |

What the Desktop *can* write, in full: `document.revise`, `composition.revise`,
`composition.build`, `composition.select`, `media.select`, `unit.select`, `memory.create`,
`memory.revise`, the three memory lifecycle actions, the five calendar actions, and
`agent.credential.set` (used only to store a Postiz key).

**Consequence: nothing can be created from the app.** No project, no unit, no document, no
generation, no iteration. The only two "new" affordances in the whole UI are *New chat* (a local
agent conversation, not a domain entity) and *New memory*. Everything else in the library has to
be created by the CLI, and the Desktop is a reader with a revision editor attached.

This is the single largest gap. Every item below is smaller than this one.

## 2. Settings persists but does not act

**Status: Placeholder**, and the most misleading surface in the app.

`src/pages/settings/lib/preferences.ts` declares 38 preferences. They validate, they persist to
`localStorage` under `ralphy.settings.v1`, and a rejected write is reported and retryable — the
write path is genuinely well built. **Not one of the 38 is read anywhere outside the Settings
screen.**

Verified: every key in `APP_PREFERENCE_DEFAULTS` has zero consumers in `src/` or `electron/`
outside `src/pages/settings/`. So the operator sets *Interface density*, *Media grid columns*,
*Interface motion*, *Send shortcut in agent chat*, *Default harness for new chats*, *Approval
posture*, *Network requests*, *Scrollback*, *Update channel* — and none of it changes anything.

The two exceptions, which do work:

- **Appearance → theme** goes through `ctx.onThemeChange` and reaches
  `applyNativeAppearance`. Real.
- **Keyboard shortcuts** are real: `use-app-commands.ts` and `use-view-tabs.ts` both call
  `readCommandBindings(localStorage)`, so a rebound chord takes effect immediately, and the
  conflict editor is honest about scopes.

Controls that are permanently `disabled`, each with copy explaining why:

| Where | Control |
|---|---|
| `pages-providers.tsx:67` | Connect provider |
| `pages-providers.tsx:103` | Disconnect credential |
| `pages-permissions.tsx:72` | Open System Settings |
| `pages-personal.tsx:129` | Reveal the library folder |
| `pages-personal.tsx:166` | Avatar → Choose file |
| `pages-diagnostics.tsx:124` | Reveal logs |

**Updates page**: the download runs a local `setInterval` and reports fake progress. It is marked
`// ponytail:` at `pages-diagnostics.tsx:137` and walks the states a real updater would report,
but there is no updater contract, no update channel, and nothing is downloaded.

**Diagnostics**: real. The checks read live state — library path, harness rows, microphone and
notification permission — and *Copy redacted summary* works. Only *Reveal logs* is dead.

The cheapest honest fix is to make the 36 inert rows read as unavailable, the way the rest of the
app does, rather than as settings that were accepted. The better fix is to wire the six or seven
that are one hook away (density, media columns, motion, send shortcut, default harness).

## 3. Reviews never reach Core

**Status: Partial / not wired.**

`media.review` is never called. Review status, favourite, rating, tags and notes are written by
`electron/media/annotations.ts` to `~/.ralphy/media-library/library.json` — a Desktop-local
sidecar next to the store, not in it.

So a review made in the app is invisible to the CLI, to any other client, and to any workspace
export. `feedback.add` / `feedback.list` / `feedback.resolve` and `evaluation.create` are also
never called, so the whole feedback loop the contract offers is unused. The project route reports
`"Project review totals are unavailable from the current Desktop contract."` — accurate, and it is
this gap it is describing.

## 4. Shared Library: read-only, and all six workflows refuse

**Status: No contract**, stated in place.

Real: the artifact page, the revision list, revision selection, previews, *Open* and *Reveal in
Finder* (`SharedLibraryAction` is exactly `"open" | "finder"`).

Every workflow the toolbar offers — **add, promote, duplicate, suggestions, archive,
update-review** — carries one reason: *"This workflow cannot persist because the current Core
version exposes no Shared Library mutation contract."* The forms are complete, including all 17
artifact roles; the submit does nothing.

Metadata suggestions additionally report *"Core exposes no suggestion evidence."*

## 5. Marketplace: half the catalog has no contract

**Status: mixed, and the most explicitly documented area in the app.**

Real: models (Hugging Face, Civitai, ModelScope, plus the bundled catalog), templates, recipes,
the public library with an offline cache, installed-model discovery through the local Ollama HTTP
API, and pack installs.

No contract, each with its own reasoned screen in `MarketplaceUnavailableViews.tsx`:

| Route | Reason |
|---|---|
| Prompts | no Prompt catalog contract |
| Components & Effects | no Component catalog or manifest contract |
| Skills | no Skill catalog, manifest, or install contract |
| Community collections | no source-backed membership contract |
| Creator profiles | no identity or published-item contract |
| Publishing | no registry, upload, update, deprecation or takedown contract |

**My Library**: 1 of 6 sections is real. *Installed* lists local Ollama models and installed
pack items. The other five are unavailable: *Downloads* (no persistent background-download
contract), *Saved* (no saved-state or fork-state contract), *Added* (no workspace/project addition
contract), *Updates* (no installed-version or local-modification contract, so neither the update
target nor its resolution can be named) and *Needs attention* (no attention-state contract).

Using anything from the Marketplace also needs target enumeration and attachment contracts that
do not exist — so a found item cannot be pointed at a chat, a project or an agent.

## 6. Publishing and Calendar

**Status: Partial.**

Real, through `calendar.overview` and the five `calendar.*` actions: the month, week and agenda
views; the two-step schedule dialog with per-platform settings for Instagram, YouTube, TikTok
and X; drag a ready unit onto a day; submit, reschedule, remove, retry.

Not wired: all seven `publication.*` methods. So the app schedules through the calendar's own
actions and never reads or drives a publication directly — reconciliation, recovery, refresh,
cancel and lookup are all unavailable from the app, and a stuck publication has to be handled by
the CLI.

Reconnecting an account works, but goes through `agent.credential.set` with
`provider: "postiz"` — a calendar account borrows the agent credential channel because there is
no account credential contract. `workspace.account.list` / `workspace.account.upsert` are never
called.

Per-account metrics report *"Account metrics are not available from the current Core contract."*

## 7. Metrics are bounded and mostly absent

**Status: Partial by contract, and correctly stated.**

`metric.totals` and `metric.list` are never called; the workspace overview reads what
`workspace.overview` returns. In practice that means Publications has a number and Views, Watch
time, Likes, Comments and Shares read `—`, with *"Comparable reporting windows and trend points
are not available from Core yet."* under them.

Attention is scoped to the returned pages: *"Attention is limited to the returned account and
publication pages."* Plan coverage and ready-unscheduled counts fall back to
*"unavailable because Units were not returned by Core."*

This one is working as designed. It is listed so nobody reads the dashes as a bug.

## 8. Agent chat

**Status: Real, on this side.**

The agent turns do **not** go through the Core bridge — all nine `agent.turn.*` and `agent.auth.*`
methods are unused. The Desktop runs the harnesses itself: `electron/claude/session.ts` drives the
Claude Code CLI, `electron/agent/codex-session.ts` drives the Codex CLI app-server, and
OpenRouter is routed through the Codex binary with a key from an encrypted store in `userData`.

That is a deliberate architecture, not debt — but it means:

- Everything depends on a CLI being installed on the machine. On a fresh Mac the provider rows
  report *"Codex CLI not found"* or *"login required"*, and the chat, the Context page and the
  agent rail all say so instead of pretending.
- Credentials live in Desktop `userData`, not in the library's `secrets.enc`, so they do not
  travel with a workspace and the CLI cannot see them.
- The Context page is exemplary and worth protecting: it shows the measured per-turn input total,
  states that per-layer attribution is not reported by any provider, and gives each layer the
  bytes it measured on disk rather than a token count invented from them.

Known unfinished chat work, from the backlog rather than the code: the composer's token counter
and breakdown popover, the provider segmented switch in the page header, the always-include
toggle, and the live per-turn figure on the sidebar Context row.

## 9. Placeholders that look like measurements

Three progress bars render a constant width from `src/app/styles/theme/project.css`:

| Token | Value | Where |
|---|---|---|
| `--spacing-progress-agent` | 58% | `UnitViewer.tsx:225` — the agent bar on a unit that is *In progress* |
| `--spacing-progress-render` | 62% | `UnitsPanel.tsx:125` — the render bar on a unit card |
| `--spacing-social-progress` | 31% | `UnitSocialPreview.tsx:121` — the scrubber inside the platform mockup |

The third is defensible: it is part of an illustration of someone else's player, and it is
`aria-hidden`. The first two are not. They sit on a real unit in a real state and read as
progress. Either the run reports a fraction — `run.show` and `run.attempts` are both already
called — or the bar should be indeterminate.

## 10. Mock bridge coverage

The mock bridge (`src/shared/api/mock-bridge.ts` and its three siblings) is what the design
harnesses, the tests and `VITE_RALPHY_MOCK_BRIDGE_ONLY` builds see. Its rule is to refuse rather
than invent, which is right, and it refuses **21 distinct groups** of call, including: the project
domain reader, the unit reader and preview, the composition reader and builds, calendar mutations
and previews, Shared Library artifacts, actions and mutations, memory mutations, local model
details, marketplace public catalog, and installs.

Two answer in full: the project route (because the view panel opens a project tab whenever the
route lands on one, so a refusal there is a whole tab that cannot draw) and the agent providers
(so Settings can be driven end to end without a CLI).

Practical effect: a mock-only build is good for layout, chrome and empty states, and cannot be
used to review the project workbench's data paths or anything a mutation returns.

## 11. Migration state

`electron/migration-recovery.ts` shows a recovery screen when Core answers
`E_MIGRATION_INCOMPLETE`. This is live, not hypothetical: the domain-store migration is a real
phase in a real library, and `migration.desktop.import` is never called, so the app can report the
condition and hand the operator a redacted recovery command but cannot complete or recover a
migration itself.

Two facts worth writing down, because they cost time to rediscover:

- Core opens `ralphy.db` **read-only** for identity (`cli/lib/context.ts` → `identifyDataRoot`).
  A store left in WAL mode without its `-shm` file cannot be opened read-only, and the failure
  surfaces as `E_MIGRATION_INCOMPLETE` rather than as an open error — the catch-all in
  `resolveCommandContext` swallows the cause. A library copied for distribution has to be
  checkpointed out of WAL first.
- An empty workspace-scope listing means `project_id IS NULL`, not missing data. Units belong to
  projects, so a workspace with 18 units reports 0 at workspace scope. The sidebar counts are
  correct; they are just answering a narrower question than they look like they are.

## 12. Smaller items

- **View panel browser** — real. An Electron `<webview>` guest with its own process, gated in
  `electron/ipc-security.ts`. Not debt.
- **Local models** — real discovery through Ollama's HTTP API, plus Python and disk checks.
  `openLocalModelProvider` is a no-op in the mock bridge only.
- **Dynamic island** — the live feed is real. A second, mock feed loads on demand **only** in a
  mock build and **only** for a workspace named `UX Testing Lab` (`use-island-feed.ts`). Worth
  knowing before wondering why the island is livelier in one workspace.
- **`onToggleRightPanel`** in the mock bridge returns a no-op unsubscribe: the mock never emits
  the event, so the shortcut does nothing in a mock build.
- **Auxiliary sidebar under the chat lens** — `ContextSidebar.tsx:42` records that the navigation
  is supposed to move to an auxiliary sidebar *"the handoff has yet to specify"*. Unspecified, not
  broken.

## What to fix first

Ordered by how much the app gains per unit of work, not by size.

1. **Make Settings honest.** 36 rows accept a choice and do nothing. Either wire them or mark
   them unavailable. This is a one-day change and it removes the app's biggest lie.
2. **Kill the two fake progress bars.** `run.show` and `run.attempts` are already called; use a
   real fraction or an indeterminate bar.
3. **Wire the six settings that are one hook away** — density, media columns, motion, send
   shortcut, default harness, approval posture. Each already has a consumer that hard-codes what
   the preference should be choosing.
4. **Send reviews to Core.** `media.review` exists; the sidecar JSON should become a cache, not
   the record. This is the difference between the app's review work being real and being local.
5. **Open one creation path.** `generation.start` and `unit.create` would turn the app from a
   reader into a tool. Pick one route and finish it end to end rather than adding buttons across
   several.
6. **`publication.*`.** A stuck publication currently needs the CLI, which means the calendar is
   only trustworthy while nothing goes wrong.
7. Leave the six no-contract Marketplace routes alone until Core has the contracts. They are
   already the clearest statements of what is missing anywhere in the product.
