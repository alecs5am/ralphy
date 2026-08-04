import { describe, expect, test } from "bun:test";

describe("bridge dependency boundaries", () => {
  test("bridge code stays above Commander and private store rows", async () => {
    const violations: string[] = [];
    const glob = new Bun.Glob("cli/lib/bridge/*.ts");
    for await (const file of glob.scan(".")) {
      const source = await Bun.file(file).text();
      if (/cli\/commands\//.test(source)) violations.push(`${file}: commands`);
      if (/from\s+["'][^"']*output\.js["']/.test(source)) violations.push(`${file}: output`);
      if (/raiseError\s*\(/.test(source)) violations.push(`${file}: raiseError`);
      if (/store\/internal-types\.js/.test(source)) violations.push(`${file}: internal-types`);
      if (/from\s+["'][^"']*commander["']/.test(source)) violations.push(`${file}: commander`);
    }
    expect(violations).toEqual([]);
  });
});
