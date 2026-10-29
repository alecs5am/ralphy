import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { renderNextStep } from "../../cli/lib/render/next-step.js";
import type { ContractEvaluation, ContractPhaseResult } from "../../cli/lib/contract.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { setRoot } from "../../cli/lib/paths.js";
import { makeTmpRoot } from "../helpers/tmp-root";

function phase(id: string, present: boolean): ContractPhaseResult {
  return { id, label: id, artifact: id, required: true, present, satisfied: present, rationale: "" };
}

function evaluation(phases: ContractPhaseResult[]): ContractEvaluation {
  return { project: "demo-001", kind: "video", phases, missingRequired: [] } as unknown as ContractEvaluation;
}

describe("renderNextStep (#575)", () => {
  test("points at eval when eval.json is missing", () => {
    const next = renderNextStep("demo-001", () =>
      evaluation([phase("render", true), phase("eval", false), phase("unit", false)]),
    );
    expect(next.phase).toBe("eval");
    expect(next.command).toBe("ralphy eval video demo-001");
    expect(next.contract).toBe("ralphy project status demo-001 --contract");
  });

  test("moves on to the unit once eval exists", () => {
    const next = renderNextStep("demo-001", () =>
      evaluation([phase("render", true), phase("eval", true), phase("unit", false)]),
    );
    expect(next.phase).toBe("unit");
    expect(next.command).toContain("ralphy unit create demo-001");
  });

  test("suggests a postmortem when eval and unit exist", () => {
    const next = renderNextStep("demo-001", () =>
      evaluation([phase("eval", true), phase("unit", true), phase("postmortem", true)]),
    );
    expect(next.phase).toBe("postmortem");
  });

  test("falls back to eval when the contract cannot be evaluated", () => {
    const next = renderNextStep("demo-001", () => {
      throw new Error("no project");
    });
    expect(next.phase).toBe("eval");
  });

  test("does not initialize a store on a legacy render root (#589)", () => {
    const tmp = makeTmpRoot("ralphy-next-step-589");
    try {
      closeDomainDb();
      fs.mkdirSync(path.join(tmp.dir, ".ralphy", "workspaces", "default", "projects", "demo-001", "render"), {
        recursive: true,
      });
      expect(renderNextStep("demo-001").phase).toBe("eval");
      expect(fs.existsSync(path.join(tmp.dir, ".ralphy", "ralphy.db"))).toBe(false);
    } finally {
      closeDomainDb();
      setRoot(path.resolve(import.meta.dir, "..", ".."));
      tmp.cleanup();
    }
  });
});
