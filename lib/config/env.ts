import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let envLoaded = false;

function parseEnvFile(envPath: string, override: boolean): void {
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf-8").replace(/^\uFEFF/, "");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!override && process.env[key]) continue;

    let val = trimmed.slice(eq + 1).trim().replace(/\r$/, "");
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // Support \$ (manual escape) and $$ (Docker Compose literal $)
    val = val.replace(/\\\$/g, "$").replace(/\$\$/g, "$");
    process.env[key] = val;
  }
}

/** Load vars from .env.local with reliable parsing (special chars like & and $). */
export function loadEnvFromFile(): void {
  if (envLoaded) return;
  envLoaded = true;

  // Project root — override=true because Next.js dotenv-expand can strip
  // characters after $ in SMTP_PASS (e.g. "$Dt" becomes empty).
  parseEnvFile(join(process.cwd(), ".env.local"), true);
}

export function env(key: string): string | undefined {
  loadEnvFromFile();
  const v = process.env[key]?.trim();
  return v || undefined;
}
