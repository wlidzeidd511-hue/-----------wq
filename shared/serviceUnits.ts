type UnitDefinition = {
  key: "minute" | "hour" | "day" | "week" | "month" | "year";
  forms: readonly string[];
  dualForms: readonly string[];
  minutes: number;
  days: number;
  one: string;
  bare: string;
  dual: string;
  plural: string;
};

const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

const ARABIC_NUMBER_WORDS: Record<string, number> = {
  صفر: 0,
  واحد: 1,
  واحده: 1,
  اثنان: 2,
  اثنين: 2,
  اثنتان: 2,
  اثنتين: 2,
  ثلاث: 3,
  ثلاثه: 3,
  اربع: 4,
  اربعه: 4,
  خمس: 5,
  خمسه: 5,
  ست: 6,
  سته: 6,
  سبع: 7,
  سبعه: 7,
  ثمان: 8,
  ثمانيه: 8,
  تسع: 9,
  تسعه: 9,
  عشر: 10,
  عشره: 10,
};

const UNITS: readonly UnitDefinition[] = [
  {
    key: "minute",
    forms: ["دقيقه", "دقائق"],
    dualForms: ["دقيقتين", "دقيقتان"],
    minutes: 1,
    days: 1 / 1440,
    one: "دقيقة واحدة",
    bare: "دقيقة",
    dual: "دقيقتان",
    plural: "دقائق",
  },
  {
    key: "hour",
    forms: ["ساعه", "ساعات"],
    dualForms: ["ساعتين", "ساعتان"],
    minutes: 60,
    days: 1 / 24,
    one: "ساعة واحدة",
    bare: "ساعة",
    dual: "ساعتان",
    plural: "ساعات",
  },
  {
    key: "day",
    forms: ["يوم", "ايام"],
    dualForms: ["يومين", "يومان"],
    minutes: 1440,
    days: 1,
    one: "يوم واحد",
    bare: "يوم",
    dual: "يومان",
    plural: "أيام",
  },
  {
    key: "week",
    forms: ["اسبوع", "اسابيع"],
    dualForms: ["اسبوعين", "اسبوعان"],
    minutes: 10_080,
    days: 7,
    one: "أسبوع واحد",
    bare: "أسبوع",
    dual: "أسبوعان",
    plural: "أسابيع",
  },
  {
    key: "month",
    forms: ["شهر", "شهور", "اشهر"],
    dualForms: ["شهرين", "شهران"],
    minutes: 43_200,
    days: 30,
    one: "شهر واحد",
    bare: "شهر",
    dual: "شهران",
    plural: "أشهر",
  },
  {
    key: "year",
    forms: ["سنه", "سنوات", "عام", "اعوام"],
    dualForms: ["سنتين", "سنتان", "عامين", "عامان"],
    minutes: 525_600,
    days: 365,
    one: "سنة واحدة",
    bare: "سنة",
    dual: "سنتان",
    plural: "سنوات",
  },
] as const;

function compactDecimal(value: number, precision = 2) {
  return Number(value.toFixed(precision)).toString();
}

