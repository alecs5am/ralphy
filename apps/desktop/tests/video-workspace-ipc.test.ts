import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canvasCli } from "../electron/canvas/runtime-cli";
import { toIpcResult } from "../electron/ipc-security";
import { registerVideoWorkspaceIpc } from "../electron/video-workspace/ipc";
import * as runtime from "../electron/video-workspace/runtime";
import { blankVideoComposition, VIDEO_CHANNELS, VideoWorkspaceError } from "../shared/video-workspace";

afterEach(() => vi.restoreAllMocks());

test("CLI requests a single summary from streaming media commands", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-cli-stream-"));
  try {
    const executable = join(directory, "runtime");
    await writeFile(executable, '#!/bin/sh\ncase " $* " in *" --quiet "*) ;; *) printf \'%s\\n\' \'{"kind":"generate-video-started"}\';; esac\nprintf \'%s\\n\' \'{"kind":"summary","revisionId":"arev_video"}\'\n', { mode: 0o700 });
    expect(await canvasCli(executable, directory)(["generate", "video"])).toEqual({ kind: "summary", revisionId: "arev_video" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test.each([
  ["loadVideoWorkspace", "loadVideo", []],
  ["saveVideoWorkspace", "saveVideo", [blankVideoComposition(), 30, null]],
  ["importVideoWorkspaceAsset", "importVideoAsset", ["/tmp/clip.mp4"]],
  ["renderVideoWorkspace", "renderVideo", ["saved-revision"]],
] as const)("%s awaits rejected work and preserves only safe actionable messages", async (channel, method, args) => {
  const failure = vi.spyOn(runtime, method);
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  registerVideoWorkspaceIpc({ handle: (key, handler) => { handlers.set(key, handler); },
    capture: async () => ({ request: async () => ({}), assertCurrent() {} }) as unknown as runtime.VideoRuntime,
    chooseFile: async () => null,
  });
  const invoke = () => handlers.get(VIDEO_CHANNELS[channel])!({ workspaceId: "ws", projectId: "p", unitId: "u" }, ...args);
  failure.mockRejectedValueOnce(new VideoWorkspaceError("The saved video changed. Reload before retrying."));
  expect(await toIpcResult(invoke)).toMatchObject({ ok: false, error: { code: "E_VALIDATION_FAILED", message: "The saved video changed. Reload before retrying." } });
  failure.mockRejectedValueOnce(Object.assign(new Error("private runtime output"), { code: "E_DEP_MISSING" }));
  const setup = await toIpcResult(invoke);
  expect(setup).toMatchObject({ ok: false, error: { code: "E_DEP_MISSING", message: expect.stringContaining("Bun (bunx)") } });
  expect(JSON.stringify(setup)).not.toContain("private runtime output");
  failure.mockRejectedValueOnce(new Error("private filesystem path and token"));
  await expect(invoke()).rejects.toMatchObject({ code: "E_INTERNAL" });
  failure.mockRejectedValueOnce(new Error("private filesystem path and token"));
  expect(await toIpcResult(invoke)).toEqual({ ok: false, error: { code: "E_INTERNAL", message: "The operation could not be completed" } });
});

test("CLI prerequisite errors on stderr keep their safe classification through IPC", async () => {
  const directory = await mkdtemp(join(tmpdir(), "video-cli-prerequisite-"));
  try {
    const executable = join(directory, "runtime");
    await writeFile(executable, '#!/bin/sh\nprintf \'%s\\n\' \'{"error":{"code":"E_DEP_MISSING","message":"private stderr"}}\' >&2\nexit 4\n', { mode: 0o700 });
    const result = await toIpcResult(() => canvasCli(executable, directory)(["composition", "build"]));
    expect(result).toMatchObject({ ok: false, error: { code: "E_DEP_MISSING", message: expect.stringContaining("saved timeline is preserved") } });
    expect(JSON.stringify(result)).not.toContain("private stderr");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("CLI errors on stderr show the message instead of a raw JSON envelope", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-cli-error-"));
  try {
    const executable = join(directory, "runtime");
    await writeFile(executable, '#!/bin/sh\nprintf \'%s\\n\' \'{"error":{"code":"E_PROVIDER_CREDITS","message":"Check provider credits"}}\' >&2\nexit 3\n', { mode: 0o700 });
    await expect(canvasCli(executable, directory)(["generate", "image"])).rejects.toThrow("Check provider credits");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
