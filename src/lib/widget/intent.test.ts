import { describe, expect, it } from "vitest";

import { wantsHuman } from "./intent";

describe("wantsHuman", () => {
  it.each([
    "Can I talk to a human?",
    "I want to speak with a real person",
    "talk to someone please",
    "chat with an agent",
    "human!",
    "Agent please",
    "Connect me to support",
    "I need a live person",
    "Želim da razgovaram sa osobom",
    "zelim da pricam sa nekim",
    "Mogu li razgovarati s operaterom?",
    "Hoću živu osobu",
    "operater molim",
    "Poveži me sa podrškom",
  ])("recognizes %j", (text) => {
    expect(wantsHuman(text)).toBe(true);
  });

  it.each([
    "How long does delivery take?",
    "Do your staff speak English?",
    "Is this shirt for a person who is tall?",
    "Koliko traje dostava?",
    "Da li je vaša prodavnica otvorena za ljude u nedelju?",
    "I talked to my friend about your shoes",
    "",
  ])("leaves %j to the FAQ", (text) => {
    expect(wantsHuman(text)).toBe(false);
  });
});
