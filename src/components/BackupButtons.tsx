import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CloudDownload, Download, Lock, Upload } from "lucide-react";
import { backupCompany } from "@/lib/admin.functions";
import { downloadBackupXlsx, readBackupXlsx, SHEET_AR } from "@/lib/backup";
import { decryptJson, encryptJson } from "@/lib/crypto-backup";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";

const DAY = 86_400_000;

export function BackupButtons({ tenantId, name }: { tenantId: string; name: string }) {
  const backupFn = useServerFn(backupCompany);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [freq, setFreq] = useState("off");
  const lastKey = `backup-last-${tenantId}`;
  const freqKey = `backup-freq-${tenantId}`;

  useEffect(() => {
    const f = localStorage.getItem(freqKey) ?? "off";
    setFreq(f);
    const last = Number(localStorage.getItem(lastKey) ?? 0);
    const every = f === "daily" ? DAY : f === "weekly" ? 7 * DAY : 0;
    if (every && Date.now() - last > every) toast.warning(`حان موعد النسخة الاحتياطية الدورية لشركة "${name}"`, { duration: 15000 });
  }, [freqKey, lastKey, name]);

  async function doBackup() {
    setBusy(true);
    try {
      const json = await backupFn({ data: { tenantId } });
      const parsed = JSON.parse(json);
      downloadBackupXlsx(parsed.data, `نسخة-احتياطية-${name}-${new Date().toISOString().slice(0, 10)}`);
      localStorage.setItem(lastKey, String(Date.now()));
      toast.success("تم تنزيل النسخة الاحتياطية (ملف Excel)");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doEncrypted() {
    const pw = window.prompt("أدخل كلمة سر لتشفير النسخة (8 أحرف على الأقل). احفظها، لا يمكن استرجاعها:");
    if (!pw) return;
    if (pw.length < 8) { toast.error("كلمة السر قصيرة"); return; }
    setBusy(true);
    try {
      const json = await backupFn({ data: { tenantId } });
      const blob = new Blob([await encryptJson(json, pw)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `نسخة-مشفرة-${name}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      localStorage.setItem(lastKey, String(Date.now()));
      toast.success("تم تنزيل النسخة المشفرة");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doRestore(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: Record<string, any[]>;
      if (file.name.endsWith(".json")) {
        const pw = window.prompt("كلمة سر النسخة المشفرة:");
        if (!pw) return;
        data = JSON.parse(await decryptJson(await file.text(), pw)).data;
      } else data = await readBackupXlsx(file);
      const summary = Object.entries(data)
        .filter(([t]) => SHEET_AR[t])
        .map(([t, rows]) => `${SHEET_AR[t]}: ${rows.length}`)
        .join("\n");
      if (!data["accounts"]) throw new Error("الملف لا يبدو نسخة احتياطية صالحة من البرنامج");
      const ok = window.confirm(
        `سيتم استبدال كل بيانات شركة "${name}" المحاسبية بمحتوى النسخة:\n\n${summary}\n\n(المستخدمون والاشتراك لا يتغيرون). متابعة؟`,
      );
      if (!ok) return;
      const { error } = await db.rpc("restore_tenant", { _id: tenantId, _data: data });
      if (error) throw error;
      toast.success("تم استرجاع النسخة الاحتياطية بنجاح");
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={busy} onClick={doBackup}>
        <Download className="size-4" />
        نسخة احتياطية
      </Button>
      <Button variant="outline" size="sm" disabled={busy} onClick={doEncrypted}>
        <Lock className="size-4" />
        نسخة مشفرة
      </Button>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
        <Upload className="size-4" />
        استرجاع نسخة
      </Button>
      <select
        className="h-8 rounded-md border bg-background px-2 text-sm"
        title="تذكير النسخ الدوري"
        value={freq}
        onChange={(e) => { setFreq(e.target.value); localStorage.setItem(freqKey, e.target.value); }}
      >
        <option value="off">بدون تذكير دوري</option>
        <option value="daily">تذكير يومي</option>
        <option value="weekly">تذكير أسبوعي</option>
      </select>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.json"
        className="hidden"
        onChange={(e) => doRestore(e.target.files?.[0])}
      />
    </>
  );
}

/** النسخ الاحتياطي التلقائي على السحابة: التفعيل، الدورية، وقائمة النسخ المحفوظة. */
export function CloudBackupCard({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["backup_settings", tenantId],
    queryFn: async () =>
      (await db.from("tenant_settings").select("auto_backup, backup_every_days, last_backup_at").eq("tenant_id", tenantId).maybeSingle()).data,
  });
  const list = useQuery({
    queryKey: ["cloud_backups", tenantId],
    queryFn: async () =>
      (await db.from("backups").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  async function save(auto: boolean, days: number) {
    const { error } = await db.from("tenant_settings").update({ auto_backup: auto, backup_every_days: days }).eq("tenant_id", tenantId);
    if (error) { toast.error(error.message); return; }
    toast.success(auto ? `تم تفعيل النسخ التلقائي كل ${days} يوم` : "تم إيقاف النسخ التلقائي");
    qc.invalidateQueries({ queryKey: ["backup_settings", tenantId] });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function download(b: any) {
    const { data, error } = await supabase.storage.from("backups").createSignedUrl(b.file_path, 300, { download: true });
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const auto = settings.data?.auto_backup ?? false;
  const days = settings.data?.backup_every_days ?? 7;
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="me-auto font-bold">النسخ الاحتياطي التلقائي على السحابة</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => save(e.target.checked, days)} />
          مفعّل
        </label>
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={days}
          disabled={!auto}
          onChange={(e) => save(true, Number(e.target.value))}
        >
          <option value={1}>كل يوم</option>
          <option value={3}>كل 3 أيام</option>
          <option value={7}>كل أسبوع</option>
          <option value={30}>كل شهر</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        تُحفظ نسخة JSON كاملة من بيانات الشركة تلقائياً على السحابة وفق الدورية المختارة.
        {settings.data?.last_backup_at ? ` آخر نسخة: ${fmtDate(settings.data.last_backup_at)}` : " لم تُنشأ نسخة تلقائية بعد."}
      </p>
      {!!list.data?.length && (
        <table className="w-full text-sm">
          <thead className="text-muted-foreground"><tr className="border-b"><th className="p-1.5 text-right">التاريخ</th><th className="p-1.5 text-right">الحجم</th><th className="p-1.5" /></tr></thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {list.data.map((b: any) => (
              <tr key={b.id} className="border-b">
                <td className="p-1.5">{fmtDate(b.created_at)}</td>
                <td className="num p-1.5">{b.size_bytes ? `${(Number(b.size_bytes) / 1024).toFixed(0)} KB` : "—"}</td>
                <td className="p-1.5 text-left">
                  <Button size="icon" variant="ghost" title="تنزيل" onClick={() => download(b)}><CloudDownload className="size-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
