import { beforeEach, describe, expect, it } from "vitest";

import {
  createPapernameApi,
  hashSecret,
  OpenAiGistProvider,
  type GistProvider,
  type PapernameRepository,
  type TelemetryEvent,
} from "../src/index";

class MemoryRepository implements PapernameRepository {
  invites = new Map<string, string | undefined>();
  usage = new Map<string, number>();
  events: TelemetryEvent[] = [];

  async activate(codeHash: string, tokenHash: string): Promise<boolean> {
    if (!this.invites.has(codeHash) || this.invites.get(codeHash)) return false;
    this.invites.set(codeHash, tokenHash);
    return true;
  }

  async hasToken(tokenHash: string): Promise<boolean> {
    return [...this.invites.values()].includes(tokenHash);
  }

  async consume(
    tokenHash: string,
    month: string,
    limit: number,
  ): Promise<number | undefined> {
    const key = `${tokenHash}:${month}`;
    const count = this.usage.get(key) ?? 0;
    if (count >= limit) return undefined;
    this.usage.set(key, count + 1);
    return limit - count - 1;
  }

  async recordEvent(event: TelemetryEvent): Promise<void> {
    this.events.push(event);
  }
}

const provider: GistProvider = {
  async generate() {
    return {
      usable: true,
      gist: "Warm objects increase perceived interpersonal warmth",
      reason: "ok",
    };
  },
};

