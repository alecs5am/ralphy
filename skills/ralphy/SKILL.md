---
name: ralphy
description: >-
  Main Ralphy skill. When the user asks to see their videos or invokes Ralphy with no task, the
  first action is `ralphy panel`: it opens the panel with every video in the browser and returns
  at once; give its URL and do not list videos in chat. Also: the folders, the verbs, the loop
  (reference, copy, remake, post, stats), the hard rules, and which Ralphy skill to load next for
  making, copying, reworking or posting short vertical videos, planning a series or checking
  results. Triggers: "show my videos", "open the panel", "make a video for my account", "what
  should I post next", "make 5 episodes", "покажи мои видео", "покажи видосики", "открой панель",
  "сделай видео для аккаунта", "сделай серию", "что дальше постить".
---

# ralphy

## Start here

When the user invokes Ralphy without a concrete task, or asks to see their videos, your first
action is `ralphy panel`. It starts the panel in the background (or reuses a running one), opens
it in the browser and returns at once. Reply with the URL in one line. Do not print a table or list
of videos in chat: the panel shows them with previews, versions and posts. Then ask what to work on.

Ralphy is a plugin that keeps what an agent cannot keep alone: state across sessions (plain files
under `~/ralphy`), the browser sessions of the user's accounts, the hosted trend base and component
library, and the panel. Everything else (ffmpeg, yt-dlp, curl, HyperFrames, the fal MCP server) you
run yourself.

Two entities:

- **Content**: one vertical video. A HyperFrames composition plus media, references, saved versions
  (`v1`, `v2`, ...: code snapshots), one working render (`render.mp4`) and posts. Id:
  `<account>/<nnn>-<slug>`.
- **Account**: a media persona (`~/ralphy/<account>/account.md`): persona, style lock, platforms
  (YouTube, TikTok, Instagram, X), schedule, `posts.csv`, `stats.csv`.

Folder layout, file formats and write rules: `references/layout.md`. Read it before touching files.

## The loop

1. **Account.** Read `account.md`: persona, `## Style` (the style lock), rules. No account yet:
   `ralphy account new "<Name>"`, then write the persona and style with the user (`ralphy-publish`).
2. **Reference.** Find a fresh video that beat its creator's median (`ralphy-trendwatch`). No reference
   with good numbers, no production: say so and keep searching.
3. **Content.** `ralphy content new <account> "<title>" --ref <url>`; `ralphy content path <id>` gives
   the folder.
4. **Copy (v1).** Rebuild the reference as exactly as possible: structure, timing, cuts on the beat,
   text, sound (`ralphy-reverse`). Save it as v1.
5. **Remake (v2+).** Rework the copy for the account: style lock, subject, text, offer; keep the
   timing skeleton; compare against the copy and the reference (`ralphy-remake`).
6. **Render.** Save before risky changes (`ralphy content save <id> -m "<note>"`), then
   `ralphy render <id>` overwrites `render.mp4`. Show frames and the path. Go back with
   `ralphy content restore <id> vN`.
7. **Post.** Plan, get the user's explicit go, run (`ralphy-publish`).
8. **Learn.** `ralphy stats show <id>`: retention, where viewers left, average view; read it against the
   account's other videos and the reference; turn it into one change for the next version
   (`ralphy-trendwatch/references/signals-to-fixes.md`).

## Which skill

| Request | Skill |
|---|---|
| "what's trending", "find a reference", "что в трендах", "найди референс", "почему не залетело" | `ralphy-trendwatch` |
| "copy this video", "make it like the reference", "скопируй ролик", "сделай как в референсе", "разбери по таймкодам" | `ralphy-reverse` |
| "remake it for my account", "swap the product", "переделай", "адаптируй под аккаунт" | `ralphy-remake` |
| "post it", "schedule", "add my TikTok", "залей в аккаунт", "опубликуй", "подпись" | `ralphy-publish` |
| "generate an image / clip / voice / music", "сгенерируй", "озвучь", "сколько стоит" | `ralphy-fal` |
| "a ready effect or component", "из библиотеки" | `ralphy-library` |
| cuts, beats, transcript, OCR, loudness, stems, cutouts, compare | `ralphy-media` |
| install, keys, doctor, "не работает" | `ralphy-setup` |

Compositions follow the upstream HyperFrames skills (`bunx hyperframes@0.6.31 skills`). Ralphy
adds only the engine pitfalls it has paid for: `references/hyperframes-pitfalls.md`.

## Verbs

Every verb takes `--json` and then prints one JSON object; errors are
`{"ok": false, "error": {"code", "message", "hint"}}` with exit code 1.

| Need | Command |
|---|---|
| Environment, keys present | `ralphy doctor` (first install: `ralphy setup`) |
| Accounts | `ralphy account new "<Name>"`, `list`, `show <account>` |
| Browser sign-in | `ralphy account login <account> <platform>`, `check <account> [<platform>]`, `open <account> <platform>` |
| Content | `ralphy content new <account or inbox> "<title>" [--ref <url or path>]`, `list [--account a]`, `show <id>`, `path <id>` |
| Versions | `ralphy content save <id> [-m "<note>"]`, `ralphy content restore <id> vN` |
| mp4 | `ralphy render <id>` (renders the working tree, overwrites `render.mp4`) |
| Posting | `ralphy post plan / approve / run / list / cancel / timer` (see `ralphy-publish`) |
| Stats | `ralphy stats fetch <account> [--all]`: numbers into `stats.csv`, retention and watch time into `analytics.jsonl`; `ralphy stats show <id or account>` |
| Trend base | `ralphy trends --list`, `ralphy trends <niche> --limit 20` |
| Component library | `ralphy lib search "<query>" [--kind <kind>]`, `ralphy lib get <id>` (see `ralphy-library`) |
| Bundled tools | `ralphy tool --list`, `ralphy tool <name> [args]` (see `ralphy-media`) |
| Panel | `ralphy panel [--no-open] [--port 4777]` (idempotent, returns at once), `ralphy panel stop` |

Unsure about a flag: `ralphy <verb> --help`. Do not invent verbs; if a need has no verb, do it with
your own tools and the files.

## Hard rules

1. **No paid generation and no posting without the user's explicit go.** Show the cost first. A go
   covers the batch it was given for, not the next one. "Prepare" or "plan it" is not a go to post.
2. **Never delete media or versions; `render.mp4` is the only file Ralphy overwrites.** A
   regeneration gets a new file name. Edit the working tree; `ralphy content save` snapshots it.
   Never edit `versions/`.
3. **Start from a working reference (reverse), then remake.** No invented scripts, no scenario
   writing from scratch. A lightly changed copy of a proven video is the most reliable way to avoid
   slop; videos made without one were rejected as "very sloppy, we need references".
4. **Use your own tools freely.** Ralphy verbs exist only for state, posting, rendering, trends,
   the library and the panel.

Also:

- No photoreal AI people or pets; the owner rejects realistic AI content. Authored, non-photoreal
  looks only, unless the user supplies real footage.
- Keys live in `~/.config/ralphy/keys.env`. Never ask for a key in chat, never print one.
- The user's verdict beats any metric. When they say it looks worse than the reference, it is
  worse; measure to find out why, not to argue.
- `ralphy panel` is the one background process. Start it when the user asks to see their videos or
  invokes Ralphy without a concrete task. It opens the browser and prints the URL; give the URL to
  the user.

## Series

Make episode 1 through the whole loop and get the user's approval. Later episodes: new Content per
episode, copy the approved composition as the base, change subject, text and media only; keep the
timing, voice, music and caption setup. Each episode copies its own reference or the proven episode 1.
