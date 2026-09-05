import {
  buildFilename,
  findMatchingContext,
  type ArticleContext,
  type DownloadCandidate,
  type Preset,
  type RenameReason,
} from "@papername/core";

export interface ExtensionSettings {
  enabled: boolean;
  preset: Preset;
  gistConsent: boolean;
  telemetryEnabled: boolean;
  betaToken?: string;
  remaining?: number;
  proInterest?: boolean;
}

export interface GistResponse {
  usable: boolean;
  gist?: string;
  reason: string;
  remaining: number;
}

export interface DownloadDecision {
  suggestion?: string;
  outcome: "renamed" | "fallback" | "unchanged";
  reason: RenameReason | "disabled" | "unmatched_download";
  remaining?: number;
}

export interface DecideDownloadInput {
  contexts: ArticleContext[];
  download: DownloadCandidate;
  settings: ExtensionSettings;
  requestGist?: (
    metadata: ArticleContext["metadata"],
    signal: AbortSignal,
  ) => Promise<GistResponse>;
  timeoutMs?: number;
  now?: () => number;
}

function isValidClientGist(
  value: string | undefined,
  metadata: ArticleContext["metadata"],
): value is string {
  if (
    !value ||
    /[\\/:*?"<>|\u0000-\u001f\u007f]/.test(value) ||
    /[.!?]$/.test(value.trim())
  )
    return false;
  const words = value.trim().split(/\s+/);
  const tokens = (text: string) =>
    text
      .normalize("NFKC")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const gistTokens = tokens(value);
  const containsSequence = (sequence: string[]) =>
    sequence.length > 0 &&
    gistTokens.some((_, start) =>
      sequence.every((token, offset) => gistTokens[start + offset] === token),
    );
  const repeatsYear = Boolean(
    metadata.year && containsSequence(tokens(metadata.year)),
  );
  const repeatsAuthor = metadata.authors.some((author) => {
    const family =
      author.familyName?.trim() || author.name.trim().split(/\s+/).at(-1);
    return Boolean(family && containsSequence(tokens(family)));
  });
  return (
    words.length >= 6 &&
    words.length <= 12 &&
    [...value].length <= 120 &&
    !repeatsYear &&
    !repeatsAuthor
  );
}

function fromFilename(
  result: ReturnType<typeof buildFilename>,
): DownloadDecision {
  return {
    ...(result.filename ? { suggestion: result.filename } : {}),
    outcome: result.outcome,
    reason: result.reason,
  };
}

export async function decideDownload(
  input: DecideDownloadInput,
): Promise<DownloadDecision> {
  if (!input.settings.enabled)
    return { outcome: "unchanged", reason: "disabled" };
  const context = findMatchingContext(
    input.contexts,
    input.download,
    input.now?.() ?? Date.now(),
  );
  if (!context) return { outcome: "unchanged", reason: "unmatched_download" };

  if (input.settings.preset !== "citation_gist") {
    return fromFilename(
      buildFilename({
        metadata: context.metadata,
        preset: input.settings.preset,
      }),
    );
  }

  if (!context.metadata.authors.some((author) => author.name.trim())) {
    return fromFilename(
      buildFilename({
        metadata: context.metadata,
        preset: "citation_gist",
        gistFailure: "gist_unavailable",
      }),
    );
  }

  if (!context.metadata.abstract) {
    return fromFilename(
      buildFilename({
        metadata: context.metadata,
        preset: "citation_gist",
        gistFailure: "missing_abstract",
      }),
    );
  }
  if (
    !input.settings.gistConsent ||
    !input.settings.betaToken ||
    !input.requestGist
  ) {
    return fromFilename(
      buildFilename({
        metadata: context.metadata,
        preset: "citation_gist",
        gistFailure: "gist_unavailable",
      }),
    );
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ type: "timeout" }>((resolve) => {
    timer = setTimeout(
      () => resolve({ type: "timeout" }),
      input.timeoutMs ?? 1_500,
    );
  });
  const request = input
    .requestGist(context.metadata, controller.signal)
    .then((response) => ({ type: "response" as const, response }))
    .catch((error: unknown) => ({
      type: "error" as const,
      reason:
        error &&
        typeof error === "object" &&
        "reason" in error &&
        error.reason === "quota_exhausted"
          ? ("quota_exhausted" as const)
          : ("gist_unavailable" as const),
      remaining:
        error &&
        typeof error === "object" &&
        "remaining" in error &&
        typeof error.remaining === "number"
          ? error.remaining
          : undefined,
    }));
  const settled = await Promise.race([request, timeout]);
  if (timer) clearTimeout(timer);

  if (settled.type === "timeout") {
    controller.abort();
    return fromFilename(
      buildFilename({
        metadata: context.metadata,
        preset: "citation_gist",
        gistFailure: "gist_timeout",
      }),
    );
  }
  if (settled.type === "error") {
    const result = fromFilename(
      buildFilename({
        metadata: context.metadata,
        preset: "citation_gist",
        gistFailure: settled.reason,
      }),
    );
    return typeof settled.remaining === "number"
      ? { ...result, remaining: settled.remaining }
      : result;
  }
  if (
    !settled.response.usable ||
    !isValidClientGist(settled.response.gist, context.metadata)
  ) {
    const result = fromFilename(
      buildFilename({
        metadata: context.metadata,
        preset: "citation_gist",
        gistFailure: settled.response.usable
          ? "invalid_gist"
          : "gist_unavailable",
      }),
    );
    return { ...result, remaining: settled.response.remaining };
  }

  const result = fromFilename(
    buildFilename({
      metadata: context.metadata,
      preset: "citation_gist",
      gist: settled.response.gist,
    }),
  );
  return { ...result, remaining: settled.response.remaining };
}
