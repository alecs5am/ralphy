// Unit tests for the global config at ~/.ralphy/config.json (01.09.02).
//
// The module should:
//   • read/write a JSON file at ~/.ralphy/config.json (or override path)
//   • create the dir lazily with 0700 perms
//   • write the file with 0600 perms (sensitive: holds API keys)
//   • return {} on a missing or unparseable file
//   • support nested get/set via dot-paths

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readGlobalConfig,
  writeGlobalConfig,
  setGlobalConfigPath,
  resetGlobalConfigPath,
  configGet,
  configSet,
  configList,
} from "../../cli/lib/global-config.js";

let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-cfg-"));
  setGlobalConfigPath(path.join(tmpHome, ".ralphy", "config.json"));
});

afterEach(() => {
  resetGlobalConfigPath();
  try {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("readGlobalConfig", () => {
  test("returns {} when file does not exist", () => {
    const cfg = readGlobalConfig();
    expect(cfg).toEqual({});
  });

  test("returns {} when file is malformed", () => {
    const p = path.join(tmpHome, ".ralphy", "config.json");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "{ not json");
    const cfg = readGlobalConfig();
    expect(cfg).toEqual({});
  });

  test("returns the parsed config when present", () => {
    const p = path.join(tmpHome, ".ralphy", "config.json");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ api_keys: { openrouter: "sk-abc" }, defaults: { template: "foo" } }));
    const cfg = readGlobalConfig();
    expect(cfg.api_keys).toEqual({ openrouter: "sk-abc" });
    expect(cfg.defaults).toEqual({ template: "foo" });
  });
});

describe("writeGlobalConfig", () => {
  test("creates the directory and writes the file", () => {
    writeGlobalConfig({ foo: "bar" });
    const p = path.join(tmpHome, ".ralphy", "config.json");
    expect(fs.existsSync(p)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    expect(parsed).toEqual({ foo: "bar" });
  });

  test("file permissions are 0600 (sensitive: holds API keys)", () => {
    writeGlobalConfig({ api_keys: { x: "y" } });
    const p = path.join(tmpHome, ".ralphy", "config.json");
    const mode = fs.statSync(p).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("subsequent writes update without losing perms", () => {
    writeGlobalConfig({ a: 1 });
    writeGlobalConfig({ a: 2, b: 3 });
    const p = path.join(tmpHome, ".ralphy", "config.json");
    const mode = fs.statSync(p).mode & 0o777;
    expect(mode).toBe(0o600);
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    expect(parsed).toEqual({ a: 2, b: 3 });
  });
});

describe("configGet / configSet / configList", () => {
  test("set then get with dot-paths roundtrips", () => {
    configSet("api_keys.openrouter", "sk-abc");
    configSet("defaults.template", "spring-vibe");
    expect(configGet("api_keys.openrouter")).toBe("sk-abc");
    expect(configGet("defaults.template")).toBe("spring-vibe");
  });

  test("configList returns the full config", () => {
    configSet("foo", "bar");
    configSet("nested.key", 42);
    const all = configList();
    expect(all.foo).toBe("bar");
    expect((all.nested as Record<string, unknown>).key).toBe(42);
  });

  test("configGet returns undefined for missing keys", () => {
    expect(configGet("never_set")).toBeUndefined();
    expect(configGet("a.b.c")).toBeUndefined();
  });

  test("configSet coerces string 'true' / 'false' / numerics", () => {
    configSet("flag_on", true);
    configSet("count", 7);
    expect(configGet("flag_on")).toBe(true);
    expect(configGet("count")).toBe(7);
  });
});
