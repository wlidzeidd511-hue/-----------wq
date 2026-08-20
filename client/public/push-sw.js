self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "هاتف التميز", body: "لديك تحديث جديد على جهازك." };
  }

  const title = data.title || "هاتف التميز للاتصالات";
  const options = {
    body: data.body || "لديك تحديث جديد على طلبك.",
    icon: data.icon || "/manus-storage/hatfaltmyez-share-icon-512-v2_d838982a.png",
    badge: data.badge || "/manus-storage/hatfaltmyez-share-icon-192-v2_aeb06938.png",
    tag: data.tag || `hattef-${Date.now()}`,
    renotify: true,
    dir: "rtl",
    lang: "ar",
    data: { url: data.url || "/account", orderId: data.orderId, eventType: data.eventType },
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: "HATTEF_PUSH_REFRESH", ...options.data });
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/account", self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if ("focus" in client) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});
