# 01 — CLI — Open Questions & Decisions

## Open questions

### Q-01: `ralphy make` vs. `ralphy render` — relationship
**Context:** today `render <project-id>` is the back-stage verb. `cli-ux-vision.md` proposes `make "<brief>"` as the front-stage one-shot. Are they peers, or does `make` replace `render` entirely?
**Options on the table:**
- A. Keep both. `make` = "brief → mp4", `render` = "project id → mp4". `make` always finishes with an implicit `render` call. (Recommended in `cli-ux-vision.md`.)
- B. Merge. `render` becomes a sub-mode of `make` (`ralphy make --from-project <id>`).
- C. Deprecate `render`. `make` always operates on a project id (creating one if a brief is supplied).
**Blocking:** `01.01.01` acceptance criteria — specifically what NDJSON events `make` emits when the user supplies a project id vs. a brief.
**Owner:** user.

### Q-02: MCP transport scope for v1.0
**Context:** `ralphy mcp` should default to stdio (matches `claude mcp add`). Should SSE also ship in v1.0?
**Options on the table:**
- A. stdio only. SSE is post-launch. (Default in `01.01.05`.)
- B. Both, with SSE behind `--transport sse`. Doubles the test surface; adds auth questions.
**Blocking:** `01.01.05` acceptance criteria.
**Owner:** user / depends on whether a hosted-agent use case is in play for launch.

### Q-03: Trend data source
**Context:** `ralphy trend` needs to actually crawl TikTok / Reels / Shorts. Today's `research scrape-trends` uses yt-dlp metadata, which is shallow on "velocity". A real velocity signal needs an API or a scraper.
**Options on the table:**
- A. v1.0 ships with yt-dlp-only metadata + clear caveats in docs. "Velocity" is computed from view-count delta over a single fetch — i.e. unavailable on cold runs, only meaningful on re-runs.
- B. Wait for `01.08.03` (external analytics adapters) before shipping `trend`. Slips v1.0 if blocked.
- C. Use an unofficial scraping service (TikTok-Api, etc.) — fragile, ToS-grey, not OSS-friendly.
**Blocking:** `01.01.02` acceptance criteria.
**Owner:** user.

### Q-04: Cross-agent skill install layout
**Context:** Claude has `~/.claude/skills/`. Cursor has `.cursor/rules/`. Codex reads `AGENTS.md`. `ralphy skill install` has to normalize. What does "install" mean per agent?
**Options on the table:**
- A. Per-agent adapter — each agent gets a hand-written translation of the playbook routing into its native format.
- B. Universal pointer — every agent gets a stub that says "read `<repo>/AGENTS.md`". Less rich, but cheap and consistent.
- C. Start with Claude only for v1.0; document the others as post-launch.
**Blocking:** `01.01.06` acceptance criteria.
**Owner:** user.

### Q-05: `--dry-run` for `make` and `iterate` — depth
**Context:** for a single-verb dry-run (`generate video --dry-run`), the resolved request body is one object. For `make --dry-run`, it's a full plan: template choice, scene count, model picks, asset writes, render. How verbose?
**Options on the table:**
- A. Full unrolled plan (every scene, every model call). Long output but agent can audit it.
- B. Summary + per-stage estimate (no per-scene breakdown). Shorter, less inspectable.
- C. A: full by default, B: `--summary` flag for the compact form.
**Blocking:** `01.01.01` and `01.02.05` acceptance criteria.
**Owner:** user.

### Q-06: Default verbosity on TTY
**Context:** when stdout is a TTY and the user did not pass `-p` or `--json`, what should `ralphy` do? Today some verbs default to pretty (helpful), others default to JSON (consistent).
**Options on the table:**
- A. Always JSON (consistent, parseable, machine-default). Power users learn to type `-p`.
- B. Pretty on TTY, JSON otherwise. Friendlier first impression but agents that allocate a TTY (some shells do) get surprises.
- C. Pretty only for a closed list of "viewer" verbs (`doctor`, `status`, `models list`, `template list`); JSON for everything else.
**Blocking:** `01.02.02` acceptance criteria.
**Owner:** user. Default leaning: C.

### Q-07: Error code stability across patch versions
**Context:** the catalog (`01.06.01`) is supposed to be stable. What's the policy when a code is renamed or merged?
**Options on the table:**
- A. Codes are append-only after v1.0. Renames forbidden; old codes can be marked deprecated but never removed.
- B. Codes are versioned via the major version (`v1` codes, `v2` codes). Adds complexity.
- C. Free renaming with a CHANGELOG section; agents must update on minor bumps.
**Blocking:** `01.06.01` acceptance criteria (for the policy statement).
**Owner:** user.

---

## Decision log

*(empty — fill as questions resolve)*

Format for entries:

```markdown
### D-NN: <title> (YYYY-MM-DD)
**Was:** Q-NN
**Decision:** <what we chose>
**Why:** <one or two reasons>
**Consequences:** <what SPEC tasks changed>
```
