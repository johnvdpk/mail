"use client";

import { useState } from "react";
import type { FolderSummary } from "@/lib/types";
import { ThemeToggle } from "@/components/ThemeToggle/ThemeToggle";
import styles from "./FolderRail.module.css";

type Props = {
  account: string;
  folders: FolderSummary[];
  activeFolder: string;
  settingsActive: boolean;
  onSelectFolder: (path: string) => void;
  onCompose: () => void;
  onOpenSettings: () => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (path: string, newName: string) => void;
  onDeleteFolder: (path: string) => void;
  onLogout: () => void;
};

const ROLE_LABELS: Record<string, string> = {
  inbox: "Inbox",
  drafts: "Concepten",
  sent: "Verzonden",
  archive: "Archief",
  junk: "Spam",
  trash: "Prullenbak",
};

export function FolderRail({
  account,
  folders,
  activeFolder,
  settingsActive,
  onSelectFolder,
  onCompose,
  onOpenSettings,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onLogout,
}: Props) {
  const known = folders.filter((f) => f.role);
  const custom = folders.filter((f) => !f.role);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  return (
    <nav className={styles.rail} aria-label="Mappen">
      <div className={styles.head}>
        <p className={styles.account}>{account}</p>
        <button type="button" className={styles.compose} onClick={onCompose}>
          Nieuwe mail
        </button>
      </div>

      <div className={styles.scrollable}>
        <ul className={styles.list}>
          {known.map((folder) => (
            <FolderItem
              key={folder.path}
              folder={folder}
              active={folder.path === activeFolder && !settingsActive}
              onSelect={onSelectFolder}
            />
          ))}
        </ul>

        {custom.length > 0 && (
          <>
            <p className={styles.groupLabel}>Mappen</p>
            <ul className={styles.list}>
              {custom.map((folder) =>
                editingPath === folder.path ? (
                  <li key={folder.path}>
                    <form
                      className={styles.inlineForm}
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (editName.trim() && editName.trim() !== folder.name) {
                          onRenameFolder(folder.path, editName.trim());
                        }
                        setEditingPath(null);
                      }}
                    >
                      <input
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        autoFocus
                        onBlur={() => setEditingPath(null)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setEditingPath(null);
                        }}
                      />
                    </form>
                  </li>
                ) : (
                  <li
                    key={folder.path}
                    className={`${styles.itemRow} ${folder.path === activeFolder && !settingsActive ? styles.itemActive : ""}`}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setEditingPath(folder.path);
                      setEditName(folder.name);
                    }}
                  >
                    <button
                      type="button"
                      className={styles.item}
                      onClick={() => onSelectFolder(folder.path)}
                      aria-current={folder.path === activeFolder && !settingsActive ? "page" : undefined}
                    >
                      <span className={styles.itemLabel}>{folder.name}</span>
                      {folder.unread > 0 && <span className={styles.badge}>{folder.unread}</span>}
                    </button>
                    <button
                      type="button"
                      className={styles.folderAction}
                      title="Map verwijderen"
                      onClick={() => {
                        if (window.confirm(`Map "${folder.name}" verwijderen?`)) {
                          onDeleteFolder(folder.path);
                        }
                      }}
                    >
                      ×
                    </button>
                  </li>
                )
              )}
            </ul>
          </>
        )}

        {creating ? (
          <form
            className={styles.inlineForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (newName.trim()) {
                onCreateFolder(newName.trim());
                setNewName("");
                setCreating(false);
              }
            }}
          >
            <input
              value={newName}
              placeholder="Mapnaam"
              onChange={(event) => setNewName(event.target.value)}
              autoFocus
              onBlur={() => { if (!newName.trim()) setCreating(false); }}
              onKeyDown={(event) => {
                if (event.key === "Escape") { setCreating(false); setNewName(""); }
              }}
            />
          </form>
        ) : (
          <button
            type="button"
            className={styles.addFolder}
            onClick={() => setCreating(true)}
          >
            + Nieuwe map
          </button>
        )}
      </div>

      <ThemeToggle />
      <button
        type="button"
        className={`${styles.settings} ${settingsActive ? styles.settingsActive : ""}`}
        onClick={onOpenSettings}
      >
        Instellingen
      </button>
      <button type="button" className={styles.logout} onClick={onLogout}>
        Uitloggen
      </button>
    </nav>
  );
}

function FolderItem({
  folder,
  active,
  onSelect,
}: {
  folder: FolderSummary;
  active: boolean;
  onSelect: (path: string) => void;
}) {
  const label = folder.role ? ROLE_LABELS[folder.role] ?? folder.name : folder.name;

  return (
    <li>
      <button
        type="button"
        className={`${styles.item} ${active ? styles.itemActive : ""}`}
        onClick={() => onSelect(folder.path)}
        aria-current={active ? "page" : undefined}
      >
        <span className={styles.itemLabel}>{label}</span>
        {folder.unread > 0 && <span className={styles.badge}>{folder.unread}</span>}
      </button>
    </li>
  );
}
