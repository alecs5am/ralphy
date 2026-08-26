import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { SelectMenu } from "../../components/ui/SelectMenu";
import type { Availability, SharedArtifactPresentation } from "./presentation";
import { Modal, MODAL_ACTION_GHOST } from "../../components/ui/Modal";
import { WINDOW } from "../../components/ui/Window";

export type SharedLibraryWorkflowKind = "add" | "promote" | "duplicate" | "suggestions" | "archive" | "update-review";

const coreReason = "This workflow cannot persist because the current Core version exposes no Shared Library mutation contract.";
const unavailable = "Unavailable from this Core version";
export const SHARED_ARTIFACT_ROLES = [
  "Canonical character", "Character reference", "Location", "Product", "Logo or brand mark", "Color or style reference",
  "Universal sound hook", "Music bed", "Sound effect", "Voice reference", "Font", "Prop", "Recurring footage",
  "Intro or outro", "Overlay or texture", "Document reference", "Other",
] as const;
const roleOptions = SHARED_ARTIFACT_ROLES.map((value) => ({ value, label: value }));
const formatLocalBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

/* A workflow window is a light widget: sunken strips top and bottom, sunken blocks in the body,
   and one step up again for anything standing on a block. Each workflow has its own size, and
   none of them ever touch the desk edge. */
const SHELL = `shared-workflow-window fixed inset-0 z-viewer-content m-auto max-h-shared-window-height max-w-shared-window-width text-ink [corner-shape:squircle] ${WINDOW}`;
const SHELL_SIZE: Record<SharedLibraryWorkflowKind, string> = {
  add: "h-shared-workflow-add-height w-shared-workflow-add-width",
  promote: "h-shared-workflow-promote-height w-shared-workflow-promote-width",
  duplicate: "h-shared-workflow-duplicate-height w-shared-workflow-duplicate-width",
  suggestions: "h-shared-workflow-suggestions-height w-shared-workflow-suggestions-width",
  archive: "h-shared-workflow-archive-height w-shared-workflow-archive-width",
  "update-review": "h-shared-workflow-height w-shared-workflow-width",
};
const STEP_BUTTON = "flex h-8.5 w-full items-center gap-2 rounded-control px-2.25 type-label text-left";
const BLOCK_LABEL = "m-0 flex-1 font-code type-mono-sm tracking-mono text-muted";
const BLOCK_TAG = "h-4.5 rounded-key bg-surface-hover px-1.5 py-0.75 font-code type-mono-sm tracking-label text-muted";
const CAPTION = "m-0 type-label leading-normal text-muted";
const FIELD_LABEL = "grid min-w-0 gap-1.5";
const FIELD_NAME = "font-code type-mono-sm tracking-caps text-muted";
const FIELD = "min-h-8.5 min-w-0 rounded-field border-0 bg-surface-sunken px-2.5 py-2 type-sm text-ink";
const SOURCE = "grid min-h-23 content-center gap-1.25 rounded-control bg-surface-hover p-3 text-left text-muted [&_strong]:type-sm [&_strong]:font-normal [&_strong]:text-ink [&_:is(span,small)]:type-mono-md [&_:is(span,small)]:leading-caption [&_:is(span,small)]:text-muted";
const INVENTORY_ROW = "grid min-h-9.5 grid-cols-(--shared-library-inventory-columns) items-center gap-3 bg-surface-hover px-2.5 py-1.75";
const INVENTORY_LABEL = "m-0 type-label text-muted";
const INVENTORY_VALUE = "m-0 font-code type-mono-md text-right text-muted [overflow-wrap:anywhere]";
/* Monochrome: the warning note carries its warning in the triangle and the copy, not in a hue. */
const NOTE = "shared-workflow-note flex items-start gap-2.25 rounded-field bg-surface-hover p-2.75 type-label leading-normal text-muted [&>svg]:mt-0.5 [&>svg]:size-3.5 [&>svg]:flex-none [&_strong]:block [&_strong]:font-normal [&_strong]:text-ink";
const CHOICE = "flex min-h-12 items-center rounded-control px-2.5 py-2 text-left disabled:opacity-55 [&_span]:grid [&_span]:gap-0.75 [&_strong]:type-sm [&_strong]:font-normal [&_small]:type-mono-md [&_small]:leading-caption";
const SELECTED_PILL = "bg-instrument text-on-instrument focus-visible:outline-focus-on-instrument";
const RIGHTS_BUTTON = "min-h-7 rounded-control px-2 type-mono-md";
const SUGGESTION_BUTTON = "min-h-control-sm rounded-control px-2 type-mono-md disabled:opacity-55";

