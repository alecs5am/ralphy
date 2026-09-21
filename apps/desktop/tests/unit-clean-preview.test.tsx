import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { UnitSocialPreview } from "../src/pages/project/ui/UnitSocialPreview";
import type { UnitMedia } from "@/entities/unit";

vi.mock("@/entities/media", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/entities/media")>(),
  AudioWaveform: ({ tone }: { tone: string }) => <span data-player="audio" data-tone={tone} />,
  VideoPlayer: ({ tone }: { tone: string }) => <span data-player="video" data-tone={tone} />,
}));

test("clean media follows the surface tone while social and device mockups retain instrument tone", () => {
  for (const kind of ["audio", "video"] as const) {
    const media: UnitMedia[] = [{ id: kind, role: "primary", kind, position: 0, preview: { url: `ralphy-media://asset/${kind}`, mime: `${kind}/mp4`, sizeBytes: 10 } }];
    for (const variant of ["post", "carousel"] as const) {
      const props = { media, slug: "Creative", target: { id: `instagram-${variant}`, platform: "instagram", variant, label: "Instagram" } };
      const clean = renderToStaticMarkup(<UnitSocialPreview {...props} previewMode="clean" />);
      expect(clean).toContain(`data-player="${kind}" data-tone="surface"`);
      const social = renderToStaticMarkup(<UnitSocialPreview {...props} previewMode="post" />);
      expect(social).toContain(`data-player="${kind}" data-tone="instrument"`);
      const device = renderToStaticMarkup(<UnitSocialPreview {...props} previewMode="clean" tone="instrument" />);
      expect(device).toContain(`data-player="${kind}" data-tone="instrument"`);
    }
  }
});

test("clean text posts preserve the document body or caption without social chrome", () => {
  const props = { slug: "Creative", caption: "Caption-only creative", previewMode: "clean" as const, target: { id: "facebook-post", platform: "facebook", variant: "post" as const, label: "Facebook" } };
  const caption = renderToStaticMarkup(<UnitSocialPreview {...props} media={[]} />);
  expect(caption).toContain("Caption-only creative");
  expect(caption).not.toContain("Facebook · Text post");
  const document: UnitMedia = { id: "document", role: "content", kind: "document", position: 0, preview: { revisionId: "revision", format: "markdown", text: "Document body", truncated: false } };
  const body = renderToStaticMarkup(<UnitSocialPreview {...props} media={[document]} />);
  expect(body).toContain("Document body");
  expect(body).not.toContain("Caption-only creative");
  expect(body).not.toContain("Facebook · Text post");
});
