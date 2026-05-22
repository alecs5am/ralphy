---
id: 09.01.01
status: done
v1_0: yes
category: 09-distribution-and-release
topic: "09.01 Install scripts"
title: "install.sh clean-machine smoke per release"
---

# 09.01.01 — `install.sh` clean-machine smoke per release

**v1.0:** yes

**Acceptance criteria:**
- GitHub Actions matrix: macOS-14 + ubuntu-22.04 + ubuntu-24.04, runs `install.sh` against a release candidate tag.
- Asserts: `ralphy --version` matches the tag, `ralphy doctor` exits without env errors, install completes in < 60s.
- Runs as a required check on the release PR.
