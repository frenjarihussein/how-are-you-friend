import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { enqueue, isNetworkError, loadRefs, newSale, pushSale, readQueue, saveRefs, subscribeQueue, syncQueue } from "@/lib/pos-offline";
import { toast } from "sonner";
import { CloudOff, Minus, Plus, Printer, RefreshCw, Search, Trash2 } from "lucide-react";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtNum, today } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarcodeInput, findByCode } from "@/components/BarcodeInput";
import { cn } from "@/lib/utils";
import { printThermalReceipt } from "@/lib/receipt";
import { useBranding } from "@/lib/branding";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({
    meta: [
      { title: "نقطة البيع — يوسف سوفت" },
      { name: "description", content: "شاشة لمس سريعة لفواتير البيع والشراء مع مسح الباركود" },
    ],
  }),
  component: PosPage,
});

type Product = { id: string; name: string; sku: string; barcode: string | null; unit: string; category: string | null; last_purchase_price: number; sale_price: number; avg_cost: number; qty_on_hand: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Refs = { products: Product[]; warehouses: any[]; partners: any[] };
type CartLine = { p: Product; qty: number; price: number };

function PosPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const brand = useBranding();
  const forced = me?.accountKind === "sales_cashier" ? "sale" : me?.accountKind === "purchase_cashier" ? "purchase" : null;
  const [modeState, setMode] = useState<"sale" | "purchase">("sale");
  const mode = forced ?? modeState;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");
  const [wh, setWh] = useState("");
  const [partner, setPartner] = useState("");
  const [paid, setPaid] = useState(true);

  const ref = useQuery({
    queryKey: ["pos_refs", me?.tenantId],
    enabled: !!me?.tenantId,
    networkMode: "offlineFirst",
    queryFn: async () => {
      if (!navigator.onLine) { const c = loadRefs<Refs>(me?.tenantId); if (c) return c; }
      const [p, w, pa] = await Promise.all([
        scope(db.from("products").select("id,name,sku,barcode,unit,category,last_purchase_price,sale_price,avg_cost,qty_on_hand,is_group,is_active"), me?.tenantId).order("name"),
        scope(db.from("warehouses").select("id,name,is_group"), me?.tenantId).order("name"),
        scope(db.from("partners").select("id,name,partner_type"), me?.tenantId).order("name"),
      ]);
      if (p.error || w.error || pa.error) { const c = loadRefs<Refs>(me?.tenantId); if (c) return c; throw p.error || w.error || pa.error; }
      const out: Refs = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        products: ((p.data ?? []) as any[]).filter((x) => !x.is_group && x.is_active !== false) as Product[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        warehouses: ((w.data ?? []) as any[]).filter((x) => !x.is_group),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        partners: (pa.data ?? []) as any[],
      };
      saveRefs(me?.tenantId, out);
      return out;
    },
  });
  const products = ref.data?.products ?? [];
  const warehouse = wh || ref.data?.warehouses[0]?.id || "";
  const cats = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))] as string[], [products]);
  const shown = products.filter(
    (p) => (!cat || p.category === cat) && (!search || p.name.includes(search) || p.sku.toLowerCase().includes(search.toLowerCase())),
  );
  const total = cart.reduce((s, l) => s + l.qty * l.price, 0);

  function add(p: Product) {
    setCart((c) => {
      const i = c.findIndex((l) => l.p.id === p.id);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { p, qty: 1, price: Number(mode === "sale" ? Number(p.sale_price) || p.last_purchase_price : p.avg_cost) || 0 }];
    });
  }
  function setQty(id: string, q: number) {
    setCart((c) => (q <= 0 ? c.filter((l) => l.p.id !== id) : c.map((l) => (l.p.id === id ? { ...l, qty: q } : l))));
  }

  const pending = useSyncExternalStore(subscribeQueue, () => readQueue().length, () => 0);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  async function runSync(quiet = false) {
    if (!navigator.onLine || !readQueue().length) return;
    setSyncing(true);
    const r = await syncQueue();
    setSyncing(false);
    if (r.sent) { toast.success(`تمت مزامنة ${r.sent} فاتورة`); qc.invalidateQueries({ queryKey: ["pos_refs"] }); }
    if (r.failed.length && !quiet) toast.error("فواتير لم تُرفع: " + r.failed[0]);
  }
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); void runSync(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    void runSync(true);
    const t = setInterval(() => void runSync(true), 30000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      if (!cart.length) throw new Error("السلة فارغة");
      if (!warehouse) throw new Error("لا يوجد مستودع، أضف مستودعاً أولاً");
      const sale = newSale({
        tenantId: me!.tenantId!, mode, partnerId: partner || null, warehouseId: warehouse, paid, total,
        lines: cart.map((l) => ({ product_id: l.p.id, qty: l.qty, unit_price: l.price })),
      });
      if (!navigator.onLine) { enqueue(sale); return { doc_no: null, offline: true }; }
      try {
        const doc = await pushSale(sale);
        return { doc_no: doc.doc_no ?? null, offline: false };
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        enqueue(sale);
        return { doc_no: null, offline: true };
      }
    },
    onSuccess: (doc) => {
      if (doc.offline) toast.warning("لا يوجد إنترنت — حُفظت الفاتورة على الجهاز وستُرفع تلقائياً عند عودة الاتصال");
      else toast.success(`تم حفظ الفاتورة رقم ${doc.doc_no ?? ""}`);
      printThermalReceipt({
        company: me?.tenantName ?? "",
        logoUrl: brand.data?.logo_url ?? null,
        title: mode === "sale" ? "فاتورة مبيع" : "فاتورة شراء",
        docNo: doc.doc_no ?? "غير متصل",
        cashier: me?.fullName || me?.email || "",
        partner: (ref.data?.partners ?? []).find((p) => p.id === partner)?.name ?? "",
        lines: cart.map((l) => ({ name: l.p.name, qty: l.qty, price: l.price })),
        paid,
      });
      setCart([]);
      qc.invalidateQueries({ queryKey: ["pos_refs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const partnersList = (ref.data?.partners ?? []).filter((p) => (mode === "sale" ? p.partner_type !== "supplier" : p.partner_type !== "customer"));

  return (
    <div className="grid h-full gap-3 lg:grid-cols-[1fr_420px]">
      <section className="flex min-h-0 flex-col gap-3">
        {(!online || pending > 0) && (
          <div className={cn("flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm", online ? "bg-muted" : "border-destructive/40 bg-destructive/10 text-destructive")}>
            <span className="flex items-center gap-2">
              {!online && <CloudOff className="size-4" />}
              {online ? "متصل" : "وضع بدون إنترنت — البيع مستمر"}
              {pending > 0 && ` · ${pending} فاتورة بانتظار المزامنة`}
            </span>
            {online && pending > 0 && (
              <Button size="sm" variant="outline" disabled={syncing} onClick={() => void runSync()}>
                <RefreshCw className={cn("size-4", syncing && "animate-spin")} />مزامنة الآن
              </Button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!forced && (
            <div className="flex rounded-xl bg-muted p-1">
              {(["sale", "purchase"] as const).map((m) => (
                <button key={m} onClick={() => { setMode(m); setCart([]); }} className={cn("rounded-lg px-6 py-2.5 text-base font-medium text-muted-foreground", mode === m && "bg-card text-foreground shadow-soft")}>
                  {m === "sale" ? "بيع" : "شراء"}
                </button>
              ))}
            </div>
          )}
          <BarcodeInput big autoFocus className="min-w-64 flex-1" onCode={(code) => {
            const p = findByCode(products, code);
            if (!p) { toast.error("لا توجد مادة بهذا الباركود: " + code); return; }
            add(p);
          }} />
          <div className="relative w-56">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-14 ps-10 text-lg" placeholder="بحث بالاسم" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {cats.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {["", ...cats].map((c) => (
              <button key={c || "all"} onClick={() => setCat(c)} className={cn("whitespace-nowrap rounded-full border bg-card px-5 py-2.5 text-base transition", cat === c && "bg-primary text-primary-foreground")}>
                {c || "الكل"}
              </button>
            ))}
          </div>
        )}
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((p) => (
            <button key={p.id} onClick={() => add(p)} className="flex min-h-32 flex-col justify-between rounded-2xl border bg-card p-4 text-start shadow-soft transition active:scale-[0.97] hover:border-foreground/20">
              <span className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-lg font-semibold text-muted-foreground">{p.name.slice(0, 1)}</span><span className="text-base font-semibold leading-tight">{p.name}</span></span>
              <span className="mt-2 flex items-end justify-between text-sm text-muted-foreground">
                <span>{fmtNum(p.qty_on_hand, 0)} {p.unit}</span>
                <span className="num text-lg font-bold text-foreground">{fmtNum(mode === "sale" ? Number(p.sale_price) || p.last_purchase_price : p.avg_cost)}</span>
              </span>
            </button>
          ))}
          {!shown.length && <p className="col-span-full p-8 text-center text-muted-foreground">لا توجد مواد</p>}
        </div>
      </section>

      <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-soft">
        <div className="grid grid-cols-2 gap-2 border-b p-3">
          <select className="h-12 rounded-md border bg-background px-2 text-base" value={warehouse} onChange={(e) => setWh(e.target.value)}>
            {(ref.data?.warehouses ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select className="h-12 rounded-md border bg-background px-2 text-base" value={partner} onChange={(e) => setPartner(e.target.value)}>
            <option value="">{mode === "sale" ? "زبون نقدي" : "مورد نقدي"}</option>
            {partnersList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!cart.length && <p className="p-8 text-center text-muted-foreground">امسح باركود أو اضغط على مادة</p>}
          {cart.map((l) => (
            <div key={l.p.id} className="flex items-center gap-2 border-b p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{l.p.name}</div>
                <Input type="number" className="mt-1 h-9 w-28" value={l.price} onChange={(e) => setCart((c) => c.map((x) => (x.p.id === l.p.id ? { ...x, price: Number(e.target.value) } : x)))} />
              </div>
              <Button size="icon" variant="outline" className="size-11" onClick={() => setQty(l.p.id, l.qty - 1)}><Minus /></Button>
              <span className="num w-10 text-center text-lg font-bold">{l.qty}</span>
              <Button size="icon" variant="outline" className="size-11" onClick={() => setQty(l.p.id, l.qty + 1)}><Plus /></Button>
              <Button size="icon" variant="ghost" className="size-11 text-destructive" onClick={() => setQty(l.p.id, 0)}><Trash2 /></Button>
            </div>
          ))}
        </div>
        <div className="space-y-3 border-t bg-muted/40 p-4">
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" className="size-5" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
            مدفوعة نقداً
          </label>
          <div className="flex items-baseline justify-between">
            <span className="text-lg">الإجمالي</span>
            <span className="num text-4xl font-semibold tracking-tight">{fmtNum(total)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-14 flex-1 text-base" onClick={() => setCart([])} disabled={!cart.length}>إلغاء</Button>
            <Button className="h-14 flex-[2] text-lg" onClick={() => save.mutate()} disabled={!cart.length || save.isPending}>
              <Printer className="size-5" />
              {save.isPending ? "جارٍ الحفظ..." : `دفع ${fmtNum(total)} وطباعة`}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
