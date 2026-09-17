import {
  buildFilename,
  DEFAULT_CUSTOM_TEMPLATE,
  findMatchingPageContext,
  moveToken,
  resolveTemplate,
  TEMPLATE_MAX_TOKENS,
  templatePattern,
  TEXT_TOKEN_MAX_LENGTH,
  TOKEN_LABELS,
  UNSAFE_BASENAME_CHARS,
  type FilenameTemplate,
  type MetadataTokenKind,
  type PaperMetadata,
  type Preset,
  type TemplateToken,
} from "@papername/core";
import { browser } from "wxt/browser";

import {
  landingPageCandidates,
  recoverDirectPdfContext,
} from "../../src/direct-pdf";
import type { ExtensionSettings } from "../../src/settings";
import { siteAccessForUrl, type SiteAccess } from "../../src/site-access";
import {
  getContexts,
  getLastOutcome,
  getSettings,
  updateSettings,
} from "../../src/storage";

const enabled = document.querySelector<HTMLInputElement>("#enabled")!;
const preset = document.querySelector<HTMLSelectElement>("#preset")!;
const enabledState = document.querySelector<HTMLElement>("#enabled-state")!;
const lastOutcome = document.querySelector<HTMLElement>("#last-outcome")!;
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
const templateBuilder =
  document.querySelector<HTMLElement>("#template-builder")!;
const templateStrip =
  document.querySelector<HTMLOListElement>("#template-strip")!;
const templateHint = document.querySelector<HTMLElement>("#template-hint")!;
const chipAddButtons = [
  ...document.querySelectorAll<HTMLButtonElement>(".chip-add"),
];

/** Paper used for the live example under the format selector. */
const SAMPLE_PAPER: PaperMetadata = {
  title: "Violence against children",
  authors: [
    { name: "Zezhen Wu", familyName: "Wu" },
    { name: "Second Author", familyName: "Author" },
    { name: "Third Author", familyName: "Third" },
  ],
  year: "2021",
  identifiers: {},
  pdfUrls: [],
};

let currentTab: { id: number; url: string } | undefined;
let currentSiteAccess: SiteAccess = {
  mode: "unavailable",
  directPdf: false,
};
let latestFilename: string | undefined;
let siteRenderVersion = 0;
let currentPreset: Preset = "citation";
let customTemplate: FilenameTemplate = DEFAULT_CUSTOM_TEMPLATE;
let dragFrom: number | undefined;

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

function renderFormatPreview(): void {
  formatPattern.textContent = templatePattern(
    resolveTemplate(currentPreset, customTemplate),
  );
  formatExample.textContent =
    buildFilename({
      metadata: SAMPLE_PAPER,
      preset: currentPreset,
      template: customTemplate,
    }).filename ?? "—";
}

function renderTemplateHint(): void {
  templateHint.hidden =
    currentPreset !== "custom" ||
    !customTemplate.some(
      (token) =>
        token.kind === "text" && UNSAFE_BASENAME_CHARS.test(token.value),
    );
}

function renderToggleState(input: HTMLInputElement, state: HTMLElement): void {
  state.textContent = input.checked ? "On" : "Off";
}

function setSiteButtonBusy(busy: boolean): void {
  scanSite.disabled = busy;
}

function metadataCount(template: FilenameTemplate): number {
  return template.filter((token) => token.kind !== "text").length;
}

function chipLabel(token: TemplateToken): string {
  return token.kind === "text" ? "Text" : TOKEN_LABELS[token.kind];
}

function sizeTextInput(input: HTMLInputElement): void {
  input.style.width = `${Math.max(3, [...input.value].length + 1)}ch`;
}

function clearDropMarkers(): void {
  for (const chip of templateStrip.querySelectorAll(".chip")) {
    chip.classList.remove("is-dragging", "drop-before", "drop-after");
  }
}

async function commitTemplate(
  next: FilenameTemplate,
  options: { rerender: boolean; focusIndex?: number; focusInput?: boolean },
): Promise<void> {
  customTemplate = next;
  if (options.rerender)
    renderTemplateBuilder(options.focusIndex, options.focusInput);
  renderFormatPreview();
  renderTemplateHint();
  await updateSettings({ customTemplate: next });
}

function reorderToken(from: number, to: number): void {
  const next = moveToken(customTemplate, from, to);
  if (next === customTemplate) return;
  const target = Math.max(0, Math.min(customTemplate.length - 1, to));
  void commitTemplate(next, { rerender: true, focusIndex: target });
}

function removeToken(index: number): void {
  const token = customTemplate[index];
  if (!token) return;
  // The format must keep at least one piece of paper metadata.
  if (token.kind !== "text" && metadataCount(customTemplate) <= 1) return;
  const next = customTemplate.filter((_, position) => position !== index);
  void commitTemplate(next, {
    rerender: true,
    focusIndex: Math.min(index, next.length - 1),
  });
}

function onChipKeydown(event: KeyboardEvent, index: number): void {
  // Keys typed inside a text piece or on its remove button are not commands.
  if (event.target !== event.currentTarget) return;
  switch (event.key) {
    case "ArrowLeft":
      reorderToken(index, index - 1);
      break;
    case "ArrowRight":
      reorderToken(index, index + 1);
      break;
    case "Home":
      reorderToken(index, 0);
      break;
    case "End":
      reorderToken(index, customTemplate.length - 1);
      break;
    case "Delete":
    case "Backspace":
      removeToken(index);
      break;
    default:
      return;
  }
  event.preventDefault();
}

