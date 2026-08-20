import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyOwnerPortalDocumentHead, isOwnerPortalRequest } from "./ownerPortalHtml";

const template = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");

describe("owner portal install document", () => {
  it("serves the owner manifest and Apple title before React loads", () => {
    const html = applyOwnerPortalDocumentHead(template, "/owner-vault?enroll=one-time-token");
    expect(html).toContain('<link rel="manifest" href="/owner-control.webmanifest?v=2" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="تحكم المالك" />');
    expect(html).toContain('<meta name="application-name" content="تحكم المالك" />');
    expect(html).toContain('<link rel="canonical" href="https://hatfaltmyez.com/owner-vault" />');
    expect(html).toContain('<meta name="robots" content="noindex,nofollow,noarchive" />');
    expect(html).not.toContain('<link rel="manifest" href="/manifest.json?v=2" />');
  });

  it("leaves the public customer document and manifest unchanged", () => {
    expect(applyOwnerPortalDocumentHead(template, "/")).toBe(template);
    expect(applyOwnerPortalDocumentHead(template, "/track")).toBe(template);
    expect(isOwnerPortalRequest("/owner-vault/")).toBe(true);
    expect(isOwnerPortalRequest("/owner-vault-evil")).toBe(false);
  });
});
