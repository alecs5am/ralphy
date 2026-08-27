/**
 * The three pages about the operator rather than the machine: what the app does by default, who
 * they are, and how it looks.
 *
 * Appearance states the system's own value beside every override, because a preference the app
 * inherits is not a preference the app owns -- an operator who set "match system" should be able
 * to see what the system currently says.
 */
import { useEffect, useMemo, useState } from "react";
import { FolderOpen } from "lucide-react";

import { ProfileAvatar } from "@/shared/ui/ProfileAvatar";
import type { SettingsContext } from "../model/context";
import {
  DesignTarget,
  FIELD,
  MONO,
  NOTE_ALERT,
  NUMBER,
  Plate,
  Row,
  Section,
  Segmented,
  SettingsSelect,
  Status,
  Toggle,
  action,
} from "./rows";

/** System values the app inherits rather than owns; shown next to the override. Hosts
 *  without media queries (geometry harnesses) report false rather than throwing. */
function useSystemPreference(query: string): boolean {
  const media = useMemo(
    () => typeof window.matchMedia === "function" ? window.matchMedia(query) : null,
    [query],
  );
  const [matches, setMatches] = useState(media?.matches ?? false);
  useEffect(() => {
    if (!media) return;
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener("change", onChange);
    setMatches(media.matches);
    return () => media.removeEventListener("change", onChange);
  }, [media]);
  return matches;
}

const options = <Value extends string>(values: readonly Value[]) => values.map((value) => ({ value, label: value }));

export function GeneralPage({ ctx }: { ctx: SettingsContext }) {
  const { values, failures, set, retry } = ctx.preferences;
  return <>
    <Section title="APPLICATION BEHAVIOUR">
      <Plate>
        <Row title="Landing destination" description="Where the window opens when the last context cannot be restored." id="general.landing">
          <SettingsSelect
            label="Landing destination"
            value={values["general.landing"]}
            options={options(["Workspace overview", "Last project", "Media", "Calendar"] as const)}
            onChange={(next) => set("general.landing", next)}
          />
        </Row>
        <Row
          title="Reveal generated media"
          description="Bring newly generated files into the active project view."
          tall={failures["general.reveal"] !== undefined}
          flash={ctx.flashId === "general.reveal"}
          id="general.reveal"
        >
          <Toggle label="Reveal generated media" on={values["general.reveal"]} onChange={(next) => set("general.reveal", next)} />
        </Row>
        {failures["general.reveal"] !== undefined && <div className="mt-1.25 flex items-center gap-3">
          <p className={NOTE_ALERT}>NOT SAVED · PREFERENCE WRITE FAILED · VALUE UNCHANGED</p>
          <button
            className="inline-flex h-6 flex-none items-center gap-2 rounded-control bg-field px-2.75 font-code type-mono-xs tracking-status text-ink hover:bg-row-hover focus-visible:outline-ink"
            type="button"
            onClick={() => retry("general.reveal")}
          >RETRY</button>
        </div>}
        <Row
          title="Prevent sleep while working"
          meta="THIS MAC"
          description="Keep the machine awake while a local run or render is in flight."
          flash={ctx.flashId === "general.preventSleep"}
          id="general.preventSleep"
        >
          <Toggle label="Prevent sleep while working" on={values["general.preventSleep"]} onChange={(next) => set("general.preventSleep", next)} />
        </Row>
        <Row title="Keep Ralphy in the menu bar" description="A status icon and quick access to active runs." id="general.menuBar">
          <Toggle label="Keep Ralphy in the menu bar" on={values["general.menuBar"]} onChange={(next) => set("general.menuBar", next)} />
        </Row>
        <Row title="Send shortcut in agent chat" description="The same command registry as the shortcuts page." id="general.sendShortcut">
          <Segmented
            label="Send shortcut in agent chat"
            value={values["general.sendShortcut"]}
            options={["Enter", "⌘↩"] as const}
            onChange={(next) => set("general.sendShortcut", next)}
          />
        </Row>
        <Row title="Language" meta="REQUIRES RESTART" description="A language change applies after the app restarts." id="general.language">
          <SettingsSelect
            label="Language"
            value={values["general.language"]}
            options={options(["System", "English", "Русский"] as const)}
            onChange={(next) => set("general.language", next)}
          />
        </Row>
        <Row
          title="Restore last workspace and project"
          description="Needs a persisted session contract. The build has no control for it, so no dead switch is drawn."
          target
        ><DesignTarget /></Row>
      </Plate>
    </Section>

    <Section title="LIBRARY">
      <Plate>
        <Row
          title={<>Home Ralphy library<Status>AUTOMATIC · WRITABLE</Status></>}
          description={<>
            <span className={MONO}>{ctx.libraryPath ?? "~/Library/Application Support/Ralphy"}</span>
            <br />
            The app picks this path. Moving it is a verified migration, not a text field.
          </>}
          tall
          flash={ctx.flashId === "general.library"}
          id="general.library"
        >
          <button className={action({ round: true })} type="button" aria-label="Reveal the library folder" disabled>
            <FolderOpen size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button className={action({ size: "sm" })} type="button" onClick={() => ctx.goTo("storage")}>Move library…</button>
        </Row>
      </Plate>
    </Section>

    <Section title="DEFAULTS">
      <Plate>
        <Row title="Open unsupported files with" description="When Ralphy cannot present a file itself." id="general.openWith">
          <SettingsSelect
            label="Open unsupported files with"
            value={values["general.openWith"]}
            options={options(["System default", "QuickTime Player", "Choose app…"] as const)}
            onChange={(next) => set("general.openWith", next)}
          />
        </Row>
        <Row title="Completed background work" description="Open the result straight away, or only notify." id="general.background">
          <Segmented
            label="Completed background work"
            value={values["general.background"]}
            options={["Open result", "Notify only"] as const}
            onChange={(next) => set("general.background", next)}
          />
        </Row>
      </Plate>
    </Section>
  </>;
}

