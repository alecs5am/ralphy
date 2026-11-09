# Account uploads: morning test

This is an owner-led 10-15 minute acceptance test for PR #9. Fixtures are external
free. Only the owner-led publication step below posts anything. Do not run the
whole approved queue for this test: use one explicit upload id.

## Tested checkout and local entry point

Checkout: `/Users/maximovchinnikov/github/ralphy/ralphy`, branch
`feat/account-uploads`. The global 0.4.0 installation is not the test executable.
The ignored `.ralphy/tmp/account-uploads-builds/` directory contains the local
compiled `ralphy`, a source-based `ralphy-local` wrapper pinned to Bun 1.4.2, and
`build-info.json` recording the exact Git SHA, binary hash and verification.
The wrapper resolves dependencies and prompt-pack files from this checkout;
keep its checkout and node_modules present. No global installation is changed.

Build and evidence paths for this run are recorded below after verification.

## 1. Open the panel (2 minutes)

Set these once in a shell; `UPLOAD_CLI` is the exact `ralphy-local` path in the
local evidence section. Use the home library explicitly, not the checkout's
separate `.ralphy` corpus.

```sh
UPLOAD_CLI='/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/tmp/account-uploads-builds/20261109T200418Z/ralphy-local'
UPLOAD_ROOT='/Users/maximovchinnikov/.ralphy'
"$UPLOAD_CLI" --root "$UPLOAD_ROOT" panel --port 4789
```

Open `http://127.0.0.1:4789/#/accounts`. Stop the server with Ctrl-C when finished.
Expected: an empty owned-account list before creating a browser account. The seven
legacy Postiz rows are preserved but are not usable signed-in browser accounts.
The corpus is historical (latest observation November 2); no refresh is required
for this upload test. The panel is GET-only. Copy buttons copy commands; they do
not approve or post. Commands include the executable, root, Workspace and ids.

## 2. Create or pick one test account (3 minutes)

Reuse an existing dedicated browser test account if available. Otherwise list
Workspaces, create a test Workspace once, then add the handle of an account you
already own. Do not create platform accounts through automation.

```sh
"$UPLOAD_CLI" --root "$UPLOAD_ROOT" workspace list
"$UPLOAD_CLI" --root "$UPLOAD_ROOT" workspace create morning-uploads
"$UPLOAD_CLI" --root "$UPLOAD_ROOT" --workspace morning-uploads account add instagram YOUR_TEST_HANDLE --purpose test --niche psychology
"$UPLOAD_CLI" --root "$UPLOAD_ROOT" --workspace morning-uploads account list
```

Keep the returned `acct_...` as `UPLOAD_ACCOUNT`. Use ids when handles collide.
A newly created browser account has `sessionState: unknown` and no bound user.
Sign in manually in its isolated browser profile:

```sh
UPLOAD_ACCOUNT='acct_...'
"$UPLOAD_CLI" --root "$UPLOAD_ROOT" --workspace morning-uploads account login "$UPLOAD_ACCOUNT"
"$UPLOAD_CLI" --root "$UPLOAD_ROOT" --workspace morning-uploads account show "$UPLOAD_ACCOUNT"
```

Only the owner enters passwords, two-factor codes or captchas. Expected:
`connection: browser`, `sessionState: ok`, non-null `platformUserId`. Missing
identity is not enough to publish. A different bound user becomes `restricted`.
Do not rebind it to bypass this check. Close this profile before another command
uses it. Ordinary owner browser profiles are never used.

## 3. Queue, inspect and approve one video (2 minutes)

Choose a local video and caption you are willing to publish to the test account.

```sh
"$UPLOAD_CLI" --root "$UPLOAD_ROOT" --workspace morning-uploads upload add /absolute/path/test.mp4 --account "$UPLOAD_ACCOUNT" --caption-file /absolute/path/caption.txt
```

Save the returned id as `UPLOAD_ITEM`. Expected: `queued`, `approvedAt: null`;
the panel shows Waiting approval. Review the exact account, caption and media:

