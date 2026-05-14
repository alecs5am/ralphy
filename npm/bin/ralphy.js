#!/usr/bin/env node
// Thin launcher: exec the platform-specific ralphy binary that
// scripts/install.js dropped under ../vendor/ at install time. Forwards
// argv + stdio so `npx ralphy --help`, `ralphy setup`, etc. behave
// exactly like the standalone binary.

"use strict";

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const ext = process.platform === "win32" ? ".exe" : "";
const binPath = path.join(__dirname, "..", "vendor", `ralphy${ext}`);

if (!fs.existsSync(binPath)) {
  console.error(
    [
      "ralphy: binary not found at",
      `  ${binPath}`,
      "",
      "This usually means the postinstall hook didn't run (npm --ignore-scripts?) or",
      "the GitHub Release for this version wasn't published yet. Re-install with:",
      "  npm install -g @alecs5am/ralphy --force",
      "",
      "Or grab the binary directly:",
      "  https://github.com/alecs5am/ralphy/releases/latest",
    ].join("\n"),
  );
  process.exit(1);
}

const child = spawn(binPath, process.argv.slice(2), {
  stdio: "inherit",
  windowsHide: true,
});

child.on("error", (err) => {
  console.error(`ralphy: failed to launch (${err.message})`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    // Re-raise the signal so callers see the right exit semantics.
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
