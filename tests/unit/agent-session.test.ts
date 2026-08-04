import { afterEach, describe, expect, test } from "bun:test";
import { agentTurnStatus, startAgentTurn } from "../../cli/lib/agent/session.js";
import {
  appendAgentTurnEvent,
  setAgentProviderResumeId,
} from "../../cli/lib/agent/store.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { startAgentSession } from "../../cli/lib/store/sessions.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let root: TmpRoot;

afterEach(() => {
  closeDomainDb();
  root.cleanup();
});

describe("durable agent turns", () => {
  test("persist ordered events and guard the provider resume id", () => {
    root = makeTmpRoot("ralphy-agent-turn");
    const workspace = createWorkspace({ slug: "primary", name: "Primary" });
    const project = createProject({ workspaceId: workspace.id, slug: "agent", name: "Agent" });
    const session = startAgentSession({ workspaceId: workspace.id, projectId: project.id, agent: "codex" });
    const turn = startAgentTurn({
      workspaceId: workspace.id,
      projectId: project.id,
      agentSessionId: session.id,
      provider: "codex",
      chatId: "chat-1",
    });

    appendAgentTurnEvent({ turnId: turn.turnId, kind: "text-delta", data: "opaque text" });
    setAgentProviderResumeId(turn.turnId, "provider-resume-1");
    expect(() => setAgentProviderResumeId(turn.turnId, "provider-resume-2")).toThrow(/already set/i);
    appendAgentTurnEvent({ turnId: turn.turnId, kind: "completed" });
    expect(() => appendAgentTurnEvent({ turnId: turn.turnId, kind: "failed" })).toThrow(/terminal/i);

    expect(agentTurnStatus(turn.turnId).events.map((event) => [event.sequence, event.kind])).toEqual([
      [1, "started"],
      [2, "text-delta"],
      [3, "completed"],
    ]);
  });
});
