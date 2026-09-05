import type { ArticleContext, DownloadCandidate } from "./types";

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
  const candidates = candidateUrls(download).map(canonicalUrl).filter(Boolean);
  return context.metadata.pdfUrls.some((known) =>
    candidates.includes(canonicalUrl(known)),
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

function scoreContext(
  context: ArticleContext,
  download: DownloadCandidate,
  now: number,
): number {
  if (
    now - context.capturedAt > CONTEXT_TTL_MS ||
    context.capturedAt > now + 60_000
  )
    return 0;
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
  const identity = (candidate: ArticleContext) =>
    candidate.metadata.identifiers.doi ??
    candidate.metadata.identifiers.arxivId ??
    candidate.metadata.identifiers.pmid ??
    candidate.metadata.title.trim().toLocaleLowerCase();
  const topIdentities = new Set(
    ranked
      .filter(({ score }) => score === first.score)
      .map(({ context: candidate }) => identity(candidate)),
  );
  if (topIdentities.size > 1) {
    return undefined;
  }
  return first.context;
}
