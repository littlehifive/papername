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

  it("reads ScienceDirect authors from its rendered author group", () => {
    const document = page(
      `
        <meta name="citation_title" content="Climate and migration in the United States">
        <meta name="citation_doi" content="10.1016/j.jpubeco.2025.105446">
        <meta name="citation_publication_date" content="2025/09/01">
        <div class="author-group">
          <button><span class="react-xocs-alternative-link"><span class="given-name">Patrick</span> <span class="text surname">Baylis</span></span><span class="author-ref"><sup>a</sup></span></button>
          <button><span class="react-xocs-alternative-link"><span class="given-name">Prashant</span> <span class="text surname">Bharadwaj</span></span><span class="author-ref"><sup>b</sup></span></button>
          <a><span class="react-xocs-alternative-link"><span class="given-name">Nick</span> <span class="text surname">Obradovich</span></span><span class="author-ref"><sup>c</sup></span></a>
        </div>
      `,
      "https://www.sciencedirect.com/science/article/pii/S0047272725001446",
    );

    expect(extractPaperMetadata(document, document.URL)?.authors).toEqual([
      { name: "Patrick Baylis", familyName: "Baylis" },
      { name: "Prashant Bharadwaj", familyName: "Bharadwaj" },
      { name: "Nick Obradovich", familyName: "Obradovich" },
    ]);
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

  it("extracts OSF's primary file from its MFR viewer URL", () => {
    const document = page(
      `<meta name="citation_title" content="Artificial Intelligence Systems Distort Upstream Selection in Human Social Learning">
       <meta name="citation_author" content="William J. Brady">
       <meta name="citation_date" content="2026">
       <iframe src="https://mfr.osf.io/render?url=https%3A%2F%2Fosf.io%2Fdownload%2F6aa17d8ca9afb7bc95af9441%2F%3Fdirect%26mode%3Drender"></iframe>`,
      "https://osf.io/preprints/psyarxiv/qmh3s_v3",
    );

    expect(extractPaperMetadata(document, document.URL)?.pdfUrls).toEqual([
      "https://osf.io/download/6aa17d8ca9afb7bc95af9441/",
    ]);
  });

  it("extracts Research Square authors from its Next.js page data", () => {
    const document = page(
      `<meta name="citation_title" content="Risk factors for drug-resistant tuberculosis">
       <meta name="citation_publication_date" content="2026-09-10">
       <meta name="citation_doi" content="10.21203/rs.3.rs-10663751/v1">
       <meta name="citation_pdf_url" content="/article/rs-10663751/latest.pdf">
       <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
         props: {
           pageProps: {
             initialData: {
               authors: [
                 { name: "Mathias Ngobi Bogere", lastName: "Bogere" },
                 { name: "Maxwell Otim Onapa", lastName: "Onapa" },
                 { name: "Jimmy Patrick Alunyo", lastName: "Alunyo" },
               ],
             },
           },
         },
       })}</script>`,
      "https://www.researchsquare.com/article/rs-10663751/v1",
    );

    expect(extractPaperMetadata(document, document.URL)?.authors).toEqual([
      { name: "Mathias Ngobi Bogere", familyName: "Bogere" },
      { name: "Maxwell Otim Onapa", familyName: "Onapa" },
      { name: "Jimmy Patrick Alunyo", familyName: "Alunyo" },
    ]);
  });

  it("extracts PubMed authors from the rendered citation record", () => {
    const document = page(
      `<meta name="citation_title" content="Parental son preference in childhood and cardiovascular disease">
       <meta name="citation_date" content="08/14/2028">
       <meta name="citation_pmid" content="42680123">
       <a class="full-name" href="/?term=Lyu+J&amp;cauthor_id=42680123">Jingfei Lyu</a>
       <a class="full-name" href="/?term=Xiao+M&amp;cauthor_id=42680123">Meng Xiao</a>
       <a class="full-name" href="/?term=He+B&amp;cauthor_id=42680123">Biaochuan He</a>
       <div class="short-view">
         <a class="full-name" href="/?term=Lyu+J&amp;cauthor_id=42680123">Jingfei Lyu</a>
       </div>`,
      "https://pubmed.ncbi.nlm.nih.gov/42680123/",
    );

    expect(extractPaperMetadata(document, document.URL)?.authors).toEqual([
      { name: "Jingfei Lyu", familyName: "Lyu" },
      { name: "Meng Xiao", familyName: "Xiao" },
      { name: "Biaochuan He", familyName: "He" },
    ]);
  });

  it("extracts IEEE metadata from its xplGlobal document payload", () => {
    const document = page(
      `<script>
        var xplGlobal = { document: {} };
        xplGlobal.document.metadata={"authors":[{"name":"Wei Pi","firstName":"Wei","lastName":"Pi"},{"name":"Zhouxun Li","firstName":"Zhouxun","lastName":"Li"}],"publicationYear":"2026","pdfPath":"/iel8/77/11663570/11655458.pdf","formulaStrippedArticleTitle":"Analysis on Thermal Stability of Self-Shielding High Temperature Superconducting DC Cable for Power Transmission","doi":"10.1109/TASC.2026.3723805"};
      </script>`,
      "https://ieeexplore.ieee.org/document/11655458",
    );

    expect(extractPaperMetadata(document, document.URL)).toMatchObject({
      title:
        "Analysis on Thermal Stability of Self-Shielding High Temperature Superconducting DC Cable for Power Transmission",
      authors: [
        { name: "Wei Pi", familyName: "Pi" },
        { name: "Zhouxun Li", familyName: "Li" },
      ],
      year: "2026",
      identifiers: { doi: "10.1109/tasc.2026.3723805" },
      pdfUrls: ["https://ieeexplore.ieee.org/iel8/77/11663570/11655458.pdf"],
      sourceAdapter: "ieee",
    });
  });

  it("uses ACM's rendered family names when dc.Creator concatenates family and given names", () => {
    const document = page(
      `<meta name="dc.Title" content="Paying Attention to Vehicles">
       <meta name="dc.Creator" content="QianYan ">
       <meta name="dc.Creator" content="BarthelemyJohan ">
       <meta name="dc.Creator" content="DuBo ">
       <meta name="dc.Creator" content="ShenJun ">
       <meta name="citation_date" content="2026">
       <a href="#" role="button" data-db-target-for="axel_author_artseq-001"><span property="givenName">Yan</span> <span property="familyName">Qian</span></a>
       <a href="#" role="button" data-db-target-for="axel_author_artseq-002"><span property="givenName">Johan</span> <span property="familyName">Barthelemy</span></a>
       <a href="#" role="button" data-db-target-for="axel_author_artseq-003"><span property="givenName">Bo</span> <span property="familyName">Du</span></a>
       <a href="#" role="button" data-db-target-for="axel_author_artseq-004"><span property="givenName">Jun</span> <span property="familyName">Shen</span></a>`,
      "https://dl.acm.org/doi/10.1145/3655623",
    );

    expect(extractPaperMetadata(document, document.URL)?.authors).toEqual([
      { name: "Yan Qian", familyName: "Qian" },
      { name: "Johan Barthelemy", familyName: "Barthelemy" },
      { name: "Bo Du", familyName: "Du" },
      { name: "Jun Shen", familyName: "Shen" },
    ]);
  });

  it("does not trust an IEEE-shaped script on another site", () => {
    const document = page(
      `<script>xplGlobal.document.metadata={"formulaStrippedArticleTitle":"Imposter paper","authors":[{"name":"Mallory Example"}],"publicationYear":"2026","pdfPath":"/imposter.pdf"};</script>`,
      "https://example.com/article",
    );

    expect(extractPaperMetadata(document, document.URL)).toBeUndefined();
  });

  it("extracts an EPrints repository record with repeated Dublin Core identifiers", () => {
    const document = page(
      `<meta name="DC.title" content="A meta-analysis of the effect of values affirmation on academic achievement">
       <meta name="DC.creator" content="Wu, Zezhen">
       <meta name="DC.creator" content="Spreckelsen, Thees F.">
       <meta name="DC.creator" content="Cohen, Geoffrey L.">
       <meta name="DC.description" content="Values affirmation improved achievement for identity-threatened students.">
       <meta name="DC.date" content="2021-09">
       <meta name="DC.identifier" content="https://eprints.gla.ac.uk/243676/1/243676.pdf">
       <meta name="DC.identifier" content="10.1111/josi.12415">`,
      "https://eprints.gla.ac.uk/243676/",
    );

    expect(extractPaperMetadata(document, document.URL)).toEqual({
      title:
        "A meta-analysis of the effect of values affirmation on academic achievement",
      authors: [
        { name: "Wu, Zezhen", familyName: "Wu" },
        { name: "Spreckelsen, Thees F.", familyName: "Spreckelsen" },
        { name: "Cohen, Geoffrey L.", familyName: "Cohen" },
      ],
      year: "2021",
      abstract:
        "Values affirmation improved achievement for identity-threatened students.",
      identifiers: { doi: "10.1111/josi.12415" },
      pdfUrls: ["https://eprints.gla.ac.uk/243676/1/243676.pdf"],
      sourceAdapter: "eprints",
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

  it("does not promote supplementary or ambiguous Dublin Core files to the main PDF", () => {
    const withSupplement = page(`
      <meta name="dc.title" content="Repository paper">
      <meta name="dc.identifier" content="/record/main.pdf">
      <meta name="dc.identifier" content="/record/supporting-information.pdf">
    `);
    expect(
      extractPaperMetadata(withSupplement, withSupplement.URL)?.pdfUrls,
    ).toEqual(["https://www.jstor.org/record/main.pdf"]);

    const ambiguous = page(`
      <meta name="dc.title" content="Repository paper">
      <meta name="dc.identifier" content="/record/version-one.pdf">
      <meta name="dc.identifier" content="/record/version-two.pdf">
    `);
    expect(extractPaperMetadata(ambiguous, ambiguous.URL)?.pdfUrls).toEqual([]);
  });

  it("does not claim unsupported sites", () => {
    expect(sourceAdapterForUrl("https://example.com/paper")).toBeUndefined();
  });

  it.each([
    ["https://www.nature.com/articles/example", "nature"],
    ["https://osf.io/preprints/example", "osf"],
    ["https://papers.ssrn.com/sol3/papers.cfm?id=1", "ssrn"],
    ["https://eprints.gla.ac.uk/243676/", "eprints"],
    ["https://law.bepress.com/article/1", "digital-commons"],
    ["https://www.biorxiv.org/content/1", "biorxiv"],
    ["https://www.medrxiv.org/content/1", "medrxiv"],
    ["https://chemrxiv.org/engage/chemrxiv/article-details/1", "chemrxiv"],
    ["https://zenodo.org/records/1", "zenodo"],
    ["https://figshare.com/articles/journal_contribution/1", "figshare"],
    ["https://hal.science/hal-1", "hal"],
    ["https://www.researchsquare.com/article/rs-1", "research-square"],
  ])("recognizes first-class source %s", (url, sourceAdapter) => {
    expect(sourceAdapterForUrl(url)).toBe(sourceAdapter);
  });

  it.each([
    {
      name: "Nature Highwire metadata",
      url: "https://www.nature.com/articles/s41586-example",
      sourceAdapter: "nature",
      title: "Nature paper",
      pdfPath: "/articles/s41586-example.pdf",
      html: '<meta name="citation_title" content="Nature paper"><meta name="citation_author" content="Jane Wu"><meta name="citation_publication_date" content="2026"><meta name="citation_doi" content="10.1000/nature"><meta name="citation_pdf_url" content="/articles/s41586-example.pdf">',
    },
    {
      name: "OSF ScholarlyArticle metadata",
      url: "https://osf.io/preprints/osf/abcde",
      sourceAdapter: "osf",
      title: "OSF preprint",
      pdfPath: "/download/abcde/",
      html: '<script type="application/ld+json">{"@type":"ScholarlyArticle","headline":"OSF preprint","author":{"name":"Jane Wu","familyName":"Wu"},"datePublished":"2026","identifier":"10.1000/osf","encoding":{"contentUrl":"/download/abcde/","encodingFormat":"application/pdf"}}</script>',
    },
    {
      name: "SSRN in-tab citation metadata",
      url: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1",
      sourceAdapter: "ssrn",
      title: "SSRN preprint",
      pdfPath: "/sol3/Delivery.cfm?abstractid=1",
      html: '<meta name="citation_title" content="SSRN preprint"><meta name="citation_author" content="Jane Wu"><meta name="citation_date" content="2026"><meta name="citation_doi" content="10.1000/ssrn"><meta name="citation_pdf_url" content="/sol3/Delivery.cfm?abstractid=1">',
    },
    {
      name: "bioRxiv metadata",
      url: "https://www.biorxiv.org/content/10.1101/example",
      sourceAdapter: "biorxiv",
      title: "bioRxiv preprint",
      pdfPath: "/content/10.1101/example.full.pdf",
      html: '<meta name="citation_title" content="bioRxiv preprint"><meta name="citation_author" content="Jane Wu"><meta name="citation_date" content="2026"><meta name="citation_doi" content="10.1000/biorxiv"><meta name="citation_pdf_url" content="/content/10.1101/example.full.pdf">',
    },
    {
      name: "medRxiv metadata",
      url: "https://www.medrxiv.org/content/10.1101/example",
      sourceAdapter: "medrxiv",
      title: "medRxiv preprint",
      pdfPath: "/content/10.1101/example.full.pdf",
      html: '<meta name="citation_title" content="medRxiv preprint"><meta name="citation_author" content="Jane Wu"><meta name="citation_date" content="2026"><meta name="citation_doi" content="10.1000/medrxiv"><meta name="citation_pdf_url" content="/content/10.1101/example.full.pdf">',
    },
    {
      name: "ChemRxiv metadata",
      url: "https://chemrxiv.org/engage/chemrxiv/article-details/1",
      sourceAdapter: "chemrxiv",
      title: "ChemRxiv preprint",
      pdfPath: "/article/1.pdf",
      html: '<meta name="citation_title" content="ChemRxiv preprint"><meta name="citation_author" content="Jane Wu"><meta name="citation_date" content="2026"><meta name="citation_doi" content="10.1000/chemrxiv"><meta name="citation_pdf_url" content="/article/1.pdf">',
    },
    {
      name: "Zenodo Dublin Core metadata",
      url: "https://zenodo.org/records/1",
      sourceAdapter: "zenodo",
      title: "Zenodo paper",
      pdfPath: "/records/1/files/paper.pdf",
      html: '<meta name="dc.title" content="Zenodo paper"><meta name="dc.creator" content="Jane Wu"><meta name="dc.date" content="2026"><meta name="dc.identifier" content="10.1000/zenodo"><link type="application/pdf" href="/records/1/files/paper.pdf">',
    },
    {
      name: "Figshare metadata",
      url: "https://figshare.com/articles/journal_contribution/1",
      sourceAdapter: "figshare",
      title: "Figshare paper",
      pdfPath: "/ndownloader/files/1.pdf",
      html: '<meta name="citation_title" content="Figshare paper"><meta name="citation_author" content="Jane Wu"><meta name="citation_date" content="2026"><meta name="citation_doi" content="10.1000/figshare"><meta name="citation_pdf_url" content="/ndownloader/files/1.pdf">',
    },
    {
      name: "HAL metadata",
      url: "https://hal.science/hal-1",
      sourceAdapter: "hal",
      title: "HAL paper",
      pdfPath: "/hal-1/document.pdf",
      html: '<meta name="citation_title" content="HAL paper"><meta name="citation_author" content="Jane Wu"><meta name="citation_date" content="2026"><meta name="citation_doi" content="10.1000/hal"><meta name="citation_pdf_url" content="/hal-1/document.pdf">',
    },
    {
      name: "Research Square metadata",
      url: "https://www.researchsquare.com/article/rs-1",
      sourceAdapter: "research-square",
      title: "Research Square preprint",
      pdfPath: "/article/rs-1.pdf",
      html: '<meta name="citation_title" content="Research Square preprint"><meta name="citation_author" content="Jane Wu"><meta name="citation_date" content="2026"><meta name="citation_doi" content="10.1000/research-square"><meta name="citation_pdf_url" content="/article/rs-1.pdf">',
    },
  ])(
    "extracts representative $name",
    ({ url, sourceAdapter, title, pdfPath, html }) => {
      const document = page(html, url);
      expect(extractPaperMetadata(document, document.URL)).toMatchObject({
        title,
        authors: [{ familyName: "Wu" }],
        year: "2026",
        identifiers: { doi: expect.stringMatching(/^10\.1000\//) },
        pdfUrls: [new URL(pdfPath, url).href],
        sourceAdapter,
      });
    },
  );

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

  it("extracts EPrints platform aliases on a user-enabled repository", () => {
    const document = page(
      `<meta name="eprints.title" content="Repository paper">
       <meta name="eprints.creators_name" content="Wu, Jane">
       <meta name="eprints.creators_name" content="Smith, Alex">
       <meta name="eprints.date" content="2026-09-05">
       <meta name="eprints.abstract" content="A repository abstract.">
       <meta name="eprints.document_url" content="/123/1/paper.pdf">`,
      "https://research.example.edu/123/",
    );

    expect(extractPaperMetadata(document, document.URL)).toMatchObject({
      title: "Repository paper",
      authors: [{ familyName: "Wu" }, { familyName: "Smith" }],
      year: "2026",
      abstract: "A repository abstract.",
      pdfUrls: ["https://research.example.edu/123/1/paper.pdf"],
      sourceAdapter: "eprints",
    });
  });

  it("extracts Digital Commons aliases on a user-enabled repository", () => {
    const document = page(
      `<meta name="bepress_citation_title" content="Digital Commons paper">
       <meta name="bepress_citation_author" content="Jane Wu">
       <meta name="bepress_citation_date" content="2026">
       <meta name="bepress_citation_abstract" content="A deposited abstract.">
       <meta name="bepress_citation_pdf_url" content="/cgi/viewcontent.cgi?article=12&amp;context=series">`,
      "https://repository.example.edu/series/12/",
    );

    expect(extractPaperMetadata(document, document.URL)).toMatchObject({
      title: "Digital Commons paper",
      authors: [{ familyName: "Wu" }],
      year: "2026",
      abstract: "A deposited abstract.",
      pdfUrls: [
        "https://repository.example.edu/cgi/viewcontent.cgi?article=12&context=series",
      ],
      sourceAdapter: "digital-commons",
    });
  });

  it("recognizes DSpace from its platform marker on a user-enabled origin", () => {
    const document = page(
      `<meta name="generator" content="DSpace 7">
       <meta name="dc.title" content="DSpace paper">
       <meta name="dc.creator" content="Wu, Jane">
       <meta name="dc.date" content="2026">
       <meta name="dc.identifier" content="https://repository.example.edu/bitstreams/123/content">`,
      "https://repository.example.edu/items/123",
    );

    expect(extractPaperMetadata(document, document.URL)).toMatchObject({
      title: "DSpace paper",
      sourceAdapter: "dspace",
    });
  });

  it("does not mistake a Digital Commons abstract-page URL for abstract prose", () => {
    const document = page(
      `<meta name="bepress_citation_title" content="Digital Commons paper">
       <meta name="bepress_citation_abstract_html_url" content="https://repository.example.edu/series/12/">`,
      "https://repository.example.edu/series/12/",
    );

    expect(extractPaperMetadata(document, document.URL)).not.toHaveProperty(
      "abstract",
    );
  });
});
