---
id: 09.02.01
status: done
v1_0: yes
category: 09-distribution-and-release
topic: "09.02 Channels — GH / brew / npm"
title: "GitHub Releases workflow builds + uploads + checksums"
---

# 09.02.01 — GitHub Releases workflow builds + uploads + checksums

**v1.0:** yes

**Acceptance criteria:**
- `.github/workflows/release.yml` (current) builds darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64 binaries.
- Uploads to the Release with SHA-256 checksums in `SHA256SUMS`.
- Smoke-runs each binary (`--version`).
