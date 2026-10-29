// `ralphy matte` — local keying and matting with zero provider calls (issue #560).
//
//   ralphy matte setup [--models rvm,birefnet] [--force]
//   ralphy matte key <video|image> [--screen auto|green|blue] [--low <n>] [--high <n>]
//                    [--despill max|avg|off] [--choke <px>] [--soften <sigma>] [--sample-at <t>]
//   ralphy matte subject <video|image> [--model rvm|birefnet] [--downsample <r>] [--device cpu|coreml]
//
// Both producing verbs write straight-alpha media: VP9-alpha WebM by default
// (`--format mov` for ProRes 4444, a still in gives a PNG out). Outputs are
// append-only: an existing file is never overwritten; the next free
// `<stem>.v2.<ext>`, `<stem>.v3.<ext>`, ... is used instead.
//
// Free before paid: `matte key` is a pure ffmpeg colour-difference keyer;
// `matte subject` runs RVM or BiRefNet locally through ONNX Runtime from the
// pinned venv `ralphy matte setup` makes. CorridorKey 2.0 was evaluated for
// `matte key` and is not used: its runtime requires a CUDA GPU (see
// docs/research/keying-and-matting.md).

import { Command } from "commander";
import { spawn, spawnSync } from "node:child_process";
import { constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { out } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { artifactsDir, projectDir } from "../lib/paths.js";
import { parseTrackTime } from "../lib/track/schema.js";
import {
  chromaKeyGraph,
  DESPILL_MODES,
  estimateScreen,
  isChromaScreen,
  keyThresholds,
  MIN_SCREEN_COVERAGE,
  MIN_SCREEN_STRENGTH,
  SCREENS,
  type DespillMode,
  type Screen,
} from "../lib/matte/chroma.js";
import {
  alphaEncodeArgs,
  defaultMatteOut,
  formatFromOut,
  isImagePath,
  MATTE_FORMATS,
  MATTE_QUALITIES,
  nextFreeFile,
  rgbToOutputTail,
  subjectMergeGraph,
  type MatteKind,
  type MatteQuality,
  type OutputFormat,
} from "../lib/matte/encode.js";
import {
  MATTE_MODELS,
  MATTE_STACK,
  MatteEngineError,
  matteEngineStatus,
  matteModelPath,
  parseSetupModels,
  runMatter,
  setupMatteEngine,
  type MatteModel,
  type MatterOutput,
} from "../lib/matte/engine.js";

type OutputOpts = { format?: string; quality?: string; out?: string; project?: string };

type KeyOpts = OutputOpts & {
  screen?: string;
  low?: string;
  high?: string;
  despill?: string;
  choke?: string;
  soften?: string;
  sampleAt?: string;
};

type SubjectOpts = OutputOpts & {
  model?: string;
  downsample?: string;
  device?: string;
  threads?: string;
};

/** Small sample frame for the screen estimate (RGB24, 96 px wide). */
const SAMPLE_WIDTH = 96;

function intIn(raw: string | undefined, lo: number, hi: number): number | null | undefined {
  if (raw === undefined) return undefined;
  const v = Number(raw);
  return Number.isInteger(v) && v >= lo && v <= hi ? v : null;
}

function numIn(raw: string | undefined, lo: number, hi: number): number | null | undefined {
  if (raw === undefined) return undefined;
  const v = Number(raw);
  return Number.isFinite(v) && v >= lo && v <= hi ? v : null;
}

export type ResolvedOutput = { requested: string; target: string; format: OutputFormat; quality: MatteQuality };

/** Validate --format / --quality / --out / --project and pick the never-overwrite target path. */
export function resolveMatteOutput(source: string, kind: MatteKind, opts: OutputOpts, verb: string): ResolvedOutput {
  const still = isImagePath(source);
  const quality = (opts.quality ?? "balanced") as MatteQuality;
  if (!(MATTE_QUALITIES as readonly string[]).includes(quality)) {
    raiseError("E_FLAG_UNKNOWN", { flag: "quality", value: String(opts.quality), allowed: MATTE_QUALITIES.join(", "), verb });
  }
  let format: OutputFormat;
  if (opts.format !== undefined) {
    if (!(MATTE_FORMATS as readonly string[]).includes(opts.format)) {
      raiseError("E_FLAG_UNKNOWN", { flag: "format", value: opts.format, allowed: MATTE_FORMATS.join(", "), verb });
    }
    if (still) raiseError("E_INPUT_INVALID", { field: "--format", detail: "a still image in always gives a PNG out; drop --format", verb });
    format = opts.format as OutputFormat;
  } else {
    format = still ? "png" : "webm";
  }
  if (opts.out && opts.project) {
    raiseError("E_INPUT_INVALID", { field: "--out", detail: "pass --out or --project, not both", verb });
  }
  let requested: string;
  if (opts.out) {
    requested = path.resolve(opts.out);
    const fromOut = formatFromOut(requested);
    if (!fromOut) raiseError("E_INPUT_INVALID", { field: "--out", detail: "extension must be .webm, .mov or .png", verb });
    if (still && fromOut !== "png") raiseError("E_INPUT_INVALID", { field: "--out", detail: "a still image in needs a .png out", verb });
    if (!still && fromOut === "png") raiseError("E_INPUT_INVALID", { field: "--out", detail: "a video in needs a .webm or .mov out", verb });
    if (opts.format !== undefined && fromOut !== format) {
      raiseError("E_INPUT_INVALID", { field: "--out", detail: `extension .${fromOut} contradicts --format ${format}`, verb });
    }
    format = fromOut!;
  } else if (opts.project) {
    if (!existsSync(projectDir(opts.project))) raiseError("E_NOT_FOUND", { kind: "Project", id: opts.project });
    requested = defaultMatteOut(source, kind, format, artifactsDir(opts.project));
  } else {
    requested = defaultMatteOut(source, kind, format);
  }
  return { requested, target: nextFreeFile(requested), format, quality };
}

type FfResult = { code: number; stderr: string };

function ffmpeg(args: string[]): Promise<FfResult> {
  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", ["-v", "error", "-nostdin", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) => resolve({ code: -1, stderr: String(e) }));
    proc.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });
}

