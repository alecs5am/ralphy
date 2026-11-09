# Account uploads: many owned accounts, browser upload, status in the panel

> **Status:** store, CLI and Accounts panel implemented; isolated fixtures verified; live owner test pending — 2026-11-09
> **Issue:** #600
> **Scope:** core store, CLI (`account`, `upload`), `ralphy panel`

## Goal

The owner runs many social accounts per platform (for example 100 Instagram
accounts), each dedicated to one niche, to test formats. Ralphy must know every
account, upload a finished video to the right one in one command, and show what
was uploaded and how it performs. No Postiz and no paid posting API: Ralphy itself
drives a real browser session that belongs to the account. A free official API
may replace a browser recipe later where it is simple (YouTube Data API); see
"Prior art" for why Instagram and TikTok stay in the browser.

Success looks like:

```bash
ralphy --workspace farm account add instagram psy.daily --niche psychology --purpose test
ralphy --workspace farm account login @psy.daily          # owner signs in once, by hand
ralphy --workspace farm upload add final.mp4 --account @psy.daily --caption-file cap.txt --approve
ralphy --workspace farm upload run                         # uploads approved items
ralphy --workspace farm upload sync                        # views / likes per upload
```

and `ralphy panel` → Accounts and Uploads tabs.

## Decisions

1. **One isolated browser profile per account.** Accounts that share a browser
   profile, cookie jar or device fingerprint get linked by the platform and can be
   restricted together. Each account gets its own persistent profile directory
   `<data-root>/browser-profiles/<account-id>/`, driven by patchright (a
   Playwright build patched against automation detection)
   `launchPersistentContext` on the installed Google Chrome (`channel: "chrome"`),
   headed, `viewport: null`, `locale: "en-US"`, no stealth scripts. Playwright's
   own Chromium is the fallback. Profiles are created by the CLI, so 100 accounts cost no manual setup
   beyond one sign-in each. The store keeps only the account → profile mapping;
   cookies never enter SQLite.
2. **The owner signs in; Ralphy never handles passwords.** `account login` opens
   the profile at the platform's login page and waits for the owner. Two-factor
   prompts, checkpoints and captchas stop the run and mark the account
   `needs_login` / `checkpoint`; the owner resolves them in the same profile.
3. **Upload queue is its own table, not `publications`.** `publications` is shaped
   around a remote scheduler (claims, reconciliation, a `rail` CHECK that would
   need a table rebuild on a 1 GB+ store). A browser upload needs different
   states (`needs_user`) and evidence (a screenshot). `uploads` holds the queue and
   the result; it links to a Unit Revision or Artifact Revision when the video came
   from one.
4. **Explicit approval before posting.** `upload run` posts only rows with
   `approved_at` set. `upload add --approve` or `upload approve` records the owner's
   go. An agent sets it only on the owner's explicit wording ("upload these",
   "post the queue").
5. **Scripted flows first, agent second.** Each platform has a deterministic
   recipe in `cli/lib/uploads/platforms.ts`, built from named steps. When a step
   fails, the run stores a screenshot and the page HTML, leaves the row in
   `needs_user` with `failure_stage`, and an agent repairs the recipe or finishes
   in the open profile (`account open`, then `upload done <id> --url`).
8. **Success is the platform's answer, not a toast.** Instagram's recipe waits for
   the POST `/api/v1/media/configure*` response and accepts it only when it
   carries `media.code`, the bound user's `pk` and the exact caption (a `202` means
   still processing). TikTok waits for the redirect to `/tiktokstudio/content`
   and accepts exactly one new profile video with the exact submitted caption,
   absent from a pre-submit snapshot. YouTube waits for a completed `Video
   published` dialog containing this video id; the details-page link is not
   publication proof.
9. **Publish once; a timeout is `unknown`, not failure.** The recipe calls
   `onSubmit` right before the irreversible click, which moves the row to
   `unknown`. Any error after that keeps it `unknown`: the post may exist.
   `upload retry` refuses `unknown` rows unless `--force`, after the owner checked
   the profile; `upload done --url` records a post that did go through.
