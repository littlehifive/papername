import { describe, expect, it } from "vitest";

import { hasValidGistShape, usesTakeaway } from "../src/index";

describe("key takeaway shape", () => {
  it.each([
    "Vitamin D does not reduce colds",
    "Childhood violence shapes later health",
    "Corridors increase pollinator visits but not seed production overall",
  ])("accepts a 4–10 word claim: %s", (value) => {
    expect(hasValidGistShape(value)).toBe(true);
  });

  it.each([
    ["too short", "Vitamin D colds"],
    [
      "too long",
      "Vitamin D supplementation did not reduce laboratory confirmed winter colds in adults",
    ],
    ["terminal punctuation", "Vitamin D does not reduce colds."],
    ["path punctuation", "Vitamin D: no effect on colds"],
    ["control characters", "Vitamin D\u0007 does not reduce colds"],
    ["blank", "   "],
  ])("rejects %s", (_label, value) => {
    expect(hasValidGistShape(value)).toBe(false);
  });

  it("identifies the presets that need a hosted takeaway", () => {
    expect(usesTakeaway("citation_gist")).toBe(true);
    expect(usesTakeaway("gist")).toBe(true);
    expect(usesTakeaway("citation")).toBe(false);
    expect(usesTakeaway("title")).toBe(false);
  });
});
