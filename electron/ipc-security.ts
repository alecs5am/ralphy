export interface IpcError {
  code: string;
  message: string;
}

export type IpcResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; error: IpcError };

const SAFE_ERROR_CODES = new Set([
  "E_CONFLICT",
  "E_MIGRATION_INCOMPLETE",
  "E_OBJECT_MISSING",
  "E_PROTOCOL_INVALID",
  "E_PROTOCOL_UNSUPPORTED",
  "E_ROOT_INVALID",
  "E_VALIDATION_FAILED",
  "E_BRIDGE_VERSION",
]);

export async function toIpcResult<Value>(
  run: () => Value | Promise<Value>,
): Promise<IpcResult<Value>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (
      error instanceof Error
      && "code" in error
      && typeof error.code === "string"
      && SAFE_ERROR_CODES.has(error.code)
    ) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    return {
      ok: false,
      error: {
        code: "E_INTERNAL",
        message: "The operation could not be completed",
      },
    };
  }
}

export function unwrapIpcResult<Value>(result: IpcResult<Value>): Value {
  if (result.ok) return result.value;
  throw Object.assign(new Error(result.error.message), { code: result.error.code });
}

export function isTrustedNavigation(target: string, renderer: string): boolean {
  try {
    const targetUrl = new URL(target);
    const rendererUrl = new URL(renderer);
    if (rendererUrl.protocol === "file:") {
      return targetUrl.protocol === "file:"
        && targetUrl.hostname === rendererUrl.hostname
        && targetUrl.pathname === rendererUrl.pathname
        && targetUrl.search === rendererUrl.search;
    }
    return targetUrl.origin === rendererUrl.origin;
  } catch {
    return false;
  }
}

interface NavigationEvent {
  preventDefault(): void;
}

interface NavigationWebContents {
  on(
    event: "will-navigate" | "will-redirect",
    listener: (event: NavigationEvent, url: string) => void,
  ): unknown;
}

export function installNavigationGuards(
  webContents: NavigationWebContents,
  rendererUrl: string,
): void {
  const guard = (event: NavigationEvent, url: string): void => {
    if (!isTrustedNavigation(url, rendererUrl)) event.preventDefault();
  };
  webContents.on("will-navigate", guard);
  webContents.on("will-redirect", guard);
}

export function denyPermissionRequest(
  _webContents: unknown,
  _permission: string,
  callback: (allowed: boolean) => void,
): void {
  callback(false);
}

export function secureWebPreferences(preload: string) {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  } as const;
}

interface TrustedWindow {
  isDestroyed(): boolean;
  webContents: {
    mainFrame: unknown;
  };
}

interface SenderEvent {
  sender: unknown;
  senderFrame: unknown;
}

export function assertTrustedSender(
  event: SenderEvent,
  window: TrustedWindow | null,
): void {
  if (
    !window
    || window.isDestroyed()
    || event.sender !== window.webContents
    || event.senderFrame !== window.webContents.mainFrame
  ) throw new Error("Untrusted IPC sender");
}
