import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Worker,
} from "@playwright/test";
import { fileURLToPath } from "node:url";

const extensionPath = fileURLToPath(
  new URL("../apps/extension/.output/chrome-mv3", import.meta.url),
);
const articleUrl = "https://www.jstor.org/stable/papername-test";
const pdfUrl = "https://www.jstor.org/stable/pdf/papername-test.pdf";

const article = `<!doctype html>
<meta name="citation_title" content="Warm hands, warm heart">
<meta name="citation_author" content="Williams, Lawrence E.">
<meta name="citation_author" content="John A. Bargh">
<meta name="citation_publication_date" content="2008-10-24">
<meta name="citation_abstract" content="Holding warm objects affected judgments of interpersonal warmth.">
<meta name="citation_pdf_url" content="${pdfUrl}">
<a id="download" href="${pdfUrl}">Download PDF</a>`;

async function launchExtension(): Promise<{
  context: BrowserContext;
  extensionId: string;
  worker: Worker;
}> {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  let worker = context.serviceWorkers()[0];
  worker ??= await context.waitForEvent("serviceworker");
  return { context, extensionId: new URL(worker.url()).host, worker };
}

async function routePaper(context: BrowserContext): Promise<void> {
  await context.route("https://www.jstor.org/**", async (route) => {
    if (route.request().url() === pdfUrl) {
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          "content-disposition": 'attachment; filename="jstor1234.pdf"',
        },
        body: "%PDF-1.4\n%%EOF",
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: article,
    });
  });
}

async function waitForArticleContext(worker: Worker): Promise<void> {
  await expect
    .poll(() =>
      worker.evaluate(async () => {
        const stored = await chrome.storage.session.get(null);
        return Object.keys(stored).filter((key) =>
          key.startsWith("articleContext:"),
        ).length;
      }),
    )
    .toBe(1);
}

test("publishes article metadata and registers the browser filename hook", async () => {
  const { context, extensionId, worker } = await launchExtension();
  try {
    expect(
      await worker.evaluate(() =>
        chrome.downloads.onDeterminingFilename.hasListeners(),
      ),
    ).toBe(true);
    const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.permissions).toEqual(
      expect.arrayContaining([
        "activeTab",
        "downloads",
        "scripting",
        "storage",
      ]),
    );
    expect(manifest.optional_host_permissions).toEqual([
      "http://*/*",
      "https://*/*",
    ]);
    expect(manifest.host_permissions).toEqual(
      expect.arrayContaining([
        "*://*.nature.com/*",
        "*://*.osf.io/*",
        "*://*.ssrn.com/*",
        "*://*.eprints.gla.ac.uk/*",
      ]),
    );
    expect(manifest.host_permissions).not.toContain("*://*.researchgate.net/*");
    await routePaper(context);
    const page = await context.newPage();
    await page.goto(articleUrl);
    await waitForArticleContext(worker);
    const probeVerified = await worker.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({ url }))[0];
      if (tab?.id === undefined) return false;
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["/probe.js"],
      });
      const id = "papername-e2e-registration";
      await chrome.scripting.registerContentScripts([
        {
          id,
          matches: ["https://www.jstor.org/*"],
          js: ["/probe.js"],
          persistAcrossSessions: false,
        },
      ]);
      const registered = await chrome.scripting.getRegisteredContentScripts({
        ids: [id],
      });
      await chrome.scripting.unregisterContentScripts({ ids: [id] });
      return (
        registered[0]?.js?.some((path) => path.endsWith("probe.js")) ?? false
      );
    }, articleUrl);
    expect(probeVerified).toBe(true);
    const contexts = await worker.evaluate(async () =>
      Object.values(await chrome.storage.session.get(null)),
    );
    expect(contexts[0]).toMatchObject({
      metadata: {
        title: "Warm hands, warm heart",
        authors: [{ familyName: "Williams" }, { familyName: "Bargh" }],
        year: "2008",
        pdfUrls: [pdfUrl],
      },
      pageUrl: articleUrl,
    });

    await worker.evaluate(() =>
      chrome.storage.local.set({
        lastOutcome: {
          suggestion: "Williams & Bargh (2008) — Warm hands, warm heart.pdf",
          outcome: "fallback",
          reason: "gist_timeout",
          at: "2026-09-04T12:00:00Z",
        },
      }),
    );
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator("#preset")).toHaveValue("citation");
    await expect(popup.locator("#enabled")).toBeChecked();
    await expect(popup.locator("#site-actions")).toBeHidden();
    await expect(popup.locator("#last-outcome")).toContainText(
      "Fallback (gist timeout): Williams & Bargh (2008)",
    );
  } finally {
    await context.close();
  }
});

