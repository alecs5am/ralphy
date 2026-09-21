import { MarkdownView } from "@/shared/ui/MarkdownView";
import { parseAgentMessage } from "../lib/agent-mdx";
import { ChatUnitCard, type AgentUnitNavigation } from "./ChatUnitCard";
import { ChatTextCard } from "./ChatTextCard";
export type { AgentUnitNavigation } from "./ChatUnitCard";

export function AgentMessage({ markdown, ...navigation }: AgentUnitNavigation & { markdown: string }) {
  return <>{parseAgentMessage(markdown).map((part, index) => part.kind === "unit"
    ? <ChatUnitCard key={`${index}:${part.reference.unitId}`} reference={part.reference} {...navigation} />
    : part.kind === "markdown" ? <MarkdownView key={index} markdown={part.text} tone="chat" />
      : <ChatTextCard key={`${index}:${part.kind}`} {...part} />)}</>;
}