function RoleField({ role, otherRole, onRole, onOtherRole }: { role: string; otherRole: string; onRole(value: string): void; onOtherRole(value: string): void }) {
  return <div className={FIELD_LABEL}><span className={FIELD_NAME}>Role</span><SelectMenu overlayOwner="shared.workflow" value={role} options={roleOptions} ariaLabel="Role" className="shared-workflow-role" onValueChange={onRole} />
    {role === "Other" && <input className={FIELD} aria-label="Other role" value={otherRole} onChange={(event) => onOtherRole(event.currentTarget.value)} placeholder="Describe the role" />}
  </div>;
}

function WorkflowFrame({ kind, title, description, returnFocus, onClose, steps, footerNote, children, actions }: {
  kind: SharedLibraryWorkflowKind;
  title: string;
  description: string;
  returnFocus: HTMLElement | null;
  onClose(): void;
  steps?: ReactNode;
  footerNote?: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const size = SHELL_SIZE[kind];
  const restoreFocus = useCallback(() => {
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }, [returnFocus]);
  const close = useCallback(() => {
    onClose();
    queueMicrotask(restoreFocus);
  }, [onClose, restoreFocus]);

  return <Modal
    id="shared-workflow"
    open
    onOpenChange={(open) => { if (!open) close(); }}
    size={size}
    layer="viewer"
    className={`${SHELL} shared-workflow-window`}
    scrimClassName="shared-workflow-overlay bg-media-veil"
    title={title}
    titleClassName="m-0 min-w-0 flex-1 truncate type-heading font-normal text-ink"
    /* The sentence that explains the workflow is instruction, so it reads at the top of the card
       with the steps rather than on the titlebar line. */
    description={description}
    descriptionPlacement="body"
    descriptionClassName="m-0 flex-none px-5 pt-3.5 type-ui leading-row text-muted"
    closeLabel={`Close ${title}`}
    titlebarClassName="shared-workflow-header"
    bodyClassName="shared-workflow-card"
    data={{ "data-workflow": kind }}
    surfaceRef={surface}
    onOpenAutoFocus={(event) => { event.preventDefault(); surface.current?.focus({ preventScroll: true }); }}
    onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}
  >
          {steps}
          <form className="shared-workflow-body flex min-h-0 flex-1 flex-col gap-4.5 overflow-y-auto px-5 py-4" onSubmit={(event) => event.preventDefault()}>{children}</form>
          <i className="mx-5 h-px flex-none bg-divider" aria-hidden="true" />
          <footer className="shared-workflow-footer flex min-h-15.5 flex-none items-center gap-4.5 px-5 pt-3.25 pb-4.25">
            <small className="max-w-shared-footnote flex-1 font-code type-mono-sm tracking-meta leading-row text-muted">{footerNote ?? coreReason}</small>
            <span className="flex gap-2">{actions}</span>
    </footer>
  </Modal>;
}

function Block({ label, tag, children, className = "" }: { label: string; tag?: string; children: ReactNode; className?: string }) {
  return <section className={`shared-workflow-block grid gap-2.5 rounded-cell bg-surface-sunken p-3.25 [corner-shape:squircle] ${className}`}><header className="flex items-center gap-2"><h3 className={BLOCK_LABEL}>{label}</h3>{tag && <span className={BLOCK_TAG}>{tag}</span>}</header>{children}</section>;
}

