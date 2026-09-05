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
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator("#preset")).toHaveValue("citation");
    await expect(popup.locator("#enabled")).toBeChecked();
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
