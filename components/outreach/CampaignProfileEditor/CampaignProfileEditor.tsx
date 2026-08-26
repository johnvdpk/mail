"use client";

import { useCallback, useState } from "react";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import type { CampaignProfile, ListColumn, SegmentHint, SnippetItem } from "@/lib/outreach/campaign-profile";
import type { Campaign } from "@/lib/outreach/types";
import styles from "./CampaignProfileEditor.module.css";

type Props = {
  campaign: Campaign;
  onSaved: (campaign: Campaign) => void;
};

type SectionId =
  | "tone"
  | "about"
  | "snippets"
  | "replies"
  | "subjects"
  | "promises"
  | "segments"
  | "footer"
  | "columns";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "tone", label: "Tone of voice" },
  { id: "about", label: "Over mij" },
  { id: "snippets", label: "Mail onderdelen" },
  { id: "replies", label: "Reply teksten" },
  { id: "subjects", label: "Onderwerpregels" },
  { id: "promises", label: "Beloften" },
  { id: "segments", label: "Per situatie" },
  { id: "footer", label: "Footer & test" },
  { id: "columns", label: "Tabelkolommen" },
];

export function CampaignProfileEditor({ campaign, onSaved }: Props) {
  const [profile, setProfile] = useState<CampaignProfile>(campaign.profile);
  const [activeSection, setActiveSection] = useState<SectionId>("tone");
  const [dirty, setDirty] = useState(false);
  const saveAction = useAsyncAction();

  const markDirty = useCallback(<K extends keyof CampaignProfile>(key: K, value: CampaignProfile[K]) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  async function save() {
    const data = await saveAction.run(
      () =>
        apiRequest<{ campaign: Campaign }>(`/api/outreach/campaigns/${campaign.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile }),
        }),
      "Opslaan mislukt"
    );
    if (!data?.campaign) return;
    setProfile(data.campaign.profile);
    setDirty(false);
    onSaved(data.campaign);
  }

  function updateSnippet(id: string, patch: Partial<SnippetItem>) {
    markDirty(
      "snippets",
      profile.snippets.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  function updateReply(id: string, patch: Partial<SnippetItem>) {
    markDirty(
      "replies",
      profile.replies.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  function updateSegment(id: string, patch: Partial<SegmentHint>) {
    markDirty(
      "segments",
      profile.segments.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Campagne-instellingen</h3>
          <p className={styles.subtitle}>
            De AI gebruikt deze teksten bij personalisatie en reply-voorzetten.
          </p>
        </div>
        <div className={styles.headerActions}>
          {dirty && <span className={styles.dirty}>Niet opgeslagen</span>}
          <button type="button" onClick={() => void save()} disabled={saveAction.loading || !dirty}>
            {saveAction.loading ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </div>

      {saveAction.error && <p className={styles.error}>{saveAction.error}</p>}

      <div className={styles.layout}>
        <nav className={styles.sectionNav} aria-label="Onderwerpen">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={activeSection === section.id ? styles.sectionBtnActive : undefined}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div className={styles.panel}>
          {activeSection === "tone" && (
            <>
              <Field
                label="Schrijfregels"
                hint="Hoe de AI moet schrijven"
                value={profile.toneOfVoice.rules}
                onChange={(v) => markDirty("toneOfVoice", { ...profile.toneOfVoice, rules: v })}
                rows={8}
              />
              <Field
                label="Woorden om te vermijden"
                value={profile.toneOfVoice.avoidWords}
                onChange={(v) => markDirty("toneOfVoice", { ...profile.toneOfVoice, avoidWords: v })}
                rows={3}
              />
              <label className={styles.numberField}>
                Max. woorden per mail
                <input
                  type="number"
                  min={80}
                  max={500}
                  value={profile.toneOfVoice.maxWords}
                  onChange={(e) =>
                    markDirty("toneOfVoice", {
                      ...profile.toneOfVoice,
                      maxWords: Number(e.target.value) || 200,
                    })
                  }
                />
              </label>
            </>
          )}

          {activeSection === "about" && (
            <>
              <Field
                label="Wie ben ik"
                value={profile.aboutMe.intro}
                onChange={(v) => markDirty("aboutMe", { ...profile.aboutMe, intro: v })}
              />
              <Field
                label="Achtergrond"
                value={profile.aboutMe.background}
                onChange={(v) => markDirty("aboutMe", { ...profile.aboutMe, background: v })}
              />
              <Field
                label="Waarom ik mail"
                value={profile.aboutMe.whyReachOut}
                onChange={(v) => markDirty("aboutMe", { ...profile.aboutMe, whyReachOut: v })}
              />
            </>
          )}

          {activeSection === "snippets" && (
            <SnippetList items={profile.snippets} onChange={updateSnippet} />
          )}
          {activeSection === "replies" && (
            <SnippetList items={profile.replies} onChange={updateReply} />
          )}

          {activeSection === "subjects" && (
            <>
              <Field
                label="Standaard onderwerpregel"
                hint="Gebruik {naam} voor de leadnaam"
                value={profile.subjectLines.defaultFormat}
                onChange={(v) => markDirty("subjectLines", { ...profile.subjectLines, defaultFormat: v })}
                rows={2}
              />
              <Field
                label="Alternatieven"
                hint="Eén per regel"
                value={profile.subjectLines.alternatives}
                onChange={(v) => markDirty("subjectLines", { ...profile.subjectLines, alternatives: v })}
              />
            </>
          )}

          {activeSection === "promises" && (
            <>
              <Field
                label="Wat ik wél aanbied"
                value={profile.promises.doOffer}
                onChange={(v) => markDirty("promises", { ...profile.promises, doOffer: v })}
                rows={6}
              />
              <Field
                label="Wat ik niet beloof"
                value={profile.promises.dontOffer}
                onChange={(v) => markDirty("promises", { ...profile.promises, dontOffer: v })}
                rows={6}
              />
            </>
          )}

          {activeSection === "segments" && (
            <div className={styles.snippetList}>
              {profile.segments.map((segment) => (
                <article key={segment.id} className={styles.snippetCard}>
                  <h3 className={styles.snippetTitle}>{segment.label}</h3>
                  <Field
                    label="Hint voor AI"
                    value={segment.hint}
                    onChange={(v) => updateSegment(segment.id, { hint: v })}
                    rows={3}
                  />
                </article>
              ))}
            </div>
          )}

          {activeSection === "footer" && (
            <>
              <Field
                label="Footer (platte tekst)"
                hint="Komt onder de mail, boven je handtekening. Bijv. demo-link of inlogcode."
                value={profile.footer.text}
                onChange={(v) => markDirty("footer", { ...profile.footer, text: v })}
                rows={4}
              />
              <Field
                label="Footer (HTML, optioneel)"
                value={profile.footer.html}
                onChange={(v) => markDirty("footer", { ...profile.footer, html: v })}
                rows={6}
              />
              <Field
                label="Testadres"
                hint="Testmails gaan hierheen en tellen niet mee voor dedup."
                value={profile.testEmail}
                onChange={(v) => markDirty("testEmail", v)}
                rows={1}
              />
            </>
          )}

          {activeSection === "columns" && (
            <ColumnEditor
              columns={profile.listColumns}
              onChange={(listColumns) => markDirty("listColumns", listColumns)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SnippetList({
  items,
  onChange,
}: {
  items: SnippetItem[];
  onChange: (id: string, patch: Partial<SnippetItem>) => void;
}) {
  return (
    <div className={styles.snippetList}>
      {items.map((snippet) => (
        <article key={snippet.id} className={styles.snippetCard}>
          <h3 className={styles.snippetTitle}>{snippet.label}</h3>
          {snippet.hint && <p className={styles.snippetHint}>{snippet.hint}</p>}
          <Field label="Tekstblok" value={snippet.text} onChange={(v) => onChange(snippet.id, { text: v })} rows={5} />
          <Field
            label="Eigen info (persoonlijke noot voor AI)"
            value={snippet.personalNote}
            onChange={(v) => onChange(snippet.id, { personalNote: v })}
            rows={3}
            accent
          />
        </article>
      ))}
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  rows = 4,
  accent,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  accent?: boolean;
}) {
  return (
    <label className={`${styles.field} ${accent ? styles.fieldAccent : ""}`}>
      <span className={styles.fieldLabel}>{label}</span>
      {hint && <span className={styles.fieldHint}>{hint}</span>}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} />
    </label>
  );
}

function ColumnEditor({
  columns,
  onChange,
}: {
  columns: ListColumn[];
  onChange: (columns: ListColumn[]) => void;
}) {
  return (
    <div className={styles.snippetList}>
      <p className={styles.snippetHint}>
        Extra kolommen in de leadtabel, per campagne. De sleutel moet matchen met een veld in
        attributes (bijv. qualityScore of bookingType).
      </p>
      {columns.map((column, index) => (
        <div key={`${column.key}-${index}`} className={styles.columnRow}>
          <input
            value={column.key}
            placeholder="sleutel"
            onChange={(e) =>
              onChange(columns.map((c, i) => (i === index ? { ...c, key: e.target.value } : c)))
            }
          />
          <input
            value={column.label}
            placeholder="kolomtitel"
            onChange={(e) =>
              onChange(columns.map((c, i) => (i === index ? { ...c, label: e.target.value } : c)))
            }
          />
          <button
            type="button"
            onClick={() => onChange(columns.filter((_, i) => i !== index))}
          >
            Weg
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...columns, { key: "", label: "" }])}
      >
        Kolom toevoegen
      </button>
    </div>
  );
}
