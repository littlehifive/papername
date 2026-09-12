import {
  findMatchingPageContext,
  usesTakeaway,
  type Preset,
} from "@papername/core";
import { browser } from "wxt/browser";

import { ensureApiToken } from "../../src/account";
import { PapernameApiError, redeemKey, sendTelemetry } from "../../src/backend";
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
const toast = document.querySelector<HTMLInputElement>("#toast")!;
const enabledState = document.querySelector<HTMLElement>("#enabled-state")!;
const telemetryState = document.querySelector<HTMLElement>("#telemetry-state")!;
const toastState = document.querySelector<HTMLElement>("#toast-state")!;
const redeemCard = document.querySelector<HTMLDetailsElement>("#redeem-card")!;
const accessKey = document.querySelector<HTMLInputElement>("#access-key")!;
const redeem = document.querySelector<HTMLButtonElement>("#redeem")!;
const redeemMessage = document.querySelector<HTMLElement>("#redeem-message")!;
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
    example: "Wu et al. (2021).pdf",
  },
  citation_title: {
    pattern: "[Authors] ([Year]) — [Title]",
    example: "Wu et al. (2021) — Violence against children.pdf",
  },
  title: {
    pattern: "[Title]",
    example: "Violence against children.pdf",
  },
  citation_gist: {
    pattern: "[Authors] ([Year]) — [Key takeaway]",
    example: "Wu et al. (2021) — Childhood violence shapes later health.pdf",
  },
  gist: {
    pattern: "[Key takeaway]",
    example: "Childhood violence shapes later health.pdf",
  },
};

const REDEEM_MESSAGES: Record<string, string> = {
  invalid_key: "Enter the full access key.",
  key_unknown: "Papername doesn't recognize this key.",
  key_used: "This key has already been used.",
  unauthorized: "Could not verify this browser. Try again.",
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

function renderToggleState(input: HTMLInputElement, state: HTMLElement): void {
  state.textContent = input.checked ? "On" : "Off";
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
  renderToggleState(enabled, enabledState);
  preset.value = settings.preset;
  renderFormatPreview(settings.preset);
  telemetry.checked = settings.telemetryEnabled;
  renderToggleState(telemetry, telemetryState);
  toast.checked = settings.toastEnabled;
  renderToggleState(toast, toastState);
  quota.hidden = !settings.apiToken;
  remaining.textContent = String(settings.remaining ?? "—");
  redeemCard.open =
    redeemCard.open ||
    (usesTakeaway(settings.preset) &&
      Boolean(settings.apiToken) &&
      settings.remaining === 0);
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
  renderToggleState(enabled, enabledState);
  await updateSettings({ enabled: enabled.checked });
  await renderSiteAccess(enabled.checked);
});
telemetry.addEventListener("change", async () => {
  renderToggleState(telemetry, telemetryState);
  await updateSettings({ telemetryEnabled: telemetry.checked });
  if (telemetry.checked) {
    await ensureApiToken();
    await render();
  }
});
toast.addEventListener("change", () => {
  renderToggleState(toast, toastState);
  void updateSettings({ toastEnabled: toast.checked });
});

preset.addEventListener("change", async () => {
  const nextPreset = preset.value as Preset;
  const settings = await getSettings();
  if (usesTakeaway(nextPreset) && !settings.gistConsent) {
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
  if (usesTakeaway(nextPreset)) {
    // The trial balance is provisioned as soon as the feature is enabled.
    await ensureApiToken();
    await refreshActiveContext();
  }
  const updated = await getSettings();
  if (updated.telemetryEnabled && updated.apiToken) {
    void sendTelemetry(updated.apiToken, {
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

redeem.addEventListener("click", async () => {
  const key = accessKey.value.trim();
  if (!key) {
    redeemMessage.textContent = REDEEM_MESSAGES.invalid_key!;
    return;
  }
  redeem.disabled = true;
  redeemMessage.textContent = "Adding names…";
  try {
    const token = await ensureApiToken();
    if (!token) throw new PapernameApiError("unreachable");
    const result = await redeemKey(token, key);
    await updateSettings({ remaining: result.remaining });
    accessKey.value = "";
    redeemMessage.textContent = `Added ${result.added} names.`;
    const settings = await getSettings();
    if (usesTakeaway(settings.preset)) await refreshActiveContext();
    await render();
  } catch (error) {
    const reason =
      error instanceof PapernameApiError ? error.reason : "unreachable";
    redeemMessage.textContent =
      REDEEM_MESSAGES[reason] ?? "Could not reach Papername. Try again.";
  } finally {
    redeem.disabled = false;
  }
});

proInterest.addEventListener("click", async () => {
  const settings = await getSettings();
  await updateSettings({ proInterest: true });
  proInterest.textContent = "Thanks — that means a lot!";
  proInterest.disabled = true;
  if (settings.telemetryEnabled && settings.apiToken) {
    void sendTelemetry(settings.apiToken, {
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
  if (area === "local" && "settings" in changes) {
    void getSettings().then((settings) => {
      quota.hidden = !settings.apiToken;
      remaining.textContent = String(settings.remaining ?? "—");
    });
  }
});
void refreshActiveContext();
