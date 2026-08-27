/**
 * Rebinding a chord, and refusing one that is already taken.
 *
 * A recording captures the chord as pressed rather than asking for a description of it, and a
 * conflict is reported against the command that holds it -- with its scope, because the same
 * chord may be free in one scope and taken in another. Nothing is saved until the conflict is
 * resolved, so the registry never holds two commands on one chord.
 */
import { useEffect, useState } from "react";
import { ArrowUpRight, RotateCcw, Search } from "lucide-react";

import { Keycap } from "@/shared/ui/Keycap";
import type { SettingsContext } from "../model/context";
import {
  chordFromEvent,
  chordTokens,
  conflictingCommand,
  effectiveChord,
  modifiersOf,
  SETTINGS_COMMANDS,
  type Chord,
  type SettingsCommand,
} from "../lib/commands";
import {
  Dot,
  META,
  NUMBER,
  NOTE_ALERT,
  Plate,
  ROW_COPY,
  ROW_TITLE,
  Row,
  Section,
  action,
} from "./rows";

const CONFLICT_ROW = "flex h-control-lg items-center gap-3 rounded-control px-3";
const CONFLICT_SCOPE = "font-code type-mono-xs tracking-caps text-on-instrument-muted";

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
    {conflict && <div className="flex flex-col gap-3.25 rounded-panel bg-instrument p-3">
      <h2 className="m-0 flex items-center gap-2.25 font-code type-mono-sm font-normal tracking-mono text-on-instrument">
        <Dot tone="warn" surface="instrument" />SHORTCUT ALREADY IN USE
      </h2>
      <div className="flex flex-col gap-0.5">
        <div className={`${CONFLICT_ROW} bg-instrument-raised`}>
          <span className="flex-1 type-ui text-on-instrument">{conflict.command.name}</span>
          <small className={CONFLICT_SCOPE}>{conflict.command.scope.toLocaleUpperCase()}</small>
          <Keycap tokens={chordTokens(conflict.chord)} conflict />
        </div>
        <div className={CONFLICT_ROW}>
          <span className="flex-1 type-ui text-on-instrument-muted">{conflict.other.name}</span>
          <small className={CONFLICT_SCOPE}>{conflict.other.scope.toLocaleUpperCase()}</small>
          <Keycap tokens={chordTokens(conflict.chord)} />
        </div>
      </div>
      <p className="m-0 font-code type-mono-xs tracking-caps leading-note text-on-instrument-muted">{`SCOPES ${conflict.command.scope.toLocaleUpperCase()} AND ${conflict.other.scope.toLocaleUpperCase()} CAN BE LIVE AT ONCE — UNBINDING THE OTHER COMMAND SILENTLY IS NOT AN OPTION`}</p>
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
      <label className="flex h-control-lg min-w-0 flex-1 items-center gap-2.25 rounded-control bg-field px-3.25 text-muted-decorative focus-within:outline-ink focus-within:outline-offset-2">
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
        className="inline-flex h-control-lg flex-none items-center gap-2.25 rounded-control bg-field px-3.5 type-sm text-muted aria-pressed:bg-desk-primary aria-pressed:text-desk-primary-ink focus-visible:outline-ink"
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
                <Keycap tokens={captured ? chordTokens(captured) : recording.modifiers} size="recorder" loud split />
                <button className={action({ size: "sm" })} type="button" onClick={() => setRecording(null)}>Cancel</button>
                <button className={action({ size: "sm", tone: "primary" })} type="button" disabled={!captured} onClick={() => save(command)}>Save</button>
              </>
              : <>
                <button
                  /* The cap is the control here, so the button carries no plate of its own: a
                     socket inside a pill inside a row was three surfaces for one chord. An unbound
                     command shows the empty socket rather than an em dash. */
                  className="inline-flex flex-none items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  type="button"
                  aria-label={`Record a shortcut for ${command.name}`}
                  onClick={() => setRecording({ commandId: command.id, captured: null, modifiers: [] })}
                >
                  <Keycap tokens={bound ? chordTokens(bound) : []} />
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
