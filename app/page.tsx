import { getSession } from "@/lib/auth/auth";
import { readEmailConfig } from "@/lib/config/email-config";
import { env } from "@/lib/config/env";
import { isImapConfigured } from "@/lib/mail/imap";
import { isSmtpConfigured } from "@/lib/mail/mail";
import { activeAccountEnv, currentMailAccount, refreshActiveMailAccount } from "@/lib/config/mail-accounts";
import { getFolderView } from "@/lib/mail/mailbox-service";
import { isOpenRouterConfigured } from "@/lib/ai/openrouter";
import { MailApp } from "@/components/MailApp/MailApp";
import AuthGate from "@/components/auth/AuthGate/AuthGate";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const authenticated = await getSession();

  if (!authenticated) {
    return <AuthGate />;
  }

  await refreshActiveMailAccount();
  const imapReady = isImapConfigured();
  const emailConfig = await readEmailConfig();
  const account =
    activeAccountEnv("IMAP_USER") ??
    activeAccountEnv("SMTP_FROM") ??
    activeAccountEnv("SMTP_USER") ??
    currentMailAccount().email ??
    env("SMTP_FROM") ??
    "onbekend";

  const view = imapReady
    ? await getFolderView(null, { refreshFolders: true }).catch(() => null)
    : null;

  return (
    <MailApp
      account={account}
      emailConfig={emailConfig}
      initialFolders={view?.folders ?? []}
      initialFolder={view?.folder ?? "INBOX"}
      initialThreads={view?.threads ?? []}
      initialSyncedAt={view?.syncedAt}
      smtpReady={isSmtpConfigured()}
      imapReady={imapReady}
      aiReady={isOpenRouterConfigured()}
    />
  );
}
