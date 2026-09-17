import { act } from "react";
import { expect, test, vi } from "vitest";
import { ViewBrowser } from "@/widgets/view-panel";
import { createReactHost } from "./react-host";

test("browser ignores cancelled/subframe loads, retries the failed address and recovers", async () => {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const navigate = vi.fn();
  const url = "http://localhost:59999/";
  try {
    await act(async () => root.render(<ViewBrowser url={url} onNavigate={navigate} />));
    const guest = host.container.querySelector("webview")!;
    const loadURL = vi.fn().mockResolvedValue(undefined);
    Object.assign(guest, { loadURL, getURL: () => url, getTitle: () => "Demo", canGoBack: () => false, canGoForward: () => false });
    const dispatch = async (name: string, fields = {}) => { await act(async () => guest.dispatchEvent(Object.assign(new Event(name), fields))); };
    await dispatch("did-fail-load", { errorCode: -3, isMainFrame: true, validatedURL: url });
    await dispatch("did-fail-load", { errorCode: -105, isMainFrame: false, validatedURL: url });
    expect(host.container.querySelector("[role='alert']")).toBeNull();
    await dispatch("did-fail-load", { errorCode: -102, isMainFrame: true, validatedURL: url });
    expect(host.container.textContent).toContain("This page could not be opened");
    expect(host.container.querySelector("input")?.value).toBe(url);
    const retry = host.container.querySelectorAll("button").find((button) => button.textContent === "Retry page")!;
    await act(async () => retry.dispatchEvent(new Event("click", { bubbles: true })));
    expect(loadURL).toHaveBeenCalledWith(url);
    await dispatch("did-start-navigation", { url, isMainFrame: true });
    await dispatch("did-fail-load", { errorCode: -105, isMainFrame: true, validatedURL: "https://stale.invalid/" });
    await dispatch("did-finish-load");
    expect(host.container.querySelector("[role='alert']")).toBeNull();
    expect(navigate).toHaveBeenCalledWith(url, "Demo");
    await dispatch("render-process-gone");
    expect(host.container.textContent).toContain("Retry page");
    loadURL.mockRejectedValueOnce(new Error("Refused"));
    await act(async () => host.container.querySelectorAll("button").find((button) => button.textContent === "Retry page")!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(host.container.textContent).toContain("This page could not be opened");
  } finally { await act(async () => root.unmount()); host.restore(); }
});