export function ProfilePage({ ctx }: { ctx: SettingsContext }) {
  const { values, set } = ctx.preferences;
  return <Section title="LOCAL PROFILE">
    <Plate>
      <Row title="Avatar" description="PNG or JPG, at least 128 px. Stored next to the profile on this Mac." flat>
        <span className="grid size-settings-avatar flex-none place-items-center overflow-hidden rounded-control bg-field font-code type-md text-muted"><ProfileAvatar rootPath={ctx.libraryPath ?? ""} size={56} round /></span>
        <button className={action({ size: "sm" })} type="button" disabled>Choose file…</button>
      </Row>
      <Row title="Display name" description="Shown in chat, review and version history." id="profile.displayName">
        <input
          className={FIELD}
          value={values["profile.displayName"]}
          placeholder="Not set"
          aria-label="Display name"
          onChange={(event) => set("profile.displayName", event.target.value)}
        />
      </Row>
      <Row title="Preferred name for agents" description="How an agent addresses you in replies. Optional." id="profile.preferredName">
        <input
          className={FIELD}
          value={values["profile.preferredName"]}
          placeholder="Not set"
          aria-label="Preferred name for agents"
          onChange={(event) => set("profile.preferredName", event.target.value)}
        />
      </Row>
    </Plate>
  </Section>;
}

const MEDIA_COLUMN_STEPS = [3, 4, 5, 6, 7] as const;

export function AppearancePage({ ctx }: { ctx: SettingsContext }) {
  const { values, set } = ctx.preferences;
  const systemContrast = useSystemPreference("(prefers-contrast: more)");
  const systemMotion = useSystemPreference("(prefers-reduced-motion: reduce)");
  const columns = values["appearance.mediaColumns"];
  return <>
    <Section title="THEME">
      <Plate>
        <Row title="Appearance" description="Applies immediately, without a restart." id="appearance.theme">
          <Segmented
            label="Theme"
            value={ctx.theme === "system" ? "System" : ctx.theme === "dark" ? "Dark" : "Light"}
            options={["System", "Dark", "Light"] as const}
            onChange={(next) => ctx.onThemeChange(next === "System" ? "system" : next === "Dark" ? "dark" : "light")}
          />
        </Row>
        <Row
          title="Increase contrast"
          meta={`SYSTEM: ${systemContrast ? "ON" : "OFF"}`}
          description="Inherited from macOS by default. The switch overrides the system value."
          id="appearance.contrast"
        >
          <Toggle label="Increase contrast" on={values["appearance.contrast"]} onChange={(next) => set("appearance.contrast", next)} />
        </Row>
      </Plate>
    </Section>

    <Section title="LAYOUT">
      <Plate>
        <Row title="Interface density" description="Row height and list density across the app." id="appearance.density">
          <Segmented
            label="Interface density"
            value={values["appearance.density"]}
            options={["Compact", "Comfortable"] as const}
            onChange={(next) => set("appearance.density", next)}
          />
        </Row>
        <Row title="Media grid" description="Columns in the mosaic at 1440. The default for new projects." id="appearance.mediaColumns">
          <div className="flex flex-none items-center gap-2.75">
            <b className={NUMBER}>{columns}</b>
            <span className="flex gap-0.75" role="group" aria-label="Media grid columns">
              {MEDIA_COLUMN_STEPS.map((step) => <button
                className={`w-settings-tick h-settings-step rounded-control focus-visible:outline-ink ${step <= columns ? "bg-ink" : "bg-unreviewed"}`}
                type="button"
                key={step}
                aria-label={`${step} columns`}
                aria-pressed={step === columns}
                onClick={() => set("appearance.mediaColumns", step)}
              />)}
            </span>
          </div>
        </Row>
        <Row title="Restore panels on launch" description="Sidebar width, chat and the review console, as you left them." id="appearance.restorePanels">
          <Toggle label="Restore panels on launch" on={values["appearance.restorePanels"]} onChange={(next) => set("appearance.restorePanels", next)} />
        </Row>
      </Plate>
    </Section>

    <Section title="MOTION">
      <Plate>
        <Row
          title="Interface motion"
          meta={`SYSTEM: ${systemMotion ? "REDUCED" : "OFF"}`}
          description="Panels, popovers and page transitions. macOS Reduce Motion switches everything off regardless."
          id="appearance.motion"
        >
          <Toggle label="Interface motion" on={values["appearance.motion"] && !systemMotion} onChange={(next) => set("appearance.motion", next)} />
        </Row>
        <Row title="Animated previews" description="Video and GIF playback in the media grid." id="appearance.previews">
          <Segmented
            label="Animated previews"
            value={values["appearance.previews"]}
            options={["On hover", "Always", "Never"] as const}
            onChange={(next) => set("appearance.previews", next)}
          />
        </Row>
      </Plate>
    </Section>
  </>;
}

/* A conflict widget is a black widget, so its rows keep the on-instrument ink. */
