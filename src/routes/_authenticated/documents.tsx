import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { fmtDate, fmtNum, today } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, CheckCircle2, RotateCcw, Pencil, Printer, MessageCircle } from "lucide-react";
import { AttachmentsButton } from "@/components/AttachmentsButton";
import { printDocument } from "@/lib/print";
import { useBranding } from "@/lib/branding";
import { CurrencyOptions } from "@/lib/currencies";
import { QuickAdd } from "@/components/QuickAdd";
import { BarcodeInput, findByCode } from "@/components/BarcodeInput";
import {
  DataFilters,
  applyFilters,
  resolveRange,
  useDataFilters,
  type FacetConfig,
} from "@/components/DataFilters";

export const Route = createFileRoute("/_authenticated/documents")({ component: DocumentsPage });

const DOC_TYPES = [
  { value: "quote", label: "عرض سعر", lines: true, partner: true, warehouse: false },
  { value: "sale", label: "فاتورة مبيع", lines: true, partner: true, warehouse: true },
  { value: "purchase", label: "فاتورة شراء", lines: true, partner: true, warehouse: true },
  { value: "receipt", label: "سند قبض", lines: false, partner: true, warehouse: false },
  { value: "payment", label: "سند دفع", lines: false, partner: true, warehouse: false },
  { value: "transfer", label: "مناقلة بين المستودعات", lines: true, partner: false, warehouse: true },
  { value: "stock_in", label: "إدخال مستودع", lines: true, partner: true, warehouse: true },
  { value: "stock_out", label: "إخراج إلى مشروع", lines: true, partner: false, warehouse: true },
];

type Line = { product_id: string; qty: string; unit_price: string };

const emptyDoc = {
  doc_type: "sale",
  doc_date: today(),
  currency: "USD",
  exchange_rate: "1",
  partner_id: "",
  warehouse_id: "",
  to_warehouse_id: "",
  settles_document_id: "",
  project_id: "",
  account_id: "",
  amount: "0",
  notes: "",
  valid_until: "",
  terms: "",
};

function DocumentsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyDoc);
  const [editing, setEditing] = useState<{ id: string; status: string } | null>(null);
  const brand = useBranding();
  const [lines, setLines] = useState<Line[]>([{ product_id: "", qty: "1", unit_price: "0" }]);
  const [filters, setFilters] = useDataFilters();
  const range = resolveRange(filters);
  const typeFilter = filters.facets["doc_type"] ?? [];

  const meta = DOC_TYPES.find((d) => d.value === form.doc_type)!;

  // Date range and document types are pushed into the backend query.
  const list = useQuery({
    queryKey: ["documents", me?.tenantId, typeFilter.join(","), range.from, range.to],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      let q = db.from("documents").select("*").order("doc_date", { ascending: false }).order("doc_no", { ascending: false });
      if (typeFilter.length > 0) q = q.in("doc_type", typeFilter);
      if (range.from) q = q.gte("doc_date", range.from);
      if (range.to) q = q.lte("doc_date", range.to);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const ref = useQuery({
    queryKey: ["doc_refs", me?.tenantId],
    enabled: !!me,
    queryFn: async () => {
      const [partners, warehouses, products, projects, accounts] = await Promise.all([
        scope(db.from("partners").select("id,name,phone"), me?.tenantId).order("name"),
        scope(db.from("warehouses").select("id,name"), me?.tenantId).order("name"),
        scope(db.from("products").select("id,name,sku,barcode,sale_price,last_purchase_price,avg_cost"), me?.tenantId).order("name"),
        scope(db.from("projects").select("id,name"), me?.tenantId).order("name"),
        scope(db.from("accounts").select("id,code,name,is_group"), me?.tenantId).order("code"),
      ]);
      return {
        partners: partners.data ?? [],
        warehouses: warehouses.data ?? [],
        products: products.data ?? [],
        projects: projects.data ?? [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accounts: (accounts.data ?? []).filter((a: any) => !a.is_group),
      };
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const linesTotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);
      const payload = {
        tenant_id: me!.tenantId,
        doc_type: form.doc_type,
        doc_date: form.doc_date,
        currency: form.currency,
        exchange_rate: Number(form.exchange_rate) || 1,
        partner_id: form.partner_id || null,
        warehouse_id: form.warehouse_id || null,
        to_warehouse_id: form.to_warehouse_id || null,
        settles_document_id:
          form.doc_type === "receipt" || form.doc_type === "payment" ? form.settles_document_id || null : null,
        project_id: form.doc_type === "sale" || form.doc_type === "purchase" ? null : form.project_id || null,
        account_id: form.account_id || null,
        amount: meta.lines ? linesTotal : Number(form.amount) || 0,
        notes: form.notes || null,
        valid_until: form.doc_type === "quote" ? form.valid_until || null : null,
        terms: form.doc_type === "quote" ? form.terms || null : null,
      };
      let docId: string;
      if (editing) {
        if (editing.status === "posted") {
          const { error: uErr } = await db.rpc("unpost_document", { _id: editing.id });
          if (uErr) throw uErr;
        }
        const { tenant_id: _t, ...upd } = payload;
        const { error } = await db.from("documents").update(upd).eq("id", editing.id);
        if (error) throw error;
        const { error: dErr } = await db.from("document_lines").delete().eq("document_id", editing.id);
        if (dErr) throw dErr;
        docId = editing.id;
      } else {
        const { data, error } = await db.from("documents").insert(payload).select().single();
        if (error) throw error;
        docId = data.id;
      }
      const data = { id: docId };
      if (meta.lines) {
        const rows = lines
          .filter((l) => l.product_id && Number(l.qty) > 0)
          .map((l) => ({
            tenant_id: me!.tenantId,
            document_id: data.id,
            product_id: l.product_id,
            qty: Number(l.qty),
            unit_price: Number(l.unit_price) || 0,
          }));
        if (rows.length === 0) throw new Error("أضف بنداً واحداً على الأقل");
        const { error: lErr } = await db.from("document_lines").insert(rows);
        if (lErr) throw lErr;
      }
      if (editing?.status === "posted") {
        const { error: pErr } = await db.rpc("post_document", { _id: docId });
        if (pErr) throw pErr;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "تم حفظ التعديلات" : form.doc_type === "quote" ? "تم حفظ عرض السعر" : "تم حفظ المستند كمسودة");
      setEditing(null);
      setOpen(false);
      setForm(emptyDoc);
      setLines([{ product_id: "", qty: "1", unit_price: "0" }]);
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const post = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("post_document", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم ترحيل المستند");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unpost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("unpost_document", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إلغاء الترحيل");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (d: any) => {
      const ls = await loadLines(d.id);
      if (!ls.length) throw new Error("عرض السعر لا يحوي بنوداً");
      const wh = d.warehouse_id || ref.data?.warehouses?.[0]?.id || null;
      const { data: inv, error } = await db.from("documents").insert({
        tenant_id: me!.tenantId, doc_type: "sale", doc_date: today(), currency: d.currency, exchange_rate: d.exchange_rate,
        partner_id: d.partner_id, warehouse_id: wh,
        amount: ls.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0),
        notes: `من عرض السعر رقم ${d.doc_no}${d.notes ? " — " + d.notes : ""}`,
      }).select().single();
      if (error) throw error;
      const { error: lErr } = await db.from("document_lines").insert(
        ls.map((l) => ({ tenant_id: me!.tenantId, document_id: inv.id, product_id: l.product_id, qty: l.qty, unit_price: l.unit_price })),
      );
      if (lErr) throw lErr;
      await db.from("documents").update({ converted_document_id: inv.id }).eq("id", d.id);
      return inv;
    },
    onSuccess: (inv) => {
      toast.success(`تم إنشاء فاتورة مبيع رقم ${inv.doc_no} كمسودة — راجعها ثم رحّلها`);
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function loadLines(id: string): Promise<any[]> {
    const { data, error } = await db.from("document_lines").select("*, products(name, unit)").eq("document_id", id);
    if (error) throw error;
    return data ?? [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function startEdit(d: any) {
    try {
      const ls = await loadLines(d.id);
      setForm({
        doc_type: d.doc_type,
        doc_date: d.doc_date,
        currency: d.currency ?? "USD",
        exchange_rate: String(d.exchange_rate ?? 1),
        partner_id: d.partner_id ?? "",
        warehouse_id: d.warehouse_id ?? "",
        to_warehouse_id: d.to_warehouse_id ?? "",
        settles_document_id: d.settles_document_id ?? "",
        project_id: d.project_id ?? "",
        account_id: d.account_id ?? "",
        amount: String(d.amount ?? 0),
        notes: d.notes ?? "",
        valid_until: d.valid_until ?? "",
        terms: d.terms ?? "",
      });
      setLines(
        ls.length
          ? ls.map((l) => ({ product_id: l.product_id, qty: String(l.qty), unit_price: String(l.unit_price) }))
          : [{ product_id: "", qty: "1", unit_price: "0" }],
      );
      setEditing({ id: d.id, status: d.status });
      setOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function printDoc(d: any) {
    try {
      const t = DOC_TYPES.find((x) => x.value === d.doc_type);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nameOf = (list: any[] | undefined, id: string | null) => (list ?? []).find((x: any) => x.id === id)?.name ?? "—";
      const meta: [string, string][] = [
        ["رقم المستند", String(d.doc_no ?? "—")],
        ["التاريخ", fmtDate(d.doc_date)],
        ["العملة", d.currency === "SYP" ? "ليرة سورية" : "دولار أمريكي"],
      ];
      if (d.partner_id) meta.push(["الزبون / المورد", nameOf(ref.data?.partners, d.partner_id)]);
      if (d.warehouse_id) meta.push(["المستودع", nameOf(ref.data?.warehouses, d.warehouse_id)]);
      if (d.to_warehouse_id) meta.push(["مستودع الوجهة", nameOf(ref.data?.warehouses, d.to_warehouse_id)]);
      if (d.project_id) meta.push(["المشروع", nameOf(ref.data?.projects, d.project_id)]);
      if (d.doc_type === "quote") {
        if (d.valid_until) meta.push(["صالح حتى", fmtDate(d.valid_until)]);
      } else meta.push(["الحالة", d.status === "posted" ? "مرحّل" : "مسودة"]);
      const hasLines = t?.lines;
      const ls = hasLines ? await loadLines(d.id) : [];
      const sum = ls.reduce((s, l) => s + Number(l.qty) * Number(l.unit_price), 0);
      printDocument({
        title: t?.label ?? "مستند",
        company: me?.tenantName,
        logo: brand.data?.logo_url,
        meta,
        columns: hasLines ? ["#", "المادة", "الوحدة", "الكمية", "السعر", "الإجمالي"] : ["البيان", "المبلغ"],
        rows: hasLines
          ? ls.map((l, i) => [i + 1, l.products?.name ?? "", l.products?.unit ?? "", fmtNum(l.qty), fmtNum(l.unit_price), fmtNum(Number(l.qty) * Number(l.unit_price))])
          : [[d.notes || t?.label || "", fmtNum(d.amount)]],
        footer: [["الإجمالي", `${fmtNum(hasLines ? sum : d.amount)} ${d.currency ?? ""}`]],
        notes: hasLines ? [d.notes, d.terms ? "الشروط والأحكام:\n" + d.terms : null].filter(Boolean).join("\n\n") || null : null,
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function sendWhatsApp(d: any) {
    const t = DOC_TYPES.find((x) => x.value === d.doc_type);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (ref.data?.partners ?? []).find((x: any) => x.id === d.partner_id);
    let total = Number(d.amount);
    if (t?.lines) {
      const ls = await loadLines(d.id);
      total = ls.reduce((s, l) => s + Number(l.qty) * Number(l.unit_price), 0);
    }
    const msg = [
      me?.tenantName ?? "",
      `${t?.label ?? "مستند"} رقم ${d.doc_no ?? "—"}`,
      `التاريخ: ${fmtDate(d.doc_date)}`,
      p ? `السيد/ة: ${p.name}` : "",
      `الإجمالي: ${fmtNum(total)} ${d.currency ?? ""}`,
      d.valid_until ? `صالح حتى: ${fmtDate(d.valid_until)}` : "",
      "شكراً لتعاملكم معنا",
    ].filter(Boolean).join("\n");
    const phone = String(p?.phone ?? "").replace(/[^0-9]/g, "").replace(/^00/, "");
    if (!phone) toast.info("لا يوجد رقم هاتف لهذا الطرف — اختر جهة الاتصال من واتساب");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }

  const facets: FacetConfig[] = [
    { key: "doc_type", label: "نوع المستند", options: DOC_TYPES.map((d) => ({ value: d.value, label: d.label })) },
    {
      key: "status",
      label: "الحالة",
      options: [
        { value: "draft", label: "مسودة" },
        { value: "posted", label: "مرحّل" },
      ],
    },
    {
      key: "currency",
      label: "العملة",
      options: [
        { value: "USD", label: "دولار ($)" },
        { value: "SYP", label: "ليرة سورية (ل.س)" },
      ],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: "partner_id", label: "الزبون / المورد", options: (ref.data?.partners ?? []).map((p: any) => ({ value: p.id, label: p.name })) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: "warehouse_id", label: "المستودع", options: (ref.data?.warehouses ?? []).map((w: any) => ({ value: w.id, label: w.name })) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: "project_id", label: "المشروع", options: (ref.data?.projects ?? []).map((p: any) => ({ value: p.id, label: p.name })) },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = applyFilters<any>(list.data ?? [], filters, {
    dateKey: "doc_date",
    searchText: (d) =>
      [
        DOC_TYPES.find((t) => t.value === d.doc_type)?.label ?? "",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ref.data?.partners ?? []).find((p: any) => p.id === d.partner_id)?.name ?? "",
        d.status === "posted" ? "مرحّل" : "مسودة",
      ].join(" "),
  });

  const total = meta.lines
    ? lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0)
    : Number(form.amount) || 0;

  return (
    <div>
      <PageHeader
        title="المستندات والفواتير"
        subtitle="فواتير البيع والشراء، سندات القبض والدفع، وحركات المستودعات مع ترحيل محاسبي تلقائي"
        actions={
          can(me, "documents", "create") ? (
            <Button
              onClick={() => {
                setEditing(null);
                setForm(emptyDoc);
                setLines([{ product_id: "", qty: "1", unit_price: "0" }]);
                setOpen(true);
              }}
            >
              <Plus className="size-4" />
              مستند جديد
            </Button>
          ) : null
        }
      />

      <DataFilters
        filters={filters}
        onChange={setFilters}
        facets={facets}
        searchPlaceholder="بحث برقم المستند أو الملاحظات..."
      />

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="px-3 py-2 text-right">النوع</th>
              <th className="px-3 py-2 text-right">الرقم</th>
              <th className="px-3 py-2 text-right">التاريخ</th>
              <th className="px-3 py-2 text-right">الجهة</th>
              <th className="px-3 py-2 text-right">المبلغ</th>
              <th className="px-3 py-2 text-center">الحالة</th>
              <th className="px-3 py-2 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {rows.map((d: any) => (
              <tr key={d.id} className="border-t">
                <td className="px-3 py-2">{DOC_TYPES.find((t) => t.value === d.doc_type)?.label}</td>
                <td className="px-3 py-2">{d.doc_no}</td>
                <td className="px-3 py-2">{fmtDate(d.doc_date)}</td>
                <td className="px-3 py-2">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(ref.data?.partners ?? []).find((p: any) => p.id === d.partner_id)?.name ?? "—"}
                </td>
                <td className="px-3 py-2">
                  {fmtNum(d.amount)} {d.currency}
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${d.status === "posted" ? "bg-status-posted text-status-posted-foreground" : "bg-status-draft text-status-draft-foreground"}`}
                  >
                    {d.doc_type === "quote" ? (d.converted_document_id ? "محوّل لفاتورة" : d.valid_until && d.valid_until < today() ? "منتهي" : "عرض سعر") : d.status === "posted" ? "مرحّل" : "مسودة"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-center gap-2">
                    <Button size="sm" variant="outline" title="طباعة" onClick={() => printDoc(d)}>
                      <Printer className="size-4" />
                    </Button>
                    <Button size="sm" variant="outline" title="إرسال عبر واتساب" onClick={() => sendWhatsApp(d)}>
                      <MessageCircle className="size-4" />
                    </Button>
                    <AttachmentsButton entityType="document" entityId={d.id} docType={d.doc_type} variant="outline" />
                    <Button
                      size="sm"
                      variant="outline"
                      title="تعديل"
                      disabled={!can(me, "documents", "edit")}
                      onClick={() => startEdit(d)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    {d.status === "draft" ? (
                      <>
                        {d.doc_type === "quote" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!can(me, "documents", "create") || !!d.converted_document_id || convert.isPending}
                            onClick={() => convert.mutate(d)}
                          >
                            <CheckCircle2 className="size-4" />
                            {d.converted_document_id ? "حُوّل لفاتورة" : "تحويل لفاتورة"}
                          </Button>
                        ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!can(me, "documents", "edit")}
                          onClick={() => post.mutate(d.id)}
                        >
                          <CheckCircle2 className="size-4" />
                          ترحيل
                        </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!can(me, "documents", "delete")}
                          onClick={() => window.confirm("حذف المستند؟") && remove.mutate(d.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!can(me, "documents", "edit")}
                        onClick={() => unpost.mutate(d.id)}
                      >
                        <RotateCcw className="size-4" />
                        إلغاء الترحيل
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  لا توجد مستندات
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل المستند" : "مستند جديد"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>نوع المستند</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.doc_type}
                onChange={(e) => setForm({ ...form, doc_type: e.target.value })}
              >
                {DOC_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>التاريخ</Label>
              <Input
                type="date"
                value={form.doc_date}
                onChange={(e) => setForm({ ...form, doc_date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>العملة</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.currency}
                onChange={(e) =>
                  setForm({ ...form, currency: e.target.value, exchange_rate: e.target.value === "USD" ? "1" : form.exchange_rate })
                }
              >
                <CurrencyOptions />
              </select>
            </div>
            {form.currency !== "USD" && (
              <div className="space-y-1">
                <Label>سعر الصرف مقابل الدولار</Label>
                <Input
                  type="number"
                  value={form.exchange_rate}
                  onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })}
                />
              </div>
            )}
            {meta.partner && (
              <div className="space-y-1">
                <Label>الزبون / المورد</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={form.partner_id}
                  onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
                >
                  <option value="">— اختر —</option>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(ref.data?.partners ?? []).map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <QuickAdd kind="partner" onCreated={(id) => setForm((f) => ({ ...f, partner_id: id }))} />
              </div>
            )}
            {meta.warehouse && (
              <div className="space-y-1">
                <Label>المستودع</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={form.warehouse_id}
                  onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
                >
                  <option value="">— اختر —</option>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(ref.data?.warehouses ?? []).map((w: any) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <QuickAdd kind="warehouse" onCreated={(id) => setForm((f) => ({ ...f, warehouse_id: id }))} />
              </div>
            )}
            {form.doc_type === "quote" && (
              <>
                <div className="space-y-1">
                  <Label>صالح حتى</Label>
                  <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>الشروط والأحكام (الدفع، التسليم، الضمان...)</Label>
                  <Textarea rows={3} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
                </div>
              </>
            )}
            {form.doc_type === "transfer" && (
              <div className="space-y-1">
                <Label>مستودع الوجهة</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={form.to_warehouse_id}
                  onChange={(e) => setForm({ ...form, to_warehouse_id: e.target.value })}
                >
                  <option value="">— اختر —</option>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(ref.data?.warehouses ?? []).map((w: any) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <QuickAdd kind="warehouse" onCreated={(id) => setForm((f) => ({ ...f, to_warehouse_id: id }))} />
              </div>
            )}
            {form.doc_type !== "sale" && form.doc_type !== "purchase" && (
            <div className="space-y-1">
              <Label>المشروع {form.doc_type === "stock_out" ? "" : "(اختياري)"}</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              >
                <option value="">— بدون —</option>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(ref.data?.projects ?? []).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            )}
            {(form.doc_type === "receipt" ||
              form.doc_type === "payment" ||
              form.doc_type === "stock_in") && (
              <div className="space-y-1">
                <Label>الحساب المقابل (صندوق / مصرف)</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={form.account_id}
                  onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                >
                  <option value="">— الافتراضي من الإعدادات —</option>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(ref.data?.accounts ?? []).map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {(form.doc_type === "receipt" || form.doc_type === "payment") && (
              <div className="space-y-1">
                <Label>الفاتورة المسددة (لحساب فروق الصرف)</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={form.settles_document_id}
                  onChange={(e) => setForm({ ...form, settles_document_id: e.target.value })}
                >
                  <option value="">— بدون —</option>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(list.data ?? [])
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .filter((d: any) =>
                      d.doc_type === (form.doc_type === "receipt" ? "sale" : "purchase") &&
                      d.currency === form.currency &&
                      (!form.partner_id || d.partner_id === form.partner_id),
                    )
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map((d: any) => (
                      <option key={d.id} value={d.id}>
                        رقم {d.doc_no} - {fmtDate(d.doc_date)} - سعر {d.exchange_rate}
                      </option>
                    ))}
                </select>
              </div>
            )}
            {!meta.lines && (
              <div className="space-y-1">
                <Label>المبلغ</Label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-1 sm:col-span-3">
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          {meta.lines && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">البنود</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLines([...lines, { product_id: "", qty: "1", unit_price: "0" }])}
                >
                  <Plus className="size-4" />
                  بند
                </Button>
              </div>
              <BarcodeInput
                className="mb-2"
                onCode={(code) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const p: any = findByCode(ref.data?.products ?? [], code);
                  if (!p) return toast.error("لا توجد مادة بهذا الباركود: " + code);
                  const idx = lines.findIndex((l) => l.product_id === p.id);
                  if (idx >= 0) {
                    const next = [...lines];
                    const cur = next[idx]!;
                    next[idx] = { ...cur, qty: String(Number(cur.qty || 0) + 1) };
                    return setLines(next);
                  }
                  const price = form.doc_type === "sale" ? Number(p.sale_price) || p.last_purchase_price : form.doc_type === "purchase" ? p.avg_cost : 0;
                  const row = { product_id: p.id, qty: "1", unit_price: String(price ?? 0) };
                  setLines([...lines.filter((l) => l.product_id), row]);
                }}
              />
              <table className="w-full border text-sm">
                <thead className="bg-secondary">
                  <tr>
                    <th className="border px-2 py-2 text-right">المادة</th>
                    <th className="border px-2 py-2 text-right">الكمية</th>
                    <th className="border px-2 py-2 text-right">السعر</th>
                    <th className="border px-2 py-2 text-right">الإجمالي</th>
                    <th className="border px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="border px-2 py-1">
                        <select
                          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                          value={l.product_id}
                          onChange={(e) => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const p = (ref.data?.products ?? []).find((x: any) => x.id === e.target.value);
                            const next = [...lines];
                            next[i] = {
                              ...l,
                              product_id: e.target.value,
                              unit_price:
                                form.doc_type === "sale" || form.doc_type === "quote"
                                  ? String(Number(p?.sale_price) || (p?.last_purchase_price ?? 0))
                                  : form.doc_type === "purchase"
                                    ? String(p?.avg_cost ?? 0)
                                    : l.unit_price,
                            };
                            setLines(next);
                          }}
                        >
                          <option value="">— اختر —</option>
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {(ref.data?.products ?? []).map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <QuickAdd kind="product" onCreated={(id) => { const next = [...lines]; next[i] = { ...l, product_id: id }; setLines(next); }} />
                      </td>
                      <td className="border px-2 py-1">
                        <Input
                          type="number"
                          value={l.qty}
                          onChange={(e) => {
                            const next = [...lines];
                            next[i] = { ...l, qty: e.target.value };
                            setLines(next);
                          }}
                        />
                      </td>
                      <td className="border px-2 py-1">
                        <Input
                          type="number"
                          value={l.unit_price}
                          onChange={(e) => {
                            const next = [...lines];
                            next[i] = { ...l, unit_price: e.target.value };
                            setLines(next);
                          }}
                        />
                      </td>
                      <td className="border px-2 py-1">
                        {fmtNum((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}
                      </td>
                      <td className="border px-2 py-1 text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLines(lines.filter((_, x) => x !== i))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-sm font-semibold">
            الإجمالي: {fmtNum(total)} {form.currency}
          </p>

          <DialogFooter>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "جارٍ الحفظ..." : editing ? (editing.status === "posted" ? "حفظ وإعادة الترحيل" : "حفظ التعديلات") : "حفظ كمسودة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
