import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export function isPasswordHash(encoded: unknown): encoded is string {
  return (
    typeof encoded === "string" && /^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(encoded)
  );
}

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 256)
    throw new Error("密码长度需在 12–256 个字符之间。");
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  if (!isPasswordHash(encoded)) return false;
  const [saltHex, hashHex] = encoded.split(":");
  const key = await deriveKey(password, Buffer.from(saltHex, "hex"));
  return timingSafeEqual(key, Buffer.from(hashHex, "hex"));
}
