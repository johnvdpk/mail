import { useEffect, useRef, useState } from "react";
import type { ThreadMessage } from "@/lib/types";
import { CalendarInviteBanner } from "@/components/CalendarInviteBanner/CalendarInviteBanner";
import { HtmlBody } from "./HtmlBody";
import { formatDateTime, formatSize, linkify, splitQuote } from "@/lib/thread-utils";
import styles from "./ThreadView.module.css";

type Props = {
  message: ThreadMessage;
  defaultOpen: boolean;
  isLast: boolean;
  googleConnected: boolean;
  googleConfigured: boolean;
};

export function MessageCard({
  message,
  defaultOpen,
  isLast,
  googleConnected,
  googleConfigured,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const { visible, quoted } = splitQuote(message.body?.text ?? message.snippet);
  const [showQuote, setShowQuote] = useState(false);
  const [showHtml, setShowHtml] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isLast && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isLast]);

  return (
    <article
      ref={ref}
      className={`${styles.message} ${message.outbound ? styles.outbound : ""}`}
      aria-expanded={open}
    >
      <button type="button" className={styles.messageHead} onClick={() => setOpen(!open)}>
        <span className={styles.chevron} aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className={styles.senderAvatar}>
          {(message.outbound ? "J" : (message.from?.name || message.from?.email || "?")[0]).toUpperCase()}
        </span>
        <span className={styles.headInfo}>
          <span className={styles.sender}>
            {message.outbound ? "Jij" : message.from?.name || message.from?.email || "onbekend"}
          </span>
          {!open && (
            <span className={styles.collapsedSnippet}>
              {visible.slice(0, 100)}{visible.length > 100 ? "…" : ""}
            </span>
          )}
        </span>
        <span className={styles.meta}>{formatDateTime(message.date)}</span>
      </button>

      {open && (
        <div className={styles.body}>
          <p className={styles.addresses}>
            Aan {message.to.map((t) => t.name || t.email).join(", ") || "onbekend"}
            {message.cc.length > 0 && (
              <span> · CC: {message.cc.map((c) => c.name || c.email).join(", ")}</span>
            )}
          </p>

          {message.body?.calendarInvite && (
            <CalendarInviteBanner
              invite={message.body.calendarInvite}
              folder={message.folder}
              uid={message.uid}
              googleConnected={googleConnected}
              googleConfigured={googleConfigured}
            />
          )}

          {showHtml && message.body?.html ? (
            <HtmlBody html={message.body.html} />
          ) : (
            <>
              <pre className={styles.text}>{linkify(visible)}</pre>
              {quoted && (
                <div className={styles.quoteSection}>
                  <button
                    type="button"
                    className={styles.quoteToggle}
                    onClick={() => setShowQuote(!showQuote)}
                  >
                    <span className={styles.quoteDots}>•••</span>
                    {showQuote ? "Verberg eerdere berichten" : "Toon eerdere berichten"}
                  </button>
                  {showQuote && <pre className={styles.quote}>{linkify(quoted)}</pre>}
                </div>
              )}
            </>
          )}

          {message.body?.html && (
            <button
              type="button"
              className={styles.quoteToggle}
              onClick={() => setShowHtml(!showHtml)}
              style={{ marginTop: "0.5rem" }}
            >
              {showHtml ? "Tekst weergave" : "HTML weergave"}
            </button>
          )}

          {message.body?.attachments.length ? (
            <ul className={styles.attachments}>
              {message.body.attachments.map((file) => (
                <li key={`${file.filename}-${file.size}`}>
                  <a
                    className={styles.attachLink}
                    href={`/api/attachment?folder=${encodeURIComponent(message.folder)}&uid=${message.uid}&filename=${encodeURIComponent(file.filename)}`}
                    download={file.filename}
                  >
                    <span className={styles.attachIcon}>📎</span>
                    {file.filename} ({formatSize(file.size)})
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </article>
  );
}
