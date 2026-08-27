import { CheckCircle2, CircleAlert, Download, LoaderCircle } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { InstrumentOverlay } from "@/shared/instrument/overlay-registry";
import type { CatalogResult } from "@/shared/api/ipc";
import type { WorkbenchRoute } from "@/shared/model/workbench";
import { LIBRARY_COPY, LIBRARY_MONO, LIBRARY_ROUTE, LIBRARY_TITLE, LIBRARY_UNAVAILABLE } from "../lib/detail-chrome";
import { MODAL_ACTION_GHOST } from "@/shared/ui/Modal";
import { WINDOW_BODY, WINDOW_TITLEBAR, WindowClose } from "@/shared/ui/Window";

/* The workflow's contents. The registry's managed surface is the window -- one panel rim, one
   card -- so this route states neither: it fills that surface and hands it a titlebar and a card.
   Where the surface sits is the one thing this route cannot say in markup, because the registry
   renders that element and takes no class from here. */
const SHELL = "marketplace-workflow-window flex min-h-0 flex-1 flex-col text-ink";
const SHELL_HEADER = `marketplace-workflow-header ${WINDOW_TITLEBAR}`;
const SHELL_CARD = `marketplace-workflow-card ${WINDOW_BODY}`;
const SHELL_BODY = "marketplace-workflow-body flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto overscroll-contain px-4.5 pt-3 pb-4";
const SHELL_FOOTER = "marketplace-workflow-footer flex min-h-16.5 flex-none items-center gap-4 px-4.5 pt-3 pb-4";

/* A field block inside a workflow: a mono caps label over a source-backed reason. */
const FIELD_BLOCK = "grid min-w-0 gap-1.75 rounded-cell bg-surface-sunken p-3";
const FIELD_LABEL = "m-0 font-mono type-meta uppercase tracking-block text-muted";
const FIELD_REASON = "m-0 type-xs leading-copy text-muted wrap-anywhere";
/* Two fields side by side on a wide content row. The overlay copy has no content-row
   container above it, so the variant is inert there and the pair stays side by side --
   which is what the stylesheet's own @container main-region rule did. */
const FIELD_GRID = "grid grid-cols-2 gap-1.75 @max-marketplace-split/main-region:grid-cols-1";
const OPTION = "flex min-h-12 flex-col items-start gap-0.75 rounded-cell px-2.5 py-2 text-left";
const TARGET_OPTION = `${OPTION} bg-surface text-ink aria-pressed:bg-instrument aria-pressed:text-on-instrument aria-disabled:text-muted`;
const CHOICE_OPTION = `${OPTION} bg-surface text-muted`;
const OPTION_NOTE = "type-xs leading-snug text-inherit";

/* A download job row and the state note it ends in. */
const JOB_ROW = "grid min-h-15 grid-cols-(--marketplace-download-columns) items-center gap-2.75 rounded-cell bg-surface px-3 py-2.5 @max-marketplace-split/main-region:grid-cols-(--marketplace-row-columns-narrow)";
const JOB_NOTE = "type-xs not-italic text-muted wrap-anywhere";
const JOB_TRAILING = "@max-marketplace-split/main-region:col-start-2";

export type MarketplaceWorkflowKind =
  | "model-download"
  | "template-target"
  | "recipe-target"
  | "prompt-use"
  | "component-target"
  | "skill-install"
  | "update-conflict";

export interface MarketplaceProjectTargetOption {
  id: string;
  workspaceId: string;
  projectId: string;
  kind: "project";
  label: string;
  contextLabel: string;
  current: boolean;
  compatible: true;
  compatibilityBasis: "project-target";
}

export interface MarketplaceUnavailableTargetScope {
  kind: "chat" | "agent" | "computer";
  label: string;
  reason: string;
}

export interface MarketplaceWorkflowTargets {
  workflow: MarketplaceWorkflowKind;
  projectOptions: MarketplaceProjectTargetOption[];
  unavailableScopes: MarketplaceUnavailableTargetScope[];
  contextProjectLabel: string | null;
  targetUnavailableReason: string | null;
}

