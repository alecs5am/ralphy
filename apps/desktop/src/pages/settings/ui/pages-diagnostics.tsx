/**
 * What is wrong, what version is running, and what this build is.
 *
 * Every check is a real reading -- a store that answered, a harness that reported, a permission
 * the platform granted -- so a green row means something was asked and answered. The About page
 * states the versions it can actually see, including Chromium's, read from the user agent.
 */
import { useState } from "react";
import { ArrowUpRight } from "@/shared/ui/icons";

import { bridge } from "@/shared/api/ipc";
import { RalphyMascot } from "@/shared/ui/RalphyMascot";
import {
  action,
  Dot,
  NOTE,
  Plate,
  Row,
  Section,
  Status,
  statusText,
  type StatusTone,
  WIDGET_LIGHT,
} from "./rows";
import { useDesktopSystem, diskSize } from "../model/use-desktop-system";
import type { DesktopSystemInfo } from "../../../../shared/desktop-system";
import type { SettingsContext } from "../model/context";
import { usePermission, type PermissionState } from "./pages-permissions";
import {
  FLAT_LABEL,
  FLAT_ROW,
  FLAT_VALUE,
} from "./system-rows";

interface DiagnosticCheck {
  id: string;
  label: string;
  value: string;
  state: "HEALTHY" | "NEEDS ATTENTION" | "FAILED" | "NOT REPORTED";
  tone: StatusTone;
  fix?: { label: string; run(): void };
}

export function diagnosticChecks(ctx: SettingsContext, microphone: PermissionState, system?: DesktopSystemInfo | null): readonly DiagnosticCheck[] {
  const harnesses = ctx.harnesses.rows;
  const connected = harnesses.filter(({ tone }) => tone === "ok").length;
  const notifications: string = typeof Notification === "undefined" ? "unknown" : Notification.permission;
  return [
    {
      id: "library",
      label: "Library read/write",
      value: system?.libraryError ?? (system?.libraryWritable ? "Temporary write and cleanup succeeded" : "Not checked"),
      state: system ? system.libraryWritable ? "HEALTHY" : "FAILED" : "NOT REPORTED",
      tone: system ? system.libraryWritable ? "ok" : "bad" : "off",
    },
    {
      id: "harnesses",
      label: "Agent harnesses",
      value: ctx.harnesses.state === "ready" ? `${connected} of ${harnesses.length} connected` : "bridge did not answer",
      state: ctx.harnesses.state !== "ready" ? "FAILED" : connected === harnesses.length ? "HEALTHY" : "NEEDS ATTENTION",
      tone: ctx.harnesses.state !== "ready" ? "bad" : connected === harnesses.length ? "ok" : "warn",
      fix: { label: "Open agents", run: () => ctx.goTo("agents") },
    },
    {
      id: "microphone",
      label: "Microphone permission",
      value: microphone === "unknown" ? "not reported by the platform" : `macOS reports ${microphone}`,
      state: microphone === "granted" ? "HEALTHY" : microphone === "unknown" ? "NOT REPORTED" : "NEEDS ATTENTION",
      tone: microphone === "granted" ? "ok" : microphone === "unknown" ? "off" : "warn",
      fix: { label: "Open permissions", run: () => ctx.goTo("permissions", "permissions.microphone") },
    },
    {
      id: "notifications",
      label: "Notification permission",
      value: notifications === "unknown" ? "not reported by the platform" : `browser reports ${notifications}`,
      state: notifications === "granted" ? "HEALTHY" : notifications === "unknown" ? "NOT REPORTED" : "NEEDS ATTENTION",
      tone: notifications === "granted" ? "ok" : notifications === "unknown" ? "off" : "warn",
      fix: { label: "Open permissions", run: () => ctx.goTo("permissions") },
    },
    { id: "providers", label: "Generation providers", value: "Check each service in Generation providers", state: "NOT REPORTED", tone: "off", fix: { label: "Check connections", run: () => ctx.goTo("providers") } },
    { id: "disk", label: "Disk space", value: diskSize(system?.availableBytes), state: system?.availableBytes == null ? "NOT REPORTED" : system.availableBytes < 1024 ** 3 ? "NEEDS ATTENTION" : "HEALTHY", tone: system?.availableBytes == null ? "off" : system.availableBytes < 1024 ** 3 ? "warn" : "ok" },
    { id: "cli", label: "Ralphy CLI", value: system?.versions.core ?? "No active runtime", state: system?.versions.core ? "HEALTHY" : "NOT REPORTED", tone: system?.versions.core ? "ok" : "off" },
  ];
}

