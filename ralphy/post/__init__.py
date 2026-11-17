"""Posting to the owner's own accounts from one browser profile per account and platform.

- `platforms`: what Ralphy knows about each platform without a browser (URLs, caption and media limits).
- `checks`: `ffprobe` and caption checks against those limits.
- `profiles`: the `platforms:` entries of `account.md`, browser profile folders, profile locks, bound identities.
- `browser`: the patchright launcher (real Google Chrome, headed, persistent profile).
- `recipes`: the per-platform browser steps (session check, upload).
- `posts`: `posts.csv` rows: plan, approve, cancel, resolve, list.
- `run`: `post run`, `account login|check|open`.
- `hook`: the Claude Code PreToolUse hook that asks the owner before `post approve` or `post run`.
"""
