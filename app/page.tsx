import { getSession } from "@/lib/auth";
import { readEmailConfig } from "@/lib/email-config";
import { env } from "@/lib/env";
import { isImapConfigured } from "@/lib/imap";
import { isSmtpConfigured } from "@/lib/mail";
import { activeAccountEnv, currentMailAccount, refreshActiveMailAccount } from "@/lib/mail-accounts";
import { getFolderView } from "@/lib/mailbox-service";
import { isOpenRouterConfigured } from "@/lib/openrouter";
import { MailApp } from "@/components/MailApp/MailApp";
import AuthGate from "@/components/AuthGate/AuthGate";

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
    ? await getFolderView(null).catch(() => null)
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
