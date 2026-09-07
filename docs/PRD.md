# Papername MVP Product Requirements

Status: `implemented-comprehensive-local-mvp`; production beta gates remain in Further Notes

## Problem Statement

Researchers frequently download journal and preprint PDFs whose filenames are opaque identifiers such as `jstor1234.pdf`, `fulltext.pdf`, or an article DOI. Those names are difficult to scan, search, share, and remember outside a reference manager. Zotero can rename files after saving them into a library, and existing extensions can substitute titles or metadata, but that is more workflow than some users want and does not provide a concise, faithful memory hook for what the paper actually claims.

Papername must rename an academic PDF as it is downloaded from a supported article page. It must remain fast and unobtrusive, provide useful deterministic names without AI, and offer a distinctive citation-plus-gist format without reading or uploading the PDF. It must fail safely: an uncertain match or unavailable gist must never block a download or misleadingly rename an unrelated file.

## Solution

Papername is a private-beta Chrome/Chromium extension. It extracts bibliographic metadata from article pages, associates that metadata with the corresponding PDF download, and uses Chrome's download filename suggestion interface to apply one of four built-in presets automatically. It requests HTTP(S) page access at installation because automatic coverage across publishers, university proxies, and institution-specific repositories is the product's core function. This permission and its local-only use must be disclosed prominently before installation; users can later restrict Papername through Chrome's built-in Site access controls.

The default is an APA-like citation label such as `Wu et al. (2026).pdf`. Alternatives add the full title, use the title alone, or combine the citation label with a short English gist. Citation and title naming run locally. Gist mode sends only the title and abstract to a rate-limited Cloudflare Worker, which calls a fast hosted language model and returns a strictly validated short phrase. The backend stores no paper content.

The MVP is distributed privately to 25 trusted testers for two weeks. It validates cross-site filename reliability and whether at least eight testers continue using citation-plus-gist. Billing and customization are not built; a small “I'd buy you a coffee” action lets testers send encouragement without implying that checkout or a paid tier already exists.

## User Stories

