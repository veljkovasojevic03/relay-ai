import { createHash, randomBytes, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { inject } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

export type Client = SupabaseClient<Database>;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export function adminClient(): Client {
  const { url, secretKey } = inject("supabase");
  return createClient<Database>(url, secretKey, noSession);
}

export function anonClient(): Client {
  const { url, publishableKey } = inject("supabase");
  return createClient<Database>(url, publishableKey, noSession);
}

export type TestUser = { id: string; email: string; client: Client };

/** Creates a confirmed user and returns a client signed in as that user. */
export async function createUser(metadata: Record<string, string> = {}): Promise<TestUser> {
  const admin = adminClient();
  const email = `owner-${randomUUID()}@relay.test`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client };
}

export async function createBot(user: TestUser, name = "Test bot") {
  const { data, error } = await user.client.from("bots").insert({ name }).select().single();
  if (error) throw error;
  return data;
}

export function tokenHash(): string {
  return createHash("sha256").update(randomBytes(16)).digest("hex");
}

/** Starts a conversation the way the widget API will: service role + start_conversation. */
export async function startConversation(botId: string) {
  const { data, error } = await adminClient().rpc("start_conversation", {
    p_bot_id: botId,
    p_token_hash: tokenHash(),
    p_language: "en",
    p_ip_hash: "test-ip-hash",
  });
  if (error) throw error;
  return data as { status: string; conversation_id?: string; realtime_channel?: string };
}

/** A unit vector along one axis, handy for deterministic similarity tests. */
export function axisVector(axis: number, dimensions = 384): string {
  const v = new Array<number>(dimensions).fill(0);
  v[axis] = 1;
  return JSON.stringify(v);
}
