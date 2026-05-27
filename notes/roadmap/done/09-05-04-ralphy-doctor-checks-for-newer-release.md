---
id: 09.05.04
status: done
v1_0: yes
category: 09-distribution-and-release
topic: "09.05 Checksums + verification"
title: "ralphy doctor checks for newer release"
---

# 09.05.04 — `ralphy doctor` checks for newer release

**v1.0:** yes — per [D-04](../09-distribution-and-release/OPEN-QUESTIONS.md#decision-log).

**Acceptance criteria:**
- `ralphy doctor` performs an unauthenticated GET against `https://api.github.com/repos/alecs5am/ugc-cli/releases/latest` after the existing env/key checks. 5s timeout; failure is silent (the rest of the doctor run continues).
- When the running binary lags the latest tag (semver compare), doctor prints a one-line hint with the appropriate upgrade command for the detected install mode (`brew upgrade ralphy` for brew, `npm update -g @alecs5am/ralphy` for npm, `curl ... install.sh | sh` for raw install — install mode is reported by `01.09.07`).
- Opt-out via `RALPHY_DOCTOR_NO_UPDATE_CHECK=1` env var OR `ralphy config set doctor.checkUpdates false` (persists in `~/.ralphy/config.json`).
- Doctor JSON output gains a `versions: { current, latest, update_hint? }` block; pretty mode renders the one-liner.
- Smoke: no network call is made for any verb other than `doctor`; verified by a `--no-network-allowed` integration test in `01.11.x`.

**Notes:** explicitly **not** telemetry — no install events, no usage data, no identifiers leave the machine. README + Mintlify quickstart explain how to silence the check.
