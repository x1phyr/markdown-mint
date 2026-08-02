export interface HealthPayload {
  service: "markdown-mint-renderer";
  status: "ok";
  version: string;
}

export function createHealthPayload(version = "0.0.0"): HealthPayload {
  return {
    service: "markdown-mint-renderer",
    status: "ok",
    version,
  };
}