1. As a researcher, I want a downloaded paper to receive a meaningful name automatically, so that I do not manually rename it.
2. As a researcher, I want `Wu et al. (2026)` to be the default format, so that files are compact and recognizable.
3. As a researcher, I want a citation-plus-title preset, so that papers from the same author and year remain distinguishable.
4. As a researcher, I want a title-only preset, so that I can scan a folder by topic.
5. As a researcher, I want a citation-plus-gist preset, so that I can remember a paper's main contribution without opening it.
6. As a researcher, I want gist wording to preserve uncertainty, negation, and direction, so that the filename does not overstate the abstract.
7. As a researcher, I want methods, review, and theoretical papers described by their contribution rather than a fabricated empirical result.
8. As a researcher, I want non-English titles and names preserved, so that bibliographic metadata is not corrupted.
9. As a researcher, I want the gist in English during the beta, so that output quality follows one testable standard.
10. As a researcher, I want downloads to happen without a confirmation dialog, so that Papername removes rather than adds work.
11. As a researcher, I want a download to wait no more than 1.5 seconds for AI, so that a slow service does not interrupt my workflow.
12. As a researcher, I want citation-plus-title used when a gist is unavailable, so that I still receive a useful filename.
13. As a researcher, I want the site's original filename preserved when Papername is uncertain, so that unrelated files are never mislabeled.
14. As a researcher, I want supplementary files left alone, so that they are not confused with the main article.
15. As a researcher, I want Chrome to handle existing filenames and Save As behavior, so that Papername does not inspect my folders.
16. As a researcher, I want author counts formatted consistently, so that one, two, and many-author papers remain readable.
17. As a researcher, I want an unknown year represented as `n.d.`, so that incomplete metadata still produces an honest citation.
18. As a researcher, I want invalid filename characters cleaned safely, so that names work across common operating systems.
19. As a researcher, I want long names shortened at word boundaries, so that a verbose title does not create an unusable path.
20. As a researcher, I want to turn Papername off quickly, so that I can download a file unchanged when needed.
21. As a researcher, I want to change filename formats from a small toolbar popup, so that configuration is immediate.
22. As a researcher, I want to see and copy the latest generated filename, so that I can reuse it if I miss the download notification.
23. As a key-takeaway user, I want to see my remaining monthly allowance, so that a fallback is not surprising.
24. As a privacy-conscious researcher, I want citation and title presets to work without sending paper content to Papername's server.
25. As a privacy-conscious researcher, I want explicit consent before the first AI-generated key takeaway, so that I understand the data boundary in plain language.
26. As a privacy-conscious researcher, I want the disclosure to state the provider's possible abuse-log retention, so that it is accurate rather than reassuringly vague.
27. As a beta tester, I want one-use invite activation, so that setup is simple without creating an account.
28. As a beta tester, I want feedback access from the popup, so that I can report a bad name or unsupported source.
29. As a beta tester, I want telemetry to be optional, so that participation is voluntary.
30. As a beta tester who opts in, I want Papername to send only coarse operational events, so that paper titles, abstracts, identifiers, URLs, and filenames stay private.
31. As the product owner, I want monthly gist quotas enforced atomically, so that leaked or replayed credentials cannot create unbounded model spend.
32. As the product owner, I want model credentials kept only in Worker secrets, so that they cannot be extracted from the extension.
33. As the product owner, I want invite codes stored as hashes and usable once, so that beta access is controlled.
34. As the product owner, I want unsupported and ambiguous downloads measured as typed fallback outcomes, so that reliability problems are diagnosable without collecting paper content.
35. As the product owner, I want a truthful coffee-sized encouragement action, so that testers can express support without fake checkout or unavailable pricing promises.
36. As the product owner, I want the MVP to cover representative journal, repository, preprint, and engineering sources, so that cross-discipline usefulness is tested.
37. As the product owner, I want automated extension and backend tests, so that publisher-specific fixes do not silently break core naming.
38. As the product owner, I want an offline fixture suite, so that tests are deterministic and do not scrape live publisher sites during every run.
39. As the product owner, I want a manual live smoke matrix before distribution, so that fixture behavior corresponds to current websites.
40. As the product owner, I want the beta to have explicit continuation criteria, so that paid customization is built only after evidence of reliability and gist demand.
41. As a researcher, I want Papername to work automatically on an unfamiliar metadata-rich journal or repository, so that a static publisher list is not the product ceiling.
42. As a privacy-conscious researcher, I want a clear install-time explanation of broad site access, so that I can make an informed choice before enabling automatic coverage.
43. As a researcher, I want to restrict Papername through Chrome's Site access controls, so that I can trade automatic coverage for narrower access whenever I choose.
44. As a researcher opening a recognizable arXiv, EPrints, or DSpace PDF route directly, I want Papername to recover its public record metadata without reading the PDF.
45. As a privacy-conscious researcher, I want arbitrary-site extraction to stay in my browser and retain only a short-lived paper context.
46. As the product owner, I want sites whose terms prohibit browser-add-on extraction explicitly blocked, so that broad coverage does not create avoidable policy or account risk.
47. As a Google Scholar user, I want a side-PDF or library-proxy download named from the visible result's title, author, and year, so that bypassing a publisher landing page does not force an opaque filename.

## Implementation Decisions

