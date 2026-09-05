import type { DownloadCandidate } from "@papername/core";

const ADOBE_ACROBAT_EXTENSION_ID = "efaidnbmnnnibpcajpcglclefindmkaj";
const ADOBE_DOWNLOAD_URL = new RegExp(
  `^(?:(?:blob|filesystem):)?chrome-extension://${ADOBE_ACROBAT_EXTENSION_ID}(?:/|$)`,
  "i",
);

export function isAdobeAcrobatDownload(download: DownloadCandidate): boolean {
  return [download.url, download.finalUrl, download.referrer].some((value) =>
    ADOBE_DOWNLOAD_URL.test(value ?? ""),
  );
}

export function attachTrustedViewerUrl(
  download: DownloadCandidate,
  activeTabUrl: string | undefined,
): DownloadCandidate {
  if (!isAdobeAcrobatDownload(download) || !activeTabUrl) return download;
  try {
    const active = new URL(activeTabUrl);
    if (active.protocol !== "https:" && active.protocol !== "http:")
      return download;
  } catch {
    return download;
  }
  return { ...download, viewerUrl: activeTabUrl };
}
