import { describe, expect, it } from "vitest";

import { createUser } from "./helpers";

describe("profile bootstrap", () => {
  it("creates a profile for every new user with sensible defaults", async () => {
    const user = await createUser();
    const { data } = await user.client.from("profiles").select("*").eq("id", user.id).single();
    expect(data).toMatchObject({
      display_name: user.email.split("@")[0],
      notification_email: user.email,
      ui_language: "en",
      plan: "free",
      weekly_digest: false,
      is_sandbox: false,
    });
  });

  it("takes name and language from sign-up metadata", async () => {
    const user = await createUser({ display_name: "Marija", ui_language: "sr" });
    const { data } = await user.client
      .from("profiles")
      .select("display_name, ui_language")
      .eq("id", user.id)
      .single();
    expect(data).toEqual({ display_name: "Marija", ui_language: "sr" });
  });

  it("ignores unsupported languages", async () => {
    const user = await createUser({ ui_language: "de" });
    const { data } = await user.client
      .from("profiles")
      .select("ui_language")
      .eq("id", user.id)
      .single();
    expect(data?.ui_language).toBe("en");
  });
});
