import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "الإشعارات العامة" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", body: "", tenant_id: "", link: "" });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const tenants = useQuery({
    queryKey: ["tenants"],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => (await db.from("tenants").select("*").order("name")).data ?? [],
  });
  const list = useQuery({
    queryKey: ["notifications_admin"],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => (await db.from("notifications").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const send = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("notifications").insert({
        title: form.title,
        body: form.body || null,
        tenant_id: form.tenant_id || null,
        link: form.link || null,
        created_by: me!.userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إرسال الإشعار");
      setForm({ title: "", body: "", tenant_id: "", link: "" });
      qc.invalidateQueries({ queryKey: ["notifications_admin"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (me && !me.isSuperAdmin) return <p className="text-muted-foreground">هذه الصفحة مخصصة لمالك النظام فقط.</p>;
  const tName = (id: string | null) => (id ? (tenants.data ?? []).find((t: any) => t.id === id)?.name ?? "—" : "كل الشركات");

  return (
    <div>
      <PageHeader title="الإشعارات العامة" subtitle="أرسل إشعاراً يظهر لجميع مستخدمي البرنامج أو لمستخدمي شركة محددة" />
      <div className="max-w-2xl space-y-3 rounded-lg border bg-card p-5">
        <div className="space-y-1">
          <Label>إلى</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={form.tenant_id}
            onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}
          >
            <option value="">كل الشركات وكل المستخدمين</option>
            {(tenants.data ?? []).map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>العنوان</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>النص</Label>
          <Textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>عند الضغط على الإشعار يفتح (اختياري)</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })}>
            <option value="">لا شيء</option>
            <option value="/dashboard">لوحة المؤشرات</option>
            <option value="/documents">المستندات والفواتير</option>
            <option value="/pos">نقطة البيع</option>
            <option value="/products">المواد</option>
            <option value="/reports">التقارير</option>
            <option value="/settings">الإعدادات</option>
          </select>
        </div>
        <Button disabled={!form.title.trim() || send.isPending} onClick={() => send.mutate()}>إرسال الإشعار</Button>
      </div>

      <h3 className="mb-2 mt-6 font-semibold">الإشعارات المرسلة</h3>
      <div className="space-y-2">
        {(list.data ?? []).map((n: any) => (
          <div key={n.id} className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3 text-sm">
            <div>
              <div className="font-semibold">{n.title} <span className="text-xs font-normal text-muted-foreground">· {tName(n.tenant_id)} · {fmtDateTime(n.created_at)}</span></div>
              {n.body && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{n.body}</p>}
            </div>
            <Button size="sm" variant="ghost" onClick={async () => {
              if (!window.confirm("حذف الإشعار؟")) return;
              const { error } = await db.from("notifications").delete().eq("id", n.id);
              if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["notifications_admin"] });
            }}>حذف</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
