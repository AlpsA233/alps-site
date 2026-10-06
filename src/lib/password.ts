import { scrypt, timingSafeEqual } from "node:crypto";
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [saltHex, hashHex] = encoded.split(":");
  if (
    !/^[a-f0-9]{32}$/.test(saltHex || "") ||
    !/^[a-f0-9]{128}$/.test(hashHex || "")
  )
    return false;
  const key = await new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      Buffer.from(saltHex, "hex"),
      64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
  return timingSafeEqual(key, Buffer.from(hashHex, "hex"));
}
