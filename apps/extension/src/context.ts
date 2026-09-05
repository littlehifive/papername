import type { PaperMetadata } from "@papername/core";

export function mergePaperMetadata(
  page: PaperMetadata,
  prior: PaperMetadata | undefined,
): PaperMetadata {
  if (!prior) return page;
  return {
    ...page,
    authors: page.authors.length ? page.authors : prior.authors,
    ...(page.year ? {} : prior.year ? { year: prior.year } : {}),
    ...(page.abstract
      ? {}
      : prior.abstract
        ? { abstract: prior.abstract }
        : {}),
    identifiers: { ...prior.identifiers, ...page.identifiers },
    pdfUrls: [...new Set([...page.pdfUrls, ...prior.pdfUrls])],
    sourceAdapter: page.sourceAdapter ?? prior.sourceAdapter,
  };
}
