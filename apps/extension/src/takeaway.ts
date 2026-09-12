import type { ArticleContext } from "@papername/core";

import {
  isValidClientGist,
  type GistResponse,
  type PendingGist,
} from "./decision";

/**
 * Press-started takeaway requests, keyed by tab and page. The service worker
 * may be stopped between a press and the download; then the filename hook
 * simply starts its own request.
 */
const pending = new Map<string, PendingGist>();

function key(context: Pick<ArticleContext, "tabId" | "pageUrl">): string {
  return `${context.tabId}|${context.pageUrl}`;
}

export function pendingTakeaway(
  context: Pick<ArticleContext, "tabId" | "pageUrl">,
): PendingGist | undefined {
  return pending.get(key(context));
}

export interface StartTakeawayInput {
  context: ArticleContext;
  request: (
    metadata: ArticleContext["metadata"],
    signal: AbortSignal,
  ) => Promise<GistResponse>;
  /** Persists a validated takeaway onto the tab context for repeat saves. */
  remember: (context: ArticleContext, takeaway: string) => Promise<void>;
  now?: () => number;
}

/** Starts a request unless one is already running for this tab and page. */
export function startTakeaway(input: StartTakeawayInput): PendingGist {
  const existing = pendingTakeaway(input.context);
  if (existing) return existing;
  const controller = new AbortController();
  const promise = input.request(input.context.metadata, controller.signal);
  const entry: PendingGist = {
    startedAt: input.now?.() ?? Date.now(),
    promise,
  };
  pending.set(key(input.context), entry);
  void promise
    .then(async (response) => {
      if (
        response.usable &&
        isValidClientGist(response.gist, input.context.metadata)
      ) {
        await input.remember(input.context, response.gist);
      }
    })
    .catch(() => undefined)
    .finally(() => {
      if (pending.get(key(input.context)) === entry)
        pending.delete(key(input.context));
    });
  return entry;
}

export function clearPendingTakeaways(): void {
  pending.clear();
}
