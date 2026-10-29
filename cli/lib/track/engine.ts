// Local tracking engine bridge (issue #559).
//
// Free before paid: tracking runs on this machine through OpenCV (and
// MediaPipe for faces) inside a pinned Python virtual environment that Ralphy
// owns. No model provider is called on this path, and the tracker itself
// never opens a network connection. `ralphy track setup` is the only step
// that downloads anything: the pinned Python packages and one pinned face
// model file, verified by SHA-256.
//
// Layout (per machine, outside any project):
//   ${RALPHY_HOME:-~/.ralphy}/tools/tracking/<stack-id>/
//     venv/                          pinned interpreter + packages
//     models/blaze_face_short_range.tflite
//     tracker-<sha8>.py              content-addressed copy of tracker.py
//     stack.json                     install marker (versions, installedAt)
//
// `RALPHY_TRACK_PYTHON=<interpreter>` bypasses the managed venv (bring your
// own environment with opencv-contrib-python installed).

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import trackerSource from "./tracker.py" with { type: "text" };

export const TRACK_STACK = {
  id: "py3.12-opencv5.0.0.93-mediapipe1.2.0",
  python: "3.12",
  /** Full transitive pin set, resolved with `uv pip compile --python-version 3.12`. */
  requirements: [
    "absl-py==2.5.1",
    "certifi==2026.10.23",
    "cffi==2.1.1",
    "contourpy==1.4.0",
    "cycler==0.12.1",
    "flatbuffers==25.12.19",
    "fonttools==4.68.0",
    "kiwisolver==1.5.1",
    "matplotlib==3.11.2",
    "mediapipe==1.2.0",
    "numpy==2.5.4",
    "opencv-contrib-python==5.0.0.93",
    "packaging==26.3",
    "pillow==13.0.0",
    "pycparser==3.12",
    "pyparsing==3.3.3",
    "python-dateutil==3.0.0",
    "six==1.17.0",
    "sounddevice==0.5.6",
    "tzdata==2026.6",
  ],
  faceModel: {
    file: "blaze_face_short_range.tflite",
    url: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
    sha256: "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f",
    bytes: 229_746,
  },
} as const;

export type TrackEngineStatus = {
  installed: boolean;
  stack: string;
  dir: string;
  python: string | null;
  source: "managed" | "env" | "none";
  faceModel: boolean;
  installedAt: string | null;
  uv: boolean;
  hint: string | null;
};

export function ralphyHomeDir(): string {
  return process.env.RALPHY_HOME || path.join(os.homedir(), ".ralphy");
}

export function trackStackDir(): string {
  return path.join(ralphyHomeDir(), "tools", "tracking", TRACK_STACK.id);
}

function venvPython(dir: string): string {
  return process.platform === "win32"
    ? path.join(dir, "venv", "Scripts", "python.exe")
    : path.join(dir, "venv", "bin", "python");
}

export function faceModelPath(): string {
  return path.join(trackStackDir(), "models", TRACK_STACK.faceModel.file);
}

function hasBinary(name: string): boolean {
  const r = spawnSync(name, ["--version"], { stdio: "ignore" });
  return r.status === 0;
}

