# 09 — Distribution & Release — SPEC

> **Vision.** Three channels (GH Releases, brew, npm) publish from a single `/release` invocation. Clean-machine smoke proves the install works before users see it. macOS Gatekeeper is not a surprise.

## Scope

**In:**

- install.sh, install.ps1, install UX
- Brew tap, npm wrapper, GH Releases pipeline
- Code signing & quarantine handling
- `/release` skill polish + CI integration
- Clean-machine smoke automation
- Checksums + verification

**Not in (cross-references):**

- Documentation pages → [`07`](../07-socials-and-docs/)
- Telemetry on install → [`10`](../10-cost-and-telemetry/) (opt-in)
- CLI verb implementation → [`01`](../01-cli/)

---

## 09.01 Install scripts

### 09.01.01 `install.sh` clean-machine smoke per release  [x]
**v1.0:** yes

**Acceptance criteria:**
- GitHub Actions matrix: macOS-14 + ubuntu-22.04 + ubuntu-24.04, runs `install.sh` against a release candidate tag.
- Asserts: `ralphy --version` matches the tag, `ralphy doctor` exits without env errors, install completes in < 60s.
- Runs as a required check on the release PR.

### 09.01.02 `install.ps1` clean-machine smoke per release  [x]
**v1.0:** yes — PS1 is the only Windows install channel per [D-02](OPEN-QUESTIONS.md#decision-log). No `.exe` installer or portable zip distribution.

**Acceptance criteria:**
- GitHub Actions Windows runner (windows-2022) runs `irm install.ps1 | iex` against a release candidate tag.
- Asserts: `ralphy --version` matches the tag, PATH set in current shell, persisted to user PATH, install completes in < 60s.
- Test PATH persistence by spawning a new PowerShell session and re-running `ralphy --version`.
- README + Mintlify document `irm install.ps1 | iex` as the canonical Windows install line — no zip download links in v1.0.

### 09.01.03 install scripts source from a known tag, not "latest"  [x]
**v1.0:** yes

**Acceptance criteria:**
- `install.sh` and `install.ps1` accept `RALPHY_VERSION` env var to pin install to a specific release.
- Default: latest stable (not pre-release).
- Documented in script help.

### 09.01.04 Install scripts respect a `--prefix` / `RALPHY_INSTALL_DIR`  [x]
**v1.0:** yes

**Acceptance criteria:**
- Default: `~/.local/bin/` (sh) / `%USERPROFILE%\.ralphy\bin` (ps1).
- Override via env var.
- Auto-PATH detection prefers existing rc files; appends idempotently.

### 09.01.05 Install scripts have a `--dry-run`  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- `curl install.sh | sh -s -- --dry-run` prints what would happen without writing.
- Same for `install.ps1`.

---

## 09.02 Channels — GH / brew / npm

### 09.02.01 GitHub Releases workflow builds + uploads + checksums  [x]
**v1.0:** yes

**Acceptance criteria:**
- `.github/workflows/release.yml` (current) builds darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64 binaries.
- Uploads to the Release with SHA-256 checksums in `SHA256SUMS`.
- Smoke-runs each binary (`--version`).

### 09.02.02 Brew tap formula auto-updates  [x]
**v1.0:** yes

**Acceptance criteria:**
- After GH Release succeeds, a workflow PRs `alecs5am/homebrew-tap` with bumped version + new sha256.
- PR is auto-merged on green checks (the formula passes `brew test`).
- `brew install alecs5am/tap/ralphy` works for the new version within 5 min of the PR merge.

### 09.02.03 npm wrapper publishes  [x]
**v1.0:** yes

**Acceptance criteria:**
- `npm/package.json` version bumps in lockstep with the root.
- `npm publish --access public` from CI with an org token.
- Postinstall script downloads the right binary from GH and stages it.
- `npm i -g @alecs5am/ralphy && ralphy --version` works.

### 09.02.04 All-channels-or-none on release failure  [x]
**v1.0:** yes

**Acceptance criteria:**
- If any channel publish fails, `/release` reports which channel succeeded and which failed.
- A "delist" verb (`ralphy release delist <version>`) marks a release as unstable on GH and pulls the brew + npm bumps.
- Documented rollback in `docs/release-runbook.md`.

---

## 09.03 macOS Gatekeeper / quarantine

This is the single biggest first-impression bug.

### 09.03.01 Investigate Developer ID signing path  [x] (resolved — D-01)
**v1.0:** no

**Resolution (2026-05-20):** No Apple Developer ID cert for v1.0 per [D-01](OPEN-QUESTIONS.md#decision-log). Brew + npm install paths bypass Gatekeeper; `install.sh` auto-removes quarantine (`09.03.02`). The remaining double-click-from-Finder edge case is covered by `09.03.03` docs. Revisit at v1.5 / v2.0 if support tickets show real Gatekeeper friction.

### 09.03.02 `install.sh` auto-removes quarantine  [x]
**v1.0:** yes

**Acceptance criteria:**
- Implemented in commit `c4e9bb8`.
- Smoke test verifies no quarantine xattr on the installed binary.

### 09.03.03 Documentation for "I got a Gatekeeper warning"  [x]
**v1.0:** yes — canonical surface for the rare direct-download path per [D-01](OPEN-QUESTIONS.md#decision-log).

**Acceptance criteria:**
- A short troubleshooting page in mintlify with the exact `xattr -d com.apple.quarantine /usr/local/bin/ralphy` command + a screenshot of the Gatekeeper dialog.
- README "Trouble?" section has a one-paragraph callout for users who downloaded the binary archive directly (not via brew / npm / `install.sh`) and were blocked.
- Page also clarifies that brew / npm / `install.sh` paths never trigger Gatekeeper, so the workaround is only needed for direct GH Releases downloads.

---

## 09.04 `/release` skill polish

### 09.04.01 Skill drives all channels in one go  [x]
**v1.0:** yes

**Acceptance criteria:**
- `/release` (the skill at `.claude/skills/release/SKILL.md`) walks: status → semver propose → changelog draft → version bumps → tag push → CI watch → brew bump verify → npm publish verify → final summary.
- Only manual step: approving the diff before tag push.
- All steps documented in the skill.

### 09.04.02 Changelog generation is conventional  [x]
**v1.0:** yes

**Acceptance criteria:**
- Skill groups commits by Conventional Commits prefix (`feat`, `fix`, `chore`, etc.).
- "Breaking change" detected from `!:` or `BREAKING CHANGE:` footer.
- Stretch: section ordering customizable (e.g., `feat` and `fix` first, `chore` collapsed).

### 09.04.03 Skill never amends a published release  [x]
**v1.0:** yes

**Acceptance criteria:**
- Documented invariant in `.claude/skills/release/SKILL.md`.
- Re-running on an already-cut version errors with `E_RELEASE_IMMUTABLE`.

### 09.04.04 Credential preflight  [x]
**v1.0:** yes

**Acceptance criteria:**
- Already implemented (commit `e7d67d1`): npm bypass token persisted; preflight checks documented.
- Smoke verifies preflight fails loudly if any credential is stale.

---

## 09.05 Checksums + verification

### 09.05.01 SHA256SUMS published per release  [x]
**v1.0:** yes

**Acceptance criteria:**
- One `SHA256SUMS` file per Release lists every binary's hash.
- Install scripts verify before chmod + move.

### 09.05.02 Verification documented for users who care  [x]
**v1.0:** yes

**Acceptance criteria:**
- README has a "Verify your install" snippet with `shasum -a 256` / `Get-FileHash`.
- Mintlify has the same.

### 09.05.03 SLSA provenance  [ ]
**v1.0:** no

**Acceptance criteria:**
- GH Release includes a SLSA v1.0 provenance attestation generated by the GH Actions slsa-framework generator.
- Documented verification command.

### 09.05.04 `ralphy doctor` checks for newer release  [x]
**v1.0:** yes — per [D-04](OPEN-QUESTIONS.md#decision-log).

**Acceptance criteria:**
- `ralphy doctor` performs an unauthenticated GET against `https://api.github.com/repos/alecs5am/ugc-cli/releases/latest` after the existing env/key checks. 5s timeout; failure is silent (the rest of the doctor run continues).
- When the running binary lags the latest tag (semver compare), doctor prints a one-line hint with the appropriate upgrade command for the detected install mode (`brew upgrade ralphy` for brew, `npm update -g @alecs5am/ralphy` for npm, `curl ... install.sh | sh` for raw install — install mode is reported by `01.09.07`).
- Opt-out via `RALPHY_DOCTOR_NO_UPDATE_CHECK=1` env var OR `ralphy config set doctor.checkUpdates false` (persists in `~/.ralphy/config.json`).
- Doctor JSON output gains a `versions: { current, latest, update_hint? }` block; pretty mode renders the one-liner.
- Smoke: no network call is made for any verb other than `doctor`; verified by a `--no-network-allowed` integration test in `01.11.x`.

**Notes:** explicitly **not** telemetry — no install events, no usage data, no identifiers leave the machine. README + Mintlify quickstart explain how to silence the check.

---

## 09.06 Clean-machine smoke (CI)

### 09.06.01 Per-release: `install.sh` smoke on macOS-14 + ubuntu-22  [x]
**v1.0:** yes

**Acceptance criteria:**
- Required check on the release PR.
- Asserts version + doctor + 1 quick command (`ralphy template list`).

### 09.06.02 Per-release: `install.ps1` smoke on Windows-2022  [x]
**v1.0:** yes

**Acceptance criteria:**
- Same as above for Windows.

### 09.06.03 Per-release: `brew install` smoke after tap bump  [x]
**v1.0:** yes

**Acceptance criteria:**
- Workflow polls brew tap PR merge → runs `brew install alecs5am/tap/ralphy` on a fresh runner.
- Asserts version + doctor.

### 09.06.04 Per-release: `npm i -g` smoke after publish  [x]
**v1.0:** yes

**Acceptance criteria:**
- Workflow polls npm registry visibility → runs `npm i -g @alecs5am/ralphy@<version>` on a fresh runner.
- Asserts version + doctor.

---

## 09.07 Post-launch hardening

### 09.07.01 Windows code signing  [ ]
**v1.0:** no — low priority while PS1 stays the only Windows install path per [D-02](OPEN-QUESTIONS.md#decision-log). PS1 isn't subject to SmartScreen the same way an unsigned `.exe` is; signing unblocks only if a future v2.x ships a clickable installer.

**Acceptance criteria:**
- EV cert obtained or community-cert path documented.
- CI step signs the .exe / signed binary in the distributed archive.
- Trigger condition: a `.exe` installer or signed-binary distribution path is proposed for a post-launch milestone.

### 09.07.02 Reproducible builds  [ ]
**v1.0:** no

**Acceptance criteria:**
- A second build of the same commit produces identical binaries (modulo timestamp).
- Documented build environment.

### 09.07.03 Community-maintained channels (AUR, Snap, Flatpak)  [ ]
**v1.0:** no

**Acceptance criteria:**
- README points at the community maintainers' repos.
- We don't ship them; we link to them.
