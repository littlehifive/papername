import { findMatchingPageContext, type Preset } from "@papername/core";
import { browser } from "wxt/browser";

import { activateInvite, sendTelemetry } from "../../src/backend";
import {
  landingPageCandidates,
  recoverDirectPdfContext,
} from "../../src/direct-pdf";
import { siteAccessForUrl, type SiteAccess } from "../../src/site-access";
import {
  getContexts,
  getLastOutcome,
  getSettings,
  setPreset,
  updateSettings,
} from "../../src/storage";

const enabled = document.querySelector<HTMLInputElement>("#enabled")!;
const preset = document.querySelector<HTMLSelectElement>("#preset")!;
const telemetry = document.querySelector<HTMLInputElement>("#telemetry")!;
const activation = document.querySelector<HTMLDetailsElement>("#activation")!;
const invite = document.querySelector<HTMLInputElement>("#invite")!;
const activate = document.querySelector<HTMLButtonElement>("#activate")!;
const activationMessage = document.querySelector<HTMLElement>(
  "#activation-message",
)!;
const quota = document.querySelector<HTMLElement>("#quota")!;
const remaining = document.querySelector<HTMLElement>("#remaining")!;
const lastOutcome = document.querySelector<HTMLElement>("#last-outcome")!;
const consent = document.querySelector<HTMLDialogElement>("#consent")!;
const proInterest = document.querySelector<HTMLButtonElement>("#pro-interest")!;
const privacy = document.querySelector<HTMLAnchorElement>("#privacy")!;
const siteAccessMessage = document.querySelector<HTMLElement>(
  "#site-access-message",
)!;
const siteAccess = document.querySelector<HTMLElement>("#site-access")!;
const siteAccessIcon =
  document.querySelector<HTMLElement>("#site-access-icon")!;
const siteAccessLabel =
  document.querySelector<HTMLElement>("#site-access-label")!;
const siteActions = document.querySelector<HTMLElement>("#site-actions")!;
const scanSite = document.querySelector<HTMLButtonElement>("#scan-site")!;
const formatPattern = document.querySelector<HTMLElement>("#format-pattern")!;
const formatExample = document.querySelector<HTMLElement>("#format-example")!;
const copyLastOutcome =
  document.querySelector<HTMLButtonElement>("#copy-last-outcome")!;
const copyLabel = copyLastOutcome.querySelector<HTMLElement>(".copy-label")!;

const FORMAT_PREVIEWS: Record<Preset, { pattern: string; example: string }> = {
  citation: {
    pattern: "[Authors] ([Year])",
    example: "Cerna-Turoff et al. (2021).pdf",
  },
  citation_title: {
    pattern: "[Authors] ([Year]) — [Title]",
    example: "Cerna-Turoff et al. (2021) — Violence against children.pdf",
  },
  title: {
    pattern: "[Title]",
    example: "Violence against children.pdf",
  },
  citation_gist: {
    pattern: "[Authors] ([Year]) — [Key takeaway]",
    example:
      "Cerna-Turoff et al. (2021) — Childhood violence shapes later health.pdf",
  },
};

let currentTab: { id: number; url: string } | undefined;
let currentSiteAccess: SiteAccess = {
  mode: "unavailable",
  directPdf: false,
};
let latestFilename: string | undefined;
let siteRenderVersion = 0;

type SiteState = "checking" | "ready" | "warning" | "blocked" | "unavailable";

function setSiteStatus(
  state: SiteState,
  label: string,
  message: string,
  showAction = false,
): void {
  const icons: Record<SiteState, string> = {
    checking: "…",
    ready: "✓",
    warning: "!",
    blocked: "×",
    unavailable: "–",
  };
  siteAccess.dataset.state = state;
  siteAccessIcon.textContent = icons[state];
  siteAccessLabel.textContent = label;
  siteAccessMessage.textContent = message;
  siteActions.hidden = !showAction;
}

function renderFormatPreview(nextPreset: Preset): void {
  const preview = FORMAT_PREVIEWS[nextPreset];
  formatPattern.textContent = preview.pattern;
  formatExample.textContent = preview.example;
}

function setSiteButtonBusy(busy: boolean): void {
  scanSite.disabled = busy;
}

