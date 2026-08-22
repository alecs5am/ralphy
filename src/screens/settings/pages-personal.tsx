import { ArrowUpRight, FolderOpen, RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ProfileAvatar } from "../../components/ProfileAvatar";
import type { SettingsContext } from "./context";
import {
  chordFromEvent,
  chordTokens,
  conflictingCommand,
  effectiveChord,
  modifiersOf,
  SETTINGS_COMMANDS,
  type Chord,
  type SettingsCommand,
} from "./commands";
import {
  action,
  DesignTarget,
  Dot,
  FIELD,
  keycap,
  Keycaps,
  META,
  MONO,
  NOTE_ALERT,
  NUMBER,
  Plate,
  Row,
  ROW_COPY,
  ROW_TITLE,
  Section,
  Segmented,
  SettingsSelect,
  Status,
  Stepper,
  Toggle,
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
            className="inline-flex h-6 flex-none items-center gap-2 rounded-control bg-surface-sunken px-2.75 font-code type-mono-xs tracking-status text-ink hover:bg-surface-hover focus-visible:outline-ink"
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
        <span className="grid size-settings-avatar flex-none place-items-center overflow-hidden rounded-control bg-surface-sunken font-code type-md text-muted"><ProfileAvatar rootPath={ctx.libraryPath ?? ""} size={56} round /></span>
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
const CONFLICT_ROW = "flex h-control-lg items-center gap-3 rounded-control px-3";
const CONFLICT_SCOPE = "font-code type-mono-xs tracking-caps text-on-instrument-muted-decorative";

interface RecordingState {
  commandId: string;
  captured: Chord | null;
  modifiers: string[];
}

interface ConflictState {
  command: SettingsCommand;
  other: SettingsCommand;
  chord: Chord;
}

export function KeyboardPage({ ctx }: { ctx: SettingsContext }) {
  const [query, setQuery] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const [recording, setRecording] = useState<RecordingState | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const changed = Object.keys(ctx.bindings).length;

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setRecording(null); return; }
      event.preventDefault();
      const captured = chordFromEvent(event);
      setRecording((current) => current && { ...current, captured, modifiers: modifiersOf(event) });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [recording]);

  const commit = (command: SettingsCommand, chord: Chord) => {
    ctx.setBindings({ ...ctx.bindings, [command.id]: chord });
    setRecording(null);
    setConflict(null);
  };

  const save = (command: SettingsCommand) => {
    const captured = recording?.captured;
    if (!captured) return;
    const other = conflictingCommand(command, captured, ctx.bindings);
    if (other) { setConflict({ command, other, chord: captured }); return; }
    commit(command, captured);
  };

  const reset = (command: SettingsCommand) => {
    ctx.setBindings(Object.fromEntries(Object.entries(ctx.bindings).filter(([id]) => id !== command.id)));
  };

  const needle = query.trim().toLocaleLowerCase();
  const visible = SETTINGS_COMMANDS.filter((command) => {
    if (changedOnly && !(command.id in ctx.bindings)) return false;
    return !needle || `${command.name} ${command.group} ${command.scope}`.toLocaleLowerCase().includes(needle);
  });
  const groups = [...new Set(visible.map(({ group }) => group))];

  return <>
    {conflict && <div className="flex flex-col gap-3.25 rounded-panel bg-instrument p-4 [corner-shape:squircle]">
      <h2 className="m-0 flex items-center gap-2.25 font-code type-mono-sm font-normal tracking-mono text-on-instrument">
        <Dot tone="warn" surface="instrument" />SHORTCUT ALREADY IN USE
      </h2>
      <div className="flex flex-col gap-0.5">
        <div className={`${CONFLICT_ROW} bg-instrument-raised`}>
          <span className="flex-1 type-ui text-on-instrument">{conflict.command.name}</span>
          <small className={CONFLICT_SCOPE}>{conflict.command.scope.toLocaleUpperCase()}</small>
          <Keycaps tokens={chordTokens(conflict.chord)} tone="inverse" />
        </div>
        <div className={CONFLICT_ROW}>
          <span className="flex-1 type-ui text-on-instrument-muted">{conflict.other.name}</span>
          <small className={CONFLICT_SCOPE}>{conflict.other.scope.toLocaleUpperCase()}</small>
          <Keycaps tokens={chordTokens(conflict.chord)} tone="sunken" />
        </div>
      </div>
      <p className="m-0 font-code type-mono-xs tracking-caps leading-note text-on-instrument-muted-decorative">{`SCOPES ${conflict.command.scope.toLocaleUpperCase()} AND ${conflict.other.scope.toLocaleUpperCase()} CAN BE LIVE AT ONCE — UNBINDING THE OTHER COMMAND SILENTLY IS NOT AN OPTION`}</p>
      <div className="flex items-center gap-2 @max-settings-column/settings-main:flex-wrap">
        <button
          className={action({ size: "lg", tone: "primary", surface: "instrument" })}
          type="button"
          onClick={() => {
            ctx.setBindings({
              ...ctx.bindings,
              [conflict.command.id]: conflict.chord,
              [conflict.other.id]: { meta: false, ctrl: false, alt: false, shift: false, key: "" },
            });
            setRecording(null);
            setConflict(null);
          }}
        >Replace existing</button>
        <button
          className={action({ size: "lg", surface: "instrument" })}
          type="button"
          onClick={() => { setRecording({ commandId: conflict.command.id, captured: null, modifiers: [] }); setConflict(null); }}
        >Choose another</button>
        <button className={action({ size: "lg", tone: "quiet", surface: "instrument" })} type="button" onClick={() => { setConflict(null); setRecording(null); }}>Cancel</button>
      </div>
    </div>}

    <div className="flex flex-none items-center gap-2 @max-settings-column/settings-main:flex-wrap">
      <label className="flex h-control-lg min-w-0 flex-1 items-center gap-2.25 rounded-control bg-surface px-3.25 text-muted-decorative focus-within:outline-ink focus-within:outline-offset-2">
        <Search size={13} strokeWidth={1.9} aria-hidden="true" />
        <input
          className="min-w-0 flex-1 bg-transparent type-sm text-ink placeholder:text-muted"
          value={query}
          placeholder="Find a command"
          aria-label="Find a command"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <button
        className="inline-flex h-control-lg flex-none items-center gap-2.25 rounded-control bg-surface px-3.5 type-sm text-muted aria-pressed:bg-desk-primary aria-pressed:text-desk-primary-ink focus-visible:outline-ink"
        type="button"
        aria-pressed={changedOnly}
        onClick={() => setChangedOnly((current) => !current)}
      >
        Changed only
        <b className={NUMBER}>{changed}</b>
      </button>
    </div>

    {groups.map((group) => <Section title={group.toLocaleUpperCase()} key={group}>
      <Plate>
        {visible.filter((command) => command.group === group).map((command) => {
          const isChanged = command.id in ctx.bindings;
          const bound = effectiveChord(command, ctx.bindings);
          const isRecording = recording?.commandId === command.id;
          const captured = isRecording ? recording.captured : null;
          return <Row
            title={command.name}
            description={<span className={META}>
              {command.scope.toLocaleUpperCase()}{isChanged && " · CHANGED"}
              {isChanged && ` · DEFAULT ${chordTokens(command.chord).join(" ")}`}
            </span>}
            flash={isRecording}
            key={command.id}
            id={`keys.${command.id}`}
          >
            {isRecording
              ? <>
                <span className={captured || !recording.modifiers.length ? META : NOTE_ALERT}>
                  {captured ? "CAPTURED" : recording.modifiers.length ? "MODIFIERS ONLY" : "PRESS A SHORTCUT"}
                </span>
                <Keycaps tokens={captured ? chordTokens(captured) : recording.modifiers} size="lg" tone="inverse" />
                <button className={action({ size: "sm" })} type="button" onClick={() => setRecording(null)}>Cancel</button>
                <button className={action({ size: "sm", tone: "primary" })} type="button" disabled={!captured} onClick={() => save(command)}>Save</button>
              </>
              : <>
                <button
                  className="inline-flex h-control-md flex-none items-center gap-0.75 rounded-control bg-surface-sunken px-2 hover:bg-surface-hover focus-visible:outline-ink"
                  type="button"
                  aria-label={`Record a shortcut for ${command.name}`}
                  onClick={() => setRecording({ commandId: command.id, captured: null, modifiers: [] })}
                >
                  {(bound ? chordTokens(bound) : ["—"]).map((token, index) => <kbd className={keycap()} key={`${token}-${index}`}>{token}</kbd>)}
                </button>
                {isChanged && <button className={action({ size: "sm", round: true })} type="button" aria-label={`Reset ${command.name}`} onClick={() => reset(command)}>
                  <RotateCcw size={13} strokeWidth={1.8} aria-hidden="true" />
                </button>}
              </>}
          </Row>;
        })}
      </Plate>
    </Section>)}

    <Section title="SCOPE">
      <Plate single>
        <span className={ROW_COPY}>
          <strong className={ROW_TITLE}>Terminal shortcuts</strong>
          <small className="type-label leading-row text-muted">Command scopes live in one registry, so there is no second shortcut editor anywhere in the app.</small>
        </span>
        <button className={action({ size: "sm" })} type="button" onClick={() => ctx.goTo("terminal")}>
          Terminal & environment
          <ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </Plate>
    </Section>
  </>;
}

export function StepperRow({ label, description, value, min, max, step, onChange, id }: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  id: string;
  onChange(next: number): void;
}) {
  return <Row title={label} description={description} id={id}>
    <Stepper label={label} value={value} min={min} max={max} step={step} onChange={onChange} />
  </Row>;
}
