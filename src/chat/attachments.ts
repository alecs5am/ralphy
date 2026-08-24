import { Brain, CalendarClock, FileText, Folder, Image, Layers, type LucideIcon } from "lucide-react";

/**
 * Attachments: the chat's second reference channel.
 *
 * An inline tag is what the operator types -- `@` opens a picker and the chip lands in the
 * sentence. An attachment is what the operator *drags*, and it is deliberately not the same
 * channel: a drop carries an entity the app already knows, from a place the app already draws, and
 * it belongs beside the message rather than inside a sentence that may not mention it.
 *
 * A drag out of the app's own panels carries this module's payload, so the drop knows what it
 * received: a Unit is a Unit and a media asset is a media asset, not a filename. A drag out of
 * Finder carries files, and a file is a path -- the harness runs with the operator's own
 * filesystem, so a path is the most useful thing to hand it.
 */

export type AttachmentKind = "unit" | "file" | "project" | "media" | "memory" | "scheduled";

export interface Attachment {
  kind: AttachmentKind;
  /** What the agent resolves: a slug, a path, a `workspace/project` pair. */
  ref: string;
  label: string;
}

/* The glyph and the word each kind is printed with. There is no colour here on purpose: colour is
   the *inline* tag's way of saying its kind inside a sentence, and an attachment is already a
   chip on its own strip with its kind spelled out. */
export const ATTACHMENT_KINDS: Record<AttachmentKind, { icon: LucideIcon; label: string }> = {
  unit: { icon: Layers, label: "UNIT" },
  file: { icon: FileText, label: "FILE" },
  project: { icon: Folder, label: "PROJECT" },
  media: { icon: Image, label: "MEDIA" },
  memory: { icon: Brain, label: "MEMORY" },
  scheduled: { icon: CalendarClock, label: "SCHEDULED" },
};

/** The drag type the app's own rows carry. A type of our own is what tells a drop where it came from. */
export const RALPHY_ENTITY_DRAG = "application/x-ralphy-entity";

export interface DragLike {
  setData(format: string, data: string): void;
  effectAllowed: string;
}

export interface DropLike {
  types: readonly string[];
  getData(format: string): string;
  files?: ArrayLike<unknown>;
}

/**
 * The props that make a row draggable into the chat. Spread onto the row itself, so a row states
 * what it is once and nothing else has to know.
 */
export function entityDragProps(attachment: Attachment): {
  draggable: true;
  onDragStart(event: { dataTransfer: DragLike }): void;
} {
  return {
    draggable: true,
    onDragStart(event) {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(RALPHY_ENTITY_DRAG, JSON.stringify(attachment));
      /* A plain-text flavour too, so the same drag is still meaningful to anything else -- a
         terminal, an editor, a text field outside the app. */
      event.dataTransfer.setData("text/plain", `@${attachment.kind}:${attachment.ref}`);
    },
  };
}

const KINDS = Object.keys(ATTACHMENT_KINDS) as AttachmentKind[];

function parseAttachment(value: unknown): Attachment | null {
  const row = value as Partial<Attachment> | null;
  if (!row || typeof row.ref !== "string" || !row.ref) return null;
  if (!KINDS.includes(row.kind as AttachmentKind)) return null;
  return { kind: row.kind as AttachmentKind, ref: row.ref, label: row.label || row.ref };
}

/** A drop from the app's own panels. Anything else -- a foreign payload, junk -- yields nothing. */
export function readEntityDrop(transfer: DropLike): Attachment[] {
  if (!transfer.types.includes(RALPHY_ENTITY_DRAG)) return [];
  try {
    const value = JSON.parse(transfer.getData(RALPHY_ENTITY_DRAG)) as unknown;
    const rows = Array.isArray(value) ? value : [value];
    return rows.map(parseAttachment).filter((row): row is Attachment => row !== null);
  } catch {
    return [];
  }
}

/** A drop from Finder: one attachment per file, named by its path when the host can resolve one. */
export function readFileDrop(files: readonly { name: string }[], pathFor: (file: unknown) => string | null): Attachment[] {
  return files.map((file) => {
    const path = pathFor(file);
    return { kind: "file" as const, ref: path ?? file.name, label: file.name };
  });
}

/** An attachment already on the strip is not added twice: the strip is a set of places. */
export function addAttachments(current: readonly Attachment[], added: readonly Attachment[]): Attachment[] {
  const seen = new Set(current.map(({ kind, ref }) => `${kind}:${ref}`));
  return [...current, ...added.filter(({ kind, ref }) => {
    const key = `${kind}:${ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
}

/**
 * What the provider receives. The attachments are a block under the message rather than words
 * inside it, in the same `@kind:ref` vocabulary the inline tags use -- so the operator's own
 * bubble renders them as chips, and the agent reads one list of references either way.
 */
export function withAttachments(prompt: string, attachments: readonly Attachment[]): string {
  if (attachments.length === 0) return prompt;
  const lines = attachments.map(({ kind, ref }) => `- @${kind}:${ref}`).join("\n");
  return `${prompt ? `${prompt}\n\n` : ""}Attached:\n${lines}`;
}
