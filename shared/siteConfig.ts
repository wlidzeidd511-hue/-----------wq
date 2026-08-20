export const PUBLIC_SITE_URL = "https://hatfaltmyez.com";
export const WHATSAPP_DISPLAY_PHONE = "0559339260";
export const WHATSAPP_INTERNATIONAL_PHONE = "966559339260";
export const STORE_LOGO_URL = "/manus-storage/6e204df3-6eb7-4dd4-a019-113d88a29c57_90e95737.jpg";
export const STORE_APP_ICON_URL = "/manus-storage/hatfaltmyez-share-icon-512-v2_d838982a.png";
export const STORE_APP_ICON_192_URL = "/manus-storage/hatfaltmyez-share-icon-192-v2_aeb06938.png";
export const STORE_APPLE_TOUCH_ICON_URL = "/manus-storage/hatfaltmyez-share-apple-touch-v2_fe24f1fb.png";

export const BRANCH_CONTACT_DEFAULTS = [
  {
    code: "BSR",
    name: "فرع البصيرية",
    whatsappPhone: "0551544112",
    mapUrl: "https://maps.app.goo.gl/1MSjqvDZPjyawSqC7?g_st=ic",
  },
  {
    code: "BAS",
    name: "فرع البساتين",
    whatsappPhone: "0559339260",
    mapUrl: "https://maps.app.goo.gl/azoDzhwYcp1jj1cD8?g_st=ipc",
  },
] as const;

type PublicBranchContactSource = {
  code: string;
  name: string;
  settings?: {
    whatsappPhone?: string | null;
    phone?: string | null;
    mapUrl?: string | null;
  } | null;
};

export function resolveBranchContacts(branches?: readonly PublicBranchContactSource[] | null) {
  return BRANCH_CONTACT_DEFAULTS.map(defaultContact => {
    const branch = branches?.find(item => item.code.toUpperCase() === defaultContact.code);
    return {
      code: defaultContact.code,
      name: branch?.name?.trim() || defaultContact.name,
      whatsappPhone:
        branch?.settings?.whatsappPhone?.trim() ||
        branch?.settings?.phone?.trim() ||
        defaultContact.whatsappPhone,
      mapUrl: branch?.settings?.mapUrl?.trim() || defaultContact.mapUrl,
    };
  });
}

export function buildPublicUrl(path = "/") {
  return new URL(path, PUBLIC_SITE_URL).toString();
}

export function toWhatsAppInternationalPhone(phone?: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return WHATSAPP_INTERNATIONAL_PHONE;
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `966${digits.slice(1)}`;
  return digits;
}

export function buildWhatsAppUrl(message?: string, phone?: string | null) {
  const url = new URL(`https://wa.me/${toWhatsAppInternationalPhone(phone)}`);
  if (message?.trim()) url.searchParams.set("text", message.trim());
  return url.toString();
}
