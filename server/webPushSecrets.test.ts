import { createECDH, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import webpush from "web-push";

describe("Web Push VAPID configuration", () => {
  it("generates a signed and encrypted Push API request with the configured key pair", () => {
    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    const subject = process.env.WEB_PUSH_VAPID_SUBJECT;

    expect(publicKey).toBeTruthy();
    expect(privateKey).toBeTruthy();
    expect(subject).toMatch(/^https:\/\/|^mailto:/);

    webpush.setVapidDetails(subject!, publicKey!, privateKey!);

    const recipient = createECDH("prime256v1");
    recipient.generateKeys();
    const request = webpush.generateRequestDetails(
      {
        endpoint: "https://updates.push.services.mozilla.com/wpush/v2/vapid-validation",
        keys: {
          p256dh: recipient.getPublicKey().toString("base64url"),
          auth: randomBytes(16).toString("base64url"),
        },
      },
      JSON.stringify({ title: "اختبار إشعارات هاتف التميز" }),
      { TTL: 60, urgency: "normal" },
    );

    expect(request.endpoint).toContain("push.services.mozilla.com");
    expect(request.headers.Authorization).toContain("vapid");
    expect(request.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(request.headers.TTL).toBe(60);
    expect(request.body).toBeInstanceOf(Buffer);
  });
});
