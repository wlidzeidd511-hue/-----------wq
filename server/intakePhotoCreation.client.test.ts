import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_INTAKE_PHOTO_BYTES, MAX_INTAKE_PHOTOS, validateIntakePhoto } from "../client/src/lib/intakePhotos";

const projectRoot = resolve(import.meta.dirname, "..");
const readProjectFile = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf8");

describe("Creation-time intake photos and price approval UI", () => {
  it("accepts supported image types and rejects oversized or unsupported files", () => {
    expect(validateIntakePhoto({ type: "image/jpeg", size: MAX_INTAKE_PHOTO_BYTES })).toBeNull();
    expect(validateIntakePhoto({ type: "image/png", size: 100 })).toBeNull();
    expect(validateIntakePhoto({ type: "image/gif", size: 100 })).toContain("JPG");
    expect(validateIntakePhoto({ type: "image/webp", size: MAX_INTAKE_PHOTO_BYTES + 1 })).toContain("6 ميجابايت");
    expect(MAX_INTAKE_PHOTOS).toBe(6);
  });

  it("offers camera capture and file selection before an order is created", () => {
    const picker = readProjectFile("client/src/components/IntakePhotoPicker.tsx");
    expect(picker).toContain('capture="environment"');
    expect(picker).toContain("تصوير الجهاز الآن");
    expect(picker).toContain("اختيار صور من الجهاز");
  });

  it("uploads pre-repair photos and requests price approval in owner and staff creation flows", () => {
    const owner = readProjectFile("client/src/pages/Dashboard.tsx");
    const staff = readProjectFile("client/src/pages/StaffPortal.tsx");

    expect(owner).toContain("requestPriceApproval: requestApprovalOnCreate");
    expect(staff).toContain("requestPriceApproval: canViewPrices && requestApprovalOnCreate");
    expect(staff).toContain("canViewPrices && <CreatePriceApprovalOption");

    for (const source of [owner, staff]) {
      expect(source).toContain("<IntakePhotoPicker");
      expect(source).toContain("قبل الصيانة");
      expect(source).toContain("تعذر رفع");
    }
  });
});