const addSteps = ["Source", "Duplicates", "Describe for reuse", "Confirm"] as const;

function AddWorkflow({ returnFocus, onClose }: Pick<SharedLibraryWorkflowsProps, "returnFocus" | "onClose">) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<{ name: string; type: string; size: number } | null>(null);
  const [fields, setFields] = useState({ title: "", role: SHARED_ARTIFACT_ROLES[0] as string, otherRole: "", purpose: "", useWhen: "", rights: "Not documented" });
  const reasonId = useId();
  const sourceReasonId = useId();
  const setField = (field: keyof typeof fields, value: string) => setFields((current) => ({ ...current, [field]: value }));
  const selectFile = (next?: { name: string; type: string; size: number }) => setFile(next ? { name: next.name, type: next.type, size: next.size } : null);
  const selectedRole = fields.role === "Other" ? fields.otherRole : fields.role;
  const needsContext = !fields.title.trim() || !selectedRole.trim() || !fields.purpose.trim() || !fields.useWhen.trim();
  const steps = <ol className="shared-workflow-steps m-0 grid grid-cols-4 list-none gap-1.25 px-5 pb-3.5" aria-label="Add artifact steps">
    {addSteps.map((label, index) => <li key={label}><button className={`${STEP_BUTTON} ${step === index ? SELECTED_PILL : "bg-surface-sunken text-muted"}`} type="button" aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)}><span className={`grid size-4.5 flex-none place-items-center rounded-full font-code type-mono-sm ${step === index ? "bg-on-instrument text-instrument" : "bg-surface-hover text-muted"}`}>{index + 1}</span>{label}</button></li>)}
  </ol>;

  return <WorkflowFrame
    kind="add"
    title="Add artifact"
    description="Prepare a reusable artifact locally; the current Core cannot accept the upload."
    returnFocus={returnFocus}
    onClose={onClose}
    steps={steps}
    footerNote={step === 3 ? coreReason : `STEP ${step + 1} OF 4 · LOCAL PREVIEW ONLY`}
    actions={<>
      {step > 0 && <button className={MODAL_ACTION_GHOST} type="button" onClick={() => setStep((current) => current - 1)}>Back</button>}
      {step < 3 && <button type="button" className={`shared-workflow-primary ${MODAL_ACTION_GHOST} ${SELECTED_PILL}`} onClick={() => setStep((current) => current + 1)}>{step === 0 ? "Continue to duplicates" : step === 1 ? "Continue to describe" : "Continue to confirm"}</button>}
      {step === 3 && <button type="button" className={`shared-workflow-primary ${MODAL_ACTION_GHOST} ${SELECTED_PILL}`} disabled aria-describedby={reasonId}>Add to Shared Library unavailable</button>}
    </>}
  >
    {step === 0 && <Block label="Source" tag="LOCAL ONLY">
      <div className="grid grid-cols-2 gap-1.75">
        <label className={`shared-workflow-source is-upload ${SOURCE} cursor-pointer`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files?.[0]); }}><strong>Upload new file</strong><span>Drop a file here or choose with the accessible picker.</span><input className="sr-only" type="file" onChange={(event) => selectFile(event.currentTarget.files?.[0])} /><small>{file ? file.name : "Choose a file"}</small></label>
        {["Promote from project", "Import from asset pool", "Add external reference"].map((label) => <button className={SOURCE} type="button" data-unavailable-source aria-disabled="true" aria-describedby={sourceReasonId} key={label}><strong>{label}</strong><span>Unavailable from the current Core version.</span></button>)}
      </div>
      <dl className="m-0 grid gap-px overflow-hidden rounded-field"><div className={INVENTORY_ROW}><dt className={INVENTORY_LABEL}>Accepted types</dt><dd className={INVENTORY_VALUE}> · unavailable from the current Core upload contract</dd></div><div className={INVENTORY_ROW}><dt className={INVENTORY_LABEL}>Maximum size</dt><dd className={INVENTORY_VALUE}> · unavailable from the current Core upload contract</dd></div></dl>
      {file && <div className="shared-workflow-local-preview grid gap-1 rounded-field bg-surface-hover p-2.5" aria-label="Local confirmation preview"><strong className="type-label font-normal text-muted">{file.name}</strong><span className="font-code type-mono-md text-muted">{file.type || "Type not reported"} · {formatLocalBytes(file.size)}</span></div>}
      <p className={CAPTION} id={sourceReasonId}>Project promotion, asset-pool import, and external references are unavailable because Core exposes no source inventory or mutation contract.</p>
      <p className={CAPTION}>Upload cannot persist with this Core version. Choosing a file only updates this window.</p>
    </Block>}
    {step === 1 && <Block label="Duplicates" tag="CHECK UNAVAILABLE">
      <div className={NOTE}><AlertTriangle aria-hidden="true" /><span><strong>Content hash comparison is unavailable from this Core version.</strong> No duplicate has been detected and no identity claim is being made.</span></div>
    </Block>}
    {step === 2 && <Block label="Required for reuse" tag="5 FIELDS">
      <div className="shared-workflow-fields grid grid-cols-2 gap-2.5">
        <label className={FIELD_LABEL}><span className={FIELD_NAME}>Title</span><input className={FIELD} value={fields.title} onChange={(event) => setField("title", event.currentTarget.value)} placeholder="What this artifact represents" /></label>
        <RoleField role={fields.role} otherRole={fields.otherRole} onRole={(value) => setField("role", value)} onOtherRole={(value) => setField("otherRole", value)} />
        <label className={FIELD_LABEL}><span className={FIELD_NAME}>Purpose</span><textarea className={`${FIELD} min-h-17.5 resize-y`} value={fields.purpose} onChange={(event) => setField("purpose", event.currentTarget.value)} placeholder="What this is for" /></label>
        <label className={FIELD_LABEL}><span className={FIELD_NAME}>Use when</span><textarea className={`${FIELD} min-h-17.5 resize-y`} value={fields.useWhen} onChange={(event) => setField("useWhen", event.currentTarget.value)} placeholder="Trigger conditions for future work" /></label>
        <fieldset className="min-w-0 border-0 p-0"><legend className={`mb-1.5 ${FIELD_NAME}`}>Rights status</legend><div className="flex flex-wrap gap-1.25" role="group" aria-label="Proposed rights status">{["Not documented", "Cleared", "Cleared with conditions", "Internal/reference only", "Restricted"].map((status) => <button type="button" className={`${RIGHTS_BUTTON} ${fields.rights === status ? SELECTED_PILL : "bg-surface-hover text-muted"}`} aria-pressed={fields.rights === status} onClick={() => setField("rights", status)} key={status}>{status}</button>)}</div></fieldset>
      </div>
      <p className={CAPTION}>Incomplete values would be marked Needs context. Proposed rights default to Not documented; neither value has been saved.</p>
    </Block>}
    {step === 3 && <Block label="Confirm" tag={needsContext ? "NEEDS CONTEXT" : "CONTEXT REVIEWED"}>
      <dl className="m-0 grid gap-px overflow-hidden rounded-field">
        {([
          ["Source", file?.name || "No local file selected"],
          ["Local file facts", file ? `${file.type || "Type not reported"} · ${formatLocalBytes(file.size)}` : "Unavailable until a local file is selected"],
          ["Title", fields.title || "Incomplete"],
          ["Role", selectedRole || "Incomplete"],
          ["Purpose", fields.purpose || "Incomplete"],
          ["Use when", fields.useWhen || "Incomplete"],
          ["Rights", `Proposed rights · ${fields.rights}`],
        ] as const).map(([label, value]) => <div className={INVENTORY_ROW} key={label}><dt className={INVENTORY_LABEL}>{label}</dt><dd className={INVENTORY_VALUE}>{value}</dd></div>)}
      </dl>
      <div className={NOTE}><AlertTriangle aria-hidden="true" /><span><strong>{needsContext ? "Needs context" : "Context ready for review"}</strong> Nothing has been saved. Incomplete metadata would not block a future upload.</span></div>
      <p className={CAPTION} id={reasonId}>{coreReason}</p>
    </Block>}
  </WorkflowFrame>;
}

