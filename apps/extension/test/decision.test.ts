import { describe, expect, it } from "vitest";

import type {
  ArticleContext,
  DownloadCandidate,
  PaperMetadata,
} from "@papername/core";

import { decideDownload, type ExtensionSettings } from "../src/decision";
import { attachTrustedViewerUrl } from "../src/viewer";

const now = Date.UTC(2026, 8, 4, 12);
const metadata: PaperMetadata = {
  title: "Warm hands, warm heart",
  authors: [
    { name: "Lawrence Williams", familyName: "Williams" },
    { name: "John Bargh", familyName: "Bargh" },
    { name: "Third Author", familyName: "Author" },
  ],
  year: "2008",
  abstract:
    "Holding warm objects led participants to report warmer interpersonal judgments.",
  identifiers: { doi: "10.1126/science.1162548" },
  pdfUrls: ["https://publisher.test/main.pdf"],
};
const context: ArticleContext = {
  metadata,
  pageUrl: "https://publisher.test/article",
  capturedAt: now - 100,
  tabId: 4,
};
const download: DownloadCandidate = {
  url: "https://publisher.test/main.pdf",
  filename: "fulltext.pdf",
  mime: "application/pdf",
  tabId: 4,
  referrer: context.pageUrl,
};
const settings: ExtensionSettings = {
  enabled: true,
  preset: "citation",
  gistConsent: false,
  telemetryEnabled: false,
};

