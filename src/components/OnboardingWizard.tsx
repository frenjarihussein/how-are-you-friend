import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { seedMyCompany } from "@/lib/admin.functions";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export const PERIOD_TYPES = [
  { value: "quarterly", label: "ربعي (4 فترات)" },
  { value: "semiannual", label: "نصف سنوي (فترتان)" },
  { value: "yearly", label: "سنوي (فترة واحدة)" },
];

const year = new Date().getFullYear();

export function OnboardingWizard({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const qc = useQueryClient();
  const seedFn = useServerFn(seedMyCompany);
  const settings = useQuery({
    queryKey: ["onboarding", tenantId],
    queryFn: async () =>
      (await db.from("tenant_settings").select("onboarding_done").eq("tenant_id", tenantId).maybeSingle()).data,
  });
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [f, setF] = useState({
    name: tenantName,
    phone: "",
    address: "",
    fiscal_start: `${year}-01-01`,
    fiscal_end: `${year}-12-31`,
    period_type: "yearly",
    seedCoa: true,
    warehouse: "المستودع الرئيسي",
  });

  const open = !dismissed && settings.isSuccess && !settings.data?.onboarding_done;

  async function finish() {
    setBusy(true);
    try {
      const { error: e1 } = await db.rpc("update_company_info", {
        _name: f.name, _code: "", _phone: f.phone, _address: f.address, _notes: "",
      });
      if (e1) throw e1;
      if (f.seedCoa) await seedFn();
      if (f.warehouse.trim()) {
        const { count } = await db.from("warehouses").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
        if (!count) await db.from("warehouses").insert({ tenant_id: tenantId, code: "01", name: f.warehouse.trim() });
      }
      const { data: re } = await db.from("accounts").select("id").eq("tenant_id", tenantId).eq("code", "9102").maybeSingle();
      const { error } = await db.from("tenant_settings").upsert(
        {
          tenant_id: tenantId,
          fiscal_start: f.fiscal_start,
          fiscal_end: f.fiscal_end,
          period_type: f.period_type,
          retained_earnings_account_id: re?.id ?? null,
          onboarding_done: true,
        },
        { onConflict: "tenant_id" },
      );
      if (error) throw error;
      toast.success("تم تجهيز الشركة بالإعدادات الافتراضية");
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && setDismissed(true)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تجهيز الشركة لأول مرة — الخطوة {step} من 3</DialogTitle>
        </DialogHeader>
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">بيانات الشركة الأساسية</p>
            <div className="space-y-1"><Label>اسم الشركة</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="space-y-1"><Label>الهاتف</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div className="space-y-1"><Label>العنوان</Label><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">السنة المالية</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>بداية السنة المالية</Label><Input type="date" value={f.fiscal_start} onChange={(e) => setF({ ...f, fiscal_start: e.target.value })} /></div>
              <div className="space-y-1"><Label>نهاية السنة المالية</Label><Input type="date" value={f.fiscal_end} onChange={(e) => setF({ ...f, fiscal_end: e.target.value })} /></div>
            </div>
            <div className="space-y-1">
              <Label>نظام الفترات</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.period_type} onChange={(e) => setF({ ...f, period_type: e.target.value })}>
                {PERIOD_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">الإعدادات الافتراضية</p>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={f.seedCoa} onCheckedChange={(v) => setF({ ...f, seedCoa: !!v })} />
              إنشاء شجرة الحسابات الموحدة وربط الحسابات تلقائياً (إن كانت الشجرة فارغة)
            </label>
            <div className="space-y-1"><Label>اسم المستودع الافتراضي</Label><Input value={f.warehouse} onChange={(e) => setF({ ...f, warehouse: e.target.value })} /></div>
          </div>
        )}
        <DialogFooter className="gap-2">
          {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)}>السابق</Button>}
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!f.name.trim()}>التالي</Button>
          ) : (
            <Button onClick={finish} disabled={busy}>{busy ? "جارٍ التجهيز..." : "إنهاء وحفظ"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
