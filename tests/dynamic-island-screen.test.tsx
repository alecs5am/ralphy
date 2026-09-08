import { act } from "react";
import { expect, test, vi } from "vitest";
import { Notch, type DynamicIslandFeed } from "@/widgets/dynamic-island";
import { createReactHost } from "./react-host";

const context = { label: "Workspace", detail: null, identity: null, count: null };
const feed: DynamicIslandFeed = {
  rootEpoch: 1,
  projectStatus: { status: "unavailable", reason: "Not reported" },
  activeTask: { id: "task", label: "Rendering", status: "running", progress: 1.8, destination: { kind: "library" } },
  notifications: { status: "ready", value: [{ id: "notice", title: "Render ready", severity: "info", timestamp: 0, unread: true, destination: { kind: "library" } }] },
};

function click(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent?.trim() === label);
  if (!button) throw new Error(`Missing ${label}`);
  button.dispatchEvent(new Event("click", { bubbles: true }));
}

test("island marks and dismisses stable notifications, resets for a new root, and closes on navigation", async () => {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const navigate = vi.fn();
  const render = (value: DynamicIslandFeed) => root.render(<Notch feed={value} context={context} projectName={null} mock={false} onNavigate={navigate} />);
  try {
    await act(async () => render(feed));
    await act(async () => click(host.container, "Notch activity"));
    expect(host.container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("100");
    await act(async () => click(host.container, "Mark all read"));
    expect(host.container.textContent).not.toContain(" · Unread");
    await act(async () => render({ ...feed }));
    expect(host.container.textContent).not.toContain(" · Unread");
    await act(async () => click(host.container, "Dismiss Render ready"));
    expect(host.container.textContent).not.toContain("Render ready");
    await act(async () => render({ ...feed, rootEpoch: 2 }));
    expect(host.container.textContent).toContain(" · Unread");
    await act(async () => click(host.container, "Open"));
    expect(navigate).toHaveBeenCalledWith({ kind: "library" });
    expect(host.container.querySelector('[aria-controls]')?.getAttribute("aria-expanded")).toBe("false");
  } finally {
    await act(async () => root.unmount());
    host.restore();
  }
});

test("island treats nonfinite progress as unknown and supports escape and outside dismissal", async () => {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  try {
    await act(async () => root.render(<Notch feed={{ ...feed, activeTask: { ...feed.activeTask!, progress: NaN } }} context={context} projectName={null} mock={false} onNavigate={() => undefined} />));
    await act(async () => click(host.container, "Notch activity"));
    expect(host.container.querySelector('[role="progressbar"]')).toBeNull();
    expect(host.container.textContent).not.toContain("NaN");
    const escape = new Event("keydown", { bubbles: true });
    Object.defineProperty(escape, "key", { value: "Escape" });
    await act(async () => document.dispatchEvent(escape));
    expect(host.container.querySelector('[aria-controls]')?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => click(host.container, "Notch activity"));
    await act(async () => host.container.querySelector(".dynamic-island-scrim")?.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(host.container.querySelector('[aria-controls]')?.getAttribute("aria-expanded")).toBe("false");
  } finally {
    await act(async () => root.unmount());
    host.restore();
  }
});
