# Task 3 report: isolated legacy readers and semantic import

## Status

Complete for the amended Task 3 boundary.

The importer creates deterministic scope and text-domain rows, preserves exact
raw control evidence for Task 4, imports the legacy jobs triplet through a
forced-cloned working copy, and leaves Desktop and binary Object staging to
their later tasks. Farm-shaped state is never parsed semantically.

## Delivered

- Kept legacy registry, path, secret, JSON, and byte-native JSONL readers in the
  isolated migration reader module. Normal runtime store and bridge modules do
  not import legacy state.
- Added one shared fail-closed credential vocabulary and sanitizer for the
  pre-parse gate and jobs import. It covers quoted JSON/YAML keys, optional
  environment `export`, provider-prefixed API/access/private keys, bot tokens,
  PEM blocks, Bearer/Basic authorization, and URL user-info. Invalid UTF-8,
  unrecognized NUL-bearing input, and unsafe UTF-16 controls are recovery-only.
  The jobs triplet uses its dedicated field-level redactor instead of the
  generic binary gate.
- Parsed JSONL by byte boundaries. Valid records before and after malformed or
  invalid-UTF-8 records remain importable; every malformed physical record has
  its own stable issue with line, exact byte offset and length (including its
  delimiter), digest, and diagnostic evidence allocation. Whole-file evidence
  retains CRLF and final-newline state.
- Bound all deterministic IDs and evidence paths to both the migration source
  identity and source-relative locator. Same-kind sources containing the same
  relative path cannot collide.
- Reconciled physical and registered Projects by immutable
  `(source, workspace, project)` identity. Same-slug Projects in different
  Workspaces remain distinct, while workspace drift and ambiguity create
  stable review issues. Registry-only Projects are archived metadata-only rows with
  `needsReview` and `migrationSourceMissing`; physical-only Projects remain
  active with `needsReview` and `migrationRegistryMissing`.
- Imported immutable typed Documents and revisions for non-secret JSON, JSONL,
  Markdown, text, and recognized control evidence. Absolute POSIX/Windows
  locators become source-relative locators or hashed external-path markers;
  `file:///` URIs, quoted/HTML paths, and data URLs become relative or hashed
  omission markers through the same recursive sanitizer used by operational
  text. Recursive JSON object keys use the same policy, credential-shaped keys
  are hashed and their values redacted, and keys are emitted in deterministic
  order. A post-sanitization key collision omits the Document and creates one
  stable review issue instead of silently overwriting a value. Recognized
  project Documents are collected by `(Project, role)`;
  deterministic shallow/canonical selection creates one binding while all
  candidates remain Documents and ambiguity receives a stable review issue.
- Imported explicit feedback rounds as Iterations and Feedback, project stage
  state, memory Documents plus Memory revisions, settings, campaigns, and
  calendar evidence when those recognized shapes exist. Research and resource
  text remains typed Document evidence because the domain schema has no
  separate research/resource table.
- Left non-empty control entries inventoried with deterministic raw-evidence
  allocations and stable target references for Task 4. Parse problems become
  one stable journal decision per malformed record without dropping valid
  siblings or terminalizing the whole-file ledger entry before allocation.
- Forced-cloned every jobs database/WAL/SHM triplet into migration-owned
  working directories, checked source identity before and after cloning,
  checkpointed only the clones, and required SQLite integrity and foreign-key
  checks. Every source is read and normalized before target writes begin; one
  target `IMMEDIATE` transaction then covers all source triplets, evidence,
  issues, inserts, and reconciliation.
- Preserved numeric Job, log, and artifact IDs; created deterministic historical
  Runs; resolved Projects only inside the same migration source; normalized
  absolute command/log/artifact paths; held every pending Job with the current
  migration Run; and reconciled IDs inside the same write transaction.
