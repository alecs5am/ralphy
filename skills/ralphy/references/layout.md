# Folders and files

Plain files are the state. Names are lowercase kebab-case.

## `~/ralphy` (`RALPHY_HOME`)

```
~/ralphy/
  <account>/                      an Account, e.g. ui-effects
    account.md                    YAML frontmatter + markdown body (persona, style lock, rules)
    posts.csv                     one row per post
    stats.csv                     stat snapshots fetched from platforms
    videos/<nnn>-<slug>/          one Content item
      index.html ...              the working tree: the HyperFrames composition and its files; new
                                  content references media as media/<file>, migrated content keeps its
                                  own paths (compositions/, assets/, params.js, vendor/)
      render.mp4                  the one working render of the working tree
      versions/v1/ v2/ ...        code snapshots: no *.mp4, media/, versions/, render.mp4 or notes.md
      media/                      generated and source media, append-only
      notes.md                    YAML frontmatter + body
    refs/<ref-slug>/              a pulled reference: source.mp4, source.json, frames/,
                                  cuts.json, beats.json, transcript.json, breakdown.md
  inbox/                          the same shape without account.md: Content not assigned yet
```

`ralphy content path <id>` prints a Content folder; the account folder is two levels up.

## account.md

```yaml
---
name: UI Effects
niche: ui motion                      # optional: a trend niche slug or free text
schedule: daily 18:00 Europe/Moscow   # optional, free text
platforms:
  - platform: tiktok                  # youtube | tiktok | instagram | x
    handle: "@ui.effects"
    profile: ui-effects-tiktok        # browser profile folder under ~/.config/ralphy/profiles/
    status: unknown                   # ok | needs_login | unknown | paused
    checked_at: null
created_at: 2026-11-17T12:00:00Z
---
```

Body: free markdown. Keep a `## Style` section: the style lock (palette as hex, type families and
weights, caption look, pacing, voice, sound, do-not-do list). Remakes follow it. Optional
`## Niche` (creators, hashtags, search terms you watch) and `## Rules`.

Add a platform by editing the `platforms:` list; keep the YAML valid and check it with
`ralphy account show <account> --json`.

## notes.md

```yaml
---
title: Type Charge
account: ui-effects                   # null in inbox
refs: [refs/type-charge-original]     # paths under the account folder, or URLs
caption: ""                           # optional default caption
created_at: 2026-11-17T12:00:00Z
---
```

Body: the brief, what was copied from which reference, the KEEP / CHANGE / DO NOT ADD list,
decisions, generation log (model, prompt file, cost, request id), what each version changed.

## posts.csv and stats.csv

`posts.csv`: `id,content,platform,handle,status,scheduled_at,posted_at,url,render,caption,error`.
`render` is the path of `render.mp4` relative to `~/ralphy`.
Status: `planned` → `approved` → `uploading` → `published` | `unknown` | `failed` | `needs_login`,
or `cancelled`. Written by `ralphy post`; do not edit it by hand.

`stats.csv`: `fetched_at,platform,handle,url,content,views,likes,comments,shares,saves`. An empty
cell means unknown, never zero.

## Content ids

`<account>/<nnn>-<slug>`. A bare `<nnn>-<slug>` or `<slug>` works when it is unique.

## Config and cache

- `~/.config/ralphy/keys.env` (mode 0600): `NAME=value` lines (`FAL_KEY`, `ELEVENLABS_API_KEY`,
  `OPENROUTER_API_KEY`). Load into one shell command with `set -a; . ~/.config/ralphy/keys.env; set +a`.
  Never print it.
- `~/.config/ralphy/profiles/<account>-<platform>/`: browser profiles (mode 0700). Never open them
  yourself except through `ralphy account`.
- `~/.cache/ralphy/`: safe to delete. Use it for scratch copies (snapshots, experiments), not the
  Content folder.
  - `render/`: temp render folders (the tree is copied there for a render).
  - `post/<post-id>.mp4`: the upload copy of `render.mp4` made when `ralphy post run` starts.
  - `panel/`: panel server state and log (`server.log`).
  - `compare/`: scratch clones for render-vs-render comparisons.
  - trend and library caches.

## Write rules

- `media/` and `versions/` are append-only. A new take or a regeneration gets a new name
  (`vo-take-2.wav`, `scene-03.v2.png`). Never overwrite or delete; failed generations stay.
- `render.mp4` is the only file Ralphy overwrites. `ralphy render <id>` renders a copy of the working
  tree in `~/.cache/ralphy/render/`, moves the result to a hidden temp file next to `render.mp4`,
  checks it with ffprobe, then replaces `render.mp4`; a failed render leaves the old one in place.
- Edit the working tree (`index.html` and its files), then `ralphy content save <id> -m "<what changed>"`.
  A saved version is never edited; the next change is the next version. Versions are APFS clones.
- `ralphy content restore <id> vN` saves the current working tree first (note `before restore of vN`;
  skipped when it equals the latest version), then makes the working tree equal vN. It never touches
  `media/`, `render.mp4`, mp4 files or other versions.
- Reports (`content list/show --json`) include `render` (absolute path or null), `render_stale`
  (a working-tree file is newer than `render.mp4`), `rendered_at` and `versions`.
- Tool outputs: analysis files (`cuts.json`, `beats.json`, `transcript.json`, `ocr.json`, frame
  sheets, compare folders) can be regenerated; media outputs (`pull`, `matte`, `stems`,
  `loudness --normalize`) never overwrite, and `breakdown.md` is never replaced.
- Legacy data (`~/.ralphy`, a checkout's `.ralphy/`) is not read or written.
