export const PRESETS = [
  "citation",
  "citation_title",
  "title",
  "citation_gist",
] as const;

export type Preset = (typeof PRESETS)[number];

export interface PaperAuthor {
  name: string;
  familyName?: string;
  corporate?: boolean;
}

export interface PaperIdentifiers {
  doi?: string;
  arxivId?: string;
  pmid?: string;
}

export interface PaperMetadata {
  title: string;
  authors: PaperAuthor[];
  year?: string;
  abstract?: string;
  identifiers: PaperIdentifiers;
  pdfUrls: string[];
  sourceAdapter?: string;
}

export type RenameReason =
  | "selected_preset"
  | "missing_abstract"
  | "missing_author"
  | "gist_unavailable"
  | "gist_timeout"
  | "quota_exhausted"
  | "invalid_gist"
  | "missing_metadata"
  | "unmatched_download";

export interface FilenameResult {
  filename?: string;
  outcome: "renamed" | "fallback" | "unchanged";
  reason: RenameReason;
}

export interface ArticleContext {
  metadata: PaperMetadata;
  pageUrl: string;
  capturedAt: number;
  tabId: number;
}

export interface DownloadCandidate {
  url: string;
  finalUrl?: string;
  referrer?: string;
  filename: string;
  mime?: string;
  tabId?: number;
}
