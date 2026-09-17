import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { StoredAgentChats } from "../../shared/agent-chat-storage";
import { guardedAtomicWrite } from "../media/atomic-write";

const revision = (data: string) => createHash("sha256").update(data).digest("hex");

async function chatPath(root: string, workspaceId: string | null): Promise<string> {
  if (workspaceId !== null && (typeof workspaceId !== "string" || !workspaceId || workspaceId.length > 256)) {
    throw new Error("Invalid chat workspace");
  }
  let directory = await realpath(root);
  for (const part of ["media-library", "agent-chats"]) {
    directory = join(directory, part);
    await mkdir(directory).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Chat storage must be a regular directory");
  }
  return join(directory, `${revision(JSON.stringify(workspaceId))}.json`);
}

function validateHistory(data: unknown): asserts data is string {
  if (typeof data !== "string") throw new Error("Invalid chat history");
  const value = JSON.parse(data) as Record<string, unknown> | null;
  if (!value || value.version !== 3 || !Array.isArray(value.chats) || value.chats.length === 0
    || typeof value.activeChatId !== "string"
    || value.chats.some((chat) => !chat || typeof chat !== "object" || typeof chat.id !== "string" || !Array.isArray(chat.entries))
    || new Set(value.chats.map((chat) => chat.id)).size !== value.chats.length
    || !value.chats.some((chat) => chat.id === value.activeChatId)) throw new Error("Invalid chat history");
}

async function readHistory(path: string): Promise<StoredAgentChats> {
  let file;
  try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { data: null, revision: null };
    throw error;
  }
  try {
    if (!(await file.stat()).isFile()) throw new Error("Chat history must be a regular file");
    const data = await file.readFile("utf8");
    validateHistory(data);
    return { data, revision: revision(data) };
  } finally { await file.close(); }
}

export async function loadAgentChatStore(root: string, workspaceId: string | null): Promise<StoredAgentChats> {
  return readHistory(await chatPath(root, workspaceId));
}

export async function saveAgentChatStore(
  root: string,
  workspaceId: string | null,
  data: string,
  expectedRevision: string | null,
  assertCurrent: () => void = () => undefined,
): Promise<string> {
  validateHistory(data);
  if (expectedRevision !== null && (typeof expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(expectedRevision))) {
    throw new Error("Invalid chat history revision");
  }
  assertCurrent();
  const path = await chatPath(root, workspaceId);
  const previous = await readHistory(path);
  const assertRevision = (current: StoredAgentChats) => {
    if (current.revision !== expectedRevision) throw new Error("Chat history changed outside this window. Reload before saving; your current messages are still here.");
  };
  assertRevision(previous);
  await guardedAtomicWrite(path, data, {
    // Size follows the actual history: capacity failures surface instead of trimming messages.
    maxBytes: Math.max(Buffer.byteLength(data), Buffer.byteLength(previous.data ?? "")),
    assertCurrent,
    beforeReplace: async () => assertRevision(await readHistory(path)),
  });
  return revision(data);
}
