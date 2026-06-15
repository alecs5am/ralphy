// Kind-aware claim + pendingKinds (#428 part D wiring). Real tmp DB.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import {
  openDb,
  closeDb,
  insertJob,
  claimNextPending,
  pendingKinds,
  runningCountByKind,
} from "../../cli/lib/jobs/db.js";

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-kind-claim");
  closeDb();
  openDb();
});

afterEach(() => {
  closeDb();
  tmp.cleanup();
});

describe("claimNextPending · kind filter", () => {
  test("no filter behaves exactly as before (claims highest-priority pending)", () => {
    const img = insertJob({ kind: "generate.image", command: { argv: ["i"] } });
    insertJob({ kind: "render", command: { argv: ["r"] } });
    const c = claimNextPending();
    expect(c?.id).toBe(img);
    expect(c?.status).toBe("running");
  });

  test("kind filter restricts the claim to the given kinds", () => {
    insertJob({ kind: "generate.image", command: { argv: ["i"] } });
    const rid = insertJob({ kind: "render", command: { argv: ["r"] } });
    // Only render is eligible this tick.
    const c = claimNextPending(["render"]);
    expect(c?.id).toBe(rid);
  });

  test("empty kind set after filter → no claim (image excluded)", () => {
    insertJob({ kind: "generate.image", command: { argv: ["i"] } });
    const c = claimNextPending(["render"]);
    expect(c).toBeNull();
  });
});

describe("pendingKinds + runningCountByKind", () => {
  test("pendingKinds reports distinct kinds with pending work", () => {
    insertJob({ kind: "generate.image", command: { argv: ["a"] } });
    insertJob({ kind: "generate.image", command: { argv: ["b"] } });
    insertJob({ kind: "render", command: { argv: ["c"] } });
    expect(pendingKinds().sort()).toEqual(["generate.image", "render"]);
  });

  test("runningCountByKind groups running jobs", () => {
    insertJob({ kind: "generate.image", command: { argv: ["a"] } });
    insertJob({ kind: "render", command: { argv: ["b"] } });
    claimNextPending(); // image → running
    expect(runningCountByKind()["generate.image"]).toBe(1);
    expect(runningCountByKind().render ?? 0).toBe(0);
  });
});
