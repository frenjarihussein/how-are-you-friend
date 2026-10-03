import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { fmtNum, today } from "@/lib/format";
import { AlertTriangle } from "lucide-react";
import { BarcodeInput, findByCode } from "@/components/BarcodeInput";

export const Route = createFileRoute("/_authenticated/stocktake")({
  head: () => ({ meta: [{ title: "الجرد وتنبيهات النقص" }, { name: "description", content: "جرد المستودعات وتسوية الفروقات" }] }),
  component: StocktakePage,
});

function StocktakePage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [wh, setWh] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today());

  const base = useQuery({
    queryKey: ["stocktake", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const [p, w, m] = await Promise.all([
        scope(db.from("products").select("id,sku,barcode,name,unit,qty_on_hand,reorder_level,avg_cost,is_group"), me?.tenantId).eq("is_active", true).order("name"),
        scope(db.from("warehouses").select("id,name"), me?.tenantId).order("name"),
        scope(db.from("stock_moves").select("product_id,warehouse_id,direction,qty"), me?.tenantId),
      ]);
      const bal: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m.data ?? []).forEach((x: any) => {
        const k = `${x.warehouse_id}|${x.product_id}`;
        bal[k] = (bal[k] ?? 0) + (x.direction === "in" ? 1 : -1) * Number(x.qty);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { products: ((p.data ?? []) as any[]).filter((x) => !x.is_group), warehouses: w.data ?? [], bal };
    },
  });
  const products = base.data?.products ?? [];
  const low = products.filter((p) => Number(p.reorder_level) > 0 && Number(p.qty_on_hand) <= Number(p.reorder_level));

  const save = useMutation({
    mutationFn: async () => {
      if (!wh) throw new Error("اختر المستودع");
      const moves = products
        .filter((p) => counts[p.id] !== undefined && counts[p.id] !== "")
        .map((p) => {
          const sys = base.data!.bal[`${wh}|${p.id}`] ?? 0;
          const diff = Number(counts[p.id]) - sys;
          return { p, diff };
        })
        .filter((x) => Math.abs(x.diff) > 1e-9)
        .map(({ p, diff }) => ({
          tenant_id: me!.tenantId, product_id: p.id, warehouse_id: wh, move_date: date,
          direction: diff > 0 ? "in" : "out", qty: Math.abs(diff), unit_cost: Number(p.avg_cost) || 0, reference: "تسوية جرد",
        }));
      if (!moves.length) throw new Error("لا توجد فروقات للتسوية");
      for (const mv of moves.sort((a, b) => (a.direction === "in" ? -1 : 1) - (b.direction === "in" ? -1 : 1))) {
        const { error } = await db.from("stock_moves").insert(mv);
        if (error) throw error;
      }
      return moves.length;
    },
    onSuccess: (n) => {
      toast.success(`تمت تسوية ${n} مادة`);
      setCounts({});
      qc.invalidateQueries({ queryKey: ["stocktake"] });
      qc.invalidateQueries({ queryKey: ["stock_moves"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="تنبيهات نقص المخزون" subtitle="المواد التي وصل رصيدها إلى حد إعادة الطلب أو أقل" />
      <div className="mb-8 rounded-lg border bg-card p-4">
        {!low.length ? <p className="text-sm text-muted-foreground">لا توجد مواد ناقصة</p> : (
          <ul className="divide-y text-sm">
            {low.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-1.5">
                <AlertTriangle className="size-4 text-destructive" />
                <span className="me-auto">{p.sku} - {p.name}</span>
                <span className="num">الرصيد {fmtNum(p.qty_on_hand)} {p.unit} / الحد {fmtNum(p.reorder_level)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PageHeader title="جرد المستودع" subtitle="أدخل الكمية الفعلية المعدودة، وسيُنشئ البرنامج حركات إدخال/إخراج لتسوية الفروقات بالتكلفة الوسطية" />
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={wh} onChange={(e) => { setWh(e.target.value); setCounts({}); }}>
            <option value="">— اختر المستودع —</option>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(base.data?.warehouses ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          {can(me, "stock", "create") && <Button onClick={() => save.mutate()} disabled={!wh || save.isPending}>اعتماد الجرد وتسوية الفروقات</Button>}
        </div>
        {wh && (
          <BarcodeInput className="mb-3" onCode={(code) => {
            const p = findByCode(products, code);
            if (!p) { toast.error("لا توجد مادة بهذا الباركود: " + code); return; }
            setCounts((c) => ({ ...c, [p.id]: String(Number(c[p.id] || 0) + 1) }));
            toast.success(p.name + " +1");
          }} />
        )}
        {wh && (
          <table className="w-full text-sm">
            <thead className="bg-secondary"><tr><th className="p-2 text-right">المادة</th><th className="p-2 text-right">الرصيد الدفتري</th><th className="p-2 text-right">الكمية الفعلية</th><th className="p-2 text-right">الفرق</th></tr></thead>
            <tbody>
              {products.map((p) => {
                const sys = base.data!.bal[`${wh}|${p.id}`] ?? 0;
                const c = counts[p.id];
                const diff = c === undefined || c === "" ? null : Number(c) - sys;
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">{p.sku} - {p.name} <span className="text-xs text-muted-foreground">({p.unit})</span></td>
                    <td className="num p-2">{fmtNum(sys)}</td>
                    <td className="p-2"><Input type="number" className="h-8 w-32" value={c ?? ""} onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value })} /></td>
                    <td className={`num p-2 ${diff && diff < 0 ? "text-destructive" : ""}`}>{diff === null ? "—" : fmtNum(diff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
