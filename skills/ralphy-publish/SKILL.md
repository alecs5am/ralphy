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

## Cover

Every post gets a cover: `cover.jpg` (1080x1920) in the video's folder. Look at frames (a contact
sheet: `ffmpeg -ss <t> -i render.mp4 -frames:v 1 ...` at a few times), pick the one where the hook
reads at a glance (the title or the subject, sharp, no end-card CTA, no blank frame), and write it:

```bash
ffmpeg -ss 2.4 -i ~/ralphy/<account>/videos/<nnn>-<slug>/render.mp4 -frames:v 1 -q:v 2 \
  ~/ralphy/<account>/videos/<nnn>-<slug>/cover.jpg
```

A designed cover (a frame plus a title) is fine too; keep it 9:16 and keep text inside the middle 4:5,
which is what profile grids show. `cover.jpg` does not make the render stale. `run` sets it on
Instagram (Cover photo), TikTok (Edit cover, Upload cover) and YouTube (thumbnail, where the channel
has custom Shorts thumbnails); a platform that cannot take it uses a frame and the run prints a `note:`.

## Caption

Write it after the video is final, in the audience's language, describing what the video shows.
The first line is YouTube's title (at most 100 characters, no `<` or `>`) and the hook everywhere
else; then one or two plain sentences; then 3-5 specific hashtags. Do not promise what the account
cannot deliver (a "comment X" reward with no one sending it). Per-platform shape, limits and
hashtags: `references/captions.md`. Show it to the owner unless they gave one. Different captions per
platform: plan each platform separately with its own `--caption-file`.

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
- The whole video is posted: Instagram's crop step is set to Original (it opens on 1:1, which would
  cut a vertical video to its middle square).

## Schedule

`--at` only records the time. `ralphy post timer on` (macOS) installs a LaunchAgent that runs
`ralphy post run --due` every 10 minutes, so approved posts go out at their time while the Mac is on;
`ralphy post timer status` shows it and its log, `off` removes it. Each due post opens its profile's
Chrome window for the upload. For "N videos, two a day": plan each video with its own `--at` (for
example 13:00 and 19:00 in the owner's zone), show the list, approve after the go, turn the timer on.

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

`ralphy stats fetch <account>` reads views, likes, comments and shares (saves on TikTok) from each
signed-in platform and appends a snapshot per video to the account's `stats.csv` (empty = unknown).
In the same run it opens each post's analytics page (YouTube Studio, TikTok Studio) and appends the
retention curve, average view, finished share (TikTok) or stayed-to-watch share (YouTube Shorts) and
traffic sources to `analytics.jsonl`. `--all` also reads the account's other videos, which gives the
baseline to compare with. Instagram has no reel insights for a personal account: say so, and that
switching to a professional account in the app (the owner's call) opens them. YouTube fills analytics
about a day after posting. Fetch a day after posting and again later, not every few minutes.

Read it with `ralphy stats show <content-id>` (or `<account>` for every video):

- **Hook**: retention at 1 and 3 s and, on YouTube, `stayed`. Most viewers leave in the first seconds;
  compare with the account's other videos and the reference.
- **Drops**: "most viewers left at 4-5s" names a second. Open `index.html`, find what is on screen then
  (a slow beat, a cut, text that is hard to read) and change that, one thing per version.
- **End**: average view, `finished` and the tail of the curve say whether the payoff lands.

Save a version before the change (`ralphy content save`), so the next post compares one difference.
Signals to fixes: `ralphy-trendwatch`. The panel's Posts tab shows the same curve under the video.
