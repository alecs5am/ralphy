import { canvasNodePorts, type CanvasPortType } from "./canvas-ports";
import { canvasOrder, type CanvasNode, type WorkflowCanvas } from "./workflow-canvas";
import type { CanvasModelDescriptor, CanvasRun } from "./canvas-runtime";

export type CanvasNodeReadiness = {
  ready: boolean;
  issues: string[];
  prompt: "missing" | "manual" | "connected";
  runsUpstream: boolean;
  outputTypes: CanvasPortType[];
};

export function canvasModelIssues(node: CanvasNode, promptConnected: boolean, model?: CanvasModelDescriptor, checkAvailability = true): string[] {
  const issues: string[] = [];
  if (!node.config?.modelId) issues.push("Choose a model");
  else if (checkAvailability && !model) issues.push("Check model availability");
  else if (checkAvailability && !model?.available) issues.push("Connect the model provider");
  if (!node.value.trim() && !promptConnected) issues.push("Prompt required");
  if (node.config?.modality === "audio" && (!node.config.operation || node.config.operation === "voiceover") && !String(node.config.parameters?.voice ?? "").trim()) issues.push("Voice ID required");
  return issues;
}

/** Assess the current graph, never a previous run's success badge. */
export function canvasReadiness(canvas: WorkflowCanvas, models?: CanvasModelDescriptor[], history?: CanvasRun[]): Map<string, CanvasNodeReadiness> {
  const states = new Map<string, CanvasNodeReadiness>();
  for (const node of canvasOrder(canvas)) {
    const ports = canvasNodePorts(node);
    const incoming = canvas.edges.filter((edge) => edge.to === node.id).map((edge) => ({
      source: canvas.nodes.find((item) => item.id === edge.from)!,
      state: states.get(edge.from)!,
      port: ports.inputs.find((port) => port.id === edge.targetPort) ?? ports.inputs[0],
    }));
    const selected = node.kind === "variation" && node.config?.selectedResultId;
    const selectedResult = selected && history?.filter((run) => run.mode === "execute").flatMap((run) => run.nodes.flatMap((entry) => entry.results)).find((result) => result.id === selected);
    const linkedText = incoming.some(({ port, state }) => port?.id === "prompt" && state?.ready && state.outputTypes.length > 0 && state.outputTypes.every((type) => type === "text"));
    const promptWired = incoming.some(({ port }) => port?.id === "prompt");
    const issues: string[] = [];
    if (!selected) for (const { source, state, port } of incoming) {
      if (!state?.ready) issues.push(`${source.title}: ${state?.issues[0] ?? "Input unavailable"}`);
      else if (port && port.type !== "any" && state.outputTypes.some((type) => type !== port.type)) issues.push(`${port.label} needs ${port.type}; check ${source.title}`);
    }
    let outputTypes: CanvasPortType[] = ports.outputs.map((port) => port.type);
    if (node.kind === "model") {
      const model = models?.find((model) => model.id === node.config?.modelId && model.provider === node.config?.provider && model.modality === node.config?.modality);
      issues.unshift(...canvasModelIssues(promptWired ? { ...node, value: "" } : node, linkedText, model, models !== undefined));
    } else if (node.kind === "prompt" && !node.value.trim()) issues.push("Enter a prompt");
    else if (node.kind === "media" && !node.config?.asset) issues.push("Add a reference file");
    else if (["connector", "step", "variation", "output"].includes(node.kind)) {
      const joined = node.config?.operation === "join-text";
      if (selected) {
        if (history && !selectedResult) issues.push("Selected result is missing from saved history. Restore a backup or choose another result.");
        if (selectedResult && selectedResult.unavailableReason) issues.push(selectedResult.unavailableReason);
        outputTypes = selectedResult ? [selectedResult.kind] : ["any"];
      } else {
        if (!incoming.length && !(joined && node.value.trim())) issues.push("Connect an upstream result");
        outputTypes = joined ? ["text"] : [...new Set(incoming.flatMap(({ state }) => state?.outputTypes ?? []))];
        if (node.kind === "variation" || node.config?.operation === "select-first") outputTypes = outputTypes.slice(0, 1);
      }
    }
    states.set(node.id, { ready: !issues.length, issues: [...new Set(issues)], prompt: linkedText ? "connected" : !promptWired && node.value.trim() ? "manual" : "missing", runsUpstream: !selected && incoming.some(({ source, state }) => source.kind === "model" || state?.runsUpstream), outputTypes });
  }
  return states;
}
