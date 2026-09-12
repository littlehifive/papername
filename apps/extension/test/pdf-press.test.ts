import { describe, expect, it } from "vitest";

import { isLikelyPdfLink, isPdfPressMessage } from "../src/pdf-press";

const known = ["https://www.jstor.org/stable/pdf/papername-test.pdf"];

describe("PDF link press detection", () => {
  it.each([
    "https://www.jstor.org/stable/pdf/papername-test.pdf#page=2",
    "https://arxiv.org/pdf/2609.03012",
    "https://link.springer.com/content/pdf/10.1007/example.pdf",
    "https://onlinelibrary.wiley.com/doi/pdfdirect/10.1002/example",
    "https://onlinelibrary.wiley.com/doi/epdf/10.1002/example",
    "https://www.sciencedirect.com/science/article/pii/S0001/pdfft?md5=abc&pid=1-s2.0-main.pdf",
    "https://osf.io/download/6aa17d8ca9afb7bc95af9441/",
    "https://www.biorxiv.org/content/10.1101/2026.01.01.000001v1.full.pdf",
  ])("treats %s as a step toward the PDF", (href) => {
    expect(isLikelyPdfLink(href, known)).toBe(true);
  });

  it.each([
    "https://www.jstor.org/stable/papername-test",
    "https://www.sciencedirect.com/science/article/pii/S0001",
    "https://publisher.test/suppl_file/table-s1.docx",
    "https://publisher.test/help/pdf-viewer-faq",
    "mailto:editor@publisher.test",
    "javascript:void(0)",
    "not a url",
  ])("ignores %s", (href) => {
    expect(isLikelyPdfLink(href, known)).toBe(false);
  });

  it("matches a known PDF URL regardless of its fragment or trailing slash", () => {
    expect(
      isLikelyPdfLink("https://publisher.test/files/main/", [
        "https://publisher.test/files/main#view",
      ]),
    ).toBe(true);
  });

  it("recognizes only well-formed press messages", () => {
    expect(
      isPdfPressMessage({
        type: "papername:pdf-press",
        pageUrl: "https://publisher.test/article",
        url: "https://publisher.test/main.pdf",
      }),
    ).toBe(true);
    expect(isPdfPressMessage({ type: "papername:pdf-press" })).toBe(false);
    expect(isPdfPressMessage({ type: "papername:context" })).toBe(false);
  });
});
