# Papername Beta Runbook

This runbook takes the repository from a clean checkout to a private Chrome beta. Commands are run from the repository root unless noted otherwise.

## 1. Verify locally

Install Node.js 22+ and pnpm 10, then install the bundled Chromium once and run the acceptance suite:

```sh
pnpm install
pnpm exec playwright install chromium
pnpm check
```

The Playwright suite verifies that publisher-page metadata reaches the service worker, the Chrome filename hook is registered, the generic-access permissions are packaged, and invite/consent settings are visible and persisted through the real popup. Chromium automation does not deliver `onDeterminingFilename` in the same way as an ordinary Chrome profile and replaces physical download names with artifact GUIDs, so filename decisions are covered at the exported decision seam and the final on-disk basename is confirmed in the live smoke test below.

## 2. Configure the Worker

Authenticate Wrangler and create the production D1 database:

```sh
pnpm --filter @papername/worker exec wrangler login
pnpm --filter @papername/worker exec wrangler d1 create papername-beta
```

Copy the returned database ID into `apps/worker/wrangler.toml`. Replace the placeholder extension origin after Chrome assigns the private-listing extension ID. Set the model credential and apply migrations:

```sh
pnpm --filter @papername/worker exec wrangler secret put OPENAI_API_KEY
pnpm --filter @papername/worker exec wrangler d1 migrations apply papername-beta --remote
pnpm --filter @papername/worker exec wrangler deploy
```

For local development, copy `apps/worker/.dev.vars.example` to `apps/worker/.dev.vars`, insert a development key, and run `pnpm dev:worker`. Never commit that file.

## 3. Issue beta invites

Generate one code per tester. The generated SQL contains plaintext codes in comments, so store it outside source control and treat it as a secret:

```sh
pnpm --filter @papername/worker --silent invites 25 > invites-beta.sql
pnpm --filter @papername/worker exec wrangler d1 execute papername-beta --remote --file invites-beta.sql
```

Send each tester a different code. An activation atomically marks a code used and returns a random bearer token; neither plaintext value is stored in D1.

## 4. Package the extension

Copy `apps/extension/.env.production.example` to `apps/extension/.env.production`, set the deployed Worker URL, and build the upload zip:

```sh
pnpm --filter @papername/extension zip
```

Upload the zip from `apps/extension/.output` to the Chrome Web Store dashboard. Use a private distribution restricted to the 25 tester accounts, the name **Papername BETA**, and the disclosure **THIS EXTENSION IS FOR BETA TESTING**. The listing and pre-install tester instructions must explain that automatic cross-publisher naming requires Chrome's broad HTTP(S) site-access warning, that bibliographic metadata is processed locally, and that users can narrow access through Chrome's Site access controls. Link the packaged privacy page or publish equivalent privacy text at a stable URL. Do not claim that a paid tier, pricing, or checkout is available; the popup only offers an “I'd buy you a coffee” encouragement signal.

## 5. Live smoke matrix

Use an ordinary Chrome profile with no other download-renaming extension. For each row, open an article page, download its main PDF, verify the on-disk name for every deterministic preset, and ensure a supplement remains unchanged. Record paywall or institutional-access blockers rather than bypassing them.

| Source               | Article page checked | Main PDF renamed | Supplement unchanged | Notes/date  |
| -------------------- | -------------------- | ---------------- | -------------------- | ----------- |
| JSTOR                | ☐                    | ☐                | ☐                    |             |
| ScienceDirect        | ☐                    | ☐                | ☐                    |             |
| SpringerLink         | ☐                    | ☐                | ☐                    |             |
| Nature               | ☐                    | ☐                | ☐                    |             |
| Wiley Online Library | ☐                    | ☐                | ☐                    |             |
| SAGE Journals        | ☐                    | ☐                | ☐                    |             |
| Taylor & Francis     | ☐                    | ☐                | ☐                    |             |
| APA PsycNet          | ☐                    | ☐                | ☐                    |             |
| PubMed / PMC         | ☐                    | ☐                | ☐                    |             |
| arXiv                | ☐                    | ☐                | ☐                    |             |
| ACM Digital Library  | ☐                    | ☐                | ☐                    |             |
| IEEE Xplore          | ☐                    | ☐                | ☐                    |             |
| OSF / OSF Preprints  | ☐                    | ☐                | ☐                    |             |
| SSRN article page    | ☐                    | ☐                | ☐                    | In-tab only |
| Glasgow Enlighten    | ☐                    | ☐                | ☐                    |             |
| Digital Commons      | ☐                    | ☐                | ☐                    |             |
| DSpace               | ☐                    | ☐                | ☐                    |             |
| bioRxiv / medRxiv    | ☐                    | ☐                | ☐                    |             |
| ChemRxiv             | ☐                    | ☐                | ☐                    |             |
| Zenodo / Figshare    | ☐                    | ☐                | ☐                    |             |
| HAL                  | ☐                    | ☐                | ☐                    |             |
| Research Square      | ☐                    | ☐                | ☐                    |             |

On first install or this permission-changing update, confirm Chrome displays the broad website-access warning and that the tester has explicitly accepted it. For an unlisted metadata-rich repository origin, load the article page, reload it, and confirm automatic naming works both times without opening Papername. Then set Papername's Chrome Site access to **On click** or a restricted site and verify automatic naming is correspondingly limited; restore **On all sites** for the remaining matrix.

On Google Scholar, activate a side `[PDF]` link routed through a university proxy and confirm the filename uses the visible result's author and year. Record whether the proxy preserves the selected URL; session-bound or opaque redirects are an expected limit. On both `https://arxiv.org/pdf/2609.03012` and `https://eprints.gla.ac.uk/243676/1/243676.pdf`, invoke **Find article metadata**, then save the PDF and confirm the citation filename. Confirm an unknown direct-PDF route explains that the article page is required. Confirm ResearchGate shows the policy exclusion and offers no access action.

Also verify disabled mode, duplicate-name uniquifying, Save As behavior (including Adobe Acrobat's Chrome PDF viewer when installed), missing abstract fallback, invalid invite, exhausted quota, provider outage, explicit gist consent, and telemetry opt-out.

## 6. Operate the two-week beta

Review only aggregate telemetry counters:

```sql
SELECT day, preset, outcome, reason, latency_bucket, SUM(count) AS attempts
FROM telemetry_counters
GROUP BY day, preset, outcome, reason, latency_bucket
ORDER BY day;
```

Do not enable request-body logging. Collect qualitative reports through the popup feedback link. Continue only if at least 90% of eligible attempts are renamed or receive a documented safe fallback and at least 8 of 25 testers retain citation-plus-gist after two weeks.

Before enabling gist mode for testers, run the 60-case evaluation described in `evals/README.md`; it requires an OpenAI key and human ratings. Gist mode must remain unreleased if neither configured candidate model meets the PRD thresholds.
