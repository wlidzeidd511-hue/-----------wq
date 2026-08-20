import { describe, expect, it } from "vitest";
import {
  BRANCH_CONTACT_DEFAULTS,
  buildPublicUrl,
  buildWhatsAppUrl,
  PUBLIC_SITE_URL,
  resolveBranchContacts,
  WHATSAPP_DISPLAY_PHONE,
} from "../shared/siteConfig";

describe("Public site contact configuration", () => {
  it("uses the requested custom domain without a Manus hostname", () => {
    expect(PUBLIC_SITE_URL).toBe("https://hatfaltmyez.com");
    expect(buildPublicUrl("/track?t=secure-token")).toBe(
      "https://hatfaltmyez.com/track?t=secure-token",
    );
    expect(buildPublicUrl()).not.toContain("manus");
  });

  it("opens WhatsApp using the international form of the displayed number", () => {
    expect(WHATSAPP_DISPLAY_PHONE).toBe("0559339260");
    const url = new URL(buildWhatsAppUrl("مرحبًا"));
    expect(url.hostname).toBe("wa.me");
    expect(url.pathname).toBe("/966559339260");
    expect(url.searchParams.get("text")).toBe("مرحبًا");
  });

  it("normalizes an owner-configured local or international WhatsApp number", () => {
    expect(new URL(buildWhatsAppUrl(undefined, "0566515352")).pathname).toBe("/966566515352");
    expect(new URL(buildWhatsAppUrl(undefined, "+966 56 651 5352")).pathname).toBe("/966566515352");
  });

  it("keeps WhatsApp and Google Maps tied to the correct branch", () => {
    expect(BRANCH_CONTACT_DEFAULTS).toEqual([
      expect.objectContaining({ code: "BSR", whatsappPhone: "0551544112", mapUrl: expect.stringContaining("1MSjqvDZPjyawSqC7") }),
      expect.objectContaining({ code: "BAS", whatsappPhone: "0559339260", mapUrl: expect.stringContaining("azoDzhwYcp1jj1cD8") }),
    ]);

    const resolved = resolveBranchContacts([
      { code: "BSR", name: "فرع البصيرية", settings: { whatsappPhone: "0550000001", mapUrl: "https://maps.example/basiriyah" } },
      { code: "BAS", name: "فرع البساتين", settings: { whatsappPhone: "0550000002", mapUrl: "https://maps.example/basatin" } },
    ]);
    expect(resolved[0]).toMatchObject({ code: "BSR", whatsappPhone: "0550000001", mapUrl: "https://maps.example/basiriyah" });
    expect(resolved[1]).toMatchObject({ code: "BAS", whatsappPhone: "0550000002", mapUrl: "https://maps.example/basatin" });
  });
});
