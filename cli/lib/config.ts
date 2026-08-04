import { getCommandContext } from "./context-state.js";
import { appendActivity } from "./store/activity.js";
import { canonicalPublicJson } from "./store/canonical-json.js";
import { openDomainDb, withImmediateTransaction } from "./store/db.js";
import { newDomainId } from "./store/ids.js";

export type Config = Record<string, unknown>;

export async function loadConfig(): Promise<Config> {
  return loadConfigSync();
}

/** Synchronous config read for provider resolution and other sync callers. */
export function loadConfigSync(): Config {
  const workspaceId = currentWorkspaceId();
  if (workspaceId === null) return {};
  const rows = openDomainDb()
    .query<{ key: string; valueJson: string }, [string]>(
      "SELECT key, value_json AS valueJson FROM settings WHERE workspace_id = ? ORDER BY key",
    )
    .all(workspaceId);
  return Object.fromEntries(
    rows.map((row) => [row.key, JSON.parse(row.valueJson) as unknown]),
  );
}

export async function saveConfig(config: Config): Promise<void> {
  const workspaceId = currentWorkspaceId();
  if (workspaceId === null) {
    throw new Error("Workspace settings require an explicit Workspace scope");
  }
  assertNoSecretSettingKeys(config);
  const canonical = canonicalPublicJson(config, "Workspace settings");
  if (
    canonical === null ||
    Array.isArray(canonical) ||
    typeof canonical !== "object"
  ) {
    throw new Error("Workspace settings must be an object");
  }

  withImmediateTransaction((db) => {
    if (
      !db
        .query<{ id: string }, [string]>(
          "SELECT id FROM workspaces WHERE id = ?",
        )
        .get(workspaceId)
    ) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    const now = Date.now();
    const previous = db
      .query<{ id: string; key: string }, [string]>(
        "SELECT id, key FROM settings WHERE workspace_id = ?",
      )
      .all(workspaceId);

    for (const row of previous) {
      if (Object.hasOwn(canonical, row.key)) continue;
      db.prepare("DELETE FROM settings WHERE id = ?").run(row.id);
      appendActivity(db, {
        workspaceId,
        entityType: "setting",
        entityId: row.id,
        action: "setting.deleted",
        payload: { setting: row.key },
        createdAt: now,
      });
    }

    for (const [key, value] of Object.entries(canonical)) {
      const existing = db
        .query<{ id: string }, [string, string]>(
          "SELECT id FROM settings WHERE workspace_id = ? AND key = ?",
        )
        .get(workspaceId, key);
      const id = existing?.id ?? newDomainId("setting");
      if (existing) {
        db.prepare(
          "UPDATE settings SET value_json = ?, updated_at = ? WHERE id = ?",
        ).run(JSON.stringify(value), now, id);
      } else {
        db.prepare(
          "INSERT INTO settings (id, workspace_id, key, value_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(id, workspaceId, key, JSON.stringify(value), now, now);
      }
      appendActivity(db, {
        workspaceId,
        entityType: "setting",
        entityId: id,
        action: existing ? "setting.updated" : "setting.created",
        payload: { setting: key },
        createdAt: now,
      });
    }
  });
}

const SECRET_SETTING_KEYS = new Set([
  "apikey",
  "apikeys",
  "accesstoken",
  "accesstokens",
  "refreshtoken",
  "refreshtokens",
  "token",
  "tokens",
  "secret",
  "secrets",
  "password",
  "passwords",
  "credential",
  "credentials",
]);

function assertNoSecretSettingKeys(value: unknown): void {
  if (typeof value === "string") {
    if (/^(?:sk|rk|pk)[-_][A-Za-z0-9_-]{8,}$/u.test(value) ||
        /^Bearer\s+\S+$/iu.test(value) ||
        /^(?:xox[baprs]|gh[pousr])-[A-Za-z0-9-]+$/u.test(value)) {
      throw new Error("Workspace settings must not contain secret values");
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoSecretSettingKeys(item);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const normalized = key
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (SECRET_SETTING_KEYS.has(normalized)) {
      throw new Error(`Workspace settings must not contain secret key: ${key}`);
    }
    assertNoSecretSettingKeys(item);
  }
}

function currentWorkspaceId(): string | null {
  return getCommandContext()?.workspaceId ?? null;
}

export function getNestedValue(obj: any, key: string): unknown {
  return key.split(".").reduce((o, k) => o?.[k], obj);
}

export function setNestedValue(obj: any, key: string, value: unknown) {
  const keys = key.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]] || typeof cur[keys[i]] !== "object") {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}
