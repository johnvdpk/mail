import { requireAuth } from "@/lib/auth/auth";
import { fetchAllAttachments } from "@/lib/mail/sync";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { logger } from "@/lib/shared/logger";

export const dynamic = "force-dynamic";

/** Ensure unique names inside the zip when filenames collide. */
function uniqueFilename(used: Map<string, number>, filename: string): string {
  const count = used.get(filename) ?? 0;
  used.set(filename, count + 1);
  if (count === 0) return filename;

  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return `${filename} (${count})`;
  return `${filename.slice(0, dot)} (${count})${filename.slice(dot)}`;
}

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const folder = url.searchParams.get("folder");
    const uid = Number(url.searchParams.get("uid"));

    if (!folder || !uid) {
      return NextResponse.json({ error: "folder en uid zijn verplicht" }, { status: 400 });
    }

    const attachments = await fetchAllAttachments(folder, uid);
    if (attachments.length === 0) {
      return NextResponse.json({ error: "Geen bijlagen gevonden" }, { status: 404 });
    }

    const zip = new JSZip();
    const used = new Map<string, number>();
    for (const file of attachments) {
      zip.file(uniqueFilename(used, file.filename), file.data);
    }

    const data = await zip.generateAsync({ type: "uint8array" });
    const zipName = `bijlagen-${uid}.zip`;

    return new NextResponse(Buffer.from(data), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(zipName)}"`,
        "Content-Length": String(data.byteLength),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bijlagen ophalen mislukt";
    logger.error({ route: "attachments", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