function PromoteWorkflow({ returnFocus, onClose }: Pick<SharedLibraryWorkflowsProps, "returnFocus" | "onClose">) {
  const reasonId = useId();
  const [meaning, setMeaning] = useState({ title: "", role: SHARED_ARTIFACT_ROLES[0] as string, otherRole: "", purpose: "" });
  const setField = (field: keyof typeof meaning, value: string) => setMeaning((current) => ({ ...current, [field]: value }));
  return <WorkflowFrame kind="promote" title="Promote from project" description="Make a project artifact reusable without moving or changing its project source." returnFocus={returnFocus} onClose={onClose} actions={<><Dialog.Close asChild><button className={MODAL_ACTION_GHOST} type="button">Cancel</button></Dialog.Close><button type="button" className={`shared-workflow-primary ${MODAL_ACTION_GHOST} ${SELECTED_PILL}`} disabled aria-describedby={reasonId}>Promote to Shared Library unavailable</button></>}>
    <Block label="Source project artifact" tag="INVENTORY UNAVAILABLE">
      <div className={FIELD_LABEL}><span className={FIELD_NAME}>Project source</span><button type="button" className={`${FIELD} w-full text-left text-muted`} aria-disabled="true" aria-describedby={reasonId}>Project artifact inventory unavailable from this Core version</button></div>
      <p className={CAPTION}>A future source picker preserves the source project, Unit, selected revision, provenance, existing reference, and content identity.</p>
    </Block>
    <Block label="Workspace meaning" tag="LOCAL PREVIEW">
      <div className="shared-workflow-fields grid grid-cols-3 gap-2.5">
        <label className={FIELD_LABEL}><span className={FIELD_NAME}>Title</span><input className={FIELD} value={meaning.title} onChange={(event) => setField("title", event.currentTarget.value)} /></label>
        <RoleField role={meaning.role} otherRole={meaning.otherRole} onRole={(value) => setField("role", value)} onOtherRole={(value) => setField("otherRole", value)} />
        <label className={FIELD_LABEL}><span className={FIELD_NAME}>Purpose</span><textarea className={`${FIELD} min-h-17.5 resize-y`} value={meaning.purpose} onChange={(event) => setField("purpose", event.currentTarget.value)} /></label>
      </div>
    </Block>
    <Block label="Confirmation copy" tag="NOT PERFORMED"><div className={NOTE}><span><strong>Added to Shared Library · the existing project remains pinned to its current artifact.</strong> No promotion has occurred; this is the exact future confirmation copy.</span></div></Block>
    <p className={CAPTION} id={reasonId}>{coreReason}</p>
  </WorkflowFrame>;
}

