import type {
  ArticleContext,
  DownloadCandidate,
  PaperMetadata,
} from "@papername/core";
import { isLikelyPdfDownload, usesTakeaway } from "@papername/core";

import { ensureApiToken } from "../src/account";
import { latencyBucket, requestGist, sendTelemetry } from "../src/backend";
import { mergePaperMetadata } from "../src/context";
import { decideDownload, type DownloadDecision } from "../src/decision";
import { enrichMetadata } from "../src/enrichment";
import { isPdfPressMessage } from "../src/pdf-press";
import {
  getContexts,
  getSettings,
  removeContext,
  saveContext,
  saveLastOutcome,
  updateSettings,
} from "../src/storage";
import { pendingTakeaway, startTakeaway } from "../src/takeaway";
import type { ToastPayload } from "../src/toast";
import { attachTrustedViewerUrl, isAdobeAcrobatDownload } from "../src/viewer";

interface ContextMessage {
  type: "papername:context";
  metadata: PaperMetadata;
  pageUrl: string;
}

function isContextMessage(message: unknown): message is ContextMessage {
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "papername:context" &&
    "metadata" in message &&
    "pageUrl" in message &&
    typeof message.pageUrl === "string",
  );
}

async function contextFor(
  tabId: number,
  pageUrl: string,
): Promise<ArticleContext | undefined> {
  return (await getContexts()).find(
    (item) => item.tabId === tabId && item.pageUrl === pageUrl,
  );
}

/** The press can arrive before the context message finished saving. */
async function awaitContext(
  tabId: number,
  pageUrl: string,
): Promise<ArticleContext | undefined> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const context = await contextFor(tabId, pageUrl);
    if (context) return context;
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  return undefined;
}

async function rememberTakeaway(
  context: ArticleContext,
  takeaway: string,
): Promise<void> {
  const current = await contextFor(context.tabId, context.pageUrl);
  if (current && !current.takeaway) await saveContext({ ...current, takeaway });
}

function sendToast(tabId: number, payload: ToastPayload): void {
  void chrome.tabs.sendMessage(tabId, payload).catch(() => undefined);
}

async function decideAndRecord(
  download: DownloadCandidate,
  contexts: ArticleContext[],
): Promise<DownloadDecision> {
  const startedAt = performance.now();
  const settings = await getSettings();
  const decision = await decideDownload({
    contexts,
    download,
    settings,
    requestGist: settings.apiToken
      ? (metadata, signal) => requestGist(metadata, settings.apiToken!, signal)
      : undefined,
    pendingGist: pendingTakeaway,
  });
  if (typeof decision.remaining === "number")
    await updateSettings({ remaining: decision.remaining });
  if (decision.reason !== "disabled") {
    const { tabId, pageUrl, takeaway, ...outcome } = decision;
    await saveLastOutcome({ ...outcome, at: new Date().toISOString() });
    if (takeaway && tabId !== undefined && pageUrl) {
      const context = contexts.find(
        (item) => item.tabId === tabId && item.pageUrl === pageUrl,
      );
      if (context) await rememberTakeaway(context, takeaway);
    }
    if (
      tabId !== undefined &&
      settings.toastEnabled &&
      usesTakeaway(settings.preset) &&
      decision.reason !== "unmatched_download"
    ) {
      sendToast(
        tabId,
        decision.outcome === "renamed" && decision.suggestion
          ? {
              type: "papername:toast",
              state: "named",
              filename: decision.suggestion,
              ...(typeof decision.remaining === "number"
                ? { remaining: decision.remaining }
                : {}),
            }
          : {
              type: "papername:toast",
              state: "fallback",
              reason: decision.reason,
              ...(typeof decision.remaining === "number"
                ? { remaining: decision.remaining }
                : {}),
            },
      );
    }
    if (settings.telemetryEnabled && settings.apiToken) {
      void sendTelemetry(settings.apiToken, {
        event: "rename_result",
        preset: settings.preset,
        outcome: decision.outcome,
        reason: decision.reason,
        latencyBucket: latencyBucket(performance.now() - startedAt),
      }).catch(() => undefined);
    }
  }
  return decision;
}

async function handlePdfPress(tabId: number, pageUrl: string): Promise<void> {
  const settings = await getSettings();
  if (
    !settings.enabled ||
    !usesTakeaway(settings.preset) ||
    !settings.gistConsent
  )
    return;
  const context = await awaitContext(tabId, pageUrl);
  if (!context || context.takeaway || pendingTakeaway(context)) return;
  if (!context.metadata.abstract) return;
  if (
    settings.preset === "citation_gist" &&
    !context.metadata.authors.some((author) => author.name.trim())
  )
    return;
  const token = await ensureApiToken();
  if (!token) return;
  startTakeaway({
    context,
    request: (metadata, signal) => requestGist(metadata, token, signal),
    remember: rememberTakeaway,
  });
  if (settings.toastEnabled)
    sendToast(tabId, { type: "papername:toast", state: "preparing" });
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    if (sender.tab?.id === undefined) return;
    const tabId = sender.tab.id;
    if (isPdfPressMessage(message)) {
      void handlePdfPress(tabId, message.pageUrl).catch(() => undefined);
      return;
    }
    if (!isContextMessage(message)) return;
    void (async () => {
      const prior = await contextFor(tabId, message.pageUrl);
      const context: ArticleContext = {
        metadata: mergePaperMetadata(message.metadata, prior?.metadata),
        pageUrl: message.pageUrl,
        capturedAt: Date.now(),
        tabId,
        ...(prior?.takeaway ? { takeaway: prior.takeaway } : {}),
      };
      await saveContext(context);
      const settings = await getSettings();
      if (usesTakeaway(settings.preset) && settings.gistConsent) {
        const metadata = await enrichMetadata(context.metadata);
        const current = (await getContexts()).find(
          (item) => item.tabId === tabId,
        );
        if (
          metadata !== context.metadata &&
          current?.pageUrl === context.pageUrl
        ) {
          await saveContext({
            ...current,
            metadata: mergePaperMetadata(current.metadata, metadata),
          });
        }
      }
    })();
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void removeContext(tabId);
  });

  chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    void (async () => {
      try {
        let download: DownloadCandidate = {
          url: item.url,
          ...(item.finalUrl ? { finalUrl: item.finalUrl } : {}),
          ...(item.referrer ? { referrer: item.referrer } : {}),
          filename: item.filename,
          ...(item.mime ? { mime: item.mime } : {}),
        };
        if (isAdobeAcrobatDownload(download)) {
          const [activeTab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true,
          });
          download = attachTrustedViewerUrl(download, activeTab?.url);
        }
        if (!isLikelyPdfDownload(download)) {
          suggest();
          return;
        }
        const decision = await decideAndRecord(download, await getContexts());
        suggest(
          decision.suggestion
            ? { filename: decision.suggestion, conflictAction: "uniquify" }
            : undefined,
        );
      } catch {
        console.error("[Papername] Could not determine a filename");
        suggest();
      }
    })();
    return true;
  });
});
