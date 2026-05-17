# 09 — Distribution & Release — PRD

## Problem

Ralphy ships across four channels — `install.sh`, `install.ps1`, Homebrew tap (`alecs5am/homebrew-tap`), npm wrapper (`@alecs5am/ralphy`) — plus GitHub Releases with bunch-built binaries. The `/release` skill orchestrates the cut. Today the pipeline works for v0.0.2 but is fragile in places:

1. **No automated clean-machine smoke.** We pushed v0.0.2 having never tested the install on a freshly-imaged VM. The `release-test` directory we recently noticed in the workspace shows it: testing was ad-hoc.
2. **macOS quarantine handling is documented but not solved.** The user has to either `xattr -d com.apple.quarantine` or trust the installer's auto-unquarantine — fragile, breaks on Gatekeeper updates. No Developer ID signing yet.
3. **Windows install (`install.ps1`) shipped recently** (commit `c4e9bb8`) but has fewer real-world hours. Auto-PATH for PowerShell + Cmd is implemented but not regression-tested.
4. **Version bump policy.** `/release` skill has Conventional-Commits-ish rules for major/minor/patch, but no CHANGELOG generation rule beyond "draft from commits". No way to mark a release "stable" vs "beta".
5. **No SBOM, no provenance.** For an OSS tool that bundles a binary, supply-chain hygiene matters. Today we ship checksums and that's it.
6. **Docs drift between channels.** `README.md` quickstart, `docs-mintlify/quickstart.mdx`, `install.sh`'s own help message — three places, three slightly different stories.

This category owns "how a user goes from URL to working binary, reliably, on every supported platform".

## Users

| User | Need |
|---|---|
| **First-time user (macOS)** | `curl install.sh \| sh` finishes in < 60s, `ralphy --version` works, no Gatekeeper prompt. |
| **First-time user (Linux)** | Same as macOS — same install command, same first-run experience. |
| **First-time user (Windows)** | Power-Shell one-liner installs, PATH set in current + future sessions. |
| **brew user** | `brew install alecs5am/tap/ralphy` works. Upgrade path lands new versions on `brew upgrade`. |
| **npm user** | `npm i -g @alecs5am/ralphy` works as a wrapper that downloads the right binary on first run. |
| **Maintainer** | `/release` skill cuts npm + brew + GH in one shot. No manual semver bumps in three places. |

## User stories

1. As a **first-time user**, I find Ralphy on the landing, copy the install line, and 60 seconds later `ralphy --help` shows the verb list.
2. As a **macOS user**, I don't have to know about `xattr -d` or "right-click → Open" to launch the binary.
3. As a **Windows user**, I run the one-liner, restart my terminal, and `ralphy --version` works without me touching the PATH manually.
4. As a **maintainer**, I run `/release` after a sprint, review the proposed semver bump + changelog, confirm, and watch the CI publish to GH + brew + npm with checksums. No SSH into a tap repo.
5. As a **maintainer**, if any channel fails partway, the rollback path is documented and the half-released version is marked unstable so nobody installs it.
6. As a **security-conscious user**, I can verify the binary against a published signing key or SLSA provenance attestation.
7. As an **OSS contributor**, the release notes I read on GitHub match what I see in the changelog match what's printed on `brew info` and `npm view`.

## Success metrics

| Metric | Target at v1.0 | How we measure |
|---|---|---|
| Time from `curl install.sh \| sh` to `ralphy --version` working | < 60s on stock macOS Sonoma, stock Ubuntu 22.04, stock Win11 | CI smoke on each |
| Install-script regressions detected before release | 100% | Smoke runs on every PR that touches `install.sh` / `install.ps1` |
| macOS Gatekeeper prompts during install | 0 | Manual on each release |
| Channels published successfully per release | 3/3 (GH + brew + npm) | `/release` smoke |
| Time from `/release` start to all-channels-live | < 15 min | Stopwatch |
| Manual steps required in `/release` | 0 outside of "approve the diff" | Skill spec |
| Documented rollback path tested in CI | yes | Manual rehearsal |

## Non-goals

- **Custom package managers (Snap, Flatpak, AUR).** Brew + npm + raw install covers the v1.0 audience.
- **Auto-update inside the binary.** Users update via their package manager. The binary doesn't phone home.
- **GUI installer (.dmg, .exe with wizard).** Out of scope.
- **Telemetry on install.** Belongs to [`10`](../10-cost-and-telemetry/) and is opt-in.
- **Multi-arch beyond darwin-arm64 / darwin-x64 / linux-x64 / linux-arm64 / win32-x64.** No 32-bit, no esoteric Unix.
- **Reproducible builds.** Worth aiming at but not gating v1.0.

## v1.0 cut

**Must ship:**

- `09.01` — Install scripts (sh + ps1) tested on clean machines per release
- `09.02` — Channels (GH, brew tap, npm wrapper) all green on each cut
- `09.03` — macOS Gatekeeper / quarantine resolved (Developer ID signing OR documented one-line fix)
- `09.04` — `/release` skill is fully scripted; only manual step is approving the diff
- `09.05` — Checksums + verification documented
- `09.06` — Clean-machine smoke automated in CI

**Post-launch:**

- `09.07` — SLSA provenance attestations
- `09.08` — Windows code signing
- `09.09` — Reproducible builds
- `09.10` — Snap / Flatpak / AUR (community-maintained)
