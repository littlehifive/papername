# Papername domain context

Papername is a Chrome extension that gives downloaded academic PDFs useful filenames.

## Glossary

- **Article page**: A supported journal, repository, or preprint landing page that describes one paper.
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
