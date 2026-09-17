# Papername

Turn filenames like `1c96203b55c6.pdf` into `Wu et al. (2026).pdf`.

Papername is a Chrome/Chromium extension that automatically renames academic PDF downloads from the citation metadata on the article page you download them from. Choose **Authors & year**, **Authors, year & title**, or arrange your own format from authors, year, title, and fixed text. Everything runs locally in the browser: there is no server, no account, and no paper content leaves your machine.

See [the product requirements](docs/PRD.md) for the complete behavior and [supported sites](docs/SUPPORTED_SITES.md) for the current coverage model.

## Development

Prerequisites: Node.js 22+ and pnpm 10+.

```sh
pnpm install
pnpm exec playwright install chromium   # once, for the end-to-end suite
pnpm check
pnpm dev:extension
```

Load `apps/extension/.output/chrome-mv3` from `chrome://extensions` after running the extension dev server or build.

Papername works automatically on HTTP(S) article pages after Chrome's install-time site-access prompt is accepted. It reads academic citation metadata locally. Google Scholar side-PDF clicks can provide the visible result title, author, year, and selected target URL, including many university proxy links. ResearchGate is deliberately excluded. Users can restrict or disable page access at any time through Chrome's extension **Site access** controls, with the tradeoff that automatic naming will then work only on allowed sites.

## Package for the Chrome Web Store

```sh
pnpm --filter @papername/extension zip
```

Upload the zip from `apps/extension/.output` to the Chrome Web Store dashboard. The listing must explain that automatic cross-publisher naming requires Chrome's broad HTTP(S) site-access warning, that bibliographic metadata is processed locally, and that users can narrow access through Chrome's Site access controls. Link the packaged privacy page (`privacy.html`) or publish equivalent privacy text at a stable URL.

Before uploading, replace the placeholder Ko-fi URL in `apps/extension/entrypoints/popup/index.html` with the real support page.
