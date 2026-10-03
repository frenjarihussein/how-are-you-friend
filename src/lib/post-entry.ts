import { db } from "@/lib/db";

export type EntryLine = { account_id: string; debit: number; credit: number; description?: string | null; project_id?: string | null; partner_id?: string | null };

/** Creates a balanced journal entry with its lines; rolls back the header on failure. */
export async function postEntry(
  tenantId: string,
  userId: string | undefined,
  head: { entry_date: string; description: string; currency: string; exchange_rate?: number },
  lines: EntryLine[],
): Promise<string> {
  const { data: maxRow } = await db.from("journal_entries").select("entry_no").eq("tenant_id", tenantId).order("entry_no", { ascending: false }).limit(1);
  const nextNo = (maxRow?.[0]?.entry_no ?? 0) + 1;
  const { data: entry, error } = await db
    .from("journal_entries")
    .insert({ tenant_id: tenantId, entry_no: nextNo, entry_date: head.entry_date, description: head.description, currency: head.currency, exchange_rate: head.exchange_rate ?? 1, created_by: userId })
    .select()
    .single();
  if (error) throw error;
  const { error: e2 } = await db.from("journal_lines").insert(
    lines.filter((l) => l.debit > 0 || l.credit > 0).map((l) => ({ tenant_id: tenantId, entry_id: entry.id, ...l })),
  );
  if (e2) {
    await db.from("journal_entries").delete().eq("id", entry.id);
    throw e2;
  }
  return entry.id as string;
}

export function addPeriod(date: string, frequency: string) {
  const d = new Date(date + "T00:00:00Z");
  if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (frequency === "quarterly") d.setUTCMonth(d.getUTCMonth() + 3);
  else if (frequency === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}
