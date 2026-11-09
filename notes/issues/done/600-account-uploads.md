# 600 — Owned accounts and browser uploads (`ralphy account`, `ralphy upload`)

> **Status:** done — 2026-11-09 (store schema v13, `account` / `upload` verbs, patchright recipes for Instagram, TikTok and YouTube, panel Accounts tab)
> **Filed:** 2026-11-04
> **Folder:** issues/done
> **Severity:** high
> **Category:** store / cli / publishing

## Context

The owner runs many accounts per platform (for example 100 Instagram accounts), each dedicated to one niche, to test formats. Ralphy had no notion of these accounts: publishing went only through a workspace's Postiz connection, which the owner does not want, and paid posting APIs are ruled out (X charges per post; TikTok's API posts only private videos before an app audit; Instagram's needs Creator accounts and a public video URL).

## What

- Store v13: `social_accounts` gains `niche`, `purpose`, `connection`, `session_state`, `session_checked_at`, `paused`, `platform_user_id`; new `uploads` queue (states `queued`, `uploading`, `unknown`, `needs_user`, `published`, `failed`, `cancelled`), append-only `upload_metric_snapshots` and `account_snapshots`. Portable export carries them; schema-12 packages still import.
- One persistent patchright profile per account under `<data-root>/browser-profiles/<account-id>/`, real Chrome, headed. The owner signs in by hand (`account login`); Ralphy never handles a password.
- Recipes in `cli/lib/uploads/platforms.ts`. Instagram is a port of dreammis/social-auto-upload: success is the `/api/v1/media/configure` response matching the bound user and caption. A failure after the publish click leaves the row `unknown`, never retried without `--force`.
- `upload run` posts only approved rows; a stuck step ends `needs_user` with a screenshot and page HTML.
- Agent skill `account-uploads`; panel Accounts tab.

Design: `docs/superpowers/specs/2026-11-04-account-uploads-design.md`.

## Verification

- `tests/unit/account-uploads.test.ts`: account identity and binding, claim rules, the `unknown` lifecycle, metrics, CSV import, counters, Instagram response check.
- `tests/integration/domain-media.test.ts`: the three `uploads` object columns are registered references.
- Manual: `upload run` on a signed-out profile ends `needs_user` at stage `session` with screenshot and HTML evidence; `account check` reports `needs_login` in about 2 s.
- Not verified: a signed-in end-to-end post on any platform (needs the owner's account).
