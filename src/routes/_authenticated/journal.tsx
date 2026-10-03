import { createFileRoute, Link } from "@tanstack/react-router";
import { CurrencyOptions } from "@/lib/currencies";
import { QuickAdd } from "@/components/QuickAdd";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { exportCsv, printPage } from "@/lib/export";
import { printJournalEntry } from "@/lib/print-entry";
import { useBranding } from "@/lib/branding";
import { fmtDate, fmtNum, today } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, FileText, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { SourceDoc } from "@/components/SourceDoc";
import { AttachmentsButton } from "@/components/AttachmentsButton";
import {
  DataFilters,
  applyFilters,
  resolveRange,
  useDataFilters,
  type FacetConfig,
} from "@/components/DataFilters";

export const Route = createFileRoute("/_authenticated/journal")({ component: JournalPage });

type LineDraft = {
  account_id: string;
  partner_id: string;
  project_id: string;
  description: string;
  debit: string;
  credit: string;
};

const emptyLine = (): LineDraft => ({
  account_id: "",
  partner_id: "",
  project_id: "",
  description: "",
  debit: "",
  credit: "",
});

function JournalPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [head, setHead] = useState({
    entry_date: today(),
    description: "",
    currency: "USD",
    exchange_rate: "1",
  });
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(), emptyLine()]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function startEdit(e: any) {
    const { data, error } = await db.from("journal_lines").select("*").eq("entry_id", e.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setHead({
      entry_date: e.entry_date,
      description: e.description ?? "",
      currency: e.currency ?? "USD",
      exchange_rate: String(e.exchange_rate ?? 1),
    });
    setLines(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map((l: any) => ({
        account_id: l.account_id,
        partner_id: l.partner_id ?? "",
        project_id: l.project_id ?? "",
        description: l.description ?? "",
        debit: Number(l.debit) ? String(l.debit) : "",
        credit: Number(l.credit) ? String(l.credit) : "",
      })),
    );
    setEditingId(e.id);
    setOpen(true);
  }

  const [filters, setFilters] = useDataFilters();
  const brand = useBranding();
  const [auditFilter, setAuditFilter] = useState<"all" | "yes" | "no">("all");
  const canAudit = !!me?.isAuditor;
  async function toggleAudit(id: string, ok: boolean) {
    const { error } = await db.rpc("set_entry_audited", { _id: id, _ok: ok });
    if (error) toast.error(error.message);
    else { toast.success(ok ? "تم تدقيق القيد" : "تم إلغاء التدقيق"); qc.invalidateQueries({ queryKey: ["journal_entries"] }); }
  }
  const range = resolveRange(filters);

  // The date range is pushed into the backend query; the rest filters in place.
  const entries = useQuery({
    queryKey: ["journal_entries", me?.tenantId, range.from, range.to],
    enabled: !!me,
    queryFn: async () => {
      let q = db
        .from("journal_entries")
        .select("*, journal_lines(debit, credit)")
        .order("entry_no", { ascending: false });
      if (range.from) q = q.gte("entry_date", range.from);
      if (range.to) q = q.lte("entry_date", range.to);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const refs = useQuery({
    queryKey: ["journal_refs", me?.tenantId],
    enabled: !!me,
    queryFn: async () => {
      const [acc, par, prj] = await Promise.all([
        scope(db.from("accounts").select("id,code,name"), me?.tenantId).order("code"),
        scope(db.from("partners").select("id,name"), me?.tenantId).order("name"),
        scope(db.from("projects").select("id,name"), me?.tenantId).order("name"),
      ]);
      return { accounts: acc.data ?? [], partners: par.data ?? [], projects: prj.data ?? [] };
    },
  });

  const totals = lines.reduce(
    (acc, l) => ({ debit: acc.debit + Number(l.debit || 0), credit: acc.credit + Number(l.credit || 0) }),
    { debit: 0, credit: 0 },
  );
  const balanced = Math.abs(totals.debit - totals.credit) < 0.0001 && totals.debit > 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!balanced) throw new Error("لا يمكن الحفظ: مجموع المدين لا يساوي مجموع الدائن");
      if (editingId) {
        const { error: u } = await db
          .from("journal_entries")
          .update({
            entry_date: head.entry_date,
            description: head.description,
            currency: head.currency,
            exchange_rate: Number(head.exchange_rate || 1),
          })
          .eq("id", editingId);
        if (u) throw u;
        const { data: oldLines } = await db.from("journal_lines").select("*").eq("entry_id", editingId);
        const { error: d } = await db.from("journal_lines").delete().eq("entry_id", editingId);
        if (d) throw d;
        const newLines = lines
          .filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
          .map((l) => ({
            tenant_id: me?.tenantId,
            entry_id: editingId,
            account_id: l.account_id,
            partner_id: l.partner_id || null,
            project_id: l.project_id || null,
            description: l.description || null,
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
          }));
        const { error: i } = await db.from("journal_lines").insert(newLines);
        if (i) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (oldLines?.length) await db.from("journal_lines").insert(oldLines.map(({ id: _id, ...r }: any) => r));
          throw i;
        }
        return;
      }
      const { data: maxRow } = await db
        .from("journal_entries")
        .select("entry_no")
        .order("entry_no", { ascending: false })
        .limit(1);
      const nextNo = (maxRow?.[0]?.entry_no ?? 0) + 1;

      const { data: entry, error: e1 } = await db
        .from("journal_entries")
        .insert({
          tenant_id: me?.tenantId,
          entry_no: nextNo,
          entry_date: head.entry_date,
          description: head.description,
          currency: head.currency,
          exchange_rate: Number(head.exchange_rate || 1),
          created_by: me?.userId,
        })
        .select()
        .single();
      if (e1) throw e1;

      const payload = lines
        .filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
        .map((l) => ({
          tenant_id: me?.tenantId,
          entry_id: entry.id,
          account_id: l.account_id,
          partner_id: l.partner_id || null,
          project_id: l.project_id || null,
          description: l.description || null,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
        }));
      const { error: e2 } = await db.from("journal_lines").insert(payload);
      if (e2) {
        await db.from("journal_entries").delete().eq("id", entry.id);
        throw e2;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "تم حفظ تعديلات القيد" : "تم ترحيل القيد بنجاح");
      setEditingId(null);
      setOpen(false);
      setLines([emptyLine(), emptyLine()]);
      setHead({ entry_date: today(), description: "", currency: "USD", exchange_rate: "1" });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("journal_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف القيد");
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows = (entries.data ?? []).map((e: any) => ({
    ...e,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    total: (e.journal_lines ?? []).reduce((s: number, l: any) => s + Number(l.debit), 0),
  }));

  const facets: FacetConfig[] = [
    {
      key: "currency",
      label: "العملة",
      options: [
        { value: "USD", label: "دولار ($)" },
        { value: "SYP", label: "ليرة سورية (ل.س)" },
      ],
    },
    {
      key: "doc_type",
      label: "المصدر",
      options: [
        { value: "sale", label: "فاتورة مبيع" },
        { value: "purchase", label: "فاتورة شراء" },
        { value: "receipt", label: "سند قبض" },
        { value: "payment", label: "سند دفع" },
        { value: "stock_in", label: "إدخال مستودع" },
        { value: "stock_out", label: "إخراج إلى مشروع" },
      ],
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = applyFilters<any>(allRows, filters, { dateKey: "entry_date" }).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => auditFilter === "all" || (auditFilter === "yes" ? e.audited : !e.audited),
  );

  return (
    <div>
      <PageHeader
        title="دفتر اليومية العامة"
        subtitle="لا يقبل النظام أي قيد غير متوازن (المدين يجب أن يساوي الدائن)"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportCsv(
                  "دفتر اليومية العامة",
                  [
                    { key: "entry_no", label: "رقم القيد" },
                    { key: "entry_date", label: "التاريخ" },
                    { key: "description", label: "البيان" },
                    { key: "currency", label: "العملة" },
                    { key: "exchange_rate", label: "سعر الصرف" },
                    { key: "total", label: "المبلغ" },
                  ],
                  rows,
                )
              }
            >
              <Download className="size-4" />
              تصدير إلى إكسل
            </Button>
            <Button variant="outline" onClick={printPage}>
              <Printer className="size-4" />
              طباعة
            </Button>
            {can(me, "journal", "create") && (
              <Button
                onClick={() => {
                  setEditingId(null);
                  setLines([emptyLine(), emptyLine()]);
                  setHead({ entry_date: today(), description: "", currency: "USD", exchange_rate: "1" });
                  setOpen(true);
                }}
              >
                <Plus className="size-4" />
                قيد جديد
              </Button>
            )}
          </>
        }
      />

      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">حالة التدقيق:</span>
        <select className="h-9 rounded-md border bg-background px-2" value={auditFilter} onChange={(e) => setAuditFilter(e.target.value as "all" | "yes" | "no")}>
          <option value="all">الكل</option>
          <option value="no">غير مدقق</option>
          <option value="yes">مدقق</option>
        </select>
      </div>
      <DataFilters
        filters={filters}
        onChange={setFilters}
        facets={facets}
        searchPlaceholder="بحث برقم القيد أو البيان..."
      />

      <div className="print-area overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="px-3 py-2 text-right">رقم القيد</th>
              <th className="px-3 py-2 text-right">التاريخ</th>
              <th className="px-3 py-2 text-right">البيان</th>
              <th className="px-3 py-2 text-right">أصل السند</th>
              <th className="px-3 py-2 text-right">العملة</th>
              <th className="px-3 py-2 text-right">سعر الصرف</th>
              <th className="px-3 py-2 text-right">المبلغ</th>
              <th className="px-3 py-2 text-right">التدقيق</th>
              <th className="no-print px-3 py-2 text-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  لا توجد قيود
                </td>
              </tr>
            )}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {rows.map((e: any) => (
              <tr key={e.id} className="border-t hover:bg-muted/40">
                <td className="px-3 py-2">{e.entry_no}</td>
                <td className="px-3 py-2">{fmtDate(e.entry_date)}</td>
                <td className="px-3 py-2">{e.description || "—"}</td>
                <td className="px-3 py-2"><SourceDoc docType={e.doc_type} documentId={e.document_id} /></td>
                <td className="px-3 py-2">{e.currency === "USD" ? "دولار" : e.currency === "SYP" ? "ليرة سورية" : e.currency}</td>
                <td className="px-3 py-2">{fmtNum(e.exchange_rate, 2)}</td>
                <td className="px-3 py-2">{fmtNum(e.total)}</td>
                <td className="px-3 py-2">
                  {canAudit ? (
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={!!e.audited} onChange={(ev) => toggleAudit(e.id, ev.target.checked)} />
                      {e.audited ? "مدقق" : "غير مدقق"}
                    </label>
                  ) : (
                    <span className={e.audited ? "text-xs font-semibold text-primary" : "text-xs text-muted-foreground"}>{e.audited ? "مدقق" : "غير مدقق"}</span>
                  )}
                </td>
                <td className="no-print px-3 py-2">
                  <div className="flex gap-1">
                    <Button asChild size="icon" variant="ghost" title="سند القيد">
                      <Link to="/journal/$entryId" params={{ entryId: e.id }}>
                        <FileText className="size-4" />
                      </Link>
                    </Button>
                    <Button size="icon" variant="ghost" title="طباعة" onClick={() =>
                      printJournalEntry(e.id, me?.tenantName, brand.data?.logo_url).catch((err) => toast.error(err.message))}>
                      <Printer className="size-4" />
                    </Button>
                    <AttachmentsButton entityType="journal_entry" entityId={e.id} />
                    {can(me, "journal", "edit") && !e.document_id && !e.audited && (
                      <Button size="icon" variant="ghost" onClick={() => startEdit(e)} title="تعديل">
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {can(me, "journal", "delete") && !e.audited && (
                      <Button size="icon" variant="ghost" onClick={() => del.mutate(e.id)} title="حذف">
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditingId(null); }}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل قيد يومية" : "قيد يومية جديد"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>التاريخ</Label>
              <Input
                type="date"
                value={head.entry_date}
                onChange={(e) => setHead({ ...head, entry_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>البيان</Label>
              <Input value={head.description} onChange={(e) => setHead({ ...head, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>العملة</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={head.currency}
                onChange={(e) =>
                  setHead({
                    ...head,
                    currency: e.target.value,
                    exchange_rate: e.target.value === "USD" ? "1" : head.exchange_rate,
                  })
                }
              >
                <CurrencyOptions />
              </select>
            </div>
            {head.currency !== "USD" && (
              <div className="space-y-1.5">
                <Label>سعر الصرف (وحدة مقابل 1 دولار)</Label>
                <Input
                  type="number"
                  step="any"
                  value={head.exchange_rate}
                  onChange={(e) => setHead({ ...head, exchange_rate: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className="mt-4 overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-secondary">
                <tr>
                  <th className="px-2 py-2 text-right">الحساب</th>
                  <th className="px-2 py-2 text-right">الجهة</th>
                  <th className="px-2 py-2 text-right">المشروع</th>
                  <th className="px-2 py-2 text-right">البيان</th>
                  <th className="px-2 py-2 text-right">مدين</th>
                  <th className="px-2 py-2 text-right">دائن</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1">
                      <select
                        className="h-9 w-44 rounded-md border border-input bg-background px-2 text-sm"
                        value={l.account_id}
                        onChange={(e) => {
                          const next = [...lines];
                          next[i] = { ...l, account_id: e.target.value };
                          setLines(next);
                        }}
                      >
                        <option value="">— اختر —</option>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(refs.data?.accounts ?? []).map((a: any) => (
                          <option key={a.id} value={a.id}>
                            {a.code} - {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1">
                      <select
                        className="h-9 w-32 rounded-md border border-input bg-background px-2 text-sm"
                        value={l.partner_id}
                        onChange={(e) => {
                          const next = [...lines];
                          next[i] = { ...l, partner_id: e.target.value };
                          setLines(next);
                        }}
                      >
                        <option value="">—</option>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(refs.data?.partners ?? []).map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <QuickAdd kind="partner" onCreated={(id) => { const next = [...lines]; next[i] = { ...l, partner_id: id }; setLines(next); }} />
                    </td>
                    <td className="p-1">
                      <select
                        className="h-9 w-32 rounded-md border border-input bg-background px-2 text-sm"
                        value={l.project_id}
                        onChange={(e) => {
                          const next = [...lines];
                          next[i] = { ...l, project_id: e.target.value };
                          setLines(next);
                        }}
                      >
                        <option value="">—</option>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(refs.data?.projects ?? []).map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1">
                      <Input
                        className="h-9 w-40"
                        value={l.description}
                        onChange={(e) => {
                          const next = [...lines];
                          next[i] = { ...l, description: e.target.value };
                          setLines(next);
                        }}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        className="h-9 w-28"
                        type="number"
                        step="any"
                        value={l.debit}
                        onChange={(e) => {
                          const next = [...lines];
                          next[i] = { ...l, debit: e.target.value, credit: e.target.value ? "" : l.credit };
                          setLines(next);
                        }}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        className="h-9 w-28"
                        type="number"
                        step="any"
                        value={l.credit}
                        onChange={(e) => {
                          const next = [...lines];
                          next[i] = { ...l, credit: e.target.value, debit: e.target.value ? "" : l.debit };
                          setLines(next);
                        }}
                      />
                    </td>
                    <td className="p-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted font-semibold">
                <tr>
                  <td colSpan={4} className="px-2 py-2 text-left">
                    الإجمالي
                  </td>
                  <td className="px-2 py-2">{fmtNum(totals.debit)}</td>
                  <td className="px-2 py-2">{fmtNum(totals.credit)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setLines([...lines, emptyLine()])}>
              <Plus className="size-4" />
              إضافة سطر
            </Button>
            <span className={balanced ? "text-sm font-semibold text-primary" : "text-sm font-semibold text-destructive"}>
              {balanced ? "القيد متوازن ✓" : "القيد غير متوازن — الفرق " + fmtNum(totals.debit - totals.credit)}
            </span>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={() => save.mutate()} disabled={!balanced || save.isPending}>
              ترحيل القيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
