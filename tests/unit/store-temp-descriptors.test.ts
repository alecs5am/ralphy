import { expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeExclusiveStoreTemp } from "../../cli/lib/store/internal-objects.js";

test("failed temporary writes close their descriptor once before asynchronous cleanup", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-temp-descriptor-"));
  const target = path.join(root, "failed.tmp");
  const unrelated = path.join(root, "unrelated.txt");
  let failedDescriptor = -1;
  let reusedDescriptor = -1;
  const failure = new Error("injected fsync failure");
  const sync = spyOn(fs, "fsyncSync").mockImplementation((fd) => {
    failedDescriptor = fd;
    throw failure;
  });
  const remove = spyOn(fs.promises, "rm").mockImplementation(async () => {
    fs.rmSync(target, { force: true });
    // Another operation may reuse this number while asynchronous cleanup yields.
    reusedDescriptor = fs.openSync(unrelated, "w+");
  });
  try {
    await expect(writeExclusiveStoreTemp(root, target, Buffer.from("temporary")))
      .rejects.toBe(failure);
    expect(reusedDescriptor).toBe(failedDescriptor);
    expect(fs.existsSync(target)).toBe(false);
    fs.writeSync(reusedDescriptor, "still open");
    expect(fs.readFileSync(unrelated, "utf8")).toBe("still open");
  } finally {
    sync.mockRestore();
    remove.mockRestore();
    if (reusedDescriptor >= 0) {
      try { fs.closeSync(reusedDescriptor); } catch { /* Failed regression already closed it. */ }
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
