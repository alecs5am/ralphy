import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateCmd } from "../../cli/commands/generate.js";
import { imageCmd } from "../../cli/commands/image.js";
import { refCmd } from "../../cli/commands/ref.js";
import { videoCmd } from "../../cli/commands/video.js";
import { voiceCmd } from "../../cli/commands/voice.js";
import { __setMagickBinaryForTest } from "../../cli/lib/image/magick.js";
import { setRoot } from "../../cli/lib/paths.js";
import { openrouterConnector } from "../../cli/lib/providers/openrouter.js";
import { falConnector } from "../../cli/lib/providers/fal.js";
import { elevenlabsConnector } from "../../cli/lib/providers/elevenlabs.js";
import { TerminalProviderError } from "../../cli/lib/providers/shared.js";
import type { GenerateImageInput } from "../../cli/lib/providers/types.js";
import { artifactOut } from "../../cli/lib/artifact-production.js";
import { readGenerationInput } from "../../cli/lib/generation-input.js";
import { listArtifactRevisions, listArtifacts, listArtifactUsages } from "../../cli/lib/store/artifacts.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { listRunAttempts, listRuns } from "../../cli/lib/store/runs.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { setMode } from "../../cli/lib/ui.js";
import { seedLegacyProject } from "../helpers/legacy-project.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const ORIGINAL_FETCH = globalThis.fetch;
const DATA_URI_SENTINEL = "TASK4_DATA_URI_SENTINEL_4f591b";
const ORIGINAL_ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
const ORIGINAL_OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const PROVIDER_FAILURE_SENTINEL = "TASK4_PROVIDER_BODY_SENTINEL_091c7e";
const PROVIDER_FAILURE_LOCATORS = [
  '{"error":"TASK4_RAW_JSON_BODY"}',
  "ftp://example.test/TASK4_FTP_LOCATOR",
  "custom+scheme://example.test/TASK4_CUSTOM_LOCATOR",
  "file:///private/tmp/TASK4_FILE_LOCATOR",
  "/private/tmp/TASK4_UNIX_LOCATOR",
  "./relative/TASK4_RELATIVE_LOCATOR",
  "C:\\Users\\fixture\\TASK4_WINDOWS_LOCATOR",
  "data:image/png;base64,TASK4_DATA_LOCATOR",
] as const;

let fixtureRoot: string;
let fixtureCall = 0;
let originalAvailable: typeof openrouterConnector.available;
let originalGenerateImage: typeof openrouterConnector.generateImage;

beforeEach(() => {
  setMode("json");
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-generation-domain-"));
  setRoot(fixtureRoot);
  fs.mkdirSync(path.join(fixtureRoot, ".ralphy"), { recursive: true });
  openDomainDb();
  fixtureCall = 0;
  originalAvailable = openrouterConnector.available;
  originalGenerateImage = openrouterConnector.generateImage;
  openrouterConnector.available = () => true;
  openrouterConnector.generateImage = async (input: GenerateImageInput) => {
    if (input.prompt === "fixture failure") {
      throw Object.assign(new Error(PROVIDER_FAILURE_LOCATORS.join(" | ")), {
        name: "TransientPayloadError",
        code: "ECONNRESET",
        status: 503,
        provider: "openrouter",
      });
    }
    fixtureCall += 1;
    if (!input.runId || !input.outputPath) throw new Error("fixture provider requires Run temp output");
    const localPath = input.outputPath;
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, `fixture-image-${fixtureCall}`);
    return {
      localPath,
      ...(input.prompt === "fixture data uri"
        ? { url: `data:image/png;base64,${DATA_URI_SENTINEL}` }
        : {}),
      costUsd: 0.01,
      latencyMs: 1,
      model: input.model ?? "fixture/image",
    };
  };
});

