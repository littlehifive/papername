import { extractPaperMetadata } from "@papername/core";

import { landingPageCandidates } from "./repository-routes";
import { saveContext } from "./storage";

export { landingPageCandidates } from "./repository-routes";

export async function recoverDirectPdfContext(
  tabId: number,
  pdfUrl: string,
): Promise<boolean> {
  for (const landingUrl of landingPageCandidates(pdfUrl)) {
    try {
      const response = await fetch(landingUrl, {
        credentials: "include",
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) continue;
      const document = new DOMParser().parseFromString(
        await response.text(),
        "text/html",
      );
      const metadata = extractPaperMetadata(document, landingUrl);
      if (!metadata) continue;
      await saveContext({
        tabId,
        pageUrl: landingUrl,
        capturedAt: Date.now(),
        metadata: {
          ...metadata,
          pdfUrls: [...new Set([...metadata.pdfUrls, pdfUrl])],
        },
      });
      return true;
    } catch {
      // Try the next narrowly derived candidate, if one exists.
    }
  }
  return false;
}
