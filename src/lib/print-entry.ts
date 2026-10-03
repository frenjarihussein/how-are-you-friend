import { db } from "@/lib/db";
import { printDocument } from "@/lib/print";
import { CURRENCY_LABEL, fmtDate, fmtNum } from "@/lib/format";

/** Prints a journal voucher in a clean separate window. */
export async function printJournalEntry(id: string, company?: string | null, logo?: string | null) {
  // Open the window before awaiting so popup blockers allow it.
  const win = window.open("", "_blank", "width=900,height=1000");
  const { data: e, error } = await db
    .from("journal_entries")
    .select("*, journal_lines(*, accounts(code,name), partners(name), projects(name))")
    .eq("id", id)
    .maybeSingle();
  if (error || !e) {
    win?.close();
    throw new Error(error?.message ?? "القيد غير موجود");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines: any[] = e.journal_lines ?? [];
  const d = lines.reduce((s, l) => s + Number(l.debit), 0);
  const c = lines.reduce((s, l) => s + Number(l.credit), 0);
  printDocument({
    title: `سند قيد يومية رقم ${e.entry_no}`,
    company,
    logo,
    meta: [
      ["رقم القيد", String(e.entry_no)],
      ["التاريخ", fmtDate(e.entry_date)],
      ["العملة", CURRENCY_LABEL[e.currency] ?? e.currency],
      ["سعر الصرف", fmtNum(e.exchange_rate)],
      ["حالة التدقيق", e.audited ? "مدقق" : "غير مدقق"],
      ["البيان", e.description || "—"],
    ],
    columns: ["الحساب", "البيان", "الجهة", "المشروع", "مدين", "دائن"],
    rows: [
      ...lines.map((l) => [
        `${l.accounts?.code ?? ""} - ${l.accounts?.name ?? ""}`,
        l.description || "—",
        l.partners?.name ?? "—",
        l.projects?.name ?? "—",
        fmtNum(l.debit),
        fmtNum(l.credit),
      ]),
      ["الإجمالي", "", "", "", fmtNum(d), fmtNum(c)],
    ],
    signatures: ["المحاسب", "المدقق", "المدير المالي"],
  }, win);
}
