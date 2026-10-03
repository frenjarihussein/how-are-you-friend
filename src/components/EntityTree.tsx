import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { ChevronsDownUp, ChevronsUpDown, Eye, EyeOff, Folder, FolderOpen, FileText, Minus, Pencil, Plus, Trash2 } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: string; parent_id: string | null; is_group: boolean; name: string; [k: string]: any };

export type EntityTreeProps = {
  table: "accounts" | "products" | "projects" | "warehouses";
  module: string;
  title: string;
  codeField?: string;
  extraSelect?: string;
  /** Build extra insert values; return null to cancel. */
  buildInsert?: (parent: Row | null, code: string) => Record<string, unknown> | null;
  usageCheck?: { table: string; column: string; message: string };
};

export function EntityTree({ table, module, title, codeField = "code", extraSelect = "", buildInsert, usageCheck }: EntityTreeProps) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [visible, setVisible] = useState(true);
  const list = useQuery({
    queryKey: [`${table}_tree`, me?.tenantId],
    enabled: !!me,
    queryFn: async () => {
      const sel = `id,name,parent_id,is_group,${codeField}${extraSelect ? "," + extraSelect : ""}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((await scope((db.from(table) as any).select(sel), me?.tenantId).order(codeField)).data ?? []) as Row[];
    },
  });
  const children = useMemo(() => {
    const m: Record<string, Row[]> = {};
    const ids = new Set((list.data ?? []).map((a) => a.id));
    (list.data ?? []).forEach((a) => {
      const k = a.parent_id && ids.has(a.parent_id) ? a.parent_id : "root";
      (m[k] ??= []).push(a);
    });
    return m;
  }, [list.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [`${table}_tree`] });
    qc.invalidateQueries({ queryKey: [table] });
    qc.invalidateQueries({ queryKey: ["crud", table] });
  };
  const add = useMutation({
    mutationFn: async (parent: Row | null) => {
      const sib = children[parent?.id ?? "root"] ?? [];
      const pc = parent?.[codeField] ?? "";
      const suggested = pc ? `${pc}${String(sib.length + 1).padStart(2, "0")}` : "";
      const code = window.prompt("الرمز", suggested);
      if (code === null) return false;
      const name = window.prompt("الاسم");
      if (!name) return false;
      const extra = buildInsert ? buildInsert(parent, code) : {};
      if (extra === null) return false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db.from(table) as any).insert({
        tenant_id: me!.tenantId, [codeField]: code || null, name, parent_id: parent?.id ?? null, is_group: false, ...extra,
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (parent && !parent.is_group) await (db.from(table) as any).update({ is_group: true }).eq("id", parent.id);
      if (parent) setOpen((o) => ({ ...o, [parent.id]: true }));
      return true;
    },
    onSuccess: (ok) => { if (ok) { toast.success("تمت الإضافة"); refresh(); } },
    onError: (e: Error) => toast.error(e.message),
  });
  const rename = useMutation({
    mutationFn: async (a: Row) => {
      const name = window.prompt("الاسم", a.name);
      if (!name || name === a.name) return false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db.from(table) as any).update({ name }).eq("id", a.id);
      if (error) throw error;
      return true;
    },
    onSuccess: (ok) => { if (ok) { toast.success("تم التعديل"); refresh(); } },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (a: Row) => {
      if (children[a.id]?.length) throw new Error("لا يمكن حذف عنصر له فروع");
      if (!window.confirm(`حذف ${a.name}؟`)) return false;
      if (usageCheck) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count } = await (db.from(usageCheck.table) as any).select("id", { count: "exact", head: true }).eq(usageCheck.column, a.id);
        if (count) throw new Error(usageCheck.message);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db.from(table) as any).delete().eq("id", a.id);
      if (error) throw error;
      return true;
    },
    onSuccess: (ok) => { if (ok) { toast.success("تم الحذف"); refresh(); } },
    onError: (e: Error) => toast.error(e.message),
  });

  const canC = can(me, module, "create");
  const canE = can(me, module, "edit");
  const canD = can(me, module, "delete");

  const setAll = (v: boolean) => {
    const next: Record<string, boolean> = {};
    (list.data ?? []).forEach((a) => { next[a.id] = v; });
    setOpen(next);
  };

  function Node({ a, depth, last }: { a: Row; depth: number; last: boolean }) {
    const kids = children[a.id] ?? [];
    const isOpen = open[a.id] ?? depth < 1;
    const isFolder = kids.length > 0 || a.is_group;
    return (
      <li className="relative ps-5">
        {/* tree connectors */}
        <span className="pointer-events-none absolute start-1.5 top-0 border-s border-muted-foreground/40" style={{ height: last ? "1rem" : "100%" }} />
        <span className="pointer-events-none absolute start-1.5 top-4 w-3 border-t border-muted-foreground/40" />
        <div className="group flex items-center gap-1 rounded px-1 py-1 hover:bg-muted">
          <button type="button" className="flex size-4 items-center justify-center rounded-sm border bg-background text-muted-foreground disabled:border-transparent" onClick={() => setOpen({ ...open, [a.id]: !isOpen })} disabled={!kids.length}>
            {kids.length ? (isOpen ? <Minus className="size-3" /> : <Plus className="size-3" />) : null}
          </button>
          {isFolder ? (isOpen && kids.length ? <FolderOpen className="size-4 text-primary" /> : <Folder className="size-4 text-primary" />) : <FileText className="size-4 text-muted-foreground" />}
          {a[codeField] && <span className="num text-xs text-muted-foreground">{a[codeField]}</span>}
          <span className={isFolder ? "font-semibold" : ""}>{a.name}</span>
          <span className="ms-auto flex gap-1 opacity-0 group-hover:opacity-100">
            {canC && <Button size="icon" variant="ghost" className="size-7" title="إضافة فرع" onClick={() => add.mutate(a)}><Plus className="size-4" /></Button>}
            {canE && <Button size="icon" variant="ghost" className="size-7" title="تعديل الاسم" onClick={() => rename.mutate(a)}><Pencil className="size-4" /></Button>}
            {canD && <Button size="icon" variant="ghost" className="size-7 text-destructive" title="حذف" onClick={() => remove.mutate(a)}><Trash2 className="size-4" /></Button>}
          </span>
        </div>
        {isOpen && kids.length > 0 && (
          <ul>
            {kids.map((k, i) => <Node key={k.id} a={k} depth={depth + 1} last={i === kids.length - 1} />)}
          </ul>
        )}
      </li>
    );
  }

  const roots = children["root"] ?? [];
  return (
    <div className="mb-8 rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{title}</h2>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={() => setVisible(!visible)}>
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{visible ? "إخفاء الشجرة" : "إظهار الشجرة"}
          </Button>
          {visible && <Button size="sm" variant="ghost" onClick={() => setAll(true)}><ChevronsUpDown className="size-4" />إظهار الكل</Button>}
          {visible && <Button size="sm" variant="ghost" onClick={() => setAll(false)}><ChevronsDownUp className="size-4" />إخفاء الكل</Button>}
          {canC && <Button size="sm" variant="outline" onClick={() => add.mutate(null)}><Plus className="size-4" />عنصر رئيسي</Button>}
        </div>
      </div>
      {visible && (list.isLoading ? <p className="text-sm text-muted-foreground">جارٍ التحميل...</p> : roots.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد عناصر بعد</p>
      ) : (
        <ul className="max-h-[480px] overflow-y-auto text-sm">
          {roots.map((a, i) => <Node key={a.id} a={a} depth={0} last={i === roots.length - 1} />)}
        </ul>
      ))}
    </div>
  );
}
