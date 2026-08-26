"use client";

import { useRef } from "react";
import {
  MAX_ATTACHMENT_FILE_BYTES,
  MAX_ATTACHMENT_TOTAL_BYTES,
  validateAttachmentSizes,
} from "@/lib/mail/outgoing-attachments";
import styles from "./AttachmentPicker.module.css";

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  error?: string | null;
  onError?: (message: string | null) => void;
};

export function AttachmentPicker({ files, onChange, disabled, error, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...files, ...Array.from(list)];

    try {
      validateAttachmentSizes(next.map((file) => ({ filename: file.name, size: file.size })));
      onChange(next);
      onError?.(null);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Bijlage ongeldig");
    }
  }

  function removeFile(index: number) {
    onChange(files.filter((_, i) => i !== index));
    onError?.(null);
  }

  const maxPerFile = MAX_ATTACHMENT_FILE_BYTES / (1024 * 1024);
  const maxTotal = MAX_ATTACHMENT_TOTAL_BYTES / (1024 * 1024);

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Bijlage toevoegen
        </button>
        <span className={styles.hint}>
          Max {maxPerFile} MB per bestand, {maxTotal} MB totaal
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className={styles.hidden}
        disabled={disabled}
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {error && <p className={styles.error}>{error}</p>}
      {files.length > 0 && (
        <ul className={styles.list}>
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <span>{file.name}</span>
              <span className={styles.size}>{formatSize(file.size)}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeFile(index)}
                aria-label={`Verwijder ${file.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
