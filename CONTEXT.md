# Papername domain context

Papername is a Chrome extension that gives downloaded academic PDFs useful filenames.

## Glossary

- **Article page**: A journal, repository, or preprint landing page that describes one paper and exposes scholarly metadata.
- **Curated source**: A tested academic origin with source-specific metadata handling and full-page observation.
- **Automatic web coverage**: Required HTTP(S) page access accepted at install/update, used locally to detect academic citation metadata without a per-site popup workflow.
- **Scholar result context**: Title, author, year, and selected side-PDF URL read from the visible Google Scholar result the user activates; snippets are not treated as abstracts.
- **Recoverable PDF route**: A recognized arXiv, EPrints, or DSpace PDF URL that deterministically maps to a same-origin article record without reading the PDF.
- **Paper metadata**: The title, author list, publication year, abstract, identifiers, and known PDF URLs extracted from an article page.
- **Filename format** (internally `Preset`): One of the five built-in naming styles: authors and year, authors/year/title, title, authors/year/key takeaway, or key takeaway alone.
- **Citation label**: An APA-like compact author/year label such as `Wu et al. (2026)`.
- **Key takeaway** (internally `Gist`): A short, faithful English claim of 4–10 words stating the paper's reported main finding or contribution.
- **Name**: One prepaid credit, spent when the model produced a key takeaway in time.
- **Install token**: The random bearer credential a browser receives, with 10 free names, the first time key takeaways or telemetry are enabled.
- **Access key**: A one-use gift or purchase key that adds names to an install's balance.
- **Download intent**: A pointer press on a recognized PDF link, which starts the key-takeaway request before the download begins.
- **Eligible download**: A PDF download that can be confidently associated with recently extracted paper metadata.
- **Fallback**: The deterministic filename used when a selected preset cannot be completed safely.

## Invariants

- Ambiguous downloads are left unchanged.
- Citation and title naming are entirely local.
- Only title and abstract may be sent to the Papername gist API, and only after a PDF-link press or a matching download.
- After explicit gist consent, a DOI may be sent to Crossref to fill missing metadata.
- Paper content is never persisted by the backend or telemetry pipeline, and no key-takeaway cache is shared across users.
- A finished key takeaway lives only in the tab's short-lived article context, so a repeat save spends nothing.
- A name is spent only when the model answered in time; provider failures and slow answers are refunded.
- A download waits at most 1.5 seconds from the filename hook for a gist, or until 2.5 seconds after the PDF-link press that started the request, before falling back.
- A recognized Adobe Acrobat handoff may use the active supported PDF tab URL
  locally to restore source identity; this URL is never persisted as an outcome
  or sent in telemetry.
- HTTP(S) pages are eligible for automatic local metadata detection after the user accepts Chrome's site-access warning; on non-curated pages observation is limited to metadata in the document head.
- Users may restrict Papername to selected sites using Chrome's extension Site access controls, which correspondingly reduces automatic coverage.
- ResearchGate is not read or automated while its terms prohibit browser add-ons used for that purpose.
- Direct-PDF recovery never guesses beyond recognized same-origin repository routes and never reads or uploads PDF content.
