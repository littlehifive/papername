import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { isToastPayload, renderToast, toastText } from "../src/toast";

describe("page toast", () => {
  it("describes each naming state in plain words", () => {
    expect(toastText({ type: "papername:toast", state: "preparing" })).toBe(
      "Preparing key takeaway…",
    );
    expect(
      toastText({
        type: "papername:toast",
        state: "named",
        filename: "Wu et al. (2026) — Warm compresses reduce soreness.pdf",
        remaining: 250,
      }),
    ).toBe("Named: Wu et al. (2026) — Warm compresses reduce soreness.pdf");
    expect(
      toastText({
        type: "papername:toast",
        state: "named",
        filename: "Wu et al. (2026) — Warm compresses reduce soreness.pdf",
        remaining: 3,
      }),
    ).toBe(
      "Named: Wu et al. (2026) — Warm compresses reduce soreness.pdf · 3 names left",
    );
  });

  it.each([
    ["missing_abstract", "No abstract on this page, used the title instead"],
    ["quota_exhausted", "Out of names, used the title instead · No names left"],
    ["gist_timeout", "Takeaway took too long, used the title instead"],
    ["invalid_gist", "Takeaway unavailable, used the title instead"],
  ])("explains the %s fallback", (reason, expected) => {
    expect(
      toastText({
        type: "papername:toast",
        state: "fallback",
        reason,
        ...(reason === "quota_exhausted" ? { remaining: 0 } : {}),
      }),
    ).toBe(expected);
  });

  it("renders inside a shadow root and updates in place", () => {
    const window = new Window({ url: "https://publisher.test/article" });
    const document = window.document as unknown as Document;
    document.write("<body><p>Article</p></body>");

    renderToast(document, { type: "papername:toast", state: "preparing" });
    const host = document.querySelector("papername-toast");
    expect(host?.shadowRoot?.querySelector(".text")?.textContent).toBe(
      "Preparing key takeaway…",
    );

    renderToast(document, {
      type: "papername:toast",
      state: "fallback",
      reason: "gist_timeout",
    });
    expect(document.querySelectorAll("papername-toast")).toHaveLength(1);
    const toast = host?.shadowRoot?.querySelector<HTMLElement>(".toast");
    expect(toast?.dataset.state).toBe("fallback");
    expect(toast?.dataset.visible).toBe("true");
    expect(host?.shadowRoot?.querySelector(".text")?.textContent).toBe(
      "Takeaway took too long, used the title instead",
    );
  });

  it("recognizes only toast payloads", () => {
    expect(
      isToastPayload({ type: "papername:toast", state: "preparing" }),
    ).toBe(true);
    expect(isToastPayload({ type: "papername:context" })).toBe(false);
  });
});
