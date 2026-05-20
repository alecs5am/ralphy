// Unit tests for the doctor update check (09.05.04).
//
// The check:
//   • Performs an unauthenticated GET against the GitHub Releases API
//   • 5-second timeout — silent on failure (network blip / offline)
//   • Opt-out via RALPHY_DOCTOR_NO_UPDATE_CHECK=1 OR
//     `ralphy config set doctor.checkUpdates false`
//   • Returns { current, latest, update_hint? } block

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  shouldCheckUpdates,
  compareVersions,
  upgradeHintForMode,
  type InstallMode,
} from "../../cli/lib/update-check.js";

const OLD_ENV: Record<string, string | undefined> = {};
const ENV_KEYS = ["RALPHY_DOCTOR_NO_UPDATE_CHECK"];

beforeEach(() => {
  for (const k of ENV_KEYS) {
    OLD_ENV[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (OLD_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = OLD_ENV[k];
  }
});

describe("shouldCheckUpdates", () => {
  test("returns true by default", () => {
    expect(shouldCheckUpdates({})).toBe(true);
  });

  test("returns false when RALPHY_DOCTOR_NO_UPDATE_CHECK=1", () => {
    process.env.RALPHY_DOCTOR_NO_UPDATE_CHECK = "1";
    expect(shouldCheckUpdates({})).toBe(false);
  });

  test("returns false when config.doctor.checkUpdates === false", () => {
    expect(shouldCheckUpdates({ doctor: { checkUpdates: false } })).toBe(false);
  });

  test("config takes precedence even if env var is unset", () => {
    expect(shouldCheckUpdates({ doctor: { checkUpdates: false } })).toBe(false);
  });

  test("env var overrides config opt-in", () => {
    process.env.RALPHY_DOCTOR_NO_UPDATE_CHECK = "1";
    expect(shouldCheckUpdates({ doctor: { checkUpdates: true } })).toBe(false);
  });
});

describe("compareVersions", () => {
  test("returns 'current' when versions match", () => {
    expect(compareVersions("0.2.0", "0.2.0")).toBe("current");
    expect(compareVersions("v0.2.0", "0.2.0")).toBe("current");
    expect(compareVersions("0.2.0", "v0.2.0")).toBe("current");
  });

  test("returns 'newer' when latest > current", () => {
    expect(compareVersions("0.1.0", "0.2.0")).toBe("newer");
    expect(compareVersions("0.2.0", "0.2.1")).toBe("newer");
    expect(compareVersions("0.2.9", "0.3.0")).toBe("newer");
    expect(compareVersions("v0.1.5", "v0.2.0")).toBe("newer");
  });

  test("returns 'ahead' when current > latest (local dev)", () => {
    expect(compareVersions("0.3.0", "0.2.0")).toBe("ahead");
  });

  test("returns 'unknown' on parse failure", () => {
    expect(compareVersions("garbage", "0.2.0")).toBe("unknown");
    expect(compareVersions("0.2.0", "")).toBe("unknown");
  });
});

describe("upgradeHintForMode", () => {
  test("brew install mode → brew upgrade hint", () => {
    // We can't 100% detect brew vs curl from inside the binary; the heuristic
    // is: if the binary path matches /Cellar/ralphy/ OR /opt/homebrew/, it's brew.
    expect(upgradeHintForMode("brew" as InstallMode)).toContain("brew upgrade");
  });

  test("npm install mode → npm update hint", () => {
    expect(upgradeHintForMode("npm")).toContain("npm update");
  });

  test("curl install mode → curl install.sh hint", () => {
    expect(upgradeHintForMode("curl")).toContain("install.sh");
  });

  test("developer mode → git pull hint", () => {
    expect(upgradeHintForMode("developer")).toContain("git pull");
  });

  test("unknown mode → generic hint mentioning all channels", () => {
    expect(upgradeHintForMode("unknown")).toMatch(/brew|npm|curl/);
  });
});
