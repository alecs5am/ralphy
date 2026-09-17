import type { AgentChatStorageBridge } from "../../../../shared/agent-chat-storage";
import { createAgentChatState, type AgentChatState, type CreateAgentChatOptions, type StorageLike } from "./chat-state";
import { parseAgentChats, readLocalAgentChats, serializeAgentChats, type AgentChatScope } from "./chat-storage";

export interface ChatPersistence {
  state: AgentChatState;
  save(state: AgentChatState): Promise<void>;
}

/** Serialize writes and retain failed updates in memory for retry and workspace switches. */
export async function openChatPersistence(
  bridge: AgentChatStorageBridge,
  storage: StorageLike | null,
  scope: AgentChatScope,
  fallback: CreateAgentChatOptions,
): Promise<ChatPersistence> {
  const stored = await bridge.loadAgentChats(scope.rootPath, scope.workspaceId);
  const native = stored.data !== null ? parseAgentChats(stored.data) : null;
  let local: ReturnType<typeof readLocalAgentChats> = null;
  try { local = storage ? readLocalAgentChats(storage, scope, fallback) : null; }
  catch (error) { if (!native) throw error; } // Keep an unreadable browser backup; valid disk history remains usable.
  // Another app profile may have initialized disk storage before this profile migrated.
  // Merge missing conversations without overwriting newer titles, archives or messages.
  const state = native ?? local?.state ?? createAgentChatState(fallback);
  if (native && local) {
    const ids = new Set(native.chats.map((chat) => chat.id));
    state.chats = [...native.chats, ...local.state.chats.filter((chat) => !ids.has(chat.id))];
  }
  let revision = stored.revision;
  let lastSaved = stored.data;
  let writes = Promise.resolve();
  const session: ChatPersistence = {
    state,
    save(state) {
      session.state = state;
      writes = writes.catch(() => undefined).then(async () => {
        const data = serializeAgentChats(session.state);
        if (data !== lastSaved) {
          revision = await bridge.saveAgentChats(scope.rootPath, scope.workspaceId, data, revision);
          lastSaved = data;
        }
        if (local && storage) {
          try {
            if (storage.getItem(local.key) === local.raw) storage.removeItem(local.key);
          } catch { /* The durable copy is safe; an inaccessible backup can remain. */ }
        }
      });
      return writes;
    },
  };
  return session;
}
