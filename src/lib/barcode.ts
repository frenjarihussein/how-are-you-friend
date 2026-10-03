/** Generates an EAN-13 code (prefix 200 = in-store use) with a valid check digit. */
export function generateEan13() {
  let base = "200";
  for (let i = 0; i < 9; i++) base += Math.floor(Math.random() * 10);
  const sum = base.split("").reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return base + ((10 - (sum % 10)) % 10);
}

/** Opens a print window with barcode stickers for a product. */
export async function printStickers(p: { name: string; barcode?: string | null; sku?: string | null }, count: number) {
  const code = p.barcode || p.sku;
  if (!code) throw new Error("لا يوجد باركود أو رمز للمادة");
  const JsBarcode = (await import("jsbarcode")).default;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const fmt = /^\d{13}$/.test(code) ? "EAN13" : "CODE128";
  JsBarcode(svg, code, { format: fmt, height: 40, fontSize: 12, margin: 4 });
  const one = `<div class="s"><div class="n">${p.name.replace(/</g, "&lt;")}</div>${svg.outerHTML}</div>`;
  const w = window.open("", "_blank");
  if (!w) throw new Error("اسمح بالنوافذ المنبثقة للطباعة");
  w.document.write(`<html dir="rtl"><head><style>body{margin:0;display:flex;flex-wrap:wrap;gap:4mm;padding:4mm;font-family:sans-serif}.s{width:50mm;height:30mm;border:1px dashed #ccc;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}.n{font-size:10px;font-weight:bold}svg{max-width:48mm}@media print{.s{border:none}}</style></head><body>${one.repeat(Math.max(1, count))}<script>onload=()=>print()</script></body></html>`);
  w.document.close();
}
