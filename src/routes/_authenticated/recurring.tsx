import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { CrudPage } from "@/components/CrudPage";
import { Button } from "@/components/ui/button";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { fmtDate, fmtMoney, today } from "@/lib/format";
import { addPeriod, postEntry } from "@/lib/post-entry";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/recurring")({
  head: () => ({ meta: [{ title: "القيود الدورية" }, { name: "description", content: "قيود الإيجار والرواتب والاشتراكات الدورية" }] }),
  component: RecurringPage,
});

const FREQ = [
  { value: "weekly", label: "أسبوعي" },
  { value: "monthly", label: "شهري" },
  { value: "quarterly", label: "ربع سنوي" },
  { value: "yearly", label: "سنوي" },
];

function RecurringPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const due = useQuery({
    queryKey: ["recurring_entries", "due", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () =>
      (await scope(db.from("recurring_entries").select("*"), me?.tenantId).eq("is_active", true).lte("next_date", today()).order("next_date")).data ?? [],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function postDue(list: any[]) {
    let n = 0;
    for (const r of list) {
      let next = r.next_date as string;
      while (next <= today() && (!r.end_date || next <= r.end_date)) {
        await postEntry(me!.tenantId!, me!.userId, { entry_date: next, description: `${r.name}${r.description ? " - " + r.description : ""}`, currency: r.currency }, [
          { account_id: r.debit_account_id, debit: Number(r.amount), credit: 0 },
          { account_id: r.credit_account_id, debit: 0, credit: Number(r.amount) },
        ]);
        n++;
        next = addPeriod(next, r.frequency);
      }
      await db.from("recurring_entries").update({ next_date: next, is_active: !r.end_date || next <= r.end_date }).eq("id", r.id);
    }
    return n;
  }

  // ترحيل تلقائي للقيود بوضع «تلقائي» فور فتح الصفحة
  const autoRan = useRef(false);
  const autoList = (due.data ?? []).filter((r: any) => r.approval_mode === "auto");
  useEffect(() => {
    if (autoRan.current || !me?.tenantId || !autoList.length || !can(me, "journal", "create")) return;
    autoRan.current = true;
    postDue(autoList)
      .then((n) => {
        if (n > 0) toast.success(`تم ترحيل ${n} قيد دوري تلقائياً`);
        qc.invalidateQueries({ queryKey: ["recurring_entries"] });
        qc.invalidateQueries({ queryKey: ["journal_entries"] });
      })
      .catch((e: Error) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.tenantId, autoList.length]);

  const pendingApproval = (due.data ?? []).filter((r: any) => r.approval_mode !== "auto");

  const run = useMutation({
    mutationFn: () => postDue(pendingApproval),
    onSuccess: (n) => {
      toast.success(`تم إنشاء ${n} قيد`);
      qc.invalidateQueries({ queryKey: ["recurring_entries"] });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="mb-6 rounded-lg border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">القيود المستحقة بانتظار الموافقة</h2>
          {can(me, "journal", "create") && (
            <Button size="sm" onClick={() => run.mutate()} disabled={!pendingApproval.length || run.isPending}>
              <RefreshCw className="size-4" />اعتماد وترحيل
            </Button>
          )}
        </div>
        {!pendingApproval.length ? (
          <p className="text-sm text-muted-foreground">لا توجد قيود بانتظار الموافقة — القيود التلقائية تُرحّل فور استحقاقها</p>
        ) : (
          <ul className="divide-y text-sm">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {pendingApproval.map((r: any) => (
              <li key={r.id} className="flex justify-between py-1.5">
                <span>{r.name}</span>
                <span className="text-muted-foreground">{fmtDate(r.next_date)} — <span className="num">{fmtMoney(r.amount, r.currency)}</span></span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <CrudPage
        table="recurring_entries"
        module="journal"
        title="القيود الدورية"
        subtitle="قيود تتكرر تلقائياً مثل الإيجار والاشتراكات. اضغط «إنشاء القيود المستحقة» لترحيل ما حان موعده"
        orderBy="next_date"
        ascending
        fields={[
          { key: "name", label: "الاسم", required: true },
          { key: "debit_account_id", label: "الحساب المدين", type: "ref", refTable: "accounts", required: true },
          { key: "credit_account_id", label: "الحساب الدائن", type: "ref", refTable: "accounts", required: true },
          { key: "amount", label: "المبلغ", type: "number", required: true, defaultValue: 0 },
          { key: "currency", label: "العملة", type: "select", defaultValue: "USD", options: [{ value: "USD", label: "دولار ($)" }, { value: "SYP", label: "ليرة سورية" }] },
          { key: "frequency", label: "التكرار", type: "select", defaultValue: "monthly", options: FREQ },
          { key: "approval_mode", label: "طريقة الترحيل", type: "select", defaultValue: "approval", options: [{ value: "approval", label: "بعد موافقة المحاسب" }, { value: "auto", label: "تلقائي عند الاستحقاق" }] },
          { key: "next_date", label: "تاريخ القيد القادم", type: "date", required: true, defaultValue: today() },
          { key: "end_date", label: "تاريخ الانتهاء", type: "date" },
          { key: "description", label: "البيان", hideInTable: true },
          { key: "is_active", label: "نشط", type: "checkbox", defaultValue: true },
        ]}
      />
    </>
  );
}