10. **The session is bound to one platform user.** The first signed-in check
   stores `platform_user_id` (Instagram `ds_user_id`, TikTok `uid_tt`, X `twid`).
   A profile later signed in as someone else is marked `restricted` and never
   posts, so a mixed-up profile cannot post to the wrong account.
6. **Phones are modelled, not driven yet.** `social_accounts.connection` accepts
   `device` so a phone-only account can be listed, queued and completed by hand.
   Android (adb) and iPhone runners are later work.
7. **Proxies per account (later).** A proxy URL with credentials is a secret; it
   will live in the secret store under the account's `credential_ref`, never in
   `config_json`.

## Store (schema v13, forward repair in v14)

`social_accounts` gains columns (ALTER ADD, no rebuild):

| column | type | meaning |
|---|---|---|
| `niche` | TEXT NULL | niche slug, same vocabulary as `trend_niches.slug` |
| `purpose` | TEXT `main`/`test` | test accounts are disposable experiments |
| `connection` | TEXT `postiz`/`browser`/`device`/`none` | how Ralphy reaches it; existing rows stay `postiz` |
| `session_state` | TEXT `unknown`/`ok`/`needs_login`/`checkpoint`/`restricted` | last known sign-in state |
| `session_checked_at` | INTEGER NULL | when `session_state` was observed |
| `paused` | INTEGER 0/1 | excluded from `upload run` |
| `platform_user_id` | TEXT NULL | platform user the profile is bound to (decision 10) |

Browser accounts use the handle as `external_id`, so `(workspace, platform,
handle)` stays the identity. The profile path is derived from the account id.

New tables:

- `uploads`: `id` (`upl_*`), `workspace_id`, `social_account_id`, `media_object_id`
  (the video, ingested into the object store so the queue does not depend on a
  temp path), `cover_object_id` NULL, `caption`, `options_json`, `unit_revision_id`
  NULL, `artifact_revision_id` NULL, `state` (`queued`, `uploading`, `unknown`,
  `needs_user`, `published`, `failed`, `cancelled`), `approved_at`, `not_before`, `attempts`,
  `failure_stage`, `error`, `post_url`, `post_external_id`, `published_at`,
  `evidence_object_id` (screenshot; the page HTML is a sibling diagnostic object), `row_version`, `created_at`,
  `updated_at`.
- `upload_metric_snapshots`: `upload_id`, `as_of`, `views`, `likes`, `comments`,
  `shares`, `saves`, `raw_json`; primary key `(upload_id, as_of)`, append-only.
- `account_snapshots`: `social_account_id`, `as_of`, `followers`, `following`,
  `posts`, `raw_json`; primary key `(social_account_id, as_of)`, append-only.

The three `uploads` object columns are registered in `OBJECT_REFERENCE_SOURCES`
and in the verifier's unreferenced-object scan, so queued videos and evidence are
never reported as garbage. Portable export carries the new tables; a schema-12
package still imports.

## CLI

Workspace-scoped (`--workspace`), except reads used by the panel.

- `account add <platform> <handle> [--niche] [--purpose] [--name] [--connection browser]`
- `account import <file.csv>`: `platform,handle,niche,purpose,name` rows, idempotent.
- `account list [--platform] [--niche] [--state] [--purpose]`, `account show <ref>`
- `account login <ref>`: headed profile at the login page; returns when the owner
  closes the window or the session is detected; records `session_state`.
- `account check [<ref>|--all] [--headed]`: opens each profile headless, detects
  signed-in state and reads followers/posts into `account_snapshots`.
- `account open <ref> [--url]`: opens the profile for the owner or an agent.
- `account pause|resume <ref>`
- `upload add <file> --account <ref> [--caption|--caption-file] [--approve] [--at <iso>]`
  (or `--artifact <revision>` instead of a file)
