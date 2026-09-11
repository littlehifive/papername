import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { googleScholarContextForLink } from "../src/google-scholar";

function scholarPage(html: string): Document {
  const window = new Window({
    url: "https://scholar.google.com/scholar?q=human+agency",
  });
  window.document.write(html);
  return window.document as unknown as Document;
}

describe("Google Scholar result context", () => {
  it("captures title, authors, year, and a proxied PDF target from the clicked result", () => {
    const document = scholarPage(`
      <div class="gs_r gs_or gs_scl">
        <div class="gs_ggs gs_fl"><div class="gs_ggsd"><div class="gs_or_ggsm">
          <a id="pdf" href="https://link-springer-com.proxy.library.edu/content/pdf/10.1007/example.pdf">[PDF] springer.com</a>
        </div></div></div>
        <div class="gs_ri">
          <h3 class="gs_rt"><a>Subjective quantitative studies of human agency</a></h3>
          <div class="gs_a">S Alkire - Social indicators research, 2005 - Springer</div>
          <div class="gs_rs">Can we measure expansions in agency?</div>
        </div>
      </div>
    `);
    const link = document.querySelector<HTMLAnchorElement>("#pdf")!;

    expect(googleScholarContextForLink(link, document.URL)).toEqual({
      type: "papername:context",
      pageUrl: "https://scholar.google.com/scholar?q=human+agency",
      metadata: {
        title: "Subjective quantitative studies of human agency",
        authors: [{ name: "S Alkire", familyName: "Alkire" }],
        year: "2005",
        identifiers: { doi: "10.1007/example" },
        pdfUrls: [
          "https://link-springer-com.proxy.library.edu/content/pdf/10.1007/example.pdf",
        ],
        sourceAdapter: "google-scholar",
      },
    });
  });

  it("ignores ordinary result links and does not treat the search snippet as an abstract", () => {
    const document = scholarPage(`
      <div class="gs_r gs_or gs_scl">
        <h3 class="gs_rt"><a id="title" href="https://example.com/article">A paper title</a></h3>
        <div class="gs_a">J Wu, A Smith - Example Journal, 2026 - Publisher</div>
        <div class="gs_rs">A truncated search-result fragment...</div>
      </div>
    `);

    expect(
      googleScholarContextForLink(
        document.querySelector<HTMLAnchorElement>("#title")!,
        document.URL,
      ),
    ).toBeUndefined();
  });

  it("rejects lookalike hosts outside Google's Scholar domains", () => {
    const document = scholarPage(`
      <div class="gs_r"><div class="gs_or_ggsm">
        <a id="pdf" href="https://example.com/paper.pdf">[PDF] example.com</a>
      </div><h3 class="gs_rt">A paper title</h3><div class="gs_a">J Wu - 2026</div></div>
    `);
    const link = document.querySelector<HTMLAnchorElement>("#pdf")!;

    expect(
      googleScholarContextForLink(link, "https://scholar.google.evil.com/"),
    ).toBeUndefined();
    expect(
      googleScholarContextForLink(link, "https://scholar.google.co.uk/"),
    ).toBeDefined();
  });

  it("captures a PDF opened from a localized Scholar citation detail page", () => {
    const window = new Window({
      url: "https://scholar.google.com/citations?view_op=view_citation&hl=zh-CN&user=USNXsZEAAAAJ&citation_for_view=USNXsZEAAAAJ:fPk4N6BV_jEC",
    });
    window.document.write(`
      <div id="gsc_oci_title_wrapper">
        <div id="gsc_oci_title_gg">
          <div class="gsc_oci_title_ggi">
            <a id="pdf" href="https://spssi.onlinelibrary.wiley.com/doi/pdfdirect/10.1111/josi.12415">
              <span class="gsc_vcd_title_ggt">[PDF]</span> 来自 wiley.com
            </a>
          </div>
          <div class="gsc_oci_title_ggi">
            <a href="https://spssi.onlinelibrary.wiley.com/doi/full/10.1111/josi.12415">Full View</a>
          </div>
        </div>
        <div id="gsc_oci_title">
          <a class="gsc_oci_title_link" href="https://spssi.onlinelibrary.wiley.com/doi/abs/10.1111/josi.12415">
            A meta-analysis of the effect of values affirmation on academic achievement
          </a>
        </div>
      </div>
      <div id="gsc_oci_table">
        <div class="gs_scl"><div class="gsc_oci_field">作者</div><div class="gsc_oci_value">Zezhen Wu, Thees F Spreckelsen, Geoffrey L Cohen</div></div>
        <div class="gs_scl"><div class="gsc_oci_field">发表日期</div><div class="gsc_oci_value">2021/1/14</div></div>
        <div class="gs_scl"><div class="gsc_oci_field">期刊</div><div class="gsc_oci_value">Journal of Social Issues</div></div>
        <div class="gs_scl"><div class="gsc_oci_field">简介</div><div class="gsc_oci_value" id="gsc_oci_descr">Study abstract.</div></div>
      </div>
    `);
    const document = window.document as unknown as Document;
    const link = document.querySelector<HTMLAnchorElement>("#pdf")!;

    expect(googleScholarContextForLink(link, document.URL)).toEqual({
      type: "papername:context",
      pageUrl: document.URL,
      metadata: {
        title:
          "A meta-analysis of the effect of values affirmation on academic achievement",
        authors: [
          { name: "Zezhen Wu", familyName: "Wu" },
          { name: "Thees F Spreckelsen", familyName: "Spreckelsen" },
          { name: "Geoffrey L Cohen", familyName: "Cohen" },
        ],
        year: "2021",
        abstract: "Study abstract.",
        identifiers: { doi: "10.1111/josi.12415" },
        pdfUrls: [
          "https://spssi.onlinelibrary.wiley.com/doi/pdfdirect/10.1111/josi.12415",
        ],
        sourceAdapter: "google-scholar",
      },
    });
  });
});
