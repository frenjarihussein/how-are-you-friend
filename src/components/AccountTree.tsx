import { EntityTree } from "@/components/EntityTree";

export function AccountTree() {
  return (
    <EntityTree
      table="accounts"
      module="accounts"
      title="الشجرة المرسومة للحسابات"
      extraSelect="nature,currency"
      buildInsert={(p, code) => (code ? { nature: p?.["nature"] ?? "balance_sheet", currency: p?.["currency"] ?? "USD" } : null)}
      usageCheck={{ table: "journal_lines", column: "account_id", message: "لا يمكن حذف حساب له حركات محاسبية، يمكنك إلغاء تفعيله" }}
    />
  );
}
