import path from "node:path";

/**
 * Local app data (mailbox, sync state, email config).
 * Override with MAIL_DATA_DIR if needed.
 */
export function getDataDir(): string {
  if (process.env.MAIL_DATA_DIR?.trim()) {
    return path.resolve(process.env.MAIL_DATA_DIR.trim());
  }
  return path.resolve(process.cwd(), "data");
}

export function dataPath(...segments: string[]): string {
  return path.join(getDataDir(), ...segments);
}
