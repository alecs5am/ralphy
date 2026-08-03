// Hashnode article connector (#527) — the article-publish backend for the
// `hashnode` target. Pushes an article unit's markdown body + frontmatter to
// Hashnode's GraphQL API.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO READ `HASHNODE_TOKEN` (AGENTS.md
// invariant #1, extended the same way postiz.ts was for #501). The agents-md
// invariants test allowlists exactly this file for the token. Hashnode's host
// is fixed (gql.hashnode.com) so it also lives only here.
//
// VERIFIED API (2026-07-09): GraphQL endpoint https://gql.hashnode.com/,
// header `Authorization: <token>`. Publishing uses the `publishPost` mutation
// (input { title, contentMarkdown, tags[], publicationId, originalArticleURL })
// → { post { id, url } }; drafting uses `createDraft` (input { title,
// contentMarkdown, publicationId }) → { draft { id } }. `publicationId` is a
// required target param (the blog the post belongs to). Field names are kept
// tolerant — Hashnode's schema evolves; the connector sends only what it needs
// and reads back id/url defensively.

import { TerminalProviderError } from "./shared.js";
import { credentialConfigured, credentialValue } from "./credentials.js";

const LABEL = "Hashnode";
const ENDPOINT = "https://gql.hashnode.com/";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** True iff HASHNODE_TOKEN is configured. */
export function hashnodeAvailable(): boolean {
  return credentialConfigured("hashnode");
}

function requireToken(): string {
  const token = credentialValue("hashnode");
  if (!token) {
    throw new TerminalProviderError(
      `${LABEL}: HASHNODE_TOKEN must be set — create a Personal Access Token at hashnode.com → Account Settings → Developer.`,
    );
  }
  return token;
}

/** The fields an article-publish carries into a Hashnode post/draft. */
export type HashnodeArticleInput = {
  title: string;
  contentMarkdown: string;
  /** The publication (blog) the post belongs to. Required by Hashnode. */
  publicationId: string;
  tags?: string[];
  /** Canonical URL — syndication home the copy points at (GEO hygiene). */
  canonicalUrl?: string;
  coverImageUrl?: string;
};

/** Tolerant result — the created post/draft id + url when present. */
export type HashnodeArticleResult = { id?: string; url?: string; [k: string]: unknown };

async function gql<T>(query: string, variables: unknown, fetchImpl: FetchLike): Promise<T> {
  const resp = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { Authorization: requireToken(), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const text = await resp.text().catch(() => "");
  if (!resp.ok) {
    const message = `${LABEL} POST ${ENDPOINT} ${resp.status}: ${text.slice(0, 300)}`;
    if (resp.status >= 400 && resp.status < 500) throw new TerminalProviderError(message);
    throw new Error(message);
  }
  let parsed: { data?: T; errors?: Array<{ message?: string }> };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new Error(`${LABEL}: unparseable GraphQL response: ${text.slice(0, 200)}`);
  }
  // GraphQL returns 200 with an `errors` array on a rejected mutation.
  if (parsed.errors?.length) {
    throw new TerminalProviderError(`${LABEL}: ${parsed.errors.map((e) => e.message ?? "error").join("; ")}`);
  }
  return parsed.data as T;
}

const PUBLISH_MUTATION = `mutation PublishPost($input: PublishPostInput!) {
  publishPost(input: $input) { post { id url } }
}`;

const DRAFT_MUTATION = `mutation CreateDraft($input: CreateDraftInput!) {
  createDraft(input: $input) { draft { id } }
}`;

/**
 * Publish or draft an article on Hashnode. `draft: true` → `createDraft`
 * (no canonical/tags — a draft is unpublished), else `publishPost`. Returns the
 * post/draft id + url (url only exists for a published post).
 */
export async function hashnodePublish(
  article: HashnodeArticleInput,
  draft: boolean,
  fetchImpl: FetchLike = fetch,
): Promise<HashnodeArticleResult> {
  if (draft) {
    const data = await gql<{ createDraft?: { draft?: { id?: string } } }>(
      DRAFT_MUTATION,
      { input: { title: article.title, contentMarkdown: article.contentMarkdown, publicationId: article.publicationId } },
      fetchImpl,
    );
    return { id: data.createDraft?.draft?.id };
  }
  const input: Record<string, unknown> = {
    title: article.title,
    contentMarkdown: article.contentMarkdown,
    publicationId: article.publicationId,
    ...(article.tags?.length ? { tags: article.tags.map((t) => ({ name: t, slug: t.toLowerCase().replace(/[^a-z0-9]+/g, "-") })) } : {}),
    ...(article.canonicalUrl ? { originalArticleURL: article.canonicalUrl } : {}),
    ...(article.coverImageUrl ? { coverImageOptions: { coverImageURL: article.coverImageUrl } } : {}),
  };
  const data = await gql<{ publishPost?: { post?: { id?: string; url?: string } } }>(
    PUBLISH_MUTATION,
    { input },
    fetchImpl,
  );
  return { id: data.publishPost?.post?.id, url: data.publishPost?.post?.url };
}
