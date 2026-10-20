// Writes to forbidden columns are cast with `as never`: bypassing the types is the point.
import { beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  axisVector,
  createBot,
  createUser,
  tokenHash,
  type TestUser,
} from "./helpers";

let alice: TestUser;
let bob: TestUser;
let botId: string;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createUser(), createUser()]);
  botId = (await createBot(alice)).id;
});

describe("profiles column grants", () => {
  it("lets an owner edit their profile fields", async () => {
    const { data, error } = await alice.client
      .from("profiles")
      .update({
        display_name: "Alice",
        ui_language: "sr",
        notification_email: "alerts@alice.test",
        weekly_digest: true,
      })
      .eq("id", alice.id)
      .select("display_name, ui_language, notification_email, weekly_digest")
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({
      display_name: "Alice",
      ui_language: "sr",
      notification_email: "alerts@alice.test",
      weekly_digest: true,
    });
  });

  it.each([
    ["plan", "pro"],
    ["stripe_customer_id", "cus_fake"],
    ["stripe_subscription_id", "sub_fake"],
    ["subscription_status", "active"],
    ["current_period_end", "2099-01-01T00:00:00Z"],
    ["is_sandbox", true],
    ["sandbox_expires_at", "2099-01-01T00:00:00Z"],
  ] as const)("refuses a self-update of server-only column %s", async (column, value) => {
    const { error } = await alice.client
      .from("profiles")
      .update({ [column]: value } as never)
      .eq("id", alice.id);
    expect(error?.code).toBe("42501");
  });

  it("leaves the plan untouched after the attempts", async () => {
    const { data } = await adminClient()
      .from("profiles")
      .select("plan")
      .eq("id", alice.id)
      .single();
    expect(data?.plan).toBe("free");
  });

  it("refuses inserting or deleting profiles", async () => {
    const insert = await alice.client.from("profiles").insert({ id: bob.id });
    expect(insert.error?.code).toBe("42501");
    const remove = await alice.client.from("profiles").delete().eq("id", alice.id);
    expect(remove.error?.code).toBe("42501");
  });
});

describe("bots column grants", () => {
  it("sets owner, public key and defaults server-side", async () => {
    const { data } = await adminClient().from("bots").select("*").eq("id", botId).single();
    expect(data?.owner_id).toBe(alice.id);
    expect(data?.public_key).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(data?.is_demo).toBe(false);
  });

  it.each([
    ["is_demo", true],
    ["public_key", "chosen-by-attacker-123"],
    ["owner_id", "00000000-0000-0000-0000-000000000000"],
  ] as const)("refuses an owner write to %s", async (column, value) => {
    const update = await alice.client
      .from("bots")
      .update({ [column]: value } as never)
      .eq("id", botId);
    expect(update.error?.code).toBe("42501");

    const insert = await alice.client
      .from("bots")
      .insert({ name: "Sneaky", [column]: value } as never);
    expect(insert.error?.code).toBe("42501");
  });

  it("validates allowed origins and brand color in the database", async () => {
    for (const bad of [
      ["http://shop.example"],
      ["https://shop.example/path"],
      ["javascript:alert(1)"],
    ]) {
      const { error } = await alice.client
        .from("bots")
        .update({ allowed_origins: bad })
        .eq("id", botId);
      expect(error?.code, String(bad)).toBe("23514");
    }
    const good = await alice.client
      .from("bots")
      .update({ allowed_origins: ["https://shop.example", "http://localhost:5500"] })
      .eq("id", botId);
    expect(good.error).toBeNull();

    const color = await alice.client.from("bots").update({ brand_color: "red" }).eq("id", botId);
    expect(color.error?.code).toBe("23514");
  });
});

describe("faqs column grants", () => {
  it("keeps embedding columns server-only and resets them when the text changes", async () => {
    const faq = await alice.client
      .from("faqs")
      .insert({ bot_id: botId, question: "Return window?", answer: "14 days." })
      .select("id, embedding_status")
      .single();
    expect(faq.data?.embedding_status).toBe("pending");
    const faqId = faq.data!.id;

    const forged = await alice.client
      .from("faqs")
      .update({ embedding: axisVector(0), embedding_status: "ready" })
      .eq("id", faqId);
    expect(forged.error?.code).toBe("42501");

    // The embed function (service role) writes the vector...
    const admin = adminClient();
    await admin
      .from("faqs")
      .update({ embedding: axisVector(0), embedding_status: "ready" })
      .eq("id", faqId);

    // ...a featured toggle keeps it...
    await alice.client.from("faqs").update({ featured: true }).eq("id", faqId);
    let row = await admin.from("faqs").select("embedding_status").eq("id", faqId).single();
    expect(row.data?.embedding_status).toBe("ready");

    // ...and editing the answer invalidates it.
    await alice.client.from("faqs").update({ answer: "30 days." }).eq("id", faqId);
    row = await admin.from("faqs").select("embedding, embedding_status").eq("id", faqId).single();
    expect(row.data).toEqual({ embedding: null, embedding_status: "pending" });
  });
});

describe("widget-owned data", () => {
  it("owners cannot create conversations or write visitor fields", async () => {
    const insert = await alice.client.from("conversations").insert({
      bot_id: botId,
      token_hash: tokenHash(),
      realtime_channel: "x".repeat(32),
    });
    expect(insert.error?.code).toBe("42501");
  });

  it("owners cannot write usage counters", async () => {
    const { error } = await alice.client
      .from("usage_counters")
      .insert({ profile_id: alice.id, period: "2026-10", conversations_started: 0 });
    expect(error?.code).toBe("42501");
  });

  it.each([
    ["start_conversation", { p_bot_id: "", p_token_hash: "", p_language: "en", p_ip_hash: "" }],
    ["check_rate_limit", { p_key: "k", p_limit: 1, p_window_seconds: 1 }],
    ["purge_expired_data", {}],
  ] as const)("owners cannot call %s", async (fn, args) => {
    const { error } = await alice.client.rpc(fn, args as never);
    expect(error?.code).toBe("42501");
  });
});
