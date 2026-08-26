"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  ContactReplySet,
  EmailConfig,
  QuickReplyTemplate,
  WritingProfile,
} from "@/lib/config/email-config-shared";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import styles from "../MailConfigEditor.module.css";

type ToneActionResponse = {
  profile?: WritingProfile | null;
  acceptedRules?: string | null;
};

type Props = {
  config: EmailConfig;
  setConfig: Dispatch<SetStateAction<EmailConfig>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
};

export function GeneralTab({ config, setConfig, setError, setMessage }: Props) {
  const [profile, setProfile] = useState<WritingProfile | null>(null);
  const [tweakText, setTweakText] = useState("");
  const { run: runTone, loading: toneBusy } = useAsyncAction();

  useEffect(() => {
    void loadToneProfile();
  }, []);

  async function loadToneProfile() {
    try {
      const data = await apiRequest<{
        profile?: WritingProfile | null;
        refreshed?: boolean;
        significantChange?: boolean;
      }>("/api/tone?refresh=1");
      const next = data.profile ?? null;
      setProfile(next);
      if (next?.pendingSuggestion) setTweakText(next.pendingSuggestion);
      if (data.refreshed && data.significantChange) {
        setMessage("Schrijfstijl opnieuw geanalyseerd — er zijn nieuwe suggesties.");
      }
    } catch {
      // ignore profile load errors
    }
  }

  async function runToneAnalyze() {
    setError(null);
    setMessage(null);
    const data = await runTone(
      () =>
        apiRequest<{ profile: WritingProfile }>("/api/tone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "analyze", limit: 80 }),
        }),
      "Analyse mislukt"
    );
    if (data) {
      setProfile(data.profile);
      if (data.profile?.pendingSuggestion) setTweakText(data.profile.pendingSuggestion);
      setMessage(`Analyse klaar (${data.profile.sampleCount} mails).`);
    } else {
      setError("Analyse mislukt");
    }
  }

  async function toneAction(action: "accept" | "reject" | "tweak") {
    setError(null);
    setMessage(null);
    const fallback = action === "tweak" ? "Opslaan mislukt" : "Actie mislukt";
    const data = await runTone(async () => {
      if (action === "tweak") {
        return apiRequest<ToneActionResponse>("/api/tone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "tweak", rules: tweakText }),
        });
      }
      if (action === "accept" && tweakText.trim()) {
        await apiRequest("/api/tone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "tweak", rules: tweakText.trim() }),
        });
      }
      return apiRequest<ToneActionResponse>("/api/tone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    }, fallback);

    if (!data) {
      setError(fallback);
      return;
    }

    if (action === "tweak") {
      setProfile(data.profile ?? null);
      setMessage("Suggestie bijgewerkt — accepteer om toe te voegen aan je regels.");
      return;
    }

    if (action === "accept" && data.acceptedRules) {
      setConfig((c) => ({
        ...c,
        toneOfVoice: {
          ...c.toneOfVoice,
          rules: `${c.toneOfVoice.rules.trim()}\n\n=== Geleerd uit verzonden mail ===\n${data.acceptedRules}`.trim(),
        },
      }));
      setMessage("Suggestie toegevoegd aan tone-regels. Vergeet niet op te slaan.");
    } else {
      setMessage("Suggestie afgewezen.");
    }
    setProfile(data.profile ?? null);
  }

  function updateTone<K extends keyof EmailConfig["toneOfVoice"]>(
    key: K,
    value: EmailConfig["toneOfVoice"][K]
  ) {
    setConfig((c) => ({
      ...c,
      toneOfVoice: { ...c.toneOfVoice, [key]: value },
    }));
  }

  function updateAbout<K extends keyof EmailConfig["aboutMe"]>(
    key: K,
    value: EmailConfig["aboutMe"][K]
  ) {
    setConfig((c) => ({
      ...c,
      aboutMe: { ...c.aboutMe, [key]: value },
    }));
  }

  function updateReply(index: number, patch: Partial<QuickReplyTemplate>) {
    setConfig((c) => ({
      ...c,
      replies: c.replies.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
  }

  function addContactReplySet() {
    setConfig((c) => ({
      ...c,
      contactReplies: [
        ...c.contactReplies,
        {
          contactEmail: "",
          contactName: "",
          replies: [
            {
              id: `custom-${Date.now()}`,
              label: "Snelle reactie",
              hint: "",
              text: "Hey,\n\nGroeten,\nJohn",
              personalNote: "",
            },
          ],
        },
      ],
    }));
  }

  function updateContactSet(index: number, patch: Partial<ContactReplySet>) {
    setConfig((c) => ({
      ...c,
      contactReplies: c.contactReplies.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      ),
    }));
  }

  function updateContactReply(
    setIndex: number,
    replyIndex: number,
    patch: Partial<QuickReplyTemplate>
  ) {
    setConfig((c) => ({
      ...c,
      contactReplies: c.contactReplies.map((item, i) => {
        if (i !== setIndex) return item;
        return {
          ...item,
          replies: item.replies.map((r, ri) => (ri === replyIndex ? { ...r, ...patch } : r)),
        };
      }),
    }));
  }

  function removeContactSet(index: number) {
    setConfig((c) => ({
      ...c,
      contactReplies: c.contactReplies.filter((_, i) => i !== index),
    }));
  }

  const showSuggestion =
    profile?.suggestionStatus === "pending" && Boolean(profile.pendingSuggestion);

  return (
    <>
      <section className={styles.section}>
        <h3>Tone of voice</h3>
        <label className={styles.field}>
          <span>Regels</span>
          <textarea
            rows={8}
            value={config.toneOfVoice.rules}
            onChange={(e) => updateTone("rules", e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>Vermijd woorden</span>
          <input
            value={config.toneOfVoice.avoidWords}
            onChange={(e) => updateTone("avoidWords", e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>Max woorden</span>
          <input
            type="number"
            value={config.toneOfVoice.maxWords}
            onChange={(e) => updateTone("maxWords", Number(e.target.value) || 180)}
          />
        </label>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3>Geleerde schrijfstijl</h3>
          <button type="button" onClick={() => void runToneAnalyze()} disabled={toneBusy}>
            {toneBusy ? "Analyseert…" : "Analyseer verzonden mails"}
          </button>
        </div>
        <p className={styles.subtitle}>
          Suggesties op basis van je verzonden mails. Handmatige regels blijven leidend;
          accepteer een suggestie om die eraan toe te voegen.
        </p>
        {profile ? (
          <p className={styles.metaLine}>
            {profile.sampleCount} mails · avg {profile.avgLength} woorden · confidence{" "}
            {Math.round(profile.confidence * 100)}% · laatst{" "}
            {new Date(profile.analyzedAt).toLocaleDateString("nl-NL")}
          </p>
        ) : (
          <p className={styles.subtitle}>Nog geen analyse uitgevoerd.</p>
        )}
        {profile?.sentencePatterns && (
          <p className={styles.metaLine}>{profile.sentencePatterns}</p>
        )}
        {showSuggestion && (
          <div className={styles.suggestionBox}>
            <label className={styles.field}>
              <span>Voorgestelde regels (bewerkbaar)</span>
              <textarea
                rows={6}
                value={tweakText}
                onChange={(e) => setTweakText(e.target.value)}
              />
            </label>
            <div className={styles.suggestionActions}>
              <button
                type="button"
                className={styles.saveBtn}
                disabled={toneBusy}
                onClick={() => void toneAction("accept")}
              >
                Accepteren
              </button>
              <button type="button" disabled={toneBusy} onClick={() => void toneAction("tweak")}>
                Opslaan tweak
              </button>
              <button type="button" disabled={toneBusy} onClick={() => void toneAction("reject")}>
                Afwijzen
              </button>
            </div>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h3>Over mij</h3>
        <label className={styles.field}>
          <span>Intro</span>
          <textarea
            rows={3}
            value={config.aboutMe.intro}
            onChange={(e) => updateAbout("intro", e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>Achtergrond</span>
          <textarea
            rows={3}
            value={config.aboutMe.background}
            onChange={(e) => updateAbout("background", e.target.value)}
          />
        </label>
      </section>

      <section className={styles.section}>
        <h3>Quick reply knoppen</h3>
        {config.replies.map((reply, index) => (
          <div key={reply.id} className={styles.replyCard}>
            <label className={styles.field}>
              <span>Label</span>
              <input
                value={reply.label}
                onChange={(e) => updateReply(index, { label: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>Hint</span>
              <input
                value={reply.hint ?? ""}
                onChange={(e) => updateReply(index, { hint: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>Template</span>
              <textarea
                rows={4}
                value={reply.text}
                onChange={(e) => updateReply(index, { text: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>AI-noot</span>
              <textarea
                rows={2}
                value={reply.personalNote}
                onChange={(e) => updateReply(index, { personalNote: e.target.value })}
              />
            </label>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3>Custom replies per contact</h3>
          <button type="button" onClick={addContactReplySet}>
            + Contact
          </button>
        </div>
        <p className={styles.subtitle}>
          Extra quick-reply knoppen die alleen zichtbaar zijn bij dit contact.
        </p>
        {config.contactReplies.map((set, setIndex) => (
          <div key={`contact-${setIndex}`} className={styles.replyCard}>
            <label className={styles.field}>
              <span>E-mailadres</span>
              <input
                type="email"
                value={set.contactEmail}
                placeholder="baas@bedrijf.nl"
                onChange={(e) => updateContactSet(setIndex, { contactEmail: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>Naam (optioneel)</span>
              <input
                value={set.contactName ?? ""}
                onChange={(e) => updateContactSet(setIndex, { contactName: e.target.value })}
              />
            </label>
            {set.replies.map((reply, replyIndex) => (
              <div key={reply.id} className={styles.nestedReply}>
                <label className={styles.field}>
                  <span>Label</span>
                  <input
                    value={reply.label}
                    onChange={(e) =>
                      updateContactReply(setIndex, replyIndex, { label: e.target.value })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Template</span>
                  <textarea
                    rows={3}
                    value={reply.text}
                    onChange={(e) =>
                      updateContactReply(setIndex, replyIndex, { text: e.target.value })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>AI-noot</span>
                  <textarea
                    rows={2}
                    value={reply.personalNote}
                    onChange={(e) =>
                      updateContactReply(setIndex, replyIndex, { personalNote: e.target.value })
                    }
                  />
                </label>
              </div>
            ))}
            <button type="button" onClick={() => removeContactSet(setIndex)}>
              Verwijder contact-set
            </button>
          </div>
        ))}
      </section>
    </>
  );
}
