import {
  extractPaperMetadata,
  normalizeDoi,
  type PaperMetadata,
} from "@papername/core";

export interface ContextMessage {
  type: "papername:context";
  metadata: NonNullable<ReturnType<typeof extractPaperMetadata>>;
  pageUrl: string;
}

function metadataElements(document: Document): Map<string, string[]> {
  const values = new Map<string, string[]>();
  for (const element of document.querySelectorAll("meta")) {
    const name = (
      element.getAttribute("name") ??
      element.getAttribute("property") ??
      ""
    ).toLocaleLowerCase();
    const content = element.getAttribute("content")?.trim();
    if (!name || !content) continue;
    values.set(name, [...(values.get(name) ?? []), content]);
  }
  return values;
}

function hasScholarlyJsonLd(document: Document): boolean {
  const includesScholarlyArticle = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(includesScholarlyArticle);
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    const types = Array.isArray(record["@type"])
      ? record["@type"]
      : [record["@type"]];
    if (
      types.some(
        (type) =>
          typeof type === "string" &&
          /^(?:Scholarly|Medical)?Article$/i.test(type),
      )
    )
      return true;
    return includesScholarlyArticle(record["@graph"]);
  };

  return [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((script) => {
      try {
        return JSON.parse(script.textContent ?? "") as unknown;
      } catch {
        return undefined;
      }
    })
    .some(includesScholarlyArticle);
}

function hasConfidentGenericPaperMetadata(
  document: Document,
  metadata: PaperMetadata,
): boolean {
  if (metadata.sourceAdapter) return true;
  const meta = metadataElements(document);
  const hasAny = (...names: string[]) => names.some((name) => meta.has(name));
  const highwire =
    meta.has("citation_title") &&
    hasAny(
      "citation_author",
      "citation_date",
      "citation_publication_date",
      "citation_doi",
      "citation_pdf_url",
    );
  const dublinTitle = hasAny("dc.title", "dcterms.title");
  const dublinAuthor = hasAny("dc.creator", "dcterms.creator");
  const dublinType = [...(meta.get("dc.type") ?? [])]
    .concat(meta.get("dcterms.type") ?? [])
    .some((value) =>
      /(?:article|journal|thesis|dissertation|preprint|working paper|report)/i.test(
        value,
      ),
    );
  const dublinDoi = [
    ...(meta.get("dc.identifier") ?? []),
    ...(meta.get("dcterms.identifier") ?? []),
  ].some((value) => Boolean(normalizeDoi(value)));
  const scholarlyFingerprint =
    highwire ||
    hasScholarlyJsonLd(document) ||
    (dublinTitle && dublinAuthor && (dublinType || dublinDoi));
  const bibliographicDetail =
    metadata.authors.length > 0 || Boolean(metadata.year || metadata.abstract);
  const paperSpecificTarget =
    metadata.pdfUrls.length > 0 ||
    Object.values(metadata.identifiers).some(Boolean);
  return scholarlyFingerprint && bibliographicDetail && paperSpecificTarget;
}

export async function publishPageContext(
  document: Document,
  pageUrl: string,
  sendMessage: (message: ContextMessage) => Promise<unknown>,
): Promise<boolean> {
  const metadata = extractPaperMetadata(document, pageUrl);
  if (!metadata || !hasConfidentGenericPaperMetadata(document, metadata))
    return false;
  await sendMessage({
    type: "papername:context",
    metadata,
    pageUrl,
  });
  return true;
}