/** Cheap status: file checks only, no Python start (doctor stays fast). */
export function trackEngineStatus(): TrackEngineStatus {
  const dir = trackStackDir();
  const uv = hasBinary("uv");
  const envPython = process.env.RALPHY_TRACK_PYTHON;
  const face = existsSync(faceModelPath());
  if (envPython) {
    const ok = existsSync(envPython) || hasBinary(envPython);
    return {
      installed: ok,
      stack: "env:RALPHY_TRACK_PYTHON",
      dir,
      python: envPython,
      source: "env",
      faceModel: face,
      installedAt: null,
      uv,
      hint: ok ? null : `RALPHY_TRACK_PYTHON points at ${envPython}, which does not run.`,
    };
  }
  const marker = path.join(dir, "stack.json");
  const py = venvPython(dir);
  if (existsSync(marker) && existsSync(py)) {
    let installedAt: string | null = null;
    try {
      installedAt = (JSON.parse(readFileSync(marker, "utf8")) as { installedAt?: string }).installedAt ?? null;
    } catch {
      installedAt = null;
    }
    return { installed: true, stack: TRACK_STACK.id, dir, python: py, source: "managed", faceModel: face, installedAt, uv, hint: null };
  }
  return {
    installed: false,
    stack: TRACK_STACK.id,
    dir,
    python: null,
    source: "none",
    faceModel: face,
    installedAt: null,
    uv,
    hint: uv
      ? "Run `ralphy track setup` (installs a pinned OpenCV + MediaPipe venv, about 350 MB, once per machine)."
      : "Install uv (`brew install uv`), then run `ralphy track setup`.",
  };
}

/** Write tracker.py into the stack dir under a content hash (never overwrites a different file). */
export function materializeTrackerScript(dir = trackStackDir()): string {
  const sha = createHash("sha256").update(trackerSource).digest("hex").slice(0, 8);
  const file = path.join(dir, `tracker-${sha}.py`);
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, trackerSource, { mode: 0o644 });
  }
  return file;
}

export function trackerScriptSource(): string {
  return trackerSource;
}

type RunResult = { code: number; stdout: string; stderr: string };

function run(cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { env: opts.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (opts.timeoutMs) timer = setTimeout(() => proc.kill("SIGKILL"), opts.timeoutMs);
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) => {
      if (timer) clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + String(e) });
    });
    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/**
 * Child environment for the tracker: no provider credentials, no proxies.
 * The tracker has no network code; stripping keys makes "zero provider
 * calls" structural rather than a promise.
 */
export function trackerChildEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const keep = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "SYSTEMROOT", "TEMP", "TMP"];
  const env: NodeJS.ProcessEnv = {};
  for (const k of keep) if (base[k] !== undefined) env[k] = base[k];
  // Quiet MediaPipe / TFLite / OpenCV chatter on stderr.
  env.GLOG_minloglevel = "2";
  env.TF_CPP_MIN_LOG_LEVEL = "2";
  env.OPENCV_LOG_LEVEL = "ERROR";
  env.MPLCONFIGDIR = path.join(trackStackDir(), "mplconfig");
  return env;
}

export type EngineOutput = {
  engine: { python: string; opencv: string; numpy: string; mediapipe: string | null };
  method: string;
  source: { width: number; height: number; fps: number; frames: number; duration: number | null; procScale: number };
  keyframes: Array<Record<string, unknown>>;
};

export class TrackEngineError extends Error {
  constructor(
    readonly kind: "missing" | "input" | "dependency" | "crash",
    message: string,
  ) {
    super(message);
  }
}

export async function runTracker(args: string[], opts: { timeoutMs?: number } = {}): Promise<EngineOutput> {
  const status = trackEngineStatus();
  if (!status.installed || !status.python) {
    throw new TrackEngineError("missing", status.hint ?? "local tracking engine is not installed");
  }
  const script = materializeTrackerScript();
  const r = await run(status.python, ["-I", script, ...args], { env: trackerChildEnv(), timeoutMs: opts.timeoutMs ?? 30 * 60_000 });
  const line = r.stdout.trim().split("\n").filter(Boolean).pop() ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new TrackEngineError("crash", `tracker exited ${r.code} without JSON: ${r.stderr.slice(-600)}`);
  }
  const obj = parsed as { error?: { kind: string; message: string } } & EngineOutput;
  if (obj.error) {
    const kind = obj.error.kind === "input" || obj.error.kind === "dependency" ? obj.error.kind : "crash";
    throw new TrackEngineError(kind, obj.error.message);
  }
  if (r.code !== 0) throw new TrackEngineError("crash", `tracker exited ${r.code}: ${r.stderr.slice(-600)}`);
  return obj;
}