describe("download decision", () => {
  it("renames an Acrobat-mediated arXiv save using the active PDF viewer URL", async () => {
    const arxivContext: ArticleContext = {
      metadata: {
        title:
          "FLY-EVAL++: An Evidence-Driven Evaluation Protocol for Safety-Constrained Flight Prediction with Large Language Models",
        authors: [
          { name: "Wu, Yalun", familyName: "Wu" },
          { name: "Fang, Junfeng", familyName: "Fang" },
          { name: "Wang, Jiawei", familyName: "Wang" },
        ],
        year: "2026",
        identifiers: { arxivId: "2609.04021" },
        pdfUrls: ["https://arxiv.org/pdf/2609.04021"],
      },
      pageUrl: "https://arxiv.org/abs/2609.04021",
      capturedAt: now - 100,
      tabId: 4,
    };
    const acrobatDownload = attachTrustedViewerUrl(
      {
        url: "chrome-extension://efaidnbmnnnibpcajpcglclefindmkaj/",
        filename: "292b7576-a42f-4ef1-87dc-066d96f55a95.pdf",
        mime: "application/pdf",
      },
      "https://arxiv.org/pdf/2609.04021",
    );

    await expect(
      decideDownload({
        contexts: [arxivContext],
        download: acrobatDownload,
        settings,
        now: () => now,
      }),
    ).resolves.toMatchObject({
      suggestion: "Wu et al. (2026).pdf",
      outcome: "renamed",
    });
  });

  it("does not attach active-page evidence to an arbitrary download", () => {
    expect(
      attachTrustedViewerUrl(
        {
          url: "https://unrelated.test/file.pdf",
          filename: "file.pdf",
          mime: "application/pdf",
        },
        "https://arxiv.org/pdf/2609.04021",
      ),
    ).not.toHaveProperty("viewerUrl");
  });

  it("associates a versioned arXiv viewer URL by its identifier", async () => {
    const arxivContext: ArticleContext = {
      metadata: {
        title: "A paper with a versioned viewer URL",
        authors: [{ name: "Yalun Wu", familyName: "Wu" }],
        year: "2026",
        identifiers: { arxivId: "2609.04021" },
        pdfUrls: ["https://arxiv.org/pdf/2609.04021"],
      },
      pageUrl: "https://arxiv.org/abs/2609.04021",
      capturedAt: now - 100,
      tabId: 4,
    };
    const acrobatDownload = attachTrustedViewerUrl(
      {
        url: "blob:chrome-extension://efaidnbmnnnibpcajpcglclefindmkaj/id",
        filename: "generated-id.pdf",
        mime: "application/pdf",
      },
      "https://arxiv.org/pdf/2609.04021v1",
    );

    await expect(
      decideDownload({
        contexts: [arxivContext],
        download: acrobatDownload,
        settings,
        now: () => now,
      }),
    ).resolves.toMatchObject({ suggestion: "Wu (2026).pdf" });
  });

  it("returns the selected deterministic filename for an eligible download", async () => {
    await expect(
      decideDownload({
        contexts: [context],
        download,
        settings,
        now: () => now,
      }),
    ).resolves.toMatchObject({
      suggestion: "Williams et al. (2008).pdf",
      outcome: "renamed",
      reason: "selected_preset",
    });
  });

  it("does nothing when Papername is disabled or the PDF is unrelated", async () => {
    await expect(
      decideDownload({
        contexts: [context],
        download,
        settings: { ...settings, enabled: false },
        now: () => now,
      }),
    ).resolves.toEqual({ outcome: "unchanged", reason: "disabled" });
    await expect(
      decideDownload({
        contexts: [context],
        download: {
          ...download,
          url: "https://other.test/file.pdf",
          tabId: 8,
          referrer: "",
        },
        settings,
        now: () => now,
      }),
    ).resolves.toEqual({ outcome: "unchanged", reason: "unmatched_download" });
  });

  it("uses a hosted gist when it arrives within the wait budget", async () => {
    await expect(
      decideDownload({
        contexts: [context],
        download,
        settings: {
          ...settings,
          preset: "citation_gist",
          gistConsent: true,
          betaToken: "token",
        },
        requestGist: async () => ({
          usable: true,
          gist: "Warm objects increase perceived interpersonal warmth",
          reason: "ok",
          remaining: 29,
        }),
        timeoutMs: 1_500,
        now: () => now,
      }),
    ).resolves.toMatchObject({
      suggestion:
        "Williams et al. (2008) — Warm objects increase perceived interpersonal warmth.pdf",
      outcome: "renamed",
      remaining: 29,
    });
  });

  it("rejects a gist that repeats an author or publication year", async () => {
    const result = await decideDownload({
      contexts: [context],
      download,
      settings: {
        ...settings,
        preset: "citation_gist",
        gistConsent: true,
        betaToken: "token",
      },
      requestGist: async () => ({
        usable: true,
        gist: "Williams 2008 reports warmer judgments from warm objects",
        reason: "ok",
        remaining: 29,
      }),
      now: () => now,
    });

    expect(result).toMatchObject({
      outcome: "fallback",
      reason: "invalid_gist",
      remaining: 29,
    });
  });

  it("compares short author names as whole tokens", async () => {
    const result = await decideDownload({
      contexts: [
        {
          ...context,
          metadata: {
            ...metadata,
            authors: [{ name: "Mei Li", familyName: "Li" }],
          },
        },
      ],
      download,
      settings: {
        ...settings,
        preset: "citation_gist",
        gistConsent: true,
        betaToken: "token",
      },
      requestGist: async () => ({
        usable: true,
        gist: "Climate interventions reduce perceived household energy costs",
        reason: "ok",
        remaining: 29,
      }),
      now: () => now,
    });

    expect(result).toMatchObject({
      outcome: "renamed",
      reason: "selected_preset",
      remaining: 29,
    });
  });

  it("falls back to citation plus title after the wait budget", async () => {
    await expect(
      decideDownload({
        contexts: [context],
        download,
        settings: {
          ...settings,
          preset: "citation_gist",
          gistConsent: true,
          betaToken: "token",
        },
        requestGist: () => new Promise(() => undefined),
        timeoutMs: 5,
        now: () => now,
      }),
    ).resolves.toMatchObject({
      suggestion: "Williams et al. (2008) — Warm hands, warm heart.pdf",
      outcome: "fallback",
      reason: "gist_timeout",
    });
  });

  it("does not call hosted AI without consent or a beta token", async () => {
    let calls = 0;
    const result = await decideDownload({
      contexts: [context],
      download,
      settings: { ...settings, preset: "citation_gist" },
      requestGist: async () => {
        calls += 1;
        throw new Error("must not run");
      },
      now: () => now,
    });
    expect(calls).toBe(0);
    expect(result).toMatchObject({
      outcome: "fallback",
      reason: "gist_unavailable",
    });
  });

  it("does not spend gist quota when no author can appear in the selected format", async () => {
    let calls = 0;
    const result = await decideDownload({
      contexts: [{ ...context, metadata: { ...metadata, authors: [] } }],
      download,
      settings: {
        ...settings,
        preset: "citation_gist",
        gistConsent: true,
        betaToken: "token",
      },
      requestGist: async () => {
        calls += 1;
        throw new Error("must not run");
      },
      now: () => now,
    });

    expect(calls).toBe(0);
    expect(result).toMatchObject({
      suggestion: "Warm hands, warm heart.pdf",
      outcome: "fallback",
      reason: "missing_author",
    });
  });

  it("surfaces a zero remaining allowance when quota is exhausted", async () => {
    const result = await decideDownload({
      contexts: [context],
      download,
      settings: {
        ...settings,
        preset: "citation_gist",
        gistConsent: true,
        betaToken: "token",
      },
      requestGist: async () =>
        Promise.reject(
          Object.assign(new Error("quota exhausted"), {
            reason: "quota_exhausted",
            remaining: 0,
          }),
        ),
      now: () => now,
    });

    expect(result).toMatchObject({
      outcome: "fallback",
      reason: "quota_exhausted",
      remaining: 0,
    });
  });
});
