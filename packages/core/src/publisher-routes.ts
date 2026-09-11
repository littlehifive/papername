import { firstClassSourceForUrl } from "./sources";

/** Stable article identity shared by ScienceDirect pages and signed PDF assets. */
export function elsevierPiiRoute(
  value: string,
): { pii: string; reader: boolean } | undefined {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase();
    const pathname = decodeURIComponent(url.pathname);
    if (
      hostname === "sciencedirect.com" ||
      hostname.endsWith(".sciencedirect.com")
    ) {
      const article = pathname.match(
        /^\/science\/article\/pii\/([a-z0-9-]+)(?:\/(pdfft))?\/?$/i,
      );
      if (article) {
        return {
          pii: article[1]!.toLocaleUpperCase(),
          reader: Boolean(article[2]),
        };
      }
      const manuscript = pathname.match(
        /^\/sdfe\/pdf\/download\/(?:aam\/)?pii\/([a-z0-9-]+)/i,
      );
      if (manuscript) {
        return { pii: manuscript[1]!.toLocaleUpperCase(), reader: true };
      }
      return undefined;
    }
    if (
      hostname !== "sciencedirectassets.com" &&
      !hostname.endsWith(".sciencedirectassets.com")
    )
      return undefined;
    if (!/\/main\.pdf$/i.test(pathname)) return undefined;
    const assetPii =
      pathname.match(/\/1-s2\.0-([a-z0-9-]+)\/main\.pdf$/i)?.[1] ??
      url.searchParams.get("pii") ??
      undefined;
    return assetPii
      ? { pii: assetPii.toLocaleUpperCase(), reader: true }
      : undefined;
  } catch {
    return undefined;
  }
}

/** DOI routes used by the supported publishers' article and reading views. */
export function publisherDoiRoute(
  value: string,
): { origin: string; doi: string; reader: boolean } | undefined {
  try {
    const url = new URL(value);
    const source = firstClassSourceForUrl(value)?.id;
    if (!source || !["sage", "wiley", "taylor-francis", "acm"].includes(source))
      return undefined;
    const match = decodeURIComponent(url.pathname).match(
      /^\/doi\/(?:(full|abs|reader|epub|pdf|epdf|pdfplus)\/)?(10\.\d{4,9}\/.+)$/i,
    );
    if (!match) return undefined;
    return {
      origin: url.origin,
      doi: match[2]!.replace(/\/$/, "").toLowerCase(),
      reader: /^(?:reader|epub|pdf|epdf|pdfplus)$/i.test(match[1] ?? ""),
    };
  } catch {
    return undefined;
  }
}

/** Stable manuscript identity shared by Research Square article and asset URLs. */
export function researchSquarePaperRoute(
  value: string,
): { identity: string; reader: boolean } | undefined {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase();
    if (
      hostname !== "researchsquare.com" &&
      !hostname.endsWith(".researchsquare.com")
    )
      return undefined;
    const pathname = decodeURIComponent(url.pathname);
    const article = pathname.match(/^\/article\/(rs-\d+)\/(v\d+)(\.pdf)?\/?$/i);
    if (article) {
      return {
        identity: `${article[1]!.toLocaleLowerCase()}/${article[2]!.toLocaleLowerCase()}`,
        reader: Boolean(article[3]),
      };
    }
    const asset = pathname.match(/^\/files\/(rs-\d+)\/(v\d+)\/[^/]+\.pdf$/i);
    return asset
      ? {
          identity: `${asset[1]!.toLocaleLowerCase()}/${asset[2]!.toLocaleLowerCase()}`,
          reader: true,
        }
      : undefined;
  } catch {
    return undefined;
  }
}
