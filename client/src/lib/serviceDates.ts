import { formatWarrantyDuration, formatWorkDuration } from "@shared/serviceUnits";

type DateValue = Date | number | string | null | undefined;

export function formatServiceDateTime(value: DateValue) {
  if (!value) return "غير محدد";
  return new Date(value).toLocaleString("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  });
}

export function formatEstimatedSchedule(durationMinutes: number, estimatedCompletionAt: DateValue) {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return "المدة غير محددة";
  const duration = formatWorkDuration(durationMinutes);
  return estimatedCompletionAt
    ? `${duration} · الموعد المتوقع ${formatServiceDateTime(estimatedCompletionAt)}`
    : duration;
}

export function formatWarrantySchedule(input: {
  warrantyDays: number;
  deliveredAt?: DateValue;
  warrantyExpiresAt?: DateValue;
}) {
  if (!Number.isFinite(input.warrantyDays) || input.warrantyDays <= 0) return "بدون ضمان";
  const duration = formatWarrantyDuration(input.warrantyDays);
  if (!input.deliveredAt) return `${duration} · يبدأ الضمان بعد التسليم`;
  const start = formatServiceDateTime(input.deliveredAt);
  const end = input.warrantyExpiresAt ? formatServiceDateTime(input.warrantyExpiresAt) : "غير محدد";
  return `${duration} · يبدأ ${start} · ينتهي ${end}`;
}
