import type { PaperMetadata, Preset, RenameReason } from "@papername/core";
import { browser } from "wxt/browser";

import type { GistResponse } from "./decision";

const API_BASE =
  (import.meta.env.WXT_API_BASE_URL as string | undefined) ??
  "http://127.0.0.1:8787";

export class PapernameApiError extends Error {
  constructor(
    public readonly reason: string,
    public readonly remaining?: number,
    message = reason,
  ) {
    super(message);
  }
}

async function responseBody(
  response: Response,
): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function activateInvite(
  code: string,
): Promise<{ token: string; remaining: number }> {
  const response = await fetch(`${API_BASE}/v1/activate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const body = await responseBody(response);
  if (
    !response.ok ||
    typeof body.token !== "string" ||
    typeof body.remaining !== "number"
  ) {
    throw new PapernameApiError(
      typeof body.error === "string" ? body.error : "activation_failed",
    );
  }
  return { token: body.token, remaining: body.remaining };
}

export async function requestGist(
  metadata: PaperMetadata,
  token: string,
  signal: AbortSignal,
): Promise<GistResponse> {
  const response = await fetch(`${API_BASE}/v1/gist`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      title: metadata.title,
      abstract: metadata.abstract,
    }),
    signal,
  });
  const body = await responseBody(response);
  if (!response.ok) {
    throw new PapernameApiError(
      typeof body.reason === "string" ? body.reason : "gist_unavailable",
      typeof body.remaining === "number" ? body.remaining : undefined,
    );
  }
  return {
    usable: body.usable === true,
    ...(typeof body.gist === "string" ? { gist: body.gist } : {}),
    reason: typeof body.reason === "string" ? body.reason : "gist_unavailable",
    remaining: typeof body.remaining === "number" ? body.remaining : 0,
  };
}

export interface TelemetryInput {
  event: "rename_result" | "preset_changed" | "gist_result" | "pro_interest";
  preset: Preset | "none";
  outcome: "renamed" | "fallback" | "unchanged" | "selected" | "interested";
  reason: RenameReason | "ok" | "provider_error" | "none";
  latencyBucket: "lt250" | "250_750" | "750_1500" | "gt1500" | "na";
}

export async function sendTelemetry(
  token: string,
  input: TelemetryInput,
): Promise<void> {
  await fetch(`${API_BASE}/v1/events`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...input,
      version: browser.runtime.getManifest().version,
    }),
  });
}

export function latencyBucket(
  milliseconds: number,
): TelemetryInput["latencyBucket"] {
  if (milliseconds < 250) return "lt250";
  if (milliseconds < 750) return "250_750";
  if (milliseconds <= 1_500) return "750_1500";
  return "gt1500";
}
