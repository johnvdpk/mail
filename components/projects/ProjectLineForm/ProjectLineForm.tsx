"use client";

import { useState } from "react";
import { todayIso } from "@/lib/projects/period";
import type { BillingType, LineDirection, LineInput, PeriodicCadence, ProjectLine } from "@/lib/projects/types";
import { CategorySelect } from "../CategorySelect/CategorySelect";
import { BILLING_LABELS, CADENCE_LABELS, VAT_RATE_OPTIONS } from "../labels";
import styles from "../ProjectsPanel/ProjectsPanel.module.css";

type Props = {
  direction: LineDirection;
  submitting: boolean;
  initial?: ProjectLine;
  onSubmit: (input: LineInput) => void;
  onCancel?: () => void;
};

export function ProjectLineForm({ direction, submitting, initial, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [billing, setBilling] = useState<BillingType>(initial?.billing ?? "one_off");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [cadence, setCadence] = useState<PeriodicCadence>(initial?.cadence ?? "month");
  const [useHours, setUseHours] = useState(initial?.hours != null);
  const [hours, setHours] = useState(initial?.hours != null ? String(initial.hours) : "");
  const [occurredOn, setOccurredOn] = useState(initial?.occurredOn ?? todayIso());
  const [paid, setPaid] = useState(initial?.paidOn != null);
  const [paidOn, setPaidOn] = useState(initial?.paidOn ?? todayIso());
  const [vatRate, setVatRate] = useState(initial?.vatRate != null ? String(initial.vatRate) : "");
  const [category, setCategory] = useState<string | null>(
    initial?.category ?? (direction === "expense" ? "overig" : null)
  );
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? "");
  const [amountIncludesVat, setAmountIncludesVat] = useState(initial?.amountIncludesVat ?? false);

  const amountLabel = useHours ? "Tarief per uur" : billing === "periodic" ? "Bedrag per keer" : "Bedrag";

  function reset() {
    setName("");
    setBilling("one_off");
    setAmount("");
    setCadence("month");
    setUseHours(false);
    setHours("");
    setOccurredOn(todayIso());
    setPaid(false);
    setPaidOn(todayIso());
    setVatRate("");
    setCategory(direction === "expense" ? "overig" : null);
    setAmountIncludesVat(false);
    setStartsOn("");
    setEndsOn("");
  }

  return (
    <form
      className={styles.lineForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || !amount.trim()) return;
        onSubmit({
          direction,
          billing,
          name: name.trim(),
          amount: Number(amount.replace(",", ".")),
          hours: billing === "one_off" && useHours ? Number(hours.replace(",", ".")) : null,
          cadence: billing === "periodic" ? cadence : null,
          occurredOn: billing === "one_off" ? occurredOn : null,
          paidOn: billing === "one_off" && paid ? paidOn : null,
          vatRate: vatRate.trim() ? Number(vatRate.replace(",", ".")) : null,
          category,
          amountIncludesVat,
          startsOn: billing === "periodic" && startsOn ? startsOn : null,
          endsOn: billing === "periodic" && endsOn ? endsOn : null,
          sourceMessageId: initial?.sourceMessageId ?? null,
          note: initial?.note ?? null,
        });
        if (!initial) reset();
      }}
    >
      <input
        value={name}
        placeholder={direction === "income" ? "Bijv. hosting aap.nl" : "Bijv. VPS"}
        onChange={(event) => setName(event.target.value)}
      />
      <div className={styles.row}>
        <select
          value={billing}
          onChange={(event) => setBilling(event.target.value as BillingType)}
          aria-label="Type regel"
        >
          {(Object.keys(BILLING_LABELS) as BillingType[]).map((key) => (
            <option key={key} value={key}>
              {BILLING_LABELS[key]}
            </option>
          ))}
        </select>
        <input
          value={amount}
          inputMode="decimal"
          placeholder={amountLabel}
          aria-label={amountLabel}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>

      {billing === "periodic" && (
        <>
          <select
            value={cadence}
            onChange={(event) => setCadence(event.target.value as PeriodicCadence)}
            aria-label="Cadans"
          >
            {(Object.keys(CADENCE_LABELS) as PeriodicCadence[]).map((key) => (
              <option key={key} value={key}>
                {CADENCE_LABELS[key]}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={startsOn}
            aria-label="Start op (optioneel)"
            title="Start op (optioneel)"
            onChange={(event) => setStartsOn(event.target.value)}
          />
          <p className={styles.itemMeta}>Start op (optioneel, leeg = vanaf projectstart)</p>
          <input
            type="date"
            value={endsOn}
            aria-label="Eindigt op (optioneel)"
            title="Eindigt op (optioneel)"
            onChange={(event) => setEndsOn(event.target.value)}
          />
          <p className={styles.itemMeta}>Eindigt op (optioneel)</p>
        </>
      )}

      {billing === "one_off" && (
        <>
          <input
            type="date"
            value={occurredOn}
            aria-label="Datum waarop dit telt"
            onChange={(event) => setOccurredOn(event.target.value)}
          />
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={useHours}
              onChange={(event) => setUseHours(event.target.checked)}
            />
            Op uurbasis (tarief × uren)
          </label>
          {useHours && (
            <input
              value={hours}
              inputMode="decimal"
              placeholder="Aantal uren"
              aria-label="Aantal uren"
              onChange={(event) => setHours(event.target.value)}
            />
          )}
        </>
      )}

      <div className={styles.row}>
        <select
          value={vatRate}
          onChange={(event) => setVatRate(event.target.value)}
          aria-label="BTW-percentage"
        >
          <option value="">Geen BTW</option>
          {VAT_RATE_OPTIONS.filter((rate) => rate > 0).map((rate) => (
            <option key={rate} value={rate}>
              {rate}% BTW
            </option>
          ))}
        </select>
        <CategorySelect
          direction={direction}
          value={category}
          onChange={setCategory}
          allowEmpty={direction === "income"}
        />
        {vatRate && (
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={amountIncludesVat}
              onChange={(event) => setAmountIncludesVat(event.target.checked)}
            />
            Bedrag is incl. BTW
          </label>
        )}
        {billing === "one_off" && (
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={paid}
              onChange={(event) => setPaid(event.target.checked)}
            />
            Betaald
          </label>
        )}
      </div>
      {billing === "one_off" && paid && (
        <input
          type="date"
          value={paidOn}
          aria-label="Betaald op"
          onChange={(event) => setPaidOn(event.target.value)}
        />
      )}
      {billing === "periodic" && (
        <p className={styles.itemMeta}>Betaalstatus per maand zet je na het opslaan onder de regel.</p>
      )}

      <div className={styles.actions}>
        <button
          type="submit"
          disabled={
            submitting || !name.trim() || !amount.trim() || (useHours && !hours.trim())
          }
        >
          {submitting ? "Opslaan…" : initial ? "Opslaan" : "Regel toevoegen"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Annuleren
          </button>
        )}
      </div>
    </form>
  );
}
