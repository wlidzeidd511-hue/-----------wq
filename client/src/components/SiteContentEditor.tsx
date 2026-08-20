import { useEffect, useMemo, useState } from "react";
import { Save, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type SiteContent = {
  id: number;
  contentKey: string;
  contentType: "text" | "textarea" | "number" | "url" | "phone";
  label: string;
  value: string;
  description?: string | null;
  category: string;
  sortOrder: number;
};

const categoryLabels = {
  general: "عام",
  messages: "الرسائل",
  contact: "التواصل",
} as const;

export function SiteContentEditor({ branchId }: { branchId?: number }) {
  const utils = trpc.useUtils();
  const [contents, setContents] = useState<SiteContent[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("general");

  const queryInput = useMemo(() => ({ branchId }), [branchId]);
  const contentsQuery = trpc.content.getAll.useQuery(queryInput, { retry: false });
  const updateMutation = trpc.content.update.useMutation();
  const initializeMutation = trpc.content.initialize.useMutation();

  useEffect(() => {
    if (contentsQuery.data) {
      setContents(contentsQuery.data);
    }
  }, [contentsQuery.data]);

  const categories = Array.from(new Set(contents.map(c => c.category)));
  const filteredContents = selectedCategory
    ? contents.filter(c => c.category === selectedCategory)
    : contents;

  async function handleSave(contentId: number, newValue: string) {
    try {
      const saved = await updateMutation.mutateAsync({
        id: contentId,
        value: newValue,
      });
      setContents(prev =>
        prev.map(c => (c.id === contentId ? { ...c, value: saved.value } : c))
      );
      await Promise.all([
        utils.content.getAll.invalidate(queryInput),
        utils.content.public.invalidate(),
      ]);
      await contentsQuery.refetch();
      setEditingId(null);
      toast.success("تم حفظ التعديل وظهر مباشرة في الموقع");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حدث خطأ أثناء الحفظ");
    }
  }

  async function handleInitialize() {
    try {
      await initializeMutation.mutateAsync();
      await Promise.all([utils.content.getAll.invalidate(queryInput), utils.content.public.invalidate()]);
      await contentsQuery.refetch();
      toast.success("تم تهيئة النصوص الافتراضية");
    } catch (error) {
      toast.error("حدث خطأ أثناء التهيئة");
      console.error(error);
    }
  }

  if (contentsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!contents.length) {
    return (
      <Card className="border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-amber-950">لا توجد نصوص مخزنة</p>
              <p className="mt-1 text-sm text-amber-800">
                اضغط على الزر أدناه لتهيئة النصوص الافتراضية
              </p>
            </div>
          </div>
          <Button
            onClick={handleInitialize}
            disabled={initializeMutation.isPending}
            className="flex-shrink-0"
          >
            {initializeMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            تهيئة النصوص
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedCategory === "" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedCategory("")}
        >
          الكل ({contents.length})
        </Button>
        {categories.map(cat => (
          <Button
            key={cat}
            variant={selectedCategory === cat ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(cat)}
          >
            {categoryLabels[cat as keyof typeof categoryLabels] || cat} (
            {contents.filter(c => c.category === cat).length})
          </Button>
        ))}
      </div>

      {/* Content Items */}
      <div className="grid gap-4">
        {filteredContents.map(content => (
          <Card key={content.id} className="p-5">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-black">{content.label}</h3>
                {content.description && (
                  <p className="mt-1 text-sm text-slate-500">
                    {content.description}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">
                    {content.contentKey}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="text-xs"
                  >
                    {content.contentType}
                  </Badge>
                </div>
              </div>
            </div>

            {editingId === content.id ? (
              <div className="space-y-3">
                {content.contentType === "textarea" ? (
                  <Textarea
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    className="min-h-32"
                  />
                ) : (
                  <Input
                    type={
                      content.contentType === "number"
                        ? "number"
                        : content.contentType === "phone"
                          ? "tel"
                          : "text"
                    }
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    dir={
                      content.contentType === "url" ||
                      content.contentType === "phone"
                        ? "ltr"
                        : "auto"
                    }
                  />
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      handleSave(content.id, editValue)
                    }
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    حفظ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingId(null)}
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border bg-slate-50 p-3">
                  {content.contentType === "textarea" ? (
                    <p className="whitespace-pre-wrap text-sm leading-7">
                      {content.value}
                    </p>
                  ) : (
                    <p className="text-sm font-mono">{content.value}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingId(content.id);
                    setEditValue(content.value);
                  }}
                >
                  تعديل
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
