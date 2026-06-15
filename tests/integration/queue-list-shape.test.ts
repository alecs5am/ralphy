// Expanded `queue list --json` shape (#428 part A) via CLI subprocess.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { openDb, closeDb, insertJob } from "../../cli/lib/jobs/db.js";

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-queue-list-shape");
  closeDb();
  openDb();
});

afterEach(() => {
  closeDb();
  tmp.cleanup();
});

describe("queue list · expanded JSON shape", () => {
  test("derives slot / model / refCount / promptPreview / attempts / lastError per job", async () => {
    insertJob({
      kind: "generate.image",
      command: {
        argv: [
          "generate", "image",
          "--slot", "scene-01-image-hero",
          "--model", "openai/gpt-5.4-image-2",
          "--ref", "a.png",
          "--ref", "b.png",
          "--prompt", "a hero shot",
        ],
      },
      tag: "shape-001",
    });
    closeDb();

    const proc = Bun.spawn({
      cmd: [
        "bun", "run", process.cwd() + "/cli/index.ts",
        "--cwd", tmp.dir, "--json",
        "queue", "list", "--tag", "shape-001",
      ],
      cwd: tmp.dir,
      env: { ...process.env },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    expect(proc.exitCode).toBe(0);

    const parsed = JSON.parse(stdout);
    const job = parsed.jobs[0];
    // Existing fields preserved.
    expect(job.id).toBeGreaterThan(0);
    expect(job.status).toBe("pending");
    expect(job.kind).toBe("generate.image");
    // New derived fields.
    expect(job.slot).toBe("scene-01-image-hero");
    expect(job.model).toBe("openai/gpt-5.4-image-2");
    expect(job.refCount).toBe(2);
    expect(job.promptPreview).toBe("a hero shot");
    expect(job.attempts).toBe(0);
    expect(job.lastError).toBeNull();
    expect(job.hint).toBeNull();
  });
});