function ffmpegAvailable(): boolean {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}

function probeSize(file: string): { width: number; height: number; frames: number | null; fps: number | null } | null {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=width,height,nb_read_packets,r_frame_rate", "-of", "json", file],
    { encoding: "utf8" },
  );
  if (r.status !== 0) return null;
  try {
    const s = (JSON.parse(r.stdout) as { streams?: Array<Record<string, string | number>> }).streams?.[0];
    if (!s) return null;
    const [n, d] = String(s.r_frame_rate ?? "0/1").split("/").map(Number);
    return {
      width: Number(s.width),
      height: Number(s.height),
      frames: s.nb_read_packets !== undefined ? Number(s.nb_read_packets) : null,
      fps: n && d ? Math.round((n / d) * 1000) / 1000 : null,
    };
  } catch {
    return null;
  }
}

/**
 * Run an encode into a private temp file, then copy it to `target` without
 * ever replacing a file (COPYFILE_EXCL; a name taken meanwhile moves on to
 * the next free .vN). The temp dir is removed before any error is raised,
 * because raiseError exits the process.
 */
async function encodeAppendOnly(target: string, build: (tmpOut: string) => string[], verb: string): Promise<string> {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "ralphy-matte-"));
  const tmpOut = path.join(tmpDir, `out${path.extname(target)}`);
  let failure: string | null = null;
  let final = target;
  try {
    const r = await ffmpeg(build(tmpOut));
    if (r.code !== 0 || !existsSync(tmpOut)) {
      failure = `${verb}: ffmpeg failed (exit ${r.code}): ${r.stderr.trim().slice(-500)}`;
    } else {
      mkdirSync(path.dirname(target), { recursive: true });
      let copied = false;
      for (let i = 0; i < 5 && !copied; i++) {
        try {
          copyFileSync(tmpOut, final, constants.COPYFILE_EXCL);
          copied = true;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
            failure = `${verb}: could not write ${final}: ${(e as Error).message}`;
            break;
          }
          final = nextFreeFile(final);
        }
      }
      if (!copied && !failure) failure = `${verb}: could not find a free output name next to ${target}`;
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  if (failure) raiseError("E_INTERNAL", { detail: failure });
  return final;
}

function sourceOrFail(input: string): string {
  const src = path.resolve(input);
  if (!existsSync(src)) raiseError("E_FILE_UNREADABLE", { path: src });
  if (!ffmpegAvailable()) raiseError("E_DEP_MISSING", { dep: "ffmpeg (`brew install ffmpeg`)" });
  return src;
}

