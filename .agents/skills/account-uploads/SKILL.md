---
name: account-uploads
namespace: user
description: >-
  Manage the owner's own social accounts (many per platform, one niche each) and upload finished videos to them from each account's own browser profile, with no Postiz and no paid posting API. Covers adding or importing accounts, the one-time hand sign-in, checking sessions, queueing and approving uploads, running the queue, handing a stuck step to the owner, and reading what is taking off (views per upload, best and median per account).
  USE WHEN the user names one of their accounts or a niche account as the target ("upload this to my psychology account", "post the reel to @mind.notes", "add my 20 test accounts", "which of my accounts is growing", "what took off this week"), asks to sign in to an account, or asks for upload status.
  DO NOT FIRE for posting through a workspace's Postiz connection (social-publish), or for copy-only requests (social-copy).
---

# Account uploads

The owner runs many accounts, often one per niche, to test formats. Ralphy keeps
the list, uploads a finished video to the right account from that account's own
browser profile, and reads back views. The user talks to you; you operate the
CLI. Spec: `docs/superpowers/specs/2026-11-04-account-uploads-design.md`.

Every command takes `--workspace <ws>`. `<ref>` is an `acct_…` id or a handle;
add `--platform` when the same handle exists on several platforms.

## Hard rules

1. **Never type a password, a code or a captcha.** Sign-in is the owner's:
   `ralphy account login <ref>` opens the profile and waits for them. A
   checkpoint, two-factor prompt or captcha is the owner's to clear in
   `ralphy account open <ref>`.
2. **Approval before posting.** `upload run` posts only approved rows. Approve
   (`upload add --approve`, `upload approve <id>`) only when the user said to
   post ("upload it", "post the queue"), not when they said "prepare" or
   "queue it up".
3. **Confirm the target before queueing** when the request names a niche rather
   than a handle: list the matching accounts (`account list --niche <slug>`) and
   say which one you picked.
4. **Report published only with the platform's evidence**: the row is
   `published` and has a `postUrl`. Never say "uploaded" from a screenshot or
   your own reading of the page.
5. **Never repost an `unknown` upload.** `unknown` means the publish click
   happened and the outcome is not confirmed, so the post may exist. Open the
   profile (`account open <ref>`), look, then either
   `upload done <id> --url <post-url>` or, only if there is no such post,
   `upload retry <id> --force`.
6. **One account, one profile.** Never sign two accounts into one profile and
   never use the owner's everyday browser. A profile signed in as a different
   user than the one it is bound to turns the account `restricted`; tell the
   owner instead of re-binding it.

## Add accounts

```bash
ralphy --workspace farm account add instagram mind.notes --niche psychology --purpose test
ralphy --workspace farm account import accounts.csv   # platform,handle,niche,purpose,name
ralphy --workspace farm account login mind.notes --platform instagram
```

Platforms: `instagram`, `tiktok`, `youtube` (scripted upload) and `x` (session
and followers only; uploads hand off). Niche slugs are the trends vocabulary.
`--connection device` lists a phone-only account; its uploads always hand off.

## Upload

```bash
ralphy --workspace farm upload add final.mp4 --account mind.notes --platform instagram \
  --caption-file caption.txt --approve
ralphy --workspace farm upload run            # approved, due rows, one at a time
ralphy --workspace farm upload list --state needs_user,unknown
```

Use `--artifact <arev_…>` instead of a file for a stored render, and
`--at <iso>` to hold a row until a time. Get the caption from `social-copy`
when the user has none. Instagram allows 2,200 caption characters, TikTok 2,200,
YouTube 5,000 (first line is the title, 100 characters), X 280.

What a run leaves:

| State | Meaning | Your next step |
|---|---|---|
| `published` | platform confirmed; `postUrl` set | report the link |
| `needs_user` | stopped before posting at `failureStage` (`session`, `attach-video`, …) | show the error and screenshot; fix the session or finish in `account open`, then `upload done` or `upload retry` |
| `unknown` | stopped after the publish click | rule 5 |
| `failed` | could not start (browser, caption too long) | fix the cause, `upload retry` |

A recipe step that fails repeatedly means the platform changed its page. Read
the stored HTML evidence and propose a selector fix in
`cli/lib/uploads/platforms.ts` (dev mode) instead of retrying.

## What is taking off

```bash
ralphy --workspace farm upload sync --all     # views per upload, followers per account
ralphy --workspace farm account list --niche psychology
ralphy --workspace farm upload list --state published
```

`account list` gives per account: uploads, published, best and median views,
followers. Compare an upload's views to its account's median: 2x or more is a
hit worth repeating on the account's siblings in the niche. Counts come from the
public profile grid, so they lag and round ("12.5K"). For a visual view, the
`panel` skill's Accounts tab shows the same data.
