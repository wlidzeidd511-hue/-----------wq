import { describe, expect, it } from "vitest";
import {
  calculateEstimatedCompletionAt,
  calculateWarrantyExpiresAt,
  formatHoursFromMinutes,
  formatWarrantyDuration,
  formatWarrantyYears,
  hoursInputToMinutes,
  minutesToHoursInput,
  parseHoursInput,
  parseWarrantyDurationToDays,
  parseWorkDurationToMinutes,
  parseWarrantyYearsInput,
  warrantyDaysToYearsInput,
  warrantyYearsInputToDays,
} from "../client/src/lib/serviceUnits";

describe("service warranty and duration units", () => {
  it("shows 120 stored minutes as two hours and converts hour input back to minutes", () => {
    expect(formatHoursFromMinutes(120)).toBe("ساعتان");
    expect(minutesToHoursInput(120)).toBe("ساعتان");
    expect(hoursInputToMinutes("2")).toBe(120);
    expect(hoursInputToMinutes("1.5")).toBe(90);
    expect(hoursInputToMinutes("ساعتين")).toBe(120);
    expect(hoursInputToMinutes("3 ساعات")).toBe(180);
    expect(hoursInputToMinutes("٣ ساعات")).toBe(180);
    expect(parseWorkDurationToMinutes("90 دقيقة")).toBe(90);
    expect(parseWorkDurationToMinutes("ساعة ونص")).toBe(90);
    expect(parseWorkDurationToMinutes("ساعتين و30 دقيقة")).toBe(150);
    expect(parseWorkDurationToMinutes("يوم ونص")).toBe(2160);
    expect(parseWorkDurationToMinutes("أسبوعين")).toBe(20_160);
    expect(parseHoursInput("عبارة غير مفهومة")).toBeNull();
  });

  it("shows 660 legacy days as two years and stores new year input as days", () => {
    expect(formatWarrantyYears(660)).toBe("سنتان");
    expect(warrantyDaysToYearsInput(660)).toBe("سنتان");
    expect(warrantyYearsInputToDays("2")).toBe(730);
    expect(warrantyYearsInputToDays("سنتين")).toBe(730);
    expect(warrantyYearsInputToDays("3 سنوات")).toBe(1095);
    expect(warrantyYearsInputToDays("٣ سنوات")).toBe(1095);
    expect(parseWarrantyDurationToDays("30 يوم")).toBe(30);
    expect(parseWarrantyDurationToDays("6 شهور")).toBe(180);
    expect(parseWarrantyDurationToDays("سنة ونص")).toBe(548);
    expect(parseWarrantyDurationToDays("سنتين و6 شهور")).toBe(910);
    expect(parseWarrantyDurationToDays("بدون ضمان")).toBe(0);
    expect(parseWarrantyYearsInput("عبارة غير مفهومة")).toBeNull();
  });

  it("formats stored values with the clearest natural unit", () => {
    expect(formatWarrantyYears(30)).toBe("شهر واحد");
    expect(formatWarrantyDuration(180)).toBe("٦ أشهر");
    expect(formatWarrantyDuration(548)).toBe("سنة ونصف");
    expect(formatHoursFromMinutes(30)).toBe("نصف ساعة");
    expect(formatHoursFromMinutes(2160)).toBe("يوم ونصف");
  });

  it("calculates completion from receipt and warranty expiration from actual delivery", () => {
    const receivedAt = 1_700_000_000_000;
    const deliveredAt = 1_700_100_000_000;
    expect(calculateEstimatedCompletionAt(receivedAt, 90)).toBe(receivedAt + 90 * 60_000);
    expect(calculateEstimatedCompletionAt(receivedAt, 0)).toBeNull();
    expect(calculateWarrantyExpiresAt(deliveredAt, 180)).toBe(deliveredAt + 180 * 24 * 60 * 60 * 1000);
    expect(calculateWarrantyExpiresAt(null, 180)).toBeNull();
    expect(calculateWarrantyExpiresAt(deliveredAt, 0)).toBeNull();
  });
});
