import type { PaperAuthor, PaperMetadata } from "./types";

const SOURCE_HOSTS: Array<[RegExp, string]> = [
  [/(^|\.)jstor\.org$/i, "jstor"],
  [/(^|\.)sciencedirect\.com$/i, "elsevier"],
  [/(^|\.)springer\.com$/i, "springer"],
  [/(^|\.)wiley\.com$/i, "wiley"],
  [/(^|\.)sagepub\.com$/i, "sage"],
  [/(^|\.)tandfonline\.com$/i, "taylor-francis"],
  [/^psycnet\.apa\.org$/i, "apa-psycnet"],
  [/(^|\.)ncbi\.nlm\.nih\.gov$/i, "pubmed-pmc"],
  [/(^|\.)arxiv\.org$/i, "arxiv"],
  [/^dl\.acm\.org$/i, "acm"],
  [/^ieeexplore\.ieee\.org$/i, "ieee"],
];

const CORPORATE_AUTHOR =
  /(consortium|collaboration|group|team|committee|university|institute|association|society)$/i;
const SUPPLEMENT_PATTERN =
  /(?:supp(?:l|lement|lementary)?(?:[-_ ]?(?:file|info(?:rmation)?|material))?|supporting[-_ ]?(?:information|material)|appendix|additional[-_ ]?file|table[-_ ]?s?\d+|fig(?:ure)?[-_ ]?s?\d+|data[-_ ]?s?\d+|mmc\d*|esm)(?:[./?&=_ -]|$)/i;

function clean(value: string | null | undefined): string | undefined {
  const result = value?.replace(/\s+/g, " ").trim();
  return result || undefined;
}

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

function normalizeDoi(value: unknown): string | undefined {
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

export function sourceAdapterForUrl(pageUrl: string): string | undefined {
  try {
    const hostname = new URL(pageUrl).hostname;
    return SOURCE_HOSTS.find(([pattern]) => pattern.test(hostname))?.[1];
  } catch {
    return undefined;
  }
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

export function extractPaperMetadata(
  document: Document,
  pageUrl: string,
): PaperMetadata | undefined {
  const article = jsonLdNodes(document).find(isScholarlyArticle);
  const arxiv = arxivFallback(document, pageUrl);

  const title =
    firstMeta(document, ["citation_title", "dc.title", "dcterms.title"]) ??
    clean(
      typeof article?.headline === "string"
        ? article.headline
        : typeof article?.name === "string"
          ? article.name
          : undefined,
    ) ??
    arxiv.title;
  if (!title) return undefined;

  const metaAuthors = metaValues(document, [
    "citation_author",
    "dc.creator",
    "dcterms.creator",
  ]).map(authorFromName);
  const authors = metaAuthors.length
    ? metaAuthors
    : authorsFromJson(article?.author).length
      ? authorsFromJson(article?.author)
      : (arxiv.authors ?? []);
  const abstract =
    firstMeta(document, [
      "citation_abstract",
      "dc.description",
      "dcterms.abstract",
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
    ]) ??
    clean(
      typeof article?.datePublished === "string"
        ? article.datePublished
        : undefined,
    );
  const rawIdentifier =
    firstMeta(document, [
      "citation_doi",
      "dc.identifier",
      "dcterms.identifier",
    ]) ?? article?.identifier;
  const doi = normalizeDoi(rawIdentifier);
  const citationPdf = absoluteUrl(
    firstMeta(document, ["citation_pdf_url"]),
    pageUrl,
  );
  const jsonPdfUrls = pdfUrlsFromJson(article?.encoding, pageUrl);
  const linkedPdfUrls = [
    ...document.querySelectorAll('link[type="application/pdf"], a[href]'),
  ].flatMap((node): string[] => {
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
        ...jsonPdfUrls,
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
    sourceAdapter: sourceAdapterForUrl(pageUrl),
  };
}
