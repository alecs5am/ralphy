// Content-farm-mode routing fixture (#410).
//
// "make 20 videos / 20 posts / an ad-pack batch / a content farm for X" must
// route into farm mode — i.e. the producer playbook's content-farm section. The
// agent has no runtime router (it reads AGENTS.md → the matched playbook), so
// this is a STATIC + DETERMINISTIC coverage test in two halves:
//
//   (1) Signal: each "make N X" utterance fires the #416 `multi-unit-farm`
//       research trigger via `chooseResearchDepth` — the deterministic signal
//       that the brief is a farm, not a one-off. (The issue: wire the routing
//       test to the existing multi-unit-farm trigger.)
//   (2) Surface: the producer playbook (the farm-mode home) exists, AGENTS.md
//       routes the batch (N≥3) row to it, and the row + the playbook name farm
//       mode + batch review so the route is reachable + self-describing.
//
// English-only-on-disk: every utterance is plain English.

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { chooseResearchDepth } from "../../cli/lib/research-bootstrap";

const REPO = path.resolve(import.meta.dir, "..", "..");
const AGENTS_MD = fs.readFileSync(path.join(REPO, "AGENTS.md"), "utf8");
const PRODUCER = path.join(REPO, "docs", "playbooks", "producer.md");

// ─── (1) Signal: "make N X" fires the multi-unit-farm trigger ─────────────────

const FARM_UTTERANCES = [
  "make 20 videos about my coffee subscription",
  "make 20 posts for our launch week",
  "build me an ad pack for the new running shoe",
  "set up a content farm for my newsletter",
  "I need 32 FB creatives for the sale",
  "give me a batch of variations for cold traffic",
];

describe("farm-mode routing: 'make N X' fires the multi-unit-farm trigger (#410/#416)", () => {
  for (const brief of FARM_UTTERANCES) {
    test(`"${brief}" → multi-unit-farm trigger`, () => {
      const d = chooseResearchDepth({ brief });
      expect(d.triggers).toContain("multi-unit-farm");
      // The farm trigger demands the deep research scan (it amortizes across the
      // whole batch) — so a farm brief never lands on `none`.
      expect(d.depth).toBe("deep");
    });
  }

  test("an explicit unitCount ≥4 fires the farm trigger even without farm wording", () => {
    const d = chooseResearchDepth({ brief: "a clean studio photo of the bottle", unitCount: 12 });
    expect(d.triggers).toContain("multi-unit-farm");
  });

  test("a single-item brief does NOT fire the farm trigger (negative control)", () => {
    const d = chooseResearchDepth({ brief: "make one short video about my coffee shop's new pastry" });
    expect(d.triggers).not.toContain("multi-unit-farm");
  });
});

// ─── (2) Surface: AGENTS.md routes the batch row to the producer farm mode ────

describe("farm-mode routing: the producer playbook is the reachable farm-mode home (#410)", () => {
  test("the producer playbook exists", () => {
    expect(fs.existsSync(PRODUCER)).toBe(true);
  });

  test("AGENTS.md routes the batch (N≥3) row to the producer playbook", () => {
    const producerLink = "docs/playbooks/producer.md";
    const rowsLinkingToProducer = AGENTS_MD.split("\n").filter((l) => l.includes(`(${producerLink})`));
    expect(rowsLinkingToProducer.length).toBeGreaterThan(0);
  });

  test("the batch (N≥3) routing line names farm mode + batch review", () => {
    // The dedicated batch line in AGENTS.md (`**Batch (N≥3).**`) is the route
    // that turns a multi-item ask into farm-mode orchestration.
    const batchLine = AGENTS_MD.split("\n").find((l) => /\*\*Batch \(N≥3\)/.test(l));
    expect(batchLine, "AGENTS.md must carry the **Batch (N≥3)** routing line").toBeDefined();
    const lower = (batchLine ?? "").toLowerCase();
    expect(lower).toContain("farm mode");
    expect(lower).toContain("batch review");
  });

  test("the producer playbook documents the content-farm workflow + batch review", () => {
    const producer = fs.readFileSync(PRODUCER, "utf8").toLowerCase();
    expect(producer).toContain("content-farm mode");
    // The farm workflow's triage primitive + the publish-copy handoff.
    expect(producer).toContain("ralphy batch review");
    expect(producer).toContain("unit caption --bulk");
  });
});
