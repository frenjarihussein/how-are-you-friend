import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtDate, fmtNum, today } from "@/lib/format";
import { exportCsv, printPage } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

const th = "border px-2 py-2 text-right";
const td = "border px-2 py-2";

function Box({ title, children, onExport }: { title: string; children: React.ReactNode; onExport?: () => void }) {
  return (
    <div className="print-area rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <div className="no-print flex gap-2">
          {onExport && (
            <Button size="sm" variant="outline" onClick={onExport}>
              <Download className="size-4" />
              تصدير إلى إكسل
            </Button>
          )}
          <Button size="sm" onClick={printPage}>
            <Printer className="size-4" />
            طباعة
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function useLines(me: ReturnType<typeof useMe>["data"], key: string, select: string, filter: (q: any) => any) {
  return useQuery({
    queryKey: [key, me?.tenantId],
    enabled: !!me,
    queryFn: async () => {
      let q: any = db.from("journal_lines").select(select);
      q = filter(q);
      if (me?.tenantId) q = q.eq("tenant_id", me.tenantId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/** Revenue vs costs per project, from posted journal lines on profit & loss accounts. */
export function ProjectProfitReport({ from, to }: { from: string; to: string }) {
  const { data: me } = useMe();
  const projects = useQuery({
    queryKey: ["pp-projects", me?.tenantId],
    enabled: !!me,
    queryFn: async () => {
      let q = db.from("projects").select("id,code,name,contract_value,completion_pct,is_group").eq("is_group", false);
      if (me?.tenantId) q = q.eq("tenant_id", me.tenantId);
      return (await q.order("name")).data ?? [];
    },
  });
  const lines = useLines(me, "pp-lines", "project_id,debit,credit,accounts(nature),journal_entries(entry_date,exchange_rate)", (q) => q.not("project_id", "is", null));
  const map = new Map<string, { rev: number; cost: number }>();
  (lines.data ?? []).forEach((l) => {
    if (l.accounts?.nature !== "profit_loss") return;
    const d = String(l.journal_entries?.entry_date ?? "");
    if (d && (d < from || d > to)) return;
    const rate = Number(l.journal_entries?.exchange_rate ?? 1) || 1;
    const r = map.get(l.project_id) ?? { rev: 0, cost: 0 };
    r.rev += Number(l.credit) / rate;
    r.cost += Number(l.debit) / rate;
    map.set(l.project_id, r);
  });
  const rows = (projects.data ?? []).map((p: any) => {
    const r = map.get(p.id) ?? { rev: 0, cost: 0 };
    const profit = r.rev - r.cost;
    return { ...p, rev: r.rev, cost: r.cost, profit, margin: r.rev ? (profit / r.rev) * 100 : 0 };
  });
  const tot = rows.reduce((s, r) => ({ rev: s.rev + r.rev, cost: s.cost + r.cost }), { rev: 0, cost: 0 });
  return (
    <Box
      title="ربحية المشاريع"
      onExport={() =>
        exportCsv("ربحية المشاريع", [
          { key: "name", label: "المشروع" }, { key: "contract", label: "قيمة العقد" }, { key: "pct", label: "الإنجاز %" },
          { key: "rev", label: "الإيرادات" }, { key: "cost", label: "المصاريف" }, { key: "profit", label: "الربح" },
        ], rows.map((r) => ({ name: r.name, contract: fmtNum(r.contract_value), pct: fmtNum(r.completion_pct), rev: fmtNum(r.rev), cost: fmtNum(r.cost), profit: fmtNum(r.profit) })))
      }
    >
      <table className="w-full border text-sm">
        <thead className="bg-secondary">
          <tr>
            <th className={th}>المشروع</th><th className={th}>قيمة العقد</th><th className={th}>الإنجاز</th>
            <th className={th}>الإيرادات ($)</th><th className={th}>المصاريف ($)</th><th className={th}>الربح / الخسارة ($)</th><th className={th}>هامش الربح</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} className={`${td} py-6 text-center text-muted-foreground`}>لا توجد مشاريع</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={td}><Link to="/projects/$projectId" params={{ projectId: r.id }} className="text-primary hover:underline">{r.name}</Link></td>
              <td className={td}>{fmtNum(r.contract_value)}</td>
              <td className={td}>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-20 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, Number(r.completion_pct))}%` }} /></div>
                  <span className="num text-xs">{fmtNum(r.completion_pct)}%</span>
                </div>
              </td>
              <td className={td}>{fmtNum(r.rev)}</td>
              <td className={td}>{fmtNum(r.cost)}</td>
              <td className={`${td} font-semibold ${r.profit < 0 ? "text-destructive" : ""}`}>{fmtNum(r.profit)}</td>
              <td className={td}>{r.rev ? `${fmtNum(r.margin)}%` : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted font-bold">
          <tr><td className={td} colSpan={3}>الإجمالي</td><td className={td}>{fmtNum(tot.rev)}</td><td className={td}>{fmtNum(tot.cost)}</td><td className={td}>{fmtNum(tot.rev - tot.cost)}</td><td className={td} /></tr>
        </tfoot>
      </table>
    </Box>
  );
}

const BUCKETS = [
  { key: "b0", label: "0-30 يوم", max: 30 },
  { key: "b30", label: "31-60 يوم", max: 60 },
  { key: "b60", label: "61-90 يوم", max: 90 },
  { key: "b90", label: "أكثر من 90", max: Infinity },
] as const;

/** Customer balances split by how old the movements are. */
export function AgingReport() {
  const { data: me } = useMe();
  const lines = useLines(me, "aging-lines", "debit,credit,partners!inner(id,name,partner_type),journal_entries(entry_date,exchange_rate)", (q) => q.in("partners.partner_type", ["customer", "both"]));
  const now = Date.now();
  const map = new Map<string, any>();
  (lines.data ?? []).forEach((l) => {
    const p = l.partners;
    const rate = Number(l.journal_entries?.exchange_rate ?? 1) || 1;
    const days = Math.floor((now - new Date(l.journal_entries?.entry_date ?? now).getTime()) / 86400000);
    const b = BUCKETS.find((x) => days <= x.max)!.key;
    const r = map.get(p.id) ?? { id: p.id, name: p.name, b0: 0, b30: 0, b60: 0, b90: 0, total: 0 };
    const v = (Number(l.debit) - Number(l.credit)) / rate;
    r[b] += v;
    r.total += v;
    map.set(p.id, r);
  });
  const rows = [...map.values()].filter((r) => Math.abs(r.total) > 0.005).sort((a, b) => b.total - a.total);
  const sum = (k: string) => rows.reduce((s, r) => s + r[k], 0);
  return (
    <Box
      title="أعمار ذمم العملاء"
      onExport={() =>
        exportCsv("أعمار الذمم", [{ key: "name", label: "العميل" }, ...BUCKETS.map((b) => ({ key: b.key, label: b.label })), { key: "total", label: "الإجمالي" }],
          rows.map((r) => ({ name: r.name, b0: fmtNum(r.b0), b30: fmtNum(r.b30), b60: fmtNum(r.b60), b90: fmtNum(r.b90), total: fmtNum(r.total) })))
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">الرصيد المستحق لكل عميل موزعاً حسب عمر الحركة بالدولار. الأرقام السالبة تعني رصيداً دائناً للعميل.</p>
      <table className="w-full border text-sm">
        <thead className="bg-secondary">
          <tr><th className={th}>العميل</th>{BUCKETS.map((b) => <th key={b.key} className={th}>{b.label}</th>)}<th className={th}>الإجمالي ($)</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={6} className={`${td} py-6 text-center text-muted-foreground`}>لا توجد ذمم مستحقة</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={td}><Link to="/statement/$partnerId" params={{ partnerId: r.id }} className="text-primary hover:underline">{r.name}</Link></td>
              {BUCKETS.map((b) => <td key={b.key} className={`${td} ${b.key === "b90" && r[b.key] > 0 ? "font-semibold text-destructive" : ""}`}>{fmtNum(r[b.key])}</td>)}
              <td className={`${td} font-semibold`}>{fmtNum(r.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted font-bold">
          <tr><td className={td}>الإجمالي</td>{BUCKETS.map((b) => <td key={b.key} className={td}>{fmtNum(sum(b.key))}</td>)}<td className={td}>{fmtNum(sum("total"))}</td></tr>
        </tfoot>
      </table>
    </Box>
  );
}

/** Pending cheques and quotes coming due in the next 30 days, plus overdue ones. */
export function DueAlertsReport() {
  const { data: me } = useMe();
  const t = today();
  const limit = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const q = useQuery({
    queryKey: ["due-alerts", me?.tenantId, t],
    enabled: !!me,
    queryFn: async () => {
      let c = db.from("cheques").select("id,cheque_no,direction,amount,currency,due_date,partners(name)").eq("status", "pending").lte("due_date", limit);
      let d = db.from("documents").select("id,doc_no,amount,currency,valid_until,partners(name)").eq("doc_type", "quote").is("converted_document_id", null).not("valid_until", "is", null).lte("valid_until", limit);
      if (me?.tenantId) { c = c.eq("tenant_id", me.tenantId); d = d.eq("tenant_id", me.tenantId); }
      const [cr, dr] = await Promise.all([c.order("due_date"), d.order("valid_until")]);
      const items: any[] = [
        ...(cr.data ?? []).map((x: any) => ({ id: x.id, kind: x.direction === "incoming" ? "شيك وارد" : "شيك صادر", ref: x.cheque_no, who: x.partners?.name, amount: x.amount, currency: x.currency, date: x.due_date, link: "/cheques" })),
        ...(dr.data ?? []).map((x: any) => ({ id: x.id, kind: "عرض سعر ينتهي", ref: x.doc_no, who: x.partners?.name, amount: x.amount, currency: x.currency, date: x.valid_until, link: "/documents" })),
      ];
      return items.sort((a, b) => a.date.localeCompare(b.date));
    },
  });
  const rows = q.data ?? [];
  const daysLeft = (d: string) => Math.round((new Date(d).getTime() - new Date(t).getTime()) / 86400000);
  return (
    <Box title="تنبيهات الاستحقاق (30 يوماً القادمة والمتأخر)">
      <table className="w-full border text-sm">
        <thead className="bg-secondary">
          <tr><th className={th}>النوع</th><th className={th}>الرقم</th><th className={th}>الطرف</th><th className={th}>المبلغ</th><th className={th}>تاريخ الاستحقاق</th><th className={th}>المتبقي</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={6} className={`${td} py-6 text-center text-muted-foreground`}>لا توجد استحقاقات قريبة</td></tr>}
          {rows.map((r) => {
            const n = daysLeft(r.date);
            return (
              <tr key={r.kind + r.id}>
                <td className={td}><Link to={r.link} className="text-primary hover:underline">{r.kind}</Link></td>
                <td className={td}>{r.ref ?? "—"}</td>
                <td className={td}>{r.who ?? "—"}</td>
                <td className={td}>{fmtNum(r.amount)} {r.currency}</td>
                <td className={td}>{fmtDate(r.date)}</td>
                <td className={`${td} font-semibold ${n < 0 ? "text-destructive" : n <= 7 ? "text-primary" : ""}`}>
                  {n < 0 ? `متأخر ${-n} يوم` : n === 0 ? "اليوم" : `${n} يوم`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Box>
  );
}

/** Count of overdue / due-within-7-days items, for a dashboard hint. */
export function useDueCount() {
  const { data: me } = useMe();
  const limit = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["due-count", me?.tenantId, limit],
    enabled: !!me,
    queryFn: async () => {
      let c = db.from("cheques").select("id", { count: "exact", head: true }).eq("status", "pending").lte("due_date", limit);
      if (me?.tenantId) c = c.eq("tenant_id", me.tenantId);
      return (await c).count ?? 0;
    },
  });
}
