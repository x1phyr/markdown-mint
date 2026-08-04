const baseUrl = (process.env.RENDERER_BASE_URL ?? "http://127.0.0.1:4310").replace(/\/+$/u, "");
const requireSignedDownloads = process.env.RENDERER_REQUIRE_SIGNED_DOWNLOADS !== "0";
const requestId = "renderer-api-smoke";

const input = {
  appearance: { codeTheme: "github-light", density: "normal", themeId: "technical-mint" },
  document: { language: "en", title: "Renderer API smoke" },
  features: { cover: true, footer: true, header: true, pageNumber: true, toc: true },
  output: { format: "pdf" },
  page: { margin: "normal", orientation: "portrait", size: "A4" },
  source: {
    assets: [
      {
        bytes: Buffer.from([
          137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 2,
        ]).toString("base64"),
        mediaType: "image/png",
        path: "smoke.png",
      },
    ],
    markdown: "# Renderer API smoke\n\n![Smoke](./smoke.png)\n\nA real container export.",
  },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForJob(jobId) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const response = await fetch(`${baseUrl}/v1/exports/${jobId}`);
    assert(response.ok, `status request failed with ${response.status}`);
    const job = await response.json();
    if (["cancelled", "expired", "failed", "succeeded"].includes(job.state)) return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("renderer API smoke polling timed out");
}

const submitted = await fetch(`${baseUrl}/v1/exports`, {
  body: JSON.stringify(input),
  headers: {
    "content-type": "application/json",
    "idempotency-key": requestId,
    "x-request-id": requestId,
  },
  method: "POST",
});
assert(submitted.status === 202, `submit request failed with ${submitted.status}`);
assert(submitted.headers.get("x-request-id") === requestId, "request correlation header was lost");

const submittedJob = await submitted.json();
const job = await waitForJob(submittedJob.id);
assert(job.state === "succeeded", `export did not succeed: ${JSON.stringify(job)}`);
assert(job.traceId === requestId, "job trace ID did not preserve the request ID");
assert(job.artifact?.format === "pdf", "export did not return a PDF artifact");

const artifactUrl = job.downloads?.artifactUrl ?? `/v1/exports/${job.id}/artifact`;
const thumbnailUrl = job.downloads?.thumbnailUrl ?? `/v1/exports/${job.id}/thumbnail`;
if (requireSignedDownloads) {
  assert(artifactUrl.includes("signature="), "artifact URL is not signed");
  assert(thumbnailUrl.includes("signature="), "thumbnail URL is not signed");
}

const artifact = await fetch(new URL(artifactUrl, baseUrl));
const thumbnail = await fetch(new URL(thumbnailUrl, baseUrl));
assert(artifact.status === 200, `artifact download failed with ${artifact.status}`);
assert(thumbnail.status === 200, `thumbnail download failed with ${thumbnail.status}`);
assert(artifact.headers.get("content-type") === "application/pdf", "artifact is not a PDF");
assert((await artifact.arrayBuffer()).byteLength > 100, "PDF artifact is unexpectedly small");
assert((await thumbnail.arrayBuffer()).byteLength > 8, "thumbnail artifact is unexpectedly small");

if (requireSignedDownloads) {
  const unsigned = await fetch(`${baseUrl}/v1/exports/${job.id}/artifact`);
  assert(unsigned.status === 403, `unsigned artifact download returned ${unsigned.status}`);
}

console.log(
  JSON.stringify({
    artifactBytes: job.artifact.sizeBytes,
    pageCount: job.artifact.pageCount,
    requestId,
    state: job.state,
    thumbnailBytes: job.artifact.thumbnail?.sizeBytes,
    traceId: job.traceId,
  }),
);
