import { env, SELF, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { D1PapernameRepository, hashSecret } from "../src/index";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

describe("D1 persistence boundary", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM access_keys"),
      env.DB.prepare("DELETE FROM telemetry_counters"),
      env.DB.prepare("DELETE FROM installs"),
    ]);
  });

  it("spends at most the available credits under concurrency", async () => {
    const repository = new D1PapernameRepository(env.DB);
    await repository.register("spend-token", 1, "2026-09-04T12:00:00Z");

    const results = await Promise.all([
      repository.consume("spend-token"),
      repository.consume("spend-token"),
    ]);
    expect(results.sort()).toEqual([0, undefined]);
    await expect(repository.refund("spend-token")).resolves.toBe(1);
  });

  it("redeems a gift key exactly once, even when replayed concurrently", async () => {
    const repository = new D1PapernameRepository(env.DB);
    await repository.register("gift-token", 10, "2026-09-04T12:00:00Z");
    await repository.register("other-token", 10, "2026-09-04T12:00:00Z");
    const keyHash = await hashSecret("GIFT-D1");
    await env.DB.prepare(
      "INSERT INTO access_keys (key_hash, kind, credits) VALUES (?, 'gift', 300)",
    )
      .bind(keyHash)
      .run();

    const results = await Promise.all([
      repository.redeemGiftKey(
        keyHash,
        "gift-token",
        "2026-09-04T12:00:00Z",
        "claim-a",
      ),
      repository.redeemGiftKey(
        keyHash,
        "other-token",
        "2026-09-04T12:00:00Z",
        "claim-b",
      ),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "redeemed",
      "used",
    ]);
    const balances = await env.DB.prepare(
      "SELECT token_hash, credits FROM installs ORDER BY token_hash",
    ).all<{ token_hash: string; credits: number }>();
    expect(
      balances.results.map((row) => row.credits).sort((a, b) => a - b),
    ).toEqual([10, 310]);

    await expect(
      repository.redeemGiftKey(
        keyHash,
        "gift-token",
        "2026-09-04T12:01:00Z",
        "claim-c",
      ),
    ).resolves.toEqual({ status: "used" });
    await expect(
      repository.redeemGiftKey(
        await hashSecret("GIFT-NOPE"),
        "gift-token",
        "2026-09-04T12:01:00Z",
        "claim-d",
      ),
    ).resolves.toEqual({ status: "unknown" });
  });

  it("records a purchase key once and rejects its replay", async () => {
    const repository = new D1PapernameRepository(env.DB);
    await repository.register("buyer-token", 0, "2026-09-04T12:00:00Z");
    const keyHash = await hashSecret("PN-PAID");

    await expect(
      repository.recordPurchase(
        keyHash,
        1500,
        "buyer-token",
        "2026-09-04T12:00:00Z",
        "claim-1",
      ),
    ).resolves.toEqual({ status: "redeemed", credits: 1500, added: 1500 });
    await expect(
      repository.recordPurchase(
        keyHash,
        1500,
        "buyer-token",
        "2026-09-04T12:05:00Z",
        "claim-2",
      ),
    ).resolves.toEqual({ status: "used" });
    await expect(repository.consume("buyer-token")).resolves.toBe(1499);
  });

  it("registers and redeems through the exported Worker endpoint", async () => {
    const registered = await SELF.fetch("https://papername.test/v1/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(registered.status).toBe(200);
    const { token } = (await registered.json()) as {
      token: string;
      remaining: number;
    };
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const keyHash = await hashSecret("GIFT-RUNTIME");
    await env.DB.prepare(
      "INSERT INTO access_keys (key_hash, kind, credits) VALUES (?, 'gift', 300)",
    )
      .bind(keyHash)
      .run();
    const redeem = () =>
      SELF.fetch("https://papername.test/v1/redeem", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: "gift-runtime" }),
      });
    const redeemed = await redeem();
    expect(redeemed.status).toBe(200);
    expect(await redeemed.json()).toEqual({ remaining: 310, added: 300 });
    expect((await redeem()).status).toBe(409);
  });
});
