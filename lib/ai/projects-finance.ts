import { chatCompletion, getLightModel } from "./openrouter";
import { parseJsonObject } from "./llm-json";
import { matchRule } from "../projects/counterparty-rules";
import type { CounterpartyRule, LineDirection } from "../projects/types";

export type ProjectHint = { id: number; name: string; clientName: string; isOverhead: boolean };

export type LineSuggestion = {
  direction: LineDirection;
  name: string;
  /** Original free-text bank description (e.g. invoice number), verbatim — not summarized. */
  note: string | null;
  amount: number;
  projectId: number | null;
  vatRate: number | null;
  /** Free-text category guess; matched against the user's saved categories, not a fixed list. */
  category: string | null;
  occurredOn: string | null;
};

export type CsvImportRow = {
  date?: string;
  description?: string;
  amount?: string;
  [key: string]: string | undefined;
};

const CSV_SYSTEM = `Je helpt een ZZP'er bankmutaties omzetten naar boekingsregels.

Regels:
- Antwoord ALLEEN als JSON-object met key "rows" (array), één item per aangeleverde mutatie in dezelfde volgorde.
- Per item: direction ("income" of "expense"), name (kort Nederlands, max 80 tekens), note (de originele omschrijving/mededeling uit de brontekst, ONGEWIJZIGD overgenomen inclusief factuur-/kenmerknummers, of null als er niets extra's staat), amount (positief getal), projectId (number of null), vatRate (0, 9, 21 of null), category (korte Nederlandse kostencategorie, bijv. "software" of "reiskosten", alleen bij expense — anders null), occurredOn (YYYY-MM-DD of null).
- projectId: kies een bestaand project als de omschrijving bij een klantnaam past, anders null (algemene bedrijfskosten).
- amount is altijd positief; direction bepaalt in/uit.
- Geen extra keys, geen markdown.`;

const MAIL_SYSTEM = `Je helpt een ZZP'er een ontvangen factuurmail omzetten naar één uitgave-regel.

Regels:
- Antwoord ALLEEN als JSON-object met keys: direction, name, note, amount, projectId, vatRate, category, occurredOn.
- direction is bijna altijd "expense" (inkomende factuur). Alleen "income" als het duidelijk een verkoopfactuur/creditnota aan de ZZP'er is.
- name: kort Nederlands (leverancier + waarvoor).
- note: het factuurnummer/kenmerk uit de mail indien aanwezig, anders null.
- amount: positief getal, het totaalbedrag inclusief BTW als dat in de mail staat, anders het genoemde bedrag.
- projectId: bestaand project als de klant/leverancier matcht, anders null.
- vatRate: 0, 9, 21 of null.
- category: korte Nederlandse kostencategorie (bijv. "software", "reiskosten").
- occurredOn: factuurdatum YYYY-MM-DD als die in de mail staat, anders de maildatum.
- Geen extra keys, geen markdown.`;

const REMINDER_SYSTEM = `Je schrijft een korte, beleefde betalingsherinnering in het Nederlands.
Schrijf ALLEEN de body (geen onderwerpregel).
Geen puntkomma's, geen streepjes als leesteken.
Sluit af met:

Groeten,
John

Antwoord als JSON-object met key "body".`;

export async function suggestCsvLines(
  rows: CsvImportRow[],
  projects: ProjectHint[]
): Promise<LineSuggestion[]> {
  const content = await chatCompletion(
    [
      { role: "system", content: CSV_SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          projects: projects.map((project) => ({
            id: project.id,
            name: project.name,
            clientName: project.clientName,
            overhead: project.isOverhead,
          })),
          mutations: rows,
        }),
      },
    ],
    { model: getLightModel(), temperature: 0.1, jsonMode: true }
  );
  return parseSuggestionList(content, rows.length);
}

export async function suggestMailLine(
  input: {
    subject: string;
    from: string;
    date: string;
    text: string;
    attachmentNames: string[];
  },
  projects: ProjectHint[]
): Promise<LineSuggestion> {
  const content = await chatCompletion(
    [
      { role: "system", content: MAIL_SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          projects: projects.map((project) => ({
            id: project.id,
            name: project.name,
            clientName: project.clientName,
            overhead: project.isOverhead,
          })),
          mail: input,
        }),
      },
    ],
    { model: getLightModel(), temperature: 0.1, jsonMode: true }
  );
  const parsed = parseJsonObject(content);
  const row = parsed ? normalizeSuggestion(parsed) : null;
  if (!row) {
    throw new Error("Geen geldige boekingssuggestie ontvangen");
  }
  return row;
}

