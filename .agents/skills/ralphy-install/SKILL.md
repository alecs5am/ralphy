---
name: ralphy-install
description: >-
  Fresh-machine bootstrap of the ralphy CLI binary. Read docs/playbooks/ralphy-install.md FIRST via the Read tool — every time, no exceptions.
  USE WHEN the ralphy binary is NOT yet on PATH and the user needs to get it onto their machine — install the standalone binary from GitHub Releases, ensure bun + ffmpeg are present, run the interactive setup wizard, link to the user's checkout of ugc-cli. Once `ralphy --version` works and the project is linked, hand off to ralph-core for in-tree dev tasks.
  TRIGGER (EN): "install ralphy", "set up from scratch", "fresh machine", "first run", "bootstrap the CLI", "I just cloned the repo", "I don't have ralphy yet", "ralphy not found", "/ralphy-install".
  ALSO FIRE if `which ralphy` returns nothing in a session about to use ralphy commands, OR `ralphy status` errors with "Could not locate the ugc-cli project".
  DO NOT FIRE if ralphy is already installed and the user just wants `ralphy doctor` / env check (that is ralph-core), or wants to install template assets from the companion repo (that is `ralphy assets`).
  KEYWORDS: install, bootstrap, fresh machine, ralphy binary, GitHub Releases, install.sh, bun, ffmpeg, ralphy setup, setup wizard, PATH, ~/.local/bin/ralphy, link project.
---

# ralphy-install (shim)

The full role instructions have moved to **[`docs/playbooks/ralphy-install.md`](../../../docs/playbooks/ralphy-install.md)**.

**Read that file completely via the Read tool before bootstrapping a fresh machine.** It walks through the four sub-tasks (check-environment, install-ralphy, run-setup-wizard, verify) and the fallbacks. Do not improvise from this shim.
