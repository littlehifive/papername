import {
  buildFilename,
  findMatchingContext,
  type ArticleContext,
  type DownloadCandidate,
  type RenameReason,
} from "@papername/core";

import type { ExtensionSettings } from "./settings";

export type { ExtensionSettings } from "./settings";

export interface DownloadDecision {
  suggestion?: string;
  outcome: "renamed" | "fallback" | "unchanged";
  reason: RenameReason | "disabled" | "unmatched_download";
}

export interface DecideDownloadInput {
  contexts: ArticleContext[];
  download: DownloadCandidate;
  settings: ExtensionSettings;
  now?: () => number;
}

export function decideDownload(input: DecideDownloadInput): DownloadDecision {
  if (!input.settings.enabled)
    return { outcome: "unchanged", reason: "disabled" };
  const context = findMatchingContext(
    input.contexts,
    input.download,
    input.now?.() ?? Date.now(),
  );
  if (!context) return { outcome: "unchanged", reason: "unmatched_download" };

  const result = buildFilename({
    metadata: context.metadata,
    preset: input.settings.preset,
    template: input.settings.customTemplate,
  });
  return {
    ...(result.filename ? { suggestion: result.filename } : {}),
    outcome: result.outcome,
    reason: result.reason,
  };
}
