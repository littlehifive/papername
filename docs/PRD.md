# Papername Product Requirements

Status: `implemented-local-only`; Chrome Web Store listing remains a release gate

## Problem Statement

Researchers frequently download journal and preprint PDFs whose filenames are opaque identifiers such as `jstor1234.pdf`, `fulltext.pdf`, or an article DOI. Those names are difficult to scan, search, share, and remember outside a reference manager. Zotero can rename files after saving them into a library, and existing extensions can substitute titles or metadata, but that is more workflow than many users want.

Papername must rename an academic PDF as it is downloaded from a supported article page. It must remain fast and unobtrusive, work without any server or account, and let users choose or arrange the filename format themselves. It must fail safely: an uncertain match must never block a download or misleadingly rename an unrelated file.

## Solution

Papername is a Chrome/Chromium extension. It extracts bibliographic metadata from article pages, associates that metadata with the corresponding PDF download, and uses Chrome's download filename suggestion interface to apply the selected format automatically. It requests HTTP(S) page access at installation because automatic coverage across publishers, university proxies, and institution-specific repositories is the product's core function. This permission and its local-only use must be disclosed prominently before installation; users can later restrict Papername through Chrome's built-in Site access controls.

The default is an APA-like citation label such as `Wu et al. (2026).pdf`. A second built-in format adds the full title. A **Customize** option lets the user arrange **Authors**, **Year**, and **Title** pieces together with fixed-text pieces into any order, for example `[Title] - [Authors] ([Year])`. Every format is rendered locally. Papername has no backend, collects no telemetry, and sends no paper content anywhere.

Papername is free. The popup links to a Ko-fi page for users who want to support development; there is no paid tier, account, or license.

## User Stories

1. As a researcher, I want a downloaded paper to receive a meaningful name automatically, so that I do not manually rename it.
2. As a researcher, I want `Wu et al. (2026)` to be the default format, so that files are compact and recognizable.
3. As a researcher, I want an authors, year, and title format, so that papers from the same author and year remain distinguishable.
4. As a researcher, I want to arrange authors, year, title, and my own separators into a custom format, so that filenames match how I already organize papers.
5. As a researcher, I want to reorder the pieces of my custom format by dragging or with the keyboard, so that changing the arrangement takes seconds.
6. As a researcher, I want to see the pattern and a concrete example of the selected format before I download anything, so that I know exactly what I will get.
7. As a researcher, I want punctuation my operating system cannot store in a filename to be replaced safely and shown in the example, so that the real filename is never a surprise.
8. As a researcher, I want non-English titles and names preserved, so that bibliographic metadata is not corrupted.
9. As a researcher, I want downloads to happen without a confirmation dialog, so that Papername removes rather than adds work.
10. As a researcher, I want a whole title or a whole citation label used when my format needs a piece that the page did not provide, so that I never receive a half-filled filename.
11. As a researcher, I want the site's original filename preserved when Papername is uncertain, so that unrelated files are never mislabeled.
12. As a researcher, I want supplementary files left alone, so that they are not confused with the main article.
13. As a researcher, I want Chrome to handle existing filenames and Save As behavior, so that Papername does not inspect my folders.
14. As a researcher, I want author counts formatted consistently, so that one, two, and many-author papers remain readable.
15. As a researcher, I want an unknown year represented as `n.d.`, so that incomplete metadata still produces an honest citation.
16. As a researcher, I want invalid filename characters cleaned safely, so that names work across common operating systems.
17. As a researcher, I want long names shortened at word boundaries, so that a verbose title does not create an unusable path.
18. As a researcher, I want to turn Papername off quickly, so that I can download a file unchanged when needed.
19. As a researcher, I want to change filename formats from a small toolbar popup, so that configuration is immediate.
20. As a researcher, I want to see and copy the latest generated filename, so that I can reuse it if I miss the download notification.
21. As a privacy-conscious researcher, I want every format to work without sending paper content to any server.
22. As a privacy-conscious researcher, I want my custom format stored only in my browser.
23. As a user, I want feedback access from the popup, so that I can report a bad name or unsupported source.
24. As a user who likes the tool, I want a clearly labeled way to support development, without any suggestion that features are locked behind payment.
25. As the product owner, I want automated extension tests, so that publisher-specific fixes do not silently break core naming.
26. As the product owner, I want an offline fixture suite, so that tests are deterministic and do not scrape live publisher sites during every run.
27. As a researcher, I want Papername to work automatically on an unfamiliar metadata-rich journal or repository, so that a static publisher list is not the product ceiling.
28. As a privacy-conscious researcher, I want a clear install-time explanation of broad site access, so that I can make an informed choice before enabling automatic coverage.
29. As a researcher, I want to restrict Papername through Chrome's Site access controls, so that I can trade automatic coverage for narrower access whenever I choose.
30. As a researcher opening a recognizable arXiv, EPrints, or DSpace PDF route directly, I want Papername to recover its public record metadata without reading the PDF.
31. As a privacy-conscious researcher, I want arbitrary-site extraction to stay in my browser and retain only a short-lived paper context.
32. As the product owner, I want sites whose terms prohibit browser-add-on extraction explicitly blocked, so that broad coverage does not create avoidable policy or account risk.
33. As a Google Scholar user, I want a side-PDF or library-proxy download named from the visible result's title, author, and year, so that bypassing a publisher landing page does not force an opaque filename.