function DuplicateWorkflow({ returnFocus, onClose }: Pick<SharedLibraryWorkflowsProps, "returnFocus" | "onClose">) {
  const [choice, setChoice] = useState<"reuse" | "revision" | "separate">("reuse");
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const choices = [
    ["reuse", "Reuse the existing artifact", "No new artifact would be created."],
    ["revision", "Add as a new revision", "A future revision would be append-only; existing usages stay pinned."],
    ["separate", "Create a separate artifact", "The same bytes need a recorded semantic reason."],
  ] as const;
  return <WorkflowFrame kind="duplicate" title="Duplicate review" description="Review the same-content boundary without claiming a hash result." returnFocus={returnFocus} onClose={onClose} actions={<><Dialog.Close asChild><button className={MODAL_ACTION_GHOST} type="button">Cancel</button></Dialog.Close><button type="button" className={`shared-workflow-primary ${MODAL_ACTION_GHOST} ${SELECTED_PILL}`} disabled aria-describedby={reasonId}>{choice === "reuse" ? "Reuse existing artifact unavailable" : choice === "revision" ? "Add revision unavailable" : "Create separate artifact unavailable"}</button></>}>
    <Block label="Same content identity" tag="HASH UNAVAILABLE">
      <div className="grid grid-cols-2 gap-2.25"><article className="grid min-h-27.5 content-center gap-1.75 rounded-cell bg-surface-hover p-3.25"><strong className="type-ui font-normal text-ink">Existing artifact</strong><span className="font-code type-mono-md text-muted">{unavailable}</span></article><article className="grid min-h-27.5 content-center gap-1.75 rounded-cell bg-surface-hover p-3.25"><strong className="type-ui font-normal text-ink">Incoming file</strong><span className="font-code type-mono-md text-muted">{unavailable}</span></article></div>
      <p className={CAPTION}>Content hash comparison is unavailable from this Core version. A filename is not content identity.</p>
    </Block>
    <Block label="What should happen" tag="LOCAL CHOICE">
      <div className="shared-workflow-choices grid gap-1.25">{choices.map(([value, label, detail]) => <button type="button" className={`${CHOICE} ${choice === value ? `${SELECTED_PILL} [&_small]:text-on-instrument-muted [&_strong]:text-on-instrument` : "bg-surface-hover text-ink [&_small]:text-muted"}`} aria-pressed={choice === value} onClick={() => setChoice(value)} key={value}><span><strong>{label}</strong><small>{detail}</small></span></button>)}</div>
      {choice === "separate" && <label className={FIELD_LABEL}><span className={FIELD_NAME}>Reason required</span><input className={FIELD} required value={reason} onChange={(event) => setReason(event.currentTarget.value)} placeholder="Why the same bytes represent a distinct artifact" /></label>}
    </Block>
    <p className={CAPTION} id={reasonId}>{coreReason}</p>
  </WorkflowFrame>;
}

