// Local matting engine bridge (issue #560).
//
// Free before paid: `ralphy matte subject` runs a matting model on this
// machine with ONNX Runtime inside a pinned Python virtual environment that
// Ralphy owns, next to the #559 tracking stack. No model provider is called,
// and the matting script never opens a network connection. `ralphy matte
// setup` is the only step that downloads anything: the pinned Python wheels
// and the pinned model files, each verified by SHA-256.
//
// `ralphy matte key` (green / blue screen) needs none of this: it is a pure
// ffmpeg filter graph (see chroma.ts).
//
// Layout (per machine, outside any project):
//   ${RALPHY_HOME:-~/.ralphy}/tools/matting/<stack-id>/
//     venv/                                  pinned interpreter + packages
//     models/rvm_mobilenetv3_fp32.onnx       default video matting model
//     models/BiRefNet-...-epoch_232.onnx     optional (`--models rvm,birefnet`)
//     matter-<sha8>.py                       content-addressed copy of matter.py
//     stack.json                             install marker
//
// `RALPHY_MATTE_PYTHON=<interpreter>` bypasses the managed venv (any Python
// with numpy, pillow and onnxruntime); models still live in the stack dir.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ralphyHomeDir } from "../track/engine.js";
import matterSource from "./matter.py" with { type: "text" };

export const MATTE_MODELS = ["rvm", "birefnet"] as const;
export type MatteModel = (typeof MATTE_MODELS)[number];

export type MatteModelSpec = {
  file: string;
  url: string;
  sha256: string;
  bytes: number;
  license: string;
  note: string;
};

export const MATTE_STACK = {
  id: "py3.12-onnxruntime1.23.2-numpy2.5.4",
  python: "3.12",
  /** Full transitive pin set, resolved with `uv pip compile --python-version 3.12`. */
  requirements: [
    "coloredlogs==15.0.1",
    "flatbuffers==25.12.19",
    "humanfriendly==10.0",
    "mpmath==1.3.0",
    "numpy==2.5.4",
    "onnxruntime==1.23.2",
    "packaging==26.3",
    "pillow==13.0.0",
    "protobuf==7.36.2",
    "sympy==1.14.0",
  ],
  models: {
    rvm: {
      file: "rvm_mobilenetv3_fp32.onnx",
      url: "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx",
      sha256: "88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828",
      bytes: 14_975_696,
      license: "GPL-3.0 (downloaded from upstream at setup, never bundled)",
      note: "Robust Video Matting, MobileNetV3, recurrent: temporally stable human mattes, ~20 fps at 1080x1920 on CPU",
    },
    birefnet: {
      file: "BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx",
      url: "https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx",
      sha256: "5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333",
      bytes: 224_005_088,
      license: "MIT",
      note: "BiRefNet lite (Swin-T), per frame at 1024x1024: any subject (not only people), ~3 s per frame on CPU",
    },
  } satisfies Record<MatteModel, MatteModelSpec>,
} as const;

export const DEFAULT_SETUP_MODELS: readonly MatteModel[] = ["rvm"];

export type MatteEngineStatus = {
  installed: boolean;
  stack: string;
  dir: string;
  python: string | null;
  source: "managed" | "env" | "none";
  models: Record<MatteModel, boolean>;
  installedAt: string | null;
  uv: boolean;
  hint: string | null;
};

export function matteStackDir(): string {
  return path.join(ralphyHomeDir(), "tools", "matting", MATTE_STACK.id);
}

function venvPython(dir: string): string {
  return process.platform === "win32"
    ? path.join(dir, "venv", "Scripts", "python.exe")
    : path.join(dir, "venv", "bin", "python");
}

export function matteModelPath(model: MatteModel): string {
  return path.join(matteStackDir(), "models", MATTE_STACK.models[model].file);
}

function hasBinary(name: string): boolean {
  const r = spawnSync(name, ["--version"], { stdio: "ignore" });
  return r.status === 0;
}

function modelPresence(): Record<MatteModel, boolean> {
  return {
    rvm: existsSync(matteModelPath("rvm")),
    birefnet: existsSync(matteModelPath("birefnet")),
  };
}

