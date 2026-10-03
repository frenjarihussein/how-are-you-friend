import { createFileRoute, Link } from "@tanstack/react-router";
import { CrudPage } from "@/components/CrudPage";
import { Button } from "@/components/ui/button";
import { fmtNum } from "@/lib/format";
import { Barcode, Printer, ScrollText } from "lucide-react";
import { EntityTree } from "@/components/EntityTree";
import { unitOptions, useUnits } from "@/lib/units";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { generateEan13, printStickers } from "@/lib/barcode";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "المواد والتصنيفات | يوسف سوفت" },
      { name: "description", content: "إدارة بطاقات المواد وتصنيفاتها وأسعار البيع والباركود." },
      { property: "og:title", content: "المواد والتصنيفات | يوسف سوفت" },
      { property: "og:description", content: "إدارة بطاقات المواد وتصنيفاتها وأسعار البيع والباركود." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const units = useUnits();
  const qc = useQueryClient();
  return (
    <>
    <EntityTree table="products" module="products" title="تصنيفات المواد" codeField="sku" buildInsert={(p, code) => (code ? { unit: p?.["unit"] ?? "قطعة" } : null)} usageCheck={{ table: "stock_moves", column: "product_id", message: "لا يمكن حذف مادة لها حركات" }} />
    <CrudPage
      table="products"
      module="products"
      title="بطاقة مادة"
      subtitle="التكلفة الوسطية المرجّحة وآخر سعر شراء تُحتسب آلياً من حركات المخزون. البطاقات ذات الحركات لا تُحذف بل تُجمّد"
      orderBy="name"
      ascending
      extraRowAction={(row) => (
        <>
          <Button asChild size="icon" variant="ghost" title="أستاذ المادة">
            <Link to="/ledgers" search={{ tab: "product", id: row.id }}>
              <ScrollText className="size-4" />
            </Link>
          </Button>
          <Button size="icon" variant="ghost" title="توليد باركود" disabled={!!row.barcode} onClick={async () => {
            const { error } = await db.from("products").update({ barcode: generateEan13() }).eq("id", row.id);
            if (error) toast.error(error.message); else { toast.success("تم توليد الباركود"); qc.invalidateQueries({ queryKey: ["products"] }); }
          }}>
            <Barcode className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" title="طباعة ملصقات" onClick={() => {
            const n = Number(window.prompt("عدد الملصقات", "10"));
            if (n > 0) printStickers(row, n).catch((e) => toast.error(e.message));
          }}>
            <Printer className="size-4" />
          </Button>
        </>
      )}
      importColumns={[
        { key: "sku", label: "رمز المادة", required: true, example: "P-001" },
        { key: "barcode", label: "الباركود", example: "" },
        { key: "name", label: "اسم المادة", required: true, example: "إسمنت" },
        { key: "unit", label: "الوحدة", required: true, example: "طن" },
        { key: "category_name", label: "التصنيف", example: "مواد بناء" },
        { key: "warehouse_name", label: "المستودع", example: "المستودع الرئيسي" },
        { key: "reorder_level", label: "حد إعادة الطلب", type: "number", example: "0" },
      ]}
      importLookups={[
        { key: "category_name", target: "parent_id", table: "products", matchOn: ["name", "sku"] },
        { key: "warehouse_name", target: "default_warehouse_id", table: "warehouses", matchOn: ["name", "code"] },
      ]}
      fields={[
        { key: "sku", label: "رمز المادة", required: true },
        { key: "barcode", label: "الباركود", type: "barcode" },
        { key: "name", label: "اسم المادة", required: true },
        { key: "unit", label: "الوحدة", type: "select", options: unitOptions(units.data), defaultValue: "قطعة", required: true },
        {
          key: "parent_id",
          label: "التصنيف",
          type: "ref",
          refTable: "products",
          refFilter: { key: "is_group", value: true },
          refQuickAdd: {
            label: "إضافة تصنيف",
            defaults: { sku: `CAT-${Date.now()}`, unit: "قطعة", is_group: true, is_active: true },
          },
        },
        { key: "default_warehouse_id", label: "المستودع", type: "ref", refTable: "warehouses" },
        { key: "reorder_level", label: "حد إعادة الطلب", type: "number", defaultValue: 0 },
        { key: "is_active", label: "نشط", type: "checkbox", defaultValue: true },
        {
          key: "qty_on_hand",
          label: "الرصيد الحالي",
          type: "number",
          hideInForm: true,
          render: (r) => fmtNum(r.qty_on_hand),
        },
        { key: "sale_price", label: "سعر البيع", type: "number", defaultValue: 0 },
        {
          key: "avg_cost",
          label: "التكلفة الوسطية",
          type: "number",
          hideInForm: true,
          digits: 4,
        },
        {
          key: "last_purchase_price",
          label: "آخر سعر شراء",
          type: "number",
          hideInForm: true,
          digits: 4,
        },
      ]}
    />
    </>
  );
}