async function runKey(input: string, opts: KeyOpts): Promise<void> {
  const verb = "matte key";
  const screenOpt = opts.screen ?? "auto";
  if (screenOpt !== "auto" && !(SCREENS as readonly string[]).includes(screenOpt)) {
    raiseError("E_FLAG_UNKNOWN", { flag: "screen", value: screenOpt, allowed: ["auto", ...SCREENS].join(", "), verb });
  }
  const despill = (opts.despill ?? "max") as DespillMode;
  if (!(DESPILL_MODES as readonly string[]).includes(despill)) {
    raiseError("E_FLAG_UNKNOWN", { flag: "despill", value: String(opts.despill), allowed: DESPILL_MODES.join(", "), verb });
  }
  const low = intIn(opts.low, 0, 254);
  if (low === null) raiseError("E_INPUT_INVALID", { field: "--low", detail: "expected an integer 0..254 (key-difference units)", verb });
  const high = intIn(opts.high, 1, 255);
  if (high === null) raiseError("E_INPUT_INVALID", { field: "--high", detail: "expected an integer 1..255 (key-difference units)", verb });
  if (low !== undefined && high !== undefined && high <= low) {
    raiseError("E_INPUT_INVALID", { field: "--high", detail: "must be greater than --low", verb });
  }
  const choke = intIn(opts.choke, -8, 8);
  if (choke === null) raiseError("E_INPUT_INVALID", { field: "--choke", detail: "expected an integer -8..8 (pixels; negative grows the matte)", verb });
  const soften = numIn(opts.soften, 0, 10);
  if (soften === null) raiseError("E_INPUT_INVALID", { field: "--soften", detail: "expected a blur sigma 0..10", verb });
  const sampleAt = opts.sampleAt !== undefined ? parseTrackTime(opts.sampleAt) : 0;
  if (!Number.isFinite(sampleAt)) raiseError("E_INPUT_INVALID", { field: "--sample-at", detail: `not a time: ${opts.sampleAt}`, verb });

  const src = sourceOrFail(input);
  const output = resolveMatteOutput(src, "key", opts, verb);

  // Screen estimate from the border of one small frame.
  const sample = spawnSync(
    "ffmpeg",
    ["-v", "error", "-nostdin", ...(isImagePath(src) ? [] : ["-ss", String(sampleAt)]), "-i", src, "-frames:v", "1", "-vf", `scale=${SAMPLE_WIDTH}:-2:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: 1 << 24 },
  );
  const buf = sample.stdout instanceof Buffer ? sample.stdout : Buffer.alloc(0);
  if (sample.status !== 0 || buf.length < SAMPLE_WIDTH * 3) {
    raiseError("E_INPUT_INVALID", { field: "<video>", detail: `could not decode a frame at ${sampleAt}s: ${String(sample.stderr ?? "").trim().slice(-300)}`, verb });
  }
  const sampleHeight = Math.floor(buf.length / 3 / SAMPLE_WIDTH);
  const est = estimateScreen(new Uint8Array(buf), SAMPLE_WIDTH, sampleHeight, {
    screen: screenOpt === "auto" ? undefined : (screenOpt as Screen),
  });
  if (!est) raiseError("E_INTERNAL", { detail: `${verb}: empty sample frame` });
  const explicit = low !== undefined && high !== undefined;
  if (!isChromaScreen(est!) && !explicit) {
    raiseError("E_INPUT_INVALID", {
      field: "<video>",
      detail: `no ${est!.screen} screen found at the frame edge (strength ${est!.strength}, need >= ${MIN_SCREEN_STRENGTH}; border coverage ${est!.coverage}, need >= ${MIN_SCREEN_COVERAGE}). For footage without a chroma screen use \`ralphy matte subject\`; to force a key pass --low and --high`,
      verb,
    });
  }
  const thresholds = keyThresholds(est!.strength, { low: low ?? undefined, high: high ?? undefined });
  const graph =
    chromaKeyGraph({ screen: est!.screen, thresholds, despill, choke: choke ?? 0, soften: soften ?? 0, outputLabel: "keyed" }) +
    `;[keyed]${rgbToOutputTail(output.format)}[out]`;

  const t0 = performance.now();
  const written = await encodeAppendOnly(
    output.target,
    (tmp) => ["-i", src, "-filter_complex", graph, "-map", "[out]", ...alphaEncodeArgs(output.format, output.quality), tmp],
    verb,
  );
  const seconds = Math.round(performance.now() - t0) / 1000;
  const info = probeSize(written);
  out({
    out: written,
    versioned: written !== output.requested,
    source: src,
    format: output.format,
    engine: "ffmpeg-colour-difference",
    screen: est!.screen,
    screenRgb: `#${est!.rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`,
    screenStrength: est!.strength,
    low: thresholds.low,
    high: thresholds.high,
    despill,
    width: info?.width ?? null,
    height: info?.height ?? null,
    frames: info?.frames ?? null,
    seconds,
    providerCalls: 0,
  });
}

