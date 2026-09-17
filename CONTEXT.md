# Papername domain context

Papername is a Chrome extension that gives downloaded academic PDFs useful filenames.

## Glossary

- **Article page**: A journal, repository, or preprint landing page that describes one paper and exposes scholarly metadata.
- **Curated source**: A tested academic origin with source-specific metadata handling and full-page observation.
- **Automatic web coverage**: Required HTTP(S) page access accepted at install/update, used locally to detect academic citation metadata without a per-site popup workflow.
- **Scholar result context**: Title, author, year, and selected side-PDF URL read from the visible Google Scholar result the user activates.
- **Recoverable PDF route**: A recognized arXiv, EPrints, or DSpace PDF URL that deterministically maps to a same-origin article record without reading the PDF.
- **Paper metadata**: The title, author list, publication year, abstract, identifiers, and known PDF URLs extracted from an article page.
- **Filename format** (internally `Preset`): The active naming style. Two are built in, authors and year (`citation`) and authors, year, and title (`citation_title`); the third, `custom`, renders the user's own template.
- **Filename template**: An ordered list of pieces, each an **Authors**, **Year**, or **Title** metadata piece or a fixed-text piece carrying literal characters such as spaces, parentheses, and dashes. Pieces are concatenated with no implicit separator, then sanitized. Built-in formats are expressed as templates too, so every format shares one render path.
- **Citation label**: An APA-like compact author/year label such as `Wu et al. (2026)`.
- **Eligible download**: A PDF download that can be confidently associated with recently extracted paper metadata.
- **Fallback**: The deterministic whole-piece filename (title, else citation label) used when a template cannot be completed because a metadata piece is missing.

## Invariants

- Ambiguous downloads are left unchanged.
- All naming is local. The extension makes no network requests of its own beyond the optional same-origin record-page fetch for recoverable PDF routes.
- A template is never emitted half-rendered: if a required metadata piece is missing, the fallback is used and the outcome is reported as `fallback`.
- A custom template must contain at least one metadata piece; the popup enforces this and the core falls back to the authors, year, and title format if storage disagrees.
- Fixed text is sanitized like every other part of a filename; characters a filesystem rejects become a dash, and the popup previews the real result.
- The active format and custom template live only in Chrome's local extension storage.
- A recognized Adobe Acrobat handoff may use the active supported PDF tab URL locally to restore source identity; this URL is never persisted as an outcome.
- HTTP(S) pages are eligible for automatic local metadata detection after the user accepts Chrome's site-access warning; on non-curated pages observation is limited to metadata in the document head.
- Users may restrict Papername to selected sites using Chrome's extension Site access controls, which correspondingly reduces automatic coverage.
- ResearchGate is not read or automated while its terms prohibit browser add-ons used for that purpose.
- Direct-PDF recovery never guesses beyond recognized same-origin repository routes and never reads or uploads PDF content.
