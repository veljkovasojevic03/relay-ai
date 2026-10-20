import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import {
  DeleteConversation,
  MarkRead,
  ReplyForm,
  ResolveButton,
} from "@/components/inbox/conversation-tools";
import { InboxLive } from "@/components/inbox/inbox-live";
import { StatusBadge } from "@/components/inbox/status-badge";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/routing";
import { getConversation, type ThreadMessage } from "@/lib/inbox/queries";
import { realtimeProps } from "@/lib/inbox/realtime";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/inbox/[conversationId]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: asLocale(locale), namespace: "Inbox.detail" });
  return { title: t("metaTitle") };
}

export default async function ConversationPage({
  params,
}: PageProps<"/[locale]/dashboard/inbox/[conversationId]">) {
  const { conversationId } = await params;
  const [conversation, t, tLocale, format] = await Promise.all([
    getConversation(conversationId),
    getTranslations("Inbox"),
    getTranslations("Locale"),
    getFormatter(),
  ]);
  if (!conversation) notFound();
  const now = new Date();
  const resolved = conversation.status === "resolved";
  const when = (iso: string) => format.relativeTime(new Date(iso), now);

  return (
    <div className="grid gap-6">
      <MarkRead id={conversation.id} unread={conversation.unread} />
      <div className="grid gap-2">
        <Link
          href="/dashboard/inbox"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight break-all">
            {conversation.visitorEmail ?? t("anonymous")}
          </h1>
          <StatusBadge status={conversation.status} />
          <span className="ml-auto">
            <InboxLive realtime={realtimeProps()} conversationId={conversation.id} />
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{conversation.botName}</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="grid min-w-0 gap-4">
          <section
            aria-label={t("detail.conversation")}
            className="grid gap-3 rounded-xl border bg-card p-4"
          >
            <ol className="grid gap-3">
              {conversation.messages.map((m) => (
                <Message
                  key={m.id}
                  message={m}
                  role={t(`roles.${m.role}`)}
                  time={when(m.createdAt)}
                  fromFaq={t("detail.fromFaq")}
                  lang={conversation.language}
                />
              ))}
            </ol>
          </section>
          <ReplyForm id={conversation.id} disabled={resolved} />
        </div>

        <aside className="grid gap-4 rounded-xl border bg-card p-4 text-sm lg:sticky lg:top-6">
          <dl className="grid gap-3">
            <Detail label={t("detail.email")}>
              {conversation.visitorEmail ? (
                <a
                  href={`mailto:${conversation.visitorEmail}`}
                  className="break-all text-primary underline-offset-4 hover:underline"
                >
                  {conversation.visitorEmail}
                </a>
              ) : (
                <span className="text-muted-foreground">{t("detail.noEmail")}</span>
              )}
            </Detail>
            <Detail label={t("detail.language")}>{tLocale(conversation.language)}</Detail>
            <Detail label={t("detail.startedLabel")}>{when(conversation.createdAt)}</Detail>
            {conversation.handedOffAt && (
              <Detail label={t("detail.handedOffLabel")}>{when(conversation.handedOffAt)}</Detail>
            )}
            {conversation.rating && (
              <Detail label={t("detail.rating")}>
                {conversation.rating === "up" ? t("detail.ratingUp") : t("detail.ratingDown")}
              </Detail>
            )}
            {resolved && conversation.resolvedBy && (
              <p className="text-muted-foreground">
                {t(`detail.resolvedBy.${conversation.resolvedBy}`)}
              </p>
            )}
          </dl>
          <div className="grid gap-2 border-t pt-4">
            {!resolved && <ResolveButton id={conversation.id} />}
            <DeleteConversation id={conversation.id} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Message({
  message,
  role,
  time,
  fromFaq,
  lang,
}: {
  message: ThreadMessage;
  role: string;
  time: string;
  fromFaq: string;
  lang: string;
}) {
  if (message.role === "system") {
    return (
      <li className="mx-auto max-w-prose text-center text-xs text-muted-foreground" lang={lang}>
        {message.content}
      </li>
    );
  }
  const mine = message.role === "human" || message.role === "bot";
  return (
    <li className={cn("grid max-w-[85%] gap-1", mine ? "justify-self-end" : "justify-self-start")}>
      <p
        lang={lang}
        className={cn(
          "rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-line",
          message.role === "visitor" && "rounded-bl-md bg-muted",
          message.role === "bot" && "rounded-br-md border bg-background",
          message.role === "human" && "rounded-br-md bg-primary text-primary-foreground",
        )}
      >
        {message.content}
      </p>
      <p className={cn("text-xs text-muted-foreground", mine && "text-right")}>
        {role} · {time}
        {message.sourceCount > 0 && ` · ${fromFaq}`}
      </p>
    </li>
  );
}
