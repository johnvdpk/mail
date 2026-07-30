import { env, loadEnvFromFile } from "./env";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

export function isOpenRouterConfigured(): boolean {
  loadEnvFromFile();
  return Boolean(env("OPENROUTER_AI"));
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
      model: options?.model ?? DEFAULT_MODEL,
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
