export interface FirstClassSource {
  id: string;
  label: string;
  hosts: readonly string[];
}

/**
 * Sources that Papername scans automatically. Host entries include their
 * subdomains; arbitrary sites use the extension's explicit site-enablement
 * flow instead of expanding this list at runtime.
 */
export const FIRST_CLASS_SOURCES: readonly FirstClassSource[] = [
  { id: "jstor", label: "JSTOR", hosts: ["jstor.org"] },
  {
    id: "elsevier",
    label: "ScienceDirect",
    hosts: ["sciencedirect.com"],
  },
  { id: "springer", label: "SpringerLink", hosts: ["springer.com"] },
  { id: "nature", label: "Nature", hosts: ["nature.com"] },
  { id: "wiley", label: "Wiley Online Library", hosts: ["wiley.com"] },
  { id: "sage", label: "SAGE Journals", hosts: ["sagepub.com"] },
  {
    id: "taylor-francis",
    label: "Taylor & Francis",
    hosts: ["tandfonline.com"],
  },
  {
    id: "apa-psycnet",
    label: "APA PsycNet",
    hosts: ["psycnet.apa.org"],
  },
  {
    id: "pubmed-pmc",
    label: "PubMed / PubMed Central",
    hosts: ["ncbi.nlm.nih.gov"],
  },
  { id: "arxiv", label: "arXiv", hosts: ["arxiv.org"] },
  { id: "acm", label: "ACM Digital Library", hosts: ["dl.acm.org"] },
  { id: "ieee", label: "IEEE Xplore", hosts: ["ieeexplore.ieee.org"] },
  { id: "osf", label: "OSF and OSF Preprints", hosts: ["osf.io"] },
  { id: "ssrn", label: "SSRN", hosts: ["ssrn.com"] },
  {
    id: "eprints",
    label: "University of Glasgow Enlighten",
    hosts: ["eprints.gla.ac.uk"],
  },
  {
    id: "digital-commons",
    label: "Digital Commons",
    hosts: ["bepress.com"],
  },
  { id: "biorxiv", label: "bioRxiv", hosts: ["biorxiv.org"] },
  { id: "medrxiv", label: "medRxiv", hosts: ["medrxiv.org"] },
  { id: "chemrxiv", label: "ChemRxiv", hosts: ["chemrxiv.org"] },
  { id: "zenodo", label: "Zenodo", hosts: ["zenodo.org"] },
  { id: "figshare", label: "Figshare", hosts: ["figshare.com"] },
  { id: "hal", label: "HAL", hosts: ["hal.science"] },
  {
    id: "research-square",
    label: "Research Square",
    hosts: ["researchsquare.com"],
  },
] as const;

function sourceForHostname(hostname: string): FirstClassSource | undefined {
  return FIRST_CLASS_SOURCES.find((source) =>
    source.hosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    ),
  );
}

export function firstClassSourceForUrl(
  pageUrl: string,
): FirstClassSource | undefined {
  try {
    return sourceForHostname(new URL(pageUrl).hostname.toLocaleLowerCase());
  } catch {
    return undefined;
  }
}

export function firstClassArticleMatches(): string[] {
  return [
    ...new Set(
      FIRST_CLASS_SOURCES.flatMap((source) =>
        source.hosts.map((host) => `*://*.${host}/*`),
      ),
    ),
  ];
}
