import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { database, one, requireCondition, transaction } from "./db";
import { checkPassword, digest } from "./password";
import type { Actor } from "./types";

const cookieName = "paonplan_session";
const eightHours = 8 * 60 * 60;

export async function actor() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  return one<Actor>(database(), `SELECT a.id,a.name,a.role,a.shop_id,p.demo FROM sessions s
    JOIN accounts a ON a.id=s.account_id JOIN shops p ON p.id=a.shop_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.active`, [digest(token)]);
}

export async function requireActor(admin = false) {
  const user = await actor();
  requireCondition(user, "Masuk untuk membuka ruang usaha.", 401);
  requireCondition(!admin || user.role === "admin", "Halaman ini khusus Admin.", 403);
  return user;
}

export async function signIn(email: string, password: string) {
  const db = database();
  const identity = digest(email);
  await db.query("DELETE FROM login_attempts WHERE window_start < now() - interval '1 day'");
  const attempt = await one<{ attempts: number }>(db, `INSERT INTO login_attempts(identity) VALUES ($1)
    ON CONFLICT(identity) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start < now()-interval '10 minutes' THEN 1 ELSE login_attempts.attempts+1 END,
    window_start=CASE WHEN login_attempts.window_start < now()-interval '10 minutes' THEN now() ELSE login_attempts.window_start END RETURNING attempts`, [identity]);
  requireCondition(attempt && attempt.attempts <= 10, "Terlalu banyak percobaan. Coba lagi dalam 10 menit.", 429);
  const account = await one<Actor & { password_hash: string; active: boolean }>(db,
    "SELECT id,name,role,shop_id,password_hash,active FROM accounts WHERE email=$1", [email]);
  const correct = await checkPassword(password, account?.password_hash);
  requireCondition(account?.active && correct, "Email atau sandi tidak cocok.", 401);
  const token = randomBytes(32).toString("base64url");
  const jar = await cookies();
  const previous = jar.get(cookieName)?.value;
  await transaction(async (client) => {
    const current = await one<{ id: string }>(client, "SELECT id FROM accounts WHERE id=$1 AND active AND password_hash=$2 FOR UPDATE",
      [account.id, account.password_hash]);
    requireCondition(current, "Akun berubah. Masuk kembali.", 401);
    await client.query("DELETE FROM sessions WHERE expires_at<=now() OR token_hash=$1", [previous ? digest(previous) : null]);
    await client.query("INSERT INTO sessions(token_hash,account_id,expires_at) VALUES ($1,$2,now()+interval '8 hours')", [digest(token), account.id]);
    await client.query("DELETE FROM login_attempts WHERE identity=$1", [identity]);
  });
  const secure = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).protocol === "https:" : process.env.NODE_ENV === "production";
  jar.set(cookieName, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: eightHours });
  return { name: account.name, role: account.role };
}

export async function signOut() {
  const jar = await cookies();
  const previous = jar.get(cookieName)?.value;
  if (previous) await database().query("DELETE FROM sessions WHERE token_hash=$1", [digest(previous)]);
  jar.delete(cookieName);
}
