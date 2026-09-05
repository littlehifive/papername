import { describe, expect, it } from "vitest";

import {
  findMatchingContext,
  type ArticleContext,
  type DownloadCandidate,
  type PaperMetadata,
} from "../src/index";

const now = Date.UTC(2026, 8, 4, 12);
const metadata: PaperMetadata = {
  title: "A useful paper",
  authors: [{ name: "Jane Wu", familyName: "Wu" }],
  year: "2026",
  identifiers: { doi: "10.1000/useful" },
  pdfUrls: ["https://publisher.test/article/10.1000/useful/pdf"],
};
const context: ArticleContext = {
  metadata,
  pageUrl: "https://publisher.test/article/10.1000/useful",
  capturedAt: now - 1_000,
  tabId: 7,
};

function download(
  overrides: Partial<DownloadCandidate> = {},
): DownloadCandidate {
  return {
    url: "https://publisher.test/article/10.1000/useful/pdf?download=1",
    filename: "fulltext.pdf",
    mime: "application/pdf",
    tabId: 7,
    referrer: context.pageUrl,
    ...overrides,
  };
}

describe("eligible download association", () => {
  it("matches a known PDF URL despite a changed query string", () => {
    expect(findMatchingContext([context], download(), now)).toBe(context);
  });

  it("preserves identity-bearing query parameters and path case", () => {
    const other = {
      ...context,
      metadata: {
        ...metadata,
        title: "Another paper",
        identifiers: {},
        pdfUrls: ["https://publisher.test/Download.pdf?article=B"],
      },
      capturedAt: now,
      tabId: 8,
    };
    const original = {
      ...context,
      metadata: {
        ...metadata,
        pdfUrls: ["https://publisher.test/Download.pdf?article=A"],
      },
    };
    expect(
      findMatchingContext(
        [other, original],
        download({
          url: "https://publisher.test/Download.pdf?article=A&token=temporary",
          tabId: undefined,
          referrer: undefined,
        }),
        now,
      ),
    ).toBe(original);
  });

  it("does not discard an identity-bearing download parameter", () => {
    const identityContext = {
      ...context,
      metadata: {
        ...metadata,
        identifiers: {},
        pdfUrls: ["https://publisher.test/file.pdf?download=paper-A"],
      },
    };
    expect(
      findMatchingContext(
        [identityContext],
        download({
          url: "https://publisher.test/file.pdf?download=paper-B",
          tabId: undefined,
          referrer: undefined,
        }),
        now,
      ),
    ).toBeUndefined();
  });

  it("matches a PDF with the paper DOI in its URL", () => {
    expect(
      findMatchingContext(
        [context],
        download({
          url: "https://cdn.test/10.1000%2Fuseful/file",
          filename: "download",
          referrer: context.pageUrl,
        }),
        now,
      ),
    ).toBe(context);
  });

  it("matches a PDF from the article referrer when Chrome provides no tab id", () => {
    expect(
      findMatchingContext(
        [context],
        download({
          url: "https://cdn.test/signed-file.pdf?token=short-lived",
          tabId: undefined,
        }),
        now,
      ),
    ).toBe(context);
  });

  it("matches a known PDF nested in Chrome's internal PDF viewer URL", () => {
    expect(
      findMatchingContext(
        [context],
        download({
          url: `chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html?file=${encodeURIComponent("https://publisher.test/article/10.1000/useful/pdf")}`,
          filename: "index.html",
          mime: "text/html",
          tabId: undefined,
          referrer: undefined,
        }),
        now,
      ),
    ).toBe(context);
  });

  it("rejects a supplementary PDF that is not a known main-PDF URL", () => {
    expect(
      findMatchingContext(
        [context],
        download({ url: "https://publisher.test/supplement/table-s1.pdf" }),
        now,
      ),
    ).toBeUndefined();
  });

  it.each(["supporting-information.pdf", "suppl_file.pdf", "table-s1.pdf"])(
    "rejects common supplementary filename %s",
    (filename) => {
      expect(
        findMatchingContext(
          [context],
          download({
            url: "https://cdn.test/file",
            finalUrl: undefined,
            filename,
          }),
          now,
        ),
      ).toBeUndefined();
    },
  );

  it("rejects equal-score contexts for different papers as ambiguous", () => {
    const other = {
      ...context,
      metadata: { ...metadata, title: "Another paper", identifiers: {} },
      tabId: 8,
      capturedAt: now,
    };
    expect(
      findMatchingContext(
        [context, other],
        download({ tabId: undefined }),
        now,
      ),
    ).toBeUndefined();
  });

  it("checks every context tied at the winning score for ambiguity", () => {
    const first = {
      ...context,
      metadata: { ...metadata, identifiers: {} },
    };
    const duplicate = { ...first, tabId: 8, capturedAt: now };
    const other = {
      ...context,
      metadata: { ...metadata, title: "Another paper", identifiers: {} },
      tabId: 9,
      capturedAt: now - 50,
    };
    expect(
      findMatchingContext(
        [first, duplicate, other],
        download({
          url: "https://cdn.test/file.pdf",
          tabId: undefined,
          referrer: context.pageUrl,
        }),
        now,
      ),
    ).toBeUndefined();
  });

  it("rejects stale article contexts", () => {
    expect(
      findMatchingContext(
        [{ ...context, capturedAt: now - 31 * 60_000 }],
        download(),
        now,
      ),
    ).toBeUndefined();
  });

  it("rejects non-PDF downloads", () => {
    expect(
      findMatchingContext(
        [context],
        download({
          url: "https://publisher.test/data.csv",
          filename: "data.csv",
          mime: "text/csv",
        }),
        now,
      ),
    ).toBeUndefined();
  });

  it("does not use an unrelated tab context without a URL or referrer match", () => {
    expect(
      findMatchingContext(
        [context],
        download({
          url: "https://cdn.test/file.pdf",
          tabId: 99,
          referrer: "https://other.test/",
        }),
        now,
      ),
    ).toBeUndefined();
  });
});
