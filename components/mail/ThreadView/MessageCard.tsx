import { useEffect, useRef, useState } from "react";
import type { ThreadMessage } from "@/lib/shared/types";
import { CalendarInviteBanner } from "@/components/mail/CalendarInviteBanner/CalendarInviteBanner";
import { HtmlBody } from "./HtmlBody";
import { formatDateTime, formatSize, linkify, splitQuote } from "@/lib/mail/thread-utils";
import styles from "./ThreadView.module.css";

type Props = {
  message: ThreadMessage;
  defaultOpen: boolean;
  isLast: boolean;
  googleConnected: boolean;
  googleConfigured: boolean;
  onBookExpense?: (messageId: string) => void;
};

function formatAddress(addr?: { name?: string; email: string }): string {
  if (!addr) return "onbekend";
  if (addr.name && addr.name !== addr.email) return `${addr.name} <${addr.email}>`;
  return addr.email;
}

function formatAddressList(addrs: Array<{ name?: string; email: string }>): string {
  if (addrs.length === 0) return "onbekend";
  return addrs.map((a) => (a.name && a.name !== a.email ? a.name : a.email)).join(", ");
}

export function MessageCard({
  message,
  defaultOpen,
  isLast,
  googleConnected,
  googleConfigured,
  onBookExpense,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const { visible, quoted } = splitQuote(message.body?.text ?? message.snippet);
  const [showQuote, setShowQuote] = useState(false);
  const [showHtml, setShowHtml] = useState(false);
  const ref = useRef<HTMLElement>(null);

  const toLabel = formatAddressList(message.to);
  const senderLabel = message.outbound
    ? "Jij"
    : message.from?.name || message.from?.email || "onbekend";

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
            {message.outbound ? (
              <>
                {senderLabel}
                <span className={styles.direction}> → {toLabel}</span>
              </>
            ) : (
              senderLabel
            )}
          </span>
          {!open && (
            <span className={styles.collapsedSnippet}>
              {visible.slice(0, 100)}{visible.length > 100 ? "…" : ""}
            </span>
          )}
        </span>
        <time className={styles.meta} dateTime={message.date}>
          {formatDateTime(message.date)}
        </time>
      </button>

      {open && (
        <div className={styles.body}>
          <dl className={styles.addressMeta}>
            <div>
              <dt>Van</dt>
              <dd>{message.outbound ? formatAddress(message.from) || "Jij" : formatAddress(message.from)}</dd>
            </div>
            <div>
              <dt>Aan</dt>
              <dd>{message.to.map(formatAddress).join(", ") || "onbekend"}</dd>
            </div>
            {message.cc.length > 0 && (
              <div>
                <dt>CC</dt>
                <dd>{message.cc.map(formatAddress).join(", ")}</dd>
              </div>
            )}
            <div>
              <dt>Datum</dt>
              <dd>
                <time dateTime={message.date}>{formatDateTime(message.date)}</time>
              </dd>
            </div>
          </dl>

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
            <div className={styles.attachmentsBlock}>
              {message.body.attachments.length > 1 && (
                <a
                  className={styles.downloadAll}
                  href={`/api/attachments?folder=${encodeURIComponent(message.folder)}&uid=${message.uid}`}
                  download={`bijlagen-${message.uid}.zip`}
                >
                  Alles downloaden ({message.body.attachments.length})
                </a>
              )}
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
              {onBookExpense && !message.outbound && (
                <button type="button" className={styles.quoteToggle} onClick={() => onBookExpense(message.id)}>
                  Als uitgave boeken
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}