- Recursively sanitized and redacted command (including non-JSON fallback),
  Run/Job error, tag, log path/lines, and artifact locators before domain
  insertion. Every `depends_on` element is sanitized and then accepted only as
  a positive safe-integer Job ID; artifact kinds use a strict token grammar.
  Invalid, path/data-bearing, redacted, or collision-bearing values are omitted
  or replaced and quarantine the whole source DB/WAL/SHM triplet. Object keys,
  CLI flags, and free text use the same classifier as the control-file gate.
  Affected jobs receive one stable review issue, and their raw triplet remains
  secret-recovery-only with no ordinary evidence allocation or target reference.
- Validated every deterministic replay INSERT against its existing bindings.
  Job, log, and artifact validation covers every imported column. Matching
  replay is idempotent; a mismatched pre-existing row blocks instead of being
  silently accepted. Ledger allocation uses `UPDATE ... RETURNING id` and the
  whole jobs batch rolls back unless every expected ledger row advances.

## TDD evidence

- JSONL/secret RED: UTF-8 decoding changed raw byte ranges and the reader had no
  generic pre-parse secret gate or Farm raw-only classification. GREEN: exact
  byte offsets, lengths, hashes, valid siblings, secret detection, and Farm
  raw-only classification pass.
- Scope RED: the prototype created one random Workspace per source, omitted
  registry-only Projects and feedback, terminalized Documents before evidence,
  leaked absolute paths, and duplicated rows on replay. GREEN: two fixture
  Workspaces, six Projects, review metadata, two Iterations, three Feedback
  rows, typed Documents, raw allocations, no source-root leak, and stable replay
  pass.
- Diagnostic RED: malformed JSONL only incremented a counter. GREEN: two valid
  sibling Documents plus one exact issue/diagnostic allocation pass.
- Jobs RED: no jobs, logs, artifacts, Runs, forced clone, hold, or reconciliation
  existed. GREEN: all fixture operational rows import once, pending work remains
  held, absolute artifact paths are removed, exact IDs reconcile, and replay is
  stable.
- Drift/replay RED: changed source bytes and conflicting deterministic rows were
  accepted or silently skipped. GREEN: both fail before additional semantic
  writes.
- Round-two adversarial RED: quoted YAML, exported/AWS credentials, private-key
  job objects, PEM/Basic auth, file URIs, HTML paths, multi-source jobs, and
  duplicate Project Document roles bypassed or conflicted. GREEN: the exact
  corpus is classified/redacted, a recursive live-column scan contains no
  absolute/data locator, a late second-source failure leaves zero Jobs/Runs,
  and duplicate candidates replay with one stable binding plus review issue.
- Round-three adversarial RED: recursive absolute/data JSON keys leaked, key
  normalization could overwrite a sibling, and `depends_on` plus artifact kind
  bypassed the shared sanitizer. GREEN: dangerous keys are omitted or hashed in
  deterministic order, a collision omits its Document with one replay-stable
  issue, only the valid dependency survives, both affected artifact kinds fall
  back safely, and the jobs triplet remains recovery-only.

## Verification

- `bun test tests/unit/migration-import.test.ts tests/unit/migration-inventory.test.ts tests/unit/migration-schema.test.ts tests/integration/migration-domain.test.ts tests/integration/jobs-db.test.ts`: 66 passed, 0 failed, 453 assertions.
- `bun run lint`: passed TypeScript and every repository lint, including store
  boundaries, legacy-state access, English-only files, and CLI-surface freshness.
  The one pre-existing `install` skill heading warning is unchanged.
- `git diff --check`: passed.

## Deliberately excluded

- No Farm/Studio semantic parser, mapping, identity, readiness, namespace, or
  consumer row exists. Every `farm/**` control is only an ordinary raw-evidence
  candidate, as required by the 2026-08-04 amendment.
- No binary Object registration or promotion was added; Task 4 consumes the
  allocations.
- No production/delivery relation reconstruction was added; Task 5 owns it.
- No Desktop review or secret import was added; Task 6 owns it.
- No freeze, verification, cutover, recovery, rollback, public release, or live
  source mutation was added.

## Remaining concern transferred forward

The secret classifier intentionally fails safe: a non-secret JSON control with
a generic credential-shaped key such as `token` remains recovery-only until
Task 6 explicitly classifies or encrypts it. This can create review work but
cannot leak plaintext into SQLite or Objects.
