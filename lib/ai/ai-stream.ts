export type AiStreamEvent =
  | { type: "chunk"; body: string }
  | { type: "done"; body: string; notes?: string; intent?: string }
  | { type: "error"; error: string };

export function ndjsonStream(
  producer: (emit: (event: AiStreamEvent) => void) => Promise<void>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const emit = (event: AiStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        await producer(emit);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Stream mislukt";
        emit({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });
}

export function streamResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Consume an NDJSON AI stream from fetch on the client. */
export async function consumeAiStream(
  response: Response,
  onChunk: (body: string) => void
): Promise<{ body: string; notes?: string; intent?: string }> {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/x-ndjson")) {
    const data = (await response.json()) as { error?: string; body?: string; notes?: string; intent?: string };
    if (!response.ok) throw new Error(data.error ?? "AI-stream mislukt");
    return { body: data.body ?? "", notes: data.notes, intent: data.intent };
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Geen stream beschikbaar");

  const decoder = new TextDecoder();
  let buffer = "";
  let result: { body: string; notes?: string; intent?: string } = { body: "" };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as AiStreamEvent;

      if (event.type === "chunk") {
        result = { ...result, body: event.body };
        onChunk(event.body);
      } else if (event.type === "done") {
        result = {
          body: event.body,
          notes: event.notes,
          intent: event.intent,
        };
        onChunk(event.body);
      } else if (event.type === "error") {
        throw new Error(event.error);
      }
    }
  }

  if (!result.body.trim()) throw new Error("Leeg AI-antwoord");
  return result;
}
