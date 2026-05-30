---
id: 03.01.04
status: done
v1_0: yes
category: 03-skills
topic: "03.01 agentskills.io compliance"
title: "Two-namespace skill split: ralphy: (user) vs ralphy-dev: (maintainer)"
---

# 03.01.04 — Two-namespace skill split: `ralphy:` (user) vs `ralphy-dev:` (maintainer)

**v1.0:** yes

**Implementation:** Frontmatter `namespace:` field added to every SKILL.md. User-invokable skills (`evaluator`, `researcher`, `templater`, `install`) → `ralphy`; maintainer-only (`release`, `ralphy-remotion`, `skill-creator`) → `ralphy-dev`. Lint enforces the allow-list via `scripts/lint-skills.ts`. Installer respects `--dev` to opt into the maintainer set (default off). Folder layout unchanged — namespace lives in frontmatter only. The `postmortem` skill listed in the original classification doesn't exist as a separate folder yet; if added later it will inherit `namespace: ralphy`.

**Acceptance criteria:**
- Repo `.agents/skills/` is reorganized into two top-level groups so slash commands surface as `/ralphy:<skill>` for end-users and `/ralphy-dev:<skill>` for maintainer-only flows. Mechanism: either nested directories (`.agents/skills/ralphy/<skill>/SKILL.md` + `.agents/skills/ralphy-dev/<skill>/SKILL.md`) or a `namespace: ralphy | ralphy-dev` frontmatter field consumed by the install wizard — implementation chooses whichever Claude Code's slash-prefix rendering supports cleanly.
- Initial classification:
  - **`ralphy:`** (user-invokable): `postmortem`, `evaluator` → `evaluator`, `researcher` → `researcher`, `templater` → `templater`, `install` → `install` (the skill names lose the redundant `ralph-` / `ralphy-` prefix because the namespace prefix already says it).
  - **`ralphy-dev:`** (maintainer-only): `release`, `ralphy-remotion`, `skill-creator`.
- `ralphy skill install` (the wizard from `03.02.06`) installs only the `ralphy:` namespace by default. `ralphy skill install --dev` (or auto-detect when running inside the `alecs5am/ugc-cli` checkout) additionally installs the `ralphy-dev:` namespace.
- Rename / symlink migration is captured in a small migration note (no breakage for existing maintainer-side usage of `/release` — old slash names alias to the new namespaced names for one release cycle, then drop).
- README + Mintlify quickstart reference only `ralphy:` slash commands. The `ralphy-dev:` namespace is documented in `CONTRIBUTING.md` / `docs/dev-skills.md`, not in the public quickstart.

**Notes:** rationale — keeps the user-facing slash menu uncluttered (a tester typing `/` shouldn't see `/release` and wonder if it ships their project; that's a maintainer-only operation on the ralphy binary itself). The split also lets us evolve the maintainer skill set freely without affecting the user-facing surface contract.
