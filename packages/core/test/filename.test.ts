import { describe, expect, it } from "vitest";

import {
  buildFilename,
  formatCreator,
  formatYear,
  sanitizeBasename,
  type FilenameTemplate,
  type PaperMetadata,
} from "../src/index";

const paper: PaperMetadata = {
  title: "Holding warm coffee increases perceived interpersonal warmth",
  authors: [
    { name: "Lawrence E. Williams", familyName: "Williams" },
    { name: "John A. Bargh", familyName: "Bargh" },
    { name: "A Third Author", familyName: "Author" },
  ],
  year: "2008",
  abstract:
    "Holding a warm rather than cold object led participants to judge another person as warmer.",
  identifiers: {},
  pdfUrls: [],
};

const colonTemplate: FilenameTemplate = [
  { kind: "authors" },
  { kind: "text", value: " (" },
  { kind: "year" },
  { kind: "text", value: "): " },
  { kind: "title" },
];

const titleFirstTemplate: FilenameTemplate = [
  { kind: "title" },
  { kind: "text", value: " - " },
  { kind: "authors" },
  { kind: "text", value: " (" },
  { kind: "year" },
  { kind: "text", value: ")" },
];

describe("download filename", () => {
  it("uses an APA-like citation label by default", () => {
    expect(buildFilename({ metadata: paper, preset: "citation" })).toEqual({
      filename: "Williams et al. (2008).pdf",
      outcome: "renamed",
      reason: "selected_preset",
    });
  });

  it("renders the citation_title preset", () => {
    expect(
      buildFilename({ metadata: paper, preset: "citation_title" }).filename,
    ).toBe(
      "Williams et al. (2008) — Holding warm coffee increases perceived interpersonal warmth.pdf",
    );
  });

  it("uses both family names for exactly two authors", () => {
    expect(
      buildFilename({
        metadata: { ...paper, authors: paper.authors.slice(0, 2) },
        preset: "citation",
      }).filename,
    ).toBe("Williams & Bargh (2008).pdf");
  });

  it("uses n.d. when a year is unavailable", () => {
    expect(
      buildFilename({
        metadata: { ...paper, year: undefined },
        preset: "citation",
      }).filename,
    ).toBe("Williams et al. (n.d.).pdf");
  });

  it("falls back to the title when no author is available", () => {
    expect(
      buildFilename({
        metadata: { ...paper, authors: [] },
        preset: "citation",
      }),
    ).toEqual({
      filename:
        "Holding warm coffee increases perceived interpersonal warmth.pdf",
      outcome: "fallback",
      reason: "missing_author",
    });
  });

  it("falls back to the citation when the title is missing", () => {
    expect(
      buildFilename({
        metadata: { ...paper, title: "  " },
        preset: "citation_title",
      }),
    ).toEqual({
      filename: "Williams et al. (2008).pdf",
      outcome: "fallback",
      reason: "missing_metadata",
    });
  });

  it("preserves the original download when useful metadata is absent", () => {
    expect(
      buildFilename({
        metadata: { ...paper, title: "", authors: [] },
        preset: "citation",
      }),
    ).toEqual({ outcome: "unchanged", reason: "missing_metadata" });
  });
});

describe("custom filename template", () => {
  it("renders pieces in order and sanitizes a colon in fixed text", () => {
    expect(
      buildFilename({
        metadata: paper,
        preset: "custom",
        template: colonTemplate,
      }),
    ).toEqual({
      filename:
        "Williams et al. (2008) — Holding warm coffee increases perceived interpersonal warmth.pdf",
      outcome: "renamed",
      reason: "selected_preset",
    });
  });

  it("supports a title-first arrangement", () => {
    expect(
      buildFilename({
        metadata: paper,
        preset: "custom",
        template: titleFirstTemplate,
      }).filename,
    ).toBe(
      "Holding warm coffee increases perceived interpersonal warmth - Williams et al. (2008).pdf",
    );
  });

  it("renders n.d. for a missing year", () => {
    expect(
      buildFilename({
        metadata: { ...paper, year: undefined },
        preset: "custom",
        template: colonTemplate,
      }).filename,
    ).toBe(
      "Williams et al. (n.d.) — Holding warm coffee increases perceived interpersonal warmth.pdf",
    );
  });

  it("falls back to the title instead of a half-rendered template when authors are missing", () => {
    expect(
      buildFilename({
        metadata: { ...paper, authors: [] },
        preset: "custom",
        template: titleFirstTemplate,
      }),
    ).toEqual({
      filename:
        "Holding warm coffee increases perceived interpersonal warmth.pdf",
      outcome: "fallback",
      reason: "missing_author",
    });
  });

  it("falls back to the citation when a title-only template has no title", () => {
    expect(
      buildFilename({
        metadata: { ...paper, title: "" },
        preset: "custom",
        template: [{ kind: "title" }],
      }),
    ).toEqual({
      filename: "Williams et al. (2008).pdf",
      outcome: "fallback",
      reason: "missing_metadata",
    });
  });

  it.each([
    ["an undefined template", undefined],
    ["an empty template", []],
    ["a text-only template", [{ kind: "text", value: "paper" }]],
  ] as const)("uses authors, year and title for %s", (_label, template) => {
    expect(
      buildFilename({
        metadata: paper,
        preset: "custom",
        template: template as FilenameTemplate | undefined,
      }),
    ).toEqual({
      filename:
        "Williams et al. (2008) — Holding warm coffee increases perceived interpersonal warmth.pdf",
      outcome: "renamed",
      reason: "selected_preset",
    });
  });

  it("collapses whitespace-only text pieces", () => {
    expect(
      buildFilename({
        metadata: paper,
        preset: "custom",
        template: [
          { kind: "title" },
          { kind: "text", value: "   " },
          { kind: "year" },
        ],
      }).filename,
    ).toBe(
      "Holding warm coffee increases perceived interpersonal warmth 2008.pdf",
    );
  });
});

describe("citation pieces", () => {
  it("formats the creator by author count and keeps corporate names verbatim", () => {
    expect(formatCreator(paper)).toBe("Williams et al.");
    expect(
      formatCreator({ ...paper, authors: paper.authors.slice(0, 1) }),
    ).toBe("Williams");
    expect(
      formatCreator({
        ...paper,
        authors: [{ name: "World Health Organization", corporate: true }],
      }),
    ).toBe("World Health Organization");
    expect(formatCreator({ ...paper, authors: [{ name: "  " }] })).toBe(
      undefined,
    );
  });

  it("formats the year with an n.d. placeholder", () => {
    expect(formatYear(paper)).toBe("2008");
    expect(formatYear({ ...paper, year: undefined })).toBe("n.d.");
    expect(formatYear({ ...paper, year: " " })).toBe("n.d.");
  });
});

describe("filename safety", () => {
  it("normalizes path punctuation without discarding Unicode", () => {
    expect(sanitizeBasename("Café / memory: a test?")).toBe(
      "Café — memory — a test",
    );
  });

  it("preserves meaningful hyphens in titles", () => {
    expect(sanitizeBasename("Evidence-based COVID-19 research")).toBe(
      "Evidence-based COVID-19 research",
    );
  });

  it("protects Windows reserved basenames", () => {
    expect(sanitizeBasename("NUL")).toBe("Paper — NUL");
  });

  it("limits basenames to 180 Unicode characters at a word boundary", () => {
    const value = sanitizeBasename("meaningful ".repeat(30));
    expect([...value].length).toBeLessThanOrEqual(180);
    expect(value.endsWith("meaningful")).toBe(true);
  });
});