## Implementation Decisions

- Use a pnpm TypeScript workspace with a WXT Manifest V3 extension and a shared domain package. There is no backend.
- Treat the public behavioral seams as downloaded filenames, normalized settings, and popup-visible state.
- Define three formats: `citation`, `citation_title`, and `custom`. Express the two built-in formats as templates so all three share one render path. Store the active format and the custom template in local Chrome storage.
- A template is an ordered list of pieces: `authors`, `year`, `title`, or `text` with a literal value of at most 40 characters, at most 12 pieces in total. Pieces are concatenated with no implicit separator; spaces and punctuation live in text pieces. A custom template must contain at least one metadata piece.
- Build citation labels as follows: one author `Wu (2026)`, two authors `Wu & Smith (2026)`, and three or more `Wu et al. (2026)`. Use a corporate author verbatim. Use `n.d.` when a year is unavailable.
- When a template needs authors or a title that the page did not provide, do not render it partially. Fall back to the title if present, otherwise to the citation label, otherwise leave the download unchanged, and report the outcome as `fallback` with the reason `missing_author` or `missing_metadata`.
- Normalize filenames by preserving Unicode, converting reserved separators and control characters to readable dashes, collapsing whitespace, trimming trailing dots/spaces, protecting reserved Windows basenames, and limiting the complete basename to 180 characters at a word boundary. Fixed text in a custom template is subject to the same rules; the popup shows a hint when a text piece contains such characters and always previews the sanitized result.
- Migrate retired stored formats on read: the former title-only format becomes a custom template containing only `title`; the former key-takeaway format becomes `citation_title`. Unknown values become the default. Retired fields are dropped on the next write.
- Extract paper metadata from citation/Dublin Core meta elements, `ScholarlyArticle` JSON-LD, EPrints fields, Digital Commons/bepress fields, and narrowly scoped site adapters.
- Scan a curated catalog automatically: JSTOR, ScienceDirect/Elsevier, SpringerLink, Nature, Wiley, SAGE, Taylor & Francis, APA PsycNet, PubMed/PMC, arXiv, ACM, IEEE, OSF, SSRN, Glasgow Enlighten, Digital Commons on `bepress.com`, bioRxiv, medRxiv, ChemRxiv, Zenodo, Figshare, HAL, and Research Square.
- Request required `http://*/*` and `https://*/*` host access because zero-click, cross-publisher naming is the core product behavior. Disclose Chrome's broad-access warning and the local-only purpose prominently. Respect Chrome's user-controlled Site access setting. Exclude ResearchGate in the packaged content-script manifest.
- Keep broad injection lightweight: on unrecognized origins observe only document-head metadata changes and publish a context only when a scholarly fingerprint, bibliographic detail, and paper-specific PDF/identifier agree; reserve full-document observation for curated academic sources. Extract the visible Google Scholar result only on an explicit allowlist of Google-owned Scholar hosts and when the user activates a side PDF link. Never automate searches.
- Block ResearchGate page extraction unless ResearchGate grants written permission; its current terms expressly prohibit browser plugins/add-ons used to access or copy service data. Continue to handle a file reached through an independently supported publisher or repository.
- Recover public article metadata for narrowly recognizable arXiv, EPrints, and DSpace bitstream direct-PDF routes by fetching only a same-origin record page after an explicit popup action. Do not parse or upload the PDF. Digital Commons and SSRN support is limited to metadata already present in the user's article tab.
- Associate downloads through known PDF URLs, identifiers, referrer/source relationships, and a short-lived per-tab article context. Never use a stale article context solely because it was the most recently visited page.
- When Adobe Acrobat rewrites a PDF save to its extension origin and a UUID filename, recover identity from the active supported HTTP(S) PDF tab and then apply the same known-URL or identifier checks. Do not use the active tab as evidence for ordinary downloads.
- Act only on PDFs confidently associated with a paper. Keep supplementary or ambiguous downloads unchanged.
- The popup exposes its current-page readiness before the filename-format selector, uses color and icons to distinguish ready, unavailable, and needs-attention states, and describes the selected format with replaceable-field notation plus a concrete example computed by the real naming code.
- The custom-format builder shows each piece as a chip. Chips reorder by dragging a grip or with arrow keys, Home, and End; Delete removes a chip; metadata chips can be added once each and text chips as often as the piece limit allows; the last remaining metadata chip cannot be removed. Every change is saved immediately, and the custom template is kept when the user switches back to a built-in format.
- The popup also exposes enabled state, the latest generated filename with a copy action, privacy and feedback links, and a Ko-fi support link. It does not maintain a paper library or download history.

