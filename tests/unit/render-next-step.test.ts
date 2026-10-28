import { describe, expect, test } from "bun:test";
import { renderNextStep } from "../../cli/lib/render/next-step.js";
import type { ContractEvaluation, ContractPhaseResult } from "../../cli/lib/contract.js";

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
});
