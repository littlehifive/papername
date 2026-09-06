import { firstClassSourceForUrl } from "@papername/core";

import { landingPageCandidates } from "./repository-routes";

export type SiteAccess =
  | {
      mode: "automatic" | "remembered" | "available";
      hostname: string;
      originPattern: string;
      directPdf: boolean;
      sourceName?: string;
    }
  | { mode: "unavailable"; directPdf: false }
  | {
      mode: "blocked";
      hostname: string;
      directPdf: boolean;
      reason: "site_terms";
    };

function isResearchGate(hostname: string): boolean {
  return (
    hostname === "researchgate.net" || hostname.endsWith(".researchgate.net")
  );
}

export function siteAccessForUrl(
  pageUrl: string | undefined,
  grantedOrigins: readonly string[],
): SiteAccess {
  if (!pageUrl) return { mode: "unavailable", directPdf: false };
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:")
      return { mode: "unavailable", directPdf: false };
    if (isResearchGate(url.hostname)) {
      return {
        mode: "blocked",
        hostname: url.hostname,
        directPdf:
          /\.pdf(?:$|[?#])/i.test(pageUrl) ||
          landingPageCandidates(pageUrl).length > 0,
        reason: "site_terms",
      };
    }
    const originPattern = `${url.origin}/*`;
    const source = firstClassSourceForUrl(pageUrl);
    return {
      mode: source
        ? "automatic"
        : grantedOrigins.includes(originPattern)
          ? "remembered"
          : "available",
      hostname: url.hostname,
      originPattern,
      directPdf:
        /\.pdf(?:$|[?#])/i.test(pageUrl) ||
        landingPageCandidates(pageUrl).length > 0,
      ...(source ? { sourceName: source.label } : {}),
    };
  } catch {
    return { mode: "unavailable", directPdf: false };
  }
}
