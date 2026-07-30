import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnvFromFile } from "../lib/env";

loadEnvFromFile();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const sql = await readFile(path.join(__dirname, "../lib/schema.sql"), "utf-8");

  try {
    await pool.query(sql);
    console.log("Migration complete — all tables created.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
