# Supported sites

Papername uses layered coverage so broad usefulness does not require permanent access to every website.

## Automatic sources

The extension currently scans article pages automatically on:

- JSTOR
- ScienceDirect
- SpringerLink and Nature
- Wiley Online Library
- SAGE Journals
- Taylor & Francis
- APA PsycNet
- PubMed and PubMed Central
- arXiv
- ACM Digital Library
- IEEE Xplore
- OSF and OSF Preprints
- SSRN article pages
- University of Glasgow Enlighten
- Digital Commons sites on `bepress.com`
- bioRxiv and medRxiv
- ChemRxiv
- Zenodo
- Figshare
- HAL
- Research Square

## Other journals and repositories

On another HTTP(S) article page, open Papername and choose:

- **Use once on this page** for temporary access granted by the popup invocation.
- **Always use on this site** to grant only the exact current origin. The popup can revoke it later.

The generic extractor understands Highwire/Google Scholar `citation_*` tags, Dublin Core, `ScholarlyArticle` JSON-LD, EPrints fields, Digital Commons/bepress fields, and DSpace markers. This covers many EPrints, DSpace, Digital Commons, university repositories, preprint servers, and journal platforms even when each institution uses its own domain.

For direct PDFs, Papername can explicitly recover a record page only from narrow arXiv, EPrints, and DSpace bitstream routes. Open the popup and choose **Find article metadata** before saving. Otherwise, open the article/record page first and invoke Papername before downloading. Digital Commons download IDs do not equal its public record IDs, so Papername deliberately does not guess that mapping.

## Known limits

- ResearchGate is deliberately blocked unless it provides written permission. Its current terms prohibit browser plugins/add-ons used to access or copy service data.
- SSRN is handled only from metadata in the user's article tab. Papername does not backend-crawl SSRN or recover its direct delivery URLs.
- Paywalls and access controls remain in force. Papername names only files the user is entitled to download.
- Scanned PDFs, encrypted files, blob URLs, session-bound downloads, missing metadata, and customized repository routes may not be recoverable. Papername leaves uncertain downloads unchanged instead of guessing.
- Local extraction and remembered-site support have no marginal API or LLM cost. Only the optional hosted gist preset consumes the existing monthly generation allowance.

The evidence and operational rationale are recorded in [Academic Source Coverage Research](SOURCE_COVERAGE_RESEARCH.md).
