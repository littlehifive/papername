import type { ArticleContext } from "@papername/core";
import { browser } from "wxt/browser";

import type { DownloadDecision } from "./decision";
import { normalizeSettings, type ExtensionSettings } from "./settings";

const SETTINGS_KEY = "settings";
const CONTEXT_KEY_PREFIX = "articleContext:";
const LAST_OUTCOME_KEY = "lastOutcome";

export interface LastOutcome extends DownloadDecision {
  at: string;
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

export async function updateSettings(
  patch: Partial<ExtensionSettings>,
): Promise<void> {
  const current = await getSettings();
  await browser.storage.local.set({ [SETTINGS_KEY]: { ...current, ...patch } });
}

export async function getContexts(): Promise<ArticleContext[]> {
  const stored = await browser.storage.session.get(null);
  return Object.entries(stored)
    .filter(([key]) => key.startsWith(CONTEXT_KEY_PREFIX))
    .map(([, value]) => value as ArticleContext);
}

export async function saveContext(context: ArticleContext): Promise<void> {
  await browser.storage.session.set({
    [`${CONTEXT_KEY_PREFIX}${context.tabId}`]: context,
  });
}

export async function removeContext(tabId: number): Promise<void> {
  await browser.storage.session.remove(`${CONTEXT_KEY_PREFIX}${tabId}`);
}

export async function saveLastOutcome(outcome: LastOutcome): Promise<void> {
  await browser.storage.local.set({ [LAST_OUTCOME_KEY]: outcome });
}

export async function getLastOutcome(): Promise<LastOutcome | undefined> {
  const stored = await browser.storage.local.get(LAST_OUTCOME_KEY);
  return stored[LAST_OUTCOME_KEY] as LastOutcome | undefined;
}
