import { withImap } from "./imap";
import { readFoldersCache, writeFoldersCache } from "../shared/store";
import type { FolderRole, MailFolder } from "../shared/types";

const SPECIAL_USE_ROLES: Record<string, FolderRole> = {
  "\\Inbox": "inbox",
  "\\Sent": "sent",
  "\\Drafts": "drafts",
  "\\Trash": "trash",
  "\\Junk": "junk",
  "\\Archive": "archive",
};

/** Fallback for servers that omit special-use flags. */
const NAME_ROLES: Array<{ role: FolderRole; patterns: RegExp[] }> = [
  { role: "sent", patterns: [/^sent/i, /^verzonden/i, /^gesendet/i] },
  { role: "drafts", patterns: [/^drafts?/i, /^concepten/i, /^entw/i] },
  { role: "trash", patterns: [/^trash/i, /^deleted/i, /^prullenbak/i, /^verwijderd/i] },
  { role: "junk", patterns: [/^junk/i, /^spam/i, /^ongewenst/i] },
  { role: "archive", patterns: [/^archive/i, /^archief/i] },
];

function resolveRole(path: string, name: string, specialUse?: string): FolderRole | undefined {
  if (path.toUpperCase() === "INBOX") return "inbox";
  if (specialUse && SPECIAL_USE_ROLES[specialUse]) return SPECIAL_USE_ROLES[specialUse];

  for (const { role, patterns } of NAME_ROLES) {
    if (patterns.some((p) => p.test(name))) return role;
  }
  return undefined;
}

/** Inbox first and most prominent; Archive + Drafts directly underneath. */
const ROLE_ORDER: FolderRole[] = ["inbox", "archive", "drafts", "sent", "junk", "trash"];

function sortFolders(folders: MailFolder[]): MailFolder[] {
  return [...folders].sort((a, b) => {
    const ra = a.role ? ROLE_ORDER.indexOf(a.role) : -1;
    const rb = b.role ? ROLE_ORDER.indexOf(b.role) : -1;
    if (ra !== -1 && rb !== -1) return ra - rb;
    if (ra !== -1) return -1;
    if (rb !== -1) return 1;
    return a.path.localeCompare(b.path);
  });
}

export async function fetchFolders(): Promise<MailFolder[]> {
  const folders = await withImap(async (client) => {
    const list = await client.list();
    const seenRoles = new Set<FolderRole>();

    return list
      .filter((item) => !item.flags?.has("\\NonExistent"))
      .map((item) => {
        let role = resolveRole(item.path, item.name, item.specialUse);
        // Only one folder may claim each role
        if (role) {
          if (seenRoles.has(role)) role = undefined;
          else seenRoles.add(role);
        }
        return {
          path: item.path,
          name: item.name,
          role,
          parentPath: item.parentPath ?? "",
          subscribed: item.subscribed ?? true,
        } satisfies MailFolder;
      });
  });

  const sorted = sortFolders(folders);
  await writeFoldersCache(sorted);
  return sorted;
}

/** Cached folders, refreshed from IMAP when the cache is empty. */
export async function getFolders(options?: { refresh?: boolean }): Promise<MailFolder[]> {
  if (!options?.refresh) {
    const cached = await readFoldersCache();
    if (cached.length > 0) return cached;
  }
  return fetchFolders();
}

export async function getFolderByRole(role: FolderRole): Promise<MailFolder | undefined> {
  const folders = await getFolders();
  return folders.find((f) => f.role === role);
}

export async function getInboxPath(): Promise<string> {
  const inbox = await getFolderByRole("inbox");
  return inbox?.path ?? "INBOX";
}