- Use a pnpm TypeScript workspace with a WXT Manifest V3 extension, a shared domain package, and a plain TypeScript Cloudflare Worker backed by D1.
- Treat the public behavioral seams as downloaded filenames, popup-visible state, and Worker HTTP responses.
- Define four presets: `citation`, `citation_title`, `title`, and `citation_gist`. Store the active preset and consent/telemetry choices in local Chrome storage.
- Build citation labels as follows: one author `Wu (2026)`, two authors `Wu & Smith (2026)`, and three or more `Wu et al. (2026)`. Use a corporate author verbatim. Use `n.d.` when a year is unavailable and fall back to title when no author is usable.
- Normalize filenames by preserving Unicode, converting reserved separators and control characters to readable hyphens, collapsing whitespace, trimming trailing dots/spaces, protecting reserved Windows basenames, and limiting the complete basename to 180 characters at a word boundary.
- Extract paper metadata from citation/Dublin Core meta elements, `ScholarlyArticle` JSON-LD, EPrints fields, Digital Commons/bepress fields, and narrowly scoped site adapters. Use DOI, arXiv, or PubMed metadata lookup only when page metadata is insufficient.
- Scan a curated catalog automatically: JSTOR, ScienceDirect/Elsevier, SpringerLink, Nature, Wiley, SAGE, Taylor & Francis, APA PsycNet, PubMed/PMC, arXiv, ACM, IEEE, OSF, SSRN, Glasgow Enlighten, Digital Commons on `bepress.com`, bioRxiv, medRxiv, ChemRxiv, Zenodo, Figshare, HAL, and Research Square.
- Request required `http://*/*` and `https://*/*` host access because zero-click, cross-publisher naming is the core product behavior. Disclose Chrome's broad-access warning and the local-only purpose prominently. Respect Chrome's user-controlled Site access setting. Exclude ResearchGate in the packaged content-script manifest.
- Keep broad injection lightweight: on unrecognized origins observe only document-head metadata changes and publish a context only when a scholarly fingerprint, bibliographic detail, and paper-specific PDF/identifier agree; reserve full-document observation for curated academic sources. Extract the visible Google Scholar result only on an explicit allowlist of Google-owned Scholar hosts and when the user activates a side PDF link. Use its exact destination URL and any DOI embedded in that URL to match proxy redirects. Never automate searches or treat a truncated Scholar snippet as an abstract.
- Block ResearchGate page extraction unless ResearchGate grants written permission; its current terms expressly prohibit browser plugins/add-ons used to access or copy service data. Continue to handle a file reached through an independently supported publisher or repository.
- Recover public article metadata for narrowly recognizable arXiv, EPrints, and DSpace bitstream direct-PDF routes by fetching only a same-origin record page after an explicit popup action. Do not parse or upload the PDF. Digital Commons and SSRN support is limited to metadata already present in the user's article tab; do not guess record routes or crawl them from the Worker.
- Associate downloads through known PDF URLs, identifiers, referrer/source relationships, and a short-lived per-tab article context. Never use a stale article context solely because it was the most recently visited page.
- When Adobe Acrobat rewrites a PDF save to its extension origin and a UUID filename, recover identity from the active supported HTTP(S) PDF tab and then apply the same known-URL or identifier checks. Do not use the active tab as evidence for ordinary downloads.
- Act only on PDFs confidently associated with a paper. Keep supplementary or ambiguous downloads unchanged.
- In gist mode, start a request when the user initiates a recognized PDF action or when an eligible download begins. Hold filename determination for at most 1.5 seconds, then cancel locally and fall back.
- Generate gists from title and abstract only. Require 6–12 English words, no author/year duplication, no path punctuation, no terminal sentence punctuation, no unsupported causal upgrade, and a faithful main reported result or contribution. Return `usable: false` when the abstract is insufficient.
- Use `gpt-5.6-luna` with reasoning disabled, no tools, strict structured output, and provider storage disabled. Keep the model configurable so the pre-release evaluation can switch to `gpt-5.6-terra` if and only if Luna misses the fidelity threshold.
- Expose Worker endpoints `POST /v1/activate`, `POST /v1/gist`, and `POST /v1/events`. Successful activation returns a random bearer token. Gist responses return `usable`, `gist`, `reason`, and `remaining`.
- Limit the beta to 30 gist requests per bearer token per UTC calendar month. Count concurrent calls atomically before invoking the model. Do not refund provider failures, preventing retry abuse.
- Hash invite codes and bearer tokens in D1. Never persist titles, abstracts, identifiers, URLs, filenames, or generated gists. Application logs must omit request bodies.
- Store opt-in telemetry only as aggregate counters keyed by day, extension version, preset, outcome, reason, and latency bucket; never store an installation identifier with telemetry.
- The popup exposes its current-page readiness before the filename-format selector, uses color and icons to distinguish ready, unavailable, and needs-attention states, and describes each format with replaceable-field notation plus a concrete example.
- The popup also exposes enabled state, remaining key-takeaway quota, the latest generated filename with a copy action, privacy/feedback links, a plain-language telemetry choice, and an honest coffee-sized encouragement action. It does not maintain a paper library or download history.
- The private beta listing uses the product name `Papername BETA`, includes the required testing disclosure, and is restricted to trusted testers. Each tester receives a separate one-use API invite.
- Custom metadata templates, custom key-takeaway instructions, pricing, payments, accounts, license enforcement, and the custom editor are deferred until after the beta.

