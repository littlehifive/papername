# Papername

Turn filenames like `1c96203b55c6.pdf` into `Wu et al. (2026).pdf`.

Papername is a Chrome/Chromium extension that automatically renames academic PDF downloads using citation metadata, paper titles, or a concise AI-generated key takeaway. Citation and title naming is free and local. Key takeaways run on prepaid names: every install gets 10 free, and gift or purchase keys add more. The MVP consists of a Manifest V3 extension and a Cloudflare Worker that keeps only hashed tokens and balances.

See [the product requirements](docs/PRD.md) for the complete behavior and beta acceptance criteria, [supported sites](docs/SUPPORTED_SITES.md) for the current coverage model, and [the beta runbook](docs/BETA_RUNBOOK.md) for deployment and live verification.

## Development

Prerequisites: Node.js 22+, pnpm 10+, and (for deployed gist generation) Cloudflare and OpenAI accounts.

```sh
pnpm install
pnpm check
pnpm dev:worker
pnpm dev:extension
```

Load `apps/extension/.output/chrome-mv3` from `chrome://extensions` after running the extension dev server or build.

Citation and title naming works without a backend. Copy the provided `.dev.vars.example` and extension `.env.production.example` files only when configuring hosted key-takeaway generation. Design decisions for the credit model live in `docs/adr/`.

Papername works automatically on HTTP(S) article pages after Chrome's install-time site-access prompt is accepted. It reads academic citation metadata locally; deterministic citation/title naming uses no backend. Google Scholar side-PDF clicks can provide the visible result title, author, year, and selected target URL, including many university proxy links. ResearchGate is deliberately excluded. Users can restrict or disable page access at any time through Chrome's extension **Site access** controls, with the tradeoff that automatic naming will then work only on allowed sites.
