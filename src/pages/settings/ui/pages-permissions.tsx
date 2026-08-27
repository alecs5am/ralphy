/**
 * What the app is allowed to do, and the shell it does it in.
 *
 * A permission is read from the platform rather than remembered: the operator may change it in
 * System Settings at any time, and a remembered "granted" would be a claim the app cannot make.
 * The risk rows are the app's own gates, which is why they are a list here and not a paragraph.
 */
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";


import {
  action,
  DesignTarget,
  Plate,
  Row,
  Section,
  SettingsSelect,
  Status,
  type StatusTone,
  Stepper,
  Toggle,
} from "./rows";
import type { SettingsContext } from "../model/context";
import {
  options,
} from "./system-rows";
import { Keycap } from "@/shared/ui/Keycap";

export type PermissionState = "granted" | "denied" | "prompt" | "unknown";

export function usePermission(name: "microphone"): PermissionState {
  const [state, setState] = useState<PermissionState>("unknown");
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const onChange = () => setState((status?.state ?? "unknown") as PermissionState);
    // Chromium answers this without prompting, so the row reports the real macOS grant.
    if (typeof navigator === "undefined" || !navigator.permissions) { setState("unknown"); return; }
    navigator.permissions.query({ name: name as PermissionName }).then((result) => {
      status = result;
      setState(result.state as PermissionState);
      result.addEventListener("change", onChange);
    }).catch(() => setState("unknown"));
    return () => status?.removeEventListener("change", onChange);
  }, [name]);
  return state;
}

const RISK_ROWS = [
  { id: "permissions.filesystem", label: "Filesystem writes outside the project", impact: "Edits outside the project folder always go through review." },
  { id: "permissions.shell", label: "Shell commands", impact: "Every command is shown before it runs." },
  { id: "permissions.network", label: "Network requests", impact: "Off means the agent works offline, apart from connected providers." },
  { id: "permissions.paid", label: "Paid generation", impact: "Every paid run is confirmed by hand." },
  { id: "permissions.publishing", label: "External publishing", impact: "Publishing outward is confirmed by a person." },
] as const;

export function PermissionsPage({ ctx }: { ctx: SettingsContext }) {
  const { values, set } = ctx.preferences;
  const microphone = usePermission("microphone");
  const notifications: string = typeof Notification === "undefined" ? "unknown" : Notification.permission;
  const micTone: StatusTone = microphone === "granted" ? "ok" : microphone === "denied" ? "bad" : "warn";
  return <>
    <Section title="DEVICE PERMISSIONS · THIS MAC">
      <Plate>
        <Row
          title="Microphone"
          description="Needed for dictation in chat. Without it the microphone control never appears."
          flash={ctx.flashId === "permissions.microphone"}
          id="permissions.microphone"
        >
          <Status tone={micTone}>{microphone === "granted" ? "GRANTED" : microphone === "denied" ? "DENIED" : microphone === "prompt" ? "NOT GRANTED" : "NOT REPORTED"}</Status>
          <button className={action()} type="button" disabled>
            Open System Settings
            <ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </Row>
        <Row title="Notifications" description="Run completion, a decision request, a missed schedule.">
          <Status tone={notifications === "granted" ? "ok" : notifications === "denied" ? "bad" : "warn"}>
            {notifications === "granted" ? "GRANTED" : notifications === "denied" ? "DENIED" : notifications === "default" ? "NOT GRANTED" : "NOT REPORTED"}
          </Status>
        </Row>
        <Row
          title="Filesystem roots granted to Ralphy"
          description="Listing and revoking granted roots needs a permission contract from the main process."
          target
        ><DesignTarget /></Row>
      </Plate>
    </Section>

    <Section title="AGENT DEFAULTS · WHAT ALWAYS NEEDS REVIEW">
      <Plate>
        <Row
          title="Approval posture for new chats"
          description="The starting rule. A provider can grant less than this, never more."
          flash={ctx.flashId === "permissions.posture"}
          id="permissions.posture"
        >
          <SettingsSelect
            label="Approval posture for new chats"
            value={values["permissions.posture"]}
            options={options(["Ask every time", "Ask for writes and shell", "Trusted project"] as const)}
            onChange={(next) => set("permissions.posture", next)}
          />
        </Row>
        {RISK_ROWS.map((risk) => <Row title={risk.label} description={risk.impact} flat key={risk.id} id={risk.id}>
          <Toggle label={risk.label} on={values[risk.id]} onChange={(next) => set(risk.id, next)} />
        </Row>)}
      </Plate>
    </Section>

    <Section title="DATA AND DIAGNOSTICS">
      <Plate>
        <Row title="Anonymous usage analytics" description="Never includes prompts, media or paths." id="permissions.analytics">
          <Toggle label="Anonymous usage analytics" on={values["permissions.analytics"]} onChange={(next) => set("permissions.analytics", next)} />
        </Row>
        <Row title="Crash reports" description="Stack and build versions, without workspace content." id="permissions.crashReports">
          <Toggle label="Crash reports" on={values["permissions.crashReports"]} onChange={(next) => set("permissions.crashReports", next)} />
        </Row>
        <Row title="Log retention" description="Local logs older than the window are removed automatically." id="permissions.logRetention">
          <SettingsSelect
            label="Log retention"
            value={values["permissions.logRetention"]}
            options={options(["7 days", "30 days", "90 days"] as const)}
            onChange={(next) => set("permissions.logRetention", next)}
          />
        </Row>
      </Plate>
    </Section>
  </>;
}

export function TerminalPage({ ctx }: { ctx: SettingsContext }) {
  const { values, set } = ctx.preferences;
  return <>
    <Section title="SHELL">
      <Plate>
        <Row
          title="Detected shell"
          description="Shell detection and its health check need a main-process probe; nothing is claimed about this machine until it lands."
          target
        ><DesignTarget /></Row>
        <Row title="Run as login shell" description="Picks up your profile — otherwise the environment is poorer than in Terminal.app." id="terminal.loginShell">
          <Toggle label="Run as login shell" on={values["terminal.loginShell"]} onChange={(next) => set("terminal.loginShell", next)} />
        </Row>
        <Row title="Start location" description="Where a new terminal session opens." id="terminal.startLocation">
          <SettingsSelect
            label="Start location"
            value={values["terminal.startLocation"]}
            options={options(["Project folder", "Library root", "Home"] as const)}
            onChange={(next) => set("terminal.startLocation", next)}
          />
        </Row>
        <Row title="Scrollback" description="Lines of history per session." id="terminal.scrollback">
          <Stepper
            label="Scrollback"
            value={values["terminal.scrollback"]}
            min={1000}
            max={50000}
            step={1000}
            onChange={(next) => set("terminal.scrollback", next)}
          />
        </Row>
      </Plate>
    </Section>

    <Section title="ENVIRONMENT">
      <Plate>
        <Row title="PATH" description="Reading the resolved PATH and the tool versions on it needs the same main-process probe." target><DesignTarget /></Row>
        <Row title="Managed variables" meta="VALUES REDACTED" description="Names and redacted values arrive with the environment probe. Editing them requires a restart." target><DesignTarget /></Row>
        <Row title="Terminal shortcuts" description="They live in the shared command registry — there is no second editor here.">
          <Keycap tokens={["⌃", "`"]} />
          <button className={action({ size: "sm" })} type="button" onClick={() => ctx.goTo("keys")}>
            Keyboard shortcuts
            <ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </Row>
      </Plate>
    </Section>
  </>;
}
