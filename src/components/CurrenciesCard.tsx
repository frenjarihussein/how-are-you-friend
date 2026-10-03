import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useCurrencies } from "@/lib/currencies";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CurrenciesCard({ editable }: { editable: boolean }) {
  const qc = useQueryClient();
  const list = useCurrencies();
  const [f, setF] = useState({ code: "", name: "", symbol: "" });
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!f.code.trim() || !f.name.trim()) { toast.error("أدخل رمز العملة واسمها"); return; }
    setBusy(true);
    const { error } = await db.rpc("add_currency", { _code: f.code, _name: f.name, _symbol: f.symbol });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تمت إضافة العملة");
    setF({ code: "", name: "", symbol: "" });
    qc.invalidateQueries({ queryKey: ["currencies"] });
  }

  async function remove(code: string) {
    const { error } = await db.from("currencies").delete().eq("code", code);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["currencies"] });
  }

  return (
    <div className="mb-8">
      <PageHeader title="العملات" subtitle="العملات المتاحة في المستندات والقيود. الدولار هو العملة الأساسية، وتُحسب فروق الصرف مقابله" />
      <div className="max-w-3xl space-y-4 rounded-lg border bg-card p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="py-2 text-right">الرمز</th>
              <th className="py-2 text-right">الاسم</th>
              <th className="py-2 text-right">الإشارة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((c) => (
              <tr key={c.code} className="border-b">
                <td className="num py-2">{c.code}</td>
                <td className="py-2">{c.name}</td>
                <td className="py-2">{c.symbol ?? "—"}</td>
                <td className="py-2 text-left">
                  {editable && c.code !== "USD" && c.code !== "SYP" && (
                    <Button size="sm" variant="ghost" onClick={() => remove(c.code)}>إخفاء</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {editable && (
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr_1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label>الرمز (مثل EUR)</Label>
              <Input value={f.code} maxLength={3} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1">
              <Label>الاسم</Label>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>الإشارة</Label>
              <Input value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} />
            </div>
            <Button onClick={add} disabled={busy}>إضافة</Button>
          </div>
        )}
      </div>
    </div>
  );
}
