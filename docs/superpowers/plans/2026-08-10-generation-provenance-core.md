# Generation Provenance Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a bounded safe generation-input projection and expose exact selected-media provenance through one scoped Core read method.

**Architecture:** Keep `media.list` and the generic Run DTOs unchanged. Generation commands write a closed `generation-input/v1` request shape into the existing RunAttempt row; `media.generation.show` resolves one immutable ArtifactRevision or RunObject to zero, one, or multiple producer Runs and projects only safe Run, Attempt, cost, and input facts.

**Tech Stack:** Bun, TypeScript, `bun:sqlite`, existing domain store/bridge/test helpers.

## Global Constraints

- Keep schema version 6 and bridge Core contract major 2; this is an additive capability.
- Add no dependency and no filesystem/legacy-generation-log fallback.
- Never expose generic `request_json`, response, error, metadata, locator, path, URL, data URI, credential, note, provider payload, or external resource ID.
- User-authored prompt/text/negative-prompt is the only arbitrary-text exception; store at most 65,536 UTF-8 bytes per value with an explicit `truncated` flag.
- Store only a closed parameter-name union and at most 32 parameters.
- Treat null cost as unknown; a total is complete only when at least one attempt exists and every attempt has a cost.
- Multiple producer Runs are `unknown/ambiguous`; never choose a latest Run.
- Raw Object targets do not receive inferred provenance.
- Use TDD: each production change follows a witnessed behavior-level RED.
- Do not access or mutate the live `.ralphy` tree.

---

### Task 1: Safe generation input projection

**Files:**
- Create: `cli/lib/generation-input.ts`
- Modify: `cli/lib/store/types.ts:450-510`
- Create: `tests/unit/generation-input.test.ts`

**Interfaces:**
- Consumes: existing `JsonValue` from `cli/lib/store/types.ts`.
- Produces public DTO types in `store/types.ts` and constructor/parser logic in `generation-input.ts`:
  - `GenerationTextRole`
  - `GenerationParameterName`
  - `GenerationInputDto`
  - `generationInput(texts, parameters): JsonValue`
  - `readGenerationInput(value): GenerationInputDto | null`

- [ ] **Step 1: Write the parser/constructor RED**

Add literal fixtures that require this public shape:

```ts
type GenerationInputDto = {
  version: 1;
  texts: Array<{
    role: "prompt" | "text" | "negative-prompt";
    value: string;
    truncated: boolean;
  }>;
  parameters: Array<{
    name:
      | "size" | "durationSec" | "aspectRatio" | "resolution"
      | "generateAudio" | "referenceCount" | "referenceVideoCount"
      | "hasFirstFrame" | "hasLastFrame" | "hasImage"
      | "voiceSpecified" | "stability" | "similarityBoost"
      | "style" | "speed" | "speakerBoost" | "forceInstrumental"
      | "promptInfluence" | "language" | "backend";
    value: string | number | boolean;
  }>;
};
```

Assert that `generationInput()` stores `{type:"generation-input/v1",texts,parameters}`, truncates a 65,537-byte value to exactly 65,536 UTF-8 bytes without splitting a code point, keeps the role and `truncated:true`, rejects more than three text records or 32 parameters, rejects duplicate roles/names, non-finite numbers and unapproved names, and never accepts `voiceId`, `path`, `url`, `note`, `request`, `response`, or `error`.

Assert that `readGenerationInput()` returns `null` for `null`, `{slot:"hero"}`, malformed arrays, extra top-level keys, and unknown versions rather than leaking the original payload.

- [ ] **Step 2: Verify RED**

Run: `bun test tests/unit/generation-input.test.ts`

Expected: FAIL because `cli/lib/generation-input.ts` does not exist.

- [ ] **Step 3: Implement the smallest closed constructor/parser**

Use `Buffer.byteLength`, `Buffer.from(value).subarray(...)`, and `TextDecoder("utf-8", { fatal: false })`; no schema library. Return fresh arrays so callers cannot mutate stored fixtures. The internal discriminator is not included in `GenerationInputDto`.

- [ ] **Step 4: Verify GREEN**

Run: `bun test tests/unit/generation-input.test.ts`

Expected: PASS with every malformed/private payload returning `null`.

- [ ] **Step 5: Commit**