const suggestionFields = ["Title", "Media kind and role", "Named entity", "Purpose"];

function SuggestionsWorkflow({ suggestions, returnFocus, onClose }: Pick<SharedLibraryWorkflowsProps, "suggestions" | "returnFocus" | "onClose">) {
  const [review, setReview] = useState<Record<string, "pending" | "accepted" | "rejected">>({});
  const reasonId = useId();
  const items = suggestions.status === "ready" || suggestions.status === "partial" ? suggestions.value : [];
  const suggestionReason = suggestions.status === "ready" ? "No suggestion evidence was supplied." : suggestions.reason;
  return <WorkflowFrame kind="suggestions" title="Suggested from file content" description="Review each local suggestion before it could become context agents receive." returnFocus={returnFocus} onClose={onClose} footerNote="SUGGESTIONS ARE NOT CANONICAL UNTIL ACCEPTED" actions={<><Dialog.Close asChild><button className={MODAL_ACTION_GHOST} type="button">Cancel</button></Dialog.Close><button type="button" className={`shared-workflow-primary ${MODAL_ACTION_GHOST} ${SELECTED_PILL}`} disabled aria-describedby={reasonId}>Apply reviewed fields unavailable</button></>}>
    <Block label="Suggestions" tag={items.length ? `REVIEW ${items.length}` : "UNAVAILABLE"}>
      <div className="shared-workflow-suggestions grid grid-cols-2 gap-1.75">{items.length ? items.map(({ field, value, source }, index) => {
        const key = `${field}:${index}`;
        const status = review[key] ?? "pending";
        return <article className="shared-workflow-suggestion grid gap-1.5 rounded-field bg-surface-hover p-2.75" key={key}>
          <header className="flex items-center gap-2"><strong className="flex-1 font-code type-mono-sm tracking-caps text-muted">{field}</strong><span className="rounded-key bg-surface px-1.5 py-0.75 font-code type-mono-sm text-muted">SUGGESTED</span></header><p className="m-0 type-ui leading-caption text-ink">{value}</p><small className="font-code type-mono-md text-muted">{source}</small>
          <div className="flex gap-1.25"><button type="button" className={`${SUGGESTION_BUTTON} ${status === "accepted" ? SELECTED_PILL : "bg-surface-sunken text-muted"}`} aria-pressed={status === "accepted"} onClick={() => setReview((current) => ({ ...current, [key]: "accepted" }))}>Accept {field} suggestion</button><button type="button" className={`${SUGGESTION_BUTTON} ${status === "rejected" ? SELECTED_PILL : "bg-surface-sunken text-muted"}`} aria-pressed={status === "rejected"} onClick={() => setReview((current) => ({ ...current, [key]: "rejected" }))}>Reject {field} suggestion</button></div>
          <b className="type-mono-md font-normal text-muted">{status === "accepted" ? "Accepted locally for review" : status === "rejected" ? "Rejected locally" : "Awaiting review"}</b>
        </article>;
      }) : suggestionFields.map((field) => <article className="shared-workflow-suggestion grid gap-1.5 rounded-field bg-surface-hover p-2.75" key={field}>
        <header className="flex items-center gap-2"><strong className="flex-1 font-code type-mono-sm tracking-caps text-muted">{field}</strong><span className="rounded-key bg-surface px-1.5 py-0.75 font-code type-mono-sm text-muted">UNAVAILABLE</span></header><p className="m-0 type-ui leading-caption text-ink">{suggestionReason}</p><small className="font-code type-mono-md text-muted">No suggestion value or source evidence returned.</small>
        <div className="flex gap-1.25"><button className={`${SUGGESTION_BUTTON} bg-surface-sunken text-muted`} type="button" disabled>Accept {field} suggestion</button><button className={`${SUGGESTION_BUTTON} bg-surface-sunken text-muted`} type="button" disabled>Reject {field} suggestion</button></div>
        <b className="type-mono-md font-normal text-muted">Unavailable from this Core version</b>
      </article>)}</div>
      {suggestions.status === "partial" && <p className={CAPTION}>{suggestions.reason}</p>}
    </Block>
    <div className={`${NOTE} is-warning`}><AlertTriangle aria-hidden="true" /><span><strong>Licence, consent and identity are never inferred.</strong> Universal-use rules are never inferred from media either.</span></div>
    <Block label="NOT SUGGESTED"><dl className="m-0 grid gap-px overflow-hidden rounded-field">{([
      ["Rights and licence", "Human evidence only"],
      ["Consent and identity", "Human evidence only"],
      ["Universal-use rules", "Human decision only"],
      ["Canonical status", "Human decision only"],
    ] as const).map(([label, value]) => <div className={INVENTORY_ROW} key={label}><dt className={INVENTORY_LABEL}>{label}</dt><dd className={INVENTORY_VALUE}>{value}</dd></div>)}</dl></Block>
    <p className={CAPTION} id={reasonId}>Suggestions are not canonical and nothing has been persisted. {coreReason}</p>
  </WorkflowFrame>;
}

