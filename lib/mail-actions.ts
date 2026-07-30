import { withImap, withMailbox } from "./imap";
import { fetchFolders } from "./folders";
import { removeSummaries } from "./store";
import { syncFolder } from "./sync";
import type { MessageSummary } from "./types";

/** Group message UIDs by their current IMAP folder. */
export function groupByFolder(messages: MessageSummary[]): Map<string, number[]> {
  const result = new Map<string, number[]>();
  for (const message of messages) {
    const uids = result.get(message.folder) ?? [];
    uids.push(message.uid);
    result.set(message.folder, uids);
  }
  return result;
}

/** Move messages to an existing IMAP destination and update the local store. */
export async function moveMessages(
  messages: MessageSummary[],
  destination: string
): Promise<void> {
  if (messages.length === 0) return;

  const byFolder = groupByFolder(messages);

  for (const [folder, uids] of byFolder) {
    await withMailbox(folder, async (client) => {
      await client.messageMove(uids, destination, { uid: true });
    });
    await removeSummaries(
      folder,
      messages.filter((m) => m.folder === folder).map((m) => m.id)
    );
  }

  await syncFolder(destination);
}

/** Create an IMAP mailbox if it does not already exist. */
export async function ensureFolder(path: string): Promise<void> {
  const folders = await fetchFolders();
  if (folders.some((f) => f.path === path || f.name === path)) return;

  await withImap((client) => client.mailboxCreate(path));
  await fetchFolders();
}
