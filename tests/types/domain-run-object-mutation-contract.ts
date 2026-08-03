import { ingestObject } from "../../cli/lib/store/objects.js";
import {
  finishRun,
  finishRunAttempt,
  recordRunResult,
  startRun,
  startRunAttempt,
} from "../../cli/lib/store/runs.js";
import type {
  ObjectDto,
  RunAttemptDto,
  RunDto,
  RunResultDto,
} from "../../cli/lib/store/types.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Assert<Condition extends true> = Condition;

type ObjectHasExactSafeKeys = Assert<
  Equal<
    keyof ObjectDto,
    | "id"
    | "workspaceId"
    | "projectId"
    | "mime"
    | "bytes"
    | "storageClass"
    | "createdAt"
  >
>;
type RunMutationsReturnSafeDtos = Assert<
  Equal<
    [
      ReturnType<typeof startRun>,
      ReturnType<typeof startRunAttempt>,
      ReturnType<typeof finishRunAttempt>,
      ReturnType<typeof finishRun>,
      ReturnType<typeof recordRunResult>,
      ReturnType<typeof ingestObject>,
    ],
    [RunDto, RunAttemptDto, RunAttemptDto, RunDto, RunResultDto, Promise<ObjectDto>]
  >
>;

export type DomainRunObjectMutationContract = [
  ObjectHasExactSafeKeys,
  RunMutationsReturnSafeDtos,
];
