export const MAX_INTAKE_PHOTOS = 6;
export const MAX_INTAKE_PHOTO_BYTES = 6 * 1024 * 1024;
export const INTAKE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function validateIntakePhoto(file: Pick<File, "type" | "size">) {
  if (!INTAKE_PHOTO_TYPES.includes(file.type as (typeof INTAKE_PHOTO_TYPES)[number])) {
    return "الأنواع المسموحة: JPG وPNG وWEBP";
  }
  if (file.size > MAX_INTAKE_PHOTO_BYTES) {
    return "حجم كل صورة يجب ألا يتجاوز 6 ميجابايت";
  }
  return null;
}

export function readIntakePhotoAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("تعذر قراءة الصورة"));
    reader.readAsDataURL(file);
  });
}
