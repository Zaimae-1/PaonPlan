import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + (await derive(password, salt)).toString("hex");
}

export async function checkPassword(password: string, stored?: string) {
  const [salt, hash] = (stored ?? "0".repeat(32) + ":" + "0".repeat(128)).split(":");
  const expected = Buffer.from(hash, "hex");
  const actual = await derive(password, salt);
  return !!stored && expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
