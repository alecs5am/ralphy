# Project Workbench Core Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Document search literal and safe, give Desktop bounded media
facets, and expose newest-first cursor pages plus scoped Unit selection needed
by the Project workbench.

**Architecture:** Keep SQLite authoritative and extend the existing bridge v1/Core contract-major 2 surface additively. Document search quotes one bounded literal FTS phrase at the shared store boundary. Media classification is calculated in the scoped identity query, reused by card projection, and follows the existing exact producer resolver including same-Run succeeded Build results; Desktop performs no page-local filtering or provenance fan-out.

**Tech Stack:** Bun, TypeScript, `bun:sqlite`, existing bridge/store DTOs, Bun tests.

## Global Constraints

- Read `/Users/maximovchinnikov/github/ralphy/AGENTS.md`, this repository's `AGENTS.md`, and `docs/developing-ralphy.md` before edits.
- All on-disk source, tests, reports, and commit messages are English-only. Run the required Cyrillic scan before every commit.
- Work only in `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store`; preserve all unrelated migration/bootstrap/lint changes already present and stage only task-owned hunks.
- Never access or mutate the live `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy` tree. Every test uses an isolated temporary store.
- No schema migration, new index, dependency, CLI verb, protocol-version bump, or Core-major bump. Add an index only after a measured representative query-plan/timing regression proves it necessary; this plan expects none.
- Keep existing omitted/oldest cursor families and all default/max limits
  unchanged. Task 3 adds distinct newest-first families; media predicates apply
  before cursor and limit.
- No raw path, locator, provider payload, request/response, secret, external ID, or generation input is added to `media.list`.
- `media.generation.show` remains the on-demand detail contract. `media.list` exposes only `mediaKind` and `provenance` classifications.
- Preserve global producer ambiguity before consumer visibility and same-Run succeeded Build-result compatibility.
- Preserve consumer-principal Run isolation end to end: media store reads retain
  the original `QueryContext`, and bridge media/overview handlers attach the
  authenticated `BridgeMethodContext.authority` for Session contexts.
- Use strict TDD: witness the focused RED against production behavior, make the smallest GREEN change, and leave mutation-catching tests.
- Before each commit run `git diff --check`, `git diff --cached --check`, `rg '\p{Cyrillic}' --pcre2 --hidden -g '!.git' -g '!node_modules' -g '!*.lock'` over staged task paths, and `gitleaks protect --staged --redact`.

---

### Task 1: Treat Document Search As Literal User Text

**Files:**
- Modify: `cli/lib/store/documents.ts`
- Test: `tests/integration/domain-documents.test.ts`
- Test: `tests/integration/cli-bridge-domain-contract.test.ts`

**Interfaces:**
- Consumes: existing `searchDocuments({ context, query, after?, limit })` and bridge method `document.search`.
- Produces: file-local `literalDocumentSearchQuery(query: string): string` with
  a 1,024-byte UTF-8 ceiling matching Desktop; the public request/result types
  remain unchanged.

- [ ] **Step 1: Write failing store and bridge behavior tests**

Add one table-driven store test whose hand-written fixtures contain the exact
current heads `C++ launch`, `foo-bar launch`, `The "quoted" brief`, and
`NOT approved`. Assert each literal query returns only its matching current head
and does not throw. Assert whitespace-only and 1,025-byte UTF-8 input reject
with `E_VALIDATION_FAILED`, including a multibyte boundary case. Add bridge
assertions that punctuation succeeds while whitespace and over-limit input
return the validation code rather than `E_INTERNAL`.

```ts
for (const [query, title] of [
  ["c++", "C++ launch"],
  ["foo-bar", "foo-bar launch"],
  ['"quoted"', 'The "quoted" brief'],
  ["NOT", "NOT approved"],
] as const) {
  const page = searchDocuments({ context, query, limit: 50 });
  expect(page.items.map((item) => item.documentTitle)).toEqual([title]);
}

expect(() => searchDocuments({ context, query: "   ", limit: 50 }))
  .toThrow(expect.objectContaining({ code: "E_VALIDATION_FAILED" }));
```

