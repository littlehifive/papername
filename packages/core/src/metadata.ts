import type { PaperAuthor, PaperMetadata } from "./types";
import { firstClassSourceForUrl } from "./sources";
import { publisherDoiRoute } from "./publisher-routes";

const CORPORATE_AUTHOR =
  /(consortium|collaboration|group|team|committee|university|institute|association|society)$/i;
const SUPPLEMENT_PATTERN =
  /(?:supp(?:l|lement|lementary)?(?:[-_ ]?(?:file|info(?:rmation)?|material))?|supporting[-_ ]?(?:information|material)|appendix|additional[-_ ]?file|table[-_ ]?s?\d+|fig(?:ure)?[-_ ]?s?\d+|data[-_ ]?s?\d+|mmc\d*|esm)(?:[./?&=_ -]|$)/i;

export function cleanMetadataText(
  value: string | null | undefined,
): string | undefined {
  const result = value?.replace(/\s+/g, " ").trim();
  return result || undefined;
}

const clean = cleanMetadataText;

function stripLabel(
  value: string | undefined,
  label: string,
): string | undefined {
  return clean(value?.replace(new RegExp(`^${label}\\s*:?\\s*`, "i"), ""));
}

function metaValues(document: Document, keys: string[]): string[] {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  return [...document.querySelectorAll("meta")]
    .filter((element) => {
      const key =
        element.getAttribute("name") ?? element.getAttribute("property") ?? "";
      return wanted.has(key.toLowerCase());
    })
    .map((element) => clean(element.getAttribute("content")))
    .filter((value): value is string => Boolean(value));
}

function firstMeta(document: Document, keys: string[]): string | undefined {
  return metaValues(document, keys)[0];
}

function yearFrom(value: string | undefined): string | undefined {
  return value?.match(/(?:18|19|20|21)\d{2}/)?.[0];
}

export function normalizeDoi(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return match?.[0]?.replace(/[.,;)]+$/g, "").toLowerCase();
}

function absoluteUrl(
  value: string | undefined,
  pageUrl: string,
): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, pageUrl).href;
  } catch {
    return undefined;
  }
}

function authorFromName(nameValue: string): PaperAuthor {
  const name = clean(nameValue) ?? "";
  if (CORPORATE_AUTHOR.test(name)) return { name, corporate: true };
  if (name.includes(","))
    return { name, familyName: clean(name.split(",")[0]) };
  return { name, familyName: name.split(/\s+/).at(-1) };
}

function jsonLdNodes(document: Document): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  for (const script of document.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      const parsed: unknown = JSON.parse(script.textContent ?? "");
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== "object") continue;
        const record = candidate as Record<string, unknown>;
        const graph = Array.isArray(record["@graph"])
          ? record["@graph"]
          : [record];
        for (const item of graph) {
          if (item && typeof item === "object")
            nodes.push(item as Record<string, unknown>);
        }
      }
    } catch {
      // Invalid JSON-LD is common and must not prevent other metadata strategies.
    }
  }
  return nodes;
}

function isScholarlyArticle(node: Record<string, unknown>): boolean {
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some(
    (value) =>
      typeof value === "string" &&
      /(?:Scholarly|Medical)?Article$/i.test(value),
  );
}

function authorsFromJson(value: unknown): PaperAuthor[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.flatMap((item): PaperAuthor[] => {
    if (typeof item === "string") return [authorFromName(item)];
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = clean(
      typeof record.name === "string" ? record.name : undefined,
    );
    if (!name) return [];
    const type = record["@type"];
    if (type === "Organization") return [{ name, corporate: true }];
    const familyName = clean(
      typeof record.familyName === "string" ? record.familyName : undefined,
    );
    return [
      { name, familyName: familyName ?? authorFromName(name).familyName },
    ];
  });
}

