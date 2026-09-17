export interface StoredAgentChats {
  data: string | null;
  revision: string | null;
}

export interface AgentChatStorageBridge {
  loadAgentChats(rootPath: string, workspaceId: string | null): Promise<StoredAgentChats>;
  saveAgentChats(rootPath: string, workspaceId: string | null, data: string, expectedRevision: string | null): Promise<string>;
}

export const AGENT_CHAT_STORAGE_CHANNELS = {
  load: "agent:chats:load",
  save: "agent:chats:save",
} as const;
