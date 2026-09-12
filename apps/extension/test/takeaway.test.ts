import { afterEach, describe, expect, it, vi } from "vitest";

import type { ArticleContext } from "@papername/core";

import {
  clearPendingTakeaways,
  pendingTakeaway,
  startTakeaway,
} from "../src/takeaway";

const context: ArticleContext = {
  metadata: {
    title: "Warm hands, warm heart",
    authors: [{ name: "Lawrence Williams", familyName: "Williams" }],
    year: "2008",
    abstract: "Holding warm objects led to warmer interpersonal judgments.",
    identifiers: {},
    pdfUrls: ["https://publisher.test/main.pdf"],
  },
  pageUrl: "https://publisher.test/article",
  capturedAt: 1,
  tabId: 4,
};

describe("press-started takeaway requests", () => {
  afterEach(() => clearPendingTakeaways());

  it("starts one request per tab and page, then remembers a valid answer", async () => {
    const request = vi.fn().mockResolvedValue({
      usable: true,
      gist: "Warm objects increase perceived interpersonal warmth",
      reason: "ok",
      remaining: 9,
    });
    const remember = vi.fn().mockResolvedValue(undefined);

    const first = startTakeaway({ context, request, remember, now: () => 100 });
    const second = startTakeaway({
      context,
      request,
      remember,
      now: () => 200,
    });
    expect(second).toBe(first);
    expect(first.startedAt).toBe(100);
    expect(pendingTakeaway(context)).toBe(first);
    expect(request).toHaveBeenCalledTimes(1);

    await first.promise;
    await vi.waitFor(() => expect(remember).toHaveBeenCalledTimes(1));
    expect(remember).toHaveBeenCalledWith(
      context,
      "Warm objects increase perceived interpersonal warmth",
    );
    await vi.waitFor(() => expect(pendingTakeaway(context)).toBeUndefined());
  });

  it("does not remember an unusable or author-repeating answer", async () => {
    const remember = vi.fn().mockResolvedValue(undefined);
    const entry = startTakeaway({
      context,
      request: async () => ({
        usable: true,
        gist: "Williams shows warm objects increase perceived warmth",
        reason: "ok",
        remaining: 9,
      }),
      remember,
    });
    await entry.promise;
    await vi.waitFor(() => expect(pendingTakeaway(context)).toBeUndefined());
    expect(remember).not.toHaveBeenCalled();
  });

  it("clears a failed request so the filename hook can try again", async () => {
    const entry = startTakeaway({
      context,
      request: async () => Promise.reject(new Error("offline")),
      remember: async () => undefined,
    });
    await entry.promise.catch(() => undefined);
    await vi.waitFor(() => expect(pendingTakeaway(context)).toBeUndefined());
  });
});
