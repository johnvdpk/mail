import { useEffect, useRef, useState } from "react";
import styles from "./ThreadView.module.css";

/**
 * Sizes the iframe to its content instead of giving it a fixed height with
 * its own scrollbar — the message list is the only scroll container.
 */
export function HtmlBody({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      html, body { margin: 0; padding: 0; }
      body { padding: 8px; font-family: system-ui, sans-serif; font-size: 14px; color: #e8edf4; background: transparent; overflow-wrap: anywhere; }
      a { color: #3b82f6; }
      img { max-width: 100%; height: auto; }
    </style></head><body>${html}</body></html>`);
    doc.close();

    const resize = () => {
      if (doc.body) setHeight(doc.body.scrollHeight + 16);
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(doc.body);
    const images = doc.querySelectorAll("img");
    images.forEach((img) => img.addEventListener("load", resize));

    return () => observer.disconnect();
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      className={styles.htmlFrame}
      style={{ height }}
      sandbox="allow-same-origin"
      title="HTML bericht"
    />
  );
}
