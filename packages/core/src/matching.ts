import type { ArticleContext, DownloadCandidate } from "./types";
import {
  elsevierPiiRoute,
  publisherDoiRoute,
  researchSquarePaperRoute,
} from "./publisher-routes";

const CONTEXT_TTL_MS = 30 * 60_000;
const SUPPLEMENT_PATTERN =
  /(?:supp(?:l|lement|lementary)?(?:[-_ ]?(?:file|info(?:rmation)?|material))?|supporting[-_ ]?(?:information|material)|appendix|additional[-_ ]?file|table[-_ ]?s?\d+|fig(?:ure)?[-_ ]?s?\d+|data[-_ ]?s?\d+|mmc\d*|esm)(?:[./?&=_ -]|$)/i;
const EPHEMERAL_QUERY_PARAMETER =
  /^(?:token|signature|expires?|x-amz-.+|response-content-disposition|response-content-type)$/i;

function isEphemeralQueryParameter(key: string, value: string): boolean {
  if (EPHEMERAL_QUERY_PARAMETER.test(key)) return true;
  return (
    key.toLocaleLowerCase() === "download" &&
    ["", "1", "true"].includes(value.toLocaleLowerCase())
  );
}

function canonicalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const values = url.searchParams.getAll(key);
      if (
        values.length > 0 &&
        values.every((item) => isEphemeralQueryParameter(key, item))
      ) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.href.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function osfPrimaryFileId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.hostname !== "osf.io") return undefined;
    return url.pathname.match(/^\/download\/([a-f0-9]{24})\/?$/i)?.[1];
  } catch {
    return undefined;
  }
}

function urlsIdentifySamePdf(left: string, right: string): boolean {
  if (canonicalUrl(left) === canonicalUrl(right)) return true;
  const leftOsfId = osfPrimaryFileId(left);
  return Boolean(leftOsfId && leftOsfId === osfPrimaryFileId(right));
}

function isOsfSignedStorageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.hostname !== "storage.googleapis.com") return false;
    if (!/^\/cos-osf-prod-files-[^/]+\/[a-f0-9]{40,}$/i.test(url.pathname))
      return false;
    const disposition = url.searchParams.get("response-content-disposition");
    const accessId = url.searchParams.get("GoogleAccessId");
    return Boolean(
      disposition &&
      /filename\*?=.*\.pdf(?:["';]|$)/i.test(disposition) &&
      accessId?.endsWith("@cos-osf-prod.iam.gserviceaccount.com"),
    );
  } catch {
    return false;
  }
}

function isFreshContext(context: ArticleContext, now: number): boolean {
  return (
    now - context.capturedAt <= CONTEXT_TTL_MS &&
    context.capturedAt <= now + 60_000
  );
}

export function contextSupportsCurrentPage(
  context: ArticleContext,
  page: { tabId: number; url: string },
  now = Date.now(),
): boolean {
  if (!isFreshContext(context, now)) return false;
  const currentUrl = canonicalUrl(page.url);
  const route = publisherDoiRoute(page.url);
  const articleRoute = publisherDoiRoute(context.pageUrl);
  const elsevierRoute = elsevierPiiRoute(page.url);
  const articleElsevierRoute = elsevierPiiRoute(context.pageUrl);
  const researchSquareRoute = researchSquarePaperRoute(page.url);
  const articleResearchSquareRoute = researchSquarePaperRoute(context.pageUrl);
  const samePublisherReader = Boolean(
    route?.reader &&
    articleRoute?.origin === route.origin &&
    context.metadata.identifiers.doi?.toLowerCase() === route.doi,
  );
  const sameElsevierMainPdf = Boolean(
    elsevierRoute?.reader && articleElsevierRoute?.pii === elsevierRoute.pii,
  );
  const sameResearchSquarePdf = Boolean(
    researchSquareRoute?.reader &&
    articleResearchSquareRoute?.identity === researchSquareRoute.identity,
  );
  return (
    Boolean(currentUrl) &&
    ((context.tabId === page.tabId &&
      canonicalUrl(context.pageUrl) === currentUrl) ||
      samePublisherReader ||
      sameElsevierMainPdf ||
      sameResearchSquarePdf ||
      context.metadata.pdfUrls.some((pdfUrl) =>
        urlsIdentifySamePdf(pdfUrl, page.url),
      ))
  );
}

function contextIdentity(context: ArticleContext): string {
  return (
    context.metadata.identifiers.doi ??
    context.metadata.identifiers.arxivId ??
    context.metadata.identifiers.pmid ??
    context.metadata.title.trim().toLocaleLowerCase()
  );
}

/** Readiness must reject the same ambiguous identities as download naming. */
export function findMatchingPageContext(
  contexts: ArticleContext[],
  page: { tabId: number; url: string },
  now = Date.now(),
): ArticleContext | undefined {
  const matches = contexts.filter((context) =>
    contextSupportsCurrentPage(context, page, now),
  );
  if (new Set(matches.map(contextIdentity)).size !== 1) return undefined;
  return matches.sort((a, b) => b.capturedAt - a.capturedAt)[0];
}

