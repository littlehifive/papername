import { describe, expect, it } from "vitest";

import {
  buildFilename,
  sanitizeBasename,
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

describe("download filename", () => {
  it("uses an APA-like citation label by default", () => {
    expect(buildFilename({ metadata: paper, preset: "citation" })).toEqual({
      filename: "Williams et al. (2008).pdf",
      outcome: "renamed",
      reason: "selected_preset",
    });
  });

  it.each([
    [
      "citation_title",
      undefined,
      "Williams et al. (2008) — Holding warm coffee increases perceived interpersonal warmth.pdf",
    ],
    [
      "title",
      undefined,
      "Holding warm coffee increases perceived interpersonal warmth.pdf",
    ],
    [
      "citation_gist",
      "Warm objects increase perceived interpersonal warmth",
      "Williams et al. (2008) — Warm objects increase perceived interpersonal warmth.pdf",
    ],
    [
      "gist",
      "Warm objects increase perceived interpersonal warmth",
      "Warm objects increase perceived interpersonal warmth.pdf",
    ],
  ] as const)("renders the %s preset", (preset, gist, expected) => {
    expect(buildFilename({ metadata: paper, preset, gist }).filename).toBe(
      expected,
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

  it("falls back from gist to citation plus title without an abstract", () => {
    expect(
      buildFilename({
        metadata: { ...paper, abstract: undefined },
        preset: "citation_gist",
      }),
    ).toEqual({
      filename:
        "Williams et al. (2008) — Holding warm coffee increases perceived interpersonal warmth.pdf",
      outcome: "fallback",
      reason: "missing_abstract",
    });
  });

  it("falls back from takeaway-only to the title, then to the citation", () => {
    expect(
      buildFilename({
        metadata: paper,
        preset: "gist",
        gistFailure: "gist_timeout",
      }),
    ).toEqual({
      filename:
        "Holding warm coffee increases perceived interpersonal warmth.pdf",
      outcome: "fallback",
      reason: "gist_timeout",
    });
    expect(
      buildFilename({
        metadata: { ...paper, abstract: undefined },
        preset: "gist",
      }),
    ).toMatchObject({ outcome: "fallback", reason: "missing_abstract" });
    expect(
      buildFilename({ metadata: { ...paper, title: "" }, preset: "gist" }),
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