async function renderSiteAccess(isEnabled = true): Promise<void> {
  const version = ++siteRenderVersion;
  const [[activeTab], contexts] = await Promise.all([
    browser.tabs.query({
      active: true,
      currentWindow: true,
    }),
    getContexts(),
  ]);
  if (version !== siteRenderVersion) return;
  currentTab =
    activeTab?.id !== undefined && activeTab.url
      ? { id: activeTab.id, url: activeTab.url }
      : undefined;
  currentSiteAccess = siteAccessForUrl(currentTab?.url);

  if (!isEnabled) {
    setSiteStatus(
      "unavailable",
      "Papername is off",
      "Turn Papername on to rename downloads from this page.",
    );
    return;
  }

  if (currentSiteAccess.mode === "unavailable") {
    setSiteStatus(
      "unavailable",
      "Not an article page",
      "Open an academic article page, then download its PDF.",
    );
    return;
  }
  if (currentSiteAccess.mode === "blocked") {
    setSiteStatus(
      "blocked",
      "Unavailable here",
      "Papername cannot read ResearchGate pages because that site does not allow this kind of browser extension.",
    );
    return;
  }
  const activePage = currentTab
    ? { tabId: currentTab.id, url: currentTab.url }
    : undefined;
  const paperDetailsFound = Boolean(
    activePage && findMatchingPageContext(contexts, activePage),
  );
  if (paperDetailsFound) {
    setSiteStatus(
      "ready",
      "Ready to rename",
      currentSiteAccess.sourceName
        ? `Paper details found on ${currentSiteAccess.sourceName}. Papername is ready to name this paper's PDF.`
        : "Paper details found. Papername is ready to name this paper's PDF.",
    );
    return;
  }
  if (currentSiteAccess.directPdf) {
    if (currentTab && landingPageCandidates(currentTab.url).length) {
      setSiteStatus(
        "warning",
        "Paper details needed",
        "Papername may be able to find this PDF's public article page without reading the PDF itself.",
        true,
      );
    } else {
      setSiteStatus(
        "unavailable",
        "Cannot identify this PDF",
        "Open the article or repository page first, then download the PDF there.",
      );
    }
    return;
  }
  if (currentSiteAccess.sourceName) {
    setSiteStatus(
      "warning",
      "No paper found yet",
      `${currentSiteAccess.sourceName} is supported, but this page does not show enough paper details yet. Open a specific article page.`,
    );
    return;
  }
  setSiteStatus(
    "warning",
    "No paper found",
    "This page does not show enough academic paper details. Open the paper's article page, then download its PDF.",
  );
}

async function refreshActiveContext(): Promise<void> {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (activeTab?.id !== undefined) {
    await browser.tabs
      .sendMessage(activeTab.id, { type: "papername:refresh-context" })
      .catch(() => undefined);
  }
}

async function render(): Promise<void> {
  const settings = await getSettings();
  enabled.checked = settings.enabled;
  preset.value = settings.preset;
  renderFormatPreview(settings.preset);
  telemetry.checked = settings.telemetryEnabled;
  activation.hidden = Boolean(settings.betaToken);
  activation.open = !settings.betaToken && settings.preset === "citation_gist";
  quota.hidden = !settings.betaToken;
  remaining.textContent = String(settings.remaining ?? "—");
  if (settings.proInterest) {
    proInterest.textContent = "Thanks — that means a lot!";
    proInterest.disabled = true;
  }

  const last = await getLastOutcome();
  latestFilename = last?.suggestion;
  lastOutcome.textContent =
    latestFilename ??
    (last ? "The latest PDF was left unchanged." : "No PDF renamed yet.");
  copyLastOutcome.hidden = !latestFilename;
  await renderSiteAccess(settings.enabled);
}

