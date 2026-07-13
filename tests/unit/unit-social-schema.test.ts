import { expect, test } from "bun:test";
import { UnitManifestSchema } from "../../cli/lib/schemas/unit";

const base = {
  slug: "account-update",
  media: [],
  created: "2026-07-13T00:00:00.000Z",
};

test("accepts platform-specific post and thread units", () => {
  expect(
    UnitManifestSchema.parse({
      ...base,
      format: "post",
      text: { body: "Shipping today.", destinations: ["telegram", "x"] },
    }).text?.destinations,
  ).toEqual(["telegram", "x"]);

  expect(
    UnitManifestSchema.parse({
      ...base,
      format: "thread",
      text: { body: "1/ Three lessons", destinations: ["threads"] },
    }).format,
  ).toBe("thread");
});

test("rejects a destination that does not match the unit format", () => {
  expect(() =>
    UnitManifestSchema.parse({
      ...base,
      format: "post",
      text: { body: "Wrong rail", destinations: ["medium"] },
    }),
  ).toThrow();
  expect(() =>
    UnitManifestSchema.parse({
      ...base,
      format: "article",
      text: { body: "Long form", destinations: ["telegram"] },
    }),
  ).toThrow();
});

test("requires inline text for post and thread units", () => {
  expect(() => UnitManifestSchema.parse({ ...base, format: "post" })).toThrow();
  expect(() => UnitManifestSchema.parse({ ...base, format: "thread" })).toThrow();
});
