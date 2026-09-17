import { describe, expect, it } from "vitest";

import {
  DEFAULT_CUSTOM_TEMPLATE,
  hasMetadataToken,
  isTemplate,
  moveToken,
  PRESET_TEMPLATES,
  templatePattern,
  TEMPLATE_MAX_TOKENS,
  TEXT_TOKEN_MAX_LENGTH,
  type FilenameTemplate,
} from "../src/index";

const colonTemplate: FilenameTemplate = [
  { kind: "authors" },
  { kind: "text", value: " (" },
  { kind: "year" },
  { kind: "text", value: "): " },
  { kind: "title" },
];

describe("filename template pattern", () => {
  it("renders metadata pieces in brackets and text verbatim", () => {
    expect(templatePattern(colonTemplate)).toBe("[Authors] ([Year]): [Title]");
    expect(templatePattern(PRESET_TEMPLATES.citation)).toBe(
      "[Authors] ([Year])",
    );
    expect(templatePattern(PRESET_TEMPLATES.citation_title)).toBe(
      "[Authors] ([Year]) — [Title]",
    );
  });

  it("seeds the custom format from the authors, year and title preset", () => {
    expect(DEFAULT_CUSTOM_TEMPLATE).toEqual(PRESET_TEMPLATES.citation_title);
  });
});

describe("moveToken", () => {
  it("moves a piece forward and backward", () => {
    expect(templatePattern(moveToken(colonTemplate, 4, 0))).toBe(
      "[Title][Authors] ([Year]): ",
    );
    expect(templatePattern(moveToken(colonTemplate, 0, 4))).toBe(
      " ([Year]): [Title][Authors]",
    );
  });

  it("clamps the destination and ignores no-op or invalid moves", () => {
    expect(templatePattern(moveToken(colonTemplate, 4, 99))).toBe(
      templatePattern(colonTemplate),
    );
    expect(templatePattern(moveToken(colonTemplate, 0, -5))).toBe(
      templatePattern(colonTemplate),
    );
    expect(moveToken(colonTemplate, 2, 2)).toBe(colonTemplate);
    expect(moveToken(colonTemplate, 9, 0)).toBe(colonTemplate);
  });

  it("does not mutate the input", () => {
    const before = structuredClone(colonTemplate);
    moveToken(colonTemplate, 0, 4);
    expect(colonTemplate).toEqual(before);
  });
});

describe("isTemplate", () => {
  it("accepts well-formed templates, including duplicates and empty text", () => {
    expect(isTemplate(colonTemplate)).toBe(true);
    expect(isTemplate([])).toBe(true);
    expect(isTemplate([{ kind: "title" }, { kind: "title" }])).toBe(true);
    expect(isTemplate([{ kind: "text", value: "" }])).toBe(true);
  });

  it.each([
    ["not an array", { kind: "title" }],
    ["unknown kind", [{ kind: "abstract" }]],
    ["text without a string value", [{ kind: "text", value: 3 }]],
    [
      "over-long text",
      [{ kind: "text", value: "x".repeat(TEXT_TOKEN_MAX_LENGTH + 1) }],
    ],
    [
      "too many pieces",
      Array.from({ length: TEMPLATE_MAX_TOKENS + 1 }, () => ({
        kind: "year",
      })),
    ],
    ["null entries", [null]],
  ])("rejects %s", (_label, value) => {
    expect(isTemplate(value)).toBe(false);
  });
});

describe("hasMetadataToken", () => {
  it("distinguishes text-only templates", () => {
    expect(hasMetadataToken(colonTemplate)).toBe(true);
    expect(hasMetadataToken([{ kind: "text", value: "paper" }])).toBe(false);
    expect(hasMetadataToken([])).toBe(false);
  });
});
