import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CrudPage } from "@/components/CrudPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { fmtNum, today } from "@/lib/format";
import { postEntry } from "@/lib/post-entry";
import { Link } from "@tanstack/react-router";
import { IdCard } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payroll")({
  head: () => ({ meta: [{ title: "الرواتب والموظفون" }, { name: "description", content: "الموظفون والرواتب والسلف" }] }),
  component: PayrollPage,
});

function PayrollPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [month, setMonth] = useState(today().slice(0, 7));

  const data = useQuery({
    queryKey: ["payroll", me?.tenantId, month],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const [emps, advs, runs, st, adjs] = await Promise.all([
        scope(db.from("employees").select("*"), me?.tenantId).eq("is_active", true).order("name"),
        scope(db.from("employee_advances").select("*"), me?.tenantId).eq("deducted", false),
        scope(db.from("payroll_runs").select("*"), me?.tenantId).order("month", { ascending: false }),
        db.from("tenant_settings").select("cash_account_id,salaries_account_id,advances_account_id").eq("tenant_id", me!.tenantId).maybeSingle(),
        scope(db.from("employee_adjustments").select("*"), me?.tenantId).eq("applied", false),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = (emps.data ?? []).map((e: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adv = (advs.data ?? []).filter((a: any) => a.employee_id === e.id).reduce((s: number, a: any) => s + Number(a.amount), 0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mine = (adjs.data ?? []).filter((a: any) => a.employee_id === e.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bonus = mine.filter((a: any) => a.kind === "bonus").reduce((s: number, a: any) => s + Number(a.amount), 0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ded = mine.filter((a: any) => a.kind === "deduction").reduce((s: number, a: any) => s + Number(a.amount), 0);
        const gross = Number(e.base_salary) + Number(e.allowances);
        return { ...e, gross, adv, bonus, ded, net: gross + bonus - ded - adv };
      });
      return { rows, advs: advs.data ?? [], adjs: adjs.data ?? [], runs: runs.data ?? [], st: st.data };
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const done = data.data?.runs.some((r: any) => r.month === month);

  const run = useMutation({
    mutationFn: async () => {
      const d = data.data!;
      const st = d.st;
      if (!st?.salaries_account_id || !st?.cash_account_id) throw new Error("حدد حساب الرواتب وحساب الصندوق في إعدادات الحساب");
      const gross = d.rows.reduce((s: number, r: any) => s + r.gross, 0);
      const adv = d.rows.reduce((s: number, r: any) => s + r.adv, 0);
      const bonus = d.rows.reduce((s: number, r: any) => s + r.bonus, 0);
      const ded = d.rows.reduce((s: number, r: any) => s + r.ded, 0);
      const net = gross + bonus - ded - adv;
      if (adv > 0 && !st.advances_account_id) throw new Error("حدد حساب سلف الموظفين في إعدادات الحساب");
      const entryId = await postEntry(me!.tenantId!, me!.userId, { entry_date: `${month}-28`, description: `رواتب شهر ${month}`, currency: d.rows[0]?.currency ?? "USD" }, [
        { account_id: st.salaries_account_id, debit: gross + bonus - ded, credit: 0, description: "إجمالي الرواتب والمكافآت بعد الخصومات" },
        ...(adv > 0 ? [{ account_id: st.advances_account_id, debit: 0, credit: adv, description: "تسوية السلف والعهد" }] : []),
        { account_id: st.cash_account_id, debit: 0, credit: net, description: "صافي الرواتب المدفوعة" },
      ]);
      const { error } = await db.from("payroll_runs").insert({
        tenant_id: me!.tenantId, month, total_gross: gross + bonus, total_advances: adv, total_net: net, journal_entry_id: entryId,
        details: d.rows.map((r: any) => ({ id: r.id, name: r.name, gross: r.gross, bonus: r.bonus, ded: r.ded, adv: r.adv, net: r.net })),
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ids = d.advs.map((a: any) => a.id);
      if (ids.length) await db.from("employee_advances").update({ deducted: true, payroll_month: month }).in("id", ids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adjIds = d.adjs.map((a: any) => a.id);
      if (adjIds.length) await db.from("employee_adjustments").update({ applied: true, payroll_month: month }).in("id", adjIds);
    },
    onSuccess: () => {
      toast.success("تم ترحيل قيد الرواتب");
      qc.invalidateQueries({ queryKey: ["payroll"] });
      qc.invalidateQueries({ queryKey: ["employee_advances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data.data?.rows ?? [];
  return (
    <>
      <div className="mb-8 rounded-lg border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="me-auto font-bold">مسير الرواتب</h2>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
          {can(me, "journal", "create") && (
            <Button size="sm" onClick={() => run.mutate()} disabled={done || !rows.length || run.isPending}>
              {done ? "تم ترحيل هذا الشهر" : "ترحيل الرواتب"}
            </Button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary"><tr><th className="p-2 text-right">الموظف</th><th className="p-2 text-right">الإجمالي</th><th className="p-2 text-right">مكافآت</th><th className="p-2 text-right">خصومات</th><th className="p-2 text-right">السلف المخصومة</th><th className="p-2 text-right">الصافي</th></tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t"><td className="p-2">{r.name}</td><td className="num p-2">{fmtNum(r.gross)}</td><td className="num p-2">{fmtNum(r.bonus)}</td><td className="num p-2">{fmtNum(r.ded)}</td><td className="num p-2">{fmtNum(r.adv)}</td><td className="num p-2 font-semibold">{fmtNum(r.net)}</td></tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">أضف موظفين أولاً</td></tr>}
          </tbody>
        </table>
      </div>
      <CrudPage
        table="employees" module="journal" title="الموظفون" orderBy="name" ascending
        extraRowAction={(row) => (<Button asChild size="icon" variant="ghost" title="بطاقة الموظف"><Link to="/employees/$employeeId" params={{ employeeId: row.id }}><IdCard className="size-4" /></Link></Button>)}
        fields={[
          { key: "code", label: "الرمز" },
          { key: "name", label: "الاسم", required: true },
          { key: "job_title", label: "الوظيفة" },
          { key: "department", label: "القسم" },
          { key: "phone", label: "الهاتف", hideInTable: true },
          { key: "email", label: "البريد الإلكتروني", hideInTable: true },
          { key: "national_id", label: "الرقم الوطني", hideInTable: true },
          { key: "address", label: "العنوان", hideInTable: true },
          { key: "hire_date", label: "تاريخ التعيين", type: "date" },
          { key: "bank_account", label: "الحساب البنكي", hideInTable: true },
          { key: "account_id", label: "الحساب المحاسبي المرتبط", type: "ref", refTable: "accounts", hideInTable: true },
          { key: "base_salary", label: "الراتب الأساسي", type: "number", defaultValue: 0 },
          { key: "allowances", label: "التعويضات", type: "number", defaultValue: 0 },
          { key: "currency", label: "العملة", type: "select", defaultValue: "USD", options: [{ value: "USD", label: "دولار ($)" }, { value: "SYP", label: "ليرة سورية" }] },
          { key: "is_active", label: "نشط", type: "checkbox", defaultValue: true },
          { key: "notes", label: "ملاحظات", type: "textarea", hideInTable: true },
        ]}
      />
      <div className="mt-8" />
      <CrudPage
        table="employee_advances" module="journal" title="سلف الموظفين" subtitle="تُخصم السلف غير المخصومة تلقائياً عند ترحيل رواتب الشهر" orderBy="adv_date" dateKey="adv_date"
        fields={[
          { key: "employee_id", label: "الموظف", type: "ref", refTable: "employees", required: true },
          { key: "adv_date", label: "التاريخ", type: "date", defaultValue: today(), required: true },
          { key: "amount", label: "المبلغ", type: "number", required: true },
          { key: "deducted", label: "مخصومة", type: "checkbox", hideInForm: true },
          { key: "payroll_month", label: "شهر الخصم", hideInForm: true },
          { key: "notes", label: "ملاحظات" },
        ]}
      />
    </>
  );
}