function ArchiveWorkflow({ artifact, returnFocus, onClose }: SharedLibraryWorkflowsProps) {
  const reasonId = useId();
  return <WorkflowFrame kind="archive" title="Archive impact" description={`Archiving ${artifact?.slug ?? "this artifact"} would stop future selection while preserving references and provenance.`} returnFocus={returnFocus} onClose={onClose} actions={<><Dialog.Close asChild><button className={MODAL_ACTION_GHOST} type="button">Cancel</button></Dialog.Close><button type="button" className={`shared-workflow-warning ${MODAL_ACTION_GHOST} bg-muted text-surface-sunken`} disabled aria-describedby={reasonId}>Archive artifact unavailable</button></>}>
    <Block label="What this touches" tag="IMPACT UNAVAILABLE"><dl className="m-0 grid gap-px overflow-hidden rounded-field">{["Active references", "Historical references", "Projects affected", "Units affected", "Currently canonical", "File state"].map((label) => <div className={INVENTORY_ROW} key={label}><dt className={INVENTORY_LABEL}>{label}</dt><dd className={INVENTORY_VALUE}>{unavailable}</dd></div>)}</dl></Block>
    <Block label="Replacement for future work" tag="PICKER UNAVAILABLE"><div className={FIELD_LABEL}><span className={FIELD_NAME}>Replacement artifact</span><button type="button" className={`${FIELD} w-full text-left text-muted disabled:cursor-not-allowed`} disabled>Replacement candidates unavailable from this Core version</button></div></Block>
    <div className={`${NOTE} is-warning`}><AlertTriangle aria-hidden="true" /><span><strong>Nothing is deleted.</strong> Archive is reversible. Existing references and provenance would remain; permanent byte removal is a separate technical action.</span></div>
    <p className={CAPTION} id={reasonId}>{coreReason} Counts, canonical status, references, and replacement candidates are unavailable.</p>
  </WorkflowFrame>;
}

