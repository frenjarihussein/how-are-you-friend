import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import type { Me } from "@/lib/session";

export const NOTIF_KINDS = [
  { key: "announcement", label: "إعلانات مدير النظام" },
  { key: "invoice_created", label: "فواتير بيع وشراء جديدة" },
  { key: "document_posted", label: "ترحيل وإلغاء ترحيل المستندات" },
  { key: "entry_audited", label: "تدقيق القيود" },
  { key: "cheque_added", label: "شيكات جديدة" },
  { key: "low_stock", label: "نقص المخزون" },
  { key: "payroll_posted", label: "ترحيل الرواتب" },
] as const;

/** Default subscriptions by role, used until the user saves their own choice. */
export function defaultNotif(me: Me | null | undefined): Record<string, boolean> {
  const all = Object.fromEntries(NOTIF_KINDS.map((k) => [k.key, true]));
  if (!me || me.isTenantAdmin || me.isSuperAdmin) return all;
  const on = (keys: string[]) => Object.fromEntries(NOTIF_KINDS.map((k) => [k.key, keys.includes(k.key)]));
  if (me.isAuditor) return on(["announcement", "invoice_created", "document_posted", "entry_audited"]);
  if (me.accountKind === "warehouse_keeper") return on(["announcement", "low_stock"]);
  if (me.accountKind !== "standard") return on(["announcement", "low_stock"]);
  return on(["announcement", "invoice_created", "document_posted", "low_stock"]);
}

export type Prefs = { notif: Record<string, boolean>; dashboard: string[] | null };

export function usePrefs(me: Me | null | undefined) {
  return useQuery({
    queryKey: ["user_prefs", me?.userId],
    enabled: !!me,
    queryFn: async (): Promise<Prefs> => {
      const { data } = await db.from("user_prefs").select("notif,dashboard").eq("user_id", me!.userId).maybeSingle();
      return { notif: { ...defaultNotif(me), ...(data?.notif ?? {}) }, dashboard: data?.dashboard ?? null };
    },
  });
}

export function useSavePrefs(me: Me | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Prefs>) => {
      const { error } = await db.from("user_prefs").upsert({ user_id: me!.userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user_prefs"] }),
  });
}
