import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Settings2 } from "lucide-react";
import { usePrefs, useSavePrefs } from "@/lib/prefs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { db, scope } from "@/lib/db";
import { moduleEnabled, useMe } from "@/lib/session";
import { fmtNum } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { NAV, QUICK_ACTIONS } from "@/components/AppShell";
import { Sparkline } from "@/components/StatCards";
import { ArrowUpLeft } from "lucide-react";
import { useDueCount } from "@/components/ExtraReports";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "لوحة التحكم" }, { name: "description", content: "مؤشرات مالية وتنبيهات المخزون" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: me } = useMe();

  const stats = useQuery({
    queryKey: ["dashboard", me?.tenantId],
    enabled: !!me,
    queryFn: async () => {
      const [accounts, partners, products, projects, cheques, lines] = await Promise.all([
        scope(db.from("accounts").select("id"), me?.tenantId),
        scope(db.from("partners").select("id"), me?.tenantId),
        scope(db.from("products").select("id, name, unit, qty_on_hand, avg_cost, reorder_level"), me?.tenantId),
        scope(db.from("projects").select("id, contract_value, completion_pct"), me?.tenantId),
        scope(db.from("cheques").select("id, amount, status, direction"), me?.tenantId),
        scope(db.from("journal_lines").select("debit, credit, accounts(nature), journal_entries(exchange_rate, entry_date)"), me?.tenantId),
      ]);

      let revenue = 0;
      let expense = 0;
      const days = 14;
      const keys = Array.from({ length: days }, (_, i) => new Date(Date.now() - (days - 1 - i) * 864e5).toISOString().slice(0, 10));
      const rev: Record<string, number> = {};
      const exp: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lines.data ?? []).forEach((l: any) => {
        if (l.accounts?.nature !== "profit_loss") return;
        const rate = Number(l.journal_entries?.exchange_rate ?? 1) || 1;
        revenue += Number(l.credit) / rate;
        expense += Number(l.debit) / rate;
        const d = l.journal_entries?.entry_date as string | undefined;
        if (d) {
          rev[d] = (rev[d] ?? 0) + Number(l.credit) / rate;
          exp[d] = (exp[d] ?? 0) + Number(l.debit) / rate;
        }
      });

      const stockValue = (products.data ?? []).reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: number, p: any) => s + Number(p.qty_on_hand) * Number(p.avg_cost),
        0,
      );
      const lowStock = (products.data ?? []).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => Number(p.qty_on_hand) <= Number(p.reorder_level),
      ).length;
      const contracts = (projects.data ?? []).reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: number, p: any) => s + Number(p.contract_value ?? 0),
        0,
      );
      const pendingCheques = (cheques.data ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((c: any) => c.status === "pending")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((s: number, c: any) => s + Number(c.amount), 0);

      return {
        accounts: accounts.data?.length ?? 0,
        partners: partners.data?.length ?? 0,
        products: products.data?.length ?? 0,
        projects: projects.data?.length ?? 0,
        revenue,
        expense,
        revSeries: keys.map((k) => rev[k] ?? 0),
        expSeries: keys.map((k) => exp[k] ?? 0),
        netSeries: keys.map((k) => (rev[k] ?? 0) - (exp[k] ?? 0)),
        profit: revenue - expense,
        stockValue,
        lowStock,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lowItems: (products.data ?? []).filter((p: any) => Number(p.reorder_level) > 0 && Number(p.qty_on_hand) <= Number(p.reorder_level) * 1.2)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .sort((a: any, b: any) => Number(a.qty_on_hand) / Number(a.reorder_level) - Number(b.qty_on_hand) / Number(b.reorder_level)),
        contracts,
        pendingCheques,
      };
    },
  });

  const s = stats.data;
  const prefs = usePrefs(me);
  const savePrefs = useSavePrefs(me);
  const [edit, setEdit] = useState(false);
  const cards: { key: string; label: string; value: string }[] = [
    { key: "revenue", label: "الإيرادات ($)", value: fmtNum(s?.revenue) },
    { key: "expense", label: "المصاريف ($)", value: fmtNum(s?.expense) },
    { key: "profit", label: "صافي النتيجة ($)", value: fmtNum(s?.profit) },
    { key: "stockValue", label: "قيمة المخزون ($)", value: fmtNum(s?.stockValue) },
    { key: "contracts", label: "إجمالي قيمة العقود ($)", value: fmtNum(s?.contracts) },
    { key: "cheques", label: "شيكات قيد التحصيل ($)", value: fmtNum(s?.pendingCheques) },
    { key: "accounts", label: "عدد الحسابات", value: String(s?.accounts ?? 0) },
    { key: "partners", label: "عدد الزبائن والموردين", value: String(s?.partners ?? 0) },
    { key: "products", label: "عدد المواد", value: String(s?.products ?? 0) },
    { key: "projects", label: "عدد المشاريع", value: String(s?.projects ?? 0) },
    { key: "lowStock", label: "مواد تحت حد الطلب", value: String(s?.lowStock ?? 0) },
  ];
  const links = NAV.filter((n) => !n.superOnly && n.to !== "/dashboard" && (!n.module || moduleEnabled(me, n.module)));
  const DEFAULT = ["link:/documents", "link:/pos", "link:/products", "link:/partners", "link:/journal", "link:/reports", "profit", "stockValue", "cheques", "lowItems"];
  const chosen = new Set(prefs.data?.dashboard ?? DEFAULT);
  function toggle(k: string) {
    const next = new Set(chosen);
    if (next.has(k)) next.delete(k); else next.add(k);
    savePrefs.mutate({ dashboard: [...next] });
  }
  const shownLinks = links.filter((l) => chosen.has("link:" + l.to));
  const shownCards = cards.filter((c) => chosen.has(c.key));

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <PageHeader title={`أهلاً ${me?.fullName ?? ""}`} subtitle="اختصاراتك ومؤشراتك المختارة" />
        <Button variant="outline" onClick={() => setEdit(true)}><Settings2 className="size-4" />تخصيص الواجهة</Button>
      </div>
      <DueBanner />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {QUICK_ACTIONS.filter((a) => moduleEnabled(me, a.module)).map((a) => (
          <Link key={a.label} to={a.to} className="group relative flex flex-col gap-6 rounded-2xl border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-pop">
            <span className="grid size-11 place-items-center rounded-xl bg-muted text-foreground transition group-hover:bg-primary group-hover:text-primary-foreground"><a.icon className="size-5" /></span>
            <span>
              <span className="block text-base font-semibold">{a.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{a.desc}</span>
            </span>
            <ArrowUpLeft className="absolute end-4 top-4 size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </Link>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {[
          { label: "الإيرادات ($)", value: s?.revenue, series: s?.revSeries, cls: "text-success" },
          { label: "المصاريف ($)", value: s?.expense, series: s?.expSeries, cls: "text-destructive" },
          { label: "صافي التدفق ($)", value: s?.profit, series: s?.netSeries, cls: "text-highlight" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border bg-card p-5 shadow-soft">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
              <p className="text-[11px] text-muted-foreground">آخر 14 يوماً</p>
            </div>
            <p className="num mt-1 text-2xl font-semibold tracking-tight">{fmtNum(k.value)}</p>
            <Sparkline data={k.series ?? []} className={"mt-3 " + k.cls} />
          </div>
        ))}
      </div>
      {shownLinks.length > 0 && <h2 className="mb-3 mt-8 text-sm font-semibold text-muted-foreground">اختصاراتك</h2>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {shownLinks.map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center gap-2.5 rounded-xl border bg-card px-3.5 py-3 text-sm font-medium shadow-xs transition hover:border-foreground/15 hover:bg-accent">
            <l.icon className="size-4 shrink-0 text-muted-foreground" />
            {l.label}
          </Link>
        ))}
      </div>
      {shownCards.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shownCards.map((c) => (
            <div key={c.key} className="rounded-xl border bg-card p-4 shadow-soft">
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="num mt-2 text-2xl font-bold">{c.value}</p>
            </div>
          ))}
        </div>
      )}
      {chosen.has("lowItems") && !!s?.lowItems.length && (
        <div className="mt-6 rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="mb-3 text-sm font-semibold">تنبيه: مواد وصلت أو تقترب من حد إعادة الطلب</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="p-2 text-right">المادة</th><th className="p-2 text-right">الرصيد</th><th className="p-2 text-right">حد الطلب</th><th className="p-2 text-right">الحالة</th></tr></thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {s.lowItems.slice(0, 8).map((p: any) => {
                const under = Number(p.qty_on_hand) <= Number(p.reorder_level);
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">{p.name}</td>
                    <td className="num p-2">{fmtNum(p.qty_on_hand)} {p.unit}</td>
                    <td className="num p-2">{fmtNum(p.reorder_level)}</td>
                    <td className={under ? "p-2 font-semibold text-destructive" : "p-2 text-muted-foreground"}>{under ? "تحت الحد" : "يقترب من الحد"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>اختر ما يظهر في واجهتك</DialogTitle></DialogHeader>
          <p className="text-sm font-semibold">الاختصارات</p>
          <div className="grid grid-cols-2 gap-2">
            {links.map((l) => (
              <label key={l.to} className="flex items-center gap-2 text-sm">
                <Checkbox checked={chosen.has("link:" + l.to)} onCheckedChange={() => toggle("link:" + l.to)} />{l.label}
              </label>
            ))}
          </div>
          <p className="mt-3 text-sm font-semibold">المؤشرات</p>
          <div className="grid grid-cols-2 gap-2">
            {[...cards, { key: "lowItems", label: "جدول نقص المخزون" }].map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm">
                <Checkbox checked={chosen.has(c.key)} onCheckedChange={() => toggle(c.key)} />{c.label}
              </label>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DueBanner() {
  const due = useDueCount();
  if (!due.data) return null;
  return (
    <Link to="/reports" className="mb-4 block rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
      لديك {due.data} شيك مستحق أو متأخر خلال 7 أيام — اضغط لعرض الاستحقاقات من صفحة التقارير
    </Link>
  );
}
