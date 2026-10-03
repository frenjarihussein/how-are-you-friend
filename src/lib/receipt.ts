import { fmtNum } from "@/lib/format";

export type ReceiptData = {
  company: string;
  logoUrl?: string | null;
  title: string;
  docNo?: number | string | null;
  cashier?: string;
  partner?: string;
  lines: { name: string; qty: number; price: number }[];
  paid: boolean;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Prints an 80mm thermal receipt straight away through a hidden frame (no popup window). */
export function printThermalReceipt(d: ReceiptData) {
  const total = d.lines.reduce((s, l) => s + l.qty * l.price, 0);
  const now = new Date();
  const rows = d.lines
    .map(
      (l) => `<tr><td class="n" colspan="3">${esc(l.name)}</td></tr>
<tr class="q"><td>${fmtNum(l.qty, l.qty % 1 ? 2 : 0)} × ${fmtNum(l.price)}</td><td></td><td class="r">${fmtNum(l.qty * l.price)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
@page{size:80mm auto;margin:0}
*{box-sizing:border-box}
body{width:80mm;margin:0;padding:3mm 4mm;font-family:Tahoma,Arial,sans-serif;font-size:12px;color:#000}
.c{text-align:center}.r{text-align:left;white-space:nowrap}
h1{font-size:16px;margin:2px 0}
img{max-width:30mm;max-height:18mm}
.m{font-size:11px;line-height:1.5}
hr{border:0;border-top:1px dashed #000;margin:6px 0}
table{width:100%;border-collapse:collapse}
td{padding:1px 0;vertical-align:top}
.n{font-weight:bold;padding-top:3px}
.q td{font-size:11px}
.t{font-size:18px;font-weight:bold}
</style></head><body>
<div class="c">${d.logoUrl ? `<img src="${esc(d.logoUrl)}">` : ""}<h1>${esc(d.company)}</h1><div>${esc(d.title)}</div></div>
<hr><div class="m">
<div>رقم الفاتورة: <b>${esc(String(d.docNo ?? "-"))}</b></div>
<div>التاريخ: ${now.toLocaleDateString("en-GB")} ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
${d.cashier ? `<div>الكاشير: ${esc(d.cashier)}</div>` : ""}
${d.partner ? `<div>العميل: ${esc(d.partner)}</div>` : ""}
</div><hr>
<table>${rows}</table>
<hr><table>
<tr><td>عدد الأصناف</td><td class="r">${d.lines.length}</td></tr>
<tr class="t"><td>الإجمالي</td><td class="r">${fmtNum(total)}</td></tr>
<tr><td>طريقة الدفع</td><td class="r">${d.paid ? "نقداً" : "آجل"}</td></tr>
</table><hr>
<div class="c m">شكراً لزيارتكم</div>
</body></html>`;
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  document.body.appendChild(f);
  const doc = f.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    f.contentWindow?.focus();
    f.contentWindow?.print();
    setTimeout(() => f.remove(), 2000);
  };
  const img = doc.querySelector("img");
  if (img && !img.complete) { img.onload = go; img.onerror = go; } else setTimeout(go, 100);
}