```bash
git add cli/lib/generation-input.ts cli/lib/store/types.ts tests/unit/generation-input.test.ts
git commit -m "feat(core): define safe generation inputs"
```

### Task 2: Persist projections for new generation attempts

**Files:**
- Modify: `cli/commands/generate.ts:297-340,576,861,1211,1381,1501,1614,1726`
- Modify: `tests/integration/cli-generation-domain.test.ts`
- Modify: `tests/integration/cli-generate-captions.test.ts`

**Interfaces:**
- Consumes: `generationInput()` from Task 1.
- Produces: every Core-owned image, video, voice, music, SFX, and captions attempt stores only `generation-input/v1`.

- [ ] **Step 1: Write table-driven persistence REDs**

For each existing command fixture, query only that RunAttempt's `request_json`, parse it, and assert literal safe facts:

```ts
expect(readGenerationInput(JSON.parse(row.request_json!))).toEqual({
  version: 1,
  texts: [{ role: "prompt", value: "hand-authored prompt", truncated: false }],
  parameters: [{ name: "aspectRatio", value: "9:16" }],
});
```

Use the real fixture values for image/video/voice/music/SFX and captions. Assert reference files become counts/booleans, `voiceId` becomes `voiceSpecified:true`, the original music prompt survives provider retry/rewrite, captions keeps only language/backend, and no fixture-root path, data URI, output path, provider failure text, note, external ID, or secret sentinel occurs in `request_json`.

- [ ] **Step 2: Verify RED**

Run: `bun test tests/integration/cli-generation-domain.test.ts tests/integration/cli-generate-captions.test.ts`

Expected: FAIL because existing attempts store `{slot}` or `{slot,language,backend}`.

- [ ] **Step 3: Add one required input to the shared write choke point**

Change `executeGeneratedArtifact` to require:

```ts
generationInput: ReturnType<typeof generationInput>;
```

and pass it directly to `startRunAttempt({request: input.generationInput})`. At each callsite construct only the approved texts/parameters from already-normalized command options. Captions uses the same constructor in its direct `startRunAttempt` call.

- [ ] **Step 4: Verify GREEN and privacy sentinels**

Run: `bun test tests/integration/cli-generation-domain.test.ts tests/integration/cli-generate-captions.test.ts`

Expected: PASS; existing locator-free assertions stay green.

- [ ] **Step 5: Commit**

```bash
git add cli/commands/generate.ts tests/integration/cli-generation-domain.test.ts tests/integration/cli-generate-captions.test.ts
git commit -m "feat(core): retain safe generation inputs"
```

### Task 3: Exact media generation read model

**Files:**
- Modify: `cli/lib/store/types.ts:500-540`
- Modify: `cli/lib/store/runs.ts:1120-1210,1830-1970`
- Modify: `tests/integration/domain-run-queries.test.ts`
- Modify: `tests/integration/domain-query-surfaces.test.ts`

**Interfaces:**
- Consumes: `readGenerationInput()` from Task 1 and existing QueryContext/Run visibility rules.
- Produces the media-detail types alongside the Task 1 input DTOs:
  - `MediaGenerationTarget`
  - `GenerationAttemptDetailDto`
  - `MediaGenerationDetailDto`
  - `getMediaGenerationDetail({context,target,after?,limit})`

- [ ] **Step 1: Write exact-target and ambiguity REDs**

Create real scoped Runs, Attempts, RunResults, ArtifactRevisions, and RunObjects. Require:

```ts
type MediaGenerationDetailDto =
  | {
      status: "generation";
      target: MediaGenerationTarget;
      run: RunDto;
      attempts: Page<GenerationAttemptDetailDto>;
      cost: { knownUsd: number | null; complete: boolean };
    }
  | { status: "not-generation"; target: MediaGenerationTarget; producer: RunDto }
  | { status: "unknown"; target: MediaGenerationTarget; reason: "not-recorded" | "ambiguous" };
```

Assert ArtifactRevision reverse ownership, RunObject direct ownership, `generation` and `generate.*` kinds, a proven non-generation producer, zero producer, two producers, two-attempt `p1` pagination, retry/failure states, complete/partial/zero cost, legacy `{slot}` input `null`, and safe v1 input projection.

Assert missing and sibling/foreign targets throw the same non-enumerating not-found error. Assert `limit=0`, `limit=101`, malformed cursors, Object targets, and mismatched target IDs fail before returning any Run facts.

