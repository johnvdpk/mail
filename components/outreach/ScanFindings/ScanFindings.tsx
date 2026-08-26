"use client";

import type { WebsiteScanResult } from "@/lib/outreach/website-scan";
import styles from "./ScanFindings.module.css";

type Props = {
  findings?: string;
  scan?: WebsiteScanResult;
};

export function ScanFindings({ findings, scan }: Props) {
  if (!findings && !scan) return null;

  const summaryLines = scan?.summaryLines ?? [];
  const aiExtra = findings
    ? findings
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !summaryLines.includes(line))
        .join("\n")
    : "";

  return (
    <div className={styles.wrap}>
      <strong className={styles.title}>Website-scan</strong>
      {summaryLines.length > 0 && (
        <ul className={styles.list}>
          {summaryLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {aiExtra ? (
        <p className={styles.ai}>
          <span className={styles.aiLabel}>AI: </span>
          {aiExtra}
        </p>
      ) : null}
      {!scan && findings ? <p className={styles.ai}>{findings}</p> : null}
    </div>
  );
}