export function marketplaceTargets(
  catalog: CatalogResult | null,
  current: WorkbenchRoute,
  kind: MarketplaceWorkflowKind,
): MarketplaceWorkflowTargets {
  const workspaceNames = new Map((catalog?.workspaces ?? []).map((workspace) => [workspace.id, workspace.name]));
  const namedProjects = (catalog?.projects ?? []).flatMap((project) => {
    const workspaceName = workspaceNames.get(project.workspaceId);
    return workspaceName ? [{
      id: `project:${project.workspaceId}:${project.projectId}`,
      workspaceId: project.workspaceId,
      projectId: project.projectId,
      kind: "project" as const,
      label: project.name,
      contextLabel: `${workspaceName} / ${project.name}`,
      current: current.kind === "project" && current.workspaceId === project.workspaceId && current.projectId === project.projectId,
      compatible: true as const,
      compatibilityBasis: "project-target" as const,
    }] : [];
  });
  const currentProject = current.kind === "project"
    ? namedProjects.find(({ workspaceId, projectId }) => workspaceId === current.workspaceId && projectId === current.projectId)?.contextLabel ?? null
    : null;

  if (kind === "template-target" || kind === "recipe-target" || kind === "component-target") {
    return {
      workflow: kind,
      projectOptions: namedProjects,
      unavailableScopes: [],
      contextProjectLabel: null,
      targetUnavailableReason: namedProjects.length ? null : "No named project targets are available",
    };
  }
  if (kind === "model-download") return {
    workflow: kind,
    projectOptions: [],
    unavailableScopes: [{
      kind: "computer",
      label: "Computer/runtime",
      reason: "Computer and runtime targets cannot be enumerated by the current Desktop contract",
    }],
    contextProjectLabel: null,
    targetUnavailableReason: null,
  };
  if (kind === "prompt-use") return {
    workflow: kind,
    projectOptions: [],
    unavailableScopes: [{
      kind: "chat",
      label: "Chat",
      reason: "Chat targets cannot be enumerated or attached by the current Desktop contract",
    }],
    contextProjectLabel: null,
    targetUnavailableReason: null,
  };
  if (kind === "skill-install") return {
    workflow: kind,
    projectOptions: [],
    unavailableScopes: [{
      kind: "agent",
      label: "Agent",
      reason: "Agent targets and installation scopes cannot be enumerated by the current Desktop contract",
    }],
    contextProjectLabel: currentProject,
    targetUnavailableReason: null,
  };
  return {
    workflow: kind,
    projectOptions: [],
    unavailableScopes: [],
    contextProjectLabel: null,
    targetUnavailableReason: "Update target is unavailable without persistent installed-version and local-modification state",
  };
}

function TargetList({ targets }: { targets: MarketplaceWorkflowTargets }) {
  const [selected, setSelected] = useState(() => targets.projectOptions.find(({ current }) => current)?.id ?? null);
  return <section className={`marketplace-target-list ${FIELD_BLOCK}`} aria-labelledby="marketplace-target-list-title">
    <h3 className={FIELD_LABEL} id="marketplace-target-list-title">Target</h3>
    {targets.contextProjectLabel && <p className={FIELD_REASON}>Current project context · {targets.contextProjectLabel}</p>}
    {targets.projectOptions.length > 0 && <div className="grid gap-1.25" role="group" aria-label="Named project targets">
      {targets.projectOptions.map((option) => <button
        className={TARGET_OPTION}
        key={option.id}
        type="button"
        aria-pressed={selected === option.id}
        onClick={() => setSelected(option.id)}
      ><span>Project · {option.contextLabel}</span><small className={OPTION_NOTE}>{option.current ? "Current project · project target" : "Project target"}</small></button>)}
    </div>}
    {targets.unavailableScopes.map((scope) => <button
      className={TARGET_OPTION}
      key={scope.kind}
      type="button"
      aria-disabled="true"
      aria-describedby={`marketplace-${targets.workflow}-${scope.kind}-reason`}
    ><span>{scope.label}</span><small className={OPTION_NOTE} id={`marketplace-${targets.workflow}-${scope.kind}-reason`}>{scope.reason}</small></button>)}
    {targets.targetUnavailableReason && <p className={FIELD_REASON} role="status">{targets.targetUnavailableReason}</p>}
  </section>;
}

