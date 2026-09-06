export const ARTICLE_MATCHES = ["http://*/*", "https://*/*"] as const;

const EXCLUDED_ARTICLE_DOMAINS = ["researchgate.net"] as const;

export const ARTICLE_EXCLUDE_MATCHES = EXCLUDED_ARTICLE_DOMAINS.map(
  (domain) => `*://*.${domain}/*`,
);

export function isExcludedArticleHostname(hostname: string): boolean {
  return EXCLUDED_ARTICLE_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}
