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

async function storedSettings(worker: Worker): Promise<unknown> {
  return worker.evaluate(
    async () => (await chrome.storage.local.get("settings")).settings,
  );
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
          outcome: "renamed",
          reason: "selected_preset",
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
      "Turn filenames like 1c96203b55c6.pdf into Wu et al. (2026).pdf.",
    );
    await expect(popup.locator("#site-access-label")).toHaveText(
      "Ready to rename",
    );
    await expect(popup.locator("#site-access-message")).toHaveText(
      "Paper details found on JSTOR. Papername is ready to name this paper's PDF.",
    );
    await popup.locator("header .toggle").click();
    await expect(popup.locator("#enabled")).not.toBeChecked();
    await expect(popup.locator("#enabled-state")).toHaveText("Off");
    await expect(popup.locator("#site-access-label")).toHaveText(
      "Papername is off",
    );
    await popup.locator("header .toggle").click();
    await expect(popup.locator("#site-access-label")).toHaveText(
      "Ready to rename",
    );
    const siteStatusBox = await popup.locator("#site-access").boundingBox();
    const namingStyleBox = await popup.locator("#naming-style").boundingBox();
    expect(siteStatusBox?.y).toBeLessThan(namingStyleBox?.y ?? 0);

    await expect(popup.locator("#preset")).toHaveValue("citation");
    await expect(popup.locator("#preset option")).toHaveText([
      "Authors & year",
      "Authors, year & title",
      "Customize…",
    ]);
    await expect(popup.locator("#template-builder")).toBeHidden();
    await expect(popup.locator("#format-pattern")).toHaveText(
      "[Authors] ([Year])",
    );
    await expect(popup.locator("#format-example")).toHaveText(
      "Wu et al. (2021).pdf",
    );
    await expect(popup.locator("#enabled")).toBeChecked();
    await expect(popup.locator("#enabled")).toHaveAttribute("role", "switch");
    await expect(popup.locator("#enabled-state")).toHaveText("On");
    await expect(popup.locator("header .toggle-track")).toHaveCSS(
      "background-color",
      "rgb(79, 70, 229)",
    );
    // Retired backend controls must not come back.
    await expect(
      popup.locator("#activation, #quota, #telemetry, #consent"),
    ).toHaveCount(0);
    await expect(popup.locator("#support-link")).toHaveText(
      "☕ Buy me a coffee",
    );
    await expect(popup.locator("#support-link")).toHaveAttribute(
      "href",
      /^https:\/\/ko-fi\.com\//,
    );
    await expect(popup.locator("#support-link")).toHaveAttribute(
      "target",
      "_blank",
    );
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

test("builds a custom filename format from reorderable pieces", async () => {
  const { context, extensionId, worker } = await launchExtension();
  try {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator("#preset").selectOption("custom");
    await expect(popup.locator("#template-builder")).toBeVisible();
    const chips = popup.locator("#template-strip .chip");
    await expect(chips).toHaveCount(5);
    await expect(popup.locator("#format-pattern")).toHaveText(
      "[Authors] ([Year]) — [Title]",
    );
    await expect(popup.locator("#format-example")).toHaveText(
      "Wu et al. (2021) — Violence against children.pdf",
    );
    await expect(popup.locator("#template-hint")).toBeHidden();
    await expect(popup.locator('.chip-add[data-add="title"]')).toBeDisabled();
    await expect(popup.locator('.chip-add[data-add="text"]')).toBeEnabled();

    // Path characters are previewed as the filesystem-safe result, not blocked.
    const separator = popup.locator("#template-strip .chip-input").nth(1);
    await separator.fill("): ");
    await expect(popup.locator("#format-pattern")).toHaveText(
      "[Authors] ([Year]): [Title]",
    );
    await expect(popup.locator("#format-example")).toHaveText(
      "Wu et al. (2021) — Violence against children.pdf",
    );
    await expect(popup.locator("#template-hint")).toBeVisible();

    // Keyboard reordering: Title to the front, then a new separator after it.
    const title = popup.locator('#template-strip .chip[data-kind="title"]');
    await title.focus();
    await title.press("Home");
    await expect(popup.locator("#format-pattern")).toHaveText(
      "[Title][Authors] ([Year]): ",
    );
    await popup.locator('.chip-add[data-add="text"]').click();
    await expect(chips).toHaveCount(6);
    await chips.nth(5).focus();
    for (let step = 0; step < 4; step += 1) {
      await popup.keyboard.press("ArrowLeft");
    }
    await expect(popup.locator("#format-pattern")).toHaveText(
      "[Title] - [Authors] ([Year]): ",
    );
    await popup.locator("#template-strip .chip-input").last().fill(")");
    await expect(popup.locator("#format-pattern")).toHaveText(
      "[Title] - [Authors] ([Year])",
    );
    await expect(popup.locator("#format-example")).toHaveText(
      "Violence against children - Wu et al. (2021).pdf",
    );
    await expect(popup.locator("#template-hint")).toBeHidden();

    const expectedTemplate = [
      { kind: "title" },
      { kind: "text", value: " - " },
      { kind: "authors" },
      { kind: "text", value: " (" },
      { kind: "year" },
      { kind: "text", value: ")" },
    ];
    await expect
      .poll(() => storedSettings(worker))
      .toEqual({
        enabled: true,
        preset: "custom",
        customTemplate: expectedTemplate,
      });

    // The arrangement survives reopening and switching presets.
    await popup.reload();
    await expect(popup.locator("#preset")).toHaveValue("custom");
    await expect(popup.locator("#format-pattern")).toHaveText(
      "[Title] - [Authors] ([Year])",
    );
    await popup.locator("#preset").selectOption("citation");
    await expect(popup.locator("#template-builder")).toBeHidden();
    await expect(popup.locator("#format-pattern")).toHaveText(
      "[Authors] ([Year])",
    );
    await popup.locator("#preset").selectOption("custom");
    await expect(popup.locator("#format-pattern")).toHaveText(
      "[Title] - [Authors] ([Year])",
    );

    // At least one metadata piece must remain.
    await popup
      .locator('#template-strip .chip[data-kind="authors"] .chip-remove')
      .click();
    await popup
      .locator('#template-strip .chip[data-kind="year"] .chip-remove')
      .click();
    await expect(
      popup.locator('#template-strip .chip[data-kind="title"] .chip-remove'),
    ).toBeDisabled();
    await expect(popup.locator('.chip-add[data-add="authors"]')).toBeEnabled();
    await expect(popup.locator('.chip-add[data-add="year"]')).toBeEnabled();
  } finally {
    await context.close();
  }
});
