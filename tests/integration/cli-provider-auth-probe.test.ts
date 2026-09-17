import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { makeTmpRoot } from "../helpers/tmp-root.js";

test("app credential checks work with zero or multiple workspaces without selecting one", async () => {
  const entry = path.resolve(import.meta.dir, "../../cli/index.ts");
  const root = makeTmpRoot("ralphy-provider-probe");
  try {
    const preload = path.join(root.dir, "probe.ts");
    fs.writeFileSync(preload, `globalThis.fetch = async (url, init) => {
      if (String(url) !== "https://openrouter.ai/api/v1/key" || init?.body) throw new Error("Unexpected request");
      return new Response("{}", {status: 401});
    };`);
    for (const count of [0, 2]) {
      if (count) { createWorkspace({slug: "first", name: "First"}); createWorkspace({slug: "second", name: "Second"}); }
      else openDomainDb();
      closeDomainDb();
      const dataRoot = path.join(root.dir, ".ralphy");
      const child = Bun.spawn([process.execPath, "--preload", preload, entry, "--root", dataRoot, "--json", "provider", "test", "openrouter", "--ping", "--stdin"], {
        cwd: root.dir, stdin: new TextEncoder().encode("synthetic-invalid-key-for-auth-probe"), stdout: "pipe", stderr: "pipe",
      });
      const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect(stderr).toBe(""); expect(exit).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({pinged: true, providers: [{id: "openrouter", validation: "invalid"}]});
    }
  } finally { closeDomainDb(); root.cleanup(); }
});
