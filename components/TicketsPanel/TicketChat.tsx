"use client";

import { useEffect, useRef, useState } from "react";
import { MicButton } from "@/components/MicButton/MicButton";
import styles from "./TicketChat.module.css";

type Message = { role: "user" | "assistant"; content: string };
type Draft = { title: string; description: string };

const WELCOME =
  "Waar wil je aan werken? Vertel je idee — ik denk mee en stel eventueel een paar vragen terug voordat we er een ticket van maken.";

type Props = {
  onCreate: (title: string, description: string) => void;
  submitting: boolean;
  onCancel: () => void;
};

export function TicketChat({ onCreate, submitting, onCancel }: Props) {
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: WELCOME }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [finalizing, setFinalizing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const hasUserMessage = messages.some((m) => m.role === "user");

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    setError(null);
    const nextMessages = [...messages, { role: "user" as const, content: text.trim() }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/tickets/draft-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Bericht versturen mislukt");
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          assistantMessage += decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: "assistant", content: assistantMessage };
            return copy;
          });
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }

  async function onStartTicket() {
    setFinalizing(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets/draft-chat/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        title?: string;
        description?: string;
        error?: string;
      };
      if (!res.ok || !data.title || !data.description) {
        setError(data.error ?? "Ticket samenstellen mislukt");
        return;
      }
      setDraft({ title: data.title, description: data.description });
    } finally {
      setFinalizing(false);
    }
  }

  if (draft) {
    return (
      <div className={styles.draft}>
        <div className={styles.inputWithMic}>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <MicButton onText={(text) => setDraft((d) => (d ? { ...d, title: `${d.title} ${text}`.trim() } : d))} />
        </div>
        <div className={styles.inputWithMic}>
          <textarea
            value={draft.description}
            rows={6}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <MicButton
            onText={(text) => setDraft((d) => (d ? { ...d, description: `${d.description} ${text}`.trim() } : d))}
          />
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.draftActions}>
          <button
            type="button"
            onClick={() => onCreate(draft.title.trim(), draft.description.trim())}
            disabled={submitting || !draft.title.trim() || !draft.description.trim()}
          >
            {submitting ? "Aanmaken…" : "Ticket aanmaken"}
          </button>
          <button type="button" onClick={() => setDraft(null)} disabled={submitting}>
            Terug naar gesprek
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.chat}>
      <div className={styles.thread}>
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === "user" ? styles.rowUser : styles.rowAssistant}>
            <div className={msg.role === "user" ? styles.bubbleUser : styles.bubbleAssistant}>{msg.content}</div>
          </div>
        ))}
        {loading && messages[messages.length - 1]?.content === "" && (
          <div className={styles.rowAssistant}>
            <div className={styles.typingBubble}>
              AI is typend
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
            </div>
          </div>
        )}
        <div ref={threadEndRef} />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
      >
        <div className={styles.inputWithMic}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Typ je bericht…"
            rows={2}
            disabled={loading}
          />
          <MicButton onText={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))} />
        </div>
        <div className={styles.composerActions}>
          <button type="button" onClick={onCancel} disabled={loading || finalizing}>
            Annuleren
          </button>
          <div className={styles.composerActionsRight}>
            <button type="submit" disabled={loading || !input.trim()}>
              Versturen
            </button>
            <button
              type="button"
              className={styles.createButton}
              onClick={onStartTicket}
              disabled={!hasUserMessage || loading || finalizing}
            >
              {finalizing ? "Bezig…" : "Ticket aanmaken"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
