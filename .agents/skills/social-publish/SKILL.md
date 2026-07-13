---
name: social-publish
namespace: user
description: >-
  Publish or schedule a finished Ralphy Unit through the active workspace's saved Postiz connection. Prepares the target-shaped title, description, body, CTA, hashtags, thread parts, and required Postiz settings, then calls `ralphy publish` and records provenance for later analytics. USE WHEN the user asks to "publish this", "post it now", "schedule this post", "send this to Telegram", "post this thread to X", "publish the reel", or "put this on YouTube/Instagram". DO NOT FIRE for copy-only requests with no posting intent; use social-copy instead.
---

# Social publish

Turn a finished Unit into a real or scheduled social post through the workspace's saved Postiz account. The user talks to the agent; the agent operates the CLI.

## Required context

1. Run `ralphy` once for the user profile and active-workspace memory digest.
2. Resolve the target workspace. For the Ralphy brand, use `ralphy-automaton`.
3. Read both files before writing copy:
   - `.ralphy/workspaces/<workspace>/workspace.json`
   - `.ralphy/workspaces/<workspace>/SOCIAL_STRATEGY.md`
4. Never ask for, print, or copy the Postiz API key. It is already stored in the workspace credentials file.

## Ralphy channel bindings

| Target | Account | Role |
|---|---|---|
| Instagram | `agety.dev` / Ralphy The Ghost | visual product persona, reels, carousels, polished demos |
| YouTube | `@ralphy_ugc` | tutorials, case studies, complete product demos |
| X | `@alecs5am` | founder-led build-in-public, technical insights, launches |
| Telegram | Ralphy UGC | community updates, behind the scenes, releases, frequent posts |

Use the public integration IDs from `workspace.json`; never hard-code credentials in a Unit.

## Intent contract

- Explicit "publish/post now" authorizes `--now`.
- An explicit date/time authorizes `--at <ISO>` after resolving it in the workspace timezone.
- "Prepare", "draft", or ambiguous wording does not authorize an external post. Form the Unit and show the prepared copy, then stop.
- Never invent a schedule. Ask one concise question only when the requested time cannot be resolved.

## Prepare the Unit

### Existing media Unit

Read `unit.json`, the project brief, and the actual media. Ensure the Unit has source-grounded social copy:

```bash
ralphy unit caption <project> <unit-slug> --language English --niche saas
```

The copy must describe the actual content. Include a platform-shaped title/description, a soft CTA, and a small relevant hashtag set. Do not add generic trend tags unrelated to the Unit.

### Workspace text post

Form a first-class workspace Unit. Include the complete ready-to-post body, including CTA and hashtags, in `--text`:

```bash
ralphy unit create --workspace <workspace> \
  --slug <kebab-slug> --format post \
  --text '<ready post body>' --destination telegram
```

For an X thread, store an ordered JSON string array so Postiz receives ordered thread parts:

```bash
ralphy unit create --workspace <workspace> \
  --slug <kebab-slug> --format thread \
  --text '["First post", "Second post", "Final post"]' --destination x
```

If X and Telegram need meaningfully different copy, create separate Units. Do not force one generic body across channels.

## Publish

Workspace Unit:

```bash
ralphy publish <unit-slug> --workspace <workspace> --targets telegram --now
ralphy publish <unit-slug> --workspace <workspace> --targets x --at <ISO>
```

Project media Unit:

```bash
ralphy publish <project> <unit-slug> --targets instagram --now
ralphy publish <project> <unit-slug> --targets youtube --at <ISO>
```

The CLI binds the correct Postiz integration, uploads non-text media, supplies provider settings, appends the Postiz post ID/status to `unit.json`, and guards retries with the workspace publish ledger.

## After publishing

Report only:

- target account;
- published now or scheduled time;
- success/failure per target and Postiz post ID;
- clickable Unit path;
- the next analytics pull command.

For workspace Units:

```bash
ralphy analytics pull <unit-slug> --workspace <workspace>
```

Do not claim a post succeeded unless the CLI returned a successful target record.
