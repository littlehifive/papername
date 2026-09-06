import {
  cleanMetadataText,
  normalizeDoi,
  type PaperAuthor,
  type PaperMetadata,
} from "@papername/core";

import type { ContextMessage } from "./page-capture";

const GOOGLE_SCHOLAR_HOSTS = new Set([
  "scholar.google.com",
  "scholar.google.ca",
  "scholar.google.co.uk",
  "scholar.google.com.au",
  "scholar.google.co.in",
  "scholar.google.co.jp",
  "scholar.google.co.kr",
  "scholar.google.co.nz",
  "scholar.google.co.za",
  "scholar.google.de",
  "scholar.google.es",
  "scholar.google.fr",
  "scholar.google.it",
  "scholar.google.nl",
]);

function authorFromScholarName(name: string): PaperAuthor | undefined {
  const cleaned = cleanMetadataText(name.replace(/…/g, ""));
  if (!cleaned) return undefined;
  return {
    name: cleaned,
    familyName: cleaned.split(/\s+/).at(-1),
  };
}

function isGoogleScholar(pageUrl: string): boolean {
  try {
    const url = new URL(pageUrl);
    return (
      url.protocol === "https:" &&
      GOOGLE_SCHOLAR_HOSTS.has(url.hostname.toLocaleLowerCase())
    );
  } catch {
    return false;
  }
}

export function googleScholarContextForLink(
  link: HTMLAnchorElement,
  pageUrl: string,
): ContextMessage | undefined {
  if (!isGoogleScholar(pageUrl)) return undefined;
  if (!link.closest(".gs_or_ggsm") || !/\[pdf\]/i.test(link.textContent ?? ""))
    return undefined;
  const result = link.closest(".gs_r");
  if (!result) return undefined;
  const title = cleanMetadataText(
    result
      .querySelector(".gs_rt a, .gs_rt")
      ?.textContent?.replace(/^\s*\[(?:PDF|HTML|BOOK|CITATION)\]\s*/i, ""),
  );
  if (!title) return undefined;
  const byline = cleanMetadataText(result.querySelector(".gs_a")?.textContent);
  const authors = (byline?.split(/\s+-\s+/)[0] ?? "")
    .split(/\s*,\s*/)
    .map(authorFromScholarName)
    .filter((author): author is PaperAuthor => Boolean(author));
  const year = byline?.match(/(?:18|19|20|21)\d{2}/)?.[0];
  let decodedPdfUrl = link.href;
  try {
    decodedPdfUrl = decodeURIComponent(decodedPdfUrl);
  } catch {
    // The exact target is still useful even when a URL has malformed escapes.
  }
  const doi = normalizeDoi(decodedPdfUrl.replace(/\.pdf(?=$|[?#])/i, ""));
  const metadata: PaperMetadata = {
    title,
    authors,
    ...(year ? { year } : {}),
    identifiers: doi ? { doi } : {},
    pdfUrls: [link.href],
    sourceAdapter: "google-scholar",
  };
  return {
    type: "papername:context",
    pageUrl,
    metadata,
  };
}
