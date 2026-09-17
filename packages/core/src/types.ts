export const PRESETS = ["citation", "citation_title", "custom"] as const;

export type Preset = (typeof PRESETS)[number];

export const METADATA_TOKEN_KINDS = ["authors", "year", "title"] as const;

export type MetadataTokenKind = (typeof METADATA_TOKEN_KINDS)[number];

export type TemplateToken =
  { kind: MetadataTokenKind } | { kind: "text"; value: string };

/** Ordered pieces that are concatenated, then sanitized, to form a basename. */
export type FilenameTemplate = TemplateToken[];

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
  | "missing_author"
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
  /** Original HTTPS PDF page when a trusted viewer rewrites the download URL. */
  viewerUrl?: string;
  filename: string;
  mime?: string;
  tabId?: number;
}
