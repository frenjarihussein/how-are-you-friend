import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Kind = "partner" | "warehouse" | "product";
const TITLE: Record<Kind, string> = { partner: "زبون / مورد جديد", warehouse: "مستودع جديد", product: "مادة جديدة" };
const LINK: Record<Kind, string> = { partner: "+ إضافة زبون / مورد", warehouse: "+ إضافة مستودع", product: "+ إضافة مادة" };

/** Small link that opens a dialog to create a card without leaving the form. */
export function QuickAdd({ kind, onCreated }: { kind: Kind; onCreated: (id: string) => void }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", code: "", partner_type: "customer", phone: "", unit: "قطعة", location: "" });

  async function save() {
    if (!f.name.trim()) { toast.error("الاسم مطلوب"); return; }
    if (kind === "product" && !f.code.trim()) { toast.error("رمز المادة مطلوب"); return; }
    setBusy(true);
    const base = { tenant_id: me?.tenantId, name: f.name.trim(), code: f.code.trim() || null };
    const table = kind === "partner" ? "partners" : kind === "warehouse" ? "warehouses" : "products";
    const row =
      kind === "partner"
        ? { ...base, partner_type: f.partner_type, phone: f.phone || null }
        : kind === "warehouse"
          ? { ...base, location: f.location || null }
          : { tenant_id: me?.tenantId, name: f.name.trim(), sku: f.code.trim(), unit: f.unit || "قطعة" };
    const { data, error } = await db.from(table).insert(row).select("id").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تمت الإضافة");
    await qc.invalidateQueries({ queryKey: ["doc_refs"] });
    await qc.invalidateQueries({ queryKey: ["journal_refs"] });
    onCreated(data.id);
    setOpen(false);
    setF({ ...f, name: "", code: "", phone: "", location: "" });
  }

  return (
    <>
      <button type="button" className="text-xs text-primary hover:underline" onClick={() => setOpen(true)}>
        {LINK[kind]}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{TITLE[kind]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>الاسم *</Label>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
            </div>
            <div className="space-y-1">
              <Label>{kind === "product" ? "رمز المادة *" : "الرمز"}</Label>
              <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
            </div>
            {kind === "partner" && (
              <>
                <div className="space-y-1">
                  <Label>النوع</Label>
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.partner_type} onChange={(e) => setF({ ...f, partner_type: e.target.value })}>
                    <option value="customer">زبون</option>
                    <option value="supplier">مورد</option>
                    <option value="both">زبون ومورد</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>الهاتف</Label>
                  <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                </div>
              </>
            )}
            {kind === "product" && (
              <div className="space-y-1">
                <Label>الوحدة</Label>
                <Input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
              </div>
            )}
            {kind === "warehouse" && (
              <div className="space-y-1">
                <Label>الموقع</Label>
                <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
              </div>
            )}
            <Button onClick={save} disabled={busy} className="w-full">
              <Plus className="size-4" /> {busy ? "جارٍ الحفظ..." : "إضافة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
