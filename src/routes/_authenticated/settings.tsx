import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { processLogo, useBranding } from "@/lib/branding";
import { FiscalYearCard } from "@/components/FiscalYearCard";
import { BackupButtons, CloudBackupCard } from "@/components/BackupButtons";
import { CurrenciesCard } from "@/components/CurrenciesCard";
import { UnitsCard } from "@/components/UnitsCard";
import { NotificationPrefs } from "@/components/NotificationPrefs";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

const FIELDS = [
  { key: "cash_account_id", label: "حساب الصندوق / المصرف" },
  { key: "customers_account_id", label: "حساب الزبائن (الذمم المدينة)" },
  { key: "suppliers_account_id", label: "حساب الموردين (الذمم الدائنة)" },
  { key: "inventory_account_id", label: "حساب المخزون" },
  { key: "sales_account_id", label: "حساب المبيعات" },
  { key: "cogs_account_id", label: "حساب تكلفة المبيعات" },
  { key: "project_cost_account_id", label: "حساب تكاليف المشاريع" },
  { key: "fx_account_id", label: "حساب فروق أسعار الصرف" },
] as const;

function SettingsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const editable = can(me, "accounts", "edit");
  const [form, setForm] = useState<Record<string, string>>({});

  const accounts = useQuery({
    queryKey: ["accounts_flat", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () =>
      (await scope(db.from("accounts").select("id,code,name,is_group"), me?.tenantId).order("code")).data ?? [],
  });

  const settings = useQuery({
    queryKey: ["tenant_settings", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () =>
      (await db.from("tenant_settings").select("*").eq("tenant_id", me!.tenantId).maybeSingle()).data,
  });

  useEffect(() => {
    if (settings.data) {
      const next: Record<string, string> = {};
      FIELDS.forEach((f) => {
        next[f.key] = settings.data[f.key] ?? "";
      });
      setForm(next);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string | null> = { tenant_id: me!.tenantId! };
      FIELDS.forEach((f) => {
        payload[f.key] = form[f.key] || null;
      });
      const { error } = await db.from("tenant_settings").upsert(payload, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ الإعدادات");
      qc.invalidateQueries({ queryKey: ["tenant_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-8 max-w-3xl">
        <PageHeader title="إشعاراتي" subtitle="اختر أنواع الإشعارات التي تريد أن تصلك على هذا الحساب" />
        <div className="rounded-lg border bg-card p-5"><NotificationPrefs /></div>
      </div>
      <BrandingCard tenantId={me?.tenantId ?? null} editable={editable} />
      {me?.tenantId && <FiscalYearCard tenantId={me.tenantId} isAdmin={!!me.isTenantAdmin} />}
      {me?.tenantId && <CurrenciesCard editable={editable} />}
      {me?.tenantId && <UnitsCard editable={can(me, "products", "edit")} />}
      {me?.tenantId && me.isTenantAdmin && (
        <div className="mb-8">
          <PageHeader title="النسخ الاحتياطي والاسترجاع" subtitle="تنزيل كل بيانات الشركة في ملف Excel (ورقة لكل جدول)، أو استرجاعها من ملف سابق" />
          <div className="flex max-w-3xl flex-wrap gap-2 rounded-lg border bg-card p-5">
            <BackupButtons tenantId={me.tenantId} name={me.tenantName ?? "الشركة"} />
          </div>
          <div className="mt-4 max-w-3xl">
            <CloudBackupCard tenantId={me.tenantId} />
          </div>
        </div>
      )}
      <PageHeader
        title="إعدادات الربط المحاسبي"
        subtitle="تحديد الحسابات التي تُرحّل إليها المستندات تلقائياً (فواتير، سندات، حركات مخزون)"
      />

      <div className="max-w-3xl space-y-4 rounded-lg border bg-card p-5">
        {FIELDS.map((f) => (
          <div key={f.key} className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:items-center">
            <Label>{f.label}</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              disabled={!editable}
              value={form[f.key] ?? ""}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            >
              <option value="">— غير محدد —</option>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(accounts.data ?? [])
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .filter((a: any) => !a.is_group)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </option>
                ))}
            </select>
          </div>
        ))}
        <Button onClick={() => save.mutate()} disabled={!editable || save.isPending}>
          {save.isPending ? "جارٍ الحفظ..." : "حفظ"}
        </Button>
      </div>
    </div>
  );
}

function BrandingCard({ tenantId, editable }: { tenantId: string | null; editable: boolean }) {
  const qc = useQueryClient();
  const brand = useBranding();
  const [logo, setLogo] = useState<string | null>(null);
  const [color, setColor] = useState<string>("");
  const [suggested, setSuggested] = useState<string[]>([]);

  useEffect(() => {
    if (brand.data) {
      setLogo(brand.data.logo_url);
      setColor(brand.data.primary_color ?? "");
    }
  }, [brand.data]);

  const save = useMutation({
    mutationFn: async (reset?: boolean) => {
      const { error } = await db.from("tenant_settings").upsert(
        { tenant_id: tenantId!, logo_url: reset ? null : logo, primary_color: reset ? null : color || null },
        { onConflict: "tenant_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ الشعار والألوان");
      qc.invalidateQueries({ queryKey: ["branding"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const r = await processLogo(f);
      setLogo(r.dataUrl);
      setSuggested(r.colors);
      if (r.colors[0]) setColor(r.colors[0]);
    } catch {
      toast.error("تعذّر قراءة الصورة");
    }
  }

  return (
    <div className="mb-8">
      <PageHeader title="شعار الشركة وألوان البرنامج" subtitle="ارفع شعار شركتك وسيقترح البرنامج ألواناً مأخوذة منه" />
      <div className="max-w-3xl space-y-4 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-24 items-center justify-center rounded-lg border bg-background">
            {logo ? <img src={logo} alt="" className="max-h-20 max-w-20 object-contain" /> : <span className="text-xs text-muted-foreground">لا يوجد شعار</span>}
          </div>
          <div className="space-y-1">
            <Label>رفع الشعار</Label>
            <Input type="file" accept="image/*" disabled={!editable} onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        </div>
        {suggested.length > 0 && (
          <div className="space-y-1">
            <Label>ألوان مقترحة من الشعار</Label>
            <div className="flex gap-2">
              {suggested.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => setColor(c)}
                  className={`size-9 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Label>اللون الرئيسي</Label>
          <input type="color" value={color || "#0f766e"} disabled={!editable} onChange={(e) => setColor(e.target.value)} className="h-9 w-16 cursor-pointer rounded border" />
          <span className="num text-sm text-muted-foreground">{color || "الافتراضي"}</span>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => save.mutate(false)} disabled={!editable || !tenantId || save.isPending}>حفظ الشعار والألوان</Button>
          <Button variant="outline" onClick={() => save.mutate(true)} disabled={!editable || !tenantId || save.isPending}>استعادة الألوان الافتراضية</Button>
        </div>
      </div>
    </div>
  );
}
