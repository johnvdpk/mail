/** Format a datetime ISO string for display in nl-NL locale. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("nl-NL", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** Format bytes as human-readable size (B, kB, MB). */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Convert plain-text URLs to clickable <a> tags. */
export function linkify(text: string): React.ReactNode {
  const parts = text.split(/(https?:\/\/[^\s<>"')\]]+)/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    )
  );
}

/** Split off the quoted history so long threads stay readable. */
export function splitQuote(text: string): { visible: string; quoted?: string } {
  const lines = text.split("\n");
  const markers = [
    /^>/,
    /^.{0,120}\bschreef\b.*:$/i,
    /^.{0,120}\bwrote\b.*:$/i,
    /^-{2,}\s*Origin/i,
    /^_{5,}$/,
    /^Van:\s/i,
    /^From:\s/i,
  ];

  const index = lines.findIndex((line) => markers.some((m) => m.test(line.trim())));
  if (index <= 0) return { visible: text.trim() };

  return {
    visible: lines.slice(0, index).join("\n").trim(),
    quoted: lines.slice(index).join("\n").trim(),
  };
}
