import { afterEach, expect, test } from "bun:test";
import { connectPostizWorkspace } from "../../cli/lib/calendar/connection.js";
import type { CredentialResolver } from "../../cli/lib/providers/credentials.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace, listSocialAccounts } from "../../cli/lib/store/scopes.js";
import { makeTmpRoot } from "../helpers/tmp-root.js";
import { createPostizPublicationAdapter, type PublicationSubmitRequest } from "../../cli/lib/publication.js";

let cleanup = () => {};
afterEach(() => { closeDomainDb(); cleanup(); });

test("Postiz setup verifies metadata before saving, imports supported accounts, and rejects the wrong reconnect key", async () => {
  const root = makeTmpRoot("postiz-connect"); cleanup = root.cleanup;
  const workspace = createWorkspace({ slug: "publishing", name: "Publishing" });
  const calls: string[] = [];
  const resolver = { async set(provider: string, _key: string, target?: { accountId: string }) { calls.push(`${provider}:${target?.accountId ?? "workspace"}`); } } as CredentialResolver;
  const credential = "postiz-test-secret";
  await expect(connectPostizWorkspace({ workspaceId: workspace.id, resolver, credential,
    fetchImpl: async () => new Response(credential, { status: 401 }),
  })).rejects.toThrow("Postiz could not verify the key");
  expect(calls).toEqual([]);
  expect(listSocialAccounts({ workspaceId: workspace.id }).items).toHaveLength(0);
  const result = await connectPostizWorkspace({ workspaceId: workspace.id, resolver, credential,
    fetchImpl: async (url, init) => {
      expect(url.endsWith("/integrations")).toBe(true);
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(init?.headers).toMatchObject({ Authorization: credential });
      expect(init?.redirect).toBe("error");
      return Response.json([
        { id: "yt-1", identifier: "youtube", name: "Studio", profile: "studio" },
        { id: "x-disabled", identifier: "x", disabled: true },
        { id: "unsupported", identifier: "linkedin" },
      ]);
    },
  });
  expect(result).toMatchObject({ connected: true, imported: 1, skipped: 2 });
  const account = listSocialAccounts({ workspaceId: workspace.id }).items[0]!;
  expect(account).toMatchObject({ platform: "youtube", externalId: "yt-1", displayName: "Studio" });
  expect(calls).toEqual(["postiz:workspace", `postiz:${account.id}`]);
  await expect(connectPostizWorkspace({ workspaceId: workspace.id, resolver, credential,
    accountId: account.id, expectedRowVersion: account.rowVersion,
    fetchImpl: async () => Response.json([{ id: "another-account", identifier: "youtube" }]),
  })).rejects.toThrow("cannot access the selected account");
  expect(calls).toHaveLength(2);
});

test("the Postiz adapter uses the captured scoped key and fails closed when it is missing", async () => {
  const request: PublicationSubmitRequest = {
    publicationId: "pub-1", platform: "youtube", caption: "Approved caption", options: { youtubeVisibility: "private" },
    items: [], mediaPaths: [], socialAccountExternalId: "yt-1", scheduledAt: Date.now() + 60_000,
    unitSlug: "launch", unitFormat: "video", documentBodies: [],
  };
  let calls = 0;
  const adapter = createPostizPublicationAdapter(async (_url, init) => {
    calls++;
    expect(init?.headers).toMatchObject({ Authorization: "scoped-account-key" });
    const body = JSON.parse(String(init?.body));
    expect(body.posts[0].settings.type).toBe("private");
    return Response.json([{ id: "post-1" }]);
  }, async (id) => { expect(id).toBe("pub-1"); return "scoped-account-key"; });
  expect((await adapter.submit(request)).state).toBe("scheduled");
  expect(calls).toBe(1);
  const missing = createPostizPublicationAdapter(async () => { throw new Error("must not fetch"); }, async () => null);
  await expect(missing.submit(request)).rejects.toThrow("no API key configured");
});

test("Postiz acceptance requires a provider ID and an absent lookup cannot authorize resubmission", async () => {
  const request: PublicationSubmitRequest = { publicationId: "pub-1", platform: "youtube", caption: "Approved caption", options: {}, items: [], mediaPaths: [], socialAccountExternalId: "yt-1", scheduledAt: Date.now() + 60_000, unitSlug: "launch", unitFormat: "video", documentBodies: [] };
  for (const body of [[], [{}], [{ id: "" }], [{ id: 42 }]]) {
    let posts = 0;
    const adapter = createPostizPublicationAdapter(async () => { posts++; return Response.json(body); }, async () => "fixture-key");
    await expect(adapter.submit(request)).rejects.toThrow(/outcome is unknown/);
    expect(posts).toBe(1);
  }
  const adapter = createPostizPublicationAdapter(async () => Response.json([]), async () => "fixture-key");
  const publication = { id: "pub-1", providerPublicationId: "remote-post", scheduledAt: Date.now() } as Parameters<typeof adapter.lookup>[0]["publication"];
  expect(await adapter.lookup({ publication, platform: "youtube", socialAccountExternalId: "yt-1" })).toMatchObject({ state: "reconciliation_required" });
});

test("Postiz status recovery only reads metadata and leaves missing identifiers uncertain", async () => {
  let lookups = 0;
  const adapter = createPostizPublicationAdapter(async (_url, init) => {
    lookups++;
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
    expect(init?.signal).toBeDefined();
    return Response.json({ posts: [{ id: "remote-post", releaseURL: "https://example.test/published" }] });
  }, async () => "fixture-key");
  const publication = { id: "pub-1", state: "unknown", providerPublicationId: null, scheduledAt: Date.now() } as Parameters<typeof adapter.lookup>[0]["publication"];
  const missing = await adapter.lookup({ publication, platform: "youtube", socialAccountExternalId: "yt-1" });
  expect(missing).toMatchObject({ state: "unknown", error: expect.stringContaining("Check the post directly in Postiz") });
  expect(lookups).toBe(0);
  const checked = await adapter.lookup({ publication: { ...publication, providerPublicationId: "remote-post" }, platform: "youtube", socialAccountExternalId: "yt-1" });
  expect(checked).toMatchObject({ state: "published", url: "https://example.test/published" });
  expect(lookups).toBe(1);
});
