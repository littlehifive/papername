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

test("an open popup updates when late article metadata arrives", async () => {
  const { context, extensionId, worker } = await launchExtension();
  try {
    await context.route("https://www.jstor.org/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<head></head><body><p>Loading article</p></body>",
      }),
    );
    const page = await context.newPage();
    await page.goto(articleUrl);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.bringToFront();
    await popup.reload();
    await expect(popup.locator("#site-access-label")).toHaveText(
      "No paper found yet",
    );
    await page.evaluate((markup) => {
      document.head.innerHTML = markup;
    }, article);
    await waitForArticleContext(worker);
    await expect(popup.locator("#site-access-label")).toHaveText(
      "Ready to rename",
      { timeout: 1500 },
    );
  } finally {
    await context.close();
  }
});

test("continuous page mutations do not starve late metadata capture", async () => {
  const { context, worker } = await launchExtension();
  try {
    await context.route("https://www.jstor.org/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<head></head><body><p>Loading article</p></body>",
      }),
    );
    const page = await context.newPage();
    await page.goto(articleUrl);
    // A popup-style refresh confirms the content script has installed its listener.
    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: "https://www.jstor.org/*" });
      await chrome.tabs.sendMessage(tabs[0]!.id!, {
        type: "papername:refresh-context",
      });
    });
    await page.evaluate(
      (markup) => {
        document.head.innerHTML = markup;
        const timer = setInterval(() => {
          document.querySelector("p")!.textContent = String(performance.now());
        }, 50);
        setTimeout(() => clearInterval(timer), 5000);
      },
      article.replace(/<a[\s\S]+/, ""),
    );
    await expect
      .poll(
        () =>
          worker.evaluate(async () => {
            return Object.keys(await chrome.storage.session.get(null)).filter(
              (k) => k.startsWith("articleContext:"),
            ).length;
          }),
        { timeout: 1500 },
      )
      .toBe(1);
  } finally {
    await context.close();
  }
});

