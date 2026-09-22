import { useEffect, useRef } from "react";
import { X } from "@/shared/ui/icons";
import { ATTACHMENT_KINDS, releaseAttachments, type Attachment } from "../lib/attachments";

/**
 * The strip of references above the message.
 *
 * A chip that can be seen is shown rather than named: four stills dropped from Finder used to
 * read as four filenames, which does not answer "is this the one I meant". The picture is the
 * label; the filename stays beside it because that is what the agent will be handed.
 *
 * The strip also owns the lifetime of what it draws. A preview is an object URL, so a chip that
 * leaves -- detached, or sent with the message -- has its URL revoked here: the composer is the
 * last place that still knows the chip existed.
 */
export function AgentAttachments({ attachments, onDetach }: {
  attachments: readonly Attachment[];
  onDetach(index: number): void;
}) {
  const previous = useRef<readonly Attachment[]>([]);
  useEffect(() => {
    const live = new Set(attachments.map((item) => item.preview));
    releaseAttachments(previous.current.filter((item) => item.preview && !live.has(item.preview)));
    previous.current = attachments;
  }, [attachments]);
  useEffect(() => () => releaseAttachments(previous.current), []);
  if (attachments.length === 0) return null;
  return <div className="agent-attachments flex flex-wrap gap-1.5" aria-label="Attachments">
    {attachments.map((attachment, index) => {
      const Icon = ATTACHMENT_KINDS[attachment.kind].icon;
      return <span
        className="agent-attachment inline-flex h-7 max-w-full items-center gap-1.75 rounded-full bg-chat-control pr-1 pl-1 type-sm text-ink"
        key={`${attachment.kind}:${attachment.ref}`}
      >
        {attachment.preview
          ? <img className="size-5.5 flex-none rounded-full bg-frame object-cover" src={attachment.preview} alt="" draggable={false} />
          : <Icon size={12} strokeWidth={1.9} className="ml-1.5 flex-none text-secondary" aria-hidden="true" />}
        <span className="min-w-0 truncate">{attachment.label}</span>
        <span className="flex-none font-code type-mono-xs tracking-mono text-secondary">{ATTACHMENT_KINDS[attachment.kind].label}</span>
        <button
          className="grid size-5 flex-none place-items-center rounded-full text-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          type="button"
          aria-label={`Remove ${attachment.label}`}
          onClick={() => onDetach(index)}
        >
          <X size={11} strokeWidth={2} aria-hidden="true" />
        </button>
      </span>;
    })}
  </div>;
}
