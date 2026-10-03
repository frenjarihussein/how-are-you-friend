import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck, Circle, Settings2 } from "lucide-react";
import { usePrefs } from "@/lib/prefs";
import { NotificationPrefs } from "@/components/NotificationPrefs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Where a notification goes when clicked: its own link, else a page matching its kind. */
const KIND_LINK: Record<string, string> = {
  invoice_created: "/documents",
  document_posted: "/documents",
  entry_audited: "/journal",
  cheque_added: "/cheques",
  low_stock: "/products",
  payroll_posted: "/payroll",
};

export function NotificationBell({ className }: { className?: string }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["notifications", me?.userId],
    enabled: !!me,
    refetchInterval: 120_000,
    queryFn: async () =>
      (await db.from("notifications").select("*").order("created_at", { ascending: false }).limit(30)).data ?? [],
  });
  const reads = useQuery({
    queryKey: ["notification_reads", me?.userId],
    enabled: !!me,
    queryFn: async () =>
      new Set<string>(((await db.from("notification_reads").select("notification_id")).data ?? []).map((r: { notification_id: string }) => r.notification_id)),
  });
  const prefs = usePrefs(me);
  const [cfg, setCfg] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: any[] = (q.data ?? []).filter((n: any) => prefs.data?.notif[n.kind ?? "announcement"] !== false);
  const readSet = reads.data ?? new Set<string>();
  const isRead = (id: string) => readSet.has(id);
  const unread = list.filter((n) => !isRead(n.id)).length;

  const refresh = () => qc.invalidateQueries({ queryKey: ["notification_reads"] });
  async function setRead(ids: string[], read: boolean) {
    if (!ids.length) return;
    if (read) await db.from("notification_reads").upsert(ids.map((id) => ({ user_id: me!.userId, notification_id: id })), { onConflict: "user_id,notification_id" });
    else await db.from("notification_reads").delete().in("notification_id", ids).eq("user_id", me!.userId);
    refresh();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function openItem(n: any) {
    if (!isRead(n.id)) await setRead([n.id], true);
    const to = n.link || KIND_LINK[n.kind];
    if (to) {
      setOpen(false);
      navigate({ to });
    }
  }

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground ${className ?? ""}`} aria-label="الإشعارات">
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute top-0.5 end-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[28rem] w-96 overflow-y-auto p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm font-semibold">
          الإشعارات
          <div className="flex items-center gap-3">
            {unread > 0 && (
              <button onClick={() => setRead(list.filter((n) => !isRead(n.id)).map((n) => n.id), true)} className="flex items-center gap-1 text-xs font-normal text-primary">
                <CheckCheck className="size-4" />تعليم الكل كمقروء
              </button>
            )}
            <button onClick={() => setCfg(true)} className="flex items-center gap-1 text-xs font-normal text-primary">
              <Settings2 className="size-4" />تخصيص
            </button>
          </div>
        </div>
        {list.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">لا توجد إشعارات</p>}
        {list.map((n) => {
          const read = isRead(n.id);
          return (
            <div key={n.id} className={`group flex gap-2 border-b px-3 py-2 text-sm ${read ? "" : "bg-accent/40"}`}>
              <button className="flex-1 text-start" onClick={() => openItem(n)}>
                <div className={read ? "font-normal" : "font-semibold"}>{n.title}</div>
                {n.body && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{n.body}</p>}
                <div className="mt-1 text-[11px] text-muted-foreground">{fmtDateTime(n.created_at)}</div>
              </button>
              <button
                title={read ? "تعليم كغير مقروء" : "تعليم كمقروء"}
                onClick={() => setRead([n.id], !read)}
                className="self-start rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Circle className={`size-3 ${read ? "" : "fill-primary text-primary"}`} />
              </button>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
    <Dialog open={cfg} onOpenChange={setCfg}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>ماذا تريد أن يصلك من إشعارات؟</DialogTitle></DialogHeader>
        <NotificationPrefs />
      </DialogContent>
    </Dialog>
    </>
  );
}
