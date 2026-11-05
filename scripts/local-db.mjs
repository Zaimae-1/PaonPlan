import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import pg from "pg";

const root = process.env.PAONPLAN_PG_DIR ?? (process.platform === "win32"
  ? join(process.env.LOCALAPPDATA ?? homedir(), "PaonPlan-dev-postgres")
  : join(homedir(), ".local", "share", "paonplan-dev-postgres"));
mkdirSync(root, { recursive: true });
const secretPath = join(root, "cluster-password");
const existing = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (existing && (existing.hostname !== "127.0.0.1" || existing.port !== "55432")) {
  throw new Error("DATABASE_URL memakai server lain. Jalankan PostgreSQL tersebut dan gunakan db:migrate.");
}
const password = existing ? decodeURIComponent(existing.password)
  : existsSync(secretPath) ? readFileSync(secretPath, "utf8") : randomBytes(24).toString("hex");
if (!existsSync(secretPath)) writeFileSync(secretPath, password, { mode: 0o600 });
const name = existing ? existing.pathname.slice(1) : "paonplan";
if (!/^[a-z0-9_]+$/.test(name)) throw new Error("Nama database lokal tidak valid.");
const connectionString = existing?.toString() ?? `postgresql://paonplan:${password}@127.0.0.1:55432/${name}`;
const probe = new pg.Client({ connectionString, connectionTimeoutMillis: 1500 });
try {
  await probe.connect();
  console.log("PostgreSQL lokal sudah berjalan di 127.0.0.1:55432.");
  await probe.end();
  process.exit(0);
} catch { await probe.end().catch(() => {}); }

const databaseDir = join(root, "cluster");
const { default: EmbeddedPostgres } = await import("embedded-postgres");
const cluster = new EmbeddedPostgres({
  databaseDir, user: existing ? decodeURIComponent(existing.username) : "paonplan", password,
  port: 55432, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], authMethod: "scram-sha-256",
});
if (!existsSync(join(databaseDir, "PG_VERSION"))) await cluster.initialise();
await cluster.start();
const client = cluster.getPgClient();
await client.connect();
try {
  const found = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]);
  if (!found.rowCount) await client.query(`CREATE DATABASE "${name}" ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
} finally { await client.end(); }
if (!existsSync(".env.local")) writeFileSync(".env.local", "DATABASE_URL=" + connectionString + "\n", { mode: 0o600 });
console.log("PostgreSQL lokal siap di 127.0.0.1:55432. Biarkan terminal ini terbuka.");
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await cluster.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await new Promise(() => {});
