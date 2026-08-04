import type { JobStatus } from "./export-types";
import { parseJobPayload } from "./export-types";

export function createRendererClient(baseUrl: () => string) {
  function endpoint(path: string): string {
    if (/^https?:\/\//u.test(path)) return path;
    return `${baseUrl().replace(/\/+$/u, "")}${path}`;
  }

  function downloadEndpoint(job: JobStatus, kind: "artifact" | "thumbnail"): string {
    const path = kind === "artifact" ? job.downloads?.artifactUrl : job.downloads?.thumbnailUrl;
    return endpoint(path ?? `/v1/exports/${job.id}/${kind}`);
  }

  async function submitExport(body: unknown, idempotencyKey: string): Promise<JobStatus> {
    const response = await fetch(endpoint("/v1/exports"), {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      method: "POST",
    });
    if (!response.ok) throw new Error(`submit-${response.status}`);
    return parseJobPayload(await response.json());
  }

  async function pollJob(
    jobId: string,
    signal: AbortSignal,
    onUpdate: (job: JobStatus) => void,
  ): Promise<JobStatus> {
    while (true) {
      const response = await fetch(endpoint(`/v1/exports/${jobId}`), { signal });
      if (!response.ok) throw new Error(`poll-${response.status}`);
      const nextJob = parseJobPayload(await response.json());
      onUpdate(nextJob);
      if (["cancelled", "expired", "failed", "succeeded"].includes(nextJob.state)) return nextJob;
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
  }

  async function cancelExport(jobId: string): Promise<void> {
    await fetch(endpoint(`/v1/exports/${jobId}/cancel`), { method: "POST" });
  }

  async function retryExport(jobId: string): Promise<JobStatus> {
    const response = await fetch(endpoint(`/v1/exports/${jobId}/retry`), { method: "POST" });
    if (!response.ok) throw new Error(`retry-${response.status}`);
    return parseJobPayload(await response.json());
  }

  async function fetchBlob(job: JobStatus, kind: "artifact" | "thumbnail"): Promise<Blob> {
    const response = await fetch(downloadEndpoint(job, kind));
    if (!response.ok) throw new Error(`${kind}-${response.status}`);
    return response.blob();
  }

  return {
    cancelExport,
    downloadEndpoint,
    endpoint,
    fetchBlob,
    pollJob,
    retryExport,
    submitExport,
  };
}

export type RendererClient = ReturnType<typeof createRendererClient>;