```sh
UPLOAD_ITEM='upl_...'
"$UPLOAD_CLI" --root "$UPLOAD_ROOT" --workspace morning-uploads upload show "$UPLOAD_ITEM"
```

The following approval and run are a deliberate real publication. Execute them
only after deciding to publish this item:

```sh
"$UPLOAD_CLI" --root "$UPLOAD_ROOT" --workspace morning-uploads upload approve "$UPLOAD_ITEM"
"$UPLOAD_CLI" --root "$UPLOAD_ROOT" --workspace morning-uploads upload run "$UPLOAD_ITEM"
```

Expected: `published` with the exact post URL, or an actionable state below. A
completed browser upload alone is not success. Instagram verifies the final
configure response and bound user/caption. TikTok requires a content redirect
plus exactly one new matching-caption profile video, absent before submission.
YouTube requires a completed Video published dialog linking this video id.
These selectors have fixture coverage; live success is not yet verified.

## 4. Read status and metrics (2 minutes)

```sh
"$UPLOAD_CLI" --root "$UPLOAD_ROOT" --workspace morning-uploads upload show "$UPLOAD_ITEM"
"$UPLOAD_CLI" --root "$UPLOAD_ROOT" --workspace morning-uploads upload sync --account "$UPLOAD_ACCOUNT"
"$UPLOAD_CLI" --root "$UPLOAD_ROOT" --workspace morning-uploads account show "$UPLOAD_ACCOUNT"
```

Inspect the actual post and confirm it belongs to the intended test account.
Instagram/TikTok views may lag or be rounded. Null is unknown, not zero.
YouTube/X post metrics are unsupported (`postMetricsSupported: false`). All-null
reads do not create fresh snapshots. Observation time is visible; older than 24
hours is labelled stale. Best/median are historical visible views, not complete
platform analytics or causal experiment measurements.

## Recovery (use only the matching state)

| State | Meaning and owner action |
|---|---|
| `queued`, not approved | Review before approving; no automatic publication. |
| `needs_user` | No confirmed submit. Read `failureStage`, error and evidence; repair sign-in or selectors, then explicitly retry. |
| `unknown` | Submit may have happened. Never auto-retry. Inspect the profile; after closing it, record `upload done <id> --url <actual-url>` if posted, or use `upload retry <id> --force` only after confirming no post exists. |
| `uploading` with a live worker | Let it finish or stop that exact worker; recovery refuses active workers. |
| `uploading` after worker death | Inspect the profile and close it. Record manual completion if posted; otherwise explicitly `upload retry <id> --force`. No automatic lease expiry resubmits it. |
| `failed` | Pre-submit browser/caption failure. Fix the cause, then `upload retry <id>`. |
| account `restricted` | Signed-in identity differs from binding. Use the intended account; do not overwrite the binding. |

An unknown row blocks later items for that account. Profile leases cover login,
check, open, sync and upload, and reclaim only proven dead processes. PID reuse
fails closed. A Chrome process left alive after its parent died can still hold
Chromium's own lock; close that dedicated window before continuing. Never delete
locks to bypass a live process. Diagnostic objects are local sensitive evidence;
`evidenceObjectId` points to the screenshot, or HTML when no screenshot exists.
`upload_evidence` retains HTML/screenshots from every attempt for verification
and portable export. Do not publish raw diagnostic HTML or cookies.

Manual completion validates the platform URL and saves the post id so later
metric sync can match it. For TikTok/X, the URL handle must match the account.
Instagram/YouTube URLs do not prove ownership; the owner must check the post.

## Repeatable isolated smoke

From the checkout, with installed dependencies and ffmpeg:

```sh
mise exec bun@1.4.2 -- bun test tests/integration/account-uploads-smoke.test.ts
mise exec bun@1.4.2 -- bun test tests/unit/account-uploads.test.ts tests/unit/upload-recipes.test.ts tests/unit/panel-accounts.test.ts tests/unit/migration-schema.test.ts
```

