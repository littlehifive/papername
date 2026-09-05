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
      env.DB.prepare("DELETE FROM monthly_usage"),
      env.DB.prepare("DELETE FROM telemetry_counters"),
      env.DB.prepare("DELETE FROM invite_codes"),
    ]);
  });

  it("activates an invite exactly once using the migrated schema", async () => {
    const codeHash = await hashSecret("BETA-D1");
    await env.DB.prepare("INSERT INTO invite_codes (code_hash) VALUES (?)")
      .bind(codeHash)
      .run();
    const repository = new D1PapernameRepository(env.DB);

    await expect(
      repository.activate(codeHash, "token-hash", "2026-09-04T12:00:00Z"),
    ).resolves.toBe(true);
    await expect(
      repository.activate(codeHash, "other-token", "2026-09-04T12:01:00Z"),
    ).resolves.toBe(false);
    await expect(repository.hasToken("token-hash")).resolves.toBe(true);
  });

  it("atomically permits only one concurrent call at a limit of one", async () => {
    const codeHash = await hashSecret("BETA-QUOTA");
    await env.DB.prepare(
      "INSERT INTO invite_codes (code_hash, token_hash) VALUES (?, ?)",
    )
      .bind(codeHash, "quota-token")
      .run();
    const repository = new D1PapernameRepository(env.DB);

    const results = await Promise.all([
      repository.consume("quota-token", "2026-09", 1),
      repository.consume("quota-token", "2026-09", 1),
    ]);
    expect(results.sort()).toEqual([0, undefined]);
    const row = await env.DB.prepare(
      "SELECT count FROM monthly_usage WHERE token_hash = ? AND month = ?",
    )
      .bind("quota-token", "2026-09")
      .first<{ count: number }>();
    expect(row?.count).toBe(1);
  });

  it("activates and rejects invite replay through the exported Worker endpoint", async () => {
    const codeHash = await hashSecret("BETA-RUNTIME");
    await env.DB.prepare("INSERT INTO invite_codes (code_hash) VALUES (?)")
      .bind(codeHash)
      .run();
    const request = () =>
      SELF.fetch("https://papername.test/v1/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "beta-runtime" }),
      });

    const activated = await request();
    expect(activated.status).toBe(200);
    expect(await activated.json()).toMatchObject({ remaining: 30 });
    expect((await request()).status).toBe(409);
  });
});
