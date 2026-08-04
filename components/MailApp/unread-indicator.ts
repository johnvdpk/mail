const BASE_TITLE = "Mail — john@aiadapt.nl";

/** Draws a simple envelope favicon with an optional red unread-count badge. */
function drawFavicon(unread: number): string {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#2563eb";
  ctx.beginPath();
  ctx.roundRect(4, 12, 56, 40, 8);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(8, 16);
  ctx.lineTo(32, 38);
  ctx.lineTo(56, 16);
  ctx.stroke();

  if (unread > 0) {
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(48, 16, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(unread > 9 ? "9+" : String(unread), 48, 17);
  }

  return canvas.toDataURL("image/png");
}

/** Updates the tab title and favicon to reflect the current inbox unread count. */
export function applyUnreadIndicator(unread: number) {
  if (typeof document === "undefined") return;

  document.title = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${BASE_TITLE}` : BASE_TITLE;

  const href = drawFavicon(unread);
  if (!href) return;
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

/** Shows a desktop notification for newly arrived mail, if permission was granted. */
export function notifyNewMail(count: number) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const body = count === 1 ? "Je hebt 1 nieuwe e-mail" : `Je hebt ${count} nieuwe e-mails`;
  new Notification("Nieuwe e-mail", { body, tag: "mail-new" });
}
