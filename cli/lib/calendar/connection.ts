import { postizIntegrations, type FetchLike } from "../providers/postiz.js";
import { createCredentialResolver, type CredentialResolver } from "../providers/credentials.js";
import { listSocialAccounts, upsertSocialAccount } from "../store/scopes.js";
import { getPublication } from "../store/units.js";
import { createPostizPublicationAdapter } from "../publication.js";
import type { QueryContext } from "../store/scope-context.js";

const PLATFORMS = new Set(["instagram", "youtube", "tiktok", "x", "telegram"]);

/** Verify account metadata before saving a workspace key or importing any accounts. */
export async function connectPostizWorkspace(input: {
  workspaceId: string; credential: string; resolver: CredentialResolver;
  accountId?: string; expectedRowVersion?: number; fetchImpl?: FetchLike;
}) {
  const { workspaceId, resolver } = input;
  const credential = input.credential.trim();
  if (credential.length < 8 || credential.length > 4096 || /[\u0000-\u0020\u007f]/u.test(credential)) {
    throw new Error("Enter a valid Postiz API key");
  }
  let integrations;
  try { integrations = await postizIntegrations(input.fetchImpl ?? fetch, workspaceId, credential); }
  catch { throw new Error("Postiz could not verify the key. Check the key, account access, and connection, then retry."); }
  const publicIntegrations = integrations.map((row) => ({
    id: row.id, name: typeof row.name === "string" ? row.name : null,
    identifier: row.identifier, profile: typeof row.profile === "string" ? row.profile : null,
    picture: typeof row.picture === "string" ? row.picture : null, disabled: Boolean(row.disabled),
  }));
  const supported = integrations.filter((row) => !row.disabled && PLATFORMS.has(row.identifier!));
  if (input.accountId) {
    let cursor: string | null = null;
    let account;
    do {
      const page = listSocialAccounts({ workspaceId, cursor, limit: 100 });
      account = page.items.find((row) => row.id === input.accountId);
      cursor = page.nextCursor;
    } while (!account && cursor);
    if (!account || account.rowVersion !== input.expectedRowVersion) throw new Error("The account changed. Refresh Calendar and retry.");
    if (!supported.some((row) => row.id === account.externalId && row.identifier === account.platform)) {
      throw new Error("This key cannot access the selected account. Reconnect the channel in Postiz first.");
    }
    await resolver.set("postiz", credential, { accountId: account.id, expectedRowVersion: account.rowVersion });
    return { connected: true, imported: 1, skipped: integrations.length - supported.length, integrations: publicIntegrations };
  }
  await resolver.set("postiz", credential);
  for (const row of supported) {
    const account = upsertSocialAccount({
      workspaceId, platform: row.identifier!, externalId: row.id,
      displayName: typeof row.name === "string" ? row.name.slice(0, 256) : null,
      username: typeof row.profile === "string" ? row.profile.slice(0, 256) : null,
    });
    await resolver.set("postiz", credential, { accountId: account.id, expectedRowVersion: account.rowVersion });
  }
  return { connected: true, imported: supported.length, skipped: integrations.length - supported.length, integrations: publicIntegrations };
}

/** Each Calendar operation captures its workspace; account keys never become process-global. */
export function calendarPostizAdapter(dataRoot: string, context: QueryContext, workspaceId: string) {
  const resolver = createCredentialResolver({ dataRoot, context: { kind: "scope", workspaceId } });
  return createPostizPublicationAdapter(fetch, async (publicationId) => {
    const publication = getPublication({ context, publicationId });
    if (publication.socialAccountId) {
      const account = await resolver.resolve("postiz", { accountId: publication.socialAccountId });
      if (account.value) return account.value;
    }
    return (await resolver.resolve("postiz")).value;
  });
}
