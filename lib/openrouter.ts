import { env, loadEnvFromFile } from "./env";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";
const DEFAULT_HEAVY_MODEL = "anthropic/claude-sonnet-4.5";

export function isOpenRouterConfigured(): boolean {
  loadEnvFromFile();
  return Boolean(env("OPENROUTER_AI"));
}

/** Licht/snel model voor classificatie-achtig werk (intentdetectie, keyword-extractie, polish). */
export function getLightModel(): string {
  loadEnvFromFile();
  return env("OPENROUTER_MODEL") ?? DEFAULT_MODEL;
}

/** Zwaarder model voor kwaliteitskritische taken (klantmail-drafts, tone-regels, relevantiebeoordeling). */
export function getHeavyModel(): string {
  loadEnvFromFile();
  return env("OPENROUTER_MODEL_HEAVY") ?? DEFAULT_HEAVY_MODEL;
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { model?: string; temperature?: number; jsonMode?: boolean }
): Promise<string> {
  const apiKey = env("OPENROUTER_AI");
  if (!apiKey) {
    throw new Error("OPENROUTER_AI niet geconfigureerd in .env.local (projectroot)");
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://aiadapt.nl",
      "X-OpenRouter-Title": "Mail AI",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options?.model ?? getLightModel(),
      temperature: options?.temperature ?? 0.4,
      messages,
      ...(options?.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`OpenRouter fout (${response.status}): ${errBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Leeg antwoord van OpenRouter");
  }

  return content;
}

/** Stream text deltas from OpenRouter (SSE). */
export async function* chatCompletionStream(
  messages: ChatMessage[],
  options?: { model?: string; temperature?: number; jsonMode?: boolean }
): AsyncGenerator<string> {
  const apiKey = env("OPENROUTER_AI");
  if (!apiKey) {
    throw new Error("OPENROUTER_AI niet geconfigureerd in .env.local (projectroot)");
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://aiadapt.nl",
      "X-OpenRouter-Title": "Mail AI",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options?.model ?? getLightModel(),
      temperature: options?.temperature ?? 0.4,
      messages,
      stream: true,
      ...(options?.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`OpenRouter fout (${response.status}): ${errBody.slice(0, 200)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Geen stream van OpenRouter");
  }

  const decoder = new TextDecoder();
  let sseBuffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const payload = JSON.parse(trimmed.slice(6)) as {
          choices?: { delta?: { content?: string } }[];
          error?: { message?: string };
        };

        if (payload.error?.message) {
          throw new Error(payload.error.message);
        }

        const delta = payload.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          yield delta;
        }
      } catch (err) {
        if (err instanceof SyntaxError) continue;
        throw err;
      }
    }
  }
}
