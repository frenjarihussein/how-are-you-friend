import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Minus, Plus, Trash2 } from "lucide-react";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtNum, today } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { BarcodeInput, findByCode } from "@/components/BarcodeInput";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/warehouse-desk")({
  head: () => ({
    meta: [
      { title: "عمليات المستودع — يوسف سوفت" },
      { name: "description", content: "إدخال وإخراج ومناقلة المواد بالباركود من شاشة لمس" },
    ],
  }),
  component: WarehouseDesk,
});

const OPS = [
  { v: "stock_in", label: "إدخال مواد", icon: ArrowDownToLine },
  { v: "stock_out", label: "إخراج مواد", icon: ArrowUpFromLine },
  { v: "transfer", label: "مناقلة", icon: ArrowLeftRight },
] as const;

type P = { id: string; name: string; sku: string; barcode: string | null; unit: string; avg_cost: number };

function WarehouseDesk() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [op, setOp] = useState<(typeof OPS)[number]["v"]>("stock_in");
  const [wh, setWh] = useState("");
  const [to, setTo] = useState("");
  const [project, setProject] = useState("");
  const [pick, setPick] = useState("");
  const [lines, setLines] = useState<{ p: P; qty: number }[]>([]);

  const ref = useQuery({
    queryKey: ["wdesk", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const [p, w, pr] = await Promise.all([
        scope(db.from("products").select("id,name,sku,barcode,unit,avg_cost,is_group"), me?.tenantId).order("name"),
        scope(db.from("warehouses").select("id,name,is_group"), me?.tenantId).order("name"),
        scope(db.from("projects").select("id,name"), me?.tenantId).order("name"),
      ]);
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        products: ((p.data ?? []) as any[]).filter((x) => !x.is_group) as P[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        warehouses: ((w.data ?? []) as any[]).filter((x) => !x.is_group),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        projects: (pr.data ?? []) as any[],
      };
    },
  });
  const products = ref.data?.products ?? [];

  function add(p: P) {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.p.id === p.id);
      return i >= 0 ? ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { p, qty: 1 }];
    });
  }
  function setQty(id: string, q: number) {
    setLines((ls) => (q <= 0 ? ls.filter((l) => l.p.id !== id) : ls.map((l) => (l.p.id === id ? { ...l, qty: q } : l))));
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!wh) throw new Error("اختر المستودع");
      if (op === "transfer" && (!to || to === wh)) throw new Error("اختر مستودعاً آخر للمناقلة");
      if (!lines.length) throw new Error("أضف مواد");
      const { data: doc, error } = await db
        .from("documents")
        .insert({ tenant_id: me!.tenantId, doc_type: op, doc_date: today(), currency: "USD", exchange_rate: 1, warehouse_id: wh, to_warehouse_id: op === "transfer" ? to : null, project_id: op === "stock_out" ? project || null : null, amount: 0, notes: "شاشة أمين المستودع" })
        .select()
        .single();
      if (error) throw error;
      const { error: lErr } = await db.from("document_lines").insert(
        lines.map((l) => ({ tenant_id: me!.tenantId, document_id: doc.id, product_id: l.p.id, qty: l.qty, unit_price: Number(l.p.avg_cost) || 0 })),
      );
      if (lErr) throw lErr;
      const { error: pErr } = await db.rpc("post_document", { _id: doc.id });
      if (pErr) throw new Error("حُفظت كمسودة ولم تُرحّل: " + pErr.message);
    },
    onSuccess: () => {
      toast.success("تم تنفيذ العملية");
      setLines([]);
      qc.invalidateQueries({ queryKey: ["wdesk"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sel = "h-14 rounded-md border bg-background px-3 text-lg";
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {OPS.map((o) => (
          <button key={o.v} onClick={() => setOp(o.v)} className={cn("flex flex-col items-center gap-2 rounded-xl border bg-card p-5 text-lg font-semibold", op === o.v && "border-primary bg-primary text-primary-foreground")}>
            <o.icon className="size-8" />
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <select className={sel} value={wh} onChange={(e) => setWh(e.target.value)}>
          <option value="">{op === "stock_in" ? "إلى المستودع" : "من المستودع"}</option>
          {(ref.data?.warehouses ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        {op === "transfer" && (
          <select className={sel} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">إلى المستودع</option>
            {(ref.data?.warehouses ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
        {op === "stock_out" && (
          <select className={sel} value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">بدون مشروع</option>
            {(ref.data?.projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>
      <BarcodeInput big autoFocus onCode={(code) => {
        const p = findByCode(products, code);
        if (!p) { toast.error("لا توجد مادة بهذا الباركود: " + code); return; }
        add(p);
      }} />
      <select className={cn(sel, "w-full")} value={pick} onChange={(e) => { const p = products.find((x) => x.id === e.target.value); if (p) add(p); setPick(""); }}>
        <option value="">أو اختر مادة من القائمة</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div className="rounded-xl border bg-card">
        {!lines.length && <p className="p-8 text-center text-muted-foreground">لا توجد مواد بعد</p>}
        {lines.map((l) => (
          <div key={l.p.id} className="flex items-center gap-3 border-b p-3 last:border-0">
            <span className="flex-1 text-lg font-semibold">{l.p.name} <span className="text-sm text-muted-foreground">({l.p.unit})</span></span>
            <Button size="icon" variant="outline" className="size-12" onClick={() => setQty(l.p.id, l.qty - 1)}><Minus /></Button>
            <input type="number" className="num h-12 w-20 rounded-md border bg-background text-center text-lg" value={l.qty} onChange={(e) => setQty(l.p.id, Number(e.target.value))} />
            <Button size="icon" variant="outline" className="size-12" onClick={() => setQty(l.p.id, l.qty + 1)}><Plus /></Button>
            <Button size="icon" variant="ghost" className="size-12 text-destructive" onClick={() => setQty(l.p.id, 0)}><Trash2 /></Button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">عدد المواد: {lines.length} — الكمية: {fmtNum(lines.reduce((s, l) => s + l.qty, 0), 0)}</span>
        <Button className="h-14 px-10 text-lg" disabled={!lines.length || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "جارٍ التنفيذ..." : "تأكيد العملية"}
        </Button>
      </div>
    </div>
  );
}
