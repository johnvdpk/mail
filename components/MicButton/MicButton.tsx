"use client";

import { useRef, useState } from "react";
import styles from "./MicButton.module.css";

type Props = {
  onText: (text: string) => void;
  disabled?: boolean;
  title?: string;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function MicButton({ onText, disabled, title }: Props) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => void transcribe();
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Geen toegang tot microfoon");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setRecording(false);
  }

  async function transcribe() {
    if (chunksRef.current.length === 0) return;
    setTranscribing(true);
    setError(null);
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const audio = await blobToBase64(blob);
      const res = await fetch("/api/ai/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio, format: "webm" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Transcriptie mislukt");
      if (data.text) onText(data.text as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcriptie mislukt");
    } finally {
      setTranscribing(false);
    }
  }

  const busy = recording || transcribing;

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={`${styles.mic} ${recording ? styles.recording : ""}`}
        title={title ?? (recording ? "Stop opname" : "Spreek in")}
        aria-pressed={recording}
        aria-busy={transcribing}
        disabled={disabled || transcribing}
        onClick={() => (recording ? stopRecording() : void startRecording())}
      >
        {transcribing ? <span className={styles.spinner} aria-hidden="true" /> : "🎤"}
      </button>
      {error && !busy && <span className={styles.error}>{error}</span>}
    </span>
  );
}
