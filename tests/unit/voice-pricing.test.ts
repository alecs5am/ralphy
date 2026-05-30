// Unit tests for voiceover cost computation (#030).
//
// Failure mode being asserted: pre-#030 every voiceover row in
// generations.jsonl logged `cost_usd: 0` because ElevenLabs is a
// subscription pool — no per-call invoice. The rollup then showed
// VO-heavy projects at $0 next to image-heavy projects at real dollars,
// which made the cost dashboard a lie. The fix is a $/1k-chars rate
// table per TTS model; the live call writes the cost to the canonical
// gen-log row.

import { describe, test, expect } from "bun:test";
import {
  voiceoverCostUsd,
  VOICE_PRICE_PER_KCHAR,
  DEFAULT_VOICE_PRICE_PER_KCHAR,
} from "../../cli/lib/providers/voice-pricing.js";

describe("voiceoverCostUsd", () => {
  // Table-driven: each row exercises a different chars / model / expected
  // combination. The model gets the rate from VOICE_PRICE_PER_KCHAR; missing
  // rows fall back to DEFAULT_VOICE_PRICE_PER_KCHAR.
  const cases: Array<{ chars: number; model: string; expected: number }> = [
    // exactly 1k chars on multilingual_v2 → ceil(1000/1000) * 0.20 = 0.20
    { chars: 1000, model: "eleven_multilingual_v2", expected: 0.2 },
    // 1 char on multilingual_v2 → ceil(1/1000) * 0.20 = 0.20 (subscription
    // pool rebalances at thousand-char boundaries — see voice-pricing.ts).
    { chars: 1, model: "eleven_multilingual_v2", expected: 0.2 },
    // 1001 chars → ceil(1001/1000) * 0.20 = 0.40
    { chars: 1001, model: "eleven_multilingual_v2", expected: 0.4 },
    // 2500 chars → ceil(2500/1000) * 0.20 = 0.60
    { chars: 2500, model: "eleven_multilingual_v2", expected: 0.6 },
    // eleven_v3 same rate as multilingual_v2 (both $0.20/1k).
    { chars: 1000, model: "eleven_v3", expected: 0.2 },
    // eleven_turbo_v2_5 cheaper at $0.10/1k.
    { chars: 1000, model: "eleven_turbo_v2_5", expected: 0.1 },
    // eleven_flash_v2_5 cheapest at $0.05/1k.
    { chars: 1000, model: "eleven_flash_v2_5", expected: 0.05 },
    // unknown model → DEFAULT_VOICE_PRICE_PER_KCHAR ($0.20).
    { chars: 1000, model: "eleven_unknown_future", expected: 0.2 },
    // zero / negative chars → 0 (no charge for empty calls).
    { chars: 0, model: "eleven_multilingual_v2", expected: 0 },
    { chars: -1, model: "eleven_multilingual_v2", expected: 0 },
  ];

  for (const { chars, model, expected } of cases) {
    test(`${chars} chars / ${model} → $${expected}`, () => {
      expect(voiceoverCostUsd(chars, model)).toBeCloseTo(expected, 6);
    });
  }

  test("rate table covers the production models we actually ship with", () => {
    // Sanity check — if someone removes a row from VOICE_PRICE_PER_KCHAR the
    // gen-log cost column silently shifts to the fallback rate. Make sure
    // the production models stay covered explicitly.
    expect(VOICE_PRICE_PER_KCHAR.eleven_multilingual_v2).toBeDefined();
    expect(VOICE_PRICE_PER_KCHAR.eleven_v3).toBeDefined();
    expect(DEFAULT_VOICE_PRICE_PER_KCHAR).toBeGreaterThan(0);
  });
});
