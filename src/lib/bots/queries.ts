import "server-only";

import { cache } from "react";
import { z } from "zod";

import { getOwnerProfile, requireUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { logoPublicUrl } from "./logo";
import {
  parseFeaturedQuestions,
  parseGreeting,
  type FeaturedQuestion,
  type Greeting,
  type Language,
} from "./schema";

export type Bot = {
  id: string;
  publicKey: string;
  name: string;
  description: string;
  defaultLanguage: Language;
  brandColor: string;
  logoPath: string | null;
  logoUrl: string | null;
  greeting: Greeting;
  position: "left" | "right";
  allowedOrigins: string[];
  active: boolean;
  featuredQuestions: FeaturedQuestion[];
  updatedAt: string;
};

// Explicit columns only; owners never need `is_demo` or timestamps beyond `updated_at`.
const COLUMNS =
  "id, public_key, name, description, default_language, brand_color, logo_path, greeting, position, allowed_origins, active, featured_questions, updated_at";

type Row = {
  id: string;
  public_key: string;
  name: string;
  description: string;
  default_language: string;
  brand_color: string;
  logo_path: string | null;
  greeting: unknown;
  position: string;
  allowed_origins: string[];
  active: boolean;
  featured_questions: unknown;
  updated_at: string;
};

function toBot(row: Row): Bot {
  return {
    id: row.id,
    publicKey: row.public_key,
    name: row.name,
    description: row.description,
    defaultLanguage: row.default_language === "sr" ? "sr" : "en",
    brandColor: row.brand_color,
    logoPath: row.logo_path,
    logoUrl: logoPublicUrl(serverEnv().NEXT_PUBLIC_SUPABASE_URL ?? "", row.logo_path),
    greeting: parseGreeting(row.greeting),
    position: row.position === "left" ? "left" : "right",
    allowedOrigins: row.allowed_origins,
    active: row.active,
    featuredQuestions: parseFeaturedQuestions(row.featured_questions),
    updatedAt: row.updated_at,
  };
}

/** The signed-in owner's bots (RLS-scoped), oldest first. */
export const listBots = cache(async (): Promise<Bot[]> => {
  await requireUser();
  const supabase = (await createSupabaseServerClient())!;
  const { data, error } = await supabase
    .from("bots")
    .select(COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Could not load bots");
  return (data as Row[]).map(toBot);
});

/** One bot of the signed-in owner, or null when it doesn't exist or isn't theirs. */
export const getBot = cache(async (id: string): Promise<Bot | null> => {
  if (!z.uuid().safeParse(id).success) return null;
  await requireUser();
  const supabase = (await createSupabaseServerClient())!;
  const { data, error } = await supabase.from("bots").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error("Could not load bot");
  return data ? toBot(data as Row) : null;
});

export type BotQuota = { count: number; limit: number; plan: "free" | "pro"; canCreate: boolean };

/** Display only. The database trigger is what actually enforces the limit. */
export async function getBotQuota(): Promise<BotQuota> {
  const [bots, profile] = await Promise.all([listBots(), getOwnerProfile()]);
  const limit = profile.plan === "pro" ? 3 : 1;
  return { count: bots.length, limit, plan: profile.plan, canCreate: bots.length < limit };
}
