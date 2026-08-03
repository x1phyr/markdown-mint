import { createHmac, timingSafeEqual } from "node:crypto";

export type DownloadKind = "artifact" | "thumbnail";

export interface DownloadPathOptions {
  expiresAt?: number;
  nowMs?: number;
  secret?: string;
  ttlSeconds?: number;
}

function signingPayload(jobId: string, kind: DownloadKind, expiresAt: number): string {
  return `${jobId}:${kind}:${expiresAt}`;
}

function signatureFor(
  secret: string,
  jobId: string,
  kind: DownloadKind,
  expiresAt: number,
): string {
  return createHmac("sha256", secret)
    .update(signingPayload(jobId, kind, expiresAt))
    .digest("hex");
}

function expiryFor(nowMs: number, ttlSeconds: number): number {
  return Math.floor(nowMs / 1000) + ttlSeconds;
}

export function createDownloadPath(
  jobId: string,
  kind: DownloadKind,
  options: DownloadPathOptions = {},
): string {
  const path = `/v1/exports/${encodeURIComponent(jobId)}/${kind}`;
  const secret = options.secret?.trim();
  if (!secret) return path;

  const expiresAt =
    options.expiresAt ?? expiryFor(options.nowMs ?? Date.now(), options.ttlSeconds ?? 300);
  const signature = signatureFor(secret, jobId, kind, expiresAt);
  return `${path}?expires=${expiresAt}&signature=${signature}`;
}

export function verifyDownloadSignature(input: {
  expiresAt: string | null;
  jobId: string;
  kind: DownloadKind;
  nowMs?: number;
  secret: string;
  signature: string | null;
}): boolean {
  const expiresAt = input.expiresAt;
  if (!expiresAt || !/^\d+$/u.test(expiresAt)) return false;
  const parsedExpiry = Number(expiresAt);
  if (!Number.isSafeInteger(parsedExpiry)) return false;
  if (parsedExpiry <= Math.floor((input.nowMs ?? Date.now()) / 1000)) return false;

  const candidate = input.signature;
  if (!candidate || !/^[a-f0-9]{64}$/u.test(candidate)) return false;
  const expected = signatureFor(input.secret, input.jobId, input.kind, parsedExpiry);
  const expectedBytes = Buffer.from(expected, "utf8");
  const candidateBytes = Buffer.from(candidate, "utf8");
  return (
    expectedBytes.byteLength === candidateBytes.byteLength &&
    timingSafeEqual(expectedBytes, candidateBytes)
  );
}