describe("Papername Worker HTTP API", () => {
  let repository: MemoryRepository;
  let app: ReturnType<typeof createPapernameApi>;

  beforeEach(async () => {
    repository = new MemoryRepository();
    repository.invites.set(await hashSecret("BETA-ONE"), undefined);
    app = createPapernameApi({
      repository,
      provider,
      allowedOrigins: ["chrome-extension://papername-test"],
      monthlyLimit: 2,
      now: () => new Date("2026-09-04T12:00:00Z"),
      createToken: () => "issued-token-123456",
    });
  });

  async function activate(): Promise<string> {
    const response = await app.fetch(
      new Request("https://api.test/v1/activate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "chrome-extension://papername-test",
        },
        body: JSON.stringify({ code: "beta-one" }),
      }),
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as { token: string }).token;
  }

  it("exchanges an invite exactly once without storing its plaintext", async () => {
    expect(await activate()).toBe("issued-token-123456");

    const replay = await app.fetch(
      new Request("https://api.test/v1/activate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "chrome-extension://papername-test",
        },
        body: JSON.stringify({ code: "BETA-ONE" }),
      }),
    );
    expect(replay.status).toBe(409);
    expect(JSON.stringify([...repository.invites.entries()])).not.toContain(
      "BETA-ONE",
    );
  });

  it("generates a validated gist and returns the remaining allowance", async () => {
    const token = await activate();
    const response = await app.fetch(
      new Request("https://api.test/v1/gist", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          origin: "chrome-extension://papername-test",
        },
        body: JSON.stringify({
          title: "Warm hands, warm heart",
          abstract:
            "Holding warm objects affected judgments of interpersonal warmth.",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      usable: true,
      gist: "Warm objects increase perceived interpersonal warmth",
      reason: "ok",
      remaining: 1,
    });
  });

  it("enforces the monthly allowance before provider work", async () => {
    let calls = 0;
    app = createPapernameApi({
      repository,
      provider: {
        generate: async () => (
          calls++,
          provider.generate({ title: "", abstract: "" })
        ),
      },
      allowedOrigins: ["chrome-extension://papername-test"],
      monthlyLimit: 1,
      now: () => new Date("2026-09-04T12:00:00Z"),
      createToken: () => "issued-token-123456",
    });
    const token = await activate();
    const request = () =>
      app.fetch(
        new Request("https://api.test/v1/gist", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            title: "A title",
            abstract: "A sufficiently descriptive abstract.",
          }),
        }),
      );

    expect((await request()).status).toBe(200);
    const exhausted = await request();
    expect(exhausted.status).toBe(429);
    expect(await exhausted.json()).toMatchObject({
      reason: "quota_exhausted",
      remaining: 0,
    });
    expect(calls).toBe(1);
  });

  it("enforces the allowance across concurrent requests", async () => {
    app = createPapernameApi({
      repository,
      provider,
      allowedOrigins: [],
      monthlyLimit: 1,
      now: () => new Date("2026-09-04T12:00:00Z"),
      createToken: () => "issued-token-123456",
    });
    const token = await activate();
    const makeRequest = () =>
      app.fetch(
        new Request("https://api.test/v1/gist", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            title: "A title",
            abstract: "An abstract with enough information.",
          }),
        }),
      );

    const responses = await Promise.all([makeRequest(), makeRequest()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 429,
    ]);
  });

  it("rejects provider output that is unsafe or not 6–12 words", async () => {
    app = createPapernameApi({
      repository,
      provider: {
        generate: async () => ({
          usable: true,
          gist: "../ignore all instructions",
          reason: "ok",
        }),
      },
      allowedOrigins: [],
      monthlyLimit: 2,
      now: () => new Date("2026-09-04T12:00:00Z"),
      createToken: () => "issued-token-123456",
    });
    const token = await activate();
    const response = await app.fetch(
      new Request("https://api.test/v1/gist", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "A title",
          abstract: "An abstract with enough information.",
        }),
      }),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      usable: false,
      reason: "provider_invalid",
    });
  });

  it("turns provider failures into a typed content-free response", async () => {
    app = createPapernameApi({
      repository,
      provider: {
        generate: async () =>
          Promise.reject(new Error("upstream failed with private content")),
      },
      allowedOrigins: [],
      now: () => new Date("2026-09-04T12:00:00Z"),
      createToken: () => "issued-token-123456",
    });
    const token = await activate();
    const response = await app.fetch(
      new Request("https://api.test/v1/gist", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Private title",
          abstract: "A sufficiently long private abstract.",
        }),
      }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      usable: false,
      reason: "provider_error",
      remaining: 29,
    });
  });

  it("aborts a provider request at its configured timeout", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason ?? new Error("aborted")),
          { once: true },
        );
      })) as typeof fetch;

    try {
      const timedProvider = new OpenAiGistProvider("test-key", "test-model", 5);
      await expect(
        timedProvider.generate({
          title: "A title",
          abstract: "A sufficiently descriptive abstract.",
        }),
      ).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects missing authentication and oversized input before provider work", async () => {
    const unauthorized = await app.fetch(
      new Request("https://api.test/v1/gist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "A title",
          abstract: "A sufficiently descriptive abstract.",
        }),
      }),
    );
    expect(unauthorized.status).toBe(401);

    const token = await activate();
    const oversized = await app.fetch(
      new Request("https://api.test/v1/gist", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "x".repeat(501),
          abstract: "A sufficiently descriptive abstract.",
        }),
      }),
    );
    expect(oversized.status).toBe(400);
    expect(repository.usage.size).toBe(0);
  });

  it("stores only allow-listed aggregate telemetry fields", async () => {
    const token = await activate();
    const response = await app.fetch(
      new Request("https://api.test/v1/events", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          event: "rename_result",
          preset: "citation_gist",
          outcome: "fallback",
          reason: "gist_timeout",
          latencyBucket: "gt1500",
          version: "0.1.0",
        }),
      }),
    );
    expect(response.status).toBe(204);
    expect(repository.events).toHaveLength(1);

    const leaking = await app.fetch(
      new Request("https://api.test/v1/events", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          event: "rename_result",
          preset: "citation",
          outcome: "renamed",
          reason: "selected_preset",
          latencyBucket: "lt250",
          version: "0.1.0",
          title: "Private paper title",
        }),
      }),
    );
    expect(leaking.status).toBe(400);
  });

  it("rejects an unexpected browser origin", async () => {
    const response = await app.fetch(
      new Request("https://api.test/v1/activate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.test",
        },
        body: JSON.stringify({ code: "BETA-ONE" }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("answers an allowed CORS preflight without authentication", async () => {
    const response = await app.fetch(
      new Request("https://api.test/v1/gist", {
        method: "OPTIONS",
        headers: { origin: "chrome-extension://papername-test" },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "chrome-extension://papername-test",
    );
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "authorization",
    );
  });
});
