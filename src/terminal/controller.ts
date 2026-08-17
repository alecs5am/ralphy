import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";

import type {
  MediaWorkbenchBridge,
  TerminalSession,
} from "../lib/ipc";

const TERMINAL_THEME = {
  background: "#111111",
  foreground: "#d8d8d8",
  cursor: "#e7e7e7",
  cursorAccent: "#181818",
  selectionBackground: "#514a7a",
  selectionForeground: "#ffffff",
  black: "#181818",
  red: "#d49692",
  green: "#7cb994",
  yellow: "#cdae80",
  blue: "#8295c7",
  magenta: "#aa8ee6",
  cyan: "#71b4b0",
  white: "#d8d8d8",
  brightBlack: "#6c6c6c",
  brightRed: "#e4aaa6",
  brightGreen: "#92c9a7",
  brightYellow: "#ddbf95",
  brightBlue: "#9dadd8",
  brightMagenta: "#c2a7f5",
  brightCyan: "#8bcac6",
  brightWhite: "#f4f4f4",
} as const;

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
      theme: TERMINAL_THEME,
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
