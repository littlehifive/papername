import { describe, expect, it } from "vitest";

import { mergePaperMetadata } from "../src/context";

describe("article context updates", () => {
  it("keeps prior enrichment while preferring fields newly supplied by the page", () => {
    const result = mergePaperMetadata(
      {
        title: "Page title",
        authors: [],
        year: "2027",
        identifiers: { doi: "10.1000/example" },
        pdfUrls: ["https://publisher.test/main.pdf"],
        sourceAdapter: "springer",
      },
      {
        title: "Old title",
        authors: [{ name: "Jane Wu", familyName: "Wu" }],
        year: "2026",
        abstract: "An abstract supplied by enrichment.",
        identifiers: { doi: "10.1000/example", pmid: "123" },
        pdfUrls: ["https://cdn.test/main.pdf"],
      },
    );

    expect(result).toEqual({
      title: "Page title",
      authors: [{ name: "Jane Wu", familyName: "Wu" }],
      year: "2027",
      abstract: "An abstract supplied by enrichment.",
      identifiers: { doi: "10.1000/example", pmid: "123" },
      pdfUrls: ["https://publisher.test/main.pdf", "https://cdn.test/main.pdf"],
      sourceAdapter: "springer",
    });
  });
});
