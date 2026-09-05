import type { Preset } from "@papername/core";
import { browser } from "wxt/browser";

import { activateInvite, sendTelemetry } from "../../src/backend";
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
}

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
