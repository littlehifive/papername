import { hasMetadataToken, isTemplate, PRESET_TEMPLATES } from "./template";
import type {
  FilenameResult,
  FilenameTemplate,
  MetadataTokenKind,
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

/** `Wu`, `Wu & Bargh`, or `Wu et al.`; undefined when no author is usable. */
export function formatCreator(metadata: PaperMetadata): string | undefined {
  const authors = metadata.authors.filter(
    (author) => author.name.trim().length > 0,
  );
  if (authors.length === 0) return undefined;
  if (authors.length === 1) return familyName(authors[0]!);
  if (authors.length === 2)
    return `${familyName(authors[0]!)} & ${familyName(authors[1]!)}`;
  return `${familyName(authors[0]!)} et al.`;
}

export function formatYear(metadata: PaperMetadata): string {
  return metadata.year?.trim() || "n.d.";
}

export function formatCitation(metadata: PaperMetadata): string | undefined {
  const creator = formatCreator(metadata);
  return creator ? `${creator} (${formatYear(metadata)})` : undefined;
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
  /** Used only when `preset` is `custom`. */
  template?: FilenameTemplate;
}

export function resolveTemplate(
  preset: Preset,
  template?: FilenameTemplate,
): FilenameTemplate {
  if (preset !== "custom") return PRESET_TEMPLATES[preset];
  return isTemplate(template) && hasMetadataToken(template)
    ? template
    : PRESET_TEMPLATES.citation_title;
}

export function buildFilename({
  metadata,
  preset,
  template,
}: BuildFilenameInput): FilenameResult {
  const title = metadata.title.trim() || undefined;
  const creator = formatCreator(metadata);
  const year = formatYear(metadata);
  const missing = new Set<MetadataTokenKind>();

  const rendered = resolveTemplate(preset, template)
    .map((token) => {
      switch (token.kind) {
        case "text":
          return token.value;
        case "year":
          return year;
        case "authors":
          if (!creator) missing.add("authors");
          return creator ?? "";
        case "title":
          if (!title) missing.add("title");
          return title ?? "";
      }
    })
    .join("");

  if (missing.size === 0)
    return resultForBasename(rendered, "renamed", "selected_preset");

  // Never emit a half-rendered template; fall back to the most useful whole piece.
  const citation = formatCitation(metadata);
  return resultForBasename(
    title ?? citation,
    "fallback",
    missing.has("authors") ? "missing_author" : "missing_metadata",
  );
}