## Testing Decisions

- Test only externally observable behavior at the agreed seams. Helper functions may be exercised through the shared package's exported filename and metadata contracts, not by mocking their internals.
- Shared-domain tests cover literal filename examples, author-count rules, incomplete metadata, Unicode, unsafe characters, reserved basenames, length bounds, every preset, and every fallback.
- Metadata tests use minimal offline HTML fixtures representing generic citation tags, Dublin Core, JSON-LD, and each supported source family. Expected metadata is authored independently from extraction logic.
- Site-access tests cover curated, generic automatic, blocked, and direct-PDF states. Manifest integration verifies required HTTP(S) access and the ResearchGate exclusion. Route-recovery tests require a narrow deterministic record URL and reject unknown routes.
- Extension integration tests run Chromium with the built extension, visit an intercepted publisher-page fixture, assert metadata arrival and filename-hook registration, and exercise invite/consent state through the real popup. Exported decision tests assert filenames and fallbacks. Ordinary Chrome verifies final on-disk basenames in the live smoke matrix because Playwright's download sandbox replaces filenames and does not reproduce the normal `onDeterminingFilename` event.
- Matching tests cover multiple tabs, stale contexts, signed PDF URLs, Google Scholar proxy targets, internal PDF viewers, MIME detection, non-PDFs, supplements, unsupported sites, and ambiguous candidates.
- Worker API-contract tests call the complete fetch handler and cover invite activation/replay, bearer authentication, input bounds, provider timeout/error/schema violations, content-free telemetry, CORS, and remaining-count responses. A Miniflare runtime suite calls the exported Worker endpoint against migrated D1 storage and verifies activation plus atomic monthly quotas.
- Gist evaluation uses at least 60 title/abstract pairs across medicine, life science, physical science, engineering/CS, social science, and humanities. A human rubric requires at least 90% fidelity and 80% filename usefulness. If Luna fails, Terra is tested once; gist mode is not released if both fail.
- Final acceptance requires the full unit, integration, typecheck, lint, and build suite; a manual live smoke test for every supported source family is documented separately because publisher pages change and some require institutional access.
- Beta success requires at least 90% of eligible attempts to receive the chosen filename or documented safe fallback, and at least eight of 25 testers to retain citation-plus-gist after two weeks.

## Out of Scope

- Safari, Firefox-specific packaging, and mobile browsers.
- Renaming existing local files or watching the Downloads directory.
- Reading the first pages or full text of a PDF, OCR, and whole-paper summarization.
- Zotero, Mendeley, Paperpile, citation-manager, folder, and cloud-drive integrations.
- A searchable library, download history, duplicate detection, or folder organization.
- Automatic guessing from arbitrary direct PDF URLs, first-page PDF parsing, OCR, and server-side publisher/repository crawling.
- ResearchGate extraction or automation without written permission from ResearchGate.
- Accounts, payments, subscriptions, licenses, custom templates, custom prompts, and paid quotas.
- Public Chrome Web Store launch, trademark registration, and production marketing assets beyond beta requirements.

## Further Notes

- The MVP is deliberately a two-week, non-revenue beta. Pricing and paid customization will be explored separately after the core renaming experience is validated.
- The model provider does not use API inputs for training by default, but standard abuse-monitoring logs may retain customer content for up to 30 days. Consent and privacy copy must state that accurately.
- Chrome controls filename conflict behavior. Papername must not request filesystem access merely to customize collisions.
- Local generic metadata extraction, Google Scholar result capture, and narrow route recovery add no per-request API or LLM cost. Required all-site access creates a stronger Chrome install warning and higher disclosure/review burden. Institutional customizations, paywalls, anti-bot systems, session-bound or opaque redirects, scanned PDFs, and missing metadata prevent literal universality; those cases must remain unchanged with an actionable explanation.
- `Papername` had no obvious conflicting academic-PDF product in the initial market search; formal trademark clearance remains necessary before a paid public launch.
- Local implementation and automated verification are complete. Production deployment, model evaluation, live publisher smoke checks, private-store review, and the two-week tester measurement require external accounts, credentials, access, or human judgment and remain release gates rather than code tasks.
