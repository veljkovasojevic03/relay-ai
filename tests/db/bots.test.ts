import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { adminClient, anonClient, createBot, createUser } from "./helpers";

// Smallest valid PNG (1×1, transparent).
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

describe("bot plan limits", () => {
  it("allows one bot on Free and explains the refusal", async () => {
    const owner = await createUser();
    await createBot(owner, "First");
    const second = await owner.client.from("bots").insert({ name: "Second" });
    expect(second.error).toMatchObject({ code: "P0001", message: "bot_limit_reached" });
  });

  it("holds under concurrent creates", async () => {
    const owner = await createUser();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => owner.client.from("bots").insert({ name: `Bot ${i}` })),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.filter((r) => r.error?.message === "bot_limit_reached")).toHaveLength(5);
  });

  it("allows three bots on Pro", async () => {
    const owner = await createUser();
    await adminClient().from("profiles").update({ plan: "pro" }).eq("id", owner.id);
    for (const name of ["A", "B", "C"]) await createBot(owner, name);
    const fourth = await owner.client.from("bots").insert({ name: "D" });
    expect(fourth.error?.message).toBe("bot_limit_reached");
  });

  it("frees the slot when a bot is deleted", async () => {
    const owner = await createUser();
    const bot = await createBot(owner, "Old");
    await owner.client.from("bots").delete().eq("id", bot.id);
    await expect(createBot(owner, "New")).resolves.toMatchObject({ name: "New" });
  });
});

describe("bot-logos storage", () => {
  const upload = (
    client: ReturnType<typeof anonClient>,
    path: string,
    body: Buffer,
    type: string,
  ) => client.storage.from("bot-logos").upload(path, body, { contentType: type, upsert: false });

  it("lets owners write only into folders of their own bots", async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    const bot = await createBot(alice);

    const own = await upload(alice.client, `${bot.id}/${randomUUID()}.png`, PNG, "image/png");
    expect(own.error).toBeNull();

    const foreign = await upload(bob.client, `${bot.id}/${randomUUID()}.png`, PNG, "image/png");
    expect(foreign.error).not.toBeNull();

    const outside = await upload(alice.client, `not-a-bot/${randomUUID()}.png`, PNG, "image/png");
    expect(outside.error).not.toBeNull();

    // Public read, so the widget can show it on any site.
    const { data } = alice.client.storage.from("bot-logos").getPublicUrl(own.data!.path);
    const res = await fetch(data.publicUrl);
    expect(res.status).toBe(200);
  });

  it("rejects SVG and files over 200 KB at the bucket level", async () => {
    const owner = await createUser();
    const bot = await createBot(owner);
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const svgUpload = await upload(owner.client, `${bot.id}/x.svg`, svg, "image/svg+xml");
    expect(svgUpload.error).not.toBeNull();

    const big = Buffer.concat([PNG, Buffer.alloc(205_000)]);
    const bigUpload = await upload(owner.client, `${bot.id}/big.png`, big, "image/png");
    expect(bigUpload.error).not.toBeNull();
  });

  it("does not let anonymous visitors upload", async () => {
    const owner = await createUser();
    const bot = await createBot(owner);
    const anon = await upload(anonClient(), `${bot.id}/${randomUUID()}.png`, PNG, "image/png");
    expect(anon.error).not.toBeNull();
  });
});