export function normalizeArabicDurationInput(value: string | number) {
  return String(value)
    .replace(/[٠-٩]/g, digit => ARABIC_DIGITS[digit] ?? digit)
    .replace(/[٫،,]/g, ".")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[()\[\]{}:؛;!?؟]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsForm(segment: string, form: string) {
  return segment === form || segment.startsWith(`${form} `) || segment.endsWith(` ${form}`) || segment.includes(` ${form} `);
}

function removeForm(segment: string, form: string) {
  return ` ${segment} `.replaceAll(` ${form} `, " ").trim().replace(/\s+/g, " ");
}

function parseQuantity(value: string) {
  if (value === "نصف" || value === "نص") return 0.5;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  return ARABIC_NUMBER_WORDS[value] ?? null;
}

function parseSingleSegment(segment: string, allowedUnits: readonly UnitDefinition[]) {
  const matchedUnits = allowedUnits.filter(unit => [...unit.forms, ...unit.dualForms].some(form => containsForm(segment, form)));
  if (matchedUnits.length !== 1) return null;
  const unit = matchedUnits[0];
  const matchedDual = unit.dualForms.find(form => containsForm(segment, form));
  let quantityText = segment;
  for (const form of [...unit.dualForms, ...unit.forms].sort((a, b) => b.length - a.length)) {
    quantityText = removeForm(quantityText, form);
  }
  if (matchedDual) return quantityText ? null : { quantity: 2, unit };
  if (!quantityText) return { quantity: 1, unit };
  const quantity = parseQuantity(quantityText);
  return quantity === null ? null : { quantity, unit };
}

function parseDuration(value: string | number, allowedKeys: readonly UnitDefinition["key"][], defaultKey: UnitDefinition["key"], factor: "minutes" | "days") {
  const normalized = normalizeArabicDurationInput(value);
  if (!normalized) return 0;
  const directNumeric = Number(normalized);
  const allowedUnits = UNITS.filter(unit => allowedKeys.includes(unit.key));
  const defaultUnit = UNITS.find(unit => unit.key === defaultKey)!;
  if (Number.isFinite(directNumeric) && directNumeric >= 0) return Math.round(directNumeric * defaultUnit[factor]);

  const splitReady = normalized.replace(/\s+و(?=(?:نصف|نص|\d))/g, " و ");
  const segments = splitReady.split(/\s+و\s+/).filter(Boolean);
  let total = 0;
  let previousUnit: UnitDefinition | null = null;
  for (const segment of segments) {
    if (segment === "نصف" || segment === "نص") {
      if (!previousUnit) return null;
      total += 0.5 * previousUnit[factor];
      continue;
    }
    const parsed = parseSingleSegment(segment, allowedUnits);
    if (!parsed) return null;
    total += parsed.quantity * parsed.unit[factor];
    previousUnit = parsed.unit;
  }
  return Number.isFinite(total) && total >= 0 ? Math.round(total) : null;
}

export function parseWorkDurationToMinutes(value: string | number) {
  return parseDuration(value, ["minute", "hour", "day", "week", "month"], "hour", "minutes");
}

export function parseWarrantyDurationToDays(value: string | number) {
  const normalized = normalizeArabicDurationInput(value);
  if (["بدون ضمان", "لا يوجد ضمان", "لا ضمان"].includes(normalized)) return 0;
  return parseDuration(value, ["day", "week", "month", "year"], "year", "days");
}

export function parseHoursInput(value: string | number) {
  const minutes = parseWorkDurationToMinutes(value);
  return minutes === null ? null : minutes / 60;
}

export function parseWarrantyYearsInput(value: string | number) {
  const days = parseWarrantyDurationToDays(value);
  return days === null ? null : days / 365;
}

export function hoursInputToMinutes(value: string | number, fallbackMinutes = 0) {
  return parseWorkDurationToMinutes(value) ?? fallbackMinutes;
}

export function warrantyYearsInputToDays(value: string | number, fallbackDays = 30) {
  return parseWarrantyDurationToDays(value) ?? fallbackDays;
}

function isHalfStep(value: number) {
  return Math.abs(value * 2 - Math.round(value * 2)) < 0.02;
}

function formatQuantity(quantity: number, unit: UnitDefinition): string {
  const rounded = Math.round(quantity * 2) / 2;
  if (Math.abs(rounded - 0.5) < 0.01) return `نصف ${unit.bare}`;
  if (Math.abs(rounded - 1) < 0.01) return unit.one;
  if (Math.abs(rounded - 1.5) < 0.01) return `${unit.bare} ونصف`;
  if (Math.abs(rounded - 2) < 0.01) return unit.dual;
  if (Math.abs(rounded - 2.5) < 0.01) return `${unit.dual} ونصف`;
  const whole = Math.floor(rounded);
  if (Math.abs(rounded - whole - 0.5) < 0.01) return `${formatQuantity(whole, unit)} ونصف`;
  const localized = rounded.toLocaleString("ar-SA", { maximumFractionDigits: 1 });
  return rounded >= 3 && rounded <= 10 ? `${localized} ${unit.plural}` : `${localized} ${unit.bare}`;
}

function formatUsingUnits(value: number, units: readonly UnitDefinition[], factor: "minutes" | "days", emptyLabel: string) {
  if (!Number.isFinite(value) || value <= 0) return emptyLabel;
  for (const unit of units) {
    const quantity = value / unit[factor];
    if (quantity >= 0.5 && isHalfStep(quantity)) return formatQuantity(quantity, unit);
  }
  const smallest = units[units.length - 1];
  return formatQuantity(Math.max(1, Math.round(value / smallest[factor])), smallest);
}

export function formatWorkDuration(minutes: number) {
  const units = ["month", "week", "day", "hour", "minute"].map(key => UNITS.find(unit => unit.key === key)!) as UnitDefinition[];
  return formatUsingUnits(minutes, units, "minutes", "غير محددة");
}

export function formatWarrantyDuration(days: number) {
  if (Number.isFinite(days) && days >= 365) {
    const years = Math.max(1, Math.round((days / 365) * 2) / 2);
    return formatQuantity(years, UNITS.find(unit => unit.key === "year")!);
  }
  const units = ["year", "month", "week", "day"].map(key => UNITS.find(unit => unit.key === key)!) as UnitDefinition[];
  return formatUsingUnits(days, units, "days", "بدون ضمان");
}

export function minutesToHoursInput(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  return formatWorkDuration(minutes);
}

export function warrantyDaysToYearsInput(days: number) {
  if (!Number.isFinite(days) || days <= 0) return "بدون ضمان";
  return formatWarrantyDuration(days);
}

export function formatHoursFromMinutes(minutes: number) {
  return formatWorkDuration(minutes);
}

export function formatWarrantyYears(days: number) {
  return formatWarrantyDuration(days);
}

export function calculateEstimatedCompletionAt(receivedAt: Date | number, durationMinutes: number) {
  const receivedTime = receivedAt instanceof Date ? receivedAt.getTime() : receivedAt;
  if (!Number.isFinite(receivedTime) || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  return receivedTime + Math.round(durationMinutes) * 60_000;
}

export function calculateWarrantyExpiresAt(deliveredAt: Date | number | null | undefined, warrantyDays: number) {
  if (deliveredAt === null || deliveredAt === undefined) return null;
  const deliveredTime = deliveredAt instanceof Date ? deliveredAt.getTime() : deliveredAt;
  if (!Number.isFinite(deliveredTime) || !Number.isFinite(warrantyDays) || warrantyDays <= 0) return null;
  return deliveredTime + Math.round(warrantyDays) * 24 * 60 * 60 * 1000;
}

export function durationDebugValue(value: number) {
  return compactDecimal(value, 2);
}
