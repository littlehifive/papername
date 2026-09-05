import { createHash, randomBytes } from "node:crypto";

const count = Number.parseInt(process.argv[2] ?? "25", 10);
if (!Number.isSafeInteger(count) || count < 1 || count > 1_000) {
  console.error("Usage: pnpm invites [count from 1 to 1000]");
  process.exitCode = 1;
} else {
  const codes = Array.from({ length: count }, () => {
    const value = randomBytes(9).toString("base64url").toUpperCase();
    return `BETA-${value}`;
  });

  process.stdout.write(
    "-- Keep this file secret: plaintext beta invite codes follow.\n",
  );
  codes.forEach((code, index) =>
    process.stdout.write(
      `-- tester-${String(index + 1).padStart(2, "0")}: ${code}\n`,
    ),
  );
  process.stdout.write("BEGIN;\n");
  for (const code of codes) {
    const hash = createHash("sha256").update(code).digest("hex");
    process.stdout.write(
      `INSERT INTO invite_codes (code_hash) VALUES ('${hash}');\n`,
    );
  }
  process.stdout.write("COMMIT;\n");
}
