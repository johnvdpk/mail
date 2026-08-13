"use client";

import { useEffect, useState } from "react";
import type {
  ContactReplySet,
  EmailAccount,
  EmailConfig,
  QuickReplyTemplate,
  WritingProfile,
} from "@/lib/email-config-shared";
import { FONT_FAMILY_OPTIONS } from "@/lib/email-config-shared";
import styles from "./MailConfigEditor.module.css";

type Tab = "algemeen" | "opmaak" | "handtekening" | "accounts";

type MailAccountStatus = {
  id: string;
  email: string;
  label: string;
  active: boolean;
  configured: boolean;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "algemeen", label: "Algemeen" },
  { id: "opmaak", label: "Opmaak" },
  { id: "handtekening", label: "Handtekening" },
  { id: "accounts", label: "Accounts" },
];

type Props = {
  initialConfig: EmailConfig;
  account?: string;
  googleConnected?: boolean;
  googleConfigured?: boolean;
  googleEmail?: string;
  onGoogleStatusChange?: (status: {
    connected: boolean;
    configured: boolean;
    email?: string;
  }) => void;
};

export function MailConfigEditor({
  initialConfig,
  account,
  googleConnected = false,
  googleConfigured = false,
  googleEmail,
  onGoogleStatusChange,
}: Props) {
  const [config, setConfig] = useState(initialConfig);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gConnected, setGConnected] = useState(googleConnected);
  const [gConfigured, setGConfigured] = useState(googleConfigured);
  const [gEmail, setGEmail] = useState(googleEmail);
  const [gBusy, setGBusy] = useState(false);
  const [profile, setProfile] = useState<WritingProfile | null>(null);
  const [toneBusy, setToneBusy] = useState(false);
  const [tweakText, setTweakText] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("algemeen");
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [mailAccounts, setMailAccounts] = useState<MailAccountStatus[]>([]);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);

  useEffect(() => {
    setGConnected(googleConnected);
    setGConfigured(googleConfigured);
    setGEmail(googleEmail);
  }, [googleConnected, googleConfigured, googleEmail]);

  useEffect(() => {
    void refreshGoogle();
    void loadToneProfile();
    void loadMailAccounts();
  }, []);

  async function loadMailAccounts() {
    try {
      const res = await fetch("/api/mail-account");
      const data = await res.json();
      if (!res.ok) return;
      setMailAccounts(data.accounts ?? []);
    } catch {
      // ignore
    }
  }

  async function switchMailAccount(id: string) {
    setSwitchingAccountId(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/mail-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Wisselen mislukt");
      setMailAccounts(data.accounts ?? []);
      setMessage("Actief e-mailadres gewisseld. Herlaad de pagina om de mailbox te synchroniseren.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wisselen mislukt");
    } finally {
      setSwitchingAccountId(null);
    }
  }

  async function refreshGoogle() {
    try {
      const res = await fetch("/api/google/status");
      const data = await res.json();
      const next = {
        connected: Boolean(data.connected),
        configured: Boolean(data.configured),
        email: typeof data.email === "string" ? data.email : undefined,
      };
      setGConnected(next.connected);
      setGConfigured(next.configured);
      setGEmail(next.email);
      onGoogleStatusChange?.(next);
    } catch {
      // ignore
    }
  }

  async function loadToneProfile() {
    try {
      const res = await fetch("/api/tone?refresh=1");
      const data = await res.json();
      if (!res.ok) return;
      const next = (data.profile ?? null) as WritingProfile | null;
      setProfile(next);
      if (next?.pendingSuggestion) setTweakText(next.pendingSuggestion);
      if (data.refreshed && data.significantChange) {
        setMessage("Schrijfstijl opnieuw geanalyseerd — er zijn nieuwe suggesties.");
      }
    } catch {
      // ignore
    }
  }

  async function runToneAnalyze() {
    setToneBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/tone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", limit: 80 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analyse mislukt");
      setProfile(data.profile);
      if (data.profile?.pendingSuggestion) setTweakText(data.profile.pendingSuggestion);
      setMessage(`Analyse klaar (${data.profile.sampleCount} mails).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyse mislukt");
    } finally {
      setToneBusy(false);
    }
  }

  async function toneAction(action: "accept" | "reject" | "tweak") {
    setToneBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (action === "tweak") {
        const res = await fetch("/api/tone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "tweak", rules: tweakText }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Opslaan mislukt");
        setProfile(data.profile);
        setMessage("Suggestie bijgewerkt — accepteer om toe te voegen aan je regels.");
        return;
      }

      if (action === "accept" && tweakText.trim()) {
        await fetch("/api/tone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "tweak", rules: tweakText.trim() }),
        });
      }

      const res = await fetch("/api/tone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Actie mislukt");

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
      setProfile(data.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Actie mislukt");
    } finally {
      setToneBusy(false);
    }
  }

  async function disconnectGoogle() {
    setGBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ontkoppelen mislukt");
      setGConnected(false);
      setGEmail(undefined);
      onGoogleStatusChange?.({ connected: false, configured: gConfigured });
      setMessage("Google Agenda ontkoppeld");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ontkoppelen mislukt");
    } finally {
      setGBusy(false);
    }
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

  function updateFormatting<K extends keyof EmailConfig["formatting"]>(
    key: K,
    value: EmailConfig["formatting"][K]
  ) {
    setConfig((c) => ({
      ...c,
      formatting: { ...c.formatting, [key]: value },
    }));
  }

  function updateSignature(text: string) {
    setConfig((c) => ({
      ...c,
      signature: { ...c.signature, text },
    }));
  }

  function addAccount() {
    const email = newAccountEmail.trim();
    if (!email) return;
    setConfig((c) => ({
      ...c,
      accounts: [...c.accounts, { email, label: newAccountLabel.trim() || undefined }],
    }));
    setNewAccountEmail("");
    setNewAccountLabel("");
  }

  function removeAccount(index: number) {
    setConfig((c) => ({
      ...c,
      accounts: c.accounts.filter((_, i) => i !== index),
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

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/email-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Opslaan mislukt");
      setConfig(data);
      setMessage("Opgeslagen");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  const showSuggestion =
    profile?.suggestionStatus === "pending" && Boolean(profile.pendingSuggestion);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Tone of voice & quick replies</h2>
          <p className={styles.subtitle}>
            De AI gebruikt dit bij drafts, spelling-check en tips.
          </p>
        </div>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? "Opslaan…" : "Opslaan"}
        </button>
      </div>

      {message && <p className={styles.ok}>{message}</p>}
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "algemeen" && (
      <>
      <section className={styles.section}>
        <h3>Google Agenda</h3>
        <p className={styles.subtitle}>
          Uitnodigingen worden niet automatisch geaccepteerd. Je zet ze zelf in je agenda.
        </p>
        {!gConfigured ? (
          <p className={styles.subtitle}>
            Zet GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET en GOOGLE_REDIRECT_URI in .env.local.
          </p>
        ) : gConnected ? (
          <div className={styles.googleRow}>
            <p className={styles.ok}>
              Gekoppeld{gEmail ? `: ${gEmail}` : ""}
            </p>
            <button
              type="button"
              onClick={() => void disconnectGoogle()}
              disabled={gBusy}
            >
              {gBusy ? "Bezig…" : "Ontkoppelen"}
            </button>
          </div>
        ) : (
          <a className={styles.saveBtn} href="/api/google/connect">
            Koppel Google Agenda
          </a>
        )}
      </section>

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
          <button
            type="button"
            onClick={() => void runToneAnalyze()}
            disabled={toneBusy}
          >
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
              <button
                type="button"
                disabled={toneBusy}
                onClick={() => void toneAction("tweak")}
              >
                Opslaan tweak
              </button>
              <button
                type="button"
                disabled={toneBusy}
                onClick={() => void toneAction("reject")}
              >
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
      )}

      {activeTab === "opmaak" && (
        <section className={styles.section}>
          <h3>Opmaak</h3>
          <p className={styles.subtitle}>
            Standaard lettertype en tekstgrootte voor nieuwe mails en drafts.
          </p>
          <label className={styles.field}>
            <span>Lettertype</span>
            <select
              value={config.formatting.fontFamily}
              onChange={(e) => updateFormatting("fontFamily", e.target.value)}
            >
              {FONT_FAMILY_OPTIONS.map((font) => (
                <option key={font} value={font} style={{ fontFamily: font }}>
                  {font.split(",")[0]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Tekstgrootte (px)</span>
            <input
              type="number"
              min={10}
              max={24}
              value={config.formatting.fontSize}
              onChange={(e) => updateFormatting("fontSize", Number(e.target.value) || 15)}
            />
          </label>
          <p
            className={styles.metaLine}
            style={{
              fontFamily: config.formatting.fontFamily,
              fontSize: `${config.formatting.fontSize}px`,
            }}
          >
            Voorbeeld: zo ziet de tekst van je mail eruit.
          </p>
        </section>
      )}

      {activeTab === "handtekening" && (
        <section className={styles.section}>
          <h3>Handtekening</h3>
          <p className={styles.subtitle}>
            Wordt automatisch onder nieuwe mails en reacties geplakt.
          </p>
          <label className={styles.field}>
            <span>Tekst</span>
            <textarea
              rows={6}
              value={config.signature.text}
              onChange={(e) => updateSignature(e.target.value)}
            />
          </label>
        </section>
      )}

      {activeTab === "accounts" && (
        <section className={styles.section}>
          <h3>E-mailadres wisselen</h3>
          <p className={styles.subtitle}>
            Kies met welk e-mailadres je verstuurt en ontvangt. Huidig actief: {account ?? "onbekend"}.
            Na het wisselen wordt de mailbox van het gekozen adres gesynchroniseerd.
          </p>
          {mailAccounts.map((acc) => (
            <div key={acc.id} className={styles.googleRow}>
              <p className={styles.metaLine}>
                {acc.email} ({acc.label}){acc.active ? " — actief" : ""}
                {!acc.configured ? " — niet geconfigureerd" : ""}
              </p>
              {!acc.active && (
                <button
                  type="button"
                  disabled={!acc.configured || switchingAccountId === acc.id}
                  onClick={() => void switchMailAccount(acc.id)}
                >
                  {switchingAccountId === acc.id ? "Bezig…" : "Wissel naar dit account"}
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {activeTab === "accounts" && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h3>Extra e-mailadressen</h3>
          </div>
          <p className={styles.subtitle}>
            Voeg extra adressen toe die je later aan dit mailprogramma wilt koppelen.
          </p>
          {config.accounts.map((acc: EmailAccount, index) => (
            <div key={`${acc.email}-${index}`} className={styles.googleRow}>
              <p className={styles.metaLine}>
                {acc.email}
                {acc.label ? ` (${acc.label})` : ""}
              </p>
              <button type="button" onClick={() => removeAccount(index)}>
                Verwijderen
              </button>
            </div>
          ))}
          <div className={styles.googleRow}>
            <input
              type="email"
              placeholder="naam@bedrijf.nl"
              value={newAccountEmail}
              onChange={(e) => setNewAccountEmail(e.target.value)}
            />
            <input
              type="text"
              placeholder="Label (optioneel)"
              value={newAccountLabel}
              onChange={(e) => setNewAccountLabel(e.target.value)}
            />
            <button type="button" onClick={addAccount}>
              + Toevoegen
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
