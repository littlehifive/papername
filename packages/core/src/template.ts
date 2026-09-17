import {
  METADATA_TOKEN_KINDS,
  type FilenameTemplate,
  type MetadataTokenKind,
  type Preset,
  type TemplateToken,
} from "./types";

export const TEXT_TOKEN_MAX_LENGTH = 40;
export const TEMPLATE_MAX_TOKENS = 12;

/** Characters that `sanitizeBasename` replaces because filesystems reject them. */
export const UNSAFE_BASENAME_CHARS = /[\\/:*?"<>|]/;

export const PRESET_TEMPLATES: Record<
  Exclude<Preset, "custom">,
  FilenameTemplate
> = {
  citation: [
    { kind: "authors" },
    { kind: "text", value: " (" },
    { kind: "year" },
    { kind: "text", value: ")" },
  ],
  citation_title: [
    { kind: "authors" },
    { kind: "text", value: " (" },
    { kind: "year" },
    { kind: "text", value: ") — " },
    { kind: "title" },
  ],
};

/** Seeded the first time a user chooses the custom format. */
export const DEFAULT_CUSTOM_TEMPLATE: FilenameTemplate =
  PRESET_TEMPLATES.citation_title;

export const TOKEN_LABELS: Record<MetadataTokenKind, string> = {
  authors: "Authors",
  year: "Year",
  title: "Title",
};

function isMetadataKind(value: unknown): value is MetadataTokenKind {
  return METADATA_TOKEN_KINDS.includes(value as MetadataTokenKind);
}

function isTemplateToken(value: unknown): value is TemplateToken {
  if (!value || typeof value !== "object") return false;
  const token = value as Record<string, unknown>;
  if (token.kind === "text") {
    return (
      typeof token.value === "string" &&
      [...token.value].length <= TEXT_TOKEN_MAX_LENGTH
    );
  }
  return isMetadataKind(token.kind);
}

/**
 * Shape check for a stored template. Duplicate metadata pieces are tolerated so a
 * hand-edited value is rendered rather than silently reset.
 */
export function isTemplate(value: unknown): value is FilenameTemplate {
  return (
    Array.isArray(value) &&
    value.length <= TEMPLATE_MAX_TOKENS &&
    value.every(isTemplateToken)
  );
}

export function hasMetadataToken(template: FilenameTemplate): boolean {
  return template.some((token) => token.kind !== "text");
}

/** Human-readable pattern such as `[Authors] ([Year]) — [Title]`. */
export function templatePattern(template: FilenameTemplate): string {
  return template
    .map((token) =>
      token.kind === "text" ? token.value : `[${TOKEN_LABELS[token.kind]}]`,
    )
    .join("");
}

/** Returns a new template with the piece at `from` moved to `to` (clamped). */
export function moveToken(
  template: FilenameTemplate,
  from: number,
  to: number,
): FilenameTemplate {
  if (from < 0 || from >= template.length) return template;
  const target = Math.max(0, Math.min(template.length - 1, to));
  if (target === from) return template;
  const next = [...template];
  const [token] = next.splice(from, 1);
  next.splice(target, 0, token!);
  return next;
}
