import { getSession } from "@/lib/auth";
import { readEmailConfig } from "@/lib/email-config";
import { env } from "@/lib/env";
import { isImapConfigured } from "@/lib/imap";
import { isSmtpConfigured } from "@/lib/mail";
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

  const imapReady = isImapConfigured();
  const emailConfig = await readEmailConfig();
  const account = env("IMAP_USER") ?? env("SMTP_FROM") ?? env("SMTP_USER") ?? "onbekend";

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
