---
name: panel
namespace: user
description: >-
  Open the read-only Ralphy side panel in the agent host's built-in browser, next to the chat: live job activity (running, failed, queued, done), the owner's own accounts with their uploads and views, and trend references to copy (picks with evidence, rising signals, top videos, formats and hooks per niche).
  USE WHEN the user asks to see what Ralphy is doing, wants a panel / dashboard / side view of jobs or renders, wants to browse trends or references visually, wants to see which of their accounts or uploads is taking off, or asks to open Ralphy in the browser next to the chat.
  TRIGGER (EN): "open the panel", "show me what ralphy is doing", "open ralphy on the right", "show trends in the browser", "trend dashboard", "where is my render", "show my accounts".
  DO NOT FIRE for a one-off answer the CLI gives directly (one job's status, one niche report) unless the user wants to watch it.
---

# panel

`ralphy panel` serves one page on `http://127.0.0.1:4777/`. It never writes to the
library: it reads the root-wide job queue in-process and computes trend views
through `ralphy --json trends …` child processes. The user looks at it in the
host's built-in browser while chatting with you.

## Start it only on request

AGENTS.md invariant 5 forbids auto-launched processes. Start the panel when the
user asks for it, never as a side effect of another task.

0. Check that the installed CLI has the command: `ralphy panel --help`. CLI 0.4.0
   and older report an unknown command; tell the user the panel needs a newer
   release (load the `install` skill to upgrade) instead of improvising a server.
1. Start it in the background with the user's data root. It runs in the foreground
   until stopped, so use your host's background-command facility:

   ```sh
   ralphy panel                      # default root, port 4777
   ralphy --root ~/.ralphy panel     # an explicit library
   ralphy panel --trend-workspace trend-corpus --port 4780
   ```

   The first stdout line is JSON: `{ url, port, root, reused, trendWorkspace }`.
   `reused: true` means a panel already serves this root on that port; use its
   URL and do not start another. A port held by a panel for another root fails with
   `E_INPUT_INVALID`; pass another `--port`.
2. Open `url` in the host's built-in browser:
   - Claude desktop (Code tab): the browser pane (`preview_start` with `url`, or
     `navigate`).
   - Codex desktop: the in-app browser.
   - Hosts without a browser pane: give the user the URL to open themselves.
3. Point the panel at what the user asked about with a deep link instead of
   describing where to click:
   - `#/activity`: jobs.
   - `#/accounts`: owned accounts by niche (session, best and median views,
     followers) and uploads that need the owner, are queued, or are published
     with views against the account median.
   - `#/trends/<niche>/picks`: report picks with evidence.
   - `#/trends/<niche>/rising`: breakouts, small-account breakouts, emerging formats.
   - `#/trends/<niche>/top?since=7d&by=views&platform=tiktok&label=breakout`.
   - `#/trends/<niche>/formats`: format and hook lift.

   Niche slugs come from `ralphy --workspace <corpus> trends niche list`.

## Hand-off between the panel and the chat

The panel cannot write into the chat. The user copies an item with **Copy for agent**
(or `c`) and pastes it; a pasted block starts with `Trend reference (<niche>…)`,
`Emerging format in <niche>` or `Ralphy job #<id>`. Treat it as the user's
selection: the URL, numbers and reasons are the evidence, and `ralphy queue logs <id>`
reads a pasted job's logs. **Saved** (`s`, `Shift+S`) lives in that browser only;
ask the user to use **Copy all for agent** when you need the whole list.

## Reading the views

- **Picks** is the niche report's "what to copy" list. `adapt` has strong evidence,
  `test` is promising. Prefer it when the user wants references to produce.
- **Rising** comes from `trends signals`; it is computed on demand and takes about
  20 seconds the first time.
- Multipliers are views against the creator's own rolling median, not platform data.
- "data from <date>" is when the corpus last collected metrics. A stale date means
  `ralphy --workspace <corpus> trends refresh --due` is due; ask before running it,
  because it scrapes external sources (paid Apify sources run only with `--paid`).

## Stop

Stop the background command you started. Nothing else needs cleanup.