/** Cheap status: file checks only, no Python start (doctor stays fast). */
export function matteEngineStatus(): MatteEngineStatus {
  const dir = matteStackDir();
  const uv = hasBinary("uv");
  const models = modelPresence();
  const envPython = process.env.RALPHY_MATTE_PYTHON;
  if (envPython) {
    const ok = existsSync(envPython) || hasBinary(envPython);
    return {
      installed: ok,
      stack: "env:RALPHY_MATTE_PYTHON",
      dir,
      python: envPython,
      source: "env",
      models,
      installedAt: null,
      uv,
      hint: ok ? (models.rvm ? null : "Run `ralphy matte setup` to download the matting model.") : `RALPHY_MATTE_PYTHON points at ${envPython}, which does not run.`,
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
    return { installed: true, stack: MATTE_STACK.id, dir, python: py, source: "managed", models, installedAt, uv, hint: null };
  }
  return {
    installed: false,
    stack: MATTE_STACK.id,
    dir,
    python: null,
    source: "none",
    models,
    installedAt: null,
    uv,
    hint: uv
      ? "Run `ralphy matte setup` (installs a pinned ONNX Runtime venv plus the 15 MB RVM model, about 150 MB, once per machine). `ralphy matte key` needs only ffmpeg."
      : "Install uv (`brew install uv`), then run `ralphy matte setup`. `ralphy matte key` needs only ffmpeg.",
  };
}

/** Write matter.py into the stack dir under a content hash (never overwrites a different file). */
export function materializeMatterScript(dir = matteStackDir()): string {
  const sha = createHash("sha256").update(matterSource).digest("hex").slice(0, 8);
  const file = path.join(dir, `matter-${sha}.py`);
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, matterSource, { mode: 0o644 });
  }
  return file;
}

export function matterScriptSource(): string {
  return matterSource;
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
 * Child environment for the matting script: no provider credentials, no
 * proxies. The script has no network code; stripping keys makes "zero
 * provider calls" structural rather than a promise.
 */
export function matterChildEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const keep = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "SYSTEMROOT", "TEMP", "TMP"];
  const env: NodeJS.ProcessEnv = {};
  for (const k of keep) if (base[k] !== undefined) env[k] = base[k];
  env.ORT_LOGGING_LEVEL = "3";
  return env;
}

export type MatterOutput = {
  engine: { python: string; numpy: string; onnxruntime: string; pillow: string; providers: string[] };
  model: MatteModel;
  source: { width: number; height: number; fps: number; frames: number | null; duration: number | null; rate: string };
  frames: number;
  wallSeconds: number;
  inferSeconds: number;
  fps: number | null;
  stats: { meanCoverage: number; partialAlpha: number; flicker: number };
  params: { downsample: number | null; size: number | null; device: string };
};

export class MatteEngineError extends Error {
  constructor(
    readonly kind: "missing" | "input" | "dependency" | "crash",
    message: string,
  ) {
    super(message);
  }
}

export async function runMatter(args: string[], opts: { timeoutMs?: number } = {}): Promise<MatterOutput> {
  const status = matteEngineStatus();
  if (!status.installed || !status.python) {
    throw new MatteEngineError("missing", status.hint ?? "local matting engine is not installed");
  }
  const script = materializeMatterScript();
  const r = await run(status.python, ["-I", script, ...args], { env: matterChildEnv(), timeoutMs: opts.timeoutMs ?? 60 * 60_000 });
  const line = r.stdout.trim().split("\n").filter(Boolean).pop() ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new MatteEngineError("crash", `matting engine exited ${r.code} without JSON: ${r.stderr.slice(-600)}`);
  }
  const obj = parsed as { error?: { kind: string; message: string } } & MatterOutput;
  if (obj.error) {
    const kind = obj.error.kind === "input" || obj.error.kind === "dependency" ? obj.error.kind : "crash";
    throw new MatteEngineError(kind, obj.error.message);
  }
  if (r.code !== 0) throw new MatteEngineError("crash", `matting engine exited ${r.code}: ${r.stderr.slice(-600)}`);
  return obj;
}

export type SetupStep = { step: string; ok: boolean; detail?: string };

/** Parse `--models rvm,birefnet`; null on an unknown name. */
export function parseSetupModels(raw: string | undefined): MatteModel[] | null {
  if (raw === undefined) return [...DEFAULT_SETUP_MODELS];
  const names = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) return null;
  const outList: MatteModel[] = [];
  for (const n of names) {
    if (!(MATTE_MODELS as readonly string[]).includes(n)) return null;
    if (!outList.includes(n as MatteModel)) outList.push(n as MatteModel);
  }
  return outList;
}

