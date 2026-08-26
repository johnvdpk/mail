"use client";

import { FormEvent, useState } from "react";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import styles from "./LoginScreen.module.css";

type Props = {
  onSuccess: () => void;
};

export default function LoginScreen({ onSuccess }: Props) {
  const [password, setPassword] = useState("");
  const { loading, error, run } = useAsyncAction();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await run(
      () =>
        apiRequest("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        }),
      "Inloggen mislukt"
    );
    if (result !== undefined) onSuccess();
  }

  return (
    <div className={styles.backdrop}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Mail</h1>
        <p className={styles.subtitle}>Log in om verder te gaan</p>

        <input
          className={styles.input}
          type="password"
          placeholder="Wachtwoord"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.button} type="submit" disabled={loading || !password}>
          {loading ? "Bezig..." : "Inloggen"}
        </button>
      </form>
    </div>
  );
}