## Testing Decisions

- Test only externally observable behavior at the agreed seams. Helper functions may be exercised through the shared package's exported filename, template, and metadata contracts, not by mocking their internals.
- Shared-domain tests cover literal filename examples, author-count rules, incomplete metadata, Unicode, unsafe characters, reserved basenames, length bounds, every built-in format, custom templates in several arrangements, sanitization of fixed text, every fallback, and template validation and reordering.
- Settings tests cover defaults, retired-format migration, invalid template handling, and the removal of retired fields.
- Metadata tests use minimal offline HTML fixtures representing generic citation tags, Dublin Core, JSON-LD, and each supported source family. Expected metadata is authored independently from extraction logic.
- Site-access tests cover curated, generic automatic, blocked, and direct-PDF states. Manifest integration verifies required HTTP(S) access and the ResearchGate exclusion. Route-recovery tests require a narrow deterministic record URL and reject unknown routes.
- Extension integration tests run Chromium with the built extension, visit an intercepted publisher-page fixture, assert metadata arrival and filename-hook registration, and exercise the format selector and custom-format builder through the real popup, including keyboard reordering, persistence across reloads, and the metadata-piece guard. Native drag-and-drop is covered by the pure reorder function rather than by simulated mouse drags. Exported decision tests assert filenames and fallbacks. Ordinary Chrome verifies final on-disk basenames because Playwright's download sandbox replaces filenames and does not reproduce the normal `onDeterminingFilename` event.
- Matching tests cover multiple tabs, stale contexts, signed PDF URLs, Google Scholar proxy targets, internal PDF viewers, MIME detection, non-PDFs, supplements, unsupported sites, and ambiguous candidates.
- Final acceptance requires the full unit, integration, typecheck, format, and build suite, plus a manual live check on representative publisher pages because publisher pages change and some require institutional access.

## Out of Scope

- Safari, Firefox-specific packaging, and mobile browsers.
- Renaming existing local files or watching the Downloads directory.
- Reading the first pages or full text of a PDF, OCR, and whole-paper summarization.
- AI-generated filename content of any kind, and any server-side component.
- Zotero, Mendeley, Paperpile, citation-manager, folder, and cloud-drive integrations.
- A searchable library, download history, duplicate detection, or folder organization.
- Automatic guessing from arbitrary direct PDF URLs, first-page PDF parsing, OCR, and server-side publisher/repository crawling.
- ResearchGate extraction or automation without written permission from ResearchGate.
- Accounts, payments, subscriptions, licenses, and paid features.
- Additional template pieces such as journal, DOI, or first author only; these can be considered once the current pieces prove sufficient.

## Further Notes

- Chrome controls filename conflict behavior. Papername must not request filesystem access merely to customize collisions.
- Local metadata extraction, Google Scholar result capture, and narrow route recovery add no per-request cost. Required all-site access creates a stronger Chrome install warning and higher disclosure/review burden. Institutional customizations, paywalls, anti-bot systems, session-bound or opaque redirects, scanned PDFs, and missing metadata prevent literal universality; those cases must remain unchanged with an actionable explanation.
- The Ko-fi URL in the popup is a placeholder until the real support page exists; replace it before publishing the listing.
- The packaged manifest still uses the `Papername BETA` name and testing disclosure from the private beta; update both before a public listing.
