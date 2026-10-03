import { db } from "@/lib/db";
import { today } from "@/lib/format";

/** A POS sale captured on the device, synced to the server later if offline. */
export type PosSale = {
  id: string; // client-generated document id → retries never create duplicates
  voucherId: string;
  tenantId: string;
  mode: "sale" | "purchase";
  date: string;
  partnerId: string | null;
  warehouseId: string;
  paid: boolean;
  total: number;
  lines: { product_id: string; qty: number; unit_price: number }[];
};

const QKEY = "pos_offline_queue";
const listeners = new Set<() => void>();

export function readQueue(): PosSale[] {
  try { return JSON.parse(localStorage.getItem(QKEY) || "[]"); } catch { return []; }
}
function writeQueue(q: PosSale[]) {
  localStorage.setItem(QKEY, JSON.stringify(q));
  listeners.forEach((l) => l());
}
export function subscribeQueue(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function enqueue(s: PosSale) { writeQueue([...readQueue(), s]); }

export function newSale(p: Omit<PosSale, "id" | "voucherId" | "date">): PosSale {
  return { ...p, id: crypto.randomUUID(), voucherId: crypto.randomUUID(), date: today() };
}

/** True when the failure is "no internet" rather than a real data error. */
export function isNetworkError(e: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const m = String((e as Error)?.message ?? e);
  return /Failed to fetch|NetworkError|Load failed|network|fetch/i.test(m);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isDup = (err: any) => err?.code === "23505";

/** Idempotent: safe to call again for a sale that was partly sent. */
export async function pushSale(s: PosSale): Promise<{ doc_no?: string | number | null }> {
  const notes = s.mode === "sale" ? "بيع نقطة البيع" : "شراء نقطة البيع";
  const ins = await db.from("documents").insert({
    id: s.id, tenant_id: s.tenantId, doc_type: s.mode, doc_date: s.date, currency: "USD", exchange_rate: 1,
    partner_id: s.partnerId, warehouse_id: s.warehouseId, amount: 0, notes,
  });
  if (ins.error && !isDup(ins.error)) throw ins.error;
  const { data: doc, error: rErr } = await db.from("documents").select("id,doc_no,status").eq("id", s.id).single();
  if (rErr) throw rErr;
  if (doc.status !== "posted") {
    const { count } = await db.from("document_lines").select("id", { count: "exact", head: true }).eq("document_id", s.id);
    if (!count) {
      const { error } = await db.from("document_lines").insert(s.lines.map((l) => ({ ...l, tenant_id: s.tenantId, document_id: s.id })));
      if (error) throw error;
    }
    const { error: pErr } = await db.rpc("post_document", { _id: s.id });
    if (pErr) throw new Error("حُفظت الفاتورة كمسودة ولم تُرحّل: " + pErr.message);
  }
  if (s.paid) {
    const v = await db.from("documents").insert({
      id: s.voucherId, tenant_id: s.tenantId, doc_type: s.mode === "sale" ? "receipt" : "payment", doc_date: s.date,
      currency: "USD", exchange_rate: 1, partner_id: s.partnerId, settles_document_id: s.id, amount: s.total, notes: "دفع نقدي - نقطة البيع",
    });
    if (v.error && !isDup(v.error)) throw v.error;
    const { data: vd } = await db.from("documents").select("status").eq("id", s.voucherId).single();
    if (vd && vd.status !== "posted") await db.rpc("post_document", { _id: s.voucherId });
  }
  return doc;
}

let syncing = false;
/** Sends every waiting sale, oldest first. Stops at the first network failure. */
export async function syncQueue(): Promise<{ sent: number; failed: string[] }> {
  if (syncing) return { sent: 0, failed: [] };
  syncing = true;
  let sent = 0;
  const failed: string[] = [];
  try {
    for (const s of readQueue()) {
      try {
        await pushSale(s);
        writeQueue(readQueue().filter((x) => x.id !== s.id));
        sent++;
      } catch (e) {
        if (isNetworkError(e)) break;
        failed.push((e as Error).message);
      }
    }
  } finally { syncing = false; }
  return { sent, failed };
}

// Reference data cache (products, warehouses, partners) for offline use
export const refsKey = (t?: string | null) => `pos_refs_cache_${t ?? ""}`;
export function loadRefs<T>(t?: string | null): T | undefined {
  try { const v = localStorage.getItem(refsKey(t)); return v ? JSON.parse(v) : undefined; } catch { return undefined; }
}
export function saveRefs(t: string | null | undefined, v: unknown) {
  try { localStorage.setItem(refsKey(t), JSON.stringify(v)); } catch { /* storage full */ }
}
