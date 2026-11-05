import { readFile, readdir } from "node:fs/promises";
import { database, transaction } from "../src/lib/operations/db.ts";

try {
  const directory = new URL("../db/", import.meta.url);
  const migrations = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(752010901)");
    await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())");
    for (const name of migrations) {
      const exists = await db.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
      if (exists.rowCount) continue;
      await db.query(await readFile(new URL(name, directory), "utf8"));
      await db.query("INSERT INTO schema_migrations(name) VALUES ($1)", [name]);
      console.log("Applied " + name);
    }
  });
  console.log("Skema PaonPlan siap.");
} finally { await database().end(); }