- `upload list [--state] [--account] [--niche]`, `upload show <id>`
- `upload approve <id...>|--all-queued`, `upload cancel <id>`, `upload retry <id> [--force]`
- `upload run [<id>] [--limit N]`: runs approved, due, unpaused items one at a time.
- `upload done <id> --url <post-url>`: completes an item finished by hand.
- `upload sync [--account <ref>|--all]`: reads views/likes for published items.

`<ref>` is an account id or `@handle` (with `--platform` when the handle is not
unique).

## Platforms

| Platform | Session check | Upload | Metrics |
|---|---|---|---|
| Instagram | `sessionid` cookie, then inbox link vs password field | scripted (Reels) | reels grid play counts, followers |
| TikTok | `sessionid` cookie | scripted (TikTok Studio) | profile grid views, followers |
| YouTube | `SAPISID` cookie | scripted (Studio, Shorts) | subscribers |
| X | `auth_token` cookie | hand-off (`needs_user`) | followers |

## Prior art

- **Postiz** (gitroomhq/postiz-app, read at a32acaf): provider interface with
  capabilities, an error taxonomy (retry / refresh token / bad body / disconnect),
  a `refreshNeeded` flag (here `session_state`), `maxAttempts: 1` on the publish
  step, per-provider concurrency, customers as account groups (here `niche`).
  Every Postiz provider is an official API; X's API costs about $0.015 per post,
  TikTok's API posts only private videos until an app audit, and Instagram's
  needs Creator or Business accounts and a public video URL. Hence the browser.
- **social-auto-upload** (dreammis, read at 3847fff, MIT): Playwright recipes per
  platform with persistent cookies. Ported: the Instagram flow and its
  network-response success check, identity binding via `ds_user_id`, the
  three-way session check, write-`unknown`-before-click, screenshot plus HTML
  evidence; TikTok's iframe fallback and Post-enabled wait; YouTube Studio
  selectors and `fill` for hashtags.

## Panel

- **Accounts**: grouped by niche; handle, platform, purpose, session state badge,
  last upload, followers trend, best upload's views. Filters: platform, niche,
  state. Copy for agent: `ralphy account login @x`, "upload <file> to @x".
- **Uploads**: needs you, queued (approved / waiting approval), uploading,
  published (with link, views, multiplier vs the account's median), failed.
- Read-only, like the rest of the panel. Mutations go through the CLI.

## Out of scope for the first cut

Phone runners, proxies, scheduling beyond `not_before`, account creation (the
owner creates accounts), comment replies, cross-posting one upload to many
accounts in one row (one row per account instead), parallel runs (one upload at
a time per machine).

## Risks

- Platforms change upload UIs; recipes need repair. Mitigated by `needs_user`
  hand-off with evidence.
- Many accounts from one network address can be linked regardless of profiles.
  Proxies are the follow-up.
- Automated posting may breach a platform's terms for some account types; the
  owner decides which accounts use it.

## Overnight hardening (2026-11-09)

Schema v14 repairs early v13's missing identity column without rebuilding the
corpus, while leaving complete v13 identities intact. It adds process ownership
for upload claims, per-account browser leases (local runtime state, not portable),
and retained `upload_evidence` object references (portable since v14). Diagnostics
from every attempt remain referenced even if screenshots fail or a row is retried.

Two workers cannot claim two active uploads for one account. Login/check/open/
sync/upload share the same profile lease. Active workers cannot be reconciled
underneath the publish step. Dead-worker recovery is explicit and never retries
unknown outcomes automatically. PID reuse is conservatively refused.

The GET-only Accounts panel copies executable/root/Workspace/id-scoped commands,
shows all actionable rows and discloses its newest-200 published-history limit.
Visible metric observations can be rounded; dates are displayed and observations
older than 24 hours are labelled stale. YouTube/X post metrics remain unsupported.

Owner-led live verification and the local entry point are documented in
[the morning test](../../testing/account-uploads-morning-test.md). Fixture results
prove store/CLI/recipe contracts; they do not prove current platform selectors or
a successful real social publication.
