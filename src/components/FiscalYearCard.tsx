import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERIOD_TYPES } from "@/components/OnboardingWizard";

/** Splits the fiscal year into periods according to the chosen system. */
function periods(start: string, type: string) {
  const n = type === "quarterly" ? 4 : type === "semiannual" ? 2 : 1;
  const months = 12 / n;
  const out: { from: string; to: string }[] = [];
  const s = new Date(start + "T00:00:00Z");
  for (let i = 0; i < n; i++) {
    const a = new Date(s); a.setUTCMonth(s.getUTCMonth() + i * months);
    const b = new Date(s); b.setUTCMonth(s.getUTCMonth() + (i + 1) * months); b.setUTCDate(b.getUTCDate() - 1);
    out.push({ from: a.toISOString().slice(0, 10), to: b.toISOString().slice(0, 10) });
  }
  return out;
}

export function FiscalYearCard({ tenantId, isAdmin }: { tenantId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ fiscal_start: "", fiscal_end: "", period_type: "yearly", retained_earnings_account_id: "" });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const s = useQuery({
    queryKey: ["fiscal", tenantId],
    queryFn: async () => (await db.from("tenant_settings").select("*").eq("tenant_id", tenantId).maybeSingle()).data,
  });
  const accounts = useQuery({
    queryKey: ["accounts_closing", tenantId],
    queryFn: async () =>
      (await db.from("accounts").select("id,code,name,is_group,nature").eq("tenant_id", tenantId).order("code")).data ?? [],
  });
  useEffect(() => {
    if (s.data)
      setF({
        fiscal_start: s.data.fiscal_start ?? "",
        fiscal_end: s.data.fiscal_end ?? "",
        period_type: s.data.period_type ?? "yearly",
        retained_earnings_account_id: s.data.retained_earnings_account_id ?? "",
      });
  }, [s.data]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["fiscal"] }); qc.invalidateQueries({ queryKey: ["journal"] }); };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("tenant_settings").upsert(
        { tenant_id: tenantId, ...f, fiscal_start: f.fiscal_start || null, fiscal_end: f.fiscal_end || null,
          retained_earnings_account_id: f.retained_earnings_account_id || null },
        { onConflict: "tenant_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم حفظ إعدادات السنة المالية"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("close_fiscal_year");
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم إنشاء قيد الإقفال وتدوير الحسابات إلى السنة الجديدة"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reopen = useMutation({
    mutationFn: async () => { const { error } = await db.rpc("reopen_fiscal_period"); if (error) throw error; },
    onSuccess: () => { toast.success("تم فتح الفترات المقفلة"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = f.fiscal_start ? periods(f.fiscal_start, f.period_type) : [];

  return (
    <div className="mb-8">
      <PageHeader title="السنة المالية والإقفال" subtitle="بداية ونهاية السنة المالية، نظام الفترات، قيود الإقفال وتدوير الحسابات" />
      <div className="max-w-3xl space-y-4 rounded-lg border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label>بداية السنة المالية</Label><Input type="date" disabled={!isAdmin} value={f.fiscal_start} onChange={(e) => setF({ ...f, fiscal_start: e.target.value })} /></div>
          <div className="space-y-1"><Label>نهاية السنة المالية</Label><Input type="date" disabled={!isAdmin} value={f.fiscal_end} onChange={(e) => setF({ ...f, fiscal_end: e.target.value })} /></div>
          <div className="space-y-1">
            <Label>نظام الفترات</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={!isAdmin} value={f.period_type} onChange={(e) => setF({ ...f, period_type: e.target.value })}>
              {PERIOD_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>حساب الأرباح والخسائر الختامي (تُقفل إليه حسابات الإيرادات والمصاريف)</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={!isAdmin} value={f.retained_earnings_account_id} onChange={(e) => setF({ ...f, retained_earnings_account_id: e.target.value })}>
            <option value="">— غير محدد —</option>
            {(accounts.data ?? []).filter((a: any) => !a.is_group && a.nature !== "profit_loss").map((a: any) => (
              <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
            ))}
          </select>
        </div>
        {list.length > 0 && (
          <div className="text-sm">
            <div className="mb-1 font-semibold">فترات السنة</div>
            <div className="flex flex-wrap gap-2">
              {list.map((p, i) => (
                <span key={i} className="rounded-md border px-2 py-1 text-xs">الفترة {i + 1}: {fmtDate(p.from)} ← {fmtDate(p.to)}</span>
              ))}
            </div>
          </div>
        )}
        {s.data?.closed_until && (
          <p className="text-sm text-destructive">الفترات مقفلة حتى {fmtDate(s.data.closed_until)} — لا يمكن إضافة أو تعديل قيود قبل هذا التاريخ.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!isAdmin || save.isPending} onClick={() => save.mutate()}>حفظ</Button>
          <Button
            variant="outline"
            disabled={!isAdmin || close.isPending || !s.data?.fiscal_end}
            onClick={() => {
              if (window.confirm(`سيتم إنشاء قيد إقفال لحسابات الأرباح والخسائر للسنة المنتهية في ${fmtDate(s.data?.fiscal_end)}، وإقفال الفترة، وتدوير الحسابات إلى السنة التالية. متابعة؟`))
                close.mutate();
            }}
          >
            إقفال السنة وتدوير الحسابات
          </Button>
          {s.data?.closed_until && (
            <Button variant="ghost" disabled={!isAdmin || reopen.isPending} onClick={() => window.confirm("فتح الفترات المقفلة؟") && reopen.mutate()}>
              إلغاء إقفال الفترات
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          الحسابات الختامية (قائمة الدخل والميزانية) تظهر في صفحة التقارير المالية. أرصدة حسابات الميزانية تنتقل تلقائياً للسنة الجديدة، وتُصفّر حسابات الأرباح والخسائر بقيد الإقفال.
        </p>
      </div>
    </div>
  );
}