interface WorkflowFrameProps {
  kind: MarketplaceWorkflowKind;
  title: string;
  description: string;
  onCancel(): void;
  children: ReactNode;
  finalLabel: string;
  finalReason: string;
}

function WorkflowContents({ kind, title, description, onCancel, children, finalLabel, finalReason }: WorkflowFrameProps) {
  return <div className={SHELL} data-workflow={kind}>
    <header className={SHELL_HEADER}><h2 className="m-0 min-w-0 flex-1 truncate type-xl font-normal">{title}</h2><WindowClose label={`Close ${title}`} onClick={onCancel} /></header>
    <div className={SHELL_CARD}>
    <div className={SHELL_BODY}><p className="m-0 flex-none type-sm leading-copy text-muted">{description}</p>{children}</div>
    <i className="mx-4.5 h-px flex-none bg-divider" aria-hidden="true" />
    <footer className={SHELL_FOOTER}><small className="m-0 flex-1 font-mono type-xs leading-copy text-muted wrap-anywhere" id="marketplace-workflow-final-reason">{finalReason} The final action is disabled.</small><button className={MODAL_ACTION_GHOST} type="button" aria-disabled="true" aria-describedby="marketplace-workflow-final-reason">{finalLabel}</button></footer>
    </div>
  </div>;
}

function WorkflowFrame(props: WorkflowFrameProps) {
  const opener = useRef(typeof document === "undefined" ? null : document.activeElement as HTMLElement | null);
  if (typeof document === "undefined") return <WorkflowContents {...props} />;
  return <InstrumentOverlay
    id="target-chooser"
    open
    label={props.title}
    description={props.description}
    opener={opener.current}
    onOpenChange={(open) => { if (!open) props.onCancel(); }}
  ><WorkflowContents {...props} /></InstrumentOverlay>;
}

export interface MarketplaceTargetChooserProps {
  targets: MarketplaceWorkflowTargets;
  onCancel(): void;
}

export function MarketplaceTargetChooser({ targets, onCancel }: MarketplaceTargetChooserProps) {
  return <WorkflowFrame
    kind={targets.workflow}
    title="Choose a target"
    description="Only targets returned by the current Desktop catalog are shown. Nothing is changed by this review."
    onCancel={onCancel}
    finalLabel="Continue unavailable"
    finalReason="A final action plan is unavailable from the current contract."
  ><TargetList targets={targets} /></WorkflowFrame>;
}

function ReviewField({ label, children }: { label: string; children: string }) {
  return <section className={`marketplace-review-field ${FIELD_BLOCK}`}><h3 className={FIELD_LABEL}>{label}</h3><p className={FIELD_REASON}>{children}</p></section>;
}

