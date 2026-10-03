import * as XLSX from "xlsx";

/** Arabic sheet names for each backed-up table. */
export const SHEET_AR: Record<string, string> = {
  tenants: "بيانات الشركة",
  tenant_settings: "الإعدادات",
  tenant_features: "الواجهات",
  profiles: "المستخدمون",
  user_permissions: "الصلاحيات",
  accounts: "شجرة الحسابات",
  warehouses: "المستودعات",
  products: "المواد",
  partners: "الزبائن والموردون",
  projects: "المشاريع",
  boq_items: "جداول الكميات",
  project_milestones: "مراحل المشاريع",
  project_expenses: "مصاريف المشاريع",
  banks: "البنوك",
  cheques: "الشيكات",
  fixed_assets: "الأصول الثابتة",
  exchange_rates: "أسعار الصرف",
  documents: "المستندات",
  document_lines: "بنود المستندات",
  journal_entries: "قيود اليومية",
  journal_lines: "بنود القيود",
  stock_moves: "حركات المخزون",
  subscription_history: "سجل الاشتراك",
  tenant_payments: "الدفعات",
};

/** Arabic column headers; unknown columns keep their original name. */
const COL_AR: Record<string, string> = {
  id: "المعرف",
  tenant_id: "معرف الشركة",
  code: "الرمز",
  name: "الاسم",
  parent_id: "معرف الأب",
  is_group: "تجميعي",
  notes: "ملاحظات",
  created_at: "تاريخ الإنشاء",
  is_active: "نشط",
  nature: "النوع",
  currency: "العملة",
  entry_no: "رقم القيد",
  entry_date: "تاريخ القيد",
  description: "البيان",
  exchange_rate: "سعر الصرف",
  doc_type: "نوع المستند",
  doc_no: "رقم المستند",
  doc_date: "تاريخ المستند",
  debit: "مدين",
  credit: "دائن",
  account_id: "معرف الحساب",
  partner_id: "معرف الجهة",
  project_id: "معرف المشروع",
  entry_id: "معرف القيد",
  qty: "الكمية",
  unit_price: "سعر الوحدة",
  unit_cost: "تكلفة الوحدة",
  amount: "المبلغ",
  status: "الحالة",
  phone: "الهاتف",
  address: "العنوان",
  unit: "الوحدة",
  sku: "رمز المادة",
  barcode: "الباركود",
  category: "التصنيف",
  warehouse_id: "معرف المستودع",
  product_id: "معرف المادة",
  document_id: "معرف المستند",
  direction: "الاتجاه",
  move_date: "تاريخ الحركة",
  reference: "المرجع",
  location: "الموقع",
  partner_type: "نوع الجهة",
  email: "البريد",
  full_name: "الاسم الكامل",
  audited: "مدقق",
};
const AR_COL: Record<string, string> = Object.fromEntries(Object.entries(COL_AR).map(([k, v]) => [v, k]));
const AR_SHEET: Record<string, string> = Object.fromEntries(Object.entries(SHEET_AR).map(([k, v]) => [v, k]));

type Data = Record<string, Record<string, unknown>[]>;

export function downloadBackupXlsx(data: Data, filename: string) {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  for (const [table, rows] of Object.entries(data)) {
    const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    const aoa: unknown[][] = [cols.map((c) => COL_AR[c] ?? c)];
    for (const r of rows) {
      aoa.push(cols.map((c) => {
        const v = r[c];
        if (v === null || v === undefined) return "";
        return typeof v === "object" ? JSON.stringify(v) : v;
      }));
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = cols.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, (SHEET_AR[table] ?? table).slice(0, 31));
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/** Reads a backup workbook back to table -> rows with original column names. */
export async function readBackupXlsx(file: File): Promise<Data> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const out: Data = {};
  for (const sheetName of wb.SheetNames) {
    const table = AR_SHEET[sheetName] ?? sheetName;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName]!, { header: 1, raw: true, defval: "" });
    if (!aoa.length) continue;
    const headers = (aoa[0] as string[]).map((h) => AR_COL[String(h)] ?? String(h));
    out[table] = aoa.slice(1).filter((r) => r.some((c) => c !== "")).map((r) => {
      const o: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        const v = r[i];
        o[h] = v === "" ? null : v;
      });
      return o;
    });
  }
  return out;
}
