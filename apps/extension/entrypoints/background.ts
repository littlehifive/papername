import type {
  ArticleContext,
  DownloadCandidate,
  PaperMetadata,
} from "@papername/core";
import { isLikelyPdfDownload } from "@papername/core";

import { latencyBucket, requestGist, sendTelemetry } from "../src/backend";
import { mergePaperMetadata } from "../src/context";
import { decideDownload } from "../src/decision";
import { enrichMetadata } from "../src/enrichment";
import {
  getContexts,
  getSettings,
  removeContext,
  saveContext,
  saveLastOutcome,
  updateSettings,
} from "../src/storage";
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

async function decideAndRecord(
  download: DownloadCandidate,
  contexts: ArticleContext[],
) {
  const startedAt = performance.now();
  const settings = await getSettings();
  const decision = await decideDownload({
    contexts,
    download,
    settings,
    requestGist: settings.betaToken
      ? (metadata, signal) => requestGist(metadata, settings.betaToken!, signal)
      : undefined,
  });
  if (typeof decision.remaining === "number")
    await updateSettings({ remaining: decision.remaining });
  if (decision.reason !== "disabled") {
    await saveLastOutcome({
      ...decision,
      at: new Date().toISOString(),
    });
    if (settings.telemetryEnabled && settings.betaToken) {
      void sendTelemetry(settings.betaToken, {
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

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    if (sender.tab?.id === undefined) return;
    if (!isContextMessage(message)) return;
    const tabId = sender.tab.id;
    void (async () => {
      const prior = (await getContexts()).find(
        (item) => item.tabId === tabId && item.pageUrl === message.pageUrl,
      );
      const context: ArticleContext = {
        metadata: mergePaperMetadata(message.metadata, prior?.metadata),
        pageUrl: message.pageUrl,
        capturedAt: Date.now(),
        tabId,
      };
      await saveContext(context);
      const settings = await getSettings();
      if (
        settings.preset === "citation_gist" &&
        settings.gistConsent &&
        settings.betaToken
      ) {
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
