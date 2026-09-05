import type {
  FilenameResult,
  PaperAuthor,
  PaperMetadata,
  Preset,
  RenameReason,
} from "./types";

const MAX_BASENAME_LENGTH = 180;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function familyName(author: PaperAuthor): string {
  if (author.corporate) return author.name.trim();
  if (author.familyName?.trim()) return author.familyName.trim();

  const name = author.name.trim();
  if (name.includes(",")) return name.split(",")[0]?.trim() ?? name;

  const parts = name.split(/\s+/);
  return parts.at(-1) ?? name;
}

export function formatCitation(metadata: PaperMetadata): string | undefined {
  const authors = metadata.authors.filter(
    (author) => author.name.trim().length > 0,
  );
  if (authors.length === 0) return undefined;

  let creator: string;
  if (authors.length === 1) {
    creator = familyName(authors[0]!);
  } else if (authors.length === 2) {
    creator = `${familyName(authors[0]!)} & ${familyName(authors[1]!)}`;
  } else {
    creator = `${familyName(authors[0]!)} et al.`;
  }

  return `${creator} (${metadata.year ?? "n.d."})`;
}

function truncateAtWord(value: string, maximum: number): string {
  if ([...value].length <= maximum) return value;
  const clipped = [...value].slice(0, maximum + 1).join("");
  const boundary = clipped.lastIndexOf(" ");
  return (
    boundary >= Math.floor(maximum * 0.6)
      ? clipped.slice(0, boundary)
      : [...clipped].slice(0, maximum).join("")
  ).trim();
}

export function sanitizeBasename(value: string): string {
  let result = value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/:*?"<>|]+/g, " — ")
    .replace(/\s+/g, " ")
    .replace(/(?:\s*[—-]\s*)+$/g, "")
    .replace(/[. ]+$/g, "")
    .trim();

  if (RESERVED_WINDOWS_NAMES.test(result)) result = `Paper — ${result}`;
  result = truncateAtWord(result, MAX_BASENAME_LENGTH).replace(/[. ]+$/g, "");
  return result;
}

function resultForBasename(
  basename: string | undefined,
  outcome: FilenameResult["outcome"],
  reason: RenameReason,
): FilenameResult {
  const sanitized = basename ? sanitizeBasename(basename) : "";
  if (!sanitized) return { outcome: "unchanged", reason: "missing_metadata" };
  return { filename: `${sanitized}.pdf`, outcome, reason };
}

export interface BuildFilenameInput {
  metadata: PaperMetadata;
  preset: Preset;
  gist?: string;
  gistFailure?: Exclude<
    RenameReason,
    | "selected_preset"
    | "missing_author"
    | "missing_metadata"
    | "unmatched_download"
  >;
}

export function buildFilename({
  metadata,
  preset,
  gist,
  gistFailure,
}: BuildFilenameInput): FilenameResult {
  const title = metadata.title.trim() || undefined;
  const citation = formatCitation(metadata);

  if (preset === "title")
    return resultForBasename(title, "renamed", "selected_preset");

  if (preset === "citation") {
    return citation
      ? resultForBasename(citation, "renamed", "selected_preset")
      : resultForBasename(
          title,
          title ? "fallback" : "unchanged",
          title ? "missing_author" : "missing_metadata",
        );
  }

  if (preset === "citation_title") {
    if (citation && title)
      return resultForBasename(
        `${citation} — ${title}`,
        "renamed",
        "selected_preset",
      );
    return resultForBasename(
      title ?? citation,
      "fallback",
      citation ? "missing_metadata" : "missing_author",
    );
  }

  if (gist && citation)
    return resultForBasename(
      `${citation} — ${gist}`,
      "renamed",
      "selected_preset",
    );
  if (citation && title) {
    return resultForBasename(
      `${citation} — ${title}`,
      "fallback",
      gistFailure ??
        (metadata.abstract ? "gist_unavailable" : "missing_abstract"),
    );
  }
  return resultForBasename(
    title ?? citation,
    "fallback",
    citation ? "missing_metadata" : "missing_author",
  );
}