export async function generatePaymentReminder(input: {
  clientName: string;
  projectName: string;
  lineName: string;
  amount: number;
  daysOpen: number;
}): Promise<string> {
  const content = await chatCompletion(
    [
      { role: "system", content: REMINDER_SYSTEM },
      {
        role: "user",
        content: [
          `Klant: ${input.clientName || input.projectName}`,
          `Project: ${input.projectName}`,
          `Omschrijving: ${input.lineName}`,
          `Bedrag: €${input.amount.toFixed(2)}`,
          `Dagen open: ${input.daysOpen}`,
        ].join("\n"),
      },
    ],
    { model: getLightModel(), temperature: 0.4, jsonMode: true }
  );
  const parsed = parseJsonObject(content);
  const body = typeof parsed?.body === "string" ? parsed.body.trim() : "";
  if (!body) {
    throw new Error("Geen herinneringstekst ontvangen");
  }
  return body;
}

function parseSuggestionList(raw: string, expected: number): LineSuggestion[] {
  const parsed = parseJsonObject(raw);
  const rows = parsed && Array.isArray(parsed.rows) ? parsed.rows : [];
  const suggestions: LineSuggestion[] = [];
  for (let i = 0; i < expected; i++) {
    const item = rows[i];
    const normalized = item && typeof item === "object" ? normalizeSuggestion(item as Record<string, unknown>) : null;
    suggestions.push(
      normalized ?? {
        direction: "expense",
        name: "Onbekende mutatie",
        note: null,
        amount: 0,
        projectId: null,
        vatRate: null,
        category: "overig",
        occurredOn: null,
      }
    );
  }
  return suggestions;
}

function normalizeSuggestion(raw: Record<string, unknown>): LineSuggestion | null {
  const direction = raw.direction === "income" || raw.direction === "expense" ? raw.direction : null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const amount = typeof raw.amount === "number" ? raw.amount : Number(raw.amount);
  if (!direction || !name || !Number.isFinite(amount) || amount < 0) return null;
  const projectId = typeof raw.projectId === "number" && Number.isInteger(raw.projectId) ? raw.projectId : null;
  const vatRate =
    raw.vatRate === null || raw.vatRate === undefined
      ? null
      : typeof raw.vatRate === "number" && [0, 9, 21].includes(raw.vatRate)
        ? raw.vatRate
        : null;
  const category =
    typeof raw.category === "string" && raw.category.trim()
      ? raw.category.trim().slice(0, 60)
      : direction === "expense"
        ? "overig"
        : null;
  const occurredOn =
    typeof raw.occurredOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.occurredOn) ? raw.occurredOn : null;
  const note = typeof raw.note === "string" && raw.note.trim() ? raw.note.trim().slice(0, 500) : null;
  return {
    direction,
    name: name.slice(0, 80),
    note,
    amount: Math.round(amount * 100) / 100,
    projectId,
    vatRate,
    category,
    occurredOn,
  };
}

/**
 * A saved counterparty rule always wins over the LLM's guess — matched against the raw CSV
 * row text (all column values) so it doesn't depend on how the LLM phrased `name`/`note`.
 */
export function applyRulesToSuggestions(
  suggestions: LineSuggestion[],
  rawRows: Array<Record<string, string | undefined>>,
  rules: CounterpartyRule[]
): LineSuggestion[] {
  if (rules.length === 0) return suggestions;
  return suggestions.map((suggestion, index) => {
    const rawRow = rawRows[index] ?? {};
    const haystack = [Object.values(rawRow).join(" "), suggestion.name, suggestion.note ?? ""].join(" ");
    const rule = matchRule(haystack, rules);
    if (!rule) return suggestion;
    return {
      ...suggestion,
      category: rule.category ?? suggestion.category,
      projectId: rule.projectId ?? suggestion.projectId,
    };
  });
}
