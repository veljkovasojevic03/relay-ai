"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type Props = {
  realtime: { url: string; key: string } | null;
  /** Detail view: only this conversation; list view: all of the owner's conversations. */
  conversationId?: string;
};

/** A safety net for events lost on the way (sleeping laptop, dropped socket, busy server). */
const SAFETY_REFRESH_MS = 20_000;

/**
 * Keeps the inbox live (spec §4.6): Postgres changes on the owner's conversations and
 * messages, filtered by RLS on the server, trigger a refresh of the server-rendered page.
 * Every new message also touches its conversation row, so the list hears about it too.
 *
 * Refreshes never overlap: an event that arrives while one is running schedules exactly
 * one more, so the page always ends on the latest state.
 */
export function InboxLive({ realtime, conversationId }: Props) {
  const t = useTranslations("Inbox");
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    pendingRef.current = pending;
    if (!pending && dirty.current) {
      dirty.current = false;
      startTransition(() => router.refresh());
    }
  }, [pending, router]);

  useEffect(() => {
    if (!realtime) return;
    const supabase = supabaseBrowser(realtime.url, realtime.key);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (pendingRef.current) dirty.current = true;
        else startTransition(() => router.refresh());
      }, 250);
    };

    let channel = supabase.channel(`inbox:${conversationId ?? "all"}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "conversations",
        ...(conversationId ? { filter: `id=eq.${conversationId}` } : {}),
      },
      refresh,
    );
    if (conversationId) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        refresh,
      );
    }
    channel.subscribe((status) => {
      const joined = status === "SUBSCRIBED";
      setConnected(joined);
      // (Re)joined: catch up on anything that happened while we weren't listening.
      if (joined) refresh();
    });

    const safety = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, SAFETY_REFRESH_MS);

    return () => {
      clearTimeout(timer);
      clearInterval(safety);
      void supabase.removeChannel(channel);
    };
  }, [realtime, conversationId, router]);

  if (!realtime) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      data-live={connected ? "on" : "off"}
    >
      <span
        aria-hidden="true"
        className={cn("size-2 rounded-full", connected ? "bg-success" : "bg-muted-foreground")}
      />
      {t("live")}
    </span>
  );
}