test("repeated popup opens stay responsive after a service-worker stop", async () => {
  const { context, extensionId, worker } = await launchExtension();
  try {
    await routePaper(context);
    const page = await context.newPage();
    await page.goto(articleUrl);
    await waitForArticleContext(worker);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await page.bringToFront();
      await popup.reload();
      await expect(popup.locator("#site-access-label")).toHaveText(
        "Ready to rename",
        { timeout: 1000 },
      );
      await popup.close();
    }

    const cdp = await context.newCDPSession(page);
    await cdp.send("ServiceWorker.enable");
    await cdp.send("ServiceWorker.stopAllWorkers");
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.bringToFront();
    await popup.reload();
    await expect(popup.locator("#site-access-label")).toHaveText(
      "Ready to rename",
      { timeout: 1500 },
    );
  } finally {
    await context.close();
  }
});

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
      expect.arrayContaining(["downloads", "storage"]),
    );
    expect(manifest.permissions).not.toEqual(
      expect.arrayContaining(["activeTab", "scripting"]),
    );
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.host_permissions).toEqual(
      expect.arrayContaining(["http://*/*", "https://*/*"]),
    );
    expect(manifest.content_scripts?.[0]).toMatchObject({
      matches: ["http://*/*", "https://*/*"],
      exclude_matches: ["*://*.researchgate.net/*"],
    });
    await routePaper(context);
    const page = await context.newPage();
    await page.goto(articleUrl);
    await waitForArticleContext(worker);
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
    await popup.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) =>
            localStorage.setItem("copied-filename", value),
        },
      });
    });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.bringToFront();
    await popup.reload();

    await expect(popup.locator("header p")).toHaveText(
      "Give every academic PDF a name that makes sense.",
    );
    await expect(popup.locator("#site-access-label")).toHaveText(
      "Ready to rename",
    );
    await expect(popup.locator("#site-access-message")).toHaveText(
      "Paper details found on JSTOR. Papername is ready to name this paper's PDF.",
    );
    await popup.locator("#enabled").uncheck();
    await expect(popup.locator("#site-access-label")).toHaveText(
      "Papername is off",
    );
    await popup.locator("#enabled").check();
    await expect(popup.locator("#site-access-label")).toHaveText(
      "Ready to rename",
    );
    const siteStatusBox = await popup.locator("#site-access").boundingBox();
    const namingStyleBox = await popup.locator("#naming-style").boundingBox();
    expect(siteStatusBox?.y).toBeLessThan(namingStyleBox?.y ?? 0);

    await expect(popup.locator("#preset")).toHaveValue("citation");
    await expect(popup.locator('option[value="citation"]')).toHaveText(
      "Authors & year",
    );
    await expect(popup.locator("#format-pattern")).toHaveText(
      "[Authors] ([Year])",
    );
    await expect(popup.locator("#format-example")).toHaveText(
      "Cerna-Turoff et al. (2021).pdf",
    );
    await expect(popup.locator("#enabled")).toBeChecked();
    await expect(popup.locator("#site-actions")).toBeHidden();
    await expect(popup.locator("#last-outcome")).toHaveText(
      "Williams & Bargh (2008) — Warm hands, warm heart.pdf",
    );
    await popup.locator("#copy-last-outcome").click();
    await expect(popup.locator("#copy-last-outcome")).toHaveAttribute(
      "aria-label",
      "Copied filename",
    );
    await expect
      .poll(() => popup.evaluate(() => localStorage.getItem("copied-filename")))
      .toBe("Williams & Bargh (2008) — Warm hands, warm heart.pdf");
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
    await expect(popup.locator("#activation")).toBeVisible();
    await expect(popup.locator("#activation summary")).toContainText(
      "One-time invite, not an API key",
    );
    await expect(popup.locator("#activation")).not.toHaveAttribute("open", "");
    await expect(popup.locator(".telemetry strong")).toHaveText(
      "Share anonymous usage data",
    );
    await expect(popup.locator(".telemetry small")).toContainText(
      "Paper titles, filenames, and websites are never included.",
    );
    await expect(popup.locator("#pro-interest")).toHaveText(
      "I'd buy you a coffee ☕",
    );
    await expect(popup.locator(".support-card p")).toHaveText(
      "No payment yet — this simply saves your interest on this device.",
    );

    await popup.locator("#preset").selectOption("citation_gist");
    await expect(popup.locator("#consent")).toBeVisible();
    await expect(popup.locator("#consent h2")).toHaveText(
      "Use AI-generated key takeaways?",
    );
    await expect(popup.locator("#consent")).toContainText(
      "Papername sends the paper's title and abstract — not the PDF — to an AI service.",
    );
    await expect(popup.locator("#consent")).toContainText(
      "may keep copies in safety logs for up to 30 days",
    );
    await popup.locator('#consent button[value="accept"]').click();
    await expect(popup.locator("#preset")).toHaveValue("citation_gist");
    await expect(popup.locator("#activation")).toBeVisible();
    await expect(popup.locator("#activation")).toHaveAttribute("open", "");
    await expect(popup.locator('#activation label[for="invite"]')).toHaveText(
      "Beta access code",
    );
    await expect(popup.locator("#activation-description")).toHaveText(
      "Enter the one-time code from your beta invitation to use AI key takeaways. This is not an API key.",
    );

    await popup.locator("#invite").fill("BETA-TEST");
    await popup.locator("#activate").click();
    await expect(popup.locator("#remaining")).toHaveText("30");
    await expect(popup.locator("#quota")).toContainText(
      "AI key takeaways left this month",
    );

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

