export const OWNER_PORTAL_PATH = "/owner-vault";

function requestPath(requestUrl: string) {
  try {
    return new URL(requestUrl, "https://hatfaltmyez.com").pathname.replace(/\/$/, "") || "/";
  } catch {
    return requestUrl.split("?")[0]?.replace(/\/$/, "") || "/";
  }
}

export function isOwnerPortalRequest(requestUrl: string) {
  return requestPath(requestUrl) === OWNER_PORTAL_PATH;
}

export function applyOwnerPortalDocumentHead(template: string, requestUrl: string) {
  if (!isOwnerPortalRequest(requestUrl)) return template;

  return template
    .replace(/<title>[^<]*<\/title>/, "<title>تحكم المالك — هاتف التميز</title>")
    .replace(/<link rel="canonical" href="[^"]*" \/>/, '<link rel="canonical" href="https://hatfaltmyez.com/owner-vault" />')
    .replace(/<meta property="og:url" content="[^"]*" \/>/, '<meta property="og:url" content="https://hatfaltmyez.com/owner-vault" />')
    .replace(/<meta property="og:title" content="[^"]*" \/>/, '<meta property="og:title" content="بوابة تحكم المالك" />')
    .replace(/<meta name="theme-color" content="[^"]*" \/>/, '<meta name="theme-color" content="#0f172a" />')
    .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*" \/>/, '<meta name="apple-mobile-web-app-title" content="تحكم المالك" />')
    .replace(/<link rel="manifest" href="[^"]*" \/>/, '<link rel="manifest" href="/owner-control.webmanifest?v=2" />')
    .replace(
      "</head>",
      '    <meta name="application-name" content="تحكم المالك" />\n    <meta name="mobile-web-app-capable" content="yes" />\n    <meta name="robots" content="noindex,nofollow,noarchive" />\n  </head>',
    );
}
