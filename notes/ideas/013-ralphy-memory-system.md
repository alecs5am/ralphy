# Ralphy memory system — self-learning across projects, tiered by scope

> **Status:** idea
> **Filed:** 2026-06-11
> **Folder:** ideas

## Context

Requested by the user 2026-06-11. Today the only durable cross-project learning
lives in the agent's PRIVATE Claude memory (one machine, see issue #060) and in
per-project `postmortem/` sets that nothing re-reads automatically. Ralphy
itself forgets everything between projects: model failure modes rediscovered,
user corrections re-made, style preferences re-asked.

## What

A first-class memory subsystem for Ralphy that self-learns as projects
complete and captures user remarks, tiered by scope to match the #108 layout:

- **Global memory** — `.ralphy/memory/` (cross-workspace: model quirks, prompt
  craft, tooling lessons).
- **Workspace memory** — `.ralphy/workspaces/<ws>/memory/` (universe/client
  facts: cast, style DNA, audience, what this client rejects).
- Ingestion: a post-project hook (postmortem distillation -> memory entries)
  plus an explicit `ralphy memory note "<text>" [--workspace]` for user
  remarks mid-flight.
- Recall: loaded into agent context at intake by scope (global + active
  workspace), searchable (`ralphy memory search`).

Reference architecture to study: <https://github.com/nousresearch/hermes-agent>
— file-based MEMORY.md/USER.md, a closed learning loop with agent-curated
memory + periodic nudges, FTS5 session search with LLM summarization for
cross-session recall, Honcho dialectic user modeling, and self-improving
procedural memory (skills).

## Why it matters

Every postmortem lesson currently dies in its project dir. A memory tier turns
the 100+-project history into compounding craft knowledge that ships with the
workspace — and makes Ralphy usable by a team, not one operator's private
memory.

## Notes

- Entries need the "Does NOT apply to:" negative-scope discipline (the
  over-application failure mode is known — see #045 in done/).
- Cross-links: #060 (one-time mining of the agent's private memory — becomes
  seed data for global memory), #108 (workspace layer this nests in),
  `postmortem` skill (natural ingestion source), #069 units (provenance).
- Open questions: plain-markdown vs SQLite+FTS index; auto-ingest vs
  user-approved promotion; how recall enters context without bloating intake.