afterEach(() => {
  setMode("auto");
  openrouterConnector.available = originalAvailable;
  openrouterConnector.generateImage = originalGenerateImage;
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_ELEVENLABS_KEY === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = ORIGINAL_ELEVENLABS_KEY;
  if (ORIGINAL_OPENROUTER_KEY === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = ORIGINAL_OPENROUTER_KEY;
  __setMagickBinaryForTest(undefined);
  closeDomainDb();
  setRoot(REPO);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("generation domain persistence", () => {
  test("two generations of one slot create two immutable revisions without legacy manifest or log writes", async () => {
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "fixture-project",
      name: "Fixture project",
    });
    const legacyProjectDir = seedLegacyProject(fixtureRoot, project.id);

    for (const prompt of ["first fixture", "second fixture"]) {
      await generateCmd().parseAsync(
        [
          "image",
          "--project",
          project.id,
          "--slot",
          "hero",
          "--prompt",
          prompt,
          "--provider",
          "openrouter",
          "--no-ref-consent",
          "fixture provider",
        ],
        { from: "user" },
      );
    }

    const context = { workspaceId: workspace.id, projectId: project.id };
    const artifacts = listArtifacts({ context, limit: 10 }).items;
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.slug).toBe("hero");
    const revisions = listArtifactRevisions({
      context,
      artifactId: artifacts[0]!.id,
      limit: 10,
    }).items;
    expect(revisions).toHaveLength(2);
    expect(new Set(revisions.map((revision) => revision.id)).size).toBe(2);

    const runs = listRuns({ context, limit: 10 }).items;
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.state)).toEqual(["succeeded", "succeeded"]);
    const inputs = runs.map((run) => generationAttemptInput(run.id))
      .sort((a, b) => a!.texts[0]!.value.localeCompare(b!.texts[0]!.value));
    expect(inputs).toEqual([
      {
        version: 1,
        texts: [{ role: "prompt", value: "first fixture", truncated: false }],
        parameters: [
          { name: "size", value: "1080x1920" },
          { name: "referenceCount", value: 0 },
        ],
      },
      {
        version: 1,
        texts: [{ role: "prompt", value: "second fixture", truncated: false }],
        parameters: [
          { name: "size", value: "1080x1920" },
          { name: "referenceCount", value: 0 },
        ],
      },
    ]);
    expect(fs.existsSync(path.join(legacyProjectDir, "asset-manifest.json"))).toBe(false);
    expect(fs.existsSync(path.join(legacyProjectDir, "logs", "generations.jsonl"))).toBe(false);
  });

  test("provider failure exposes only allowlisted facts across command and domain evidence", async () => {
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "fixture-project",
      name: "Fixture project",
    });
    const legacyProjectDir = seedLegacyProject(fixtureRoot, project.id);

    const stdout: string[] = [];
    const stderr: string[] = [];
    const originalLog = console.log;
    const originalWrite = process.stderr.write;
    console.log = (...args: unknown[]) => stdout.push(args.map(String).join(" "));
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    let caught: unknown;
    try {
      await generateCmd().parseAsync(
        [
          "image",
          "--project",
          project.id,
          "--slot",
          "hero",
          "--prompt",
          "fixture failure",
          "--provider",
          "openrouter",
          "--no-ref-consent",
          "fixture provider",
        ],
        { from: "user" },
      );
    } catch (error) {
      caught = error;
    } finally {
      console.log = originalLog;
      process.stderr.write = originalWrite;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("openrouter request failed (status 503; code ECONNRESET)");
    expect((caught as Error & { code?: string }).code).toBe("ECONNRESET");
    expect((caught as Error & { status?: number }).status).toBe(503);
    expect((caught as Error & { provider?: string }).provider).toBe("openrouter");

    const context = { workspaceId: workspace.id, projectId: project.id };
    expect(listArtifacts({ context, limit: 10 }).items).toHaveLength(0);
    const runs = listRuns({ context, limit: 10 }).items;
    expect(runs).toHaveLength(1);
    expect(runs[0]?.state).toBe("failed");
    expect(listRunAttempts({ context, runId: runs[0]!.id, limit: 10 }).items[0]?.state).toBe("failed");
    const persisted = persistedGenerationText();
    for (const sentinel of PROVIDER_FAILURE_LOCATORS) {
      expect((caught as Error).message).not.toContain(sentinel);
      expect(stdout.join("\n")).not.toContain(sentinel);
      expect(stderr.join("\n")).not.toContain(sentinel);
      expect(persisted).not.toContain(sentinel);
    }
    expect(fs.existsSync(path.join(legacyProjectDir, "asset-manifest.json"))).toBe(false);
    expect(fs.existsSync(path.join(legacyProjectDir, "logs", "generations.jsonl"))).toBe(false);
  });

  test("provider data URI is discarded while generation succeeds and remains charged", async () => {
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "data-uri",
      name: "Data URI",
    });
    seedLegacyProject(fixtureRoot, project.id);
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.map(String).join(" "));
    try {
      await generateCmd().parseAsync(
        [
          "image", "--project", project.id, "--slot", "hero",
          "--prompt", "fixture data uri", "--provider", "openrouter",
          "--no-ref-consent", "fixture provider",
        ],
        { from: "user" },
      );
    } finally {
      console.log = originalLog;
    }

    const context = { workspaceId: workspace.id, projectId: project.id };
    const artifacts = listArtifacts({ context, limit: 10 }).items;
    expect(artifacts).toHaveLength(1);
    expect(listArtifactRevisions({ context, artifactId: artifacts[0]!.id, limit: 10 }).items)
      .toHaveLength(1);
    const runs = listRuns({ context, limit: 10 }).items;
    expect(runs).toHaveLength(1);
    expect(runs[0]?.state).toBe("succeeded");
    expect(listRunAttempts({ context, runId: runs[0]!.id, limit: 10 }).items[0]?.costUsd)
      .toBe(0.01);
    const payload = JSON.parse(output.join("\n"));
    expectLocatorFree(payload, [fixtureRoot, DATA_URI_SENTINEL]);
    expectLocatorFree(persistedGenerationPayloads(), [fixtureRoot, DATA_URI_SENTINEL]);
  });

  test("image batch creates one independent Run-backed revision per item", async () => {
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const project = createProject({ workspaceId: workspace.id, slug: "batch", name: "Batch" });
    const legacyProjectDir = seedLegacyProject(fixtureRoot, project.id);
    const batch = path.join(fixtureRoot, "batch.jsonl");
    fs.writeFileSync(batch, [
      JSON.stringify({ slot: "one", prompt: "first" }),
      JSON.stringify({ slot: "two", prompt: "second" }),
    ].join("\n"));

    await generateCmd().parseAsync([
      "image", "--project", project.id, "--batch", batch, "--provider", "openrouter",
      "--no-ref-consent", "fixture batch",
    ], { from: "user" });

    const context = { workspaceId: workspace.id, projectId: project.id };
    expect(listArtifacts({ context, limit: 10 }).items.map((artifact) => artifact.slug).sort())
      .toEqual(["one", "two"]);
    const runs = listRuns({ context, limit: 10 }).items;
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => generationAttemptInput(run.id))
      .sort((a, b) => a!.texts[0]!.value.localeCompare(b!.texts[0]!.value)))
      .toEqual([
        {
          version: 1,
          texts: [{ role: "prompt", value: "first", truncated: false }],
          parameters: [
            { name: "size", value: "1080x1920" },
            { name: "referenceCount", value: 0 },
          ],
        },
        {
          version: 1,
          texts: [{ role: "prompt", value: "second", truncated: false }],
          parameters: [
            { name: "size", value: "1080x1920" },
            { name: "referenceCount", value: 0 },
          ],
        },
      ]);
    expect(fs.existsSync(path.join(legacyProjectDir, "asset-manifest.json"))).toBe(false);
    expect(fs.existsSync(path.join(legacyProjectDir, "logs", "generations.jsonl"))).toBe(false);
  });

  test("image records a connector-supported noncanonical size canonically", async () => {
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const project = createProject({ workspaceId: workspace.id, slug: "size", name: "Size" });
    seedLegacyProject(fixtureRoot, project.id);
    await generateCmd().parseAsync(["image", "--project", project.id, "--slot", "hero", "--prompt", "size", "--size", "1024 X 1024", "--provider", "openrouter", "--no-ref-consent", "fixture"], { from: "user" });
    const run = listRuns({ context: { workspaceId: workspace.id, projectId: project.id }, limit: 1 }).items[0]!;
    expect(generationAttemptInput(run.id)).toMatchObject({ parameters: [{ name: "size", value: "1024x1024" }, { name: "referenceCount", value: 0 }] });
    await generateCmd().parseAsync(["image", "--project", project.id, "--slot", "unsafe-size", "--prompt", "size", "--size", "file:///TASK2_SIZE_PATH", "--provider", "openrouter", "--no-ref-consent", "fixture"], { from: "user" });
    const unsafeRun = listRuns({ context: { workspaceId: workspace.id, projectId: project.id }, limit: 2 }).items
      .find((item) => item.label === "unsafe-size")!;
    expect(generationAttemptInput(unsafeRun.id)).toEqual({
      version: 1, texts: [{ role: "prompt", value: "size", truncated: false }],
      parameters: [{ name: "referenceCount", value: 0 }],
    });
  });

  test("video, voiceover, music, and SFX retain only their approved inputs", async () => {
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const project = createProject({ workspaceId: workspace.id, slug: "safe-inputs", name: "Safe inputs" });
    seedLegacyProject(fixtureRoot, project.id);
    const frame = path.join(fixtureRoot, "TASK2_FRAME_PATH.png");
    const frameLast = path.join(fixtureRoot, "TASK2_LAST_PATH.png");
    const image = path.join(fixtureRoot, "TASK2_IMAGE_PATH.png");
    const videoRef = path.join(fixtureRoot, "TASK2_VIDEO_PATH.mp4");
    fs.writeFileSync(frame, "frame");
    fs.writeFileSync(frameLast, "frame"); fs.writeFileSync(image, "image"); fs.writeFileSync(videoRef, "video");
    const originalVideo = openrouterConnector.generateVideo;
    const originalVoice = elevenlabsConnector.generateVoiceover;
    const originalMusic = elevenlabsConnector.generateMusic;
    const originalSfx = elevenlabsConnector.generateSfx;
    const originalElevenlabsAvailable = elevenlabsConnector.available;
    const result = (input: any) => {
      fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
      fs.writeFileSync(input.outputPath, "fixture");
      return { localPath: input.outputPath, costUsd: 0.01, latencyMs: 1, model: input.model ?? "fixture" };
    };
    openrouterConnector.generateVideo = async (input: any) => result(input);
    elevenlabsConnector.generateVoiceover = async (input: any) => result(input);
    const musicPrompts: string[] = [];
    elevenlabsConnector.generateMusic = async (input: any) => {
      musicPrompts.push(input.prompt);
      if (musicPrompts.length === 1) throw new TerminalProviderError("provider-error-TASK2", { promptSuggestion: "rewritten music prompt" });
      return result(input);
    };
    elevenlabsConnector.generateSfx = async (input: any) => result(input);
    elevenlabsConnector.available = () => true;
    try {
      await generateCmd().parseAsync(["image", "--project", project.id, "--slot", "negative", "--prompt", "picture", "--negative", "blur", "--ref", image, "--note", "note-TASK2", "--provider", "openrouter", "--no-ref-consent", "fixture"], { from: "user" });
      await generateCmd().parseAsync(["video", "--project", project.id, "--slot", "clip", "--prompt", "move", "--duration", "5", "--model", "fixture/video", "--no-validate", "--first-frame", frame, "--last-frame", frameLast, "--image", image, "--ref", frame, "--ref-video", videoRef, "--audio", "--aspect-ratio", "16:9", "--resolution", "720p", "--provider", "openrouter", "--no-ref-consent", "fixture"], { from: "user" });
      await generateCmd().parseAsync(["voiceover", "--project", project.id, "--slot", "voice", "--voice", "TASK2_EXTERNAL_VOICE_ID", "--text", "speak", "--stability", "0.5", "--similarity-boost", "0.6", "--style", "0.7", "--speed", "1.2", "--no-speaker-boost", "--provider", "elevenlabs", "--no-ref-consent", "fixture"], { from: "user" });
      await generateCmd().parseAsync(["music", "--project", project.id, "--slot", "music", "--prompt", "original music prompt", "--duration", "5", "--auto-retry-on-tos-rejection", "--provider", "elevenlabs", "--no-ref-consent", "fixture"], { from: "user" });
      await generateCmd().parseAsync(["sfx", "--project", project.id, "--slot", "sfx", "--prompt", "click", "--duration", "2", "--prompt-influence", "0.7", "--provider", "elevenlabs", "--no-ref-consent", "fixture"], { from: "user" });
    } finally {
      openrouterConnector.generateVideo = originalVideo;
      elevenlabsConnector.generateVoiceover = originalVoice;
      elevenlabsConnector.generateMusic = originalMusic;
      elevenlabsConnector.generateSfx = originalSfx;
      elevenlabsConnector.available = originalElevenlabsAvailable;
    }
    const context = { workspaceId: workspace.id, projectId: project.id };
    const inputs = listRuns({ context, limit: 10 }).items.map((run) => generationAttemptInput(run.id));
    const inputFor = (value: string) => inputs.find((input) => input!.texts[0]?.value === value);
    expect(inputFor("picture")).toEqual({ version: 1, texts: [{ role: "prompt", value: "picture", truncated: false }, { role: "negative-prompt", value: "blur", truncated: false }], parameters: [{ name: "size", value: "1080x1920" }, { name: "referenceCount", value: 1 }] });
    expect(inputFor("move")).toEqual({ version: 1, texts: [{ role: "prompt", value: "move", truncated: false }], parameters: [{ name: "durationSec", value: 5 }, { name: "aspectRatio", value: "16:9" }, { name: "resolution", value: "720p" }, { name: "generateAudio", value: true }, { name: "referenceCount", value: 1 }, { name: "referenceVideoCount", value: 1 }, { name: "hasFirstFrame", value: true }, { name: "hasLastFrame", value: true }, { name: "hasImage", value: true }] });
    expect(inputFor("speak")).toEqual({ version: 1, texts: [{ role: "text", value: "speak", truncated: false }], parameters: [{ name: "voiceSpecified", value: true }, { name: "stability", value: 0.5 }, { name: "similarityBoost", value: 0.6 }, { name: "style", value: 0.7 }, { name: "speed", value: 1.2 }, { name: "speakerBoost", value: false }] });
    expect(inputFor("original music prompt")).toEqual({ version: 1, texts: [{ role: "prompt", value: "original music prompt", truncated: false }], parameters: [{ name: "durationSec", value: 5 }, { name: "forceInstrumental", value: true }] });
    expect(inputFor("click")).toEqual({ version: 1, texts: [{ role: "prompt", value: "click", truncated: false }], parameters: [{ name: "durationSec", value: 2 }, { name: "promptInfluence", value: 0.7 }] });
    expect(musicPrompts).toEqual(["original music prompt", "rewritten music prompt"]);
    const requests = JSON.stringify(inputs);
    for (const sentinel of [fixtureRoot, frame, "TASK2_EXTERNAL_VOICE_ID", "data:image", "outputPath", "fixture-elevenlabs-key", "note", "provider-error"]) expect(requests).not.toContain(sentinel);
  });

  test("direct image convert stores its output as an Artifact revision instead of the requested legacy path", async () => {
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "fixture-project",
      name: "Fixture project",
    });
    const legacyProjectDir = seedLegacyProject(fixtureRoot, project.id);
    const source = path.join(fixtureRoot, "TASK4_RELATIVE_SOURCE.png");
    fs.writeFileSync(source, "fixture-source");
    const fakeMagick = path.join(fixtureRoot, "fake-magick.sh");
    fs.writeFileSync(
      fakeMagick,
      "#!/bin/sh\nfirst=$1\nfor last do :; done\ncp \"$first\" \"$last\"\n",
    );
    fs.chmodSync(fakeMagick, 0o755);
    __setMagickBinaryForTest(fakeMagick);
    const requestedLegacyOutput = path.join(legacyProjectDir, "artifacts", "images", "converted.png");

    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.map(String).join(" "));
    try {
      await imageCmd().parseAsync(
        [
          "convert",
          "--in",
          source,
          "--out",
          requestedLegacyOutput,
          "--project",
          project.id,
        ],
        { from: "user" },
      );
    } finally {
      console.log = originalLog;
    }

    const context = { workspaceId: workspace.id, projectId: project.id };
    const artifacts = listArtifacts({ context, limit: 10 }).items;
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.slug).toBe("converted");
    expect(listArtifactRevisions({ context, artifactId: artifacts[0]!.id, limit: 10 }).items).toHaveLength(1);
    expect(listRuns({ context, limit: 10 }).items[0]?.state).toBe("succeeded");
    expect(fs.existsSync(requestedLegacyOutput)).toBe(false);
    expect(fs.existsSync(path.join(legacyProjectDir, "logs", "generations.jsonl"))).toBe(false);
    expectLocatorFree(JSON.parse(output.join("\n")), [fixtureRoot]);
    expect(persistedGenerationText()).not.toContain("TASK4_RELATIVE_SOURCE.png");
  });

  test("Artifact output preserves structured source media facts while removing source locators", () => {
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.map(String).join(" "));
    try {
      artifactOut({
        src: "./relative/TASK4_SMART_CROP_INPUT.mp4",
        source: {
          width: 1920,
          height: 1080,
          durationSec: 4.5,
          fps: 30,
          path: "C:\\fixture\\TASK4_SMART_CROP_SOURCE.mp4",
        },
        providerUrl: "ftp://example.test/TASK4_SMART_CROP_PROVIDER",
        model: "google/gemini-2.5-flash",
      });
    } finally {
      console.log = originalLog;
    }

    expect(JSON.parse(output.join("\n"))).toEqual({
      source: { width: 1920, height: 1080, durationSec: 4.5, fps: 30 },
      model: "google/gemini-2.5-flash",
    });
  });

  test("reference image pull creates exact Project Artifact usage without legacy ref bytes or gen-log", async () => {
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const project = createProject({ workspaceId: workspace.id, slug: "fixture-project", name: "Fixture project" });
    const legacyProjectDir = seedLegacyProject(fixtureRoot, project.id);
    globalThis.fetch = (async () => new Response(Buffer.from("fixture-reference"), {
      status: 200,
      headers: { "content-type": "image/png" },
    })) as typeof fetch;

    await refCmd().parseAsync(
      ["pull", "https://example.test/hero.png", "--kind", "reference-image", "--project", project.id],
      { from: "user" },
    );

    const context = { workspaceId: workspace.id, projectId: project.id };
    const artifacts = listArtifacts({ context, limit: 10 }).items;
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.kind).toBe("image");
    const revision = listArtifactRevisions({ context, artifactId: artifacts[0]!.id, limit: 10 }).items[0]!;
    const usages = listArtifactUsages({ context, revisionId: revision.id, limit: 10 }).items;
    expect(usages).toHaveLength(1);
    expect(usages[0]?.projectId).toBe(project.id);
    expect(usages[0]?.role).toBe("reference");
    expect(fs.readdirSync(path.join(legacyProjectDir, "artifacts", "refs"))).toHaveLength(0);
    expect(fs.existsSync(path.join(legacyProjectDir, "logs", "generations.jsonl"))).toBe(false);
  });

  test("reference image pull can create a Workspace-shared Artifact usage", async () => {
    const workspace = createWorkspace({ slug: "shared", name: "Shared" });
    globalThis.fetch = (async () => new Response(Buffer.from("workspace-reference"), {
      status: 200,
      headers: { "content-type": "image/png" },
    })) as typeof fetch;

    await refCmd().parseAsync(
      ["pull", "https://example.test/shared.png", "--kind", "reference-image",
        "--workspace", workspace.slug],
      { from: "user" },
    );

    const context = { workspaceId: workspace.id };
    const artifacts = listArtifacts({ context, limit: 10 }).items;
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.projectId).toBeNull();
    const revision = listArtifactRevisions({
      context,
      artifactId: artifacts[0]!.id,
      limit: 10,
    }).items[0]!;
    const usages = listArtifactUsages({ context, revisionId: revision.id, limit: 10 }).items;
    expect(usages).toHaveLength(1);
    expect(usages[0]?.workspaceId).toBe(workspace.id);
    expect(usages[0]?.projectId).toBeNull();
    expect(usages[0]?.role).toBe("reference");
  });

  test("ordinary local video pull creates one ordered Run-backed reference set without legacy paths", async () => {
    const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
    if (ffmpeg.status !== 0) return;
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const project = createProject({ workspaceId: workspace.id, slug: "ordinary-ref", name: "Ordinary ref" });
    const source = path.join(fixtureRoot, "TASK4_REF_PATH_SENTINEL.mp4");
    const created = spawnSync("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=black:s=32x32:d=0.2",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=0.2",
      "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source,
    ], { encoding: "utf8" });
    expect(created.status).toBe(0);

    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.map(String).join(" "));
    try {
      await refCmd().parseAsync([
        "pull", "fixture-label", "--local", source, "--slug", "ordinary",
        "--project", project.id,
      ], { from: "user" });
    } finally {
      console.log = originalLog;
    }

    const context = { workspaceId: workspace.id, projectId: project.id };
    const artifacts = listArtifacts({ context, limit: 10 }).items;
    expect(artifacts.map((artifact) => [artifact.slug, artifact.kind]).sort()).toEqual([
      ["ordinary-audio", "audio"],
      ["ordinary-metadata", "data"],
      ["ordinary-video", "video"],
    ]);
    const revisions = artifacts.flatMap((artifact) => listArtifactRevisions({
      context, artifactId: artifact.id, limit: 10,
    }).items);
    expect(revisions).toHaveLength(3);
    for (const revision of revisions) {
      expect(listArtifactUsages({ context, revisionId: revision.id, limit: 10 }).items[0]?.role)
        .toBe("reference");
    }
    const runs = listRuns({ context, limit: 10 }).items;
    expect(runs).toHaveLength(1);
    expect(runs[0]?.state).toBe("succeeded");
    const resultPositions = openDomainDb().query<{ position: number }, [string]>(
      "SELECT position FROM run_results WHERE run_id = ? ORDER BY position",
    ).all(runs[0]!.id).map((row) => row.position);
    expect(resultPositions).toEqual([0, 1, 2]);
    expectLocatorFree(JSON.parse(output.join("\n")), [fixtureRoot, "TASK4_REF_PATH_SENTINEL"]);
    expectLocatorFree(persistedGenerationPayloads(), [fixtureRoot, "TASK4_REF_PATH_SENTINEL"]);
    expect(fs.existsSync(path.join(fixtureRoot, ".ralphy", "references", "ordinary"))).toBe(false);
  }, 30_000);

  test("voice design persists every preview in one ordered Run and returns safe preview identities", async () => {
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const project = createProject({ workspaceId: workspace.id, slug: "voices", name: "Voices" });
    process.env.ELEVENLABS_API_KEY = "fixture-elevenlabs-key";
    globalThis.fetch = (async () => new Response(JSON.stringify({
      previews: [1, 2, 3].map((index) => ({
        audio_base_64: Buffer.from(`fixture-preview-${index}`).toString("base64"),
        generated_voice_id: `candidate_${index}`,
        duration_secs: index,
      })),
      text: "A deliberately long fixture sentence for all three candidate previews.",
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.map(String).join(" "));
    try {
      await voiceCmd().parseAsync([
        "design", "--project", project.id,
        "--description", "A calm and warm documentary narrator with measured pacing",
        "--out", "review-set", "--stem", "candidate",
      ], { from: "user" });
    } finally {
      console.log = originalLog;
    }

    const context = { workspaceId: workspace.id, projectId: project.id };
    const artifacts = listArtifacts({ context, limit: 10 }).items;
    expect(artifacts.map((artifact) => artifact.slug).sort()).toEqual([
      "voice-design-review-set-candidate-1",
      "voice-design-review-set-candidate-2",
      "voice-design-review-set-candidate-3",
    ]);
    expect(artifacts.map((artifact) => artifact.kind)).toEqual(["audio", "audio", "audio"]);
    const runs = listRuns({ context, limit: 10 }).items;
    expect(runs).toHaveLength(1);
    expect(runs[0]?.state).toBe("succeeded");
    expect(openDomainDb().query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM run_results WHERE run_id = ?",
    ).get(runs[0]!.id)?.count).toBe(3);
    const payload = JSON.parse(output.join("\n")) as {
      previews: Array<Record<string, unknown>>;
      runId: string;
    };
    expect(payload.previews).toHaveLength(3);
    expect(payload.previews.map((preview) => preview.generated_voice_id))
      .toEqual(["candidate_1", "candidate_2", "candidate_3"]);
    for (const preview of payload.previews) {
      expect(typeof preview.artifactId).toBe("string");
      expect(typeof preview.revisionId).toBe("string");
      expect(preview).not.toHaveProperty("path");
    }
    expectLocatorFree(payload, [fixtureRoot]);
  });

  test("voice clone omits the raw source locator from successful domain evidence", async () => {
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const project = createProject({ workspaceId: workspace.id, slug: "voice-clone", name: "Voice clone" });
    seedLegacyProject(fixtureRoot, project.id);
    process.env.ELEVENLABS_API_KEY = "fixture-elevenlabs-key";
    const source = path.join(fixtureRoot, "TASK4_VOICE_SOURCE_LOCATOR.mp3");
    fs.writeFileSync(source, "fixture-voice-audio");
    globalThis.fetch = (async () => new Response(JSON.stringify({ voice_id: "voice_fixture_1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

    await voiceCmd().parseAsync([
      "clone", "--project", project.id, "--from", source, "--name", "Fixture Voice",
    ], { from: "user" });

    expect(persistedGenerationText()).not.toContain("TASK4_VOICE_SOURCE_LOCATOR.mp3");
  });

  test("malformed OpenRouter response is projected before persistence or user output", async () => {
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const project = createProject({ workspaceId: workspace.id, slug: "provider-failure", name: "Provider failure" });
    seedLegacyProject(fixtureRoot, project.id);
    process.env.OPENROUTER_API_KEY = "fixture-openrouter-key";
    openrouterConnector.generateImage = originalGenerateImage;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: PROVIDER_FAILURE_SENTINEL }, finish_reason: "stop" }],
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    const stdout: string[] = [];
    const stderr: string[] = [];
    const originalLog = console.log;
    const originalWrite = process.stderr.write;
    console.log = (...args: unknown[]) => stdout.push(args.map(String).join(" "));
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    let caught: unknown;
    try {
      setMode("pretty");
      await generateCmd().parseAsync([
        "image", "--project", project.id, "--slot", "broken",
        "--prompt", "malformed fixture", "--provider", "openrouter", "--no-retry",
        "--no-ref-consent", "fixture provider",
      ], { from: "user" });
    } catch (error) {
      caught = error;
    } finally {
      setMode("json");
      console.log = originalLog;
      process.stderr.write = originalWrite;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).not.toContain(PROVIDER_FAILURE_SENTINEL);
    expect(stdout.join("\n")).not.toContain(PROVIDER_FAILURE_SENTINEL);
    expect(stderr.join("\n")).not.toContain(PROVIDER_FAILURE_SENTINEL);
    expect(persistedGenerationText()).not.toContain(PROVIDER_FAILURE_SENTINEL);
    const context = { workspaceId: workspace.id, projectId: project.id };
    const run = listRuns({ context, limit: 10 }).items[0]!;
    expect(run.state).toBe("failed");
    const persistedError = openDomainDb().query<{ error: string | null }, [string]>(
      "SELECT error FROM runs WHERE id = ?",
    ).get(run.id)?.error;
    expect(persistedError).toBe("openrouter request failed");
  });

  test("video extend persists the connector actually selected by fallback", async () => {
    if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) return;
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    const project = createProject({ workspaceId: workspace.id, slug: "fal-extend", name: "Fal extend" });
    const source = path.join(fixtureRoot, "source.mp4");
    const generated = spawnSync("ffmpeg", [
      "-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=32x32:d=0.2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", source,
    ]);
    expect(generated.status).toBe(0);
    const originalOpenrouterAvailable = openrouterConnector.available;
    const originalFalAvailable = falConnector.available;
    const originalFalGenerateVideo = falConnector.generateVideo;
    openrouterConnector.available = () => false;
    falConnector.available = () => true;
    falConnector.generateVideo = async (input) => {
      fs.mkdirSync(path.dirname(input.outputPath!), { recursive: true });
      fs.writeFileSync(input.outputPath!, "fixture-video");
      return { localPath: input.outputPath!, costUsd: 0.2, latencyMs: 1, model: input.model! };
    };
    try {
      await videoCmd().parseAsync([
        "extend", source, "--project", project.id, "--slot", "next",
        "--prompt", "continue", "--duration", "5",
      ], { from: "user" });
    } finally {
      openrouterConnector.available = originalOpenrouterAvailable;
      falConnector.available = originalFalAvailable;
      falConnector.generateVideo = originalFalGenerateVideo;
    }

    const context = { workspaceId: workspace.id, projectId: project.id };
    const run = listRuns({ context, limit: 10 }).items[0]!;
    expect(listRunAttempts({ context, runId: run.id, limit: 10 }).items[0]?.provider).toBe("fal");
    const metadata = openDomainDb().query<{ metadata: string }, []>(
      "SELECT metadata_json AS metadata FROM objects ORDER BY created_at DESC LIMIT 1",
    ).get()?.metadata;
    expect(JSON.parse(metadata ?? "null")).toMatchObject({ provider: "fal" });
  });
});