- [ ] **Step 2: Run the focused RED**

Run:

```bash
bun test tests/integration/domain-documents.test.ts tests/integration/cli-bridge-domain-contract.test.ts -t "literal document search"
```

Expected: raw `MATCH ?` either throws on punctuation/operators or changes the result set, and whitespace maps to the generic internal failure.

- [ ] **Step 3: Implement one shared literal query helper**

Import the existing `DomainError` and replace both raw `input.query` bindings with one normalized value:

```ts
function literalDocumentSearchQuery(query: string): string {
  const literal = query.trim();
  if (!literal || Buffer.byteLength(literal, "utf8") > 1024) {
    throw new DomainError("E_VALIDATION_FAILED", undefined, {
      target: "document search",
      detail: "query must contain 1 to 1024 UTF-8 bytes",
    });
  }
  return `"${literal.replaceAll('"', '""')}"`;
}
```

Compute it once before opening/querying the database and pass the returned string to both project- and workspace-scoped `MATCH ?` calls. Do not implement advanced FTS operators, term splitting, stemming controls, or a second parser.

- [ ] **Step 4: Run focused GREEN and mutation checks**

Run:

```bash
bun test tests/integration/domain-documents.test.ts tests/integration/cli-bridge-domain-contract.test.ts -t "literal document search"
bun test tests/integration/domain-documents.test.ts tests/integration/cli-bridge-domain-contract.test.ts
bunx tsc --noEmit
```

Confirm that removing the surrounding quotes or quote-doubling breaks at least one new literal case.

- [ ] **Step 5: Commit only Task 1 hunks**

```bash
git add -p cli/lib/store/documents.ts tests/integration/domain-documents.test.ts tests/integration/cli-bridge-domain-contract.test.ts
git diff --cached --check
rg '\p{Cyrillic}' --pcre2 --hidden -g '!.git' -g '!node_modules' -g '!*.lock' cli/lib/store/documents.ts tests/integration/domain-documents.test.ts tests/integration/cli-bridge-domain-contract.test.ts
gitleaks protect --staged --redact
git commit -m "fix(core): search documents as literal text"
```

### Task 2: Add Bounded Media Kind And Provenance Facets

**Files:**
- Modify: `cli/lib/store/types.ts`
- Modify: `cli/lib/store/runs.ts`
- Modify: `cli/lib/store/media.ts`
- Modify: `cli/lib/store/overviews.ts`
- Modify: `cli/lib/bridge/methods.ts`
- Test: `tests/integration/domain-media.test.ts`
- Test: `tests/integration/domain-run-queries.test.ts`
- Test: `tests/integration/domain-overviews.test.ts`
- Test: `tests/integration/cli-bridge-domain-contract.test.ts`

**Interfaces:**
- Consumes: the exact artifact-revision producer route currently used by `getMediaGenerationDetail`: direct ArtifactRevision RunResult UNION same-Run succeeded Build RunResult→BuildOutput, DISTINCT Run IDs, global cardinality limited to two.
- Consumes: the existing consumer-aware Run access clause from `runs.ts`; do
  not duplicate its principal/scope rules in `media.ts`.
- Produces:

```ts
export type MediaKind = "image" | "video" | "audio" | "document" | "other";
export type MediaProvenance = "generation" | "not-generation" | "unknown";

export type MediaCard = (ArtifactMediaCard | RunObjectMediaCard | ObjectMediaCard) & {
  mediaKind: MediaKind;
  provenance: MediaProvenance;
};

