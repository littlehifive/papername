import { browser } from "wxt/browser";

import { getContexts, removeContextsForOrigin } from "./storage";

const PROBE_FILE = "/probe.js";
const REGISTRATION_PREFIX = "papername-origin-";

function registrationId(originPattern: string): string {
  let hash = 2_166_136_261;
  for (const character of originPattern) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${REGISTRATION_PREFIX}${(hash >>> 0).toString(36)}`;
}

export async function getRememberedOrigins(): Promise<string[]> {
  const [registrations, permissions] = await Promise.all([
    browser.scripting.getRegisteredContentScripts(),
    browser.permissions.getAll(),
  ]);
  const granted = new Set(permissions.origins ?? []);
  return [
    ...new Set(
      registrations
        .filter(({ id }) => id.startsWith(REGISTRATION_PREFIX))
        .flatMap(({ matches }) => matches ?? [])
        .filter((match) => granted.has(match)),
    ),
  ];
}

async function waitForContext(
  tabId: number,
  pageUrl: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (
      (await getContexts()).some(
        (context) => context.tabId === tabId && context.pageUrl === pageUrl,
      )
    ) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

export async function scanSiteOnce(
  tabId: number,
  pageUrl: string,
): Promise<boolean> {
  await browser.scripting.executeScript({
    target: { tabId },
    files: [PROBE_FILE],
  });
  return waitForContext(tabId, pageUrl);
}

async function ensureRegistered(originPattern: string): Promise<void> {
  const id = registrationId(originPattern);
  const existing = await browser.scripting.getRegisteredContentScripts({
    ids: [id],
  });
  if (existing.length) return;
  await browser.scripting.registerContentScripts([
    {
      id,
      matches: [originPattern],
      js: [PROBE_FILE],
      runAt: "document_idle",
      persistAcrossSessions: true,
    },
  ]);
}

export async function rememberSite(
  tabId: number,
  pageUrl: string,
  originPattern: string,
): Promise<"denied" | "captured" | "missing_metadata"> {
  const granted = await browser.permissions.request({
    origins: [originPattern],
  });
  if (!granted) return "denied";
  await ensureRegistered(originPattern);
  return (await scanSiteOnce(tabId, pageUrl)) ? "captured" : "missing_metadata";
}

export async function forgetSite(originPattern: string): Promise<void> {
  const tabs = await browser.tabs.query({ url: originPattern });
  await Promise.all(
    tabs.map((tab) =>
      tab.id === undefined
        ? Promise.resolve()
        : browser.tabs
            .sendMessage(tab.id, { type: "papername:stop-probe" })
            .catch(() => undefined),
    ),
  );
  const id = registrationId(originPattern);
  await browser.scripting
    .unregisterContentScripts({ ids: [id] })
    .catch(() => undefined);
  await browser.permissions.remove({ origins: [originPattern] });
  await removeContextsForOrigin(originPattern);
}
