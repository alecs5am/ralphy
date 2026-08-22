/**
 * The global command registry. The keydown handler resolves a chord through this table
 * instead of hardcoding keys, so a rebinding made in Settings takes effect immediately
 * and a conflict is a fact about the registry rather than a guess.
 */
export const COMMAND_BINDINGS_KEY = "ralphy.settings.bindings.v1";

export interface Chord {
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

export interface SettingsCommand {
  id: string;
  group: string;
  name: string;
  /** Where the chord is live. Two scopes can be active at once, hence conflicts. */
  scope: "Global" | "Chat" | "Media";
  chord: Chord;
}

const chord = (key: string, modifiers: Partial<Omit<Chord, "key">> = {}): Chord => ({
  meta: false, ctrl: false, alt: false, shift: false, ...modifiers, key,
});

export const SETTINGS_COMMANDS: readonly SettingsCommand[] = [
  { id: "app.settings", group: "Application", name: "Open settings", scope: "Global", chord: chord(",", { meta: true }) },
  { id: "app.sidebar", group: "Application", name: "Toggle sidebar", scope: "Global", chord: chord("b", { meta: true }) },
  { id: "nav.back", group: "Navigation", name: "Back", scope: "Global", chord: chord("[", { meta: true }) },
  { id: "nav.forward", group: "Navigation", name: "Forward", scope: "Global", chord: chord("]", { meta: true }) },
  { id: "nav.findProjects", group: "Navigation", name: "Find a project", scope: "Global", chord: chord("f", { meta: true }) },
  { id: "chat.send", group: "Chat", name: "Send message", scope: "Chat", chord: chord("Enter") },
];

export type CommandBindings = Record<string, Chord>;

const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift"]);
const KEY_SYMBOLS: Record<string, string> = {
  Enter: "↩", " ": "Space", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←",
  ArrowRight: "→", Backspace: "⌫", Tab: "⇥", Escape: "esc",
};

export function chordId(value: Chord): string {
  return [value.meta && "meta", value.ctrl && "ctrl", value.alt && "alt", value.shift && "shift", value.key.toLocaleLowerCase()]
    .filter(Boolean)
    .join("+");
}

/** macOS glyphs, because a chord printed as words is not the chord the user will press. */
export function chordTokens(value: Chord): string[] {
  return [
    ...value.meta ? ["⌘"] : [],
    ...value.ctrl ? ["⌃"] : [],
    ...value.alt ? ["⌥"] : [],
    ...value.shift ? ["⇧"] : [],
    KEY_SYMBOLS[value.key] ?? value.key.toLocaleUpperCase(),
  ];
}

export function modifiersOf(event: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): string[] {
  return [
    ...event.metaKey ? ["⌘"] : [],
    ...event.ctrlKey ? ["⌃"] : [],
    ...event.altKey ? ["⌥"] : [],
    ...event.shiftKey ? ["⇧"] : [],
  ];
}

/** Null while only modifiers are held: a chord without a base key is not recordable. */
export function chordFromEvent(event: KeyboardEvent): Chord | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  return { meta: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, key: event.key };
}

export function readCommandBindings(storage: { getItem(key: string): string | null }): CommandBindings {
  try {
    const value = JSON.parse(storage.getItem(COMMAND_BINDINGS_KEY) ?? "null") as unknown;
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([id, raw]) => {
      const candidate = raw as Partial<Chord> | null;
      return candidate && typeof candidate.key === "string"
        ? [[id, chord(candidate.key, { meta: !!candidate.meta, ctrl: !!candidate.ctrl, alt: !!candidate.alt, shift: !!candidate.shift })]]
        : [];
    }));
  } catch {
    return {};
  }
}

export function writeCommandBindings(storage: { setItem(key: string, value: string): void }, bindings: CommandBindings): void {
  storage.setItem(COMMAND_BINDINGS_KEY, JSON.stringify(bindings));
}

export function effectiveChord(command: SettingsCommand, bindings: CommandBindings): Chord | null {
  const bound = bindings[command.id];
  // An explicitly unbound command is stored with an empty key: absent and unbound differ.
  if (bound) return bound.key ? bound : null;
  return command.chord;
}

/** Resolves the command a keydown fires, or null when the chord is not bound. */
export function resolveCommand(
  event: KeyboardEvent,
  bindings: CommandBindings,
  scope: SettingsCommand["scope"] = "Global",
): SettingsCommand | null {
  const pressed = chordFromEvent(event);
  if (!pressed) return null;
  const id = chordId(pressed);
  return SETTINGS_COMMANDS.find((command) => {
    if (command.scope !== scope) return false;
    const bound = effectiveChord(command, bindings);
    return bound !== null && chordId(bound) === id;
  }) ?? null;
}

/** The command a candidate chord would collide with; scopes that can be live together. */
export function conflictingCommand(
  command: SettingsCommand,
  candidate: Chord,
  bindings: CommandBindings,
): SettingsCommand | null {
  const id = chordId(candidate);
  return SETTINGS_COMMANDS.find((other) => {
    if (other.id === command.id) return false;
    if (other.scope !== command.scope && other.scope !== "Global" && command.scope !== "Global") return false;
    const bound = effectiveChord(other, bindings);
    return bound !== null && chordId(bound) === id;
  }) ?? null;
}