export type SetupStep = { step: string; ok: boolean; detail?: string };

/**
 * Create the pinned venv with uv, install the pinned packages (wheels only),
 * download the face model, verify its SHA-256, and write the marker.
 * Idempotent: an installed stack returns immediately unless `force`.
 */
export async function setupTrackEngine(opts: { force?: boolean; log?: (s: string) => void } = {}): Promise<{ status: TrackEngineStatus; steps: SetupStep[] }> {
  const log = opts.log ?? (() => {});
  const steps: SetupStep[] = [];
  const dir = trackStackDir();
  const before = trackEngineStatus();
  if (before.installed && before.source === "managed" && before.faceModel && !opts.force) {
    steps.push({ step: "check", ok: true, detail: "already installed" });
    return { status: before, steps };
  }
  if (!before.uv) {
    steps.push({ step: "uv", ok: false, detail: "uv not found; install it (`brew install uv`) and re-run" });
    return { status: before, steps };
  }
  mkdirSync(path.join(dir, "models"), { recursive: true });
  const py = venvPython(dir);
  if (!existsSync(py) || opts.force) {
    log(`creating venv (Python ${TRACK_STACK.python}) in ${dir}/venv`);
    const v = await run("uv", ["venv", "--python", TRACK_STACK.python, "--allow-existing", path.join(dir, "venv")]);
    steps.push({ step: "venv", ok: v.code === 0, detail: v.code === 0 ? undefined : v.stderr.slice(-400) });
    if (v.code !== 0) return { status: trackEngineStatus(), steps };
  }
  const req = path.join(dir, "requirements.txt");
  writeFileSync(req, TRACK_STACK.requirements.join("\n") + "\n");
  log("installing pinned packages (wheels only)");
  const inst = await run("uv", ["pip", "install", "--python", py, "--only-binary", ":all:", "-r", req]);
  steps.push({ step: "packages", ok: inst.code === 0, detail: inst.code === 0 ? undefined : inst.stderr.slice(-600) });
  if (inst.code !== 0) return { status: trackEngineStatus(), steps };

  const model = faceModelPath();
  if (!existsSync(model) || opts.force) {
    log(`downloading ${TRACK_STACK.faceModel.file}`);
    const res = await fetch(TRACK_STACK.faceModel.url);
    if (!res.ok) {
      steps.push({ step: "face-model", ok: false, detail: `HTTP ${res.status}` });
      return { status: trackEngineStatus(), steps };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const sha = createHash("sha256").update(buf).digest("hex");
    if (sha !== TRACK_STACK.faceModel.sha256) {
      steps.push({ step: "face-model", ok: false, detail: `sha256 mismatch: ${sha}` });
      return { status: trackEngineStatus(), steps };
    }
    writeFileSync(model, buf);
  }
  steps.push({ step: "face-model", ok: true });

  const script = materializeTrackerScript(dir);
  const probe = await run(py, ["-I", script, "--mode", "probe"], { env: trackerChildEnv(), timeoutMs: 120_000 });
  let engine: Record<string, unknown> | null = null;
  try {
    engine = (JSON.parse(probe.stdout.trim().split("\n").pop() ?? "") as { engine: Record<string, unknown> }).engine;
  } catch {
    engine = null;
  }
  const probeOk = probe.code === 0 && engine !== null && engine.csrt === true && typeof engine.mediapipe === "string";
  steps.push({ step: "probe", ok: probeOk, detail: probeOk ? JSON.stringify(engine) : probe.stderr.slice(-400) });
  if (!probeOk) return { status: trackEngineStatus(), steps };
  writeFileSync(
    path.join(dir, "stack.json"),
    JSON.stringify({ stack: TRACK_STACK.id, engine, installedAt: new Date().toISOString() }, null, 2) + "\n",
  );
  return { status: trackEngineStatus(), steps };
}
