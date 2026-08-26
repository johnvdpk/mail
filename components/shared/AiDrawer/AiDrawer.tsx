"use client";

import type { TipsResult } from "@/lib/ai/ai-mail";
import styles from "./AiDrawer.module.css";

type Props = {
  tips: TipsResult | null;
  loading: boolean;
  available: boolean;
  draftingPoint: string | null;
  onRefresh: () => void;
  onDraftFromPoint: (point: string) => void;
  onClose: () => void;
};

export function AiDrawer({
  tips,
  loading,
  available,
  draftingPoint,
  onRefresh,
  onDraftFromPoint,
  onClose,
}: Props) {
  return (
    <aside className={styles.drawer} aria-label="AI-hulp">
      <header className={styles.head}>
        <h3 className={styles.title}>AI-hulp</h3>
        <button type="button" className={styles.close} onClick={onClose}>
          Sluiten
        </button>
      </header>

      <button type="button" disabled={!available || loading} onClick={onRefresh}>
        {loading ? "Analyseert…" : tips ? "Opnieuw analyseren" : "Analyseer conversatie"}
      </button>

      {!available && (
        <p className={styles.note}>Zet OPENROUTER_AI in .env.local om AI te gebruiken.</p>
      )}

      {tips?.summary && (
        <section className={styles.block}>
          <h4 className={styles.blockTitle}>Samenvatting</h4>
          <p className={styles.summary}>{tips.summary}</p>
        </section>
      )}

      {tips && tips.tips.length > 0 && (
        <section className={styles.block}>
          <h4 className={styles.blockTitle}>Tips</h4>
          <ul className={styles.list}>
            {tips.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      )}

      {tips && tips.talkingPoints.length > 0 && (
        <section className={styles.block}>
          <h4 className={styles.blockTitle}>Talking points</h4>
          <p className={styles.pointHint}>Klik om een concept-reply te genereren</p>
          <ul className={styles.list}>
            {tips.talkingPoints.map((point) => (
              <li key={point}>
                <button
                  type="button"
                  className={styles.pointBtn}
                  disabled={draftingPoint !== null}
                  onClick={() => onDraftFromPoint(point)}
                >
                  {draftingPoint === point ? "Concept wordt geschreven…" : point}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