function ReviewFields({ kind }: { kind: MarketplaceWorkflowKind }) {
  if (kind === "model-download") return <>
    <ReviewField label="Compatibility preflight">Machine fit remains the evidence shown on the Model detail; no new compatibility claim is made here.</ReviewField>
    <ReviewField label="License and access">Provider license and access evidence must be reviewed before any package can be fetched.</ReviewField>
    <ReviewField label="Download plan">Files, destination, expected bytes, checksum, and resumable job state are unavailable.</ReviewField>
    <ReviewField label="Runtime installation">Runtime registration is unavailable without a download and installation contract.</ReviewField>
    <ReviewField label="Load test">A successful runtime load test is required before Installed can be claimed.</ReviewField>
  </>;
  if (kind === "template-target") return <>
    <ReviewField label="Project target">Only a named project target can be selected.</ReviewField>
    <ReviewField label="Pinned version">Version evidence is unavailable from public-library schema 1.</ReviewField>
    <ReviewField label="What will be added">Scene structure, files, references, and conflicts require a Core mutation plan.</ReviewField>
  </>;
  if (kind === "recipe-target") return <>
    <ReviewField label="Project target">Only a named project target can be selected.</ReviewField>
    <ReviewField label="Artifact and parameters">The exact source artifact remains inert until a conflict-safe apply plan exists.</ReviewField>
    <ReviewField label="Apply plan">Files, Unit changes, tools, costs, and conflicts are unavailable without a Core mutation contract.</ReviewField>
  </>;
  if (kind === "prompt-use") return <>
    <ReviewField label="Chat target">Chat targets cannot be enumerated by the current Desktop contract.</ReviewField>
    <ReviewField label="Prompt body and variables">No production Prompt record or variables are available without a Prompt catalog contract.</ReviewField>
  </>;
  if (kind === "component-target") return <>
    <ReviewField label="Project target">Only a named project target can be selected.</ReviewField>
    <ReviewField label="Package files">A Component manifest and file plan are unavailable.</ReviewField>
    <ReviewField label="Dependencies">Runtime and package dependencies require a Component manifest contract.</ReviewField>
    <ReviewField label="Controls and accessibility">Control and accessibility evidence are unavailable without reviewed Component contracts.</ReviewField>
  </>;
  if (kind === "skill-install") return <>
    <ReviewField label="Bundle">Bundle membership and version pins are unavailable without a Skill manifest contract.</ReviewField>
    <ReviewField label="Agent target">Agent targets cannot be enumerated by the current Desktop contract.</ReviewField>
    <ReviewField label="Scope">User and project installation scopes are unavailable.</ReviewField>
    <ReviewField label="Installation mode">Copy or symlink behavior is unavailable.</ReviewField>
    <ReviewField label="Files">SKILL.md, references/, scripts/, and supporting files require a bundle manifest.</ReviewField>
    <ReviewField label="Tools and shell">Declared tools and shell access require a permission manifest.</ReviewField>
    <ReviewField label="Network">Allowed hosts and network use require a permission manifest.</ReviewField>
    <ReviewField label="Credentials">Credential names and access boundaries require a permission manifest.</ReviewField>
  </>;
  return <>
    <ReviewField label="Current version">Current installed version is unavailable without persistent installed-version state.</ReviewField>
    <ReviewField label="Proposed version">Proposed version and change history are unavailable without a persistent update contract.</ReviewField>
    <ReviewField label="Local modifications">Local modification evidence is unavailable without persistent hash and modification state.</ReviewField>
    <div className="marketplace-update-choices col-span-full grid gap-1.25" role="group" aria-label="Unavailable conflict choices">
      {[["Keep current", "Keep the current pinned version"], ["Fork local", "Preserve local changes as a derivative"], ["Replace local", "Replace only after explicit confirmation"]].map(([label, note]) => <button className={CHOICE_OPTION} key={label} type="button" aria-disabled="true"><span>{label}</span><small className={FIELD_REASON}>{note} · unavailable</small></button>)}
    </div>
  </>;
}

function reviewCopy(kind: MarketplaceWorkflowKind) {
  if (kind === "model-download") return ["Model download and install review", "Review machine evidence before any download or runtime change.", "Download unavailable", "Download and installation are unavailable without persistent jobs and a guarded install contract."] as const;
  if (kind === "template-target") return ["Template project review", "Review the named project and proposed Template changes.", "Start project unavailable", "Adding is unavailable without a Core mutation contract."] as const;
  if (kind === "recipe-target") return ["Recipe apply review", "Review the named project and exact Recipe artifact before applying.", "Apply unavailable", "Applying is unavailable without a Core mutation contract."] as const;
  if (kind === "prompt-use") return ["Prompt use-in-chat review", "Review the Prompt and named Chat target without executing it.", "Use in chat unavailable", "Use in chat is unavailable without target enumeration and attachment contracts."] as const;
  if (kind === "component-target") return ["Component project review", "Review the named project, package, dependencies, and controls.", "Add component unavailable", "Adding is unavailable without a Core mutation contract."] as const;
  if (kind === "skill-install") return ["Skill install review", "Previewing a Skill never executes it; review the full security boundary.", "Install unavailable", "Installation is unavailable without agent targets, bundle manifests, permissions, and installation contracts."] as const;
  return ["Update and conflict review", "Review version and local-modification evidence before choosing a resolution.", "Update unavailable", "Update resolution is unavailable without persistent installed-version and local-modification state."] as const;
}

export interface MarketplaceActionReviewProps {
  kind: MarketplaceWorkflowKind;
  targets: MarketplaceWorkflowTargets;
  itemLabel: string | null;
  onCancel(): void;
}

