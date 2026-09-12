import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import {
  contextSupportsCurrentPage,
  findMatchingPageContext,
  type ArticleContext,
} from "@papername/core";
import { publishPageContext } from "../src/page-capture";
import { decideDownload } from "../src/decision";

const origin = "https://journals.sagepub.com";
const doi = "10.1177/01979183261442883";
const articleUrl = `${origin}/doi/full/${doi}`;
// Minimal bibliographic fields and link structure observed in Chrome, 2026-09-09.
const html = `<meta name="dc.Title" content="The Societal Determinants of Climate Risk for Refugees: Evidence From Global and African Refugee Corridors">
<meta name="dc.Creator" content="Sonja Fransen">
<meta name="dc.Creator" content="Kerilyn Schewel">
<meta name="dc.Identifier" content="10.1177_01979183261442883">
<meta name="article:published_time - datetime" content="September 3, 2026">
<a href="/doi/reader/${doi}?_gl=tracking">PDF/EPUB</a>
<div id="bibr28-01979183261442883"><a href="https://example.org/referenced-report.pdf">Referenced report</a></div>`;

async function capture(): Promise<ArticleContext> {
  const window = new Window({ url: articleUrl });
  window.document.write(html);
  let context: ArticleContext | undefined;
  await publishPageContext(
    window.document as unknown as Document,
    articleUrl,
    async (message) => {
      context = {
        metadata: message.metadata,
        pageUrl: message.pageUrl,
        tabId: 1,
        capturedAt: Date.now(),
      };
    },
  );
  expect(context).toBeDefined();
  return context!;
}

describe("observed SAGE article-to-reader flow", () => {
  it("rejects unrelated readers, DOI prefixes, and stale metadata", async () => {
    const context = await capture();
    for (const url of [
      `${origin}/doi/epub/${doi}9`,
      `https://onlinelibrary.wiley.com/doi/epdf/${doi}`,
      `${origin}/doi/suppl/${doi}/file.pdf`,
    ]) {
      expect(contextSupportsCurrentPage(context, { tabId: 1, url })).toBe(
        false,
      );
    }
    expect(
      contextSupportsCurrentPage(
        { ...context, capturedAt: Date.now() - 31 * 60_000 },
        {
          tabId: 1,
          url: `${origin}/doi/pdf/${doi}`,
        },
      ),
    ).toBe(false);
  });

  it("does not show ready when two papers claim the same PDF", async () => {
    const context = await capture();
    const pdfUrl = "https://example.org/ambiguous.pdf";
    const first = {
      ...context,
      metadata: { ...context.metadata, pdfUrls: [pdfUrl] },
    };
    const other = {
      ...context,
      tabId: 2,
      metadata: {
        ...context.metadata,
        title: "Another paper",
        identifiers: {},
        pdfUrls: [pdfUrl],
      },
    };
    expect(
      findMatchingPageContext([first, other], { tabId: 3, url: pdfUrl }),
    ).toBeUndefined();
  });
  it("names the PDF from the reader using the article's authors and year", async () => {
    expect(
      await decideDownload({
        contexts: [await capture()],
        download: {
          url: `${origin}/doi/pdf/${doi}?download=true`,
          referrer: `${origin}/doi/epub/${doi}`,
          filename: "fransen-schewel-2026.pdf",
          mime: "application/pdf",
        },
        settings: {
          enabled: true,
          preset: "citation",
          gistConsent: false,
          telemetryEnabled: false,
          toastEnabled: true,
        },
      }),
    ).toMatchObject({
      outcome: "renamed",
      suggestion: "Fransen & Schewel (2026).pdf",
    });
  });

  it.each(["reader", "epub", "pdf"])(
    "keeps the %s route ready in either tab",
    async (route) => {
      const context = await capture();
      for (const tabId of [1, 2]) {
        expect(
          contextSupportsCurrentPage(context, {
            tabId,
            url: `${origin}/doi/${route}/${doi}`,
          }),
        ).toBe(true);
      }
    },
  );

  it("does not rename a cited paper's PDF as the current article", async () => {
    expect(
      await decideDownload({
        contexts: [await capture()],
        download: {
          url: "https://example.org/referenced-report.pdf",
          filename: "referenced-report.pdf",
          mime: "application/pdf",
        },
        settings: {
          enabled: true,
          preset: "citation",
          gistConsent: false,
          telemetryEnabled: false,
          toastEnabled: true,
        },
      }),
    ).toMatchObject({ outcome: "unchanged" });
  });
});
