# Tester onboarding (soft-launch)

Pinned during the v1.0 soft launch (per [07-D-06](../roadmap/07-socials-and-docs/OPEN-QUESTIONS.md#decision-log)). Stage 1 audience: ~5 hand-picked testers from the target persona (AI-savvy dev who already plays with UGC video).

## What we're asking

Run Ralphy end-to-end on your machine and file what worked + what didn't in [GitHub Discussions → Tester feedback](https://github.com/alecs5am/ralphy/discussions/new?category=tester-feedback).

A useful report covers:

- **Environment** — OS, install channel (brew / curl / npm), ralphy version (`ralphy --version`).
- **Command(s) you ran** — copy-paste, not paraphrase.
- **Observed** — what actually happened. Paste error text verbatim.
- **Expected** — what you thought would happen.
- **Severity** — blocker / friction / minor.

The Discussions "Tester feedback" template walks you through the fields.

## The path we want you to walk

```bash
# 1. Install (pick one)
brew install alecs5am/tap/ralphy
# OR
curl -fsSL https://raw.githubusercontent.com/alecs5am/ralphy/main/install.sh | sh

# 2. Verify
ralphy --version
ralphy doctor             # should fail until step 3

# 3. Setup
ralphy setup              # paste OPENROUTER_API_KEY + ELEVENLABS_API_KEY
ralphy doctor             # should be green now

# 4. Install the skill into your AI agent
ralphy skill install --agent claude    # or cursor / codex

# 5. Create a project
ralphy new "your one-line brief here" --id tester-001

# 6. Hand the project to your agent
#    Open Claude Code / Cursor / Codex inside the project dir;
#    the skill should already be routing through AGENTS.md.

# 7. Render and report back
ralphy render tester-001
ls ~/.ralphy/projects/tester-001/render/   # expect final.mp4
```

Then drop a report in Discussions — even if it shipped cleanly. Especially if it shipped cleanly.

## Sharp edges we already know about

So you don't waste time filing dupes:

- `ralphy mcp` server is post-launch — agents drive the CLI via `--json` subprocess, not MCP.
- `ralphy trend` is post-launch — needs real analytics adapter.
- ~36 legacy `err()` callsites still emit `code: "E_INTERNAL"` instead of a specific catalog code. The error message is still actionable; the code is just generic.
- `docs:cli` regenerates `docs-mintlify/reference/cli/*.mdx` — those pages may surface curated info that the CLI itself doesn't yet emit (e.g. `commonInRef` flag annotations are TBD; we currently pick the first 3 flags deterministically).

If you hit something **not** in the list above, it's worth filing.

## Direct line

If you need to escalate something that's too rough for a public Discussion, ping the maintainer directly via the email in the GitHub profile — `Tester feedback (private)` will be the subject line.

Thanks for testing. The release tag won't ship until the obvious sharp edges from this loop are filed off.
