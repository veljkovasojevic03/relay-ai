import { describe, expect, it } from "vitest";

import { ACTION_COPY } from "./copy";
import { advanceFlow, cardFields, maskEmail, MAX_TRIES, startFlow, type FlowState } from "./flow";
import { actionIntent } from "./intent";

const orderEmail: FlowState = {
  action: "order_status",
  step: "email",
  params: { orderNumber: "KR-10482" },
  tries: 0,
};

describe("order_status flow", () => {
  it("asks for the order number first, in the visitor's language", () => {
    const en = startFlow("order_status", "en");
    const sr = startFlow("order_status", "sr");
    expect(en).toMatchObject({ kind: "ask", state: { step: "orderNumber" } });
    expect(en.reply).toContain("order number");
    expect(sr.reply).toContain("broj porudžbine");
    expect(sr.kind === "ask" && sr.quickReplies).toEqual(["Otkaži"]);
  });

  it("normalizes the order number, then asks for the email", () => {
    const start = startFlow("order_status", "en");
    if (start.kind !== "ask") throw new Error("expected ask");
    const next = advanceFlow(start.state, " kr-10482 ", "en");
    expect(next).toMatchObject({
      kind: "ask",
      state: { step: "email", params: { orderNumber: "KR-10482" }, tries: 0 },
    });
  });

  it("re-asks on a bad value and gives up after MAX_TRIES, offering a person", () => {
    let state: FlowState = orderEmail;
    for (let i = 1; i < MAX_TRIES; i++) {
      const step = advanceFlow(state, "not an email", "en");
      expect(step).toMatchObject({ kind: "ask", state: { tries: i } });
      expect(step.reply).toBe(ACTION_COPY.en.prompts.order_status.email.retry);
      if (step.kind === "ask") state = step.state;
    }
    expect(advanceFlow(state, "still not", "en")).toMatchObject({ kind: "stop", offerHuman: true });
  });

  it("ends in a confirmation with both values (email lowercased)", () => {
    expect(advanceFlow(orderEmail, "Marko@Example.com", "en")).toMatchObject({
      kind: "confirm",
      action: "order_status",
      params: { orderNumber: "KR-10482", email: "marko@example.com" },
    });
  });

  it.each(["cancel", "Otkaži", "otkazi!", "Stop"])("%j cancels at any step", (text) => {
    expect(advanceFlow(orderEmail, text, "en")).toMatchObject({ kind: "stop", offerHuman: false });
  });
});

describe("create_ticket flow", () => {
  const atEmail: FlowState = {
    action: "create_ticket",
    step: "email",
    params: { subject: "Wrong size", description: "Got 41 instead of 42." },
    tries: 0,
  };

  it("collects subject and description, then offers Skip for the optional email", () => {
    const start = startFlow("create_ticket", "en");
    if (start.kind !== "ask") throw new Error("expected ask");
    const afterSubject = advanceFlow(start.state, "Wrong size", "en");
    if (afterSubject.kind !== "ask") throw new Error("expected ask");
    const afterDescription = advanceFlow(afterSubject.state, "Got 41 instead of 42.", "en");
    expect(afterDescription).toMatchObject({
      kind: "ask",
      state: {
        step: "email",
        params: { subject: "Wrong size", description: "Got 41 instead of 42." },
      },
      quickReplies: ["Skip", "Cancel"],
    });
  });

  it("a subject that merely starts with a cancel word is still a subject", () => {
    const start = startFlow("create_ticket", "en");
    if (start.kind !== "ask") throw new Error("expected ask");
    expect(advanceFlow(start.state, "Stop sending me emails", "en")).toMatchObject({
      kind: "ask",
      state: { step: "description" },
    });
  });

  it("skipping the email confirms without one; an email that starts with 'no.' is an email", () => {
    expect(advanceFlow(atEmail, "Preskoči", "sr")).toMatchObject({
      kind: "confirm",
      params: { subject: "Wrong size", description: "Got 41 instead of 42." },
    });
    expect(advanceFlow(atEmail, "no.reply@example.com", "en")).toMatchObject({
      kind: "confirm",
      params: { visitorEmail: "no.reply@example.com" },
    });
  });
});

describe("cards and masking", () => {
  it("card fields name what the visitor confirms", () => {
    expect(
      cardFields({ action: "order_status", params: { orderNumber: "KR-1", email: "a@b.co" } }),
    ).toEqual([
      { key: "orderNumber", value: "KR-1" },
      { key: "email", value: "a@b.co" },
    ]);
  });

  it("masks emails for storage", () => {
    expect(maskEmail("marko@example.com")).toBe("m***@example.com");
    expect(maskEmail("broken")).toBe("***");
  });
});

describe("actionIntent", () => {
  it.each([
    ["Track my order", "order_status"],
    ["Where is my order?", "order_status"],
    ["what's the order status", "order_status"],
    ["Prati porudžbinu", "order_status"],
    ["gde je moja porudzbina", "order_status"],
    ["status moje pošiljke?", "order_status"],
    ["Report a problem", "create_ticket"],
    ["I want to open a ticket", "create_ticket"],
    ["Prijavi problem", "create_ticket"],
    ["želim da otvorim reklamaciju", "create_ticket"],
    ["otvori reklamaciju", "create_ticket"],
  ])("%j → %s", (text, expected) => {
    expect(actionIntent(text)).toBe(expected);
  });

  it.each([
    "How long does delivery of an order take?",
    "Koliko košta dostava porudžbine?",
    "Do you ship to Montenegro?",
    "What is your return policy?",
  ])("leaves FAQ questions alone: %j", (text) => {
    expect(actionIntent(text)).toBeNull();
  });

  it("matches the widget's own quick-start chips in both languages", () => {
    for (const lang of ["en", "sr"] as const) {
      expect(actionIntent(ACTION_COPY[lang].triggers.order_status)).toBe("order_status");
      expect(actionIntent(ACTION_COPY[lang].triggers.create_ticket)).toBe("create_ticket");
    }
  });
});
