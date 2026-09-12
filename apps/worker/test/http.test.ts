import { beforeEach, describe, expect, it } from "vitest";

import {
  createPapernameApi,
  hashSecret,
  OpenAiGistProvider,
  type GistProvider,
  type KeyRedemption,
  type PapernameRepository,
  type TelemetryEvent,
} from "../src/index";

interface StoredKey {
  kind: "gift" | "purchase";
  credits: number;
  redeemedBy?: string;
  claimId?: string;
}

class MemoryRepository implements PapernameRepository {
  installs = new Map<string, number>();
  keys = new Map<string, StoredKey>();
  events: TelemetryEvent[] = [];

  async register(tokenHash: string, credits: number): Promise<void> {
    this.installs.set(tokenHash, credits);
  }

  async hasToken(tokenHash: string): Promise<boolean> {
    return this.installs.has(tokenHash);
  }

  async consume(tokenHash: string): Promise<number | undefined> {
    const credits = this.installs.get(tokenHash) ?? 0;
    if (credits <= 0) return undefined;
    this.installs.set(tokenHash, credits - 1);
    return credits - 1;
  }

  async refund(tokenHash: string): Promise<number> {
    const credits = (this.installs.get(tokenHash) ?? 0) + 1;
    this.installs.set(tokenHash, credits);
    return credits;
  }

  async redeemGiftKey(
    keyHash: string,
    tokenHash: string,
    _redeemedAt: string,
    claimId: string,
  ): Promise<KeyRedemption> {
    const key = this.keys.get(keyHash);
    if (!key || key.kind !== "gift") return { status: "unknown" };
    if (key.redeemedBy) return { status: "used" };
    key.redeemedBy = tokenHash;
    key.claimId = claimId;
    const credits = (this.installs.get(tokenHash) ?? 0) + key.credits;
    this.installs.set(tokenHash, credits);
    return { status: "redeemed", credits, added: key.credits };
  }