function candidateUrls(download: DownloadCandidate): string[] {
  const direct = [download.url, download.finalUrl, download.viewerUrl].filter(
    (value): value is string => Boolean(value),
  );
  const nested: string[] = [];
  for (const value of direct) {
    try {
      const file = new URL(value).searchParams.get("file");
      if (file) nested.push(file);
    } catch {
      // A malformed candidate cannot contribute a nested viewer URL.
    }
  }
  return [...direct, ...nested];
}

function searchableUrl(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value).toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

export function isLikelyPdfDownload(download: DownloadCandidate): boolean {
  if (download.mime?.toLowerCase() === "application/pdf") return true;
  if (
    [download.filename, ...candidateUrls(download)].some((value) =>
      /\.pdf(?:$|[?#])/i.test(value ?? ""),
    )
  )
    return true;
  try {
    const url = new URL(download.url);
    return url.protocol === "chrome-extension:" && url.searchParams.has("file");
  } catch {
    return false;
  }
}

function exactKnownPdf(
  context: ArticleContext,
  download: DownloadCandidate,
): boolean {
  return context.metadata.pdfUrls.some((known) =>
    candidateUrls(download).some((candidate) =>
      urlsIdentifySamePdf(known, candidate),
    ),
  );
}

function containsIdentifier(
  context: ArticleContext,
  download: DownloadCandidate,
): boolean {
  const haystack = [
    download.url,
    download.finalUrl,
    download.referrer,
    download.viewerUrl,
  ]
    .map(searchableUrl)
    .join(" ");
  const identifiers = [
    context.metadata.identifiers.doi,
    context.metadata.identifiers.arxivId,
    context.metadata.identifiers.pmid,
  ].filter((identifier): identifier is string => Boolean(identifier));
  return identifiers.some((identifier) =>
    haystack.includes(identifier.toLowerCase()),
  );
}

function matchesElsevierMainPdf(
  context: ArticleContext,
  download: DownloadCandidate,
): boolean {
  const articleRoute = elsevierPiiRoute(context.pageUrl);
  if (!articleRoute) return false;
  return candidateUrls(download).some((value) => {
    const route = elsevierPiiRoute(value);
    return route?.reader && route.pii === articleRoute.pii;
  });
}

function matchesResearchSquarePdf(
  context: ArticleContext,
  download: DownloadCandidate,
): boolean {
  const articleRoute = researchSquarePaperRoute(context.pageUrl);
  if (!articleRoute) return false;
  return candidateUrls(download).some((value) => {
    const route = researchSquarePaperRoute(value);
    return route?.reader && route.identity === articleRoute.identity;
  });
}

function matchesOsfSignedPrimary(
  context: ArticleContext,
  download: DownloadCandidate,
): boolean {
  let referrerOrigin: string | undefined;
  try {
    referrerOrigin = download.referrer
      ? new URL(download.referrer).origin
      : undefined;
  } catch {
    return false;
  }
  return Boolean(
    referrerOrigin === "https://osf.io" &&
    context.metadata.sourceAdapter === "osf" &&
    context.metadata.pdfUrls.some((value) => osfPrimaryFileId(value)) &&
    candidateUrls(download).some(isOsfSignedStorageUrl),
  );
}

function scoreContext(
  context: ArticleContext,
  download: DownloadCandidate,
  now: number,
): number {
  if (!isFreshContext(context, now)) return 0;
  if (!isLikelyPdfDownload(download)) return 0;

  const exact = exactKnownPdf(context, download);
  const supplementHaystack = [download.filename, ...candidateUrls(download)]
    .map(searchableUrl)
    .join(" ");
  if (!exact && SUPPLEMENT_PATTERN.test(supplementHaystack)) return 0;
  const sameTab =
    download.tabId !== undefined &&
    download.tabId >= 0 &&
    download.tabId === context.tabId;
  if (exact) return sameTab ? 110 : 100;
  if (matchesElsevierMainPdf(context, download)) return 95;
  if (matchesResearchSquarePdf(context, download)) return 95;
  if (matchesOsfSignedPrimary(context, download)) return 95;
  if (containsIdentifier(context, download)) return 90;

  const sameReferrer =
    canonicalUrl(download.referrer) === canonicalUrl(context.pageUrl);
  if (sameReferrer) return 80;
  return 0;
}

export function findMatchingContext(
  contexts: ArticleContext[],
  download: DownloadCandidate,
  now = Date.now(),
): ArticleContext | undefined {
  const ranked = contexts
    .map((context) => ({
      context,
      score: scoreContext(context, download, now),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.context.capturedAt - left.context.capturedAt,
    );
  const [first] = ranked;
  if (!first) return undefined;
  const topIdentities = new Set(
    ranked
      .filter(({ score }) => score === first.score)
      .map(({ context: candidate }) => contextIdentity(candidate)),
  );
  if (topIdentities.size > 1) {
    return undefined;
  }
  return first.context;
}