function pdfUrlsFromJson(value: unknown, pageUrl: string): string[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.flatMap((item): string[] => {
    if (typeof item === "string") {
      const url = absoluteUrl(item, pageUrl);
      return url ? [url] : [];
    }
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const format =
      typeof record.encodingFormat === "string" ? record.encodingFormat : "";
    const contentUrl =
      typeof record.contentUrl === "string" ? record.contentUrl : undefined;
    const url = absoluteUrl(contentUrl, pageUrl);
    return url && (/pdf/i.test(format) || /\.pdf(?:$|[?#])/i.test(url))
      ? [url]
      : [];
  });
}

function osfViewerPdfUrls(document: Document, pageUrl: string): string[] {
  if (sourceAdapterForUrl(pageUrl) !== "osf") return [];
  const candidates = [
    ...document.querySelectorAll('iframe[src*="mfr.osf.io/render"]'),
  ].flatMap((node): string[] => {
    try {
      const viewer = new URL(node.getAttribute("src") ?? "", pageUrl);
      if (viewer.hostname !== "mfr.osf.io" || viewer.pathname !== "/render")
        return [];
      const nestedValue = viewer.searchParams.get("url");
      if (!nestedValue) return [];
      const nested = new URL(nestedValue, pageUrl);
      if (
        nested.hostname !== "osf.io" ||
        !/^\/download\/[a-f0-9]{24}\/?$/i.test(nested.pathname)
      )
        return [];
      nested.search = "";
      nested.hash = "";
      return [nested.href];
    } catch {
      return [];
    }
  });
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique : [];
}

export function sourceAdapterForUrl(pageUrl: string): string | undefined {
  return firstClassSourceForUrl(pageUrl)?.id;
}

function platformAdapterForDocument(document: Document): string | undefined {
  const names = [...document.querySelectorAll("meta")].map((element) =>
    (element.getAttribute("name") ?? "").toLocaleLowerCase(),
  );
  if (names.some((name) => name.startsWith("eprints."))) return "eprints";
  if (names.some((name) => name.startsWith("bepress_citation_")))
    return "digital-commons";
  const generator = firstMeta(document, ["generator"]);
  if (/dspace/i.test(generator ?? "") || names.includes("dspace.entity.type"))
    return "dspace";
  return undefined;
}

function arxivFallback(
  document: Document,
  pageUrl: string,
): Partial<PaperMetadata> {
  if (sourceAdapterForUrl(pageUrl) !== "arxiv") return {};
  const title = stripLabel(
    document.querySelector("h1.title")?.textContent ?? undefined,
    "Title",
  );
  const abstract = stripLabel(
    document.querySelector("blockquote.abstract")?.textContent ?? undefined,
    "Abstract",
  );
  const authors = [...document.querySelectorAll(".authors a")]
    .map((node) => clean(node.textContent))
    .filter((name): name is string => Boolean(name))
    .map(authorFromName);
  const arxivId = pageUrl.match(
    /\/(?:abs|pdf)\/([^/?#]+?)(?:\.pdf)?(?:$|[?#])/i,
  )?.[1];
  const pdfUrl = arxivId ? absoluteUrl(`/pdf/${arxivId}`, pageUrl) : undefined;
  return {
    ...(title ? { title } : {}),
    ...(abstract ? { abstract } : {}),
    ...(authors.length ? { authors } : {}),
    year: yearFrom(
      document.querySelector(".dateline")?.textContent ?? undefined,
    ),
    identifiers: arxivId ? { arxivId } : {},
    pdfUrls: pdfUrl ? [pdfUrl] : [],
  };
}

function scienceDirectAuthors(
  document: Document,
  pageUrl: string,
): PaperAuthor[] {
  if (sourceAdapterForUrl(pageUrl) !== "elsevier") return [];
  return [
    ...document.querySelectorAll(".author-group .react-xocs-alternative-link"),
  ].flatMap((node): PaperAuthor[] => {
    const givenName = clean(node.querySelector(".given-name")?.textContent);
    const familyName = clean(node.querySelector(".surname")?.textContent);
    if (!familyName) return [];
    const name = clean([givenName, familyName].filter(Boolean).join(" "));
    return name ? [{ name, familyName }] : [];
  });
}

function acmAuthors(document: Document, pageUrl: string): PaperAuthor[] {
  if (sourceAdapterForUrl(pageUrl) !== "acm") return [];
  return [
    ...document.querySelectorAll('[data-db-target-for^="axel_author_"]'),
  ].flatMap((node): PaperAuthor[] => {
    const givenName = clean(
      node.querySelector('[property="givenName"]')?.textContent,
    );
    const familyName = clean(
      node.querySelector('[property="familyName"]')?.textContent,
    );
    if (!familyName) return [];
    const name = clean([givenName, familyName].filter(Boolean).join(" "));
    return name ? [{ name, familyName }] : [];
  });
}

function researchSquareAuthors(
  document: Document,
  pageUrl: string,
): PaperAuthor[] {
  if (sourceAdapterForUrl(pageUrl) !== "research-square") return [];
  try {
    const parsed: unknown = JSON.parse(
      document.querySelector("script#__NEXT_DATA__")?.textContent ?? "",
    );
    if (!parsed || typeof parsed !== "object") return [];
    const props = (parsed as Record<string, unknown>).props;
    if (!props || typeof props !== "object") return [];
    const pageProps = (props as Record<string, unknown>).pageProps;
    if (!pageProps || typeof pageProps !== "object") return [];
    const initialData = (pageProps as Record<string, unknown>).initialData;
    if (!initialData || typeof initialData !== "object") return [];
    const value = (initialData as Record<string, unknown>).authors;
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): PaperAuthor[] => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const name = clean(typeof record.name === "string" ? record.name : "");
      if (!name) return [];
      const familyName = clean(
        typeof record.lastName === "string" ? record.lastName : "",
      );
      return [
        { name, familyName: familyName ?? authorFromName(name).familyName },
      ];
    });
  } catch {
    return [];
  }
}

function pubMedAuthors(document: Document, pageUrl: string): PaperAuthor[] {
  try {
    if (new URL(pageUrl).hostname !== "pubmed.ncbi.nlm.nih.gov") return [];
  } catch {
    return [];
  }
  const seen = new Set<string>();
  return [
    ...document.querySelectorAll('a.full-name[href*="cauthor_id="]'),
  ].flatMap((node): PaperAuthor[] => {
    const name = clean(node.textContent);
    if (!name || seen.has(name)) return [];
    seen.add(name);
    return [authorFromName(name)];
  });
}

function jsonObjectAfterMarker(
  text: string,
  marker: string,
): Record<string, unknown> | undefined {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const start = text.indexOf("{", markerIndex + marker.length);
  if (start < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth !== 0) continue;
      try {
        const parsed: unknown = JSON.parse(text.slice(start, index + 1));
        return parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : undefined;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function ieeeDocumentMetadata(
  document: Document,
  pageUrl: string,
): Partial<PaperMetadata> {
  if (sourceAdapterForUrl(pageUrl) !== "ieee") return {};
  const payload = [...document.scripts]
    .map((script) =>
      jsonObjectAfterMarker(
        script.textContent ?? "",
        "xplGlobal.document.metadata=",
      ),
    )
    .find(Boolean);
  if (!payload) return {};

  const title = clean(
    typeof payload.formulaStrippedArticleTitle === "string"
      ? payload.formulaStrippedArticleTitle
      : typeof payload.displayDocTitle === "string"
        ? payload.displayDocTitle
        : typeof payload.title === "string"
          ? payload.title
          : undefined,
  );
  const authors = Array.isArray(payload.authors)
    ? payload.authors.flatMap((item): PaperAuthor[] => {
        if (!item || typeof item !== "object") return [];
        const record = item as Record<string, unknown>;
        const name = clean(
          typeof record.name === "string" ? record.name : undefined,
        );
        if (!name) return [];
        const familyName = clean(
          typeof record.lastName === "string" ? record.lastName : undefined,
        );
        return [
          { name, familyName: familyName ?? authorFromName(name).familyName },
        ];
      })
    : [];
  const year = yearFrom(
    clean(
      typeof payload.publicationYear === "string"
        ? payload.publicationYear
        : typeof payload.displayPublicationDate === "string"
          ? payload.displayPublicationDate
          : undefined,
    ),
  );
  const doi = normalizeDoi(payload.doi);
  const pdfPath =
    typeof payload.pdfPath === "string" &&
    /\.pdf(?:$|[?#])/i.test(payload.pdfPath)
      ? absoluteUrl(payload.pdfPath, pageUrl)
      : undefined;

  return {
    ...(title ? { title } : {}),
    ...(authors.length ? { authors } : {}),
    ...(year ? { year } : {}),
    identifiers: doi ? { doi } : {},
    pdfUrls: pdfPath ? [pdfPath] : [],
  };
}

export function extractPaperMetadata(
  document: Document,
  pageUrl: string,
): PaperMetadata | undefined {
  const article = jsonLdNodes(document).find(isScholarlyArticle);
  const sourceAdapter =
    sourceAdapterForUrl(pageUrl) ?? platformAdapterForDocument(document);
  const arxiv = arxivFallback(document, pageUrl);
  const ieee = ieeeDocumentMetadata(document, pageUrl);

  const title =
    firstMeta(document, [
      "citation_title",
      "dc.title",
      "dcterms.title",
      "eprints.title",
      "bepress_citation_title",
    ]) ??
    clean(
      typeof article?.headline === "string"
        ? article.headline
        : typeof article?.name === "string"
          ? article.name
          : undefined,
    ) ??
    arxiv.title ??
    ieee.title;
  if (!title) return undefined;

  const metaAuthors = metaValues(document, [
    "citation_author",
    "dc.creator",
    "dcterms.creator",
    "eprints.creators_name",
    "bepress_citation_author",
  ]).map(authorFromName);
  const renderedScienceDirectAuthors = scienceDirectAuthors(document, pageUrl);
  const renderedAcmAuthors = acmAuthors(document, pageUrl);
  const renderedResearchSquareAuthors = researchSquareAuthors(
    document,
    pageUrl,
  );
  const renderedPubMedAuthors = pubMedAuthors(document, pageUrl);
  const authors = renderedAcmAuthors.length
    ? renderedAcmAuthors
    : metaAuthors.length
      ? metaAuthors
      : authorsFromJson(article?.author).length
        ? authorsFromJson(article?.author)
        : renderedScienceDirectAuthors.length
          ? renderedScienceDirectAuthors
          : renderedResearchSquareAuthors.length
            ? renderedResearchSquareAuthors
            : renderedPubMedAuthors.length
              ? renderedPubMedAuthors
              : (arxiv.authors ?? ieee.authors ?? []);
  const abstract =
    firstMeta(document, [
      "citation_abstract",
      "dc.description",
      "dcterms.abstract",
      "eprints.abstract",
      "bepress_citation_abstract",
    ]) ??
    clean(
      typeof article?.abstract === "string"
        ? article.abstract
        : typeof article?.description === "string"
          ? article.description
          : undefined,
    ) ??
    arxiv.abstract;
  const date =
    firstMeta(document, [
      "citation_publication_date",
      "citation_date",
      "dc.date",
      "dcterms.issued",
      "article:published_time",
      "article:published_time - datetime",
      "eprints.date",
      "bepress_citation_date",
    ]) ??
    clean(
      typeof article?.datePublished === "string"
        ? article.datePublished
        : undefined,
    ) ??
    ieee.year;
  const rawIdentifiers: unknown[] = [
    ...metaValues(document, [
      "citation_doi",
      "dc.identifier",
      "dcterms.identifier",
    ]),
    ...(Array.isArray(article?.identifier)
      ? article.identifier
      : [article?.identifier]),
    ieee.identifiers?.doi,
  ];
  const doi =
    rawIdentifiers
      .map((identifier) => normalizeDoi(identifier))
      .find(Boolean) ?? publisherDoiRoute(pageUrl)?.doi;
  const citationPdf = absoluteUrl(
    firstMeta(document, ["citation_pdf_url", "bepress_citation_pdf_url"]),
    pageUrl,
  );
  const repositoryFileIdentifiers = metaValues(document, [
    "eprints.document_url",
  ]);
  const identifierPdfCandidates = [
    ...new Set(
      [...rawIdentifiers, ...repositoryFileIdentifiers].flatMap(
        (identifier): string[] => {
          if (typeof identifier !== "string") return [];
          const url = absoluteUrl(identifier, pageUrl);
          return url &&
            /\.pdf(?:$|[?#])/i.test(url) &&
            !SUPPLEMENT_PATTERN.test(url)
            ? [url]
            : [];
        },
      ),
    ),
  ];
  const identifierPdfUrls =
    identifierPdfCandidates.length === 1 ? identifierPdfCandidates : [];
  const jsonPdfUrls = pdfUrlsFromJson(article?.encoding, pageUrl);
  const osfPdfUrls = osfViewerPdfUrls(document, pageUrl);
  const linkedPdfUrls = [
    ...document.querySelectorAll('link[type="application/pdf"], a[href]'),
  ].flatMap((node): string[] => {
    // References are PDFs of other papers, not alternate files for this one.
    if (
      node.closest(
        '[role="doc-bibliography"], [role="doc-biblioentry"], [id^="bibr"], #references, .references, .ref-list, .bibliography',
      )
    )
      return [];
    const href = node.getAttribute("href");
    const label = clean(node.textContent) ?? "";
    if (
      !href ||
      (!/pdf/i.test(label) &&
        !/\/pdf(?:\/|$)/i.test(href) &&
        !/\.pdf(?:$|[?#])/i.test(href))
    )
      return [];
    if (SUPPLEMENT_PATTERN.test(`${label} ${href}`)) return [];
    const url = absoluteUrl(href, pageUrl);
    return url ? [url] : [];
  });
  const pdfUrls = [
    ...new Set(
      [
        citationPdf,
        ...identifierPdfUrls,
        ...jsonPdfUrls,
        ...osfPdfUrls,
        ...(ieee.pdfUrls ?? []),
        ...(arxiv.pdfUrls ?? []),
        ...linkedPdfUrls,
      ].filter((url): url is string => Boolean(url)),
    ),
  ];

  const arxivId =
    firstMeta(document, ["citation_arxiv_id"]) ??
    (sourceAdapterForUrl(pageUrl) === "arxiv"
      ? pageUrl.match(/\/(?:abs|pdf)\/([^/?#]+?)(?:\.pdf)?(?:$|[?#])/i)?.[1]
      : undefined);
  const pmid = firstMeta(document, ["citation_pmid"]);

  return {
    title,
    authors,
    year: yearFrom(date) ?? arxiv.year,
    ...(abstract ? { abstract } : {}),
    identifiers: {
      ...(doi ? { doi } : {}),
      ...(arxivId ? { arxivId } : {}),
      ...(pmid ? { pmid } : {}),
    },
    pdfUrls,
    ...(sourceAdapter ? { sourceAdapter } : {}),
  };
}
