import {
  elsevierPiiRoute,
  firstClassSourceForUrl,
  publisherDoiRoute,
} from "@papername/core";

import { isExcludedArticleHostname } from "./hosts";
import { landingPageCandidates } from "./repository-routes";

export type SiteAccess =
  | {
      mode: "automatic";
      hostname: string;
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

export function siteAccessForUrl(pageUrl: string | undefined): SiteAccess {
  if (!pageUrl) return { mode: "unavailable", directPdf: false };
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:")
      return { mode: "unavailable", directPdf: false };
    if (isExcludedArticleHostname(url.hostname)) {
      return {
        mode: "blocked",
        hostname: url.hostname,
        directPdf:
          /\.pdf(?:$|[?#])/i.test(pageUrl) ||
          landingPageCandidates(pageUrl).length > 0,
        reason: "site_terms",
      };
    }
    const source = firstClassSourceForUrl(pageUrl);
    return {
      mode: "automatic",
      hostname: url.hostname,
      directPdf:
        /\.pdf(?:$|[?#])/i.test(pageUrl) ||
        Boolean(publisherDoiRoute(pageUrl)?.reader) ||
        Boolean(elsevierPiiRoute(pageUrl)?.reader) ||
        landingPageCandidates(pageUrl).length > 0,
      ...(source ? { sourceName: source.label } : {}),
    };
  } catch {
    return { mode: "unavailable", directPdf: false };
  }
}