- [ ] **Step 2: Verify RED**

Run: `bun test tests/integration/domain-run-queries.test.ts -t "media generation"`

Expected: FAIL because `getMediaGenerationDetail` and its DTOs do not exist.

- [ ] **Step 3: Implement one read transaction in `runs.ts`**

Authorize the immutable target first. For `artifact-revision`, join revision→artifact and apply existing Workspace/Project visibility, then collect distinct producer Run IDs from `run_results` with `entity_type='artifact_revision'`. For `run-object`, join run_object→run and use its direct Run ID. Return ambiguous before reading attempts if producer count exceeds one.

Use the existing safe Run/Attempt DTO mappers. Add `input: readGenerationInput(row.request)` only to `GenerationAttemptDetailDto`; do not widen `RunAttemptDto`. Aggregate cost across all attempts in the same transaction, independently of the requested attempt page.

- [ ] **Step 4: Verify GREEN and ordinary DTO privacy**

Run: `bun test tests/integration/domain-run-queries.test.ts tests/integration/domain-query-surfaces.test.ts`

Expected: PASS; ordinary Run/Attempt surfaces still omit request/response/error/metadata.

- [ ] **Step 5: Commit**

```bash
git add cli/lib/store/types.ts cli/lib/store/runs.ts tests/integration/domain-run-queries.test.ts tests/integration/domain-query-surfaces.test.ts
git commit -m "feat(core): read exact media provenance"
```

### Task 4: Bridge method, Artifact selection result, and contract privacy

**Files:**
- Modify: `cli/lib/bridge/methods.ts:450-500,1085-1120`
- Modify: `tests/integration/cli-bridge-domain-contract.test.ts`
- Modify: `tests/unit/bridge-boundaries.test.ts`

**Interfaces:**
- Consumes: `getMediaGenerationDetail()` from Task 3.
- Produces: advertised read method `media.generation.show` with `{context,target,after?,limit?}`.

- [ ] **Step 1: Write bridge RED**

Require `system.hello` capabilities to include `media.generation.show`. Call it for literal ArtifactRevision and RunObject targets and assert the exact DTO. Reject Object, Artifact, arrays, extra/missing target values, IDs outside 1..128 characters, and limits outside 1..100.

Add a regression case for existing `media.select`: selecting from `expectedSelectedRevisionId:null` must return the refreshed `ArtifactMediaCard` with `selectedRevisionId`, `selectedObjectId`, MIME, bytes, and target—not the internal `ArtifactDto` returned by `selectArtifactRevision`.

Recursively assert the response contains none of: `absolutePath`, `logicalPath`, `path`, `bucket`, `key`, `sha256`, `metadata`, `request`, `response`, `error`, `note`, `voiceId`, `url`, `externalId`, `credential`.

Assert `media.list` output remains byte-for-byte the pre-task fixture shape with no provenance/input fields.

- [ ] **Step 2: Verify RED**

Run: `bun test tests/integration/cli-bridge-domain-contract.test.ts -t "media generation"`

Expected: FAIL because the bridge method is absent.

- [ ] **Step 3: Register the bounded read method**

Parse only `artifact-revision` and `run-object`; use existing `scopedContext`, `optionalString`, and `limit` helpers. Default limit to 20 and pass no generic request body through the boundary. Add the method as `read` in the capability registry.

For `media.select`, keep the existing CAS mutation, then return `getMediaCard({context,ref})` from the same scoped handler so the public result matches the already-declared contract.

- [ ] **Step 4: Verify GREEN and boundaries**

Run: `bun test tests/integration/cli-bridge-domain-contract.test.ts tests/unit/bridge-boundaries.test.ts`

Expected: PASS with the capability advertised and internal store rows still inaccessible.

- [ ] **Step 5: Run Core gates**

Run:

```bash
bun run lint
bun test tests/integration/
bun run build:bin:current
./dist/ralphy --version
git diff --check
```

Expected: all commands exit 0; the local binary reports the current package version.

- [ ] **Step 6: Commit**

```bash
git add cli/lib/bridge/methods.ts tests/integration/cli-bridge-domain-contract.test.ts tests/unit/bridge-boundaries.test.ts
git commit -m "feat(core): expose media generation details"
```
