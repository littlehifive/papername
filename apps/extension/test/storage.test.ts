import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionData = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));

vi.mock("wxt/browser", () => ({
  browser: {
    storage: {
      session: {
        get: vi.fn(async () => ({ ...sessionData.value })),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete sessionData.value[key];
          }
        }),
      },
      local: {},
    },
  },
}));

import { removeContextsForOrigin } from "../src/storage";

describe("article context removal", () => {
  beforeEach(() => {
    sessionData.value = {
      "articleContext:1": {
        tabId: 1,
        pageUrl: "https://repository.example.edu/item/1",
      },
      "articleContext:2": {
        tabId: 2,
        pageUrl: "https://repository.example.edu/item/2",
      },
      "articleContext:3": {
        tabId: 3,
        pageUrl: "https://other.example.edu/item/3",
      },
    };
  });

  it("removes every tab context for a revoked exact origin", async () => {
    await removeContextsForOrigin("https://repository.example.edu/*");

    expect(Object.keys(sessionData.value)).toEqual(["articleContext:3"]);
  });
});
