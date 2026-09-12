import { createHash, randomBytes } from "node:crypto";

const count = Number.parseInt(process.argv[2] ?? "25", 10);
const credits = Number.parseInt(process.argv[3] ?? "300", 10);
if (
  !Number.isSafeInteger(count) ||
  count < 1 ||
  count > 1_000 ||
  !Number.isSafeInteger(credits) ||
  credits < 1
) {
  console.error(
    "Usage: pnpm gift-keys [count from 1 to 1000] [credits per key, default 300]",
  );
  process.exitCode = 1;
} else {
  const keys = Array.from({ length: count }, () => {
    const value = randomBytes(9).toString("base64url").toUpperCase();
    return `GIFT-${value}`;
  });

  process.stdout.write(
    "-- Keep this file secret: plaintext gift keys follow.\n",
  );
  keys.forEach((key, index) =>
    process.stdout.write(
      `-- key-${String(index + 1).padStart(2, "0")} (${credits} names): ${key}\n`,
    ),
  );
  process.stdout.write("BEGIN;\n");
  for (const key of keys) {
    const hash = createHash("sha256").update(key).digest("hex");
    process.stdout.write(
      `INSERT INTO access_keys (key_hash, kind, credits) VALUES ('${hash}', 'gift', ${credits});\n`,
    );
  }
  process.stdout.write("COMMIT;\n");
}