  async recordPurchase(
    keyHash: string,
    credits: number,
    tokenHash: string,
    _redeemedAt: string,
    claimId: string,
  ): Promise<KeyRedemption> {
    if (this.keys.has(keyHash)) return { status: "used" };
    this.keys.set(keyHash, {
      kind: "purchase",
      credits,
      redeemedBy: tokenHash,
      claimId,
    });
    const balance = (this.installs.get(tokenHash) ?? 0) + credits;
    this.installs.set(tokenHash, balance);
    return { status: "redeemed", credits: balance, added: credits };
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

const ORIGIN = "chrome-extension://papername-test";
const TOKEN = "issued-token-123456";

function jsonRequest(
  path: string,
  body: unknown,
  token?: string,
  origin: string | undefined = ORIGIN,
): Request {
  return new Request(`https://api.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const gistBody = {
  title: "Warm hands, warm heart",
  abstract: "Holding warm objects affected judgments of interpersonal warmth.",
};

describe("Papername Worker HTTP API", () => {
  let repository: MemoryRepository;
  let app: ReturnType<typeof createPapernameApi>;
  let clock: Date;
  const tokens = [TOKEN, "claim-id-000000000001", "claim-id-000000000002"];
  let tokenIndex: number;

  function build(
    overrides: Partial<Parameters<typeof createPapernameApi>[0]> = {},
  ) {
    tokenIndex = 0;
    return createPapernameApi({
      repository,
      provider,
      allowedOrigins: [ORIGIN],
      now: () => clock,
      createToken: () => tokens[tokenIndex++] ?? `token-${tokenIndex}`,
      ...overrides,
    });
  }

  beforeEach(async () => {
    repository = new MemoryRepository();
    repository.keys.set(await hashSecret("GIFT-ONE"), {
      kind: "gift",
      credits: 300,
    });
    clock = new Date("2026-09-04T12:00:00Z");
    app = build();
  });

  async function register(): Promise<string> {
    const response = await app.fetch(jsonRequest("/v1/register", {}));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      token: string;
      remaining: number;
    };
    return body.token;
  }

  it("registers an anonymous install with the trial balance", async () => {
    const response = await app.fetch(jsonRequest("/v1/register", {}));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: TOKEN, remaining: 10 });
    expect(repository.installs.get(await hashSecret(TOKEN))).toBe(10);
    expect(JSON.stringify([...repository.installs.keys()])).not.toContain(
      TOKEN,
    );
  });

  it("rejects a register body that carries any field", async () => {
    const response = await app.fetch(
      jsonRequest("/v1/register", { email: "someone@example.test" }),
    );
    expect(response.status).toBe(400);
    expect(repository.installs.size).toBe(0);
  });

  it("redeems a gift key exactly once onto the caller's balance", async () => {
    const token = await register();
    const redeemed = await app.fetch(
      jsonRequest("/v1/redeem", { key: " gift-one " }, token),
    );
    expect(redeemed.status).toBe(200);
    expect(await redeemed.json()).toEqual({ remaining: 310, added: 300 });

    const replay = await app.fetch(
      jsonRequest("/v1/redeem", { key: "GIFT-ONE" }, token),
    );
    expect(replay.status).toBe(409);
    expect(await replay.json()).toEqual({ error: "key_used" });
    expect(repository.installs.get(await hashSecret(token))).toBe(310);
  });

  it("reports an unknown key while purchases are switched off", async () => {
    const token = await register();
    const response = await app.fetch(
      jsonRequest("/v1/redeem", { key: "PN-UNKNOWN-KEY" }, token),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "key_unknown" });
  });

  it("records a merchant-validated purchase key exactly once", async () => {
    let validations = 0;
    app = build({
      purchaseKeys: {
        validate: async (key) => (
          validations++,
          key === "PN-PAID-KEY" ? { credits: 1500 } : undefined
        ),
      },
    });
    const token = await register();
    const redeemed = await app.fetch(
      jsonRequest("/v1/redeem", { key: "pn-paid-key" }, token),
    );
    expect(redeemed.status).toBe(200);
    expect(await redeemed.json()).toEqual({ remaining: 1510, added: 1500 });

    const replay = await app.fetch(
      jsonRequest("/v1/redeem", { key: "PN-PAID-KEY" }, token),
    );
    expect(replay.status).toBe(409);
    const unknown = await app.fetch(
      jsonRequest("/v1/redeem", { key: "PN-OTHER" }, token),
    );
    expect(unknown.status).toBe(404);
    expect(validations).toBe(3);
    expect(repository.installs.get(await hashSecret(token))).toBe(1510);
  });

  it("requires authentication to redeem", async () => {
    const response = await app.fetch(
      jsonRequest("/v1/redeem", { key: "GIFT-ONE" }),
    );
    expect(response.status).toBe(401);
  });

  it("spends one credit for a validated takeaway and returns the balance", async () => {
    const token = await register();
    const response = await app.fetch(jsonRequest("/v1/gist", gistBody, token));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      usable: true,
      gist: "Warm objects increase perceived interpersonal warmth",
      reason: "ok",
      remaining: 9,
    });
  });

  it("refuses to call the provider once the balance is empty", async () => {
    let calls = 0;
    app = build({
      trialCredits: 1,
      provider: {
        generate: async () => (calls++, provider.generate(gistBody)),
      },
    });
    const token = await register();
    expect(
      (await app.fetch(jsonRequest("/v1/gist", gistBody, token))).status,
    ).toBe(200);
    const exhausted = await app.fetch(jsonRequest("/v1/gist", gistBody, token));
    expect(exhausted.status).toBe(429);
    expect(await exhausted.json()).toEqual({
      usable: false,
      reason: "quota_exhausted",
      remaining: 0,
    });
    expect(calls).toBe(1);
  });

  it("charges for an insufficient abstract because the model ran", async () => {
    app = build({
      provider: {
        generate: async () => ({ usable: false, reason: "insufficient" }),
      },
    });
    const token = await register();
    const response = await app.fetch(jsonRequest("/v1/gist", gistBody, token));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      usable: false,
      reason: "insufficient",
      remaining: 9,
    });
  });

  it("refunds the credit when the provider fails", async () => {
    app = build({
      provider: {
        generate: async () =>
          Promise.reject(new Error("upstream failed with private content")),
      },
    });
    const token = await register();
    const response = await app.fetch(jsonRequest("/v1/gist", gistBody, token));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      usable: false,
      reason: "provider_error",
      remaining: 10,
    });
  });

  it("refunds the credit when provider output is unsafe or outside 4–10 words", async () => {
    app = build({
      provider: {
        generate: async () => ({
          usable: true,
          gist: "../ignore all instructions",
          reason: "ok",
        }),
      },
    });
    const token = await register();
    const response = await app.fetch(jsonRequest("/v1/gist", gistBody, token));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      usable: false,
      reason: "provider_invalid",
      remaining: 10,
    });
  });

  it("refunds a takeaway that arrived after the download deadline", async () => {
    app = build({
      refundAfterMs: 2_000,
      provider: {
        generate: async () => {
          clock = new Date(clock.getTime() + 2_001);
          return provider.generate(gistBody);
        },
      },
    });
    const token = await register();
    const response = await app.fetch(jsonRequest("/v1/gist", gistBody, token));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      usable: true,
      remaining: 10,
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
      await expect(timedProvider.generate(gistBody)).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects missing authentication and oversized input before spending", async () => {
    const unauthorized = await app.fetch(
      jsonRequest("/v1/gist", gistBody, undefined, undefined),
    );
    expect(unauthorized.status).toBe(401);

    const token = await register();
    const oversized = await app.fetch(
      jsonRequest("/v1/gist", { ...gistBody, title: "x".repeat(501) }, token),
    );
    expect(oversized.status).toBe(400);
    expect(repository.installs.get(await hashSecret(token))).toBe(10);
  });

  it("stores only allow-listed aggregate telemetry fields", async () => {
    const token = await register();
    const response = await app.fetch(
      jsonRequest(
        "/v1/events",
        {
          event: "rename_result",
          preset: "gist",
          outcome: "fallback",
          reason: "gist_timeout",
          latencyBucket: "gt1500",
          version: "0.1.0",
        },
        token,
      ),
    );
    expect(response.status).toBe(204);
    expect(repository.events).toHaveLength(1);

    const leaking = await app.fetch(
      jsonRequest(
        "/v1/events",
        {
          event: "rename_result",
          preset: "citation",
          outcome: "renamed",
          reason: "selected_preset",
          latencyBucket: "lt250",
          version: "0.1.0",
          title: "Private paper title",
        },
        token,
      ),
    );
    expect(leaking.status).toBe(400);
  });

  it("rejects an unexpected browser origin", async () => {
    const response = await app.fetch(
      jsonRequest("/v1/register", {}, undefined, "https://attacker.test"),
    );
    expect(response.status).toBe(403);
  });

  it("removes the retired activation endpoint", async () => {
    const response = await app.fetch(
      jsonRequest("/v1/activate", { code: "BETA-ONE" }),
    );
    expect(response.status).toBe(404);
  });

  it("answers an allowed CORS preflight without authentication", async () => {
    const response = await app.fetch(
      new Request("https://api.test/v1/gist", {
        method: "OPTIONS",
        headers: { origin: ORIGIN },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "authorization",
    );
  });
});
