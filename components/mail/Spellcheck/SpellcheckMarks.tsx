"use client";

import { Fragment } from "react";
import type { SpellingCorrection } from "@/lib/ai/ai-mail";
import styles from "./SpellcheckMarks.module.css";

type Segment = { text: string; correction?: SpellingCorrection };

/** Locate each correction's exact fragment in `text` and split it into plain/marked segments. */
function buildSegments(text: string, corrections: SpellingCorrection[]): Segment[] {
  type Match = { start: number; end: number; correction: SpellingCorrection };
  const taken: Match[] = [];

  for (const correction of corrections) {
    let from = 0;
    let index = -1;
    while (from <= text.length) {
      index = text.indexOf(correction.original, from);
      if (index === -1) break;
      const overlaps = taken.some((m) => index! < m.end && index! + correction.original.length > m.start);
      if (!overlaps) break;
      from = index + 1;
    }
    if (index === -1) continue;
    taken.push({ start: index, end: index + correction.original.length, correction });
  }

  taken.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of taken) {
    if (match.start > cursor) segments.push({ text: text.slice(cursor, match.start) });
    segments.push({ text: text.slice(match.start, match.end), correction: match.correction });
    cursor = match.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

type BackdropProps = {
  text: string;
  corrections: SpellingCorrection[];
  scrollRef?: React.Ref<HTMLDivElement>;
};

/**
 * Transparent overlay placed behind the compose textarea. Renders the same text (invisible)
 * so its layout lines up pixel-for-pixel, with wavy underlines under flagged fragments.
 */
export function SpellcheckBackdrop({ text, corrections, scrollRef }: BackdropProps) {
  if (!corrections.length) return null;
  const segments = buildSegments(text, corrections);

  return (
    <div className={styles.backdrop} ref={scrollRef} aria-hidden="true">
      {segments.map((segment, i) =>
        segment.correction ? (
          <mark key={i} className={styles.mark}>
            {segment.text}
          </mark>
        ) : (
          <Fragment key={i}>{segment.text}</Fragment>
        )
      )}
    </div>
  );
}

type SuggestionsProps = {
  corrections: SpellingCorrection[];
  onAccept: (correction: SpellingCorrection) => void;
  onDismiss: (correction: SpellingCorrection) => void;
};

/** List of suggested corrections with accept/dismiss actions, shown below the textarea. */
export function SpellcheckSuggestions({ corrections, onAccept, onDismiss }: SuggestionsProps) {
  if (!corrections.length) return null;

  return (
    <ul className={styles.suggestions}>
      {corrections.map((correction, i) => (
        <li key={`${correction.original}-${i}`} className={styles.suggestion}>
          <span className={styles.suggestionText}>
            <s>{correction.original}</s> → <strong>{correction.suggestion}</strong>
          </span>
          <span className={styles.suggestionActions}>
            <button type="button" onClick={() => onAccept(correction)}>
              Accepteren
            </button>
            <button type="button" onClick={() => onDismiss(correction)}>
              Negeren
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
