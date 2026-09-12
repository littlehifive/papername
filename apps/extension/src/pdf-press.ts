export interface PdfPressMessage {
  type: "papername:pdf-press";
  pageUrl: string;
  url: string;
}

const PDF_PATH_PATTERNS = [
  /\.pdf(?:$|[?#])/i,
  /\/(?:pdf|epdf|pdfdirect|pdfft|fulltext)(?:\/|$|\?)/i,
  /\/download(?:\/|$|\?)/i,
];

function stripHash(value: string): string {
  return value.replace(/#.*$/, "").replace(/\/+$/, "");
}

/**
 * Decides whether a pressed link is a deliberate step toward the paper's PDF.
 * Link text alone never qualifies; that would spend credits on "PDF help"
 * pages and viewer chrome.
 */
export function isLikelyPdfLink(href: string, knownPdfUrls: string[]): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const target = stripHash(url.href);
  if (knownPdfUrls.some((known) => stripHash(known) === target)) return true;
  const pathAndQuery = `${url.pathname}${url.search}`;
  return PDF_PATH_PATTERNS.some((pattern) => pattern.test(pathAndQuery));
}

export function isPdfPressMessage(value: unknown): value is PdfPressMessage {
  return Boolean(
    value &&
    typeof value === "object" &&
    "type" in value &&
    value.type === "papername:pdf-press" &&
    "pageUrl" in value &&
    typeof value.pageUrl === "string" &&
    "url" in value &&
    typeof value.url === "string",
  );
}
