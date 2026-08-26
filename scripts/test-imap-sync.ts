/**
 * Sync the inbox once and print the result — run: npm run test:imap
 */
import { getFolders, getInboxPath } from "../lib/mail/folders.js";
import { loadEnvFromFile } from "../lib/config/env.js";
import { syncFolder } from "../lib/mail/sync.js";
import { getFolderView } from "../lib/mail/mailbox-service.js";

loadEnvFromFile();

try {
  const folders = await getFolders({ refresh: true });
  console.log("Mappen:");
  for (const folder of folders) {
    console.log(`  ${folder.path}${folder.role ? ` (${folder.role})` : ""}`);
  }

  const inbox = await getInboxPath();
  console.log(`\nSync ${inbox} ...`);
  const result = await syncFolder(inbox);
  console.log(JSON.stringify(result, null, 2));

  const view = await getFolderView(inbox);
  console.log(`\nConversaties in cache: ${view.threads.length}`);
  for (const thread of view.threads.slice(0, 10)) {
    const who = thread.participants.map((p) => p.name || p.email).join(", ");
    console.log(`  ${thread.unread ? "•" : " "} ${thread.subject} — ${who}`);
  }
} catch (err) {
  console.error("FOUT:", err instanceof Error ? err.message : err);
  process.exit(1);
}
