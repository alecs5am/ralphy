# Ralphy

Ralphy is a plugin for your coding agent (Claude Code, Codex, or any agent that reads skills) that
makes short vertical videos for your own accounts. You talk to your agent; Ralphy gives it what it
cannot keep on its own:

1. **Trendwatching.** A hosted trend base of videos that beat their creator's usual numbers, plus
   scouting for your own niche. Every video starts from a reference that already worked.
2. **The panel.** `ralphy panel` starts a local page with your Content and your Accounts in the
   background and opens it in your browser.
3. **Posting.** Your agent posts to your own YouTube, TikTok, Instagram and X accounts from a
   separate browser profile per account, after you approve each post.
4. **A component library.** Ready motion components, video blocks and prompts your agent can reuse.

The method: the agent copies a reference video as exactly as it can (structure, timing, cuts on the
beat, text, sound), then reworks the copy for your account (your style, subject, text and offer),
compares the result with the copy and the reference, and shows you the cost before any paid
generation.

## Install

**Claude Code**

```
/plugin marketplace add alecs5am/ralphy
/plugin install ralphy@ralphy
```

**Codex**

```
codex plugin marketplace add alecs5am/ralphy
```

**Any other agent**

```
git clone https://github.com/alecs5am/ralphy
export PATH="$PWD/ralphy/bin:$PATH"
ralphy setup
```

Point the agent at `ralphy/skills/`.

[uv](https://docs.astral.sh/uv/) installs itself on the first run (set `RALPHY_NO_AUTO_INSTALL=1` to
install it yourself) and creates the Python environment from `uv.lock`. Bun is needed only when you
render a video with HyperFrames, and installs itself on the first render if Bun and Node are both
missing. You also need [ffmpeg](https://ffmpeg.org) (`brew install ffmpeg` on macOS) and Google
Chrome for posting.

## First steps

```
ralphy setup      # creates ~/ralphy and ~/.config/ralphy, checks your machine
ralphy doctor     # what is installed, which keys are set (names only)
```

Put your keys in `~/.config/ralphy/keys.env` with your own editor, one `NAME=value` per line:
`FAL_KEY` (generation through fal), and optionally `ELEVENLABS_API_KEY` and `OPENROUTER_API_KEY`.
Never paste keys into the chat. To give your agent the fal tools, start it from a shell that has
`FAL_KEY` set, or connect fal with OAuth (`ralphy-setup` skill has both ways).

Then ask your agent, for example:

- "Create an account UI Effects for TikTok and YouTube Shorts, my handle is @ui.effects."
- "What is working in UI motion this month? Show me five references."
- "Copy the second one, then remake it for UI Effects with our product. Show me the cost first."
- "Post it to TikTok tomorrow at 18:00."

## Where your files live

```
~/ralphy/
  ui-effects/                     an Account
    account.md                    persona, style, platforms
    posts.csv  stats.csv          what was posted, how it did
    videos/001-type-charge/       one video: the composition, notes, versions, media, render.mp4
    refs/<slug>/                  a reference with its breakdown
  inbox/                          videos not assigned to an account yet
~/.config/ralphy/                 keys.env, browser profiles
~/.cache/ralphy/                  caches, safe to delete
```

Everything is plain files you can open, back up or edit. Media and saved versions are never deleted.
`render.mp4` is the one working render of each video; every render replaces it.

## Privacy

Ralphy has no telemetry and sends nothing to its authors. Requests go only to the services you set
keys for and to your own accounts. Details: [PRIVACY.md](PRIVACY.md).

## Developing Ralphy

See [AGENTS.md](AGENTS.md). Checks: `uv run ruff check ralphy tools tests` and `uv run pytest`.

License: [Apache-2.0](LICENSE).
