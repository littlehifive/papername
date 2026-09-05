import { describe, expect, it, vi } from "vitest";

import { enrichMetadata } from "../src/enrichment";

describe("metadata enrichment", () => {
  it("fills missing Crossref fields without replacing page metadata", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            title: ["Remote title must not replace the page title"],
            author: [
              { given: "Jane", family: "Wu" },
              { name: "Genome Consortium" },
            ],
            published: { "date-parts": [[2026, 4, 3]] },
            abstract:
              "<jats:p>We report a carefully qualified result.</jats:p>",
          },
        }),
        { status: 200 },
      ),
    );

    const result = await enrichMetadata(
      {
        title: "Page title",
        authors: [],
        identifiers: { doi: "10.1000/example" },
        pdfUrls: ["https://publisher.test/paper.pdf"],
      },
      request,
    );

    expect(request).toHaveBeenCalledWith(
      "https://api.crossref.org/works/10.1000%2Fexample",
      expect.objectContaining({
        headers: expect.any(Object),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result).toMatchObject({
      title: "Page title",
      year: "2026",
      abstract: "We report a carefully qualified result.",
      authors: [
        { name: "Jane Wu", familyName: "Wu" },
        { name: "Genome Consortium", corporate: true },
      ],
    });
  });

  it("returns page metadata when no lookup is needed or lookup fails", async () => {
    const complete = {
      title: "Complete",
      authors: [{ name: "Jane Wu", familyName: "Wu" }],
      year: "2026",
      abstract: "Already present.",
      identifiers: { doi: "10.1000/complete" },
      pdfUrls: [],
    };
    const unused = vi.fn<typeof fetch>();
    await expect(enrichMetadata(complete, unused)).resolves.toBe(complete);
    expect(unused).not.toHaveBeenCalled();

    const failure = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    const incomplete = { ...complete, abstract: undefined };
    await expect(enrichMetadata(incomplete, failure)).resolves.toBe(incomplete);
  });
});
