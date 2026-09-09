import { act, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import * as icons from "../src/shared/ui/icons";
import { SocialIcon } from "../src/shared/ui/SocialIcon";
import { createReactHost } from "./react-host";

test("app icons render Hugeicons paths and preserve sizing, accessible names and SVG refs", async () => {
  for (const [name, Icon] of Object.entries(icons)) {
    const markup = renderToStaticMarkup(<Icon size={16} className="text-muted" />);
    expect(markup, name).toContain(`data-icon="${name}"`);
    expect(markup, name).toContain('width="16"');
    expect(markup, name).toContain('height="16"');
    expect(markup, name).toContain('aria-hidden="true"');
    expect(markup, name).toContain('class="app-icon text-muted"');
    expect(markup, name).toContain("<path");
  }
  const labelled = renderToStaticMarkup(<icons.Check aria-label="Complete" role="img" strokeWidth={2} />);
  expect(labelled).toContain('aria-label="Complete"');
  expect(labelled).not.toContain('aria-hidden="true"');
  expect(labelled).toContain('stroke-width="2"');
  expect(renderToStaticMarkup(<icons.ArrowRight />).match(/<path[^>]+/g))
    .not.toEqual(renderToStaticMarkup(<icons.ChevronRight />).match(/<path[^>]+/g));
  for (const platform of ["tiktok", "pinterest", "youtube", "linkedin", "instagram", "x"]) {
    expect(renderToStaticMarkup(<SocialIcon platform={platform} />)).toContain('class="app-icon"');
  }
  expect(renderToStaticMarkup(<SocialIcon platform="__proto__" />)).toBe("");

  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const ref = createRef<SVGSVGElement>();
  try {
    await act(async () => root.render(<icons.Search ref={ref} size={20} />));
    expect(ref.current?.getAttribute("data-icon")).toBe("Search");
  } finally { await act(async () => root.unmount()); host.restore(); }
});