async function downloadModel(model: MatteModel, log: (s: string) => void): Promise<SetupStep> {
  const spec: MatteModelSpec = MATTE_STACK.models[model];
  const dest = matteModelPath(model);
  log(`downloading ${spec.file} (${Math.round(spec.bytes / 1e6)} MB, ${spec.license})`);
  const res = await fetch(spec.url);
  if (!res.ok) return { step: `model:${model}`, ok: false, detail: `HTTP ${res.status}` };
  const buf = Buffer.from(await res.arrayBuffer());
  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== spec.sha256) return { step: `model:${model}`, ok: false, detail: `sha256 mismatch: ${sha}` };
  writeFileSync(dest, buf);
  return { step: `model:${model}`, ok: true };
}

/**
 * Create the pinned venv with uv, install the pinned packages (wheels only),
 * download the requested models, verify their SHA-256, probe, and write the
 * marker. Idempotent: an installed stack with the requested models returns
 * immediately unless `force`.
 */
export async function setupMatteEngine(
  opts: { force?: boolean; models?: MatteModel[]; log?: (s: string) => void } = {},
): Promise<{ status: MatteEngineStatus; steps: SetupStep[] }> {
  const log = opts.log ?? (() => {});
  const wanted = opts.models ?? [...DEFAULT_SETUP_MODELS];
  const steps: SetupStep[] = [];
  const dir = matteStackDir();
  const before = matteEngineStatus();
  const missingModels = wanted.filter((m) => !before.models[m]);
  if (before.installed && before.source === "managed" && missingModels.length === 0 && !opts.force) {
    steps.push({ step: "check", ok: true, detail: "already installed" });
    return { status: before, steps };
  }
  mkdirSync(path.join(dir, "models"), { recursive: true });
  const needVenv = !(before.installed && before.source === "managed") || opts.force;
  const py = venvPython(dir);
  if (needVenv) {
    if (!before.uv) {
      steps.push({ step: "uv", ok: false, detail: "uv not found; install it (`brew install uv`) and re-run" });
      return { status: before, steps };
    }
    if (!existsSync(py) || opts.force) {
      log(`creating venv (Python ${MATTE_STACK.python}) in ${dir}/venv`);
      const v = await run("uv", ["venv", "--python", MATTE_STACK.python, "--allow-existing", path.join(dir, "venv")]);
      steps.push({ step: "venv", ok: v.code === 0, detail: v.code === 0 ? undefined : v.stderr.slice(-400) });
      if (v.code !== 0) return { status: matteEngineStatus(), steps };
    }
    const req = path.join(dir, "requirements.txt");
    writeFileSync(req, MATTE_STACK.requirements.join("\n") + "\n");
    log("installing pinned packages (wheels only)");
    const inst = await run("uv", ["pip", "install", "--python", py, "--only-binary", ":all:", "-r", req]);
    steps.push({ step: "packages", ok: inst.code === 0, detail: inst.code === 0 ? undefined : inst.stderr.slice(-600) });
    if (inst.code !== 0) return { status: matteEngineStatus(), steps };
  }
  for (const m of wanted) {
    if (existsSync(matteModelPath(m)) && !opts.force) {
      steps.push({ step: `model:${m}`, ok: true, detail: "present" });
      continue;
    }
    const s = await downloadModel(m, log);
    steps.push(s);
    if (!s.ok) return { status: matteEngineStatus(), steps };
  }
  const pyForProbe = before.source === "env" && before.python ? before.python : py;
  const script = materializeMatterScript(dir);
  const probe = await run(pyForProbe, ["-I", script, "--mode", "probe"], { env: matterChildEnv(), timeoutMs: 120_000 });
  let engine: Record<string, unknown> | null = null;
  try {
    engine = (JSON.parse(probe.stdout.trim().split("\n").pop() ?? "") as { engine: Record<string, unknown> }).engine;
  } catch {
    engine = null;
  }
  const probeOk = probe.code === 0 && engine !== null && typeof engine.onnxruntime === "string";
  steps.push({ step: "probe", ok: probeOk, detail: probeOk ? JSON.stringify(engine) : probe.stderr.slice(-400) });
  if (!probeOk) return { status: matteEngineStatus(), steps };
  if (before.source !== "env") {
    writeFileSync(
      path.join(dir, "stack.json"),
      JSON.stringify({ stack: MATTE_STACK.id, engine, installedAt: new Date().toISOString() }, null, 2) + "\n",
    );
  }
  return { status: matteEngineStatus(), steps };
}
