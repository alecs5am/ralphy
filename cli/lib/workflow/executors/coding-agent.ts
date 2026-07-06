// `coding-agent` node executor (#499) — headless external coding agent.
//
// NO AI SDK import here: the node spawns an allowlisted local binary
// (`claude` / `codex` / `gemini`) in headless mode with a prompt, a workdir,
// and a hard timeout. Stdout/stderr are captured into an append-only
// transcript artifact; a non-zero exit throws so the runner's on_fail routing
// applies.
//
// DESIGN SMELL WARNING (design doc, "A. LLM nodes"): coding-agent is the
// vendor-independence valve for genuinely creative code work, NOT a
// foundation. A mature template should need it rarely or never — heavy
// coding-agent use in a production graph means the template left the training
// path too early (the export-readiness criterion: producing one more unit
// must not require creative code authoring). Prefer generate-object +
// parametrized compositions; keep this node for the exceptions.

import path from "node:path";
import {
  CODING_AGENT_BINARIES,
  NodeExecutionError,
  type CodingAgentBinary,
  type NodeExecutor,
} from "./types.js";
import { resolveNodePrompt, writeNodeArtifact } from "./llm.js";

/** Default timeout: 10 minutes. params.timeout is milliseconds. */
const DEFAULT_TIMEOUT_MS = 600_000;

/** Headless invocation per binary (their documented non-interactive modes). */
function defaultArgv(binary: CodingAgentBinary, prompt: string): string[] {
  switch (binary) {
    case "claude":
      return ["claude", "-p", prompt];
    case "codex":
      return ["codex", "exec", prompt];
    case "gemini":
      return ["gemini", "-p", prompt];
  }
}

export const codingAgentExecutor: NodeExecutor = async (node, ctx) => {
  const params = node.params as {
    binary?: string;
    prompt?: string;
    prompt_file?: string;
    workdir?: string;
    timeout?: number;
  };

  const binary = params.binary;
  if (!binary || !(CODING_AGENT_BINARIES as readonly string[]).includes(binary)) {
    throw new NodeExecutionError(
      "binary-not-allowed",
      `coding-agent node "${node.id}": binary "${binary ?? ""}" is not allowed ` +
        `(allowlist: ${CODING_AGENT_BINARIES.join(", ")})`,
    );
  }

  // prompt_file is the documented param; params.prompt (inline) also works
  // since resolveNodePrompt treats non-file strings as inline text.
  const promptNode = params.prompt_file
    ? { ...node, params: { ...node.params, prompt: params.prompt_file } }
    : node;
  const prompt = await resolveNodePrompt(promptNode, ctx);

  const cwd = params.workdir
    ? path.isAbsolute(params.workdir)
      ? params.workdir
      : path.join(ctx.workspaceDir, params.workdir)
    : ctx.workspaceDir;
  const timeoutMs = params.timeout ?? DEFAULT_TIMEOUT_MS;
  const argv = ctx.resolveBinaryArgv
    ? ctx.resolveBinaryArgv(binary as CodingAgentBinary, prompt)
    : defaultArgv(binary as CodingAgentBinary, prompt);

  const t0 = Date.now();
  const proc = Bun.spawn({ cmd: argv, cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const stdoutP = new Response(proc.stdout).text();
  const stderrP = new Response(proc.stderr).text();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  const exitCode = await proc.exited;
  clearTimeout(timer);
  const [stdout, stderr] = await Promise.all([stdoutP, stderrP]);
  const latencyMs = Date.now() - t0;

  // Transcript artifact is written on EVERY outcome (append-only versioned)
  // so a failed run leaves its evidence on disk, invariant #14 style.
  const transcript =
    `# coding-agent transcript — node ${node.id}\n` +
    `binary: ${binary}\ncwd: ${cwd}\nexit: ${timedOut ? "timeout" : exitCode}\n` +
    `elapsed_ms: ${latencyMs}\n\n## stdout\n${stdout}\n\n## stderr\n${stderr}\n`;
  const artifactPath = await writeNodeArtifact(ctx, `${node.id}-transcript.txt`, transcript);

  const status = !timedOut && exitCode === 0 ? "ok" : "error";
  const error = timedOut
    ? `timed out after ${timeoutMs}ms`
    : exitCode !== 0
      ? `exit code ${exitCode}`
      : undefined;
  await ctx.log({
    provider: "coding-agent",
    model: binary,
    endpoint: binary,
    kind: "text",
    input: { node: node.id, slot: node.id, project: ctx.projectId, workdir: cwd },
    status,
    error,
    latency_ms: latencyMs,
    cost_usd: 0,
    note: `workflow node ${node.id} (coding-agent)`,
  });

  if (timedOut) {
    throw new NodeExecutionError(
      "timeout",
      `coding-agent node "${node.id}" (${binary}) timed out after ${timeoutMs}ms; transcript: ${artifactPath}`,
    );
  }
  if (exitCode !== 0) {
    throw new NodeExecutionError(
      "nonzero-exit",
      `coding-agent node "${node.id}" (${binary}) exited ${exitCode}; transcript: ${artifactPath}`,
    );
  }
  return { output: stdout, artifactPath };
};
