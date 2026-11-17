---
name: ralphy-publish
description: >-
  Set up Accounts and their platforms, have the owner sign in to each platform in its own browser
  profile, write captions, plan posts, get the owner's explicit go, run the upload and report the
  post URL. Triggers: "create an account", "add my TikTok", "sign in to the account", "write a
  caption", "post it", "schedule it for 18:00", "upload to all accounts", "is it live", "создай
  аккаунт", "добавь тикток", "залей в аккаунт", "опубликуй", "запости", "запланируй",
  "залей на все аккаунты", "напиши подпись".
---

# ralphy-publish

Ralphy posts to the owner's own accounts from one browser profile per account and platform. The
owner signs in by hand; you plan, wait for the go, run and report.

## Hard rules

1. Never type a password, code or captcha. Sign-in and checkpoints are the owner's.
2. No `ralphy post approve` until the owner says to post. "Post it", "upload it", "publish now" are a
   go for the posts named. "Prepare", "plan", "queue it" are not.
3. Say "published" only when the row is `published` and has a URL. A screenshot or your reading of a
   page is not proof.
4. Never retry an `unknown` post without checking the profile first (see States).
5. One browser profile per account and platform. Never sign two accounts into one profile, never use
   the owner's everyday browser.
6. If the owner names a niche or "all accounts", list the exact `<account>:<platform>` targets and
   confirm them before planning.

## Accounts and platforms

```bash
ralphy account new "Film Stories"        # creates ~/ralphy/film-stories/account.md
ralphy account list
ralphy account show film-stories --json
```

Add each platform to the `platforms:` list in `account.md` (`platform`, `handle`, `profile:
<account>-<platform>`, `status: unknown`); format in `ralphy/references/layout.md`. Write the persona
and the `## Style` section with the owner: palette (hex), type, caption look, pacing, voice, sound,
do-not-do list. Do not invent a style; derive it from the references the owner likes.

## Sign-in

```bash
ralphy account login film-stories tiktok   # opens the profile; the owner signs in, you wait
ralphy account check film-stories          # session state per platform
ralphy account open film-stories tiktok    # the owner (or you) looks at the logged-in profile
```

A checkpoint, two-factor prompt or captcha is cleared by the owner in `account open`. Close the
window before another command uses that profile. A profile signed in as someone else: tell the owner.

## Caption

Write it after the video is final, in the audience's language, describing what the video shows.
Per-platform shape, limits and hashtags: `references/captions.md`. Show it to the owner unless they
gave one.

## Plan, approve, run

```bash
ralphy post plan film-stories/004-cats --to film-stories:tiktok,film-stories:youtube \
  --at 2026-11-18T18:00:00+03:00 --caption "..."
ralphy post list --account film-stories    # show the planned rows to the owner
ralphy post approve <post-id>              # only after the owner's go; or --all --account <a>
ralphy post run <post-id>                  # or: ralphy post run --due
```

- `plan` posts `render.mp4`. When it is missing or stale, `plan` renders first (local and free), then
  checks it against the platform limits.
- `run` uploads a clone of `render.mp4` made at run time in `~/.cache/ralphy/post/<post-id>.mp4`, so
  a re-render during an upload cannot change the file.
- The same video to another account is a row in that account: `--to other-account:instagram`.
- A row with the same content, platform and handle that is approved, uploading, published or unknown
  blocks a new one. `--again` overrides, only when the owner wants a repost.
- `ralphy post cancel <post-id>` drops a planned or approved row.

## States

| Status | Meaning | Next |
|---|---|---|
| `planned` | waits for the owner's go | show it, wait |
| `approved` | will post at `scheduled_at` or on `run` | `ralphy post run` |
| `uploading` | in progress | wait, then `ralphy post list` |
| `published` | confirmed, `url` set | give the owner the link |
| `unknown` | stopped after the irreversible click; the post may exist | `ralphy account open` and look. Tell the owner what you see; plan again with `--again` only if it is not there and they say so |
| `needs_login` | the session expired | `ralphy account login`, the owner signs in, then `run` again |
| `failed` | stopped before posting (`error` says why) | fix the cause, `run` again |
| `cancelled` | dropped | nothing |

A step that fails twice the same way means the platform changed its page. Stop and tell the owner;
do not loop.

## After posting

Stats land in the account's `stats.csv` (empty = unknown). Compare with the reference and the
account median: `ralphy-trendwatch`, signals to fixes.
