import { describe, expect, test } from "bun:test";
import {
  ERROR_CODES,
  type ErrorCode,
} from "../../cli/lib/errors/catalog.js";
import { DomainError } from "../../cli/lib/errors/domain.js";

describe("DomainError", () => {
  test("uses the concrete subclass name", () => {
    class Conflict extends DomainError {}

    expect(new Conflict("E_CONFLICT", "Conflict").name).toBe("Conflict");
  });

  test("defaults to the catalog message while preserving custom safe messages", () => {
    expect(new DomainError("E_CONFLICT").message).toBe(
      ERROR_CODES.E_CONFLICT.message,
    );
    expect(new DomainError("E_CONFLICT", "Reload the entity.").message).toBe(
      "Reload the entity.",
    );
  });

  test("exposes detached recursively frozen JSON details", () => {
    const input = {
      entityId: "composition_1",
      nested: { revision: 2 },
      retryable: false,
    };
    const error = new DomainError(
      "E_CONFLICT",
      "Composition changed; reload it before retrying.",
      input,
    );

    input.nested.revision = 3;

    expect(error).toBeInstanceOf(Error);
    expect({ code: error.code, message: error.message, details: error.details }).toEqual({
      code: "E_CONFLICT",
      message: "Composition changed; reload it before retrying.",
      details: {
        entityId: "composition_1",
        nested: { revision: 2 },
        retryable: false,
      },
    });
    expect(Reflect.set(error, "message", "raw provider error")).toBe(false);
    expect(Reflect.set(error.details!.nested as object, "revision", 4)).toBe(false);
    expect(JSON.stringify(error)).toBe("{}");
  });

  test("omits details when none are supplied", () => {
    const error = new DomainError("E_INTERNAL", "Safe message");

    expect(error.details).toBeUndefined();
    expect("details" in error).toBe(false);
  });

  test("preserves structurally safe opaque detail text for Task 8 projection", () => {
    const details = {
      mime: "video/mp4",
      aspect: "9/16",
      source: "urn:ralphy:object:1",
    };

    expect(new DomainError("E_INTERNAL", "Safe message", details).details).toEqual(
      details,
    );
  });

  test("rejects prototype keys, symbols, non-enumerable fields, and accessors", () => {
    const symbol = { [Symbol("field")]: "value" };
    const hidden = Object.defineProperty({}, "field", {
      enumerable: false,
      value: "value",
    });
    let getterRead = false;
    const accessor = Object.defineProperty({}, "field", {
      enumerable: true,
      get() {
        getterRead = true;
        return "value";
      },
    });

    for (const details of [
      { constructor: "value" },
      JSON.parse('{"__proto__":"value"}') as Record<string, unknown>,
      symbol,
      hidden,
      accessor,
    ]) {
      expect(
        () => new DomainError("E_INTERNAL", "Safe message", details),
      ).toThrow();
    }
    expect(getterRead).toBe(false);
  });

  test("rejects unknown codes, unsafe messages, and non-JSON detail values", () => {
    expect(
      () => new DomainError("E_UNKNOWN" as ErrorCode, "Safe message"),
    ).toThrow(/known error code/i);
    expect(() => new DomainError("E_INTERNAL", "two\nlines")).toThrow(
      /single-line/i,
    );
    expect(() => new DomainError("E_INTERNAL", "x".repeat(1_025))).toThrow(
      /bounded/i,
    );
    expect(
      () => new DomainError("E_INTERNAL", "Safe message", { value: Infinity }),
    ).toThrow(/finite/i);
    expect(
      () => new DomainError("E_INTERNAL", "Safe message", { value: new Date() }),
    ).toThrow(/plain JSON/i);
    expect(
      () => new DomainError("E_INTERNAL", "Safe message", { value: Array(1) }),
    ).toThrow(/dense JSON/i);
    expect(
      () => new DomainError("E_INTERNAL", "Safe message", { value: undefined }),
    ).toThrow(/JSON values/i);
    expect(
      () => new DomainError("E_INTERNAL", "Safe message", { value: "line\nbreak" }),
    ).toThrow(/printable/i);
    expect(
      () => new DomainError("E_INTERNAL", "Safe message", { value: "\ud800" }),
    ).toThrow(/printable/i);
    expect(
      () => new DomainError("E_INTERNAL", "Safe message", { "bad\ud800key": true }),
    ).toThrow(/printable/i);

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(
      () => new DomainError("E_INTERNAL", "Safe message", cyclic),
    ).toThrow(/cycles/i);
  });

  test("accepts the complete optimistic-conflict detail vocabulary", () => {
    const details = {
      entityType: "composition",
      entityId: "composition_1",
      expectedRowVersion: 1,
      currentRowVersion: 2,
      expectedLatestRevisionId: "revision_1",
      currentLatestRevisionId: "revision_2",
      expectedSelectedRevisionId: "revision_1",
      currentSelectedRevisionId: "revision_2",
      expectedRevisionId: "revision_1",
      currentRevisionId: "revision_2",
      expectedState: "pending",
      currentState: "running",
      expectedFence: 1,
      currentFence: 2,
    };

    expect(new DomainError("E_CONFLICT", "Conflict", details).details).toEqual(
      details,
    );
  });

  test("bounds detail depth, entry count, and string bytes", () => {
    expect(
      () =>
        new DomainError("E_INTERNAL", "Safe message", {
          a: { b: { c: { d: { e: true } } } },
        }),
    ).toThrow(/nested too deeply/i);
    expect(
      () =>
        new DomainError(
          "E_INTERNAL",
          "Safe message",
          Object.fromEntries(
            Array.from({ length: 65 }, (_, index) => [`field${index}`, index]),
          ),
        ),
    ).toThrow(/too many entries/i);
    expect(
      () =>
        new DomainError("E_INTERNAL", "Safe message", {
          value: "x".repeat(2_049),
        }),
    ).toThrow(/bounded/i);
  });
});
