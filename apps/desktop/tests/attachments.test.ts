import { describe, expect, test, vi } from "vitest";

import {
  addAttachments,
  entityDragProps,
  RALPHY_ENTITY_DRAG,
  readEntityDrop,
  readFileDrop,
  releaseAttachments,
  withAttachments,
  type Attachment,
} from "@/features/agent-chat";

function transfer(entries: Record<string, string>) {
  return { types: Object.keys(entries), getData: (format: string) => entries[format] ?? "" };
}

describe("chat attachments", () => {
  test("a row states what it is once, in two flavours", () => {
    const setData = vi.fn();
    const props = entityDragProps({ kind: "unit", ref: "hero-cut", label: "hero-cut" });
    expect(props.draggable).toBe(true);
    props.onDragStart({ dataTransfer: { setData, effectAllowed: "none" } });
    expect(setData).toHaveBeenCalledWith(RALPHY_ENTITY_DRAG, JSON.stringify({ kind: "unit", ref: "hero-cut", label: "hero-cut" }));
    // The plain-text flavour is what a drag into anything else carries.
    expect(setData).toHaveBeenCalledWith("text/plain", "@unit:hero-cut");
  });

  test("a drop is read for what it is, and junk yields nothing", () => {
    const entity = { kind: "media", ref: "poster-01", label: "poster-01.png" };
    expect(readEntityDrop(transfer({ [RALPHY_ENTITY_DRAG]: JSON.stringify(entity) }))).toEqual([entity]);
    // A list arrives as a list.
    expect(readEntityDrop(transfer({ [RALPHY_ENTITY_DRAG]: JSON.stringify([entity, entity]) }))).toHaveLength(2);

    // No payload of ours, malformed JSON, an unknown kind and a missing ref are all nothing.
    expect(readEntityDrop(transfer({ "text/plain": "hello" }))).toEqual([]);
    expect(readEntityDrop(transfer({ [RALPHY_ENTITY_DRAG]: "{" }))).toEqual([]);
    expect(readEntityDrop(transfer({ [RALPHY_ENTITY_DRAG]: JSON.stringify({ kind: "spell", ref: "x" }) }))).toEqual([]);
    expect(readEntityDrop(transfer({ [RALPHY_ENTITY_DRAG]: JSON.stringify({ kind: "unit" }) }))).toEqual([]);
  });

  test("a Finder drop is a path when the host can name one, and a name when it cannot", () => {
    const files = [{ name: "poster.png" }, { name: "cut.mp4" }];
    expect(readFileDrop(files, (file) => `/Users/ada/${(file as { name: string }).name}`)).toEqual([
      { kind: "file", ref: "/Users/ada/poster.png", label: "poster.png" },
      { kind: "file", ref: "/Users/ada/cut.mp4", label: "cut.mp4" },
    ]);
    expect(readFileDrop(files, () => null)[0]).toEqual({ kind: "file", ref: "poster.png", label: "poster.png" });
  });

  test("a dropped picture carries its own thumbnail, and a payload never supplies one", () => {
    const urls: string[] = [];
    const objectUrl = vi.spyOn(URL, "createObjectURL").mockImplementation(() => { urls.push(`blob:preview-${urls.length}`); return urls.at(-1)!; });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    try {
      const dropped = readFileDrop([{ name: "poster.png", type: "image/png" }, { name: "cut.mp4", type: "video/mp4" }, { name: "brief.md", type: "text/markdown" }], () => null);
      expect(dropped.map((item) => item.preview)).toEqual(["blob:preview-0", "blob:preview-1", undefined]);
      releaseAttachments(dropped);
      expect(revoke.mock.calls.flat()).toEqual(["blob:preview-0", "blob:preview-1"]);

      /* The field is trusted context, like `instructions`: a payload that could name a URL would
         make the composer fetch whatever whoever wrote the payload chose. */
      const payload = JSON.stringify({ kind: "media", ref: "hero", label: "hero", preview: "https://tracker.example/pixel.gif" });
      expect(readEntityDrop(transfer({ [RALPHY_ENTITY_DRAG]: payload }))[0]?.preview).toBeUndefined();
    } finally { objectUrl.mockRestore(); revoke.mockRestore(); }
  });

  test("the strip is a set of places", () => {
    const unit: Attachment = { kind: "unit", ref: "hero-cut", label: "hero-cut" };
    const file: Attachment = { kind: "file", ref: "hero-cut", label: "hero-cut.md" };
    // Same ref, different kind: two places. Same kind and ref twice: one.
    expect(addAttachments([unit], [file, unit])).toEqual([unit, file]);
    expect(addAttachments([], [unit, unit])).toEqual([unit]);
  });

  test("attachments are a block under the message, not words inside it", () => {
    const attachments: Attachment[] = [
      { kind: "unit", ref: "hero-cut", label: "hero-cut" },
      { kind: "file", ref: "/Users/ada/brief.md", label: "brief.md" },
    ];
    expect(withAttachments("Cut this down", attachments))
      .toBe("Cut this down\n\nAttached:\n- @unit:hero-cut\n- @file:/Users/ada/brief.md");
    // Attachments alone are still a message; no attachments leaves the prompt untouched.
    expect(withAttachments("", attachments)).toBe("Attached:\n- @unit:hero-cut\n- @file:/Users/ada/brief.md");
    expect(withAttachments("Just words", [])).toBe("Just words");
  });
});
