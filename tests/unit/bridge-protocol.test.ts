import { describe, expect, test } from "bun:test";
import {
  BridgeFrameDecoder,
  MAX_AGENT_DELTA_BYTES,
  MAX_FRAME_BYTES,
  MAX_REQUEST_ID_BYTES,
  createBridgeFailure,
  createBridgeSuccess,
  parseBridgeRequest,
  splitUtf8Text,
  stringifyBridgeMessage,
} from "../../cli/lib/bridge/protocol.js";

describe("bridge protocol", () => {
  test("frames split Buffer chunks and counts bytes, not characters", () => {
    const decoder = new BridgeFrameDecoder();
    expect(decoder.push(Buffer.from('{"v":1,"id":"🙂","method":"x"}\n'))).toEqual([
      Buffer.from('{"v":1,"id":"🙂","method":"x"}'),
    ]);
    expect(decoder.push(Buffer.from("{\"v\":1,"))).toEqual([]);
    expect(decoder.push(Buffer.from("\"id\":\"a\",\"method\":\"x\"}\n"))).toHaveLength(1);
  });

  test("rejects an oversized frame before retaining bytes beyond the limit", () => {
    const decoder = new BridgeFrameDecoder();
    expect(() => decoder.push(Buffer.alloc(MAX_FRAME_BYTES + 1, 0x78))).toThrow(
      "Bridge frame exceeds byte limit",
    );
    expect(decoder.bufferedBytes).toBe(0);
  });

  test("accepts exact frame limit and rejects malformed strict requests", () => {
    const decoder = new BridgeFrameDecoder();
    expect(() => decoder.push(Buffer.alloc(MAX_FRAME_BYTES, 0x78))).not.toThrow();
    expect(decoder.bufferedBytes).toBe(MAX_FRAME_BYTES);
    expect(() => parseBridgeRequest('{"v":2,"id":"ok","method":"system.hello"}')).toThrow(
      /unsupported/i,
    );
    expect(() => parseBridgeRequest('{"v":1,"id":"","method":"system.hello"}')).toThrow(
      /id/i,
    );
    expect(() => parseBridgeRequest('{"v":1,"id":"é","method":"system.hello"}')).toThrow(
      /ASCII/i,
    );
    expect(() =>
      parseBridgeRequest('{"v":1,"id":"ok","method":"system.hello","extra":true}'),
    ).toThrow(/field/i);
  });

  test("bounds request ids by UTF-8 bytes and returns JSON-only envelopes", () => {
    const id = "a".repeat(MAX_REQUEST_ID_BYTES);
    expect(parseBridgeRequest(JSON.stringify({ v: 1, id, method: "system.hello" }))).toEqual({
      v: 1,
      id,
      method: "system.hello",
    });
    expect(() => parseBridgeRequest(JSON.stringify({ v: 1, id: `${id}a`, method: "x" }))).toThrow(
      /id/i,
    );
    expect(stringifyBridgeMessage(createBridgeSuccess("ok", { ready: true }))).toBe(
      '{"v":1,"id":"ok","ok":true,"result":{"ready":true}}\n',
    );
    expect(stringifyBridgeMessage(createBridgeFailure(null, "E_PROTOCOL_INVALID", "bad"))).toBe(
      '{"v":1,"id":null,"ok":false,"error":{"code":"E_PROTOCOL_INVALID","message":"bad"}}\n',
    );
    expect(() => stringifyBridgeMessage({ bad: BigInt(1) })).toThrow(/JSON/i);
  });

  test("splits normalized text on UTF-8 boundaries", () => {
    const text = "e\u0301🙂";
    const parts = splitUtf8Text(text, 5);
    expect(parts.join("")).toBe(text.normalize("NFC"));
    expect(parts.every((part) => Buffer.byteLength(part) <= 5)).toBe(true);
    expect(splitUtf8Text("x".repeat(MAX_AGENT_DELTA_BYTES), MAX_AGENT_DELTA_BYTES)).toHaveLength(1);
  });
});
