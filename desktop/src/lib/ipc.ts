/**
 * Typed bridge between the renderer and the Electron main process.
 *
 * In Electron, `window.ralphy` is injected by electron/preload.ts. In a plain
 * browser (bun run dev) it is undefined, so we fall back to a mock that streams
 * a scripted agent session — enough to check the design without a `claude`
 * install. The shape mirrors the events the real Claude Code stream-json driver
 * emits (electron/claude/session.ts).
 */

export type AuthMethod = "subscription" | "api-key";

export interface AuthState {
  method: AuthMethod | null;
  /** True when a local `claude` binary is found and logged in via subscription. */
  claudeBinaryReady: boolean;
  /** Warn when ANTHROPIC_API_KEY is set in env — it silently overrides the plan. */
  apiKeyInEnv: boolean;
}

/** One agent event, normalized from the stream-json line protocol. */
export type AgentEvent =
  | { type: "system"; sessionId: string; tools: string[] }
  | { type: "assistant-text"; text: string }
  | { type: "tool-use"; id: string; name: string; summary: string; estCostUsd?: number }
  | { type: "tool-result"; id: string; ok: boolean }
  | { type: "result"; ok: boolean; costUsd: number };

/** A permission request the renderer must answer before a gated tool runs. */
export interface PermissionRequest {
  id: string;
  toolName: string;
  command: string;
  estCostUsd?: number;
}

export interface RalphyBridge {
  getAuthState(): Promise<AuthState>;
  setAuthMethod(method: AuthMethod): Promise<void>;
  send(prompt: string): Promise<void>;
  onEvent(cb: (e: AgentEvent) => void): () => void;
  onPermission(cb: (req: PermissionRequest) => void): () => void;
  resolvePermission(id: string, allow: boolean): Promise<void>;
}

declare global {
  interface Window {
    ralphy?: RalphyBridge;
  }
}

// ── Browser mock ────────────────────────────────────────────────────────────
function createMockBridge(): RalphyBridge {
  const eventCbs = new Set<(e: AgentEvent) => void>();
  const permCbs = new Set<(r: PermissionRequest) => void>();
  let pending: ((allow: boolean) => void) | null = null;

  const emit = (e: AgentEvent) => eventCbs.forEach((c) => c(e));
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return {
    async getAuthState() {
      return { method: "subscription", claudeBinaryReady: true, apiKeyInEnv: false };
    },
    async setAuthMethod() {},
    async send(prompt: string) {
      emit({ type: "system", sessionId: "mock-sess", tools: ["Bash", "Read", "Edit"] });
      await wait(350);
      emit({ type: "assistant-text", text: `Got it — "${prompt}". Reading the playbook, then drafting the scenario.` });
      await wait(450);
      emit({ type: "tool-use", id: "t1", name: "Read", summary: "docs/playbooks/scenarist.md" });
      await wait(500);
      emit({ type: "tool-result", id: "t1", ok: true });
      await wait(300);
      emit({ type: "assistant-text", text: "Scenario drafted (4 beats). Ready to generate the hook image — this is a paid call." });
      await wait(400);
      // Surface a permission request for a paid verb.
      const id = "perm-1";
      permCbs.forEach((c) => c({ id, toolName: "Bash", command: "ralphy generate image scene-01-hook", estCostUsd: 0.04 }));
      const allow = await new Promise<boolean>((res) => { pending = res; });
      if (!allow) {
        emit({ type: "assistant-text", text: "Held off on the paid generation. Tell me when to proceed." });
        emit({ type: "result", ok: true, costUsd: 0 });
        return;
      }
      emit({ type: "tool-use", id: "t2", name: "Bash", summary: "ralphy generate image scene-01-hook", estCostUsd: 0.04 });
      await wait(900);
      emit({ type: "tool-result", id: "t2", ok: true });
      await wait(300);
      emit({ type: "assistant-text", text: "Hook image generated and written to the project. Want the next beat?" });
      emit({ type: "result", ok: true, costUsd: 0.04 });
    },
    onEvent(cb) { eventCbs.add(cb); return () => eventCbs.delete(cb); },
    onPermission(cb) { permCbs.add(cb); return () => permCbs.delete(cb); },
    async resolvePermission(_id, allow) { pending?.(allow); pending = null; },
  };
}

export const bridge: RalphyBridge = window.ralphy ?? createMockBridge();
