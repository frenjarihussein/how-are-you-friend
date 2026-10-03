// Opens a clean printable page (invoice / voucher) in a new window and prints it.
export type PrintDoc = {
  title: string;
  company?: string | null | undefined;
  logo?: string | null | undefined;
  meta: [string, string][];
  columns: string[];
  rows: (string | number)[][];
  footer?: [string, string][];
  notes?: string | null | undefined;
  signatures?: string[];
  dir?: "rtl" | "ltr";
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function printDocument(doc: PrintDoc, win?: Window | null) {
  const w = win ?? window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  const color = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#0f766e";
  const html = `<!doctype html><html dir="${doc.dir ?? "rtl"}"><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>
body{font-family:Tahoma,Arial,sans-serif;margin:32px;color:#111}
header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid ${color};padding-bottom:12px;margin-bottom:16px}
header img{max-height:70px;max-width:160px}
h1{margin:0;font-size:20px}h2{margin:4px 0 0;font-size:16px;color:${color}}
.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 16px;font-size:13px;margin-bottom:16px}
.meta b{color:#555;font-weight:normal}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:${color};color:#fff;padding:6px;border:1px solid #ccc;text-align:start}
td{padding:6px;border:1px solid #ccc}
tfoot td{font-weight:bold;background:#f3f3f3}
.sig{display:flex;justify-content:space-between;margin-top:56px;font-size:13px}
.brand{margin-top:24px;text-align:center;font-size:10px;color:#999}
@media print{body{margin:12mm}}
</style></head><body>
<header><div><h1>${esc(doc.company ?? "")}</h1><h2>${esc(doc.title)}</h2></div>${doc.logo ? `<img src="${esc(doc.logo)}"/>` : ""}</header>
<div class="meta">${doc.meta.map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join("")}</div>
<table><thead><tr>${doc.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
<tbody>${doc.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
${doc.footer?.length ? `<tfoot>${doc.footer.map(([k, v]) => `<tr><td colspan="${Math.max(doc.columns.length - 1, 1)}">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</tfoot>` : ""}
</table>
${doc.notes ? `<p style="font-size:13px;margin-top:12px"><b>ملاحظات:</b> ${esc(doc.notes)}</p>` : ""}
<div class="sig">${(doc.signatures ?? ["المحاسب", "المدير المالي", "المستلم"]).map((s) => `<div>${esc(s)}: ..............</div>`).join("")}</div>
<div class="brand">يوسف سوفت</div>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
