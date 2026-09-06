import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";

import { publishPageContext } from "../src/page-capture";

describe("page context publishing", () => {
  it("publishes extracted paper metadata through the extension message seam", async () => {
    const window = new Window({ url: "https://repository.example.edu/123/" });
    window.document.write(`
      <meta name="citation_title" content="A repository paper">
      <meta name="citation_author" content="Jane Wu">
      <meta name="citation_date" content="2026">
      <meta name="citation_pdf_url" content="/123/paper.pdf">
    `);
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await expect(
      publishPageContext(
        window.document as unknown as Document,
        window.location.href,
        sendMessage,
      ),
    ).resolves.toBe(true);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "papername:context",
      pageUrl: "https://repository.example.edu/123/",
      metadata: expect.objectContaining({
        title: "A repository paper",
        authors: [expect.objectContaining({ familyName: "Wu" })],
        pdfUrls: ["https://repository.example.edu/123/paper.pdf"],
      }),
    });
  });

  it("does not send a context for a page without scholarly metadata", async () => {
    const window = new Window({ url: "https://example.edu/" });
    window.document.write("<title>University homepage</title>");
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await expect(
      publishPageContext(
        window.document as unknown as Document,
        window.location.href,
        sendMessage,
      ),
    ).resolves.toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
