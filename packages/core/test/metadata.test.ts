import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { extractPaperMetadata, sourceAdapterForUrl } from "../src/index";

function page(
  html: string,
  url = "https://www.jstor.org/stable/1234",
): Document {
  const window = new Window({ url });
  window.document.write(html);
  return window.document as unknown as Document;
}

describe("article-page metadata", () => {
  it("extracts standard citation metadata and every author", () => {
    const document = page(`
      <meta name="citation_title" content="Warm hands, warm heart">
      <meta name="citation_author" content="Williams, Lawrence E.">
      <meta name="citation_author" content="John A. Bargh">
      <meta name="citation_publication_date" content="2008/10/24">
      <meta name="citation_abstract" content="Warm objects affected interpersonal judgments.">
      <meta name="citation_doi" content="10.1126/science.1162548">
      <meta name="citation_pdf_url" content="/stable/pdf/1234.pdf">
    `);

    expect(extractPaperMetadata(document, document.URL)).toEqual({
      title: "Warm hands, warm heart",
      authors: [
        { name: "Williams, Lawrence E.", familyName: "Williams" },
        { name: "John A. Bargh", familyName: "Bargh" },
      ],
      year: "2008",
      abstract: "Warm objects affected interpersonal judgments.",
      identifiers: { doi: "10.1126/science.1162548" },
      pdfUrls: ["https://www.jstor.org/stable/pdf/1234.pdf"],
      sourceAdapter: "jstor",
    });
  });

  it("falls back to ScholarlyArticle JSON-LD with structured people", () => {
    const document = page(
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "ScholarlyArticle",
        headline: "A structured paper",
        author: [
          { "@type": "Person", name: "Ada Lovelace", familyName: "Lovelace" },
          { "@type": "Organization", name: "Genome Consortium" },
        ],
        datePublished: "2026-04-03",
        abstract: "A structured contribution is reported.",
        identifier: "https://doi.org/10.1000/example",
        encoding: {
          contentUrl: "/paper.pdf",
          encodingFormat: "application/pdf",
        },
      })}</script>`,
      "https://link.springer.com/article/example",
    );

    expect(extractPaperMetadata(document, document.URL)).toMatchObject({
      title: "A structured paper",
      authors: [
        { name: "Ada Lovelace", familyName: "Lovelace" },
        { name: "Genome Consortium", corporate: true },
      ],
      year: "2026",
      identifiers: { doi: "10.1000/example" },
      pdfUrls: ["https://link.springer.com/paper.pdf"],
      sourceAdapter: "springer",
    });
  });

  it("uses arXiv-specific elements only when standard metadata is absent", () => {
    const document = page(
      `<h1 class="title">Title: A Useful Preprint</h1>
       <div class="authors"><a>Jane Q. Wu</a><a>Alex Smith</a></div>
       <blockquote class="abstract">Abstract: We introduce a useful technique.</blockquote>
       <div class="dateline">[Submitted on 4 Sep 2026]</div>
       <a href="/pdf/2609.00001">View PDF</a>`,
      "https://arxiv.org/abs/2609.00001",
    );

    expect(extractPaperMetadata(document, document.URL)).toMatchObject({
      title: "A Useful Preprint",
      authors: [
        { name: "Jane Q. Wu", familyName: "Wu" },
        { name: "Alex Smith", familyName: "Smith" },
      ],
      year: "2026",
      abstract: "We introduce a useful technique.",
      identifiers: { arxivId: "2609.00001" },
      pdfUrls: ["https://arxiv.org/pdf/2609.00001"],
    });
  });

  it("does not mistake supplementary links for the main PDF", () => {
    const document = page(`
      <meta name="citation_title" content="A paper">
      <a href="/stable/pdf/supplement/table-s1.pdf">Supplementary PDF</a>
      <a href="/stable/pdf/main.pdf">Article PDF</a>
    `);

    expect(extractPaperMetadata(document, document.URL)?.pdfUrls).toEqual([
      "https://www.jstor.org/stable/pdf/main.pdf",
    ]);
  });

  it("does not claim unsupported sites", () => {
    expect(sourceAdapterForUrl("https://example.com/paper")).toBeUndefined();
  });

  it.each([
    {
      name: "JSTOR citation tags",
      url: "https://www.jstor.org/stable/1",
      sourceAdapter: "jstor",
      html: '<meta name="citation_title" content="JSTOR paper"><meta name="citation_author" content="Jane Wu"><meta name="citation_date" content="2026"><meta name="citation_pdf_url" content="/stable/pdf/1.pdf">',
    },
    {
      name: "ScienceDirect Dublin Core tags",
      url: "https://www.sciencedirect.com/science/article/pii/1",
      sourceAdapter: "elsevier",
      html: '<meta name="dc.title" content="Elsevier paper"><meta name="dc.creator" content="Jane Wu"><meta name="dc.date" content="2026-01-02"><a href="/science/article/pii/1/pdfft">View PDF</a>',
    },
    {
      name: "SpringerLink JSON-LD",
      url: "https://link.springer.com/article/1",
      sourceAdapter: "springer",
      html: '<script type="application/ld+json">{"@type":"ScholarlyArticle","headline":"Springer paper","author":{"name":"Jane Wu","familyName":"Wu"},"datePublished":"2026","encoding":{"contentUrl":"/content/pdf/1.pdf","encodingFormat":"application/pdf"}}</script>',
    },
    {
      name: "Wiley mixed citation tags",
      url: "https://onlinelibrary.wiley.com/doi/1",
      sourceAdapter: "wiley",
      html: '<meta name="citation_title" content="Wiley paper"><meta name="dc.creator" content="Wu, Jane"><meta name="citation_publication_date" content="2026/03/01"><link type="application/pdf" href="/doi/pdf/1">',
    },
    {
      name: "SAGE DCTERMS tags",
      url: "https://journals.sagepub.com/doi/1",
      sourceAdapter: "sage",
      html: '<meta name="dcterms.title" content="SAGE paper"><meta name="dcterms.creator" content="Jane Wu"><meta name="dcterms.issued" content="2026"><a href="/doi/pdf/1">PDF</a>',
    },
    {
      name: "Taylor and Francis citation tags",
      url: "https://www.tandfonline.com/doi/1",
      sourceAdapter: "taylor-francis",
      html: '<meta name="citation_title" content="TandF paper"><meta name="citation_author" content="Jane Wu"><meta name="citation_date" content="04 September 2026"><meta name="citation_pdf_url" content="/doi/pdf/1">',
    },
    {
      name: "APA PsycNet citation metadata",
      url: "https://psycnet.apa.org/record/1",
      sourceAdapter: "apa-psycnet",
      html: '<meta name="citation_title" content="APA paper"><meta name="citation_author" content="Jane Wu"><meta name="citation_publication_date" content="2026"><a href="/fulltext/1.pdf">Full text PDF</a>',
    },
    {
      name: "PubMed Central citation metadata",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1/",
      sourceAdapter: "pubmed-pmc",
      html: '<meta name="citation_title" content="PMC paper"><meta name="citation_author" content="Jane Wu"><meta name="citation_date" content="2026"><meta name="citation_pmid" content="123"><a href="/articles/PMC1/pdf/main.pdf">PDF</a>',
    },
    {
      name: "arXiv page elements",
      url: "https://arxiv.org/abs/2609.00001",
      sourceAdapter: "arxiv",
      html: '<h1 class="title">Title: arXiv paper</h1><div class="authors"><a>Jane Wu</a></div><div class="dateline">Submitted 2026</div><a href="/pdf/2609.00001">PDF</a>',
    },
    {
      name: "ACM citation metadata",
      url: "https://dl.acm.org/doi/1",
      sourceAdapter: "acm",
      html: '<meta name="citation_title" content="ACM paper"><meta name="citation_author" content="Jane Wu"><meta name="citation_date" content="2026"><meta name="citation_pdf_url" content="/doi/pdf/1">',
    },
    {
      name: "IEEE citation metadata",
      url: "https://ieeexplore.ieee.org/document/1",
      sourceAdapter: "ieee",
      html: '<meta name="citation_title" content="IEEE paper"><meta name="citation_author" content="Jane Wu"><meta name="citation_publication_date" content="2026"><a href="/stamp/stamp.jsp?tp=&arnumber=1">PDF</a>',
    },
  ])("extracts representative $name", ({ url, sourceAdapter, html }) => {
    const document = page(html, url);
    expect(extractPaperMetadata(document, document.URL)).toMatchObject({
      authors: [{ familyName: "Wu" }],
      year: "2026",
      sourceAdapter,
    });
  });
});
