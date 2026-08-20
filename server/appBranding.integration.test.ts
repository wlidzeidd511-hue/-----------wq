import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

const OLD_BLACK_ICON_SHA256 = "676a361c8dc519b46a4467e178a011d1b33dfe7c84cec54fd78c84002ca39437";

describe("hosted app branding", () => {
  it("uses the official store title and a reachable PNG logo", async () => {
    const logoUrl = process.env.VITE_APP_LOGO;
    expect(process.env.VITE_APP_TITLE).toBe("هاتف التميز للاتصالات");
    expect(logoUrl).toMatch(/^https:\/\//);

    const response = await fetch(logoUrl!, { redirect: "follow" });
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toMatch(/^image\/(png|jpeg)/i);
    const bytes = await response.arrayBuffer();
    const hash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
    expect(hash).not.toBe(OLD_BLACK_ICON_SHA256);
    expect(bytes.byteLength).toBeGreaterThan(50_000);
  }, 15_000);
});
