import { useEffect, useRef } from "react";
import styles from "./ThreadView.module.css";

export function HtmlBody({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      html, body { margin: 0; padding: 0; height: 100%; }
      body { padding: 8px; font-family: system-ui, sans-serif; font-size: 14px; color: #e8edf4; background: transparent; overflow-wrap: anywhere; overflow-y: auto; }
      a { color: #3b82f6; }
      img { max-width: 100%; height: auto; }
    </style></head><body>${html}</body></html>`);
    doc.close();
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      className={styles.htmlFrame}
      sandbox="allow-same-origin"
      title="HTML bericht"
    />
  );
}
