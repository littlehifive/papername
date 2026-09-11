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

function doiFromUrls(urls: string[]): string | undefined {
  for (const value of urls) {
    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      // The undecoded URL may still contain a usable DOI.
    }
    const doi = normalizeDoi(decoded.replace(/\.pdf(?=$|[?#])/i, ""));
    if (doi) return doi;
  }
  return undefined;
}

function scholarCitationDetailContext(
  document: Document,
  pageUrl: string,
  selectedLink?: HTMLAnchorElement,
): ContextMessage | undefined {
  if (!isGoogleScholar(pageUrl)) return undefined;
  const title = cleanMetadataText(
    document.querySelector("#gsc_oci_title")?.textContent,
  );
  const rows = [...document.querySelectorAll("#gsc_oci_table > .gs_scl")];
  const firstValue = cleanMetadataText(
    rows[0]?.querySelector(".gsc_oci_value")?.textContent,
  );
  if (!title || !firstValue) return undefined;

  const authors = firstValue
    .split(/\s*,\s*/)
    .map(authorFromScholarName)
    .filter((author): author is PaperAuthor => Boolean(author));
  const detailValues = rows
    .slice(1)
    .map((row) =>
      cleanMetadataText(row.querySelector(".gsc_oci_value")?.textContent),
    )
    .filter((value): value is string => Boolean(value));
  const year = detailValues
    .map((value) => value.match(/(?:18|19|20|21)\d{2}/)?.[0])
    .find(Boolean);
  const abstract = cleanMetadataText(
    document.querySelector("#gsc_oci_descr")?.textContent,
  );
  const resourceLinks = [
    ...document.querySelectorAll<HTMLAnchorElement>(
      "#gsc_oci_title_gg a[href]",
    ),
  ];
  const detectedPdfUrls = resourceLinks
    .filter(
      (link) =>
        /\[pdf\]/i.test(link.textContent ?? "") ||
        /\/(?:pdf|pdfdirect|epdf)(?:\/|$)/i.test(link.href),
    )
    .map((link) => link.href);
  const selectedUrl = selectedLink?.closest("#gsc_oci_title_gg")
    ? selectedLink.href
    : undefined;
  const pdfUrls = [
    ...new Set([selectedUrl, ...detectedPdfUrls].filter(Boolean)),
  ] as string[];
  const titleUrl = document.querySelector<HTMLAnchorElement>(
    "#gsc_oci_title a[href]",
  )?.href;
  const doi = doiFromUrls([
    ...pdfUrls,
    ...(titleUrl ? [titleUrl] : []),
    ...resourceLinks.map((link) => link.href),
  ]);
  if (authors.length === 0 || (pdfUrls.length === 0 && !doi)) return undefined;

  const metadata: PaperMetadata = {
    title,
    authors,
    ...(year ? { year } : {}),
    ...(abstract ? { abstract } : {}),
    identifiers: doi ? { doi } : {},
    pdfUrls,
    sourceAdapter: "google-scholar",
  };
  return {
    type: "papername:context",
    pageUrl,
    metadata,
  };
}

export function googleScholarContextForPage(
  document: Document,
  pageUrl: string,
): ContextMessage | undefined {
  return scholarCitationDetailContext(document, pageUrl);
}

export function googleScholarContextForLink(
  link: HTMLAnchorElement,
  pageUrl: string,
): ContextMessage | undefined {
  if (!isGoogleScholar(pageUrl)) return undefined;
  if (link.closest("#gsc_oci_title_gg")) {
    const detailContext = scholarCitationDetailContext(
      link.ownerDocument,
      pageUrl,
      link,
    );
    if (detailContext) return detailContext;
  }
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
  const doi = doiFromUrls([link.href]);
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
