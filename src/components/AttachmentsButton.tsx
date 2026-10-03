import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Eye, Paperclip, Trash2, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { can, useMe } from "@/lib/session";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const ATTACH_TYPES: { value: string; label: string }[] = [
  { value: "purchase_invoice", label: "فاتورة شراء" },
  { value: "sale_invoice", label: "فاتورة بيع" },
  { value: "receipt", label: "سند قبض" },
  { value: "payment", label: "سند دفع" },
  { value: "contract", label: "عقد" },
  { value: "identity", label: "هوية / إثبات شخصي" },
  { value: "cheque", label: "صورة شيك" },
  { value: "bank", label: "إشعار بنكي" },
  { value: "other", label: "أخرى" },
];
const TYPE_LABEL = Object.fromEntries(ATTACH_TYPES.map((t) => [t.value, t.label]));

type EntityType = "document" | "journal_entry" | "employee";

/** Suggests the attachment kind from the document type. */
function defaultType(docType?: string) {
  return ((
    { sale: "sale_invoice", purchase: "purchase_invoice", receipt: "receipt", payment: "payment" } as Record<string, string>
  )[docType ?? ""] ?? "other") as string;
}

export function AttachmentsButton({
  entityType,
  entityId,
  docType,
  variant = "ghost",
  label,
}: {
  entityType: EntityType;
  entityId: string;
  docType?: string | undefined;
  variant?: "ghost" | "outline";
  label?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const count = useQuery({
    queryKey: ["attachments-count", entityType, entityId],
    queryFn: async () => {
      const { count } = await db
        .from("attachments")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);
      return count ?? 0;
    },
  });
  return (
    <>
      <Button size={label ? "default" : "icon"} variant={variant} title="المرفقات" onClick={() => setOpen(true)} className="relative">
        <Paperclip className="size-4" />
        {label}
        {!!count.data && (
          <span className="absolute -top-1 -left-1 rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground">
            {count.data}
          </span>
        )}
      </Button>
      {open && (
        <AttachmentsDialog entityType={entityType} entityId={entityId} docType={docType} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function AttachmentsDialog({
  entityType,
  entityId,
  docType,
  onClose,
}: {
  entityType: EntityType;
  entityId: string;
  docType?: string | undefined;
  onClose: () => void;
}) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [type, setType] = useState(defaultType(docType));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const mod = entityType === "document" ? "documents" : "journal"; // employees تتبع صلاحيات القيود
  const canAdd = can(me, mod, "create") || can(me, mod, "edit");
  const canDel = can(me, mod, "delete");

  const list = useQuery({
    queryKey: ["attachments", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await db
        .from("attachments")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["attachments", entityType, entityId] });
    qc.invalidateQueries({ queryKey: ["attachments-count", entityType, entityId] });
  }

  async function upload() {
    if (!me?.tenantId) { toast.error("لا توجد شركة مرتبطة بحسابك"); return; }
    if (!files.length) { toast.error("اختر ملفاً واحداً على الأقل"); return; }
    setBusy(true);
    try {
      for (const f of files) {
        const ext = f.name.includes(".") ? f.name.split(".").pop() : "bin";
        const path = `${me.tenantId}/${entityType}/${entityId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("attachments").upload(path, f, { contentType: f.type });
        if (upErr) throw upErr;
        const { error } = await db.from("attachments").insert({
          tenant_id: me.tenantId,
          entity_type: entityType,
          entity_id: entityId,
          attach_type: type,
          file_path: path,
          file_name: f.name,
          mime_type: f.type || null,
          size_bytes: f.size,
          notes: notes || null,
        });
        if (error) {
          await supabase.storage.from("attachments").remove([path]);
          throw error;
        }
      }
      toast.success(files.length > 1 ? `تم رفع ${files.length} مرفقات` : "تم رفع المرفق");
      setFiles([]);
      setNotes("");
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const [preview, setPreview] = useState<{ url: string; mime: string; name: string } | null>(null);
  async function openFile(path: string, download = true) {
    const { data, error } = await supabase.storage.from("attachments").createSignedUrl(path, 300, download ? { download: true } : undefined);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function previewFile(a: any) {
    const { data, error } = await supabase.storage.from("attachments").createSignedUrl(a.file_path, 600);
    if (error) { toast.error(error.message); return; }
    setPreview({ url: data.signedUrl, mime: a.mime_type ?? "", name: a.file_name });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function remove(a: any) {
    if (!window.confirm(`حذف المرفق "${a.file_name}"؟`)) return;
    const { error } = await db.from("attachments").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    await supabase.storage.from("attachments").remove([a.file_path]);
    toast.success("تم حذف المرفق");
    refresh();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>المرفقات</DialogTitle>
        </DialogHeader>

        {canAdd && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>نوع المرفق</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  {ATTACH_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>ملاحظات</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                className="text-sm"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
              <Button onClick={upload} disabled={busy || !files.length}>
                <Upload className="size-4" />
                {busy ? "جارٍ الرفع..." : "رفع"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">يمكن اختيار أكثر من ملف دفعة واحدة. الحد الأقصى 20 ميغابايت للملف.</p>
          </div>
        )}

        <div className="max-h-80 overflow-auto">
          {list.isLoading ? (
            <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
          ) : !list.data?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد مرفقات بعد</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="px-2 py-1 text-right">الملف</th>
                  <th className="px-2 py-1 text-right">النوع</th>
                  <th className="px-2 py-1 text-right">التاريخ</th>
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {list.data.map((a) => (
                  <tr key={a.id} className="border-b">
                    <td className="px-2 py-1">
                      <div className="font-medium">{a.file_name}</div>
                      {a.notes && <div className="text-xs text-muted-foreground">{a.notes}</div>}
                    </td>
                    <td className="px-2 py-1">{TYPE_LABEL[a.attach_type] ?? a.attach_type}</td>
                    <td className="px-2 py-1">{fmtDate(a.created_at)}</td>
                    <td className="px-2 py-1">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="معاينة" onClick={() => previewFile(a)}>
                          <Eye className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="تنزيل" onClick={() => openFile(a.file_path)}>
                          <Download className="size-4" />
                        </Button>
                        {canDel && (
                          <Button size="icon" variant="ghost" title="حذف" onClick={() => remove(a)}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
      {preview && (
        <Dialog open onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent className="max-w-5xl">
            <DialogHeader><DialogTitle>{preview.name}</DialogTitle></DialogHeader>
            {preview.mime.startsWith("image/") ? (
              <img src={preview.url} alt={preview.name} className="mx-auto max-h-[75vh] object-contain" />
            ) : preview.mime === "application/pdf" || preview.mime.startsWith("text/") ? (
              <iframe src={preview.url} title={preview.name} className="h-[75vh] w-full rounded border" />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">لا يمكن معاينة هذا النوع من الملفات داخل البرنامج، استخدم زر التنزيل.</p>
            )}
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