scanSite.addEventListener("click", async () => {
  if (
    !currentTab ||
    currentSiteAccess.mode === "unavailable" ||
    currentSiteAccess.mode === "blocked" ||
    !currentSiteAccess.directPdf
  )
    return;
  setSiteButtonBusy(true);
  siteAccessMessage.textContent = "Looking for the article record…";
  try {
    const captured = await recoverDirectPdfContext(
      currentTab.id,
      currentTab.url,
    );
    if (captured) {
      setSiteStatus(
        "ready",
        "Ready to rename",
        "Paper details found. Papername is ready to name this PDF.",
      );
    } else {
      setSiteStatus(
        "warning",
        "No paper found",
        "Papername could not find reliable paper details. Open its article or repository page instead.",
      );
    }
  } catch {
    setSiteStatus(
      "warning",
      "Could not check this page",
      "Chrome could not read this page. Reload it, then try again.",
    );
  } finally {
    setSiteButtonBusy(false);
  }
});

enabled.addEventListener("change", async () => {
  await updateSettings({ enabled: enabled.checked });
  await renderSiteAccess(enabled.checked);
});
telemetry.addEventListener(
  "change",
  () => void updateSettings({ telemetryEnabled: telemetry.checked }),
);

preset.addEventListener("change", async () => {
  const nextPreset = preset.value as Preset;
  const settings = await getSettings();
  if (nextPreset === "citation_gist" && !settings.gistConsent) {
    consent.showModal();
    const accepted = await new Promise<boolean>((resolve) => {
      consent.addEventListener(
        "close",
        () => resolve(consent.returnValue === "accept"),
        { once: true },
      );
    });
    if (!accepted) {
      preset.value = settings.preset;
      renderFormatPreview(settings.preset);
      return;
    }
    await updateSettings({ gistConsent: true });
  }
  await setPreset(nextPreset);
  if (nextPreset === "citation_gist") {
    await refreshActiveContext();
  }
  const updated = await getSettings();
  if (updated.telemetryEnabled && updated.betaToken) {
    void sendTelemetry(updated.betaToken, {
      event: "preset_changed",
      preset: nextPreset,
      outcome: "selected",
      reason: "none",
      latencyBucket: "na",
    }).catch(() => undefined);
  }
  await render();
});

copyLastOutcome.addEventListener("click", async () => {
  if (!latestFilename) return;
  try {
    await navigator.clipboard.writeText(latestFilename);
    copyLastOutcome.setAttribute("aria-label", "Copied filename");
    copyLabel.textContent = "Copied";
    copyLastOutcome.classList.add("is-copied");
    window.setTimeout(() => {
      copyLastOutcome.setAttribute("aria-label", "Copy filename");
      copyLabel.textContent = "Copy";
      copyLastOutcome.classList.remove("is-copied");
    }, 1_500);
  } catch {
    copyLastOutcome.setAttribute("aria-label", "Could not copy filename");
    copyLabel.textContent = "Try again";
  }
});

activate.addEventListener("click", async () => {
  activate.disabled = true;
  activationMessage.textContent = "Activating…";
  try {
    const result = await activateInvite(invite.value);
    await updateSettings({
      betaToken: result.token,
      remaining: result.remaining,
    });
    invite.value = "";
    activationMessage.textContent = "";
    const settings = await getSettings();
    if (settings.preset === "citation_gist") await refreshActiveContext();
    await render();
  } catch (error) {
    activationMessage.textContent =
      error instanceof Error
        ? error.message.replaceAll("_", " ")
        : "Activation failed";
  } finally {
    activate.disabled = false;
  }
});

proInterest.addEventListener("click", async () => {
  const settings = await getSettings();
  await updateSettings({ proInterest: true });
  proInterest.textContent = "Thanks — that means a lot!";
  proInterest.disabled = true;
  if (settings.telemetryEnabled && settings.betaToken) {
    void sendTelemetry(settings.betaToken, {
      event: "pro_interest",
      preset: settings.preset,
      outcome: "interested",
      reason: "none",
      latencyBucket: "na",
    }).catch(() => undefined);
  }
});

privacy.addEventListener("click", (event) => {
  event.preventDefault();
  void browser.tabs.create({ url: browser.runtime.getURL("/privacy.html") });
});

void render();
// Article metadata can arrive after this popup opens, especially on SPA readers.
browser.storage.onChanged.addListener((changes, area) => {
  if (
    area === "session" &&
    Object.keys(changes).some((key) => key.startsWith("articleContext:"))
  ) {
    void getSettings().then((settings) => renderSiteAccess(settings.enabled));
  }
});
void refreshActiveContext();