The smoke creates and removes a temporary library, installs the Codex routing
pack only there, generates a tiny video with local ffmpeg, drives real CLI/store
approval and reads, simulates the browser/provider boundary and checks
success/pre-submit failure/unknown/wrong identity, metrics, GET-only panel and
store integrity. It never opens a browser or contacts a social platform. The
source wrapper can be tested with `RALPHY_SMOKE_BIN=<ralphy-local-path>` using
the same smoke command. The compiled runtime was separately exercised for
version/help, account reads and migration; its standalone prompt-pack path is
not validated. Use the source wrapper for skill installation and the morning test.

DOM/HTTP and scripted recipe fixtures are not real-browser visual validation.
No live sign-in, real post, paid scraping or provider acceptance was performed.
Device upload runners, proxies, experiment attribution and corpus refresh remain
follow-up work after the first owner-led publication.

## Local evidence

Verification results, exact executable, backup and migration outcome are filled
in for this run below. The final Git SHA is recorded in the ignored build
manifest after committing; it is also included in the implementation handoff.

- Executable: `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/tmp/account-uploads-builds/20261109T200418Z/ralphy-local`.
- Compiled runtime: `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/tmp/account-uploads-builds/20261109T200418Z/ralphy` (Bun 1.4.2, version 0.4.0, unreleased).
- Build manifest: `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/tmp/account-uploads-builds/20261109T200418Z/build-info.json`.
- Backup: `/Users/maximovchinnikov/.ralphy/backups/account-uploads-20261109T194308Z/home-before-apply-v14.db` (SQLite backup API, private directory).
- Rehearsal: `/Users/maximovchinnikov/.ralphy/backups/account-uploads-20261109T194308Z/rehearsal-final/ralphy.db`. The same compiled runtime
  upgraded this disposable copy before the home library.
- Home result: schema 13 -> 14, all prior table counts and account fields
  preserved, integrity `ok`, foreign-key check empty. Accounts 7 (all Postiz /
  unknown), uploads 0, corpus videos 281582, metric snapshots 548389, niches 6.
  The checkout-local library was read only for inventory and remains schema 12.
- Focused validation: 105 tests across ten affected unit/integration files passed;
  the isolated wrapper/install/provider smoke also passed (38 assertions).
  Final full suites: unit 3983 passed / 1 skipped / 0 failed (261 files);
  documented integration suite 1127 passed / 3 skipped / 0 failed (132 files).
  Normal-hook results are recorded in the verification directory beside the
  build manifest and in the implementation handoff.
- Verification directory: `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/tmp/account-uploads-builds/20261109T200418Z/verification`.
- Full `bun run lint` stops at four unchanged `lint:gen-log` findings in
  `cli/lib/music-prompt-lint.ts:266`, `cli/lib/providers/shared.ts:563,604`, and
  `cli/lib/providers/refusal.ts:155`. These calls pass canonical rows built by
  `refusalRow`; the text scanner does not follow variable arguments. Running
  the same scanner on exact main `932caec3b6dd8e91a6de8b20036b2ede95b9e413`
  reproduces all four findings. TypeScript and separately run affected linters
  pass; the unrelated logging linter was not relaxed.
- Existing PR9 desktop job: 13 failures, including a developer-local design
  archive absent on CI, Electron geometry/timeout failures, and a core bridge
  launch unable to resolve `chalk` from `cli/lib/ui.ts`. The workflow installs
  only `apps/desktop` dependencies, not the root CLI package. Main at the SHA
  above also has 13 desktop failures (an overlapping, not identical test set).
  No retired desktop source or checks were removed or revived. Logs:
  https://github.com/alecs5am/ralphy/actions/runs/42592034361 and baseline
  https://github.com/alecs5am/ralphy/actions/runs/41833466106.
- Vercel deployment `dpl_62CfxR5KtiYHxNVksBSsSaoC3FgJ` failed. GitHub exposes
  the failed deployment status, but the installed Vercel login cannot inspect
  that deployment under its current team, and `--scope ornikis-projects` reports
  `The specified scope does not exist`. Its build-failure cause remains
  unverified; no deployment, account switch or settings change was made.
