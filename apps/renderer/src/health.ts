export interface HealthPayload {
  service: "markdown-mint-renderer";
  status: "ok";
  version: string;
}

export function createHealthPayload(
  version = process.env.RENDERER_VERSION ?? "development",
): HealthPayload {
  return {
    service: "markdown-mint-renderer",
    status: "ok",
    version,
  };
}
