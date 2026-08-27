/**
 * An entity tag: what one is, how it is painted, and where the picker's rows come from.
 *
 * A tag serialises to `@kind:ref` at its position in the text, where `ref` is something the agent
 * can resolve against the library: a unit's slug, a document's slug, a project's
 * `workspace/project`. It is a reference the way a person writing "see unit hero-cut" makes one,
 * not a protocol -- which is why the same three kinds paint a chip in the composer and a chip in
 * a sent turn, from one definition.
 */
import type { ReactNode } from "react";
import { FileText, Folder, Layers } from "lucide-react";

import { ATTACHMENT_KINDS } from "../lib/attachments";
import { bridge } from "@/shared/api/ipc";
import type { ProjectSummary, WorkspaceSummary } from "@/shared/api/ipc";
import type { UnitDto } from "../../../../electron/ralphy/types";


export type TagKind = "unit" | "file" | "project";

export interface TagEntity {
  kind: TagKind;
  /* What the agent resolves. */
  ref: string;
  label: string;
}

/* Kind carries the colour and the glyph. The tint is the kind's ink at 12%, so one token per kind
   answers for both themes -- see theme/agent-rail.css. */
export const KINDS: Record<TagKind, { icon: typeof Layers; ink: string; tint: string; label: string }> = {
  unit: { icon: Layers, ink: "text-tag-unit", tint: "bg-tag-unit/12", label: "UNIT" },
  file: { icon: FileText, ink: "text-tag-file", tint: "bg-tag-file/12", label: "FILE" },
  project: { icon: Folder, ink: "text-tag-project", tint: "bg-tag-project/12", label: "PROJECT" },
};

/* The tag itself. `display:inline-block` with padding and no fixed height, so its text sits on the
   surrounding baseline exactly -- the handoff's alignment rule, and the reason there is no
   `vertical-align` anywhere near it. */
const TAG = "agent-tag inline-block rounded-full px-2.25 py-0.75 type-sm leading-tag whitespace-nowrap align-baseline";

export function agentTagClass(kind: TagKind): string {
  return `${TAG} is-${kind} ${KINDS[kind].tint} ${KINDS[kind].ink}`;
}

/* Handoff 2d, on the operator's own bubble: the chip takes the bubble's ink and a wash of it, and
   the kind moves to the glyph. That is the handoff's own logic rather than a shortcut -- a per-kind
   ink cannot survive here, because the bubble is dark under the light theme and light under the
   dark one, and a tag whose hue flips with the theme is no longer a tag whose hue means its kind.
   Which is also why the field's chip carries no glyph: there the colour is the kind, and it reads. */
const TAG_ON_INVERSE = `${TAG} bg-desk-primary-ink/14 text-desk-primary-ink`;

/** Renders a serialised prompt back as text and tags: the bubble's side of the same contract. */
export function AgentTaggedText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let index = 0;
  for (const match of text.matchAll(/@(unit|file|project|media|memory|scheduled):([^\s]+)/g)) {
    const at = match.index;
    if (at > index) parts.push(text.slice(index, at));
    const kind = match[1] as TagKind;
    /* The bubble's chip is one style for every kind -- the operator's own bubble inverts, and a
       per-kind ink cannot survive that -- so the attachment kinds render here too, by glyph. */
    const Icon = ATTACHMENT_KINDS[kind].icon;
    parts.push(<span className={`${TAG_ON_INVERSE} is-${kind}`} key={`${at}-${match[2]}`}>
      <Icon size={11} strokeWidth={1.9} className="agent-tag-glyph mr-1.25 inline" aria-hidden="true" />
      {match[2]}
    </span>);
    index = at + match[0].length;
  }
  if (index < text.length) parts.push(text.slice(index));
  return <>{parts}</>;
}

/* What the picker can offer. Each source is real: the project the panel is already showing, its
   units, and its documents. Nothing here is a fixture -- a project with no units offers none. */
export function projectEntities(
  workspace: WorkspaceSummary | null,
  project: ProjectSummary | null,
): TagEntity[] {
  if (!project) return [];
  return [{
    kind: "project",
    ref: `${project.workspaceId}/${project.projectId}`,
    label: workspace ? `${project.name} · ${workspace.name}` : project.name,
  }];
}

export async function catalogFor(project: ProjectSummary | null, query: string): Promise<TagEntity[]> {
  if (!project) return [];
  const reference = { workspaceId: project.workspaceId, projectId: project.projectId };
  /* Units come whole -- a project holds tens, not thousands -- and documents come through the
     library's own search, which is the only one that knows their bodies. */
  const [units, documents] = await Promise.all([
    bridge.loadProjectPage({ tab: "units", project: reference })
      .then((page) => (page.items as UnitDto[]).map((unit): TagEntity => ({
        kind: "unit", ref: unit.slug, label: `${unit.slug} · ${unit.format}`,
      })))
      .catch(() => []),
    query
      ? bridge.searchProjectDocuments(reference, query)
        .then((page) => page.items.map((document): TagEntity => ({
          kind: "file", ref: document.slug, label: document.documentTitle || document.slug,
        })))
        .catch(() => [])
      : Promise.resolve([]),
  ]);
  return [...units, ...documents];
}