function renderTemplateBuilder(focusIndex?: number, focusInput = false): void {
  templateStrip.replaceChildren();
  const total = customTemplate.length;
  const lastMetadataPiece = metadataCount(customTemplate) <= 1;

  customTemplate.forEach((token, index) => {
    const item = document.createElement("li");
    item.className = "chip";
    item.dataset.kind = token.kind;
    item.dataset.index = String(index);
    item.tabIndex = 0;
    item.setAttribute(
      "aria-label",
      `${chipLabel(token)}, piece ${index + 1} of ${total}. Arrow keys move, Delete removes.`,
    );

    const grip = document.createElement("span");
    grip.className = "chip-grip";
    grip.draggable = true;
    grip.setAttribute("aria-hidden", "true");
    grip.textContent = "⋮⋮";
    grip.addEventListener("dragstart", (event) => {
      dragFrom = index;
      event.dataTransfer?.setData("text/plain", String(index));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      item.classList.add("is-dragging");
    });
    grip.addEventListener("dragend", () => {
      dragFrom = undefined;
      clearDropMarkers();
    });
    item.append(grip);

    if (token.kind === "text") {
      const input = document.createElement("input");
      input.className = "chip-input";
      input.type = "text";
      input.maxLength = TEXT_TOKEN_MAX_LENGTH;
      input.placeholder = "text";
      input.setAttribute("aria-label", "Fixed text");
      input.value = token.value;
      sizeTextInput(input);
      input.addEventListener("input", () => {
        sizeTextInput(input);
        // Update in place so the caret survives; indices are unchanged.
        void commitTemplate(
          customTemplate.map((piece, position) =>
            position === index ? { kind: "text", value: input.value } : piece,
          ),
          { rerender: false },
        );
      });
      item.append(input);
    } else {
      const label = document.createElement("span");
      label.className = "chip-label";
      label.textContent = TOKEN_LABELS[token.kind];
      item.append(label);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "chip-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${chipLabel(token)}`);
    if (token.kind !== "text" && lastMetadataPiece) {
      remove.disabled = true;
      remove.title = "Keep at least one of Authors, Year, or Title";
    }
    remove.addEventListener("click", () => removeToken(index));
    item.append(remove);

    item.addEventListener("keydown", (event) => onChipKeydown(event, index));
    templateStrip.append(item);
  });

  const present = new Set(
    customTemplate
      .filter((token) => token.kind !== "text")
      .map((token) => token.kind),
  );
  const full = customTemplate.length >= TEMPLATE_MAX_TOKENS;
  for (const button of chipAddButtons) {
    const kind = button.dataset.add;
    button.disabled =
      full || (kind !== "text" && present.has(kind as MetadataTokenKind));
  }

  if (focusIndex !== undefined) {
    const chip = templateStrip.querySelector<HTMLElement>(
      `.chip[data-index="${focusIndex}"]`,
    );
    (focusInput
      ? (chip?.querySelector<HTMLInputElement>(".chip-input") ?? chip)
      : chip
    )?.focus();
  }
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
  currentPreset = settings.preset;
  customTemplate = settings.customTemplate ?? DEFAULT_CUSTOM_TEMPLATE;
  preset.value = settings.preset;
  templateBuilder.hidden = settings.preset !== "custom";
  renderTemplateBuilder();
  renderFormatPreview();
  renderTemplateHint();

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

preset.addEventListener("change", async () => {
  const nextPreset = preset.value as Preset;
  const settings = await getSettings();
  const patch: Partial<ExtensionSettings> = { preset: nextPreset };
  if (nextPreset === "custom" && !settings.customTemplate)
    patch.customTemplate = DEFAULT_CUSTOM_TEMPLATE;
  await updateSettings(patch);
  await render();
});

for (const button of chipAddButtons) {
  button.addEventListener("click", () => {
    const kind = button.dataset.add as MetadataTokenKind | "text" | undefined;
    if (!kind || customTemplate.length >= TEMPLATE_MAX_TOKENS) return;
    if (kind !== "text" && customTemplate.some((token) => token.kind === kind))
      return;
    const token: TemplateToken =
      kind === "text" ? { kind: "text", value: " - " } : { kind };
    void commitTemplate([...customTemplate, token], {
      rerender: true,
      focusIndex: customTemplate.length,
      focusInput: kind === "text",
    });
  });
}

templateStrip.addEventListener("dragover", (event) => {
  if (dragFrom === undefined) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  const chip = (event.target as Element).closest<HTMLElement>(".chip");
  for (const marked of templateStrip.querySelectorAll(".chip")) {
    marked.classList.remove("drop-before", "drop-after");
  }
  if (!chip || Number(chip.dataset.index) === dragFrom) return;
  const rect = chip.getBoundingClientRect();
  chip.classList.add(
    event.clientX > rect.left + rect.width / 2 ? "drop-after" : "drop-before",
  );
});

templateStrip.addEventListener("drop", (event) => {
  if (dragFrom === undefined) return;
  event.preventDefault();
  const from = dragFrom;
  dragFrom = undefined;
  clearDropMarkers();
  const chip = (event.target as Element).closest<HTMLElement>(".chip");
  let insertAt = customTemplate.length;
  if (chip) {
    const index = Number(chip.dataset.index);
    const rect = chip.getBoundingClientRect();
    insertAt = event.clientX > rect.left + rect.width / 2 ? index + 1 : index;
  }
  // Removing the dragged piece first shifts every later position back by one.
  reorderToken(from, from < insertAt ? insertAt - 1 : insertAt);
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
