"use client";

import { FormEvent, useState } from "react";
import styles from "./LoginScreen.module.css";

type Props = {
  onSuccess: () => void;
};

export default function LoginScreen({ onSuccess }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        onSuccess();
      } else {
        setError("Verkeerd wachtwoord");
      }
    } catch {
      setError("Verbindingsfout");
    } finally {
      setLoading(false);
    }
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