test("activates a beta invite and records explicit gist consent", async () => {
  const { context, extensionId, worker } = await launchExtension();
  try {
    await routePaper(context);
    await context.route("http://127.0.0.1:8787/v1/activate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "test-token-123456", remaining: 30 }),
      }),
    );
    const page = await context.newPage();
    await page.goto(articleUrl);
    await waitForArticleContext(worker);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator("#invite").fill("BETA-TEST");
    await popup.locator("#activate").click();
    await expect(popup.locator("#remaining")).toHaveText("30");
    await popup.locator("#preset").selectOption("citation_gist");
    await expect(popup.locator("#consent")).toBeVisible();
    await popup.locator('#consent button[value="accept"]').click();
    await expect(popup.locator("#preset")).toHaveValue("citation_gist");

    await expect
      .poll(() =>
        worker.evaluate(
          async () => (await chrome.storage.local.get("settings")).settings,
        ),
      )
      .toMatchObject({
        betaToken: "test-token-123456",
        remaining: 30,
        gistConsent: true,
        preset: "citation_gist",
      });
  } finally {
    await context.close();
  }
});

test("arXiv still publishes an automatic context for Acrobat PDF matching", async () => {
  const { context, worker } = await launchExtension();
  const arxivArticleUrl = "https://arxiv.org/abs/2609.03012";
  try {
    await context.route("https://arxiv.org/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<h1 class="title">Title: Universal CMB Phase Coherence</h1>
          <div class="authors"><a>Siméon Vareilles</a><a>Thomas Colas</a><a>Julien Grain</a></div>
          <blockquote class="abstract">Abstract: We study primordial perturbations.</blockquote>
          <div class="dateline">[Submitted on 2 Sep 2026]</div>
          <a href="/pdf/2609.03012">View PDF</a>`,
      }),
    );
    const page = await context.newPage();
    await page.goto(arxivArticleUrl);
    await waitForArticleContext(worker);

    const contexts = await worker.evaluate(async () =>
      Object.values(await chrome.storage.session.get(null)),
    );
    expect(contexts[0]).toMatchObject({
      pageUrl: arxivArticleUrl,
      metadata: {
        title: "Universal CMB Phase Coherence",
        year: "2026",
        identifiers: { arxivId: "2609.03012" },
        pdfUrls: ["https://arxiv.org/pdf/2609.03012"],
        sourceAdapter: "arxiv",
      },
    });
  } finally {
    await context.close();
  }
});

test("the built extension injects on every major publisher family", async () => {
  const { context, worker } = await launchExtension();
  const sources = [
    ["https://www.jstor.org/stable/1", "jstor"],
    ["https://www.sciencedirect.com/science/article/pii/1", "elsevier"],
    ["https://link.springer.com/article/1", "springer"],
    ["https://www.nature.com/articles/1", "nature"],
    ["https://onlinelibrary.wiley.com/doi/1", "wiley"],
    ["https://journals.sagepub.com/doi/1", "sage"],
    ["https://www.tandfonline.com/doi/1", "taylor-francis"],
    ["https://psycnet.apa.org/record/1", "apa-psycnet"],
    ["https://pubmed.ncbi.nlm.nih.gov/1/", "pubmed-pmc"],
    ["https://arxiv.org/abs/2609.03012", "arxiv"],
    ["https://dl.acm.org/doi/1", "acm"],
    ["https://ieeexplore.ieee.org/document/1", "ieee"],
  ] as const;
  try {
    for (const [url] of sources) {
      const origin = new URL(url).origin;
      await context.route(`${origin}/**`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html",
          body: '<meta name="citation_title" content="Publisher paper"><meta name="citation_author" content="Jane Wu"><meta name="citation_date" content="2026"><meta name="citation_pdf_url" content="/paper.pdf">',
        }),
      );
    }
    const page = await context.newPage();
    for (const [url, sourceAdapter] of sources) {
      await page.goto(url);
      await expect
        .poll(() =>
          worker.evaluate(async () => {
            const contexts = Object.values(
              await chrome.storage.session.get(null),
            ) as Array<{ metadata?: { sourceAdapter?: string } }>;
            return contexts[0]?.metadata?.sourceAdapter;
          }),
        )
        .toBe(sourceAdapter);
    }
  } finally {
    await context.close();
  }
});

test("a running generic probe can be stopped when site access is revoked", async () => {
  const { context, worker } = await launchExtension();
  const pageUrl = "https://api.crossref.org/papername-probe-test";
  try {
    await context.route(pageUrl, (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: '<meta name="citation_title" content="Initial paper"><meta name="citation_author" content="Jane Wu">',
      }),
    );
    const page = await context.newPage();
    await page.goto(pageUrl);
    const tabId = await worker.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({ url }))[0];
      if (tab?.id === undefined) throw new Error("Test tab was not found");
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["/probe.js"],
      });
      return tab.id;
    }, pageUrl);
    await waitForArticleContext(worker);

    await worker.evaluate(async (id) => {
      await chrome.tabs.sendMessage(id, { type: "papername:stop-probe" });
      await chrome.storage.session.clear();
    }, tabId);
    await page.evaluate(() => {
      document
        .querySelector('meta[name="citation_title"]')
        ?.setAttribute("content", "Changed paper");
      document.body.append(document.createElement("div"));
    });
    await page.waitForTimeout(500);

    expect(
      await worker.evaluate(async () =>
        Object.keys(await chrome.storage.session.get(null)).filter((key) =>
          key.startsWith("articleContext:"),
        ),
      ),
    ).toEqual([]);
  } finally {
    await context.close();
  }
});
