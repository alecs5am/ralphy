import type { ConsumerAuthority } from "../store/consumer-auth.js";
import {
  listRunResults,
  startConsumerOperationRunInTransaction,
} from "../store/consumer-runs.js";
import { withImmediateTransaction } from "../store/db.js";
import { insertJobInTransaction } from "../jobs/db.js";
import type { JobInsertInput } from "../jobs/types.js";
import { requestDigest } from "../store/canonical-json.js";
import type {
  ConsumerOperationStart,
  ExternalOperation,
  JsonValue,
  Page,
  RunDto,
  RunResultDto,
} from "../store/types.js";

export type ConsumerOperationContext = {
  sessionId: string;
  external: ExternalOperation;
};

export type OperationAccepted = {
  runId: string;
  state: RunDto["state"];
  results: Page<RunResultDto>;
  replayed: boolean;
};

export type ReplayableOperationInput = {
  authority: ConsumerAuthority;
  context: ConsumerOperationContext;
  workspaceId: string;
  projectId?: string;
  runKind?: string;
  label?: string;
  request: JsonValue;
  job: Omit<JobInsertInput, "run_id" | "project_id"> & { project_id?: string };
  resultsLimit?: number;
};

/**
 * Durable boundary for consumer-owned work. The transaction either creates a
 * Run plus its Job together or creates nothing; a replay returns the original
 * Run and never enqueues a second Job.
 */
export function startReplayableOperation(input: ReplayableOperationInput): OperationAccepted {
  const started = withImmediateTransaction((db) => {
    const operation = startConsumerOperationRunInTransaction(
      db,
      input.authority,
      {
        sessionId: input.context.sessionId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        kind: input.runKind ?? "operation",
        label: input.label,
        external: input.context.external,
        requestDigest: requestDigest(input.request, "External operation request"),
      },
    );
    if (!operation.replayed) {
      insertJobInTransaction(db, {
        ...input.job,
        run_id: operation.run.id,
        project_id: input.job.project_id ?? input.projectId,
      });
    }
    return operation;
  });

  return toAccepted(input, started);
}

export function startGenerationOperation(input: ReplayableOperationInput): OperationAccepted {
  return startReplayableOperation({ ...input, runKind: input.runKind || "generation" });
}

export function startTransformOperation(input: ReplayableOperationInput): OperationAccepted {
  return startReplayableOperation({ ...input, runKind: input.runKind || "transform" });
}

export function startTranscriptionOperation(input: ReplayableOperationInput): OperationAccepted {
  return startReplayableOperation({ ...input, runKind: input.runKind || "transcription" });
}

export function startRepairOperation(input: ReplayableOperationInput): OperationAccepted {
  return startReplayableOperation({ ...input, runKind: input.runKind || "repair" });
}

function toAccepted(
  input: ReplayableOperationInput,
  started: ConsumerOperationStart,
): OperationAccepted {
  return {
    runId: started.run.id,
    state: started.run.state,
    results: listRunResults({
      context: {
        sessionId: input.context.sessionId,
        consumerAuthority: input.authority,
      },
      runId: started.run.id,
      limit: input.resultsLimit ?? 100,
    }),
    replayed: started.replayed,
  };
}
