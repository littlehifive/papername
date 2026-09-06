import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const saveContext = vi.hoisted(() => vi.fn());

vi.mock("../src/storage", () => ({ saveContext }));

import {
  landingPageCandidates,
  recoverDirectPdfContext,
} from "../src/direct-pdf";

describe("direct PDF landing-page recovery", () => {
  afterEach(() => {
    saveContext.mockReset();
    vi.unstubAllGlobals();
  });

  it.each([
    ["https://arxiv.org/pdf/2609.03012", ["https://arxiv.org/abs/2609.03012"]],
    [
      "https://eprints.gla.ac.uk/243676/1/243676.pdf",
      ["https://eprints.gla.ac.uk/243676/"],
    ],
    [
      "https://repository.example.edu/bitstream/handle/1234/5678/paper.pdf?sequence=1",
      ["https://repository.example.edu/handle/1234/5678"],
    ],
  ])("derives a narrow record page for %s", (pdfUrl, expected) => {
    expect(landingPageCandidates(pdfUrl)).toEqual(expected);
  });

  it("does not guess a landing page for an unknown PDF route", () => {
    expect(
      landingPageCandidates("https://publisher.example.edu/files/random.pdf"),
    ).toEqual([]);
    expect(
      landingPageCandidates(
        "https://papers.ssrn.com/sol3/Delivery.cfm?abstractid=4495516",
      ),
    ).toEqual([]);
    expect(
      landingPageCandidates(
        "https://digitalcommons.example.edu/cgi/viewcontent.cgi?article=1178&context=psychfacpub",
      ),
    ).toEqual([]);
  });

  it.each([
    "https://repository.example.edu/bitstream/handle/1234/%252Faccount/paper.pdf",
  ])("rejects unsafe record path components in %s", (pdfUrl) => {
    expect(landingPageCandidates(pdfUrl)).toEqual([]);
  });

  it("recovers arXiv metadata and binds it to the original PDF URL", async () => {
    const window = new Window();
    vi.stubGlobal("DOMParser", window.DOMParser);
    const request = vi.fn().mockResolvedValue(
      new Response(
        `<meta name="citation_title" content="Universal CMB Phase Coherence">
         <meta name="citation_author" content="Siméon Vareilles">
         <meta name="citation_date" content="2026">
         <meta name="citation_pdf_url" content="/pdf/2609.03012">`,
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );
    vi.stubGlobal("fetch", request);

    await expect(
      recoverDirectPdfContext(7, "https://arxiv.org/pdf/2609.03012"),
    ).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      "https://arxiv.org/abs/2609.03012",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(saveContext).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 7,
        pageUrl: "https://arxiv.org/abs/2609.03012",
        metadata: expect.objectContaining({
          title: "Universal CMB Phase Coherence",
          year: "2026",
          pdfUrls: ["https://arxiv.org/pdf/2609.03012"],
        }),
      }),
    );
  });

  it("recovers the reported Glasgow EPrints PDF from its record page", async () => {
    const window = new Window();
    vi.stubGlobal("DOMParser", window.DOMParser);
    const request = vi.fn().mockResolvedValue(
      new Response(
        `<meta name="DC.title" content="A meta-analysis of values affirmation">
         <meta name="DC.creator" content="Wu, Zezhen">
         <meta name="DC.creator" content="Spreckelsen, Thees F.">
         <meta name="DC.date" content="2021">
         <meta name="DC.identifier" content="https://eprints.gla.ac.uk/243676/1/243676.pdf">`,
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );
    vi.stubGlobal("fetch", request);

    await expect(
      recoverDirectPdfContext(
        9,
        "https://eprints.gla.ac.uk/243676/1/243676.pdf",
      ),
    ).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      "https://eprints.gla.ac.uk/243676/",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(saveContext).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 9,
        metadata: expect.objectContaining({
          title: "A meta-analysis of values affirmation",
          authors: [
            expect.objectContaining({ familyName: "Wu" }),
            expect.objectContaining({ familyName: "Spreckelsen" }),
          ],
          pdfUrls: ["https://eprints.gla.ac.uk/243676/1/243676.pdf"],
        }),
      }),
    );
  });
});
