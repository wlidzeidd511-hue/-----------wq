import { useEffect, useState } from "react";
import { Camera, ImagePlus, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { MAX_INTAKE_PHOTOS, validateIntakePhoto } from "@/lib/intakePhotos";

type IntakePhotoPickerProps = {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
};

function LocalPhotoPreview({ file }: { file: File }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return <img src={src} alt="معاينة صورة الجهاز قبل الصيانة" className="aspect-square h-full w-full object-cover" />;
}

export function IntakePhotoPicker({ files, onChange, disabled = false }: IntakePhotoPickerProps) {
  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const incoming = Array.from(fileList);
    const invalid = incoming.map(validateIntakePhoto).find(Boolean);
    if (invalid) return toast.error(invalid);

    const merged = [...files];
    for (const file of incoming) {
      const duplicate = merged.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified);
      if (!duplicate && merged.length < MAX_INTAKE_PHOTOS) merged.push(file);
    }
    if (incoming.length + files.length > MAX_INTAKE_PHOTOS) toast.info(`الحد الأعلى ${MAX_INTAKE_PHOTOS} صور لكل طلب`);
    onChange(merged);
  }

  return (
    <section className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50/65 p-4" aria-label="صور الجهاز قبل الصيانة">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sky-700">
            <Camera className="h-5 w-5" />
            <h3 className="font-black">صور الجهاز قبل الصيانة</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-600">صوّر حالة الجهاز والخدوش والملحقات قبل حفظ الطلب. تُحفظ الصور داخل الطلب كتـوثيق للاستلام.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          {files.length} من {MAX_INTAKE_PHOTOS}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className={`inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 text-sm font-black text-white shadow-md shadow-sky-500/20 transition hover:bg-sky-600 ${disabled || files.length >= MAX_INTAKE_PHOTOS ? "pointer-events-none opacity-50" : ""}`}>
          <Camera className="h-5 w-5" />
          تصوير الجهاز الآن
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" disabled={disabled} onChange={event => { addFiles(event.target.files); event.currentTarget.value = ""; }} />
        </label>
        <label className={`inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white/80 px-4 text-sm font-black text-sky-800 transition hover:bg-white ${disabled || files.length >= MAX_INTAKE_PHOTOS ? "pointer-events-none opacity-50" : ""}`}>
          <ImagePlus className="h-5 w-5" />
          اختيار صور من الجهاز
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={disabled} onChange={event => { addFiles(event.target.files); event.currentTarget.value = ""; }} />
        </label>
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((file, index) => (
            <figure key={`${file.name}-${file.lastModified}-${index}`} className="group relative overflow-hidden rounded-xl border border-white bg-white shadow-sm">
              <LocalPhotoPreview file={file} />
              <button type="button" disabled={disabled} onClick={() => onChange(files.filter((_, photoIndex) => photoIndex !== index))} className="absolute left-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/75 text-white transition hover:bg-red-600" aria-label={`حذف الصورة ${index + 1}`}>
                <X className="h-4 w-4" />
              </button>
              <figcaption className="absolute inset-x-0 bottom-0 truncate bg-slate-950/65 px-2 py-1 text-[11px] text-white">قبل الصيانة {index + 1}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
