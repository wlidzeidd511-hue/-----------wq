import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Web Push client behavior", () => {
  it("shows notifications outside the site, opens tracking, and refreshes open pages", () => {
    const worker = source("client/public/push-sw.js");
    expect(worker).toContain('addEventListener("push"');
    expect(worker).toContain("showNotification");
    expect(worker).toContain('addEventListener("notificationclick"');
    expect(worker).toContain("openWindow");
    expect(worker).toContain("HATTEF_PUSH_REFRESH");
  });

  it("refreshes messages and orders while visible, stops in the background, and still handles push events", () => {
    const inbox = source("client/src/components/DirectMessageInbox.tsx");
    const tracking = source("client/src/pages/TrackOrder.tsx");
    const portal = source("client/src/pages/CustomerPortal.tsx");
    expect(inbox).toContain("refetchInterval: 2_500");
    expect(inbox).toContain("refetchIntervalInBackground: false");
    expect(tracking).toContain("refetchInterval: queryInput ? 5_000 : false");
    expect(tracking).toContain("refetchIntervalInBackground: false");
    expect(portal).toContain("refetchInterval: 5_000");
    expect(portal).toContain("refetchIntervalInBackground: false");
    expect(inbox).toContain("HATTEF_PUSH_REFRESH");
    expect(tracking).toContain("HATTEF_PUSH_REFRESH");
    expect(portal).toContain("HATTEF_PUSH_REFRESH");
  });
});
