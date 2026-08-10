import { isMainThread, parentPort } from "node:worker_threads";
import { buildShallowCatalog } from "./catalog";
import type { WorkerRequest, WorkerResponse } from "./types";

function post(message: WorkerResponse): void {
  parentPort?.postMessage(message);
}

function startWorkerRuntime(): void {
  parentPort?.on("message", (message: WorkerRequest) => {
    void buildShallowCatalog(
      message.rootPath,
      message.generation,
      (progress) => post({ type: "catalog-progress", requestId: message.requestId, progress }),
    ).then(
      (result) => post({ type: "catalog-result", requestId: message.requestId, result }),
      (error: unknown) => post({
        type: "error",
        requestId: message.requestId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  });
}

if (!isMainThread && parentPort) startWorkerRuntime();
