export function landingPageCandidates(pdfUrl: string): string[] {
  let url: URL;
  try {
    url = new URL(pdfUrl);
  } catch {
    return [];
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return [];

  const parts = url.pathname.split("/").filter(Boolean);
  const host = url.hostname.toLocaleLowerCase();
  const safePathSegment = (value: string | undefined): value is string =>
    Boolean(
      value &&
      value !== "." &&
      value !== ".." &&
      /^[A-Za-z0-9._~-]+$/.test(value),
    );

  if (
    (host === "arxiv.org" || host.endsWith(".arxiv.org")) &&
    parts[0] === "pdf"
  ) {
    const arxivId = parts
      .slice(1)
      .join("/")
      .replace(/\.pdf$/i, "");
    if (
      /^(?:[a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?$/i.test(
        arxivId,
      )
    ) {
      return [new URL(`/abs/${arxivId}`, url.origin).href];
    }
  }

  if (
    (host.startsWith("eprints.") || host.includes(".eprints.")) &&
    /^\d+$/.test(parts[0] ?? "") &&
    parts.length >= 3
  ) {
    return [new URL(`/${parts[0]}/`, url.origin).href];
  }

  const handleIndex = parts.findIndex(
    (part, index) =>
      part.toLocaleLowerCase() === "handle" &&
      parts[index - 1]?.toLocaleLowerCase() === "bitstream",
  );
  const handlePrefix = parts[handleIndex + 1];
  const handleSuffix = parts[handleIndex + 2];
  if (
    handleIndex >= 0 &&
    safePathSegment(handlePrefix) &&
    safePathSegment(handleSuffix)
  ) {
    return [
      new URL(
        `/handle/${encodeURIComponent(handlePrefix)}/${encodeURIComponent(handleSuffix)}`,
        url.origin,
      ).href,
    ];
  }

  return [];
}
