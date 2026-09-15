import { parseDocument } from "htmlparser2";
import { marked } from "marked";
import type { ProjectReference } from "@/shared/api/ipc";

export type UnitCardReference = ProjectReference & { unitId: string; title?: string };
export type AgentMessagePart = { kind: "markdown"; text: string } | { kind: "unit"; reference: UnitCardReference };
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ATTRIBUTES = new Set(["workspaceId", "projectId", "unitId", "title"]);

/** MDX here is declarative data. No expressions, imports, handlers, or arbitrary components run. */
export function parseAgentMessage(markdown: string): AgentMessagePart[] {
  const parts: AgentMessagePart[] = [];
  for (const token of marked.lexer(markdown)) {
    const nodes = token.type === "html" && token.raw.trimStart().startsWith("<UnitCard ")
      ? parseDocument(token.raw, { xmlMode: true, decodeEntities: true }).children.filter((node) => node.type !== "text" || node.data.trim())
      : [];
    const cards: UnitCardReference[] = [];
    for (const node of nodes) {
      if (node.type !== "tag" || node.name !== "UnitCard" || node.children.length) break;
      const { workspaceId, projectId, unitId, title } = node.attribs;
      if (!ID.test(workspaceId ?? "") || !ID.test(projectId ?? "") || !ID.test(unitId ?? "")
        || Object.keys(node.attribs).some((key) => !ATTRIBUTES.has(key)) || (title?.length ?? 0) > 200) break;
      cards.push({ workspaceId, projectId, unitId, ...(title ? { title } : {}) });
    }
    if (cards.length && cards.length === nodes.length) {
      parts.push(...cards.map((reference) => ({ kind: "unit" as const, reference })));
    } else {
      const previous = parts.at(-1);
      if (previous?.kind === "markdown") previous.text += token.raw;
      else if (token.raw.trim()) parts.push({ kind: "markdown", text: token.raw });
    }
  }
  return parts;
}
