# Papername domain context

Papername is a Chrome extension that gives downloaded academic PDFs useful filenames.

## Glossary

- **Article page**: A journal, repository, or preprint landing page that describes one paper and exposes scholarly metadata.
- **Curated source**: A tested origin where Papername reads article metadata automatically.
- **One-page scan**: Temporary access to the active HTTP(S) page after the user invokes Papername.
- **Remembered site**: An exact origin the user has optionally authorized for automatic metadata extraction.
- **Recoverable PDF route**: A recognized arXiv, EPrints, or DSpace PDF URL that deterministically maps to a same-origin article record without reading the PDF.
- **Paper metadata**: The title, author list, publication year, abstract, identifiers, and known PDF URLs extracted from an article page.
- **Preset**: One of the four built-in filename formats: citation, citation plus title, title, or citation plus gist.
- **Citation label**: An APA-like compact author/year label such as `Wu et al. (2026)`.
- **Gist**: A short, faithful English statement of the paper's reported main finding or contribution.
- **Eligible download**: A PDF download that can be confidently associated with recently extracted paper metadata.
- **Fallback**: The deterministic filename used when a selected preset cannot be completed safely.
- **Beta token**: A bearer credential issued after a one-use invite code is activated.

## Invariants

- Ambiguous downloads are left unchanged.
- Citation and title naming are entirely local.
- Only title and abstract may be sent to the Papername gist API.
- After explicit gist consent, a DOI may be sent to Crossref to fill missing metadata.
- Paper content is never persisted by the backend or telemetry pipeline.
- A download waits at most 1.5 seconds for a gist before falling back.
- A recognized Adobe Acrobat handoff may use the active supported PDF tab URL
  locally to restore source identity; this URL is never persisted as an outcome
  or sent in telemetry.
- Unknown sites are read only after an explicit one-page scan or exact-origin grant.
- ResearchGate is not read or automated while its terms prohibit browser add-ons used for that purpose.
- Direct-PDF recovery never guesses beyond recognized same-origin repository routes and never reads or uploads PDF content.
