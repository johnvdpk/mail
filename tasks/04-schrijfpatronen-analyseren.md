# Taak 4: Schrijfpatronen analyseren uit verzonden mails

**Status:** pending
**Fase:** 2 — Self-Learning Tone of Voice
**Prioriteit:** High
**Geschatte inspanning:** 6-8 uur
**Blokkeert:** Taak 5

## Omschrijving
Nieuw `lib/learn-tone.ts` dat laatste 50-100 verzonden mails analyseert: gemiddelde lengte, woordgebruik, zinsstructuur, openers/closers, formaliteit per contact. Nieuwe tabel `writing_profile` in database.

## Database
```sql
CREATE TABLE writing_profile (
  id INT PRIMARY KEY,
  avg_length INT,
  word_frequency JSONB,
  sentence_patterns TEXT,
  detected_rules TEXT,
  confidence FLOAT,
  analyzed_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## Betrokken bestanden
- `lib/learn-tone.ts` (nieuw)
- Database schema update
