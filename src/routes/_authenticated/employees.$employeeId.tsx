import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney, today } from "@/lib/format";
import { can, useMe } from "@/lib/session";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AttachmentsButton } from "@/components/AttachmentsButton";

export const Route = createFileRoute("/_authenticated/employees/$employeeId")({
  head: () => ({ meta: [{ title: "بطاقة الموظف" }, { name: "description", content: "البيانات الشخصية والمالية وسجل الرواتب والسلف والإجازات" }] }),
  component: EmployeeCard,
});

const LEAVE_TYPES = [
  { value: "annual", label: "سنوية" },
  { value: "sick", label: "مرضية" },
  { value: "unpaid", label: "بدون أجر" },
  { value: "emergency", label: "طارئة" },
];
const LEAVE_LABEL = Object.fromEntries(LEAVE_TYPES.map((t) => [t.value, t.label]));

function EmployeeCard() {
  const { employeeId } = Route.useParams();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["employee_card", employeeId],
    queryFn: async () => {
      const [e, advs, runs, leaves, adjs, acc] = await Promise.all([
        db.from("employees").select("*").eq("id", employeeId).single(),
        db.from("employee_advances").select("*").eq("employee_id", employeeId).order("adv_date", { ascending: false }),
        db.from("payroll_runs").select("month, details").order("month", { ascending: false }),
        db.from("employee_leaves").select("*").eq("employee_id", employeeId).order("start_date", { ascending: false }),
        db.from("employee_adjustments").select("*").eq("employee_id", employeeId).order("adj_date", { ascending: false }),
        db.from("accounts").select("id, code, name"),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const history = (runs.data ?? []).flatMap((r: any) => (r.details ?? []).filter((d: any) => d.id === employeeId).map((d: any) => ({ month: r.month, ...d })));
      return { e: e.data, advs: advs.data ?? [], history, leaves: leaves.data ?? [], adjs: adjs.data ?? [], accounts: acc.data ?? [] };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["employee_card", employeeId] });

  const e = q.data?.e;
  if (!e) return <p className="p-6 text-muted-foreground">جارٍ التحميل...</p>;
  const cur = e.currency;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkedAcc = (q.data!.accounts as any[]).find((a) => a.id === e.account_id);
  const info: [string, string][] = [
    ["الرمز", e.code ?? "—"], ["المسمى الوظيفي", e.job_title ?? "—"], ["القسم", e.department ?? "—"], ["تاريخ التعيين", fmtDate(e.hire_date)],
    ["الهاتف", e.phone ?? "—"], ["البريد الإلكتروني", e.email ?? "—"], ["الرقم الوطني", e.national_id ?? "—"], ["العنوان", e.address ?? "—"],
  ];
  const fin: [string, string][] = [
    ["الراتب الأساسي", fmtMoney(e.base_salary, cur)], ["البدلات الثابتة", fmtMoney(e.allowances, cur)],
    ["إجمالي الاستحقاق", fmtMoney(Number(e.base_salary) + Number(e.allowances), cur)],
    ["الحساب البنكي", e.bank_account ?? "—"], ["الحساب المحاسبي المرتبط", linkedAcc ? `${linkedAcc.code} — ${linkedAcc.name}` : "—"],
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link to="/payroll"><ArrowRight className="size-4" />الموظفون</Link></Button>
        <div className="me-auto" />
        <AttachmentsButton entityType="employee" entityId={employeeId} variant="outline" label="المرفقات (العقد، الهوية)" />
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-6">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">{e.name.slice(0, 1)}</div>
        <div className="me-auto">
          <h1 className="text-2xl font-bold">{e.name}</h1>
          <p className="text-muted-foreground">{e.job_title ?? "—"}{e.department ? ` · ${e.department}` : ""}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm ${e.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{e.is_active ? "على رأس العمل" : "غير نشط"}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="البيانات الشخصية والمهنية" rows={info} />
        <Section title="التفاصيل المالية" rows={fin} />
      </div>
      <Tabs defaultValue="payroll" className="rounded-xl border bg-card p-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="payroll">سجل الرواتب</TabsTrigger>
          <TabsTrigger value="advances">السلف والعهد</TabsTrigger>
          <TabsTrigger value="leaves">الإجازات</TabsTrigger>
          <TabsTrigger value="adjustments">الخصومات والمكافآت</TabsTrigger>
        </TabsList>
        <TabsContent value="payroll">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Table head={["الشهر", "الإجمالي", "السلف المخصومة", "الصافي"]} rows={q.data!.history.map((h: any) => [h.month, fmtMoney(h.gross, cur), fmtMoney(h.adv, cur), fmtMoney(h.net, cur)])} />
        </TabsContent>
        <TabsContent value="advances">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Table head={["التاريخ", "المبلغ", "الحالة", "ملاحظات"]} rows={q.data!.advs.map((a: any) => [fmtDate(a.adv_date), fmtMoney(a.amount, cur), a.deducted ? `مخصومة (${a.payroll_month ?? ""})` : "قيد الخصم", a.notes ?? ""])} />
        </TabsContent>
        <TabsContent value="leaves">
          <LeavesTab employeeId={employeeId} leaves={q.data!.leaves} canEdit={can(me, "journal", "create")} onChange={invalidate} />
        </TabsContent>
        <TabsContent value="adjustments">
          <AdjustmentsTab employeeId={employeeId} adjs={q.data!.adjs} currency={cur} canEdit={can(me, "journal", "create")} onChange={invalidate} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LeavesTab({ employeeId, leaves, canEdit, onChange }: { employeeId: string; leaves: any[]; canEdit: boolean; onChange: () => void }) {
  const { data: me } = useMe();
  const [form, setForm] = useState({ leave_type: "annual", start_date: today(), end_date: today(), notes: "" });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("employee_leaves").insert({ tenant_id: me!.tenantId!, employee_id: employeeId, ...form });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تمت إضافة الإجازة"); onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("employee_leaves").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف"); onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
            {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <Input type="date" className="w-40" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          <Input type="date" className="w-40" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          <Input className="w-48" placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}><Plus className="size-4" />إضافة</Button>
        </div>
      )}
      <Table
        head={["النوع", "من", "إلى", "الأيام", "ملاحظات", ""]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rows={leaves.map((l: any) => [
          LEAVE_LABEL[l.leave_type] ?? l.leave_type, fmtDate(l.start_date), fmtDate(l.end_date),
          String(Math.round((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / 86400000) + 1),
          l.notes ?? "",
          canEdit ? "del:" + l.id : "",
        ])}
        onDelete={canEdit ? (id) => del.mutate(id) : undefined}
      />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AdjustmentsTab({ employeeId, adjs, currency, canEdit, onChange }: { employeeId: string; adjs: any[]; currency: string; canEdit: boolean; onChange: () => void }) {
  const { data: me } = useMe();
  const [form, setForm] = useState({ kind: "deduction", adj_date: today(), amount: "", notes: "" });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("employee_adjustments").insert({ tenant_id: me!.tenantId!, employee_id: employeeId, kind: form.kind, adj_date: form.adj_date, amount: Number(form.amount) || 0, notes: form.notes || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تمت الإضافة — ستُطبق على الراتب القادم"); setForm({ kind: "deduction", adj_date: today(), amount: "", notes: "" }); onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("employee_adjustments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف"); onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="deduction">خصم</option>
            <option value="bonus">مكافأة</option>
          </select>
          <Input type="date" className="w-40" value={form.adj_date} onChange={(e) => setForm({ ...form, adj_date: e.target.value })} />
          <Input type="number" className="w-32" placeholder="المبلغ" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Input className="w-48" placeholder="السبب" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending || !Number(form.amount)}><Plus className="size-4" />إضافة</Button>
        </div>
      )}
      <Table
        head={["التاريخ", "النوع", "المبلغ", "الحالة", "السبب", ""]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rows={adjs.map((a: any) => [
          fmtDate(a.adj_date), a.kind === "bonus" ? "مكافأة" : "خصم", fmtMoney(a.amount, currency),
          a.applied ? `مطبق (${a.payroll_month ?? ""})` : "قيد التطبيق", a.notes ?? "",
          canEdit && !a.applied ? "del:" + a.id : "",
        ])}
        onDelete={canEdit ? (id) => del.mutate(id) : undefined}
      />
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="mb-3 font-bold">{title}</h2>
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="num font-medium">{v}</dd></div>))}
      </dl>
    </div>
  );
}

function Table({ head, rows, onDelete }: { head: string[]; rows: string[][]; onDelete?: ((id: string) => void) | undefined }) {
  return (
    <table className="mt-2 w-full text-sm">
      <thead className="bg-secondary"><tr>{head.map((h) => <th key={h} className="p-2 text-right">{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t">
            {r.map((c, j) =>
              c.startsWith("del:") && onDelete ? (
                <td key={j} className="p-2"><Button size="icon" variant="ghost" onClick={() => onDelete(c.slice(4))}><Trash2 className="size-4 text-destructive" /></Button></td>
              ) : (
                <td key={j} className="num p-2">{c}</td>
              ),
            )}
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={head.length} className="p-4 text-center text-muted-foreground">لا توجد بيانات</td></tr>}
      </tbody>
    </table>
  );
}