listMedia(input: {
  context: QueryContext;
  types?: MediaRefType[];
  filter?: MediaFilter;
  mediaKind?: MediaKind;
  provenance?: MediaProvenance;
  after?: string | null;
  limit: number;
}): Page<MediaCard>;
```

Bridge `media.list` accepts the same optional scalar `mediaKind` and `provenance` fields. Existing callers that omit them remain valid.

- [ ] **Step 1: Add failing DTO/classification/filter behavior tests**

In `domain-media.test.ts`, seed scoped Artifact, RunObject, and Object rows with image/video/audio/text-PDF/unknown MIME values and producer cases. Assert every unfiltered returned card has exact `mediaKind` and `provenance`. Assert each scalar filter is applied before the page limit by placing nonmatching rows before matching rows in cursor order.

Use this hand-derived matrix:

```ts
const cases = [
  { mime: "image/png", kind: "image" },
  { mime: "video/mp4", kind: "video" },
  { mime: "audio/wav", kind: "audio" },
  { mime: "text/markdown", kind: "document" },
  { mime: "application/pdf", kind: "document" },
  { mime: "application/octet-stream", kind: "other" },
] as const;
```

Provenance cases must include: direct generation; same-Run succeeded Build generation; unique non-generation; zero producer; duplicate producers; direct+Build same Run dedupe; direct Run A plus Build Run B ambiguity; unselected Artifact; raw Object; inaccessible sole producer. Assert filter axes AND with existing lifecycle/source `filter` and entity `types`. For two consumer principals in the same scope, assert the non-owner cannot list or show the other principal's RunObject, while an otherwise visible Artifact with that sole inaccessible producer remains visible with `provenance: "unknown"`.

In `domain-overviews.test.ts`, assert `workspace.overview.sharedMedia` projects
the same classifications and consumer isolation as `media.list` without a
separate detail/provenance lookup. A Project Session must still receive only
Workspace-shared media in that section; project-owned media must not leak into
the explicitly narrowed overview scope.

- [ ] **Step 2: Add failing strict bridge/privacy tests**

In `cli-bridge-domain-contract.test.ts`, assert valid scalar fields are advertised/accepted, unknown enum values and unknown keys fail, and the result includes only the two new safe classification keys. Keep the existing forbidden-key walk and explicitly forbid detail keys:

```ts
for (const key of [
  "absolutePath", "bucket", "key", "hash", "metadata",
  "request", "response", "error", "prompt", "provider", "model", "costUsd",
]) expect(JSON.stringify(result)).not.toContain(`"${key}"`);
```

Update the superseded byte-for-byte list-shape assertion to the new exact safe shape; do not weaken it to partial matching.
The pre-existing bounded RunObject `logicalPath` field remains part of its
reviewed public DTO; this additive task neither removes nor broadens it.

Use one real authenticated `BridgeMethodContext` with two consumer principals
in the same scope. Cover `media.list`, `media.show`, `media.generation.show`,
`media.select`, `media.review`, and `workspace.overview`: the owner succeeds;
the non-owner cannot list/show the other principal's RunObject; and a visible
Artifact whose sole producer is inaccessible remains `unknown`. These checks
must exercise the bridge handlers rather than manually supplying
`consumerAuthority` to store calls.

- [ ] **Step 3: Run the focused RED**

Run:

```bash
bun test tests/integration/domain-media.test.ts tests/integration/domain-run-queries.test.ts tests/integration/domain-overviews.test.ts tests/integration/cli-bridge-domain-contract.test.ts -t "media facets"
```

Expected: current DTOs omit both classifications, bridge ignores/rejects the new request fields, and matching rows behind a nonmatching page boundary are not returned.

- [ ] **Step 4: Extract one authoritative set-based producer relation**

Move only the producer relation into an internal SQL fragment shared by
generation detail and media identity selection. Export the existing
consumer-aware Run access resolver as an `/** @internal */` store helper for
reuse by `media.ts`; do not copy its SQL or authentication rules. The relation returns
`(artifactRevisionId, runId)` pairs for direct ArtifactRevision RunResults UNION
same-Run succeeded Build RunResult→BuildOutput pairs. `UNION` dedupes the same
Run reached both ways.

```ts
/** @internal Closed SQL relation; callers add target/scope/cardinality rules. */
export const ARTIFACT_REVISION_PRODUCERS_SQL = `
  SELECT result.entity_id AS artifactRevisionId, result.run_id AS runId
  FROM run_results result
  WHERE result.entity_type = 'artifact_revision'
  UNION
  SELECT output.artifact_revision_id AS artifactRevisionId, result.run_id AS runId
  FROM run_results result
  JOIN builds build ON build.id = result.entity_id
  JOIN build_outputs output ON output.build_id = build.id
  WHERE result.entity_type = 'build'
    AND build.run_id = result.run_id
    AND build.state = 'succeeded'
`;
```

Generation detail wraps this relation with an exact revision predicate,
deterministic Run order, and global `LIMIT 2`. Authorization of the target and
consumer visibility remain in the public caller. Do not expose a generic API.

- [ ] **Step 5: Classify identities before cursor/limit and project the same values**

Add closed enum validators in `media.ts`/bridge. Change the internal
`listMediaInDatabase` seam to receive both the caller's original `QueryContext`
and an explicit `ResolvedScope`. `listMedia` passes its resolved scope;
`workspace.overview.sharedMedia` keeps passing the deliberately narrowed
`{ workspaceId, projectId: null }` scope plus `request.context` for
consumer-aware Run access. Extend the internal identity
row to carry `mediaKind` and `provenance`. Derive MIME kind from the effective
selected Artifact Object MIME, RunObject MIME, or raw Object MIME; treat
`text/*`, PDF, JSON, XML, RTF, and existing Office document MIME values as
`document`, and every other MIME/null as `other`.

For the Artifact branch, join one grouped view of
`ARTIFACT_REVISION_PRODUCERS_SQL` keyed by `selected_revision_id`. Count global
distinct Runs before visibility, retain the sole Run ID only when count is one,
then join the authorized Run to classify it. For RunObject, use its owning Run.
Raw Object is always `unknown`. One visible producer whose kind is `generation`
or starts with `generate.` is `generation`; one visible non-generation producer
is `not-generation`; zero, multiple, or inaccessible producer is `unknown`.

Apply the optional scalar predicates in this same set-based identity SELECT
before cursor and `LIMIT`. Return the calculated fields with the identity row
and spread them onto the card returned by `readCard`; do not scan/filter a page,
call generation detail, invoke a per-ID TypeScript resolver, or issue a second
provenance query per returned card.

The exact-card path (`media.show`, select/review result, and the existing bounded
`getMediaCards` batch) uses the same classification SQL and Run-access clause;
the list/overview path passes its already-calculated identity classifications
into `readCard`. Do not weaken RunObject card visibility to Workspace/Project
scope when the context belongs to a consumer principal. Add the original
`QueryContext` to `ReviewMediaInput`; bridge callers pass the authenticated
context, while trusted store callers may omit authority only for non-consumer
agent sessions.

- [ ] **Step 6: Wire strict bridge parameters**

Update `media.list` handler validation to accept only the existing keys plus optional `mediaKind` and `provenance`, validate both against the closed enums, and forward them unchanged. For `media.list`, `media.show`, `media.generation.show`, `media.select`, `media.review`, and `workspace.overview`, attach the authenticated bridge authority to a Session query context using the existing `run.results`/`run.objects` pattern before calling the store. Pass that context through both pre/post-select card reads and into `reviewMedia`:

```ts
const queryContext = scopedContext(value);
const mediaContext = queryContext.sessionId !== undefined && context.authority
  ? { ...queryContext, consumerAuthority: context.authority }
  : queryContext;
return listMedia({
  context: mediaContext,
  types: value.types as never,
  filter: optionalString(value.filter) as never,
  mediaKind: optionalString(value.mediaKind) as never,
  provenance: optionalString(value.provenance) as never,
  after: optionalString(value.after),
  limit: limit(value.limit),
});
```

Use the existing strict-key helper rather than adding another validator framework.

- [ ] **Step 7: Run focused GREEN and query-plan evidence**

Run:

```bash
bun test tests/integration/domain-media.test.ts tests/integration/domain-run-queries.test.ts tests/integration/domain-overviews.test.ts tests/integration/cli-bridge-domain-contract.test.ts
bunx tsc --noEmit
```

Capture `EXPLAIN QUERY PLAN` for one representative scoped Artifact provenance filter fixture in the report. Do not add an index unless this bounded fixture demonstrates a material reverse-lookup regression; otherwise record that no schema change is justified.

- [ ] **Step 8: Commit only Task 2 hunks**

```bash
git add -p cli/lib/store/types.ts cli/lib/store/runs.ts cli/lib/store/media.ts cli/lib/store/overviews.ts cli/lib/bridge/methods.ts tests/integration/domain-media.test.ts tests/integration/domain-run-queries.test.ts tests/integration/domain-overviews.test.ts tests/integration/cli-bridge-domain-contract.test.ts
git diff --cached --check
rg '\p{Cyrillic}' --pcre2 --hidden -g '!.git' -g '!node_modules' -g '!*.lock' cli/lib/store/types.ts cli/lib/store/runs.ts cli/lib/store/media.ts cli/lib/store/overviews.ts cli/lib/bridge/methods.ts tests/integration/domain-media.test.ts tests/integration/domain-run-queries.test.ts tests/integration/domain-overviews.test.ts tests/integration/cli-bridge-domain-contract.test.ts
gitleaks protect --staged --redact
git commit -m "feat(core): add media list facets"
```

### Task 3: Add Newest-First History Cursors

**Files:**
- Modify: `cli/lib/store/pagination.ts`
- Modify: `cli/lib/store/compositions.ts`
- Modify: `cli/lib/store/units.ts`
- Modify: `cli/lib/store/evaluations.ts`
- Modify: `cli/lib/bridge/methods.ts`
- Test: `tests/integration/domain-composition-queries.test.ts`
- Test: `tests/integration/domain-unit-queries.test.ts`
- Test: `tests/integration/domain-evaluations.test.ts`
- Test: `tests/integration/domain-query-surfaces.test.ts`
- Test: `tests/integration/cli-bridge-domain-contract.test.ts`

**Interfaces:**
- `composition.revisions`, `composition.builds`, `unit.revisions`, and
  `evaluation.list` accept optional `order?: "oldest" | "newest"`.
- Omitted/`oldest` preserves the existing ascending query and cursor family.
- `newest` returns descending rows and a distinct opaque cursor family whose
  `nextCursor` continues toward older rows.
- `pagination.ts` documents/adds `c2` for newest creation time and `v2` for
  newest revision number. Its `buildPage` comment becomes direction-neutral;
  the helper already emits from caller-ordered rows.

- [ ] **Step 1: Write the >50-row descending-page RED**

Seed 55 Composition revisions, Unit revisions, Builds, and target Evaluations.
For each method, assert `order: "newest"` page one returns rows 55…6 and its
cursor returns 5…1 with no duplicate/gap. Omitted order remains 1…50 then
51…55. An ascending cursor used with newest (and vice versa), an unknown order,
or an unknown bridge key must reject. Prove newest Build/evaluation is present
on page one.

- [ ] **Step 2: Run the focused RED**

```bash
bun test tests/integration/domain-composition-queries.test.ts tests/integration/domain-unit-queries.test.ts tests/integration/domain-evaluations.test.ts tests/integration/domain-query-surfaces.test.ts tests/integration/cli-bridge-domain-contract.test.ts -t "newest history pages"
```

- [ ] **Step 3: Add one two-direction pagination branch**

Extend the closed `CursorFamily` with `c2`/`v2` and its family-separation tests.
Update only the inaccurate ascending-only `buildPage` comment; the helper needs
no algorithm change because it respects caller row order. Validate the closed
`order` enum once per store method. Keep the current
ascending SQL/cursor unchanged. For newest, decode a distinct cursor family,
use the same `(ordinal,id)` tuple with `<`, order both fields DESC, and emit that
same newest-family cursor from `buildPage()`. Bridge handlers parse/forward only
the optional enum. Do not add a `before` field, count query, offset, or index.

- [ ] **Step 4: Run GREEN and commit Task 3**

```bash
bun test tests/integration/domain-composition-queries.test.ts tests/integration/domain-unit-queries.test.ts tests/integration/domain-evaluations.test.ts tests/integration/domain-query-surfaces.test.ts tests/integration/cli-bridge-domain-contract.test.ts -t "newest history pages"
bunx tsc --noEmit
git add -p cli/lib/store/pagination.ts cli/lib/store/compositions.ts cli/lib/store/units.ts cli/lib/store/evaluations.ts cli/lib/bridge/methods.ts tests/integration/domain-composition-queries.test.ts tests/integration/domain-unit-queries.test.ts tests/integration/domain-evaluations.test.ts tests/integration/domain-query-surfaces.test.ts tests/integration/cli-bridge-domain-contract.test.ts
git diff --cached --check
rg '\p{Cyrillic}' --pcre2 --hidden -g '!.git' -g '!node_modules' -g '!*.lock' cli/lib/store/pagination.ts cli/lib/store/compositions.ts cli/lib/store/units.ts cli/lib/store/evaluations.ts cli/lib/bridge/methods.ts tests/integration/domain-composition-queries.test.ts tests/integration/domain-unit-queries.test.ts tests/integration/domain-evaluations.test.ts tests/integration/domain-query-surfaces.test.ts tests/integration/cli-bridge-domain-contract.test.ts
gitleaks protect --staged --redact
git commit -m "feat(core): page project history newest first"
```

### Task 4: Scope Unit Selection Before Desktop Exposes It

**Files:**
- Modify: `cli/lib/store/units.ts`
- Modify: `cli/lib/bridge/methods.ts`
- Test: `tests/integration/cli-bridge-domain-contract.test.ts`

**Interfaces:**
- The public `unit.select` request shape already contains `context`; no contract
  version changes.
- Internal `selectUnitRevision()` gains optional `context?: QueryContext` so
  existing trusted CLI callers remain unchanged while bridge callers are
  authorized inside the same immediate transaction.

- [ ] **Step 1: Write the sibling-Project RED**

Create an owner Project Unit with one sealed revision and a sibling Project in
the same Workspace. Call bridge `unit.select` from the sibling context with the
exact IDs and `expectedSelectedRevisionId: null`. Assert `Unit not found`, then
read the database and prove the pointer is still null. The owner context must
select the same revision successfully.

- [ ] **Step 2: Run the focused RED**

```bash
bun test tests/integration/cli-bridge-domain-contract.test.ts -t "scopes unit selection"
```

- [ ] **Step 3: Authorize inside the mutation transaction**

In the bridge handler, parse `scopedContext(value)` and pass it to
`selectUnitRevision()`. Inside the existing immediate transaction, resolve that
context and require `getVisibleUnitDto()` for the target Unit before checking
the same-Unit sealed revision and nullable CAS. Keep Project access to its own
or workspace-shared Unit, but reject sibling Project Units. Do not add a second
preflight transaction or change the trusted CLI command path.

- [ ] **Step 4: Run GREEN and commit the narrow fix**

```bash
bun test tests/integration/cli-bridge-domain-contract.test.ts -t "scopes unit selection"
bun test tests/integration/domain-units.test.ts tests/integration/domain-unit-queries.test.ts tests/integration/cli-bridge-domain-contract.test.ts
bunx tsc --noEmit
git add -p cli/lib/store/units.ts cli/lib/bridge/methods.ts tests/integration/cli-bridge-domain-contract.test.ts
git diff --cached --check
rg '\p{Cyrillic}' --pcre2 --hidden -g '!.git' -g '!node_modules' -g '!*.lock' cli/lib/store/units.ts cli/lib/bridge/methods.ts tests/integration/cli-bridge-domain-contract.test.ts
gitleaks protect --staged --redact
git commit -m "fix(core): scope unit selection"
```

- [ ] **Step 5: Run the final Core gate and build the handoff binary**

Use a clean detached checkout outside repository ancestry with an isolated root
so tests cannot discover live `.ralphy`:

```bash
bun run lint
bun test tests/integration/
bun run build:bin:current --smoke
git diff --check
```

Record the exact binary path, SHA-256, mode, byte size, `--version`, and
`system.hello.coreVersion` in the final report. If lint fails only on the known
stale generated CLI surface, reproduce it on the plan base rather than widening
this contract change.
