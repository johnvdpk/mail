"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AddressInput.module.css";

type Suggestion = { email: string; name: string | null };

type Props = {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onChange: (value: string) => void;
};

/** Text input for To/CC/BCC with email-address suggestions from mail history as you type. */
export function AddressInput({ value, placeholder, autoFocus, className, onChange }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  function currentSegment(text: string): string {
    const parts = text.split(/[,;]/);
    return parts[parts.length - 1].trim();
  }

  useEffect(() => {
    const term = currentSegment(value);
    if (!term) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      fetch(`/api/contacts/suggest?q=${encodeURIComponent(term)}`)
        .then((res) => (res.ok ? res.json() : { suggestions: [] }))
        .then((data) => {
          if (id !== requestId.current) return;
          const results: Suggestion[] = Array.isArray(data.suggestions) ? data.suggestions : [];
          setSuggestions(results);
          setActiveIndex(0);
          setOpen(results.length > 0);
        })
        .catch(() => {
          if (id === requestId.current) setSuggestions([]);
        });
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function pick(suggestion: Suggestion) {
    const parts = value.split(/[,;]/);
    parts[parts.length - 1] = ` ${suggestion.email}`;
    const next = parts.map((p, i) => (i === 0 ? p.trim() : p)).join(",");
    onChange(`${next}, `);
    setOpen(false);
    setSuggestions([]);
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      pick(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
      <input
        ref={inputRef}
        type="text"
        className={className}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {open && (
        <ul className={styles.menu} role="listbox">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.email} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={index === activeIndex ? styles.active : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(suggestion)}
              >
                {suggestion.name ? (
                  <>
                    <span className={styles.name}>{suggestion.name}</span>
                    <span className={styles.email}>{suggestion.email}</span>
                  </>
                ) : (
                  <span className={styles.email}>{suggestion.email}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
