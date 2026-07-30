import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { fetchAttachment } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const folder = url.searchParams.get("folder");
    const uid = Number(url.searchParams.get("uid"));
    const filename = url.searchParams.get("filename");

    if (!folder || !uid || !filename) {
      return NextResponse.json(
        { error: "folder, uid en filename zijn verplicht" },
        { status: 400 }
      );
    }

    const result = await fetchAttachment(folder, uid, filename);
    if (!result) {
      return NextResponse.json({ error: "Bijlage niet gevonden" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(result.data), {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(result.filename)}"`,
        "Content-Length": String(result.data.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bijlage ophalen mislukt";
    console.error("[attachment]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
