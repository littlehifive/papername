import { describe, expect, it } from "vitest";

import { siteAccessForUrl } from "../src/site-access";

describe("site access", () => {
  it("reports built-in sources as automatic", () => {
    expect(
      siteAccessForUrl("https://www.nature.com/articles/example", []),
    ).toMatchObject({
      mode: "automatic",
      sourceName: "Nature",
      originPattern: "https://www.nature.com/*",
      directPdf: false,
    });
  });

  it("offers one-time or remembered access for an arbitrary article site", () => {
    expect(
      siteAccessForUrl("https://repository.example.edu/items/123", []),
    ).toEqual({
      mode: "available",
      hostname: "repository.example.edu",
      originPattern: "https://repository.example.edu/*",
      directPdf: false,
    });
    expect(
      siteAccessForUrl("https://repository.example.edu/items/123", [
        "https://repository.example.edu/*",
      ]),
    ).toMatchObject({ mode: "remembered" });
  });

  it("flags direct PDFs and rejects browser-internal pages", () => {
    expect(
      siteAccessForUrl(
        "https://eprints.example.edu/123/1/paper.pdf?download=1",
        [],
      ),
    ).toMatchObject({ mode: "available", directPdf: true });
    expect(siteAccessForUrl("chrome://extensions", [])).toEqual({
      mode: "unavailable",
      directPdf: false,
    });
  });

  it("does not guess that an extensionless Digital Commons delivery route is recoverable", () => {
    expect(
      siteAccessForUrl(
        "https://repository.example.edu/cgi/viewcontent.cgi?article=12&context=psych",
        [],
      ),
    ).toMatchObject({ mode: "available", directPdf: false });
  });

  it("blocks ResearchGate access because its terms prohibit browser add-ons", () => {
    expect(
      siteAccessForUrl("https://www.researchgate.net/publication/1", []),
    ).toEqual({
      mode: "blocked",
      hostname: "www.researchgate.net",
      directPdf: false,
      reason: "site_terms",
    });
  });
});
