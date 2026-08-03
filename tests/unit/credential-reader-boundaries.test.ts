import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const DIRECT_CREDENTIAL_READ =
  /process\.env(?:\??\.(?:OPENROUTER_API_KEY|ELEVENLABS_API_KEY|FAL_KEY|FIRECRAWL_API_KEY|APIFY_TOKEN|POSTIZ_API_KEY|YOUTUBE_API_KEY|DEVTO_API_KEY|HASHNODE_TOKEN)|\[[^\]]*(?:envVar|ENV_VAR)[^\]]*\])/u;

describe("explicit credential reader boundaries", () => {
  test("the required command and pipeline files do not read credentials directly", () => {
    for (const file of [
      "cli/index.ts",
      "cli/lib/capabilities.ts",
      "cli/lib/transcribe.ts",
      "cli/lib/research.ts",
      "cli/commands/voice.ts",
      "cli/commands/setup.ts",
    ]) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(DIRECT_CREDENTIAL_READ);
    }
  });

  test("provider implementations obtain credential values only from the resolver", () => {
    for (const file of [
      "cli/lib/providers/openrouter.ts",
      "cli/lib/providers/elevenlabs.ts",
      "cli/lib/providers/fal.ts",
      "cli/lib/providers/firecrawl.ts",
      "cli/lib/providers/apify.ts",
      "cli/lib/providers/postiz.ts",
      "cli/lib/providers/youtube-analytics.ts",
      "cli/lib/providers/devto.ts",
      "cli/lib/providers/hashnode.ts",
      "cli/lib/providers/llm.ts",
      "cli/lib/providers/openai-compatible.ts",
      "cli/lib/providers/shared.ts",
    ]) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(DIRECT_CREDENTIAL_READ);
    }
  });

  test("Postiz no longer reads or writes plaintext workspace credentials", () => {
    for (const file of [
      "cli/commands/postiz.ts",
      "cli/lib/providers/postiz.ts",
    ]) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source).not.toContain("credentials.json");
      expect(source).not.toMatch(/--api-key\s+<key>/u);
    }
  });

  test("setup refuses legacy credential persistence instead of writing project env", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "cli/commands/setup.ts"),
      "utf8",
    );
    expect(source).not.toContain("applyEnvUpdates");
    expect(source).not.toContain("readDotenv");
    expect(source).not.toMatch(/process\.env\[[^\]]*envVar[^\]]*\]/u);
    expect(source).toContain("provider auth set <provider> --stdin");
  });
});