function UpdateReviewWorkflow({ artifact, returnFocus, onClose }: SharedLibraryWorkflowsProps) {
  const reasonId = useId();
  return <WorkflowFrame kind="update-review" title="Revision update review" description={`Review future update choices for ${artifact?.slug ?? "this artifact"} without changing pinned usages.`} returnFocus={returnFocus} onClose={onClose} actions={<><Dialog.Close asChild><button className={MODAL_ACTION_GHOST} type="button">Cancel</button></Dialog.Close><button type="button" className={`shared-workflow-primary ${MODAL_ACTION_GHOST} ${SELECTED_PILL}`} disabled aria-describedby={reasonId}>Apply usage decisions unavailable</button></>}>
    <Block label="Affected usages" tag="INVENTORY UNAVAILABLE"><p className={CAPTION}>System-derived backlinks and compatibility evidence are unavailable from this Core version, so no usage can be enumerated or classified.</p></Block>
    <Block label="Choices" tag="ALL UNAVAILABLE"><div className="shared-workflow-choices grid gap-1.25">{[
      ["Update compatible usages", "Requires backlinks plus format, dimensions, duration, and rights compatibility."],
      ["Keep current revision", "Requires the exact pinned usage inventory."],
      ["Open usage for review", "Requires a project, Unit, and Unit revision backlink."],
    ].map(([label, detail]) => <button className={`${CHOICE} bg-surface-hover text-ink [&_small]:text-muted`} type="button" disabled key={label}><span><strong>{label}</strong><small>{detail}</small></span></button>)}</div></Block>
    <p className={CAPTION} id={reasonId}>{coreReason}</p>
  </WorkflowFrame>;
}

export interface SharedLibraryWorkflowsProps {
  kind: SharedLibraryWorkflowKind;
  artifact?: SharedArtifactPresentation;
  suggestions: Availability<SharedLibrarySuggestion[]>;
  returnFocus: HTMLElement | null;
  onClose(): void;
}

export interface SharedLibrarySuggestion {
  field: string;
  value: string;
  source: string;
}

export function SharedLibraryWorkflows(props: SharedLibraryWorkflowsProps) {
  if (props.kind === "add") return <AddWorkflow {...props} />;
  if (props.kind === "promote") return <PromoteWorkflow {...props} />;
  if (props.kind === "duplicate") return <DuplicateWorkflow {...props} />;
  if (props.kind === "suggestions") return <SuggestionsWorkflow {...props} />;
  if (props.kind === "archive") return <ArchiveWorkflow {...props} />;
  return <UpdateReviewWorkflow {...props} />;
}
