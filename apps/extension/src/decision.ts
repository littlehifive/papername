import {
  buildFilename,
  findMatchingContext,
  hasValidGistShape,
  usesTakeaway,
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
  toastEnabled: boolean;
  apiToken?: string;
  remaining?: number;
  proInterest?: boolean;
}

export interface GistResponse {
  usable: boolean;
  gist?: string;
  reason: string;
  remaining: number;
}

/** A takeaway request already running because the user pressed a PDF link. */
export interface PendingGist {
  startedAt: number;
  promise: Promise<GistResponse>;
}

export interface DownloadDecision {
  suggestion?: string;
  outcome: "renamed" | "fallback" | "unchanged";
  reason: RenameReason | "disabled" | "unmatched_download";
  remaining?: number;
  /** The article context that named this download, for toasts and caching. */
  tabId?: number;
  pageUrl?: string;
  /** A validated takeaway worth keeping on the context for a repeat save. */
  takeaway?: string;
}

export interface DecideDownloadInput {
  contexts: ArticleContext[];
  download: DownloadCandidate;
  settings: ExtensionSettings;
  requestGist?: (
    metadata: ArticleContext["metadata"],
    signal: AbortSignal,
  ) => Promise<GistResponse>;
  pendingGist?: (context: ArticleContext) => PendingGist | undefined;
  timeoutMs?: number;
  now?: () => number;
}

/** Hold from Chrome's filename hook when nothing was started earlier. */
export const HOOK_WAIT_MS = 1_500;
/** Total window measured from the PDF-link press that started the request. */
export const PRESS_WINDOW_MS = 2_500;

export function isValidClientGist(
  value: string | undefined,
  metadata: ArticleContext["metadata"],
): value is string {
  if (!value || !hasValidGistShape(value)) return false;
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
  return !repeatsYear && !repeatsAuthor;
}

function fromFilename(
  result: ReturnType<typeof buildFilename>,
  context?: ArticleContext,
): DownloadDecision {
  return {
    ...(result.filename ? { suggestion: result.filename } : {}),
    outcome: result.outcome,
    reason: result.reason,
    ...(context ? { tabId: context.tabId, pageUrl: context.pageUrl } : {}),
  };
}

type GistFailure = NonNullable<
  Parameters<typeof buildFilename>[0]["gistFailure"]
>;

export async function decideDownload(
  input: DecideDownloadInput,
): Promise<DownloadDecision> {
  if (!input.settings.enabled)
    return { outcome: "unchanged", reason: "disabled" };
  const now = input.now?.() ?? Date.now();
  const context = findMatchingContext(input.contexts, input.download, now);
  if (!context) return { outcome: "unchanged", reason: "unmatched_download" };

  const preset = input.settings.preset;
  if (!usesTakeaway(preset)) {
    return fromFilename(
      buildFilename({ metadata: context.metadata, preset }),
      context,
    );
  }

  const fallback = (gistFailure: GistFailure) =>
    fromFilename(
      buildFilename({ metadata: context.metadata, preset, gistFailure }),
      context,
    );

  if (
    preset === "citation_gist" &&
    !context.metadata.authors.some((author) => author.name.trim())
  ) {
    return fallback("gist_unavailable");
  }

  if (isValidClientGist(context.takeaway, context.metadata)) {
    return {
      ...fromFilename(
        buildFilename({
          metadata: context.metadata,
          preset,
          gist: context.takeaway,
        }),
        context,
      ),
      ...(typeof input.settings.remaining === "number"
        ? { remaining: input.settings.remaining }
        : {}),
    };
  }

  if (!context.metadata.abstract) return fallback("missing_abstract");
  if (
    !input.settings.gistConsent ||
    !input.settings.apiToken ||
    !input.requestGist
  ) {
    return fallback("gist_unavailable");
  }

  const pending = input.pendingGist?.(context);
  const controller = new AbortController();
  const waitMs = pending
    ? Math.max(0, pending.startedAt + PRESS_WINDOW_MS - now)
    : (input.timeoutMs ?? HOOK_WAIT_MS);
  const request = (
    pending?.promise ?? input.requestGist(context.metadata, controller.signal)
  )
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ type: "timeout" }>((resolve) => {
    timer = setTimeout(() => resolve({ type: "timeout" }), waitMs);
  });
  const settled = await Promise.race([request, timeout]);
  if (timer) clearTimeout(timer);

  if (settled.type === "timeout") {
    // A press-started request keeps running so its answer can be cached.
    if (!pending) controller.abort();
    return fallback("gist_timeout");
  }
  if (settled.type === "error") {
    const result = fallback(settled.reason);
    return typeof settled.remaining === "number"
      ? { ...result, remaining: settled.remaining }
      : result;
  }
  if (
    !settled.response.usable ||
    !isValidClientGist(settled.response.gist, context.metadata)
  ) {
    return {
      ...fallback(
        settled.response.usable ? "invalid_gist" : "gist_unavailable",
      ),
      remaining: settled.response.remaining,
    };
  }

  return {
    ...fromFilename(
      buildFilename({
        metadata: context.metadata,
        preset,
        gist: settled.response.gist,
      }),
      context,
    ),
    remaining: settled.response.remaining,
    takeaway: settled.response.gist,
  };
}
