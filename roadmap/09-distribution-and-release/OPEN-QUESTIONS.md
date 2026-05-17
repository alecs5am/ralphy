# 09 — Distribution & Release — Open Questions & Decisions

## Open questions

### Q-01: macOS Developer ID signing — pay for the cert or document the workaround?
**Context:** $99/year. Removes the Gatekeeper prompt entirely. Without it, every macOS user sees a scary "can't be opened" dialog the first time and has to right-click → Open OR run `xattr -d com.apple.quarantine`.
**Options:**
- A. Pay. Best UX. Recurring cost.
- B. Document the workaround prominently in `install.sh` output + landing + mintlify. Free. Worse first impression.
- C. Pay only at v1.0 launch; document until then.
**Blocking:** `09.03.01`.
**Owner:** user (budget decision).

### Q-02: Windows install — separate `.exe` installer or PowerShell one-liner only?
**Context:** PS1 works but feels less polished than a clickable installer. A real .exe (WiX or NSIS) adds complexity and code signing pressure.
**Options:**
- A. PS1 only for v1.0. Clean, scriptable.
- B. PS1 + .exe (community-built or maintained ourselves). Polish.
- C. PS1 + a portable zip; document manual PATH.
**Blocking:** `09.01.02` polish.
**Owner:** user.

### Q-03: Pre-release / beta channel?
**Context:** today every release is "stable". Do we want a separate channel for testing?
**Options:**
- A. Single channel. v0.x communicates "expect breakage".
- B. `@beta` npm tag + brew `--HEAD` install + GH "pre-release" mark. Users opt into bleeding edge.
- C. Just GH "pre-release" mark; no npm/brew beta channel.
**Blocking:** `09.04.02`.
**Owner:** user. Default lean: C until enough users justify B.

### Q-04: SemVer strictness for v0.x
**Context:** today we're at v0.0.2. Conventional Commits suggests every `feat:` is a minor bump and every `fix:` a patch. But in v0.x, the convention is "anything can break". When does v1.0 happen?
**Options:**
- A. v1.0 ships when all v1.0-flagged tasks across the roadmap are `[x]`. Pure feature-driven.
- B. Pre-commit to a date.
- C. Cut v0.1, v0.2 along major milestones; v1.0 when the full ship-criteria list is done.
**Blocking:** master `README.md` lifecycle.
**Owner:** user. Default lean: A.

### Q-05: Auto-update — opt-in pull or do we never phone home?
**Context:** binary today never checks for updates. Users find out from the landing or `brew outdated`.
**Options:**
- A. Never phone home. Cleanest privacy story.
- B. `ralphy --version --check-update` is an opt-in verb that hits the GH Releases API.
- C. Soft nag on `ralphy doctor` when a newer version exists (still requires network).
**Blocking:** none currently, but worth a decision for v1.0 messaging.
**Owner:** user. Default lean: B.

---

## Decision log

*(empty — fill as questions resolve)*
