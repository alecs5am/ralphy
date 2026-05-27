# 09 — Distribution & Release — Open Questions & Decisions

## Open questions

### Q-01: macOS Developer ID signing — pay for the cert or document the workaround? → D-01

### Q-02: Windows install — separate `.exe` installer or PowerShell one-liner only? → D-02

### Q-03: Pre-release / beta channel? → D-05

### Q-04: SemVer strictness for v0.x → D-03

### Q-05: Auto-update — opt-in pull or do we never phone home? → D-04

---

## Decision log

### D-05: Single release channel; v0.X is the "expect breakage" signal (2026-05-20)
**Was:** Q-03
**Decision:** Ralphy has exactly one release channel. No `@beta` npm tag, no `brew --HEAD`, no `pre-release` GH marker for normal cuts. Each staged v0.X milestone (per [D-03](#decision-log)) ships as a regular GitHub release; users on `latest` get the new milestone on `brew upgrade` / `npm update -g`. The `v0.X` versioning is itself the "anything-may-break" signal — that's what SemVer 0.x communicates to consumers by convention.
**Why:** A separate beta channel costs `/release` skill complexity (two publish paths, divergent install instructions in README) and only pays off when the stable audience is large enough that breakage on `latest` hurts more than the friction of opt-in. v1.0 audience is small and self-selecting (per `07-D-06` soft launch). The staged-milestone model already gives careful adopters a "pin to v0.X" escape hatch.
**Consequences:**
- `09.04.02` (changelog generation) keeps its single-channel assumption. No beta-track classification rules to write.
- README / Mintlify install snippets remain singular — no "want bleeding edge? install `@beta`" sidebars.
- A future v2.x might reopen this question if a stable user base wants to opt into pre-release builds; track as a new question (`Q-NN`) at that time rather than reusing this one.
- Internal RC verification (pre-tag) happens on `release/<version>` branches via the `/release` skill smoke tests, not via a published GH pre-release.

### D-04: `ralphy doctor` performs an opt-out update check (2026-05-20)
**Was:** Q-05
**Decision:** The binary doesn't phone home in the hot path (no implicit check on `ralphy <verb>`). `ralphy doctor` — which already hits the network to validate API keys — performs an additional unauthenticated GET against the GitHub Releases API and prints a one-line "newer version v0.Y.Z available; `brew upgrade ralphy` / `npm update -g @alecs5am/ralphy`" hint when the running binary lags. The check is **opt-out** via `RALPHY_DOCTOR_NO_UPDATE_CHECK=1` env var or a one-time `ralphy config set doctor.checkUpdates false`.
**Why:** Doctor is already a "things might be wrong" surface — users invoke it deliberately, expect network calls, and benefit from learning about new versions in the same breath. Keeping it out of the hot path preserves the no-phone-home privacy posture for everyday verbs. A dedicated `ralphy --version --check-update` verb (Option B) is discoverable but rarely run; never-phone-home (Option A) leaves users on broken old versions because they never learn there's a fix.
**Consequences:**
- New SPEC task `09.05.04` (update-check in doctor) — `v1.0: yes`. Acceptance: 5s timeout on the GH Releases API call; failure is silent (doctor still reports the rest of the checks).
- Doctor output structure gains a `versions: { current, latest, update_hint? }` block in JSON mode; pretty mode renders the one-liner.
- README and Mintlify quickstart describe how to silence the check.
- This does NOT count as telemetry; no install events, no usage data, no identifiers leave the machine — just a GET against `api.github.com/repos/alecs5am/ugc-cli/releases/latest`.

### D-03: Staged v0.X milestones; v1.0 still gated by all v1.0-flagged tasks (2026-05-20)
**Was:** Q-04
**Decision:** Releases follow a staged v0.X path with named milestones, each capturing a coherent slice of progress. v1.0 is still feature-driven (all `v1.0: yes` tasks across categories 01–11 are `[x]`), but it is reached through a series of opinionated v0.X cuts rather than a single jump from "v0.x" to "v1.0". Initial milestone plan (revisable as scope tightens):
- **v0.1 (shipped 2026-05-19)** — foundation: pretty/JSON CLI contract, adaptive intake, append-only generations, template library, asset cache.
- **v0.2 — Tester onboarding** — closes the install → agent-setup → first-project tester path: `ralphy skill install` for Claude/Cursor/Codex (`01.01.06`), README rewrite + landing showcase in place, GitHub Discussions live, `ralphy doctor` update check (`09.05.04`).
- **v0.3 — CLI surface lock** — closes `01.01.03` (`clone`), `01.02.03`/`.04`/`.05` (output contract), `01.06.01–03` (error catalog), `01.07.x` (NDJSON + SIGINT), `01.09.x` (standalone operation).
- **v0.4 — Quality gates** — closes category 08 (scoreScenario / scoreImage / scoreVideo refuse, not warn) and the council-mode skeleton.
- **v0.5 — Distribution dress rehearsal** — closes remaining `09.01.x` smoke tests, GH Releases checksum verification, brew + npm green on a clean-machine CI run.
- **v1.0** — every remaining `v1.0: yes` task in every category is `[x]`, including 02 (prompts adapters), 04 (producer mode), 06 (utilities), 07 (Mintlify polish), 10 (cost & telemetry), 11 (testing).

Milestones are **not pre-committed dates** — they are the next logical "ship something coherent" point. A milestone may slip to the next number if a v1.0-flagged task slips into it.
**Why:** Option A (pure feature-driven without milestones) makes progress invisible to testers and contributors — every cut is "v0.x, things might break". Option B (date-driven) risks shipping incomplete invariants under deadline pressure. Staged milestones (Option C) give the soft-launch tester audience (per `07-D-06`) clear "what changed" anchors without committing us to dates we'd miss.
**Consequences:**
- `roadmap/README.md` lifecycle section gets a "Milestone path" subsection listing the v0.X cuts above.
- `/release` skill reads the current milestone target from `roadmap/README.md` and surfaces it in the proposed CHANGELOG header (e.g., `## v0.2 — Tester onboarding (YYYY-MM-DD)`).
- Each v0.X cut still runs the full `/release` channel set (GH, brew, npm). The milestone name is purely editorial.
- Q-03 (beta channel) remains open — the staged-milestone path itself is the "people who want to follow along closely just pin to v0.X" answer; revisit Q-03 only if testers ask for a separate `@beta` track.

### D-02: PS1 one-liner is the only Windows installer in v1.0 (2026-05-20)
**Was:** Q-02
**Decision:** Windows install for v1.0 stays the `irm install.ps1 | iex` one-liner. No `.exe` installer (WiX / NSIS), no portable zip distribution as a separate channel. The PS1 already auto-PATHs (commit `c4e9bb8`) and works for the dev-flavored Windows users in the v1.0 audience.
**Why:** A .exe needs WiX/NSIS authoring, CI build infra, AND code-signing pressure (Windows EV cert ≈ $400+/year on top of the macOS decision in `D-01`). The cost is real; the payoff (a clickable installer) doesn't match the v1.0 audience profile (AI-savvy devs already comfortable with terminal one-liners). A portable zip (Option C) adds two more support surfaces — manual PATH instructions + zip update path — for marginal gain.
**Consequences:**
- `09.01.02` (`install.ps1` clean-machine smoke per release) is the canonical Windows install path; tested in CI on `windows-2022`.
- `09.07.01` (Windows code signing) stays `v1.0: no` and gets a note: "unblocks if we adopt a non-PS1 distribution path, otherwise low priority because PS1 is not subject to SmartScreen the same way an unsigned .exe is."
- README + Mintlify document only `irm install.ps1 | iex` for Windows; no zip download links.

### D-01: No Apple Developer ID for v1.0; install via brew/npm bypasses Gatekeeper for most users (2026-05-20)
**Was:** Q-01
**Decision:** v1.0 does not pay for the Apple Developer ID Program ($99/year). Reasoning rests on three layers:
1. **Most users land via `brew install alecs5am/tap/ralphy` or `npm i -g @alecs5am/ralphy`** — neither of which triggers Gatekeeper because the binary is installed by an already-trusted tool, not double-clicked from Finder.
2. **`curl install.sh | sh` users** are covered by the auto-quarantine-removal in `install.sh` (already `[x]` per `09.03.02`), which removes `com.apple.quarantine` from the downloaded binary before the first run. No Gatekeeper dialog in the curl-install path.
3. **The remaining edge case** — a user who downloads the binary archive directly from GitHub Releases and double-clicks — sees the Gatekeeper warning. Documented in README + `09.03.03` with the one-line `xattr -d` workaround.

Revisit at v1.5 / v2.0 if support tickets show real Gatekeeper friction.
**Why:** $99/year is recurring; notarisation pipeline adds CI complexity. Brew + npm are already the canonical install paths per the README, so the workaround surface area is genuinely small. Paying just to remove a dialog seen only by users who took the most-friction install path doesn't pencil out at the v1.0 audience size.
**Consequences:**
- `09.03.01` (Developer ID signing path) flips to `v1.0: no` and gets a note linking this decision.
- `09.03.03` (Gatekeeper warning docs) stays `v1.0: yes` and becomes the canonical "if you saw a warning, do this" surface.
- README hero install block lists brew + npm before curl-install (already true after commit history); reinforces the Gatekeeper-free path.
- The README's "Trouble?" section adds a one-paragraph "Gatekeeper warning on direct download" callout pointing at the `xattr` command.