export function DiagnosticsPage({ ctx }: { ctx: SettingsContext }) {
  const microphone = usePermission("microphone");
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const system = useDesktopSystem();
  const checks = diagnosticChecks(ctx, microphone, system.info);
  const rerun = async () => {
    setChecking(true);
    try {
      await Promise.all([ctx.harnesses.refresh(), system.refresh()]);
    } finally {
      setChecking(false);
    }
  };
  const summary = () => checks.map(({ label, value, state }) => `${label}: ${value} [${state}]`).join("\n");
  return <>
    <Section title="SYSTEM CHECKS" count={checks.length}>
      <Plate>
        {checks.map((check) => <div className={`${FLAT_ROW} hover:bg-row-hover`} key={check.id}>
          <Dot tone={checking ? "off" : check.tone} />
          <span className={FLAT_LABEL}>{check.label}</span>
          <span className={FLAT_VALUE}>{checking ? "…" : check.value}</span>
          <span className={statusText(checking ? "off" : check.tone)}>{checking ? "CHECKING" : check.state}</span>
          {check.fix && !checking && <button className={action({ size: "sm" })} type="button" onClick={check.fix.run}>{check.fix.label}</button>}
        </div>)}
      </Plate>
    </Section>

    <div className={`flex items-center gap-2 ${WIDGET_LIGHT} @max-settings-column/settings-main:flex-wrap`}>
      <button className={action({ size: "lg", tone: "primary" })} type="button" disabled={checking} onClick={() => void rerun()}>
        {checking ? "Checking…" : "Rerun all checks"}
      </button>
      <button
        className={action({ size: "lg" })}
        type="button"
        onClick={async () => { try { await bridge.copyText(summary()); setCopied(true); setActionError(null); } catch { setActionError("Could not copy the summary. Try again."); } }}
      >{copied ? "Copied" : "Copy redacted summary"}</button>
      <button className={action({ size: "lg" })} type="button" onClick={() => { setActionError(null); void bridge.revealDesktopFolder("logs").catch(() => setActionError("Could not open the logs folder. Try again.")); }}>Reveal logs</button>
      <p className={`${NOTE} ml-auto text-right @max-settings-column/settings-main:ml-0 @max-settings-column/settings-main:text-left`}>THE SUMMARY CARRIES NO KEYS, PROMPTS<br />OR MEDIA PATHS</p>
    </div>
    {actionError && <p className={NOTE} role="alert">{actionError}</p>}
  </>;
}

export function UpdatesPage({ ctx }: { ctx: SettingsContext }) {
  return <Section title="APPLICATION UPDATES"><Plate>
    <Row title="Installed version" description="This build is updated manually. Your library is stored separately from the application."><Status>{ctx.version}</Status></Row>
    <Row title="Get the latest release" description="Review release notes and installation instructions before replacing the application."><a className={action()} href="https://github.com/alecs5am/ralphy/releases" target="_blank" rel="noreferrer">Open releases<ArrowUpRight size={14} /></a></Row>
  </Plate></Section>;
}

/* An outbound link is a sunken pill like an action, but it is a link, not a control. */
const LINK = "inline-flex h-8 items-center gap-2 rounded-control bg-field px-3.5 type-ui text-ink no-underline hover:bg-row-hover focus-visible:outline-ink";

const CHROMIUM = /Chrome\/([\d.]+)/.exec(typeof navigator === "undefined" ? "" : navigator.userAgent)?.[1] ?? null;

export function AboutPage({ ctx }: { ctx: SettingsContext }) {
  const { info } = useDesktopSystem();
  const [copied, setCopied] = useState(false);
  const runtime: readonly [string, string][] = [
    ["Ralphy Desktop", ctx.version],
    ["Chromium", CHROMIUM ?? "not reported"],
    ["Platform", (typeof navigator === "undefined" ? "" : navigator.platform) || "not reported"],
    ["Electron", info?.versions.electron ?? "Checking…"],
    ["Node", info?.versions.node ?? "Checking…"],
    ["Ralphy CLI", info?.versions.core ?? "No active runtime"],
  ];
  return <>
    <div className="flex items-center gap-5 rounded-panel bg-instrument p-4">
      <span className="grid size-settings-mark flex-none place-items-center rounded-menu bg-frame text-on-instrument"><RalphyMascot size={46} /></span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <strong className="type-subtitle font-normal text-on-instrument">Ralphy Desktop</strong>
        <small className="font-display type-lg font-extrabold text-on-instrument-muted">{`${ctx.version} · ${CHROMIUM ? `CHROMIUM ${CHROMIUM}` : "BUILD FACTS PENDING"}`}</small>
      </span>
      <button
        className={action({ size: "lg", tone: "primary", surface: "instrument" })}
        type="button"
        onClick={async () => {
          await bridge.copyText(runtime.map(([label, value]) => `${label}: ${value}`).join("\n"));
          setCopied(true);
        }}
      >{copied ? "Copied" : "Copy version info"}</button>
    </div>

    <Section title="RUNTIME">
      <Plate>
        {runtime.map(([label, value]) => <div className={`${FLAT_ROW} hover:bg-row-hover`} key={label}>
          <span className={FLAT_LABEL}>{label}</span>
          <span className={FLAT_VALUE}>{value}</span>
        </div>)}
      </Plate>
    </Section>

    <Section title="OPEN SOURCE">
      <div className={`flex flex-wrap gap-2 ${WIDGET_LIGHT}`}>
        <a className={LINK} href="https://github.com/alecs5am/ralphy" target="_blank" rel="noreferrer">
          Repository
          <ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" />
        </a>
        <a className={LINK} href="https://github.com/alecs5am/ralphy-docs" target="_blank" rel="noreferrer">
          Documentation
          <ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" />
        </a>
      </div>
    </Section>
  </>;
}