export function MarketplaceActionReview({ kind, targets, itemLabel, onCancel }: MarketplaceActionReviewProps) {
  const [title, description, finalLabel, finalReason] = reviewCopy(kind);
  return <WorkflowFrame kind={kind} title={itemLabel ? `${title} · ${itemLabel}` : title} description={description} onCancel={onCancel} finalLabel={finalLabel} finalReason={finalReason}>
    <TargetList targets={targets} />
    <div className={`marketplace-review-fields ${FIELD_GRID}`}><ReviewFields kind={kind} /></div>
    <p className="marketplace-review-save-state m-0 rounded-cell bg-instrument px-3 py-2.5 type-xs leading-copy text-on-instrument-muted wrap-anywhere">Saving is unavailable without a persistent saved-state contract.</p>
  </WorkflowFrame>;
}

export type MarketplaceDownloadPresentation =
  | { availability: "unavailable"; reason: string }
  | { availability: "ready"; jobs: { id: string; label: string; state: "active" | "failed" | "completed"; progress: number | null; nextAction: string }[] };

const downloadGroups = [
  ["active", "Active"],
  ["failed", "Needs attention"],
  ["completed", "Completed"],
] as const;

export function MarketplaceDownloads({ presentation }: { presentation: MarketplaceDownloadPresentation }) {
  if (presentation.availability === "unavailable") return <section className={`marketplace-library-unavailable ${LIBRARY_UNAVAILABLE}`} role="status"><Download className="w-5 text-alert" aria-hidden="true" /><h2 className={LIBRARY_TITLE}>Downloads</h2><p className="m-0 flex items-center gap-2 type-sm leading-copy text-muted">{presentation.reason}</p><small className={LIBRARY_MONO}>No zero count is inferred.</small></section>;
  return <section className={`marketplace-downloads ${LIBRARY_ROUTE}`} aria-labelledby="marketplace-downloads-title">
    <h2 className={LIBRARY_TITLE} id="marketplace-downloads-title">Downloads</h2>
    {downloadGroups.map(([state, label]) => {
      const jobs = presentation.jobs.filter((job) => job.state === state);
      return <section className="grid gap-1.75" key={state} aria-labelledby={`marketplace-download-${state}`}><h3 className={FIELD_LABEL} id={`marketplace-download-${state}`}>{label}</h3>
        {jobs.length === 0 ? <p className={LIBRARY_COPY}>No jobs in this supplied presentation.</p> : <ul className="m-0 grid list-none gap-1.5 p-0" role="list">{jobs.map((job) => <li className={JOB_ROW} key={job.id}>
          {job.state === "active" ? <LoaderCircle className="w-4" aria-hidden="true" /> : job.state === "failed" ? <CircleAlert className="w-4" aria-hidden="true" /> : <CheckCircle2 className="w-4" aria-hidden="true" />}
          <span className="flex min-w-0 flex-col gap-0.75"><strong>{job.label}</strong><small className={JOB_NOTE}>{job.nextAction}</small></span>
          {job.progress === null ? <em className={`${JOB_NOTE} ${JOB_TRAILING}`}>Progress unavailable</em> : <progress className={`w-full accent-ink ${JOB_TRAILING}`} max={100} value={Math.max(0, Math.min(100, job.progress))} aria-label={`${job.label} download progress: ${job.progress}%`}>{job.progress}%</progress>}
        </li>)}</ul>}
      </section>;
    })}
  </section>;
}

export function MarketplaceUpdateConflictReview() {
  return <section className={`marketplace-update-review ${LIBRARY_ROUTE}`} aria-labelledby="marketplace-update-review-title">
    <h2 className={LIBRARY_TITLE} id="marketplace-update-review-title">Update and conflict review</h2>
    <p className={LIBRARY_COPY}>Update target is unavailable without persistent installed-version and local-modification state.</p>
    <div className={`marketplace-review-fields w-full max-w-195 ${FIELD_GRID}`}><ReviewFields kind="update-conflict" /></div>
    <p className={LIBRARY_COPY}>Update resolution is unavailable without persistent installed-version and local-modification state. The final action is disabled.</p>
  </section>;
}
