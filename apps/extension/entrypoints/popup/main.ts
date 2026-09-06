import type { Preset } from "@papername/core";
import { browser } from "wxt/browser";

import { activateInvite, sendTelemetry } from "../../src/backend";
import {
  landingPageCandidates,
  recoverDirectPdfContext,
} from "../../src/direct-pdf";
import {
  forgetSite as forgetSiteAccess,
  getRememberedOrigins,
  rememberSite as rememberSiteAccess,
  scanSiteOnce,
} from "../../src/site-actions";
import { siteAccessForUrl, type SiteAccess } from "../../src/site-access";
import {
  getLastOutcome,
  getSettings,
  setPreset,
  updateSettings,
} from "../../src/storage";

const enabled = document.querySelector<HTMLInputElement>("#enabled")!;
const preset = document.querySelector<HTMLSelectElement>("#preset")!;
const telemetry = document.querySelector<HTMLInputElement>("#telemetry")!;
const activation = document.querySelector<HTMLElement>("#activation")!;
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
const siteActions = document.querySelector<HTMLElement>("#site-actions")!;
const scanSite = document.querySelector<HTMLButtonElement>("#scan-site")!;
const rememberSite =
  document.querySelector<HTMLButtonElement>("#remember-site")!;
const forgetSite = document.querySelector<HTMLButtonElement>("#forget-site")!;

let currentTab: { id: number; url: string } | undefined;
let currentSiteAccess: SiteAccess = {
  mode: "unavailable",
  directPdf: false,
};

function setSiteButtonsBusy(busy: boolean): void {
  scanSite.disabled = busy;
  rememberSite.disabled = busy;
  forgetSite.disabled = busy;
}

async function renderSiteAccess(): Promise<void> {
  const [activeTab, rememberedOrigins] = await Promise.all([
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => tab),
    getRememberedOrigins(),
  ]);
  currentTab =
    activeTab?.id !== undefined && activeTab.url
      ? { id: activeTab.id, url: activeTab.url }
      : undefined;
  currentSiteAccess = siteAccessForUrl(currentTab?.url, rememberedOrigins);
  siteActions.hidden = true;
  scanSite.hidden = false;
  rememberSite.hidden = false;
  forgetSite.hidden = true;

  if (currentSiteAccess.mode === "unavailable") {
    siteAccessMessage.textContent =
      "Open an academic article page to use Papername.";
    return;
  }
  if (currentSiteAccess.mode === "blocked") {
    siteAccessMessage.textContent =
      "ResearchGate is excluded because its terms prohibit browser add-ons from accessing site data.";
    return;
  }
  if (currentSiteAccess.directPdf) {
    if (currentTab && landingPageCandidates(currentTab.url).length) {
      siteAccessMessage.textContent =
        "This PDF has a recognizable repository route. Papername can retrieve its article metadata without reading the PDF.";
      siteActions.hidden = false;
      scanSite.textContent = "Find article metadata";
      rememberSite.hidden = true;
    } else {
      siteAccessMessage.textContent =
        "Open the article or repository record page first; this bare PDF has no safely recoverable metadata route.";
    }
    return;
  }
  scanSite.textContent = "Use once on this page";
  if (currentSiteAccess.mode === "automatic") {
    siteAccessMessage.textContent = `Automatic on ${currentSiteAccess.sourceName}. Download the PDF from its article page.`;
    return;
  }

  siteActions.hidden = false;
  if (currentSiteAccess.mode === "remembered") {
    siteAccessMessage.textContent = `Automatic on ${currentSiteAccess.hostname}.`;
    scanSite.hidden = true;
    rememberSite.hidden = true;
    forgetSite.hidden = false;
    return;
  }
  siteAccessMessage.textContent =
    "Not enabled. Use it once on this page, or remember this exact site.";
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
  telemetry.checked = settings.telemetryEnabled;
  activation.hidden = Boolean(settings.betaToken);
  quota.hidden = !settings.betaToken;
  remaining.textContent = String(settings.remaining ?? "—");
  if (settings.proInterest) {
    proInterest.textContent = "Thanks — saved on this device";
    proInterest.disabled = true;
  }

  const last = await getLastOutcome();
  lastOutcome.textContent = last
    ? last.suggestion
      ? last.outcome === "fallback"
        ? `Fallback (${last.reason.replaceAll("_", " ")}): ${last.suggestion}`
        : `Renamed: ${last.suggestion}`
      : `Unchanged: ${last.reason.replaceAll("_", " ")}`
    : "No eligible PDF handled yet.";
  await renderSiteAccess();
}

scanSite.addEventListener("click", async () => {
  if (
    !currentTab ||
    currentSiteAccess.mode === "unavailable" ||
    currentSiteAccess.mode === "blocked" ||
    (currentSiteAccess.mode === "automatic" && !currentSiteAccess.directPdf)
  )
    return;
  setSiteButtonsBusy(true);
  siteAccessMessage.textContent = currentSiteAccess.directPdf
    ? "Looking for the article record…"
    : "Reading scholarly metadata on this page…";
  try {
    const captured = currentSiteAccess.directPdf
      ? await recoverDirectPdfContext(currentTab.id, currentTab.url)
      : await scanSiteOnce(currentTab.id, currentTab.url);
    siteAccessMessage.textContent = captured
      ? "Ready. Download the PDF from this page."
      : "No reliable paper metadata found. Open its article or repository record page instead.";
  } catch {
    siteAccessMessage.textContent =
      "Chrome could not read this page. Reload it, then try again.";
  } finally {
    setSiteButtonsBusy(false);
  }
});

rememberSite.addEventListener("click", async () => {
  if (!currentTab || currentSiteAccess.mode !== "available") return;
  const hostname = currentSiteAccess.hostname;
  setSiteButtonsBusy(true);
  siteAccessMessage.textContent = `Waiting for permission for ${currentSiteAccess.hostname}…`;
  try {
    const result = await rememberSiteAccess(
      currentTab.id,
      currentTab.url,
      currentSiteAccess.originPattern,
    );
    if (result === "denied") {
      siteAccessMessage.textContent = "Site permission was not granted.";
      return;
    }
    await renderSiteAccess();
    siteAccessMessage.textContent =
      result === "captured"
        ? `Automatic on ${hostname}. Download the PDF from this page.`
        : "Site remembered, but this page has no reliable paper metadata. Try its article record page.";
  } catch {
    siteAccessMessage.textContent =
      "Could not remember this site. Please try again.";
  } finally {
    setSiteButtonsBusy(false);
  }
});

forgetSite.addEventListener("click", async () => {
  if (!currentTab || currentSiteAccess.mode !== "remembered") return;
  setSiteButtonsBusy(true);
  try {
    await forgetSiteAccess(currentSiteAccess.originPattern);
    await renderSiteAccess();
  } catch {
    siteAccessMessage.textContent = "Could not remove this site permission.";
  } finally {
    setSiteButtonsBusy(false);
  }
});

enabled.addEventListener(
  "change",
  () => void updateSettings({ enabled: enabled.checked }),
);
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
  proInterest.textContent = "Thanks — saved on this device";
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
