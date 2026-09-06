# Supported sites

Papername uses layered coverage to work automatically across publishers and institution-specific repositories. Chrome therefore asks for permission to read and change data on websites at install/update. Papername uses that access only to find academic citation metadata locally and connect it to a PDF download; it does not alter page content. Users can restrict access with Chrome's extension **Site access** controls, which reduces automatic coverage.

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

## Other journals, repositories, and Google Scholar

Other HTTP(S) article pages work automatically when a scholarly fingerprint, bibliographic detail, and paper-specific PDF URL or identifier agree. Papername understands Highwire/Google Scholar `citation_*` tags, appropriately identified Dublin Core records, `ScholarlyArticle` JSON-LD, EPrints fields, Digital Commons/bepress fields, and DSpace markers. This covers many university repositories, preprint servers, and journal platforms even when each institution uses its own domain, while avoiding generic pages that merely link to a PDF.

When the user activates a Google Scholar side link marked `[PDF]`, Papername locally captures that visible result's title, author line, year, and exact PDF destination. This supports many university-library proxy links without visiting the publisher landing page first. Papername does not automate Scholar searches, send Scholar result data to a server, or use the result snippet as an abstract.

For direct PDFs, Papername can explicitly recover a record page only from narrow arXiv, EPrints, and DSpace bitstream routes. Open the popup and choose **Find article metadata** before saving. Otherwise, open the article/record page before downloading. Digital Commons download IDs do not equal its public record IDs, so Papername deliberately does not guess that mapping.

## Known limits

- ResearchGate is deliberately blocked unless it provides written permission. Its current terms prohibit browser plugins/add-ons used to access or copy service data.
- SSRN is handled only from metadata in the user's article tab. Papername does not backend-crawl SSRN or recover its direct delivery URLs.
- Google Scholar proxy naming requires the download to retain the selected link as its original or final URL. Session-bound links, browser-extension handoffs, or opaque redirect chains can defeat that match.
- Paywalls and access controls remain in force. Papername names only files the user is entitled to download.
- Scanned PDFs, encrypted files, blob URLs, session-bound downloads, missing metadata, and customized repository routes may not be recoverable. Papername leaves uncertain downloads unchanged instead of guessing.
- Local extraction, including Google Scholar result capture, has no marginal API or LLM cost. Only the optional hosted gist preset consumes the existing monthly generation allowance.

The evidence and operational rationale are recorded in [Academic Source Coverage Research](SOURCE_COVERAGE_RESEARCH.md).
