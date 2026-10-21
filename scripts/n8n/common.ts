/**
 * Shared bits of the n8n developer scripts: env loading, the local Supabase client, and
 * sample event bodies that follow docs/N8N_CONTRACT.md.
 */

import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { envelope, type Envelope, type EventType } from "../../src/lib/n8n/contract";

/** .env.local first (like Next.js), real environment variables win. */
export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) {
      const before = { ...process.env };
      process.loadEnvFile(file);
      Object.assign(process.env, before);
    }
  }
}

/** An env value, or undefined when unset OR empty (`N8N_WEBHOOK_BASE=` in .env.local). */
export function envValue(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function requireSecret(): string {
  const secret = process.env.N8N_SHARED_SECRET?.trim();
  if (!secret) {
    console.error(
      "N8N_SHARED_SECRET is not set (add it to .env.local, same value as in n8n/.env).",
    );
    process.exit(2);
  }
  return secret;
}

/** Service-role client for the configured Supabase, or null (scripts then skip DB checks). */
export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type SampleType = "escalation" | "reply_email" | "order_status" | "create_ticket";
export const SAMPLE_TYPES: SampleType[] = [
  "escalation",
  "reply_email",
  "order_status",
  "create_ticket",
];

export const EVENT_TYPE: Record<SampleType, EventType> = {
  escalation: "escalation",
  reply_email: "reply_email",
  order_status: "action.order_status",
  create_ticket: "action.create_ticket",
};

/** Text a hostile visitor might send: HTML, an entity, a header-injection newline. */
const NASTY = '<script>alert("x")</script> & <b>bold</b>\nBcc: victim@example.com';

export function sampleEvent(
  type: SampleType,
  opts: {
    to: string;
    appUrl: string;
    nasty: boolean;
    order: string;
    orderEmail: string;
    language: "en" | "sr";
  },
): Envelope {
  const eventId = randomUUID();
  const conversationId = randomUUID();
  const text = (plain: string) => (opts.nasty ? `${plain} ${NASTY}` : plain);
  const parts = {
    bot: { id: randomUUID(), name: "Kroj Support" },
    owner: { notificationEmail: opts.to, language: opts.language },
  };
  const data: Record<SampleType, Record<string, unknown>> = {
    escalation: {
      conversationId,
      reason: "unknown_twice",
      visitorEmail: "kupac@example.com",
      lastMessages: [
        { role: "visitor", text: text("Da li imate patike broj 52?") },
        {
          role: "bot",
          text: "Nisam siguran za to i ne bih da nagađam. Želiš li da razgovaraš sa osobom?",
        },
        { role: "visitor", text: "A broj 51?" },
        {
          role: "bot",
          text: "Nisam siguran za to i ne bih da nagađam. Želiš li da razgovaraš sa osobom?",
        },
      ],
      inboxUrl: `${opts.appUrl}/sr/dashboard/inbox/${conversationId}`,
    },
    reply_email: {
      conversationId,
      visitorEmail: opts.to,
      replyText: text("Broj 52 trenutno nemamo, ali stiže u ponedeljak.\nJavićemo ti se!"),
      shopName: "Kroj — moda i obuća",
      language: opts.language,
    },
    order_status: {
      actionRunId: randomUUID(),
      params: { orderNumber: opts.order, email: opts.orderEmail },
    },
    create_ticket: {
      actionRunId: randomUUID(),
      conversationId,
      params: {
        subject: text("Pogrešna veličina"),
        description: text("Stigao je broj 41 umesto 42."),
        visitorEmail: "marko@example.com",
      },
    },
  };
  return envelope(eventId, EVENT_TYPE[type], new Date().toISOString(), {
    ...parts,
    data: data[type],
  });
}

export function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const [name, inline] = arg.slice(2).split("=", 2) as [string, string | undefined];
      if (inline !== undefined) values[name] = inline;
      else if (argv[i + 1] && !argv[i + 1]!.startsWith("--") && VALUE_FLAGS.has(name)) {
        values[name] = argv[++i]!;
      } else flags.add(name);
    } else positional.push(arg);
  }
  return { flags, values, positional };
}

const VALUE_FLAGS = new Set(["to", "base", "app", "order", "email", "lang"]);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