function engineFail(e: unknown): never {
  if (e instanceof MatteEngineError) {
    if (e.kind === "missing") raiseError("E_DEP_MISSING", { dep: `local matting engine (${e.message})` });
    if (e.kind === "input") raiseError("E_INPUT_INVALID", { field: "matte", detail: e.message, verb: "matte subject" });
    if (e.kind === "dependency") raiseError("E_DEP_MISSING", { dep: `${e.message} (re-run \`ralphy matte setup --force\`)` });
    raiseError("E_INTERNAL", { detail: e.message });
  }
  raiseError("E_INTERNAL", { detail: e instanceof Error ? e.message : String(e) });
}

async function runSubject(input: string, opts: SubjectOpts): Promise<void> {
  const verb = "matte subject";
  const model = (opts.model ?? "rvm") as MatteModel;
  if (!(MATTE_MODELS as readonly string[]).includes(model)) {
    raiseError("E_FLAG_UNKNOWN", { flag: "model", value: String(opts.model), allowed: MATTE_MODELS.join(", "), verb });
  }
  const device = opts.device ?? "cpu";
  if (!["cpu", "coreml"].includes(device)) {
    raiseError("E_FLAG_UNKNOWN", { flag: "device", value: device, allowed: "cpu, coreml", verb });
  }
  const downsample = numIn(opts.downsample, 0.05, 1);
  if (downsample === null) raiseError("E_INPUT_INVALID", { field: "--downsample", detail: "expected a ratio 0.05..1 (rvm only)", verb });
  if (downsample !== undefined && model !== "rvm") {
    raiseError("E_INPUT_INVALID", { field: "--downsample", detail: "only applies to --model rvm", verb });
  }
  const threads = intIn(opts.threads, 0, 256);
  if (threads === null) raiseError("E_INPUT_INVALID", { field: "--threads", detail: "expected an integer 0..256 (0 = all cores)", verb });

  const src = sourceOrFail(input);
  const output = resolveMatteOutput(src, "subject", opts, verb);
  const status = matteEngineStatus();
  if (!status.installed) raiseError("E_DEP_MISSING", { dep: `local matting engine (${status.hint ?? "run `ralphy matte setup`"})` });
  if (!status.models[model]) {
    raiseError("E_DEP_MISSING", { dep: `${model} matting model (run \`ralphy matte setup --models ${model}\`)` });
  }

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "ralphy-matte-alpha-"));
  const alphaPath = path.join(tmpDir, "alpha.mkv");
  const args = ["--mode", "subject", "--model", model, "--model-path", matteModelPath(model), "--video", src, "--out", alphaPath, "--device", device];
  if (downsample !== undefined) args.push("--downsample", String(downsample));
  if (threads) args.push("--threads", String(threads));
  let engine: MatterOutput;
  try {
    engine = await runMatter(args);
  } catch (e) {
    rmSync(tmpDir, { recursive: true, force: true });
    engineFail(e);
  }
  const t0 = performance.now();
  let written: string;
  try {
    written = await encodeAppendOnly(
      output.target,
      (tmp) => ["-i", src, "-i", alphaPath, "-filter_complex", subjectMergeGraph(output.format), "-map", "[out]", ...alphaEncodeArgs(output.format, output.quality), tmp],
      verb,
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  const encodeSeconds = Math.round(performance.now() - t0) / 1000;
  out({
    out: written,
    versioned: written !== output.requested,
    source: src,
    format: output.format,
    engine: "onnxruntime-local",
    model,
    license: MATTE_STACK.models[model].license,
    width: engine.source.width,
    height: engine.source.height,
    frames: engine.frames,
    matteFps: engine.fps,
    matteSeconds: engine.wallSeconds,
    encodeSeconds,
    meanCoverage: engine.stats.meanCoverage,
    flicker: engine.stats.flicker,
    providerCalls: 0,
  });
}

function addOutputOptions(cmd: Command): Command {
  return cmd
    .option("--format <f>", `Video output: ${MATTE_FORMATS.join(" | ")} (default webm = VP9 alpha; a still in gives a PNG)`)
    .option("--quality <q>", `VP9 quality preset: ${MATTE_QUALITIES.join(" | ")} (CRF 30 / 18 / 12; default balanced)`)
    .option("--out <path>", "Output file (.webm, .mov or .png); never overwritten, the next free .vN is used")
    .option("--project <id>", "Write into the project's artifacts/videos/ (artifacts/images/ for a still)");
}

export function matteCmd(): Command {
  const cmd = new Command("matte").description(
    "Local keying and matting with zero provider calls: green/blue-screen keys and subject cut-outs as alpha video for HyperFrames.",
  );

  cmd
    .command("setup")
    .description(`Install the pinned local matting engine (${MATTE_STACK.id}) and models with uv; idempotent. \`matte key\` needs only ffmpeg`)
    .option("--models <list>", `Models to download: ${MATTE_MODELS.join(",")} (default rvm; birefnet is 224 MB)`)
    .option("--force", "Reinstall packages and re-download the models", false)
    .action(async (opts: { models?: string; force?: boolean }) => {
      const models = parseSetupModels(opts.models);
      if (!models) {
        raiseError("E_FLAG_UNKNOWN", { flag: "models", value: String(opts.models), allowed: MATTE_MODELS.join(", "), verb: "matte setup" });
      }
      const res = await setupMatteEngine({
        force: opts.force,
        models: models!,
        log: (s) => process.stderr.write(`matte setup: ${s}\n`),
      });
      out({
        installed: res.status.installed,
        stack: res.status.stack,
        dir: res.status.dir,
        python: res.status.python,
        models: res.status.models,
        steps: res.steps,
      });
      if (!res.status.installed || res.steps.some((s) => !s.ok)) process.exitCode = 1;
    });

  addOutputOptions(
    cmd
      .command("key")
      .description("Key a green or blue screen to alpha with a tuned colour-difference keyer and despill (pure ffmpeg)")
      .argument("<video>", "Green/blue-screen video, or a still image (PNG out)")
      .option("--screen <s>", "Screen colour: auto | green | blue (default auto, read from the frame border)")
      .option("--low <n>", "Key difference at or below which the subject is fully opaque (0..254; default 10% of the screen strength)")
      .option("--high <n>", "Key difference at or above which the screen is fully transparent (1..255; default 90% of the screen strength)")
      .option("--despill <m>", "Spill suppression: max (gentle, default) | avg (strong) | off")
      .option("--choke <px>", "Shrink (positive) or grow (negative) the matte edge, -8..8 px (default 0)")
      .option("--soften <sigma>", "Blur the matte edge, sigma 0..10 (default 0)")
      .option("--sample-at <t>", "Frame used to measure the screen: seconds, MM:SS or HH:MM:SS (default 0)"),
  ).action((video: string, opts: KeyOpts) => runKey(video, opts));

  addOutputOptions(
    cmd
      .command("subject")
      .description("Cut the subject out of footage without a chroma screen (local RVM or BiRefNet); alpha video for text-behind-subject")
      .argument("<video>", "Video (or a still image, PNG out)")
      .option("--model <m>", `Matting model: ${MATTE_MODELS.join(" | ")} (default rvm: people, temporally stable, ~20 fps at 1080x1920 on CPU; birefnet: any object, ~3 s per frame)`)
      .option("--downsample <r>", "RVM internal scale 0.05..1 (default auto: 512 px on the long side)")
      .option("--device <d>", "ONNX Runtime device: cpu | coreml (default cpu; CoreML was slower in the #560 bench)")
      .option("--threads <n>", "CPU threads for inference (default 0 = all cores)"),
  ).action((video: string, opts: SubjectOpts) => runSubject(video, opts));

  return cmd;
}