function persistedGenerationPayloads(): unknown[] {
  const rows = openDomainDb().query<{ value: string | null }, []>(`
    SELECT metadata_json AS value FROM artifact_revisions
    UNION ALL SELECT metadata_json FROM objects
    UNION ALL SELECT request_json FROM run_attempts
    UNION ALL SELECT response_json FROM run_attempts
    UNION ALL SELECT metadata_json FROM run_objects
    UNION ALL SELECT payload_json FROM activity_events
  `).all();
  return rows.flatMap((row) => row.value === null ? [] : [JSON.parse(row.value)]);
}

function generationAttemptInput(runId: string) {
  const row = openDomainDb().query<{ request: string | null }, [string]>(
    "SELECT request_json AS request FROM run_attempts WHERE run_id = ?",
  ).get(runId);
  return readGenerationInput(JSON.parse(row?.request ?? "null"));
}

function persistedGenerationText(): string {
  return openDomainDb().query<{ value: string | null }, []>(`
    SELECT error AS value FROM runs
    UNION ALL SELECT metadata_json FROM runs
    UNION ALL SELECT error FROM run_attempts
    UNION ALL SELECT provider FROM run_attempts
    UNION ALL SELECT model FROM run_attempts
    UNION ALL SELECT request_json FROM run_attempts
    UNION ALL SELECT response_json FROM run_attempts
    UNION ALL SELECT path FROM run_objects
    UNION ALL SELECT metadata_json FROM run_objects
    UNION ALL SELECT bucket FROM objects
    UNION ALL SELECT key FROM objects
    UNION ALL SELECT metadata_json FROM objects
    UNION ALL SELECT metadata_json FROM artifact_revisions
    UNION ALL SELECT payload_json FROM activity_events
  `).all().map((row) => row.value ?? "").join("\n");
}

function expectLocatorFree(value: unknown, forbiddenValues: readonly string[]): void {
  const forbiddenFields = new Set(["localPath", "remoteUrl", "anchor", "anchorPath", "providerPath"]);
  const visit = (item: unknown): void => {
    if (typeof item === "string") {
      for (const forbidden of forbiddenValues) expect(item).not.toContain(forbidden);
      return;
    }
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      expect(forbiddenFields.has(key)).toBe(false);
      visit(child);
    }
  };
  visit(value);
}
