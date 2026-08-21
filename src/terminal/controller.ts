import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";

import { INSTRUMENT_PALETTE } from "../instrument/palette";
import type { ResolvedTheme } from "../instrument/types";
import type { ITheme } from "@xterm/xterm";
import type {
  MediaWorkbenchBridge,
  TerminalSession,
} from "../lib/ipc";

export function terminalTheme(theme: ResolvedTheme): ITheme {
  const palette = INSTRUMENT_PALETTE[theme];
  return {
  background: palette.terminalBackground,
  foreground: palette.terminalForeground,
  cursor: palette.terminalCursor,
  cursorAccent: palette.mediaFrame,
  selectionBackground: palette.terminalSelection,
  selectionForeground: palette.textOnDarkPrimary,
  black: palette.legacyCanvas,
  red: palette.alertBright,
  green: palette.trafficMaximize,
  yellow: palette.trafficMinimize,
  blue: palette.textSecondaryReadable,
  magenta: palette.ditherHighlight,
  cyan: palette.divider,
  white: palette.terminalForeground,
  brightBlack: palette.textOnDarkMutedDecorative,
  brightRed: palette.trafficClose,
  brightGreen: palette.trafficMaximize,
  brightYellow: palette.trafficMinimize,
  brightBlue: palette.textSecondaryReadable,
  brightMagenta: palette.ditherHighlight,
  brightCyan: palette.divider,
  brightWhite: palette.textOnDarkPrimary,
  };
}

export class TerminalController {
  readonly element: HTMLDivElement;
  readonly terminal: Terminal;
  readonly #fitAddon = new FitAddon();
  readonly #disposables: Array<{ dispose(): void }> = [];
  #fitFrame: number | null = null;
  #opened = false;

  constructor(
    readonly session: TerminalSession,
    bridge: MediaWorkbenchBridge,
    onTitleChange: (title: string) => void,
    theme: ResolvedTheme = "dark",
  ) {
    this.element = document.createElement("div");
    this.element.className = "terminal-controller-host";
    this.element.dataset.sessionId = session.id;
    this.terminal = new Terminal({
      allowTransparency: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: '"JetBrainsMono Nerd Font Mono", "JetBrains Mono", Menlo, monospace',
      fontSize: 12,
      letterSpacing: 0,
      lineHeight: 1.25,
      macOptionIsMeta: true,
      rightClickSelectsWord: true,
      scrollback: 10_000,
      theme: terminalTheme(theme),
    });
    this.terminal.loadAddon(this.#fitAddon);
    this.terminal.loadAddon(
      new WebLinksAddon((_event, uri) => {
        window.open(uri, "_blank", "noopener,noreferrer");
      }),
    );
    this.#disposables.push(
      this.terminal.onData((data) => {
        void bridge.writeTerminal(session.id, data).catch(() => undefined);
      }),
      this.terminal.onResize((dimensions) => {
        void bridge.resizeTerminal(session.id, dimensions).catch(() => undefined);
      }),
      this.terminal.onTitleChange(onTitleChange),
    );
  }

  mount(container: HTMLElement, active: boolean): void {
    if (this.element.parentElement !== container) container.append(this.element);
    if (!this.#opened) {
      this.#opened = true;
      this.terminal.open(this.element);
    }
    this.element.classList.toggle("is-active", active);
    this.element.setAttribute("aria-hidden", String(!active));
    if (active) this.fit();
  }

  write(data: string): void {
    this.terminal.write(data);
  }

  setTheme(theme: ResolvedTheme): void {
    this.terminal.options.theme = terminalTheme(theme);
  }

  fit(): void {
    if (!this.#opened || !this.element.classList.contains("is-active")) return;
    if (this.#fitFrame !== null) cancelAnimationFrame(this.#fitFrame);
    this.#fitFrame = requestAnimationFrame(() => {
      this.#fitFrame = null;
      if (this.element.clientWidth < 20 || this.element.clientHeight < 20) return;
      this.#fitAddon.fit();
    });
  }

  focus(): void {
    this.terminal.focus();
  }

  dispose(): void {
    if (this.#fitFrame !== null) cancelAnimationFrame(this.#fitFrame);
    for (const disposable of this.#disposables) disposable.dispose();
    this.terminal.dispose();
    this.element.remove();
  }
}
