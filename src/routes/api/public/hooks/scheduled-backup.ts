import { createFileRoute } from "@tanstack/react-router";

const BACKUP_TABLES = [
  "tenants", "tenant_settings", "tenant_features", "profiles", "user_permissions", "accounts",
  "warehouses", "products", "partners", "projects", "boq_items", "project_milestones",
  "project_expenses", "banks", "cheques", "fixed_assets", "exchange_rates", "documents",
  "document_lines", "journal_entries", "journal_lines", "stock_moves", "subscription_history",
  "tenant_payments", "units", "recurring_entries", "employees", "employee_advances",
  "employee_leaves", "employee_adjustments", "payroll_runs", "attachments", "notifications",
];

const DAY = 86_400_000;

export const Route = createFileRoute("/api/public/hooks/scheduled-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace("Bearer ", "");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;
        const { data: cfg } = await db.from("app_config").select("value").eq("key", "backup_cron_secret").maybeSingle();
        if (!cfg?.value || token !== cfg.value) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }


        const { data: settings, error } = await db
          .from("tenant_settings")
          .select("tenant_id, last_backup_at, backup_every_days")
          .eq("auto_backup", true);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const now = Date.now();
        const results: { tenant_id: string; status: string }[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const s of (settings ?? []) as any[]) {
          const every = Number(s.backup_every_days || 7) * DAY;
          if (s.last_backup_at && now - new Date(s.last_backup_at).getTime() < every) {
            results.push({ tenant_id: s.tenant_id, status: "skipped_not_due" });
            continue;
          }
          try {
            const out: Record<string, unknown[]> = {};
            for (const t of BACKUP_TABLES) {
              const q = db.from(t).select("*");
              const { data: rows, error: e2 } = await (t === "tenants" ? q.eq("id", s.tenant_id) : q.eq("tenant_id", s.tenant_id));
              if (e2) throw new Error(`${t}: ${e2.message}`);
              out[t] = rows ?? [];
            }
            const json = JSON.stringify({ app: "yousef-soft", version: 1, created_at: new Date().toISOString(), data: out });
            const path = `${s.tenant_id}/${new Date().toISOString().slice(0, 10)}-${now}.json`;
            const { error: upErr } = await supabaseAdmin.storage
              .from("backups")
              .upload(path, new Blob([json], { type: "application/json" }), { contentType: "application/json" });
            if (upErr) throw upErr;
            await db.from("backups").insert({ tenant_id: s.tenant_id, file_path: path, size_bytes: json.length });
            await db.from("tenant_settings").update({ last_backup_at: new Date().toISOString() }).eq("tenant_id", s.tenant_id);
            results.push({ tenant_id: s.tenant_id, status: "done" });
          } catch (e) {
            results.push({ tenant_id: s.tenant_id, status: `error: ${(e as Error).message}` });
          }
        }
        return Response.json({ ok: true, results });
      },
    },
  },
});