test("captures OSF's primary MFR-backed preprint URL", async () => {
  const { context, worker } = await launchExtension();
  const osfArticleUrl = "https://osf.io/preprints/psyarxiv/qmh3s_v3";
  const osfPdfUrl = "https://osf.io/download/6aa17d8ca9afb7bc95af9441/";
  const viewerUrl = `https://mfr.osf.io/render?url=${encodeURIComponent(`${osfPdfUrl}?direct&mode=render`)}`;
  try {
    await context.route("https://mfr.osf.io/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>PDF viewer</p>" }),
    );
    await context.route("https://osf.io/**", (route) => {
      if (route.request().url() === osfPdfUrl) {
        return route.fulfill({
          contentType: "application/pdf",
          headers: {
            "content-disposition":
              'attachment; filename="Clean_Bradyetal_SelectionProblem_Manuscript_preprint.pdf"',
          },
          body: "%PDF-1.4\n%%EOF",
        });
      }
      return route.fulfill({
        contentType: "text/html",
        body: `<meta name="citation_title" content="Artificial Intelligence Systems Distort Upstream Selection in Human Social Learning">
          <meta name="citation_author" content="William J. Brady">
          <meta name="citation_author" content="Chen-Wei Yu">
          <meta name="citation_author" content="Nicholas Ornstein">
          <meta name="citation_author" content="Bolun Sun">
          <meta name="citation_author" content="Joshua Conrad Jackson">
          <meta name="citation_date" content="2026">
          <iframe src="${viewerUrl}"></iframe>
          <a id="download" href="${osfPdfUrl}">Download preprint</a>`,
      });
    });
    const page = await context.newPage();
    await page.goto(osfArticleUrl);
    await waitForArticleContext(worker);

    const storedPdfUrls = await worker.evaluate(async () => {
      const contexts = Object.values(
        await chrome.storage.session.get(null),
      ) as Array<{
        metadata?: { pdfUrls?: string[] };
      }>;
      return contexts[0]?.metadata?.pdfUrls;
    });
    expect(storedPdfUrls).toEqual([osfPdfUrl]);
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

test("an unfamiliar metadata-rich repository works without opening the popup", async () => {
  const { context, worker } = await launchExtension();
  const repositoryUrl = "https://repository.example.edu/items/agency-paper";
  const repositoryPdf =
    "https://repository.example.edu/bitstreams/agency-paper/content.pdf";
  try {
    await context.route("https://repository.example.edu/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<meta name="citation_title" content="A paper from an unfamiliar repository">
          <meta name="citation_author" content="Jane Wu">
          <meta name="citation_date" content="2026">
          <meta name="citation_pdf_url" content="${repositoryPdf}">`,
      }),
    );
    const page = await context.newPage();
    await page.goto(repositoryUrl);
    await waitForArticleContext(worker);

    const contexts = await worker.evaluate(async () =>
      Object.values(await chrome.storage.session.get(null)),
    );
    expect(contexts[0]).toMatchObject({
      pageUrl: repositoryUrl,
      metadata: {
        title: "A paper from an unfamiliar repository",
        authors: [{ familyName: "Wu" }],
        year: "2026",
        pdfUrls: [repositoryPdf],
      },
    });
  } finally {
    await context.close();
  }
});

test("captures a proxied PDF from the selected Google Scholar result", async () => {
  const { context, worker } = await launchExtension();
  const scholarUrl = "https://scholar.google.com/scholar?q=human+agency";
  const proxyPdf =
    "https://link-springer-com.proxy.library.edu/content/pdf/10.1007/example.pdf";
  try {
    await context.route("https://scholar.google.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<div class="gs_r gs_or gs_scl">
          <div class="gs_or_ggsm"><a id="pdf" href="${proxyPdf}">[PDF] springer.com</a></div>
          <h3 class="gs_rt"><a>Subjective quantitative studies of human agency</a></h3>
          <div class="gs_a">S Alkire - Social indicators research, 2005 - Springer</div>
          <div class="gs_rs">Can we measure expansions in agency?</div>
        </div>`,
      }),
    );
    const page = await context.newPage();
    await page.goto(scholarUrl);
    await page.locator("#pdf").dispatchEvent("pointerdown");
    await waitForArticleContext(worker);

    const contexts = await worker.evaluate(async () =>
      Object.values(await chrome.storage.session.get(null)),
    );
    expect(contexts[0]).toMatchObject({
      pageUrl: scholarUrl,
      metadata: {
        title: "Subjective quantitative studies of human agency",
        authors: [{ familyName: "Alkire" }],
        year: "2005",
        pdfUrls: [proxyPdf],
        sourceAdapter: "google-scholar",
      },
    });
  } finally {
    await context.close();
  }
});
