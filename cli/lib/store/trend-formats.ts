import { openDomainDb } from "./db.js";
import { createDocument, reviseDocument } from "./documents.js";
import { VISUAL_FORMAT_TAXONOMY_VERSION, VISUAL_FORMATS, isVisualFormat, type VisualFormatLabel } from "../trends/series.js";

/**
 * Visual format labels (#588). The #556 cohort label table only accepts the
 * text axes (`format`, `hook`, ...) and the `rule | llm | seed | manual`
 * methods, so frame-read labels (method `vision-agent`) live in one JSON
 * Document per niche (kind `custom`, append-only revisions, like the #577
 * prediction ledger). A re-label of a video adds a revision; earlier
 * revisions keep the history.
 */

export const VISUAL_FORMAT_DOCUMENT_KIND = "custom" as const;
export const VISUAL_FORMAT_SLUG_PREFIX = "trend-visual-formats-";
export const VISUAL_FORMAT_BODY_KIND = "trend-visual-format-labels" as const;

export type VisualFormatLabelsBody = {
  kind: typeof VISUAL_FORMAT_BODY_KIND;
  niche: string;
  taxonomyVersion: number;
  taxonomy: string[];
  updatedAt: string;
  labels: Record<string, VisualFormatLabel>;
};

export type VisualFormatDocumentDto = { documentId: string; revisionId: string | null; revisions: number; body: VisualFormatLabelsBody };

const emptyBody = (niche: string, at: string): VisualFormatLabelsBody => ({
  kind: VISUAL_FORMAT_BODY_KIND,
  niche,
  taxonomyVersion: VISUAL_FORMAT_TAXONOMY_VERSION,
  taxonomy: [...VISUAL_FORMATS],
  updatedAt: at,
  labels: {},
});

function parseBody(text: string | null, niche: string): VisualFormatLabelsBody {
  try {
    const parsed = text === null ? null : (JSON.parse(text) as Partial<VisualFormatLabelsBody>);
    if (!parsed || parsed.kind !== VISUAL_FORMAT_BODY_KIND || !parsed.labels || typeof parsed.labels !== "object") return emptyBody(niche, new Date(0).toISOString());
    const labels = Object.fromEntries(Object.entries(parsed.labels).filter(([, label]) => label && isVisualFormat((label as VisualFormatLabel).format)));
    return { ...emptyBody(niche, parsed.updatedAt ?? new Date(0).toISOString()), ...parsed, labels } as VisualFormatLabelsBody;
  } catch {
    return emptyBody(niche, new Date(0).toISOString());
  }
}

export function readVisualFormatDocument(input: { workspaceId: string; niche: string }): VisualFormatDocumentDto | null {
  const row = openDomainDb()
    .query<{ id: string; current_revision_id: string | null; body: string | null; revisions: number }, [string, string, string]>(
      `SELECT d.id, d.current_revision_id, r.body,
              (SELECT COUNT(*) FROM document_revisions x WHERE x.document_id = d.id) AS revisions
       FROM documents d LEFT JOIN document_revisions r ON r.id = d.current_revision_id
       WHERE d.workspace_id = ? AND d.project_id IS NULL AND d.kind = ? AND d.slug = ?`,
    )
    .get(input.workspaceId, VISUAL_FORMAT_DOCUMENT_KIND, `${VISUAL_FORMAT_SLUG_PREFIX}${input.niche}`);
  if (!row) return null;
  return { documentId: row.id, revisionId: row.current_revision_id, revisions: row.revisions, body: parseBody(row.body, input.niche) };
}

/** Current visual format label per video id for one niche (empty when none). */
export function visualFormatLabels(input: { workspaceId: string; niche: string }): Map<string, VisualFormatLabel> {
  const document = readVisualFormatDocument(input);
  return new Map(Object.entries(document?.body.labels ?? {}));
}

/**
 * Merge labels into the niche's label Document as one new revision. A label
 * identical to the stored one (format, confidence, notes) is not rewritten;
 * nothing changed means no revision.
 */
export function appendVisualFormatLabels(input: { workspaceId: string; niche: string; labels: readonly VisualFormatLabel[]; now: number }): {
  written: boolean;
  documentId: string | null;
  revisionId: string | null;
  revisions: number;
  added: number;
  updated: number;
  unchanged: number;
} {
  const existing = readVisualFormatDocument({ workspaceId: input.workspaceId, niche: input.niche });
  const at = new Date(input.now).toISOString();
  const body = existing?.body ?? emptyBody(input.niche, at);
  const labels = { ...body.labels };
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const label of input.labels) {
    const prior = labels[label.videoId];
    if (prior && prior.format === label.format && prior.confidence === label.confidence && prior.notes === label.notes) {
      unchanged += 1;
      continue;
    }
    if (prior) updated += 1;
    else added += 1;
    labels[label.videoId] = { ...label, niche: input.niche };
  }
  if (added === 0 && updated === 0) {
    return { written: false, documentId: existing?.documentId ?? null, revisionId: existing?.revisionId ?? null, revisions: existing?.revisions ?? 0, added, updated, unchanged };
  }
  const title = `Visual format labels: ${input.niche}`;
  const documentId = existing?.documentId ?? createDocument({ workspaceId: input.workspaceId, kind: VISUAL_FORMAT_DOCUMENT_KIND, slug: `${VISUAL_FORMAT_SLUG_PREFIX}${input.niche}`, title }).id;
  const next: VisualFormatLabelsBody = { ...body, taxonomyVersion: VISUAL_FORMAT_TAXONOMY_VERSION, taxonomy: [...VISUAL_FORMATS], updatedAt: at, labels };
  const revision = reviseDocument({ documentId, expectedHeadId: existing?.revisionId ?? null, format: "json", title, body: JSON.stringify(next) });
  return { written: true, documentId, revisionId: revision.id, revisions: (existing?.revisions ?? 0) + 1, added, updated, unchanged };
}

/** Niche slug, platform, and URL of corpus videos (label import checks that each id exists). */
export function trendVideoRefs(input: { workspaceId: string; videoIds: readonly string[] }): Map<string, { creatorId: string; url: string; platform: string }> {
  const db = openDomainDb();
  const out = new Map<string, { creatorId: string; url: string; platform: string }>();
  for (let index = 0; index < input.videoIds.length; index += 400) {
    const group = input.videoIds.slice(index, index + 400);
    if (group.length === 0) continue;
    const rows = db
      .query<{ id: string; creator_id: string; url: string; platform: string }, string[]>(
        `SELECT v.id, v.creator_id, v.url, v.platform FROM trend_videos v JOIN trend_creators c ON c.id = v.creator_id
         WHERE c.workspace_id = ? AND v.id IN (${group.map(() => "?").join(",")})`,
      )
      .all(input.workspaceId, ...group);
    for (const row of rows) out.set(row.id, { creatorId: row.creator_id, url: row.url, platform: row.platform });
  }
  return out;
}
