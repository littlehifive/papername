import type { PaperAuthor, PaperMetadata } from "@papername/core";

interface CrossrefWork {
  title?: unknown;
  author?: unknown;
  published?: unknown;
  abstract?: unknown;
}

const lookupCaches = new WeakMap<
  typeof fetch,
  Map<string, Promise<CrossrefWork | undefined>>
>();

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function crossrefAuthors(value: unknown): PaperAuthor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): PaperAuthor[] => {
    if (!entry || typeof entry !== "object") return [];
    const author = entry as Record<string, unknown>;
    const familyName = text(author.family);
    const givenName = text(author.given);
    const organization = text(author.name);
    if (familyName) {
      return [
        { name: [givenName, familyName].filter(Boolean).join(" "), familyName },
      ];
    }
    return organization ? [{ name: organization, corporate: true }] : [];
  });
}

function crossrefYear(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const parts = (value as Record<string, unknown>)["date-parts"];
  const year =
    Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : undefined;
  return typeof year === "number" && year >= 1800 && year <= 2199
    ? String(year)
    : undefined;
}

function needsEnrichment(metadata: PaperMetadata): boolean {
  return Boolean(
    metadata.identifiers.doi &&
    (!metadata.authors.length || !metadata.year || !metadata.abstract),
  );
}

function lookupCrossref(
  doi: string,
  request: typeof fetch,
): Promise<CrossrefWork | undefined> {
  let cache = lookupCaches.get(request);
  if (!cache) {
    cache = new Map();
    lookupCaches.set(request, cache);
  }
  const existing = cache.get(doi);
  if (existing) return existing;
  const lookup = request(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
    {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(3_000),
    },
  )
    .then(async (response) => {
      if (!response.ok) return undefined;
      const payload = (await response.json()) as { message?: CrossrefWork };
      return payload.message;
    })
    .catch(() => undefined);
  cache.set(doi, lookup);
  return lookup;
}

export async function enrichMetadata(
  metadata: PaperMetadata,
  request: typeof fetch = fetch,
): Promise<PaperMetadata> {
  const doi = metadata.identifiers.doi;
  if (!doi || !needsEnrichment(metadata)) return metadata;

  try {
    const work = await lookupCrossref(doi, request);
    if (!work) return metadata;

    const remoteAuthors = crossrefAuthors(work.author);
    const remoteYear = crossrefYear(work.published);
    const remoteAbstract = text(work.abstract);
    return {
      ...metadata,
      authors: metadata.authors.length ? metadata.authors : remoteAuthors,
      ...(metadata.year ? {} : remoteYear ? { year: remoteYear } : {}),
      ...(metadata.abstract
        ? {}
        : remoteAbstract
          ? { abstract: remoteAbstract }
          : {}),
    };
  } catch {
    return metadata;
  }
}
